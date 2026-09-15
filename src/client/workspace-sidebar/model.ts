/**
 * 侧边栏投影纯函数：把外部目录 worktree 的 workspace 行嵌套为其仓库主行
 * 下的一个层级，会话保留在各自 worktree 行内（不与 worktree 合并为一行，
 * 会话标题独占整行宽度）。
 *
 * 输入官方 useWorkspaces/useSessions 快照与宿主 /api/topology 拓扑，输出：
 * - worktree 行保留可见，标记为所属仓库主行的嵌套子级（排序紧跟主行、
 *   渲染层多一级缩进），其会话在行内整行显示标题；
 * - 仓库主行存在嵌套子级（repo 有 >1 个 worktree）时，为「主 worktree」
 *   合成一个虚拟二级行，主仓库全部会话移入其中，与 worktree 会话同级；
 * - 游离会话（不在任何 workspace 的 sessionIds 中、但有 cwd）按最长前缀
 *   挂到包含它的最内层 workspace 行；
 * - 为主行与顶层 worktree 行标注分支名（渲染为徽标）；嵌套 worktree 行
 *   直接以分支名作为标题；会话级分支元数据仅供搜索结果行与 hover 卡片；
 * - 为 linked worktree 行标注是否已合并到基准分支（= 仓库主工作树当前检出的
 *   分支），渲染层据此把分支徽标染绿、未合并或未能判定时保持蓝色；
 * - 归属无法证明时 fail-open：worktree 行就地保留为顶层行，绝不隐藏会话。
 */

/** 官方 useWorkspaces 快照中的 workspace 行。 */
export interface SidebarWorkspace {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly string[]
}

/** 官方 useSessions 快照中的会话摘要。 */
export interface SidebarSessionSummary {
  id: string
  displayTitle: string
  title?: string
  cwd?: string
  running: boolean
  blank: boolean
  updatedAt: number
  origin?: 'subagent'
}

/** 会话列表快照（zustand 风格 selector 的数据源）。 */
export interface SidebarSessionListState {
  ids: readonly string[]
  byId: Readonly<Record<string, SidebarSessionSummary | undefined>>
  current: string | undefined
}

/** GET /api/topology 中每个仓库的拓扑行（与宿主 RepoTopology 对应）。 */
export interface SidebarTopologyRepo {
  root: string
  name: string
  mainBranch?: string
  /** 非主 worktree 列表；`merged` 缺省表示宿主未能判定（保持原有配色）。 */
  worktrees: ReadonlyArray<{ path: string; branch?: string; merged?: boolean }>
  workspaceIds: readonly string[]
}

/** GET /api/topology 的响应体。 */
export interface SidebarTopology {
  repos: readonly SidebarTopologyRepo[]
}

/** worktree 行的合并状态：徽标染绿 + 提示文案。 */
export interface WorktreeMergeStatus {
  /** 是否已完全合并到基准分支。 */
  merged: boolean
  /** 基准分支名（仓库主工作树当前检出的分支）。 */
  base: string
}

/** 投影结果：投影后的 workspace 行 + 分支标注 + 嵌套子级标记。 */
export interface ManagedSidebarProjection {
  /** worktree 行保留可见；嵌套行已排序到所属仓库主行之后。 */
  workspaces: ProjectedWorkspace[]
  /** 会话级分支元数据（搜索结果行与 hover 卡片徽标）。 */
  branchBySessionId: Readonly<Record<string, string>>
  /** workspace 行分支徽标（主行 + worktree 行）。 */
  branchByWorkspaceId: Readonly<Record<string, string>>
  /** linked worktree 行的合并状态（仓库主行与虚拟主行不含在内）。 */
  mergeByWorkspaceId: Readonly<Record<string, WorktreeMergeStatus>>
  /** 渲染为所属仓库主行下一级（缩进）的 worktree 行。 */
  nestedWorkspaceIds: ReadonlySet<string>
}

/** 可变副本：sessionIds 已展开为可修改的普通数组（用于挂载游离会话）。 */
export interface ProjectedWorkspace extends SidebarWorkspace {
  sessionIds: string[]
  /** 合成行标记：主 worktree 虚拟二级行（无对应 workspace 实体）。 */
  __dshWorktreeManagerVirtual?: boolean
  /** 虚拟行新建会话时落到的真实 workspaceId。 */
  __dshWorktreeManagerHost?: string
  /** 嵌套行的父级 group key（父级折叠时该跟随隐藏）。 */
  __dshWorktreeManagerParent?: string
}

