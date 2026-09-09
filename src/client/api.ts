/**
 * 插件 HTTP API 客户端：宿主半在 /plugins/dsh-worktree-manager/api/* 注册的
 * 路由。宿主与浏览器半共用此前缀；fetch 失败时以 error 字段文本抛错。
 */

/** Route prefix shared with the host half. */
export const API_BASE = '/plugins/dsh-worktree-manager/api/'

/** GET one of the plugin API actions, throwing the host error message on failure. */
export async function apiGet<T>(action: string, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}${action}${qs ? `?${qs}` : ''}`)
  const json = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

/** POST one of the plugin API actions with a JSON body. */
export async function apiPost<T>(action: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

/** Event dispatched after a worktree create/select so the sidebar projection refetches topology. */
export const WORKTREE_REFRESH_EVENT = 'dsh-worktree-manager:refresh'

/** localStorage key persisting the "group sessions by worktree" toggle. */
const GROUPING_KEY = 'dsh-worktree-manager:group-by-worktree'

/** Event dispatched when the grouping toggle flips (both display surfaces listen). */
export const GROUPING_TOGGLE_EVENT = 'dsh-worktree-manager:toggle-grouping'

/** 分组开关当前状态：默认关闭（官方默认显示），开启后才按工作树聚合。 */
export function isGroupingEnabled(): boolean {
  try {
    return localStorage.getItem(GROUPING_KEY) === '1'
  } catch {
    return false
  }
}

/** 写入分组开关并广播翻转事件（侧边栏投影与会话头部胶囊监听）。 */
export function setGroupingEnabled(value: boolean): void {
  try {
    localStorage.setItem(GROUPING_KEY, value ? '1' : '0')
  } catch { /* localStorage 不可用时仅本次会话生效 */ }
  window.dispatchEvent(new Event(GROUPING_TOGGLE_EVENT))
}
