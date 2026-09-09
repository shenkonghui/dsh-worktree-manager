/**
 * Host half of the dsh-worktree-manager plugin.
 *
 * Registers HTTP routes under /plugins/dsh-worktree-manager/api/ that the
 * browser half calls to list, create, and remove git worktrees. Created
 * worktrees are also registered in ctx.workspaceRegistry so they appear in
 * the existing workspace picker — the task start window's "open folder" flow
 * then selects them like any other workspace.
 *
 * Routes:
 *   GET  /plugins/dsh-worktree-manager/api/list?repoPath=<path>
 *   GET  /plugins/dsh-worktree-manager/api/repos
 *   GET  /plugins/dsh-worktree-manager/api/topology
 *   POST /plugins/dsh-worktree-manager/api/create   { repoPath, branch, targetPath?, newBranch? }
 *   POST /plugins/dsh-worktree-manager/api/remove   { worktreePath, force? }
 *   POST /plugins/dsh-worktree-manager/api/branches { repoPath }
 */

import { execFile } from 'node:child_process'
import { realpath } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { promisify } from 'node:util'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { mountWorkspaceProviderLifecycle } from './workspace-provider-lifecycle.js'

/**
 * Minimal Context type — the full @deepseek-ai/cordis Context is available at
 * runtime in the dsh host environment; this local declaration avoids a
 * build-time dependency on the cordis package. Only the services this plugin
 * injects are declared here.
 */
interface Context {
  webServer: {
    register(route: { kind: 'exact' | 'prefix'; path: string; handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void> }): () => void
  }
  workspaceRegistry: {
    create(path: string, title?: string): Promise<{ id: string; path: string; title: string }>
    list(): Array<{ id: string; path: string; title: string }>
    resolveByPath(path: string): Promise<{ id: string; path: string; title: string } | undefined>
  }
}

const execFileAsync = promisify(execFile)

/** Maximum stdout capture for git commands (1 MiB). */
const MAX_GIT_STDOUT = 1 << 20

/** Route prefix shared with the client half. */
const API_PREFIX = '/plugins/dsh-worktree-manager/api/'

/** Cordis plugin name. */
export const name = 'dsh-worktree-manager'

/** Required services: the HTTP carrier, the bash executor, and the workspace registry. */
export const inject = ['webServer', 'shell', 'workspaceRegistry'] as const

/** One parsed worktree row from `git worktree list --porcelain`. */
interface WorktreeInfo {
  /** Absolute path of the working tree. */
  path: string
  /** HEAD commit hash (detached) or branch ref. */
  head: string
  /** Branch name when checked out, absent when detached. */
  branch?: string
  /** Whether this is the main working tree. */
  bare: boolean
  /** Whether the worktree is locked. */
  locked: boolean
  /** Whether the worktree is prunable. */
  prunable: boolean
}

/** Request body for create. */
interface CreateRequest {
  repoPath: string
  branch: string
  targetPath?: string
  /** Create a new branch instead of checking out an existing one. */
  newBranch?: boolean
}

/** Request body for remove. */
interface RemoveRequest {
  worktreePath: string
  force?: boolean
}

/** Request body for branches. */
interface BranchesRequest {
  repoPath: string
}

/** One workspace entry under a discovered repository root. */
interface RepoWorkspace {
  /** dsh workspace id. */
  id: string
  /** Workspace directory path (canonicalized at registry create time). */
  path: string
  /** Display title. */
  title: string
}

/** One discovered repository root with its registered dsh workspaces. */
interface RepoGroup {
  /** Canonical git repository root (parent of the common `.git`). */
  root: string
  /** Basename of {@link root}, for display. */
  name: string
  /** dsh workspaces whose path lives inside this repository (any worktree). */
  workspaces: RepoWorkspace[]
}

/** Response body for the repos aggregation route. */
interface ReposResponse {
  repos: RepoGroup[]
}

/** Run a git command in the given directory and return trimmed stdout. */
async function runGit(workdir: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd: workdir,
    maxBuffer: MAX_GIT_STDOUT,
    encoding: 'utf8',
  })
  return stdout.trim()
}

/**
 * Find the git common root for a given path. If the path itself is not a valid
 * git repository (e.g. a prunable worktree whose gitdir is gone), walk up the
 * directory tree until a valid `.git` entry is found. Returns the canonical
 * path of the git root, or throws if none found after reaching filesystem root.
 */