/** 去掉尾部斜杠后比较路径（宿主两侧均已 realpath 规范化）。 */
function normalizePath(value: string): string {
  return value.replace(/\/+$/, '')
}

/** cwd 命中的 worktree 信息（用于会话头部徽标等展示）。 */
export interface WorktreeMatch {
  repoRoot: string
  repoName: string
  /** 命中的 worktree 分支；主仓库工作树命中时为主分支。 */
  branch?: string
  /** 是否命中的是仓库主工作树（而非 linked worktree）。 */
  main: boolean
}

/**
 * 按 cwd 匹配拓扑中的 worktree（或主工作树）：精确路径或子路径前缀，
 * 最长前缀优先。未命中返回 undefined。
 */
export function matchWorktreeByPath(
  topology: SidebarTopology,
  cwd: string,
): WorktreeMatch | undefined {
  const normalized = normalizePath(cwd)
  let best: { match: WorktreeMatch; length: number } | undefined
  for (const repo of topology.repos) {
    const root = normalizePath(repo.root)
    const candidates: Array<{ path: string; branch?: string; main: boolean }> = [
      { path: root, branch: repo.mainBranch, main: true },
      ...repo.worktrees.map(wt => ({ path: normalizePath(wt.path), branch: wt.branch, main: false })),
    ]
    for (const candidate of candidates) {
      const hit = normalized === candidate.path || normalized.startsWith(candidate.path + '/')
      if (!hit) continue
      // 最长前缀优先：嵌套 worktree 目录时取最具体的那个。
      if (best !== undefined && candidate.path.length <= best.length) continue
      best = {
        length: candidate.path.length,
        match: {
          repoRoot: repo.root,
          repoName: repo.name,
          branch: candidate.branch,
          main: candidate.main,
        },
      }
    }
  }
  return best?.match
}

/**
 * 派生嵌套投影。仓库主行不存在的 worktree 行 fail-open：就地保留为顶层
 * 行，行与会话照常标注分支名，绝不隐藏会话。
 */
