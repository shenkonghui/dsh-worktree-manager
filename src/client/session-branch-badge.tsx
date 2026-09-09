/**
 * 会话头部（聊天窗口标题栏右侧 actions）的 worktree 分支胶囊。
 *
 * 通过 `conversation.session.header.actions` slot 注册（与 dsh-git-worktree
 * 的 Target 状态胶囊同一官方缝），props 为 `{ sessionId }`。按会话 cwd 匹配
 * /api/topology 中的 worktree，命中则渲染「分支图标 + 分支名」胶囊；未命中
 * （主仓库会话或非 git 会话）渲染 null。
 */
import { useEffect, useState, type ComponentType } from 'react'
import { GROUPING_TOGGLE_EVENT, isGroupingEnabled } from './api.js'
import { matchWorktreeByPath, type WorktreeMatch } from './workspace-sidebar/model.js'
import { useTopology } from './workspace-sidebar/topology.js'

/** 官方 session controller 客户端服务的最小读取面。 */
interface SessionsListService {
  list: {
    getSnapshot(): {
      byId: Readonly<Record<string, { cwd?: string } | undefined>>
    }
  }
}

/** 读取会话 cwd：快照同步可读，未就绪时短暂轮询直至命中。 */
function useSessionCwd(sessionId: string | undefined, sessions: SessionsListService | undefined): string | undefined {
  const [cwd, setCwd] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (sessionId === undefined || sessions === undefined) return
    let active = true
    let timer = 0
    const tick = (): void => {
      try {
        const summary = sessions.list.getSnapshot().byId[sessionId]
        if (active && summary?.cwd !== undefined) {
          setCwd(summary.cwd)
          window.clearInterval(timer)
        }
      } catch { /* 快照不可用时下一轮重试 */ }
    }
    tick()
    timer = window.setInterval(tick, 2000)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [sessionId, sessions])
  return cwd
}

/** 分支线条图标（内联 SVG，与侧边栏徽标的 primitives 图标视觉一致）。 */
function BranchIcon(): JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="4.2" cy="3.4" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="4.2" cy="12.6" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="11.8" cy="5" r="1.7" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M4.2 5.1v5.8M11.8 6.7c0 2.9-3.4 2.6-5.9 3.1"
        stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"
      />
    </svg>
  )
}

/** 会话头部胶囊：显示该会话所在 worktree 的分支名（分组开关关闭时不显示）。 */
export function SessionBranchBadge(props: { sessionId?: string }): JSX.Element | null {
  const sessionId = props.sessionId
  // sessions 服务由注册器闭包注入（ctx.get('sessions')）。
  const sessions = (SessionBranchBadge as unknown as { __sessions?: SessionsListService }).__sessions
  const [groupingEnabled, setGroupingEnabled] = useState(isGroupingEnabled())
  useEffect(() => {
    const listener = (): void => { setGroupingEnabled(isGroupingEnabled()) }
    window.addEventListener(GROUPING_TOGGLE_EVENT, listener)
    return () => { window.removeEventListener(GROUPING_TOGGLE_EVENT, listener) }
  }, [])
  const cwd = useSessionCwd(sessionId, sessions)
  // workspace/session 键恒为空串：徽标只依赖 topology 的事件刷新。
  const topology = useTopology('', '')

  if (!groupingEnabled) return null
  if (sessionId === undefined || cwd === undefined) return null
  const match: WorktreeMatch | undefined = matchWorktreeByPath(topology, cwd)
  if (match === undefined) return null

  return (
    <span
      style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
      title={match.main ? `${match.repoName} 主工作树 · ${match.branch ?? ''}` : `${match.repoName} · ${match.branch ?? ''}`}
    >
      <span className="dsh-worktree-manager-sidebar-icon" aria-hidden="true">
        <BranchIcon />
      </span>
      <span className="dsh-worktree-manager-sidebar-badge" aria-hidden="true">
        {match.branch ?? match.repoName}
      </span>
    </span>
  )
}

interface HeaderSlotContext {
  slots: {
    inject(name: string, callback: () => unknown): void
    register(descriptor: Record<string, unknown>, component: ComponentType<Record<string, unknown>>): unknown
  }
  get(name: string): unknown
}

/**
 * 延迟注册会话头部胶囊：等 conversation UI 声明该 slot 后再 register，
 * 并把 sessions 服务闭包挂到组件上供其读取会话 cwd。
 */
export function registerSessionBranchBadge(ctx: HeaderSlotContext): void {
  const sessions = ctx.get('sessions') as SessionsListService | undefined
  ;(SessionBranchBadge as unknown as { __sessions?: SessionsListService }).__sessions = sessions
  ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions',
    id: 'worktree-branch-badge',
    order: 25,
    label: 'Worktree Branch',
  }, SessionBranchBadge))
}
