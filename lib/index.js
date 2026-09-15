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
 *   GET  /plugins/dsh-worktree-manager/api/changes?path=<dir>
 *   GET  /plugins/dsh-worktree-manager/api/history?path=<dir>&limit=<n>
 *   GET  /plugins/dsh-worktree-manager/api/commit?path=<dir>&hash=<sha>
 *   GET  /plugins/dsh-worktree-manager/api/diff?path=<dir>&file=<rel>[&sub=<rel>][&hash=<sha>]
 *   POST /plugins/dsh-worktree-manager/api/create   { repoPath, branch, targetPath?, newBranch? }
 *   POST /plugins/dsh-worktree-manager/api/remove   { worktreePath, force? }
 *   POST /plugins/dsh-worktree-manager/api/branches { repoPath }
 */
import { execFile } from 'node:child_process';
import { realpath } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { promisify } from 'node:util';
import { mountWorkspaceProviderLifecycle } from './workspace-provider-lifecycle.js';
const execFileAsync = promisify(execFile);
/** Maximum stdout capture for git commands (1 MiB). */
const MAX_GIT_STDOUT = 1 << 20;
/** Route prefix shared with the client half. */
const API_PREFIX = '/plugins/dsh-worktree-manager/api/';
/** Cordis plugin name. */
export const name = 'dsh-worktree-manager';
/** Required services: the HTTP carrier, the bash executor, and the workspace registry. */
export const inject = ['webServer', 'shell', 'workspaceRegistry'];
/** Run a git command in the given directory and return trimmed stdout. */
async function runGit(workdir, args) {
    const { stdout } = await execFileAsync('git', args, {
        cwd: workdir,
        maxBuffer: MAX_GIT_STDOUT,
        encoding: 'utf8',
    });
    return stdout.trim();
}
/**
 * Find the git common root for a given path. If the path itself is not a valid
 * git repository (e.g. a prunable worktree whose gitdir is gone), walk up the
 * directory tree until a valid `.git` entry is found. Returns the canonical
 * path of the git root, or throws if none found after reaching filesystem root.
 */