export function projectManagedSidebar(input: {
  workspaces: readonly SidebarWorkspace[]
  sessions: SidebarSessionListState
  topology: SidebarTopology
}): ManagedSidebarProjection {
  const projected: ProjectedWorkspace[] = input.workspaces.map(workspace => ({
    ...workspace,
    sessionIds: [...workspace.sessionIds],
  }))
  const branchBySessionId: Record<string, string> = {}
  const branchByWorkspaceId: Record<string, string> = {}
  const mergeByWorkspaceId: Record<string, WorktreeMergeStatus> = {}
  const nested = new Set<string>()

  if (input.topology.repos.length === 0) {
    return {
      workspaces: projected,
      branchBySessionId,
      branchByWorkspaceId,
      mergeByWorkspaceId,
      nestedWorkspaceIds: nested,
    }
  }

  // 拓扑 → 查找表：worktree 路径归属 + 每个仓库的主 workspace 行。
  const worktreeByPath = new Map<
    string,
    { repoRoot: string; branch?: string; merged?: boolean; base?: string }
  >()
  for (const repo of input.topology.repos) {
    for (const wt of repo.worktrees) {
      worktreeByPath.set(normalizePath(wt.path), {
        repoRoot: repo.root,
        branch: wt.branch,
        merged: wt.merged,
        base: repo.mainBranch,
      })
    }
  }
  const mainWorkspaceByRoot = new Map<string, ProjectedWorkspace>()
  for (const workspace of projected) {
    const normalized = normalizePath(workspace.path)
    for (const repo of input.topology.repos) {
      if (normalized === normalizePath(repo.root)) {
        mainWorkspaceByRoot.set(repo.root, workspace)
        if (repo.mainBranch !== undefined) {
          branchByWorkspaceId[workspace.workspaceId] = repo.mainBranch
        }
        break
      }
    }
  }

  // 游离会话索引：不在任何 workspace 的 sessionIds 中、但有 cwd 的会话
  // （典型是刚创建的 provisional blank 会话）。按 cwd 最长前缀挂到包含它
  // 的最内层 workspace 行（嵌套目录下 worktree 优先于其仓库主行）。
  const member = new Set<string>()
  for (const workspace of projected) {
    for (const sessionId of workspace.sessionIds) member.add(sessionId)
  }
  const stray: Array<{ id: string; cwd: string; claimed: boolean }> = []
  for (const sessionId of input.sessions.ids) {
    if (member.has(sessionId)) continue
    const summary = input.sessions.byId[sessionId]
    if (summary === undefined || summary.cwd === undefined) continue
    stray.push({ id: sessionId, cwd: normalizePath(summary.cwd), claimed: false })
  }
  const byPathLengthDesc = [...projected].sort(
    (a, b) => normalizePath(b.path).length - normalizePath(a.path).length,
  )
  for (const workspace of byPathLengthDesc) {
    const workspacePath = normalizePath(workspace.path)
    for (const entry of stray) {
      if (entry.claimed) continue
      if (entry.cwd !== workspacePath && !entry.cwd.startsWith(workspacePath + '/')) continue
      workspace.sessionIds.push(entry.id)
      entry.claimed = true
    }
  }

  const parentByWorkspaceId = new Map<string, string>()
  for (const workspace of projected) {
    const wt = worktreeByPath.get(normalizePath(workspace.path))
    if (wt === undefined) continue
    // 分支徽标：worktree 行自身 + 其会话（会话级元数据仅供搜索结果行与
    // hover 卡片；会话树行不再渲染徽标，标题独占整行宽度）。
    if (wt.branch !== undefined) {
      branchByWorkspaceId[workspace.workspaceId] = wt.branch
      for (const sessionId of workspace.sessionIds) {
        const summary = input.sessions.byId[sessionId]
        if (summary !== undefined && !summary.blank) branchBySessionId[sessionId] = wt.branch
      }
    }
    // 合并状态：只标 linked worktree 行（仓库主行是基准自身，不参与判定）。
    if (wt.merged !== undefined && wt.base !== undefined) {
      mergeByWorkspaceId[workspace.workspaceId] = { merged: wt.merged, base: wt.base }
    }
    // 仓库主行存在时把 worktree 行嵌套为其下一级；否则 fail-open 就地保留。
    const main = mainWorkspaceByRoot.get(wt.repoRoot)
    if (main !== undefined && main.workspaceId !== workspace.workspaceId) {
      nested.add(workspace.workspaceId)
      parentByWorkspaceId.set(workspace.workspaceId, main.workspaceId)
      workspace.__dshWorktreeManagerParent = main.workspaceId
    }
  }

  // 排序：嵌套 worktree 行紧跟其仓库主行之后（保持原有相对顺序）。
  const childrenByParent = new Map<string, ProjectedWorkspace[]>()
  for (const workspace of projected) {
    const parent = parentByWorkspaceId.get(workspace.workspaceId)
    if (parent === undefined) continue
    const children = childrenByParent.get(parent) ?? []
    children.push(workspace)
    childrenByParent.set(parent, children)
  }

  // 主行有嵌套 worktree 子级时，为「主 worktree」合成一个虚拟二级行排最前，
  // 主仓库全部会话移入其中（渲染层按 workspaceId 为空禁用其行级交互，
  // 新建会话经 __dshWorktreeManagerHost 落回真实主 workspace）。
  for (const [parentId, children] of childrenByParent) {
    const main = projected.find(workspace => workspace.workspaceId === parentId)
    if (main === undefined) continue
    const branch = branchByWorkspaceId[parentId]
    const virtual: ProjectedWorkspace = {
      ...main,
      workspaceId: `${parentId}::dsh-main-worktree`,
      title: branch ?? 'main',
      sessionIds: main.sessionIds,
      __dshWorktreeManagerVirtual: true,
      __dshWorktreeManagerHost: parentId,
      __dshWorktreeManagerParent: parentId,
    }
    main.sessionIds = []
    nested.add(virtual.workspaceId)
    if (branch !== undefined) branchByWorkspaceId[virtual.workspaceId] = branch
    children.unshift(virtual)
  }

  const ordered: ProjectedWorkspace[] = []
  for (const workspace of projected) {
    if (nested.has(workspace.workspaceId)) continue
    ordered.push(workspace, ...(childrenByParent.get(workspace.workspaceId) ?? []))
  }

  return {
    workspaces: ordered,
    branchBySessionId,
    branchByWorkspaceId,
    mergeByWorkspaceId,
    nestedWorkspaceIds: nested,
  }
}
