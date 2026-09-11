/**
 * 托管 Workspace 侧边栏：以代理上下文调用官方 Workspace Client 的 apply，
 * 拦截 `sidebar.workspaces` slot 注册，把官方 WorkspaceBrowser 包进投影组件。
 *
 * 与 dsh-git-worktree 的 workspace-sidebar 相同的机制：保留完整的官方
 * Browser（含声明树、locale、picker、目录授权流），只替换数据投影——把
 * worktree 行保留为所属仓库主行下的嵌套层级（多一级缩进、会话不再与
 * worktree 合并为一行），并为 workspace 行与会话附加分支名元数据
 * （由构建期派生的官方渲染层显示为徽标）。
 */
import { useEffect, useMemo, useState, type ComponentType } from 'react'
import type { Context } from '@deepseek-ai/cordis'
import { apply as applyOfficialWorkspace } from 'virtual:dsh-official-workspace-client'
import { GROUPING_TOGGLE_EVENT, isGroupingEnabled } from '../api.js'
import {
  projectManagedSidebar,
  type ManagedSidebarProjection,
  type SidebarSessionListState,
  type SidebarWorkspace,
} from './model.js'
import { useTopology } from './topology.js'

/** zustand 风格 selector hook（官方 props 传入的 useWorkspaces/useSessions）。 */
type SelectorHook<S> = <T>(selector: (state: S) => T) => T

/** 官方 WorkspaceBrowser 消费的快照形状（本插件读取的最小集）。 */
interface WorkspaceListState {
  items: readonly SidebarWorkspace[]
  archivedSessionIds: readonly string[]
}

/**
 * 渲染官方 Browser，仅替换数据源：workspace 列表把 worktree 行排序为
 * 所属仓库主行的嵌套子级并附加 `__dshWorktreeManagerNested` 标记；会话
 * 列表附加 `__dshWorktreeManager` 分支元数据（搜索行/hover 卡片徽标）。
 */
export function ManagedOfficialWorkspaceBrowser(
  props: Record<string, unknown> & { OfficialBrowser: ComponentType<Record<string, unknown>> },
) {
  const OfficialBrowser = props.OfficialBrowser
  const useWorkspaces = props.useWorkspaces as SelectorHook<WorkspaceListState>
  const useSessions = props.useSessions as SelectorHook<SidebarSessionListState>

  const workspaceState = useWorkspaces(state => state)
  const sessionState = useSessions(state => state)
  const workspaceKey = workspaceState.items
    .map(workspace => `${workspace.workspaceId}:${workspace.sessionIds.join(',')}`)
    .join('|')
  const sessionKey = sessionState.ids.join('|')
  const topology = useTopology(sessionKey, workspaceKey)

  // 分组开关：关闭时传空拓扑（投影层 no-op），完全回到官方默认显示。
  const [groupingEnabled, setGroupingEnabled] = useState(isGroupingEnabled())
  useEffect(() => {
    const listener = (): void => { setGroupingEnabled(isGroupingEnabled()) }
    window.addEventListener(GROUPING_TOGGLE_EVENT, listener)
    return () => { window.removeEventListener(GROUPING_TOGGLE_EVENT, listener) }
  }, [])

  const projection = useMemo<ManagedSidebarProjection>(() => projectManagedSidebar({
    workspaces: workspaceState.items,
    sessions: sessionState,
    topology: groupingEnabled ? topology : { repos: [] },
  }), [groupingEnabled, sessionState, topology, workspaceState.items])

  const projectedWorkspaceState = useMemo<WorkspaceListState>(() => ({
    ...workspaceState,
    items: projection.workspaces.map(workspace => {
      const branch = projection.branchByWorkspaceId[workspace.workspaceId]
      if (projection.nestedWorkspaceIds.has(workspace.workspaceId)) {
        // 嵌套行直接以 worktree 分支名作为标题（不显示目录名）；分支元数据
        // 一并透传，派生渲染层把它渲染成分支徽标样式（图标 + pill）。
        return {
          ...workspace,
          title: branch ?? workspace.title,
          __dshWorktreeManagerNested: true,
          ...(branch === undefined ? {} : { __dshWorktreeManagerBranch: branch }),
        }
      }
      return branch === undefined ? workspace : { ...workspace, __dshWorktreeManagerBranch: branch }
    }),
  }), [projection, workspaceState])

  const projectedSessionState = useMemo<SidebarSessionListState>(() => {
    const byId: Record<string, SidebarSessionListState['byId'][string]> = { ...sessionState.byId }
    for (const [sessionId, branch] of Object.entries(projection.branchBySessionId)) {
      const summary = byId[sessionId]
      if (summary === undefined) continue
      // 保留规范标题不动：派生的官方渲染层把该元数据显示在搜索结果行与
      // hover 卡片（会话树行的分支由所属 worktree 行徽标承担）。
      byId[sessionId] = { ...summary, __dshWorktreeManager: { branch } } as typeof summary
    }
    return { ...sessionState, byId }
  }, [projection, sessionState])

  const useProjectedWorkspaces = (<T,>(selector: (state: WorkspaceListState) => T): T =>
    selector(projectedWorkspaceState)) as SelectorHook<WorkspaceListState>
  const useProjectedSessions = (<T,>(selector: (state: SidebarSessionListState) => T): T =>
    selector(projectedSessionState)) as SelectorHook<SidebarSessionListState>

  return <OfficialBrowser
    {...props}
    useWorkspaces={useProjectedWorkspaces}
    useSessions={useProjectedSessions}
  />
}

interface SidebarRegistrationContext {
  slots: {
    inject(name: string, callback: () => unknown): void
    register(descriptor: Record<string, unknown>, component: ComponentType<Record<string, unknown>>): unknown
  }
  [key: string]: unknown
}

/** 把 sidebar.workspaces slot 的官方 Browser 组件替换为托管投影包装。 */
function officialContextProxy(ctx: SidebarRegistrationContext): SidebarRegistrationContext {
  const proxySlots = new Proxy(ctx.slots, {
    get(target, key, receiver) {
      if (key === 'register') {
        return (descriptor: Record<string, unknown>, component: ComponentType<Record<string, unknown>>): unknown => {
          if (descriptor.name !== 'sidebar.workspaces') return target.register(descriptor, component)
          const OfficialBrowser = component
          const Browser = (props: Record<string, unknown>) => (
            <ManagedOfficialWorkspaceBrowser
              {...props}
              OfficialBrowser={OfficialBrowser}
            />
          )
          return target.register(descriptor, Browser)
        }
      }
      return Reflect.get(target, key, receiver)
    },
  })
  return new Proxy(ctx, {
    get(target, key, receiver) {
      if (key === 'slots') return proxySlots
      return Reflect.get(target, key, receiver)
    },
  })
}

/**
 * 以代理上下文应用一次版本/hash 门控的官方 Workspace Client：保留其完整
 * 声明树、locale、picker 与目录授权流，仅替换 Browser 组件的数据投影。
 */
export function registerManagedWorkspaceSidebar(ctx: SidebarRegistrationContext): void {
  applyOfficialWorkspace(officialContextProxy(ctx) as unknown as Context)
}