async function resolveGitRoot(startPath: string): Promise<string> {
  let canonical = await realpath(resolve(startPath))
  // Try the path itself first
  try {
    await runGit(canonical, ['rev-parse', '--git-dir'])
    return canonical
  } catch {
    // not a git repo here; walk up
  }
  let dir = canonical
  for (let i = 0; i < 20; i++) {
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
    try {
      await runGit(dir, ['rev-parse', '--git-dir'])
      return dir
    } catch {
      // continue up
    }
  }
  throw new Error(`not a git repository: ${startPath}`)
}

/** Parse `git worktree list --porcelain` output into structured rows. */
function parseWorktreeList(porcelain: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = []
  let current: Partial<WorktreeInfo> = {}
  for (const line of porcelain.split('\n')) {
    if (line === '') {
      if (current.path !== undefined) {
        worktrees.push(current as WorktreeInfo)
      }
      current = {}
      continue
    }
    const spaceIdx = line.indexOf(' ')
    const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx)
    const value = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1)
    switch (key) {
      case 'worktree':
        current.path = value
        break
      case 'HEAD':
        current.head = value
        break
      case 'branch':
        current.branch = value.replace('refs/heads/', '')
        break
      case 'bare':
        current.bare = true
        break
      case 'locked':
        current.locked = true
        break
      case 'prunable':
        current.prunable = true
        break
    }
  }
  if (current.path !== undefined) {
    worktrees.push(current as WorktreeInfo)
  }
  return worktrees
}

/** Send a JSON response with the given status code. */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  })
  res.end(json)
}

