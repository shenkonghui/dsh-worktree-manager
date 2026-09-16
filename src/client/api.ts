/**
 * 插件 HTTP API 客户端：宿主半在 /plugins/dsh-worktree-manager/api/* 注册的
 * 路由。宿主与浏览器半共用此前缀；fetch 失败时以 error 字段文本抛错。
 *
 * 客户端各视图共享的响应类型与 basename 工具也集中在这里，避免每个文件
 * 各自复制一份宿主半的类型声明。
 */

/** Route prefix shared with the host half. */
export const API_BASE = '/plugins/dsh-worktree-manager/api/'

// ---- 共享响应类型（与宿主半 src/index.ts 的返回体一一对应） ----

/** `git worktree list --porcelain` 的一行（/api/list）。 */
export interface WorktreeInfo {
  path: string
  head: string
  branch?: string
  bare: boolean
  locked: boolean
  prunable: boolean
}

/** /api/list 响应体。 */
export interface ListResponse {
  worktrees: WorktreeInfo[]
}

/** /api/create 响应体。 */
export interface CreateResponse {
  worktree: WorktreeInfo
  workspaceId: string
}

/** /api/remove 响应体。 */
export interface RemoveResponse {
  removed: true
}

/** 拓扑行里注册在某仓库下的 dsh workspace。 */
export interface RepoWorkspace {
  id: string
  path: string
  title: string
}

/** /api/topology 中每个仓库的拓扑行（含合并状态与 locked/prunable 徽标）。 */
export interface RepoTopology {
  /** 规范化 git 仓库根（主工作树目录）。 */
  root: string
  /** 展示名（根路径 basename）。 */
  name: string
  /** 主工作树当前分支；detached HEAD 时缺省。 */
  mainBranch?: string
  /** 非主 worktree 列表；`merged` 缺省表示宿主未能判定。 */
  worktrees: ReadonlyArray<{ path: string; branch?: string; merged?: boolean; locked?: boolean; prunable?: boolean }>
  /** 注册在该仓库下的 dsh workspace（主 + worktree）。 */
  workspaces: RepoWorkspace[]
}

/** /api/topology 响应体。 */
export interface TopologyResponse {
  repos: RepoTopology[]
}

// ---- 工具 ----

/** 去掉尾部斜杠后的末段路径（展示名）。 */
export function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

// ---- HTTP helpers ----

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

// ---- 事件与分组开关 ----

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
