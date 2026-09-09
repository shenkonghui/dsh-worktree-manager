/**
 * 侧边栏投影纯函数：把外部目录 worktree 的会话聚合回原仓库 workspace 行。
 *
 * 输入官方 useWorkspaces/useSessions 快照与宿主 /api/topology 拓扑，输出：
 * - 隐藏 worktree 独立 workspace 行（其仓库主行存在且其中有实际会话时），
 *   并把其中非 blank 会话合并进主行的 sessionIds；空 worktree 行保留可见，
 *   用户才能从侧边栏进入该 worktree 开任务；
 * - 为合并会话与保留行标注分支名（渲染为徽标）；
 * - 归属无法证明时 fail-open：保留原行可见并就地标注，绝不隐藏会话。
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
  worktrees: ReadonlyArray<{ path: string; branch?: string }>
  workspaceIds: readonly string[]
}

/** GET /api/topology 的响应体。 */
export interface SidebarTopology {
  repos: readonly SidebarTopologyRepo[]
}

/** 投影结果：投影后的 workspace 行 + 分支标注 + 被抑制的 blank 会话。 */
export interface ManagedSidebarProjection {
  /** 隐藏行已移除；主行的 sessionIds 已合并 worktree 会话。 */
  workspaces: ProjectedWorkspace[]
  /** 会话行分支徽标（含可见 worktree 行内的会话）。 */
  branchBySessionId: Readonly<Record<string, string>>
  /** workspace 行分支徽标（主行 + 保留可见的 worktree 行）。 */
  branchByWorkspaceId: Readonly<Record<string, string>>
  /** 隐藏行中被抑制的 blank 会话（非当前）。 */
  suppressedSessionIds: ReadonlySet<string>
}

/** 可变副本：sessionIds 已展开为可合并的普通数组。 */
export interface ProjectedWorkspace extends SidebarWorkspace {
  sessionIds: string[]
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
 * 派生聚合投影。主行不存在的 worktree 行、或会话归属有歧义（出现在多个
 * workspace）时 fail-open：行保留可见，行与会话就地标注分支名。
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
  const byId = new Map(projected.map(workspace => [workspace.workspaceId, workspace]))
  const branchBySessionId: Record<string, string> = {}
  const branchByWorkspaceId: Record<string, string> = {}
  const suppressed = new Set<string>()
  const hidden = new Set<string>()

  if (input.topology.repos.length === 0) {
    return { workspaces: projected, branchBySessionId, branchByWorkspaceId, suppressedSessionIds: suppressed }
  }

  // 拓扑 → 查找表：worktree 路径归属 + 每个仓库的主 workspace 行。
  const worktreeByPath = new Map<string, { repoRoot: string; branch?: string }>()
  for (const repo of input.topology.repos) {
    for (const wt of repo.worktrees) {
      worktreeByPath.set(normalizePath(wt.path), { repoRoot: repo.root, branch: wt.branch })
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

  // 每个会话所属的 workspace 数：>1 视为歧义，fail-open。
  const membershipCount = new Map<string, number>()
  for (const workspace of projected) {
    for (const sessionId of workspace.sessionIds) {
      membershipCount.set(sessionId, (membershipCount.get(sessionId) ?? 0) + 1)
    }
  }

  // 游离会话索引：不在任何 workspace 的 sessionIds 中、但有 cwd 的会话
  // （典型是刚创建的 provisional blank 会话）。按 cwd 归属到所在 worktree。
  const stray: Array<{ id: string; cwd: string; blank: boolean }> = []
  for (const sessionId of input.sessions.ids) {
    if ((membershipCount.get(sessionId) ?? 0) > 0) continue
    const summary = input.sessions.byId[sessionId]
    if (summary === undefined || summary.cwd === undefined) continue
    stray.push({
      id: sessionId,
      cwd: normalizePath(summary.cwd),
      blank: summary.blank,
    })
  }

  for (const workspace of projected) {
    if (hidden.has(workspace.workspaceId)) continue
    const wt = worktreeByPath.get(normalizePath(workspace.path))
    if (wt === undefined) continue

    // 有效会话集 = 显式成员 + cwd 落在该 worktree 内的游离会话。
    const workspacePath = normalizePath(workspace.path)
    const candidateIds = [...workspace.sessionIds]
    for (const entry of stray) {
      if (entry.cwd === workspacePath || entry.cwd.startsWith(workspacePath + '/')) {
        candidateIds.push(entry.id)
      }
    }

    const main = mainWorkspaceByRoot.get(wt.repoRoot)
    const canMerge = main !== undefined
      && main.workspaceId !== workspace.workspaceId
      && !hidden.has(main.workspaceId)

    if (canMerge) {
      // 歧义只针对显式出现在多个 workspace 的会话；游离会话（membership
      // 为 0）由 cwd 主动归属，不视为歧义。
      const ambiguous = candidateIds.some(id => (membershipCount.get(id) ?? 0) > 1)
      if (ambiguous) {
        // fail-open：归属歧义的 worktree 行保留可见并就地标注。
        if (wt.branch !== undefined) {
          branchByWorkspaceId[workspace.workspaceId] = wt.branch
          for (const sessionId of candidateIds) {
            const summary = input.sessions.byId[sessionId]
            if (summary !== undefined && !summary.blank) branchBySessionId[sessionId] = wt.branch
          }
        }
        continue
      }
      // 空 worktree 行（没有任何有效会话）保留可见：
      // 隐藏它只会让用户完全无法从侧边栏进入该 worktree 开任务；等它
      // 产生会话后再隐藏并聚合进主行（dsh-git-worktree 语义）。
      const hasContent = candidateIds.some(id => {
        const summary = input.sessions.byId[id]
        return summary !== undefined && (!summary.blank || id === input.sessions.current)
      })
      if (!hasContent) {
        if (wt.branch !== undefined) {
          branchByWorkspaceId[workspace.workspaceId] = wt.branch
        }
        continue
      }
      for (const sessionId of candidateIds) {
        const summary = input.sessions.byId[sessionId]
        if (summary === undefined) continue
        // blank 且非当前的会话（临时 New Session）随隐藏行一起消失。
        if (summary.blank && sessionId !== input.sessions.current) {
          suppressed.add(sessionId)
          continue
        }
        if (!main.sessionIds.includes(sessionId)) main.sessionIds.push(sessionId)
        if (wt.branch !== undefined) branchBySessionId[sessionId] = wt.branch
      }
      hidden.add(workspace.workspaceId)
      continue
    }

    // fail-open：仓库主行不存在 → worktree 行保留可见，行 + 会话都标注。
    if (wt.branch !== undefined) {
      branchByWorkspaceId[workspace.workspaceId] = wt.branch
      for (const sessionId of candidateIds) {
        const summary = input.sessions.byId[sessionId]
        if (summary !== undefined && !summary.blank) branchBySessionId[sessionId] = wt.branch
      }
    }
  }

  return {
    workspaces: projected.filter(workspace => !hidden.has(workspace.workspaceId)),
    branchBySessionId,
    branchByWorkspaceId,
    suppressedSessionIds: suppressed,
  }
}