/** Read the full request body as a UTF-8 string, capped at 256 KiB. */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    const limit = 256 * 1024
    req.on('data', (chunk: Buffer) => {
      total += chunk.length
      if (total > limit) {
        reject(new Error('request body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** Parse query string into a record. */
function parseQuery(url: string): Record<string, string> {
  const qIdx = url.indexOf('?')
  if (qIdx === -1) return {}
  const params = new URLSearchParams(url.slice(qIdx + 1))
  const result: Record<string, string> = {}
  for (const [key, value] of params) {
    result[key] = value
  }
  return result
}

/** Error code to HTTP status mapping. */
function errorStatus(message: string): number {
  if (message.includes('not a git repository') || message.includes('does not exist')) {
    return 404
  }
  if (message.includes('already exists') || message.includes('already checked out')) {
    return 409
  }
  return 500
}

/** List git worktrees for the repository at repoPath. */
async function handleList(query: Record<string, string>): Promise<WorktreeInfo[]> {
  const repoPath = query.repoPath
  if (!repoPath) throw new Error('missing repoPath query parameter')
  const canonical = await resolveGitRoot(repoPath)
  const porcelain = await runGit(canonical, ['worktree', 'list', '--porcelain'])
  return parseWorktreeList(porcelain)
}

/**
 * Resolve the git repository root (parent of the common `.git` dir) for a path.
 * Returns null when the path is not inside a git repository. Uses
 * `git rev-parse --git-common-dir` so linked worktrees resolve to the same
 * root as their main worktree, letting us group all worktrees of one repo.
 */
async function resolveRepoRoot(startPath: string): Promise<string | null> {
  try {
    const commonDir = await runGit(startPath, ['rev-parse', '--git-common-dir'])
    // commonDir may be relative (".git" for main worktree) or absolute
    // (linked worktree points at the main .git). Resolve to absolute, then
    // take the parent as the repository root.
    const abs = commonDir.startsWith('/')
      ? commonDir
      : resolve(startPath, commonDir)
    const root = dirname(abs)
    return await realpath(root).catch(() => root)
  } catch {
    return null
  }
}

/**
 * Scan all registered dsh workspaces, group those that live inside a git
 * repository by their shared repository root, and return one entry per
 * repository. Workspaces not inside any git repository are omitted. The same
 * workspace path appearing under multiple worktrees is listed once per
 * repository it belongs to (in practice exactly one).
 */
async function handleRepos(ctx: Context): Promise<ReposResponse> {
  const workspaces = ctx.workspaceRegistry.list()
  const groups = new Map<string, RepoGroup>()

  for (const ws of workspaces) {
    const root = await resolveRepoRoot(ws.path)
    if (!root) continue
    let group = groups.get(root)
    if (!group) {
      group = {
        root,
        name: root.replace(/\/+$/, '').split('/').pop() ?? root,
        workspaces: [],
      }
      groups.set(root, group)
    }
    group.workspaces.push({ id: ws.id, path: ws.path, title: ws.title })
  }

  // Stable order: by repository root path
  const repos = [...groups.values()].sort((a, b) => a.root.localeCompare(b.root))
  return { repos }
}

/** 每个仓库的侧边栏投影拓扑：分支归属与 workspace 归属。 */
interface RepoTopology {
  /** 规范化 git 仓库根（与 {@link RepoGroup.root} 语义一致）。 */
  root: string
  /** 展示名（根路径 basename）。 */
  name: string
  /** 主工作树（path === root）当前分支；detached HEAD 时缺省。 */
  mainBranch?: string
  /** 非主 worktree 列表（含各自分支）。 */
  worktrees: Array<{ path: string; branch?: string }>
  /** 注册在该仓库下的 dsh workspace id（主 + worktree）。 */
  workspaceIds: string[]
}

/** GET /api/topology 的响应体。 */
interface TopologyResponse {
  repos: RepoTopology[]
}

/**
 * Build the sidebar projection topology: for every registered dsh workspace
 * grouped under its git repository root, expose the main branch, the linked
 * worktree paths with their branches, and the workspace ids living under the
 * repository. The client projection uses this to aggregate worktree sessions
 * under the repository's main workspace row and to label branch names.
 */
async function handleTopology(ctx: Context): Promise<TopologyResponse> {
  const workspaces = ctx.workspaceRegistry.list()
  const groups = new Map<string, { root: string; name: string; workspaceIds: string[] }>()

  for (const ws of workspaces) {
    const root = await resolveRepoRoot(ws.path)
    if (!root) continue
    let group = groups.get(root)
    if (!group) {
      group = {
        root,
        name: root.replace(/\/+$/, '').split('/').pop() ?? root,
        workspaceIds: [],
      }
      groups.set(root, group)
    }
    group.workspaceIds.push(ws.id)
  }

  const repos: RepoTopology[] = []
  for (const group of groups.values()) {
    let worktrees: WorktreeInfo[] = []
    try {
      const porcelain = await runGit(group.root, ['worktree', 'list', '--porcelain'])
      worktrees = parseWorktreeList(porcelain)
    } catch {
      // Prunable / broken repository: report the workspace grouping with no
      // worktree branches instead of failing the whole topology.
    }
    // Compare realpath-canonicalized paths: porcelain paths may keep symlinks.
    const canonical = await Promise.all(worktrees.map(async wt => ({
      wt,
      path: await realpath(wt.path).catch(() => wt.path),
    })))
    const main = canonical.find(entry => entry.path === group.root)
    repos.push({
      root: group.root,
      name: group.name,
      ...(main?.wt.branch === undefined ? {} : { mainBranch: main.wt.branch }),
      worktrees: canonical
        .filter(entry => entry !== main && !entry.wt.bare)
        .map(entry => ({
          path: entry.path,
          ...(entry.wt.branch === undefined ? {} : { branch: entry.wt.branch }),
        })),
      workspaceIds: group.workspaceIds,
    })
  }

  repos.sort((a, b) => a.root.localeCompare(b.root))
  return { repos }
}

/** Create a new git worktree and register it as a workspace. */
async function handleCreate(
  ctx: Context,
  body: CreateRequest,
): Promise<{ worktree: WorktreeInfo; workspaceId: string }> {
  if (!body.repoPath) throw new Error('missing repoPath')
  if (!body.branch) throw new Error('missing branch')
  const canonical = await resolveGitRoot(body.repoPath)

  // Default target path: <repo>-worktrees/<branch>
  const targetPath = body.targetPath ?? resolve(canonical, '..', `${canonical.split('/').pop()}-worktrees`, body.branch)

  // Build git worktree add arguments
  const args = ['worktree', 'add']
  if (body.newBranch) {
    args.push('-b', body.branch)
  } else {
    args.push('--track' /* no-op for local branches, harmless */)
    args.push(body.branch)
  }
  // If newBranch is false, we pass the branch name as the last positional arg
  // (git worktree add <path> <branch>). If newBranch is true, -b <branch> already
  // names the new branch, so the path is the only remaining positional.
  if (body.newBranch) {
    args.push(targetPath)
  } else {
    // Remove the --track flag we added above; it's not valid for worktree add
    // without a remote tracking branch. Use plain positional form.
    args.splice(2) // remove everything after 'add'
    args.push(targetPath, body.branch)
  }

  await runGit(canonical, args)

  // Read back the created worktree info
  const porcelain = await runGit(canonical, ['worktree', 'list', '--porcelain'])
  const worktrees = parseWorktreeList(porcelain)
  const created = worktrees.find(w => w.path === targetPath || w.path === resolve(targetPath))
  if (!created) {
    throw new Error('worktree was created but could not be found in worktree list')
  }

  // Register the worktree directory as a workspace so it appears in the picker
  const workspace = await ctx.workspaceRegistry.create(created.path)
  return { worktree: created, workspaceId: workspace.id as string }
}

/** Remove a git worktree. */
async function handleRemove(body: RemoveRequest): Promise<{ removed: true }> {
  if (!body.worktreePath) throw new Error('missing worktreePath')
  const canonical = await realpath(resolve(body.worktreePath))
  // git worktree remove must be run from any worktree of the same repo
  const args = ['worktree', 'remove', canonical]
  if (body.force) args.push('--force')
  await runGit(canonical, args)
  return { removed: true }
}

/** List branches in the repository. */
async function handleBranches(body: BranchesRequest): Promise<{ branches: string[]; current?: string }> {
  if (!body.repoPath) throw new Error('missing repoPath')
  const canonical = await resolveGitRoot(body.repoPath)
  const branchesOutput = await runGit(canonical, ['branch', '--list', '--format=%(refname:short)'])
  const branches = branchesOutput.split('\n').filter(b => b.length > 0)
  let current: string | undefined
  try {
    current = await runGit(canonical, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    // detached HEAD or other state — leave current undefined
  }
  return { branches, current }
}

/** Main HTTP route handler dispatching to the above operations. */
function createRouteHandler(ctx: Context) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    if (req.method === 'GET') {
      // GET /list?repoPath=...
      const url = req.url ?? ''
      if (!url.startsWith(API_PREFIX)) {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      const action = url.slice(API_PREFIX.length).split('?')[0]
      if (action !== 'list' && action !== 'repos' && action !== 'topology') {
        sendJson(res, 404, { error: `unknown GET action: ${action}` })
        return
      }
      try {
        if (action === 'list') {
          const query = parseQuery(url)
          const worktrees = await handleList(query)
          sendJson(res, 200, { worktrees })
        } else if (action === 'topology') {
          const result = await handleTopology(ctx)
          sendJson(res, 200, result)
        } else {
          const result = await handleRepos(ctx)
          sendJson(res, 200, result)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendJson(res, errorStatus(message), { error: message })
      }
      return
    }

    if (req.method === 'POST') {
      const url = req.url ?? ''
      if (!url.startsWith(API_PREFIX)) {
        sendJson(res, 404, { error: 'not found' })
        return
      }
      const action = url.slice(API_PREFIX.length).split('?')[0]
      try {
        const bodyText = await readBody(req)
        const body = bodyText.length > 0 ? JSON.parse(bodyText) : {}
        switch (action) {
          case 'create': {
            const result = await handleCreate(ctx, body as CreateRequest)
            sendJson(res, 200, result)
            break
          }
          case 'remove': {
            const result = await handleRemove(body as RemoveRequest)
            sendJson(res, 200, result)
            break
          }
          case 'branches': {
            const result = await handleBranches(body as BranchesRequest)
            sendJson(res, 200, result)
            break
          }
          default:
            sendJson(res, 404, { error: `unknown POST action: ${action}` })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        sendJson(res, errorStatus(message), { error: message })
      }
      return
    }

    sendJson(res, 405, { error: 'method not allowed' })
  }
}

/** Plugin entry: register HTTP routes for the worktree management API. */
export async function apply(ctx: Context): Promise<void> {
  // 让 cordis.patch.yml 的条件禁用表达式生效：提供 worktreeWorkspaceProvider
  // 并与 Loader 生命周期 reconcile 官方 Workspace 条目的禁用/恢复。
  await mountWorkspaceProviderLifecycle(ctx as unknown as Parameters<typeof mountWorkspaceProviderLifecycle>[0])

  const handler = createRouteHandler(ctx)

  // Register a prefix route so all /plugins/dsh-worktree-manager/api/* requests
  // are dispatched by our single handler.
  ctx.webServer.register({
    kind: 'prefix',
    path: '/plugins/dsh-worktree-manager/api',
    handler,
  })
}
