/**
 * 侧边栏投影与会话头部徽标共享的拓扑拉取 hook：挂载、workspace/session
 * 键变化、window focus、以及插件派发的刷新事件时重新拉取 /api/topology。
 */
import { useEffect, useState } from 'react'
import { apiGet, WORKTREE_REFRESH_EVENT } from '../api.js'
import type { SidebarTopology } from './model.js'

export function useTopology(sessionKey: string, workspaceKey: string): SidebarTopology {
  const [topology, setTopology] = useState<SidebarTopology>({ repos: [] })
  useEffect(() => {
    let active = true
    const refresh = (): void => {
      void apiGet<SidebarTopology>('topology').then(
        value => { if (active) setTopology(value) },
        () => { if (active) setTopology({ repos: [] }) },
      )
    }
    refresh()
    window.addEventListener(WORKTREE_REFRESH_EVENT, refresh)
    window.addEventListener('focus', refresh)
    return () => {
      active = false
      window.removeEventListener(WORKTREE_REFRESH_EVENT, refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [sessionKey, workspaceKey])
  return topology
}
