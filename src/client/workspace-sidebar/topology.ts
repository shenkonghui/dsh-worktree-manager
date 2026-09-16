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
    let lastFetch = 0
    // focus 与刷新事件可能高频触发（切标签页、下拉操作），2 秒内不重复打
    // 宿主 git 扫描；插件主动派发的刷新事件（force）总是生效。
    const refresh = (force: boolean): void => {
      const now = Date.now()
      if (!force && now - lastFetch < 2000) return
      lastFetch = now
      void apiGet<SidebarTopology>('topology').then(
        value => { if (active) setTopology(value) },
        () => { if (active) setTopology({ repos: [] }) },
      )
    }
    refresh(false)
    const onRefresh = (): void => { refresh(true) }
    const onFocus = (): void => { refresh(false) }
    window.addEventListener(WORKTREE_REFRESH_EVENT, onRefresh)
    window.addEventListener('focus', onFocus)
    return () => {
      active = false
      window.removeEventListener(WORKTREE_REFRESH_EVENT, onRefresh)
      window.removeEventListener('focus', onFocus)
    }
  }, [sessionKey, workspaceKey])
  return topology
}