async function resolveGitRoot(startPath) {
    let canonical = await realpath(resolve(startPath));
    // Try the path itself first
    try {
        await runGit(canonical, ['rev-parse', '--git-dir']);
        return canonical;
    }
    catch {
        // not a git repo here; walk up
    }
    let dir = canonical;
    for (let i = 0; i < 20; i++) {
        const parent = dirname(dir);
        if (parent === dir)
            break;
        dir = parent;
        try {
            await runGit(dir, ['rev-parse', '--git-dir']);
            return dir;
        }
        catch {
            // continue up
        }
    }
    throw new Error(`not a git repository: ${startPath}`);
}
/** Parse `git worktree list --porcelain` output into structured rows. */
function parseWorktreeList(porcelain) {
    const worktrees = [];
    let current = {};
    for (const line of porcelain.split('\n')) {
        if (line === '') {
            if (current.path !== undefined) {
                worktrees.push(current);
            }
            current = {};
            continue;
        }
        const spaceIdx = line.indexOf(' ');
        const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
        const value = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1);
        switch (key) {
            case 'worktree':
                current.path = value;
                break;
            case 'HEAD':
                current.head = value;
                break;
            case 'branch':
                current.branch = value.replace('refs/heads/', '');
                break;
            case 'bare':
                current.bare = true;
                break;
            case 'locked':
                current.locked = true;
                break;
            case 'prunable':
                current.prunable = true;
                break;
        }
    }
    if (current.path !== undefined) {
        worktrees.push(current);
    }
    return worktrees;
}
/** Send a JSON response with the given status code. */
function sendJson(res, status, body) {
    const json = JSON.stringify(body);
    res.writeHead(status, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(json),
    });
    res.end(json);
}
/** Read the full request body as a UTF-8 string, capped at 256 KiB. */
function readBody(req) {
    return new Promise((resolveBody, reject) => {
        const chunks = [];
        let total = 0;
        const limit = 256 * 1024;
        req.on('data', (chunk) => {
            total += chunk.length;
            if (total > limit) {
                reject(new Error('request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });
}
/** Parse query string into a record. */
function parseQuery(url) {
    const qIdx = url.indexOf('?');
    if (qIdx === -1)
        return {};
    const params = new URLSearchParams(url.slice(qIdx + 1));
    const result = {};
    for (const [key, value] of params) {
        result[key] = value;
    }
    return result;
}
/** Error code to HTTP status mapping. */
function errorStatus(message) {
    if (message.includes('not a git repository') || message.includes('does not exist')) {
        return 404;
    }
    if (message.includes('already exists') || message.includes('already checked out')) {
        return 409;
    }
    return 500;
}
/** List git worktrees for the repository at repoPath. */
async function handleList(query) {
    const repoPath = query.repoPath;
    if (!repoPath)
        throw new Error('missing repoPath query parameter');
    const canonical = await resolveGitRoot(repoPath);
    const porcelain = await runGit(canonical, ['worktree', 'list', '--porcelain']);
    return parseWorktreeList(porcelain);
}
/**
 * Resolve the git repository root (parent of the common `.git` dir) for a path.
 * Returns null when the path is not inside a git repository. Uses
 * `git rev-parse --git-common-dir` so linked worktrees resolve to the same
 * root as their main worktree, letting us group all worktrees of one repo.
 */
async function resolveRepoRoot(startPath) {
    try {
        const commonDir = await runGit(startPath, ['rev-parse', '--git-common-dir']);
        // commonDir may be relative (".git" for main worktree) or absolute
        // (linked worktree points at the main .git). Resolve to absolute, then
        // take the parent as the repository root.
        const abs = commonDir.startsWith('/')
            ? commonDir
            : resolve(startPath, commonDir);
        const root = dirname(abs);
        return await realpath(root).catch(() => root);
    }
    catch {
        return null;
    }
}
/**
 * Scan all registered dsh workspaces, group those that live inside a git
 * repository by their shared repository root, and return one entry per
 * repository. Workspaces not inside any git repository are omitted. The same
 * workspace path appearing under multiple worktrees is listed once per
 * repository it belongs to (in practice exactly one).
 */
async function handleRepos(ctx) {
    const workspaces = ctx.workspaceRegistry.list();
    const groups = new Map();
    for (const ws of workspaces) {
        const root = await resolveRepoRoot(ws.path);
        if (!root)
            continue;
        let group = groups.get(root);
        if (!group) {
            group = {
                root,
                name: root.replace(/\/+$/, '').split('/').pop() ?? root,
                workspaces: [],
            };
            groups.set(root, group);
        }
        group.workspaces.push({ id: ws.id, path: ws.path, title: ws.title });
    }
    // Stable order: by repository root path
    const repos = [...groups.values()].sort((a, b) => a.root.localeCompare(b.root));
    return { repos };
}
/**
 * Build the sidebar projection topology: for every registered dsh workspace
 * grouped under its git repository root, expose the main branch, the linked
 * worktree paths with their branches, and the workspace ids living under the
 * repository. The client projection uses this to aggregate worktree sessions
 * under the repository's main workspace row and to label branch names.
 */
async function handleTopology(ctx) {
    const workspaces = ctx.workspaceRegistry.list();
    const groups = new Map();
    for (const ws of workspaces) {
        const root = await resolveRepoRoot(ws.path);
        if (!root)
            continue;
        let group = groups.get(root);
        if (!group) {
            group = {
                root,
                name: root.replace(/\/+$/, '').split('/').pop() ?? root,
                workspaceIds: [],
            };
            groups.set(root, group);
        }
        group.workspaceIds.push(ws.id);
    }
    const repos = [];
    for (const group of groups.values()) {
        let worktrees = [];
        try {
            const porcelain = await runGit(group.root, ['worktree', 'list', '--porcelain']);
            worktrees = parseWorktreeList(porcelain);
        }
        catch {
            // Prunable / broken repository: report the workspace grouping with no
            // worktree branches instead of failing the whole topology.
        }
        // Compare realpath-canonicalized paths: porcelain paths may keep symlinks.
        const canonical = await Promise.all(worktrees.map(async (wt) => ({
            wt,
            path: await realpath(wt.path).catch(() => wt.path),
        })));
        const main = canonical.find(entry => entry.path === group.root);
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
        });
    }
    repos.sort((a, b) => a.root.localeCompare(b.root));
    return { repos };
}
/** Resolve the worktree top-level directory containing the given path. */
async function resolveWorktree(path) {
    const top = await runGit(path, ['rev-parse', '--show-toplevel']);
    return realpath(top).catch(() => top);
}
/** Current branch name of the worktree; absent on detached HEAD or error. */
async function currentBranch(root) {
    try {
        const ref = await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
        return ref === 'HEAD' ? undefined : ref;
    }
    catch {
        return undefined;
    }
}
/** Parse `git status --porcelain=v2 -z` output into changed-path rows. Exported for the self-check script. */
export function parseStatusPorcelainV2(out) {
    const fields = out.split('\u0000');
    const files = [];
    for (let i = 0; i < fields.length; i++) {
        const line = fields[i];
        if (line === '')
            continue;
        if (line.startsWith('1 ')) {
            // 1 XY sub mH mI mW hH hI <path>
            const parts = line.split(' ');
            files.push({
                code: parts[1] ?? '',
                path: parts.slice(8).join(' '),
                ...(parts[3] === '160000' ? { gitlink: true } : {}),
            });
        }
        else if (line.startsWith('2 ')) {
            // 2 XY sub mH mI mW hH hI Xscore <path> NUL <origPath>
            const parts = line.split(' ');
            const origPath = fields[++i] ?? '';
            files.push({ code: parts[1] ?? '', path: parts.slice(9).join(' '), origPath });
        }
        else if (line.startsWith('u ')) {
            // u XY sub m1 m2 m3 mW h1 h2 h3 <path>
            const parts = line.split(' ');
            files.push({ code: parts[1] ?? '', path: parts.slice(10).join(' ') });
        }
        else if (line.startsWith('? ')) {
            files.push({ code: '??', path: line.slice(2) });
        }
    }
    return files;
}
/** Parse `git submodule status` output. Exported for the self-check script. */
export function parseSubmoduleStatus(out) {
    return out.split('\n').filter(line => line !== '').map(line => {
        // <X><40-char sha> <path>[ (<describe>)]; X is ' ' | '+' | '-' | 'U'.
        const path = line.slice(42).split(' ')[0] ?? '';
        return { path, newCommits: line[0] === '+', uninitialized: line[0] === '-' };
    });
}
/** Collect the working-tree changes of the repository containing query.path, recursing into submodules. */
async function handleChanges(query) {
    if (!query.path)
        throw new Error('missing path query parameter');
    const root = await resolveWorktree(query.path);
    const entries = parseStatusPorcelainV2(await runGit(root, ['status', '--porcelain=v2', '-z', '--untracked-files=normal']));
    // Gitlink rows (submodule pointer changes) are covered by the submodule
    // section below; keeping them would double-count.
    const files = entries.filter(entry => !entry.gitlink);
    let subStatus = [];
    try {
        subStatus = (await runGit(root, ['submodule', 'status'])).split('\n').filter(line => line !== '');
    }
    catch {
        // no submodules (or git too old) — empty list
    }
    const submodules = (await Promise.all(parseSubmoduleStatus(subStatus.join('\n')).map(async (sub) => {
        let files = [];
        if (!sub.uninitialized) {
            try {
                files = parseStatusPorcelainV2(await runGit(resolve(root, sub.path), ['status', '--porcelain=v2', '-z']));
            }
            catch {
                // submodule gitdir missing/prunable — report the marker without files
            }
        }
        return { ...sub, name: sub.path.replace(/\/+$/, '').split('/').pop() ?? sub.path, files };
    }))).filter(sub => !sub.uninitialized && (sub.newCommits || sub.files.length > 0));
    return { root, branch: await currentBranch(root), files, submodules };
}
/** Upper bound for the history limit parameter. */
const MAX_HISTORY_LIMIT = 200;
/** Commit history of the worktree, newest first. */
async function handleHistory(query) {
    if (!query.path)
        throw new Error('missing path query parameter');
    const root = await resolveWorktree(query.path);
    let out;
    try {
        out = await runGit(root, ['log', `--max-count=${historyLimit(query)}`, '--pretty=format:%H%x1f%an%x1f%ct%x1f%s']);
    }
    catch {
        // Empty repository (no commits yet) or unborn HEAD.
        return { root, branch: await currentBranch(root), commits: [] };
    }
    const commits = out.split('\n').filter(line => line !== '').map(line => {
        const [hash, author, date, ...rest] = line.split('\u001f');
        return { hash: hash ?? '', author: author ?? '', date: Number(date) * 1000, subject: rest.join('\u001f') };
    });
    return { root, branch: await currentBranch(root), commits };
}
/** Clamp the history limit query parameter into [1, MAX_HISTORY_LIMIT]. */
function historyLimit(query) {
    const parsed = Number.parseInt(query.limit ?? '', 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), MAX_HISTORY_LIMIT) : 50;
}
/**
 * Parse `git diff-tree -r -z --no-commit-id <hash>` output. Each record is
 * `:<oldMode> <newMode> <oldSha> <newSha> <status>[score]` NUL `<path>` NUL
 * (plus `<origPath>` NUL for renames/copies). Exported for the self-check script.
 */
export function parseDiffTree(out) {
    const fields = out.split('\u0000');
    const rows = [];
    for (let i = 0; i < fields.length; i++) {
        const line = fields[i];
        if (!line.startsWith(':'))
            continue;
        // :<oldMode> <newMode> <oldSha> <newSha> <status>[score]
        const parts = line.split(' ');
        const status = (parts[4] ?? 'M')[0] ?? 'M';
        const path = fields[++i] ?? '';
        const row = { code: status, path };
        if (status === 'R' || status === 'C')
            row.origPath = fields[++i] ?? '';
        if (parts[1] === '160000' || parts[0] === ':160000') {
            row.gitlink = true;
            row.oldSha = parts[2] ?? '';
            row.newSha = parts[3] ?? '';
        }
        rows.push(row);
    }
    return rows;
}
/** Commit detail: changed files plus, for submodule pointer changes, the submodule commits in between. */
async function handleCommitDetail(query) {
    if (!query.path)
        throw new Error('missing path query parameter');
    if (!query.hash || !/^[0-9a-f]{4,40}$/i.test(query.hash))
        throw new Error('invalid hash parameter');
    const root = await resolveWorktree(query.path);
    const rows = parseDiffTree(await runGit(root, ['diff-tree', '-r', '-z', '--no-commit-id', query.hash]));
    const files = rows
        .filter(row => !row.gitlink)
        .map(row => ({ code: row.code, path: row.path, ...(row.origPath !== undefined ? { origPath: row.origPath } : {}) }));
    const submodules = await Promise.all(rows.filter(row => row.gitlink).map(async (row) => {
        // List the submodule commits the pointer moved over. All-zero old sha
        // means the submodule was added — show its recent history up to the pointer.
        let commits = [];
        try {
            const range = /^0+$/.test(row.newSha ?? '')
                ? undefined
                : /^0+$/.test(row.oldSha ?? '') ? (row.newSha ?? '') : `${row.oldSha}..${row.newSha}`;
            if (range !== undefined) {
                commits = (await runGit(resolve(root, row.path), ['log', '--no-decorate', '--oneline', '-n20', range]))
                    .split('\n').filter(line => line !== '');
            }
        }
        catch {
            // submodule gitdir missing/prunable — empty commit list
        }
        return {
            path: row.path,
            name: row.path.replace(/\/+$/, '').split('/').pop() ?? row.path,
            commits,
        };
    }));
    return { files, submodules };
}
/** Reject file parameters that escape the containing worktree. */
function safeRelPath(value) {
    if (value === '' || value.startsWith('/') || value.split('/').includes('..')) {
        throw new Error('invalid file parameter');
    }
    return value;
}
/**
 * Unified diff of one file. With `hash`, the commit's diff for that file;
 * otherwise the working tree vs HEAD (staged + unstaged). Untracked files have
 * no HEAD diff — fall back to a /dev/null pseudo-diff (`git diff --no-index`
 * exits 1 when differences exist, with the diff on stdout).
 */
async function handleDiff(query) {
    if (!query.path)
        throw new Error('missing path query parameter');
    const file = safeRelPath(query.file ?? '');
    const root = await resolveWorktree(query.path);
    const workdir = query.sub ? resolve(root, safeRelPath(query.sub)) : root;
    if (query.hash !== undefined) {
        if (!/^[0-9a-f]{4,40}$/i.test(query.hash))
            throw new Error('invalid hash parameter');
        return { diff: await runGit(workdir, ['show', '--format=', query.hash, '--', file]) };
    }
    let diff = '';
    try {
        diff = await runGit(workdir, ['diff', 'HEAD', '--', file]);
    }
    catch {
        // unborn HEAD — fall through to the untracked pseudo-diff
    }
    if (diff === '') {
        try {
            diff = await runGit(workdir, ['diff', '--no-index', '--', '/dev/null', file]);
        }
        catch (err) {
            diff = err.stdout ?? '';
        }
    }
    return { diff };
}
/** Create a new git worktree and register it as a workspace. */
async function handleCreate(ctx, body) {
    if (!body.repoPath)
        throw new Error('missing repoPath');
    if (!body.branch)
        throw new Error('missing branch');
    const canonical = await resolveGitRoot(body.repoPath);
    // Default target path: <repo>-worktrees/<branch>
    const targetPath = body.targetPath ?? resolve(canonical, '..', `${canonical.split('/').pop()}-worktrees`, body.branch);
    // Build git worktree add arguments
    const args = ['worktree', 'add'];
    if (body.newBranch) {
        args.push('-b', body.branch);
    }
    else {
        args.push('--track' /* no-op for local branches, harmless */);
        args.push(body.branch);
    }
    // If newBranch is false, we pass the branch name as the last positional arg
    // (git worktree add <path> <branch>). If newBranch is true, -b <branch> already
    // names the new branch, so the path is the only remaining positional.
    if (body.newBranch) {
        args.push(targetPath);
    }
    else {
        // Remove the --track flag we added above; it's not valid for worktree add
        // without a remote tracking branch. Use plain positional form.
        args.splice(2); // remove everything after 'add'
        args.push(targetPath, body.branch);
    }
    await runGit(canonical, args);
    // Read back the created worktree info
    const porcelain = await runGit(canonical, ['worktree', 'list', '--porcelain']);
    const worktrees = parseWorktreeList(porcelain);
    const created = worktrees.find(w => w.path === targetPath || w.path === resolve(targetPath));
    if (!created) {
        throw new Error('worktree was created but could not be found in worktree list');
    }
    // Register the worktree directory as a workspace so it appears in the picker
    const workspace = await ctx.workspaceRegistry.create(created.path);
    return { worktree: created, workspaceId: workspace.id };
}
/** Remove a git worktree. */
async function handleRemove(body) {
    if (!body.worktreePath)
        throw new Error('missing worktreePath');
    const canonical = await realpath(resolve(body.worktreePath));
    // git worktree remove must be run from any worktree of the same repo
    const args = ['worktree', 'remove', canonical];
    if (body.force)
        args.push('--force');
    await runGit(canonical, args);
    return { removed: true };
}
/** List branches in the repository. */
async function handleBranches(body) {
    if (!body.repoPath)
        throw new Error('missing repoPath');
    const canonical = await resolveGitRoot(body.repoPath);
    const branchesOutput = await runGit(canonical, ['branch', '--list', '--format=%(refname:short)']);
    const branches = branchesOutput.split('\n').filter(b => b.length > 0);
    let current;
    try {
        current = await runGit(canonical, ['rev-parse', '--abbrev-ref', 'HEAD']);
    }
    catch {
        // detached HEAD or other state — leave current undefined
    }
    return { branches, current };
}
/** Main HTTP route handler dispatching to the above operations. */
function createRouteHandler(ctx) {
    return async (req, res) => {
        if (req.method === 'GET') {
            // GET /list?repoPath=...
            const url = req.url ?? '';
            if (!url.startsWith(API_PREFIX)) {
                sendJson(res, 404, { error: 'not found' });
                return;
            }
            const action = url.slice(API_PREFIX.length).split('?')[0];
            if (action !== 'list' && action !== 'repos' && action !== 'topology' && action !== 'changes'
                && action !== 'history' && action !== 'commit' && action !== 'diff') {
                sendJson(res, 404, { error: `unknown GET action: ${action}` });
                return;
            }
            try {
                if (action === 'list') {
                    const query = parseQuery(url);
                    const worktrees = await handleList(query);
                    sendJson(res, 200, { worktrees });
                }
                else if (action === 'topology') {
                    const result = await handleTopology(ctx);
                    sendJson(res, 200, result);
                }
                else if (action === 'changes') {
                    const result = await handleChanges(parseQuery(url));
                    sendJson(res, 200, result);
                }
                else if (action === 'history') {
                    const result = await handleHistory(parseQuery(url));
                    sendJson(res, 200, result);
                }
                else if (action === 'commit') {
                    const result = await handleCommitDetail(parseQuery(url));
                    sendJson(res, 200, result);
                }
                else if (action === 'diff') {
                    const result = await handleDiff(parseQuery(url));
                    sendJson(res, 200, result);
                }
                else {
                    const result = await handleRepos(ctx);
                    sendJson(res, 200, result);
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                sendJson(res, errorStatus(message), { error: message });
            }
            return;
        }
        if (req.method === 'POST') {
            const url = req.url ?? '';
            if (!url.startsWith(API_PREFIX)) {
                sendJson(res, 404, { error: 'not found' });
                return;
            }
            const action = url.slice(API_PREFIX.length).split('?')[0];
            try {
                const bodyText = await readBody(req);
                const body = bodyText.length > 0 ? JSON.parse(bodyText) : {};
                switch (action) {
                    case 'create': {
                        const result = await handleCreate(ctx, body);
                        sendJson(res, 200, result);
                        break;
                    }
                    case 'remove': {
                        const result = await handleRemove(body);
                        sendJson(res, 200, result);
                        break;
                    }
                    case 'branches': {
                        const result = await handleBranches(body);
                        sendJson(res, 200, result);
                        break;
                    }
                    default:
                        sendJson(res, 404, { error: `unknown POST action: ${action}` });
                }
            }
            catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                sendJson(res, errorStatus(message), { error: message });
            }
            return;
        }
        sendJson(res, 405, { error: 'method not allowed' });
    };
}
/** Plugin entry: register HTTP routes for the worktree management API. */
export async function apply(ctx) {
    // 让 cordis.patch.yml 的条件禁用表达式生效：提供 worktreeWorkspaceProvider
    // 并与 Loader 生命周期 reconcile 官方 Workspace 条目的禁用/恢复。
    await mountWorkspaceProviderLifecycle(ctx);
    const handler = createRouteHandler(ctx);
    // Register a prefix route so all /plugins/dsh-worktree-manager/api/* requests
    // are dispatched by our single handler.
    ctx.webServer.register({
        kind: 'prefix',
        path: '/plugins/dsh-worktree-manager/api',
        handler,
    });
}
