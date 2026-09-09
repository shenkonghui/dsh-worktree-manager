/**
 * Browser face of the dsh-worktree-manager plugin.
 *
 * Two surfaces:
 *
 * 1. **Managed workspace sidebar** (official client proxy): re-applies the
 *    version/hash-gated official Workspace Client through a proxied context,
 *    swapping its Browser component for the managed projection — worktree
 *    workspaces are hidden and their sessions aggregated under the owning
 *    repository's workspace row, with branch badges on both workspace and
 *    session rows. See ./workspace-sidebar.
 *
 * 2. **Task-start-window Worktree button** (DOM injection): a
 *    MutationObserver injects a "Worktree" button beside the workspace
 *    picker chip. Clicking it opens a dropdown for listing, creating, and
 *    selecting worktrees.
 *
 * Communication with the host goes through the custom HTTP routes registered
 * by the host half at /plugins/dsh-worktree-manager/api/*.
 */

import { inject as officialWorkspaceInject } from 'virtual:dsh-official-workspace-client'
import { registerManagedWorkspaceSidebar } from './workspace-sidebar/index.js'
import { registerSessionBranchBadge } from './session-branch-badge.js'
import { apiGet, apiPost, WORKTREE_REFRESH_EVENT, isGroupingEnabled, setGroupingEnabled } from './api.js'

// ---- Minimal ClientContext type (no dsh build-time dependency) ----
// The real ClientContext is merged at runtime by the dsh client runtime; this
// local declaration carries only what this plugin's apply touches.

/**
 * Services required for the official Workspace Client re-apply (its inject
 * list); the DOM-injection surface uses none of them directly.
 */
export const inject = [...officialWorkspaceInject as string[]] as const

// ---- Types matching the host-side responses ----

interface WorktreeInfo {
  path: string
  head: string
  branch?: string
  bare: boolean
  locked: boolean
  prunable: boolean
}

interface ListResponse {
  worktrees: WorktreeInfo[]
}

interface CreateResponse {
  worktree: WorktreeInfo
  workspaceId: string
}

interface RepoWorkspace {
  id: string
  path: string
  title: string
}

interface RepoGroup {
  root: string
  name: string
  workspaces: RepoWorkspace[]
}

interface ReposResponse {
  repos: RepoGroup[]
}

// ---- API helpers ----
// apiGet/apiPost live in ./api.js and are shared with the sidebar projection.

// ---- DOM helpers ----

/** Create an element with attributes and children. */
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'class') node.className = value
    else if (key === 'text') node.textContent = value
    else node.setAttribute(key, value)
  }
  for (const child of children) {
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child)
  }
  return node
}

/** Extract the final path component (trailing slashes trimmed). */
function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}
// ---- Styles ----

const STYLE_ID = 'dsh-worktree-manager-style'

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return
  const style = el('style', { id: STYLE_ID })
  style.textContent = `
.dsh-wt-inject-btn {
  display: inline-flex; align-items: center; gap: 4px;
  height: 28px; padding: 0 10px; border-radius: 6px; cursor: pointer; font-size: 13px;
  border: none !important; outline: none !important; background: transparent;
  color: var(--dsh-fg, inherit); flex: none;
}
.dsh-wt-inject-btn:hover { background: var(--dsh-hover, rgba(0,0,0,0.05)); }
.dsh-wt-dropdown {
  position: fixed; z-index: 10000; min-width: 280px; max-width: 480px;
  max-height: 360px; overflow-y: auto;
  background: var(--dsh-bg, #fff); color: var(--dsh-fg, inherit);
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.1));
  border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,0.15);
  font-family: inherit; font-size: 13px;
}
.dsh-wt-dropdown-header {
  padding: 8px 12px; font-size: 12px; opacity: 0.6;
  border-bottom: 1px solid var(--dsh-border, rgba(0,0,0,0.06));
  position: sticky; top: 0; background: inherit;
}
.dsh-wt-dropdown-item {
  display: flex; gap: 8px; align-items: center;
  padding: 8px 12px; cursor: pointer; border: none; width: 100%;
  background: transparent; color: inherit; text-align: left; font-size: 13px;
}
.dsh-wt-dropdown-item:hover { background: var(--dsh-hover, rgba(0,0,0,0.05)); }
.dsh-wt-dropdown-item-info { flex: 1; min-width: 0; }
.dsh-wt-dropdown-item-path { font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dsh-wt-dropdown-item-branch { font-size: 11px; opacity: 0.6; }
.dsh-wt-dropdown-item-badge {
  font-size: 10px; padding: 1px 5px; border-radius: 3px;
  background: var(--dsh-badge, rgba(0,0,0,0.1)); flex: none;
}
.dsh-wt-dropdown-loading { padding: 16px; text-align: center; opacity: 0.6; }
.dsh-wt-dropdown-error { padding: 12px; color: #f38ba8; font-size: 12px; }
.dsh-wt-dropdown-create {
  display: flex; gap: 6px; padding: 8px 12px;
  border-top: 1px solid var(--dsh-border, rgba(0,0,0,0.06));
}
.dsh-wt-dropdown-input {
  flex: 1; padding: 6px 8px; font-size: 13px;
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.15)); border-radius: 4px;
  background: var(--dsh-input-bg, #fff); color: inherit;
}
.dsh-wt-dropdown-btn {
  padding: 6px 10px; font-size: 12px; border-radius: 4px; cursor: pointer;
  border: none; background: var(--dsh-accent, #89b4fa); color: var(--dsh-accent-fg, #fff);
}
.dsh-wt-dropdown-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dsh-wt-dropdown-btn-secondary {
  background: transparent; color: inherit;
  border: 1px solid var(--dsh-border, rgba(0,0,0,0.15));
}
.dsh-wt-repo-group { border-bottom: 1px solid var(--dsh-border, rgba(0,0,0,0.06)); }
.dsh-wt-repo-group:last-child { border-bottom: none; }
.dsh-wt-repo-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px; cursor: pointer; font-size: 12px; font-weight: 600;
  background: var(--dsh-hover, rgba(0,0,0,0.03)); user-select: none;
}
.dsh-wt-repo-header:hover { background: var(--dsh-hover, rgba(0,0,0,0.06)); }
.dsh-wt-repo-toggle { font-size: 10px; opacity: 0.5; flex: none; width: 12px; }
.dsh-wt-repo-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dsh-wt-repo-count { font-size: 10px; opacity: 0.5; flex: none; font-weight: 400; }
.dsh-wt-repo-body { display: none; }
.dsh-wt-repo-body.open { display: block; }
.dsh-wt-repo-empty { padding: 8px 12px; font-size: 11px; opacity: 0.5; }
.dsh-wt-dropdown-create select.dsh-wt-dropdown-input { flex: none; width: auto; min-width: 120px; }
/* Sidebar branch badges（对齐 dsh-git-worktree 状态徽标的视觉：accent 色字 + 色底 + 色边框 pill） */
.dsh-worktree-manager-sidebar-icon,
.dsh-worktree-manager-sidebar-badge { flex: 0 1 auto; min-width: 0; }
.dsh-worktree-manager-sidebar-icon { flex: 0 0 auto; }
.dsh-worktree-manager-sidebar-icon {
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--dsw-alias-state-business-primary, #89b4fa);
}
.dsh-worktree-manager-sidebar-badge {
  --dsh-wt-sidebar-accent: var(--dsw-alias-state-business-primary, #89b4fa);
  box-sizing: border-box;
  max-width: 200px;
  min-height: 20px;
  padding: 1px 6px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--dsh-wt-sidebar-accent) 24%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--dsh-wt-sidebar-accent) 10%, transparent);
  color: var(--dsh-wt-sidebar-accent);
  font-size: 11px;
  font-weight: 600;
  line-height: 16px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 侧边栏「工作区」标题行的分组开关按钮 */
.dsh-wt-grouping-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex: none;
  border: none; border-radius: 5px; padding: 0;
  background: transparent; color: var(--dsh-fg-muted, inherit);
  opacity: 0.55; cursor: pointer;
}
.dsh-wt-grouping-btn:hover { background: var(--dsh-hover, rgba(0,0,0,0.06)); opacity: 0.85; }
.dsh-wt-grouping-btn.active {
  color: var(--dsw-alias-state-business-primary, #89b4fa);
  opacity: 1;
  background: color-mix(in srgb, var(--dsw-alias-state-business-primary, #89b4fa) 12%, transparent);
}
`
  document.head.appendChild(style)
}

// ---- Current workspace detection ----

// ---- dsh 客户端服务（经 cordis ctx 获取，RPC 走 Connection 的 WebSocket mux） ----

/** useWorkspaces 快照中的 workspace 行（官方 workspace controller 模型）。 */
interface DshWorkspaceItem {
  workspaceId: string
  path: string
  title: string
  sessionIds?: readonly string[]
}

/** 官方 workspace controller 客户端服务（@deepseek-ai/dsh-api-workspace-controller）。 */
interface DshWorkspacesService {
  /** 采纳一个已存在的绝对路径为新 Workspace；失败抛 WorkspaceCreateError。 */
  create(input: { path: string }): Promise<DshWorkspaceItem>
  /** list 字段即 ClientWorkspaceModel，提供 getSnapshot() 快照。 */
  list: {
    getSnapshot(): { items: readonly DshWorkspaceItem[]; archivedSessionIds: readonly string[] }
  }
}

/** useSessions 快照中的会话摘要（官方 session controller 模型）。 */
interface DshSessionSummary {
  id: string
  displayTitle: string
  blank: boolean
  cwd?: string
  updatedAt?: number
}

/** 官方 session controller 客户端服务（@deepseek-ai/dsh-api-session-controller）。 */
interface DshSessionsService {
  /** 在目标 workspace（或 cwd）下创建一个 blank 会话，返回其 id。 */
  create(opts: { workspaceId?: string; cwd?: string; sessionId?: string }): Promise<string>
  /** 切换当前会话。 */
  open(id: string): void
  /** list 字段即 useSessions 标准快照源（ids/byId/current）。 */
  list: {
    getSnapshot(): {
      ids: readonly string[]
      byId: Readonly<Record<string, DshSessionSummary | undefined>>
      current?: string
    }
  }
}

/** apply 时从 ctx 捕获的客户端服务；inject 列表保证其已就绪。 */
let workspacesService: DshWorkspacesService | undefined
let sessionsService: DshSessionsService | undefined

/** 读取当前 workspace 列表快照（同步，来自 client model 缓存）。 */
function listWorkspaces(): readonly DshWorkspaceItem[] {
  try {
    return workspacesService?.list.getSnapshot().items ?? []
  } catch {
    return []
  }
}

// ---- workspace 服务 helpers ----

/**
 * Check if a workspace exists for the given path.
 * Returns the workspace item if found, null otherwise.
 */
function findWorkspace(path: string): DshWorkspaceItem | null {
  return listWorkspaces().find(it => it.path === path) ?? null
}

/**
 * Create a workspace for the given path via the official workspaces service.
 * Creates are echoed into the client model, so the sidebar updates directly.
 */
async function createWorkspace(path: string): Promise<DshWorkspaceItem> {
  if (workspacesService === undefined) {
    throw new Error('workspaces 服务不可用：客户端尚未完成初始化')
  }
  return workspacesService.create({ path })
}

/** 归一化路径用于会话 cwd 匹配（去尾部斜杠）。 */
function normalizePathKey(value: string): string {
  return value.replace(/\/+$/, '')
}

/**
 * Ensure a workspace exists for the given path, then enter it by creating (or
 * reusing) a blank session in that workspace and opening it — the session then
 * appears as a session of the owning repository's workspace row in the sidebar
 * projection, even though the standalone worktree row is hidden.
 */
async function ensureAndSwitchWorkspace(path: string): Promise<void> {
  if (sessionsService === undefined) {
    throw new Error('sessions 服务不可用：客户端尚未完成初始化')
  }
  // Check if workspace already exists, create if missing
  let ws = findWorkspace(path)
  if (!ws) ws = await createWorkspace(path)
  if (!ws) throw new Error(`workspace 创建失败：${path}`)

  // 复用该 workspace 下已有的 blank 会话；否则新建一个并切换。
  const key = normalizePathKey(path)
  let blank: DshSessionSummary | undefined
  try {
    const snapshot = sessionsService.list.getSnapshot()
    for (const id of snapshot.ids) {
      const summary = snapshot.byId[id]
      if (summary === undefined || !summary.blank) continue
      if (summary.cwd !== undefined && normalizePathKey(summary.cwd) === key) {
        blank = summary
        break
      }
    }
  } catch { /* 快照不可用时直接新建 */ }

  if (blank !== undefined) {
    sessionsService.open(blank.id)
  } else {
    const sessionId = await sessionsService.create({ workspaceId: ws.workspaceId })
    sessionsService.open(sessionId)
  }
  // 侧边栏拓扑可能变化（新 workspace / 会话归属），通知投影层重新拉取。
  window.dispatchEvent(new Event(WORKTREE_REFRESH_EVENT))
}

// ---- Dropdown menu ----

let activeDropdown: HTMLElement | null = null

function closeDropdown(): void {
  if (activeDropdown) {
    activeDropdown.remove()
    activeDropdown = null
  }
  document.removeEventListener('click', onDocClick)
}

function onDocClick(e: MouseEvent): void {
  if (activeDropdown && !activeDropdown.contains(e.target as Node)) {
    closeDropdown()
  }
}

/** Show the worktree dropdown anchored above the trigger button. */
async function showWorktreeDropdown(trigger: HTMLElement): Promise<void> {
  closeDropdown()
  injectStyles()

  const rect = trigger.getBoundingClientRect()
  const dropdown = el('div', { class: 'dsh-wt-dropdown' })
  dropdown.style.left = `${rect.left}px`
  // Anchor to bottom (above trigger) so the dropdown grows upward as content loads
  dropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`
  dropdown.style.top = 'auto'
  activeDropdown = dropdown
  document.body.appendChild(dropdown)

  // Click-away listener
  setTimeout(() => document.addEventListener('click', onDocClick), 0)

  // Loading state
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '正在扫描 git 仓库…' }))

  // 1. Fetch all discovered repositories (grouped by git common root)
  let repos: RepoGroup[]
  try {
    const reposRes = await apiGet('repos', {}) as ReposResponse
    repos = reposRes.repos
  } catch (err) {
    dropdown.innerHTML = ''
    const msg = err instanceof Error ? err.message : String(err)
    dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: msg }))
    return
  }

  if (repos.length === 0) {
    dropdown.innerHTML = ''
    dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: '当前所有工作区均不是 git 仓库' }))
    return
  }

  // 2. Detect current workspace path to decide which repo expands by default.
  // The workspace chip button carries a stable aria-label (zh/en) and its
  // text content is the current workspace title.
  const wsItems = listWorkspaces()
  let currentName = ''
  for (const label of WORKSPACE_CHIP_LABELS) {
    const wsBtn = document.querySelector<HTMLElement>(
      `button[aria-haspopup="menu"][aria-label="${label}"]`,
    )
    if (wsBtn) {
      // The chip's visible label span holds the workspace title; the button
      // text also includes the aria-label text, so strip it.
      const labelSpan = wsBtn.querySelector('span')
      currentName = (labelSpan?.textContent ?? wsBtn.textContent ?? '').trim()
      break
    }
  }
  const currentWs = wsItems.find(it => it.title === currentName) ?? null
  // The repo whose root contains the current workspace path is expanded by default
  const currentRepoRoot = currentWs
    ? repos.find(r => currentWs.path === r.root || currentWs.path.startsWith(r.root + '/'))?.root ?? null
    : null

  // 3. Concurrently load worktrees for every discovered repo
  dropdown.innerHTML = ''
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '正在加载 worktree 列表…' }))

  interface RepoWithWorktrees {
    repo: RepoGroup
    worktrees: WorktreeInfo[]
    error?: string
  }
  const loaded: RepoWithWorktrees[] = await Promise.all(
    repos.map(async r => {
      try {
        const listRes = await apiGet('list', { repoPath: r.root }) as ListResponse
        return { repo: r, worktrees: listRes.worktrees }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { repo: r, worktrees: [], error: msg }
      }
    }),
  )

  // Stable order: current repo first, then by root path
  loaded.sort((a, b) => {
    if (a.repo.root === currentRepoRoot) return -1
    if (b.repo.root === currentRepoRoot) return 1
    return a.repo.root.localeCompare(b.repo.root)
  })

  // 4. Render grouped list with search filter
  dropdown.innerHTML = ''

  const totalWorktrees = loaded.reduce((n, g) => n + g.worktrees.length, 0)
  const headerText = `${repos.length} 个仓库 · ${totalWorktrees} 个 worktree`
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-header', text: headerText }))

  // Search input
  const searchBox = el('input', {
    class: 'dsh-wt-dropdown-input',
    placeholder: '筛选 worktree (按名称/分支/路径)…',
    style: 'width:100%;box-sizing:border-box;margin:0;border:0;border-bottom:1px solid var(--dsh-border, rgba(0,0,0,0.06));border-radius:0;padding:8px 12px;',
  })
  dropdown.appendChild(searchBox)

  // List container
  const listContainer = el('div')
  dropdown.appendChild(listContainer)

  function renderList(filter: string): void {
    listContainer.innerHTML = ''
    const lower = filter.toLowerCase()
    const hasFilter = filter.length > 0

    let totalShown = 0

    for (const group of loaded) {
      const filtered = group.worktrees.filter(wt => {
        if (!hasFilter) return true
        const name = basename(wt.path).toLowerCase()
        const branch = (wt.branch ?? '').toLowerCase()
        return name.includes(lower) || branch.includes(lower) || wt.path.toLowerCase().includes(lower)
      })

      // When filtering, hide repos with no matches; otherwise show all (even empty)
      if (hasFilter && filtered.length === 0) continue
      totalShown += filtered.length

      const groupEl = el('div', { class: 'dsh-wt-repo-group' })
      const header = el('div', { class: 'dsh-wt-repo-header' })
      // Expand current repo by default; when filtering, expand all
      const expanded = hasFilter || group.repo.root === currentRepoRoot
      const toggle = el('span', { class: 'dsh-wt-repo-toggle', text: expanded ? '▼' : '▶' })
      header.appendChild(toggle)
      header.appendChild(el('span', { class: 'dsh-wt-repo-name', text: group.repo.name, title: group.repo.root }))
      const countText = group.error
        ? '加载失败'
        : `${filtered.length} 个 worktree`
      header.appendChild(el('span', { class: 'dsh-wt-repo-count', text: countText }))
      groupEl.appendChild(header)

      const body = el('div', { class: `dsh-wt-repo-body${expanded ? ' open' : ''}` })

      if (group.error) {
        body.appendChild(el('div', { class: 'dsh-wt-repo-empty', text: group.error }))
      } else if (filtered.length === 0) {
        body.appendChild(el('div', { class: 'dsh-wt-repo-empty', text: '无 worktree' }))
      } else {
        for (const wt of filtered) {
          const item = el('button', { class: 'dsh-wt-dropdown-item' })
          const info = el('div', { class: 'dsh-wt-dropdown-item-info' })
          info.appendChild(el('div', { class: 'dsh-wt-dropdown-item-path', text: basename(wt.path), title: wt.path }))
          const branchText = wt.branch ? wt.branch : `HEAD: ${wt.head.slice(0, 8)}`
          info.appendChild(el('div', { class: 'dsh-wt-dropdown-item-branch', text: branchText }))
          item.appendChild(info)
          const badges: string[] = []
          if (wt.bare) badges.push('bare')
          if (wt.locked) badges.push('locked')
          if (wt.prunable) badges.push('prunable')
          for (const badge of badges) {
            item.appendChild(el('span', { class: 'dsh-wt-dropdown-item-badge', text: badge }))
          }
          item.onclick = async (e: MouseEvent) => {
            e.stopPropagation()
            item.setAttribute('disabled', 'disabled')
            try {
              await ensureAndSwitchWorkspace(wt.path)
              closeDropdown()
            } catch (err) {
              item.removeAttribute('disabled')
              const msg = err instanceof Error ? err.message : String(err)
              dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: msg }))
            }
          }
          body.appendChild(item)
        }
      }

      header.onclick = (e: MouseEvent) => {
        e.stopPropagation()
        const isOpen = body.classList.toggle('open')
        toggle.textContent = isOpen ? '▼' : '▶'
      }

      groupEl.appendChild(body)
      listContainer.appendChild(groupEl)
    }

    if (totalShown === 0) {
      listContainer.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '无匹配 worktree' }))
    }
  }

  searchBox.oninput = () => renderList(searchBox.value)
  searchBox.onclick = (e: MouseEvent) => e.stopPropagation()
  renderList('')

  // 5. Create-new-worktree row (target repo selectable, defaults to current repo)
  const createRow = el('div', { class: 'dsh-wt-dropdown-create' })
  const repoSelect = el('select', { class: 'dsh-wt-dropdown-input' })
  for (const g of loaded) {
    const opt = el('option', { value: g.repo.root, text: g.repo.name })
    if (g.repo.root === currentRepoRoot) opt.setAttribute('selected', 'selected')
    repoSelect.appendChild(opt)
  }
  createRow.appendChild(repoSelect)
  const branchInput = el('input', {
    class: 'dsh-wt-dropdown-input',
    placeholder: '新分支名 (如 feature/xxx)',
  })
  createRow.appendChild(branchInput)
  const createBtn = el('button', { class: 'dsh-wt-dropdown-btn', text: '创建' })
  createBtn.onclick = async (e: MouseEvent) => {
    e.stopPropagation()
    const branch = branchInput.value.trim()
    if (!branch) return
    const repoPath = repoSelect.value
    createBtn.setAttribute('disabled', 'disabled')
    try {
      const result = await apiPost('create', {
        repoPath,
        branch,
        newBranch: true,
      }) as CreateResponse
      await ensureAndSwitchWorkspace(result.worktree.path)
      closeDropdown()
    } catch (err) {
      createBtn.removeAttribute('disabled')
      const msg = err instanceof Error ? err.message : String(err)
      dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: msg }))
    }
  }
  createRow.appendChild(createBtn)
  dropdown.appendChild(createRow)

  // Focus search box
  searchBox.focus()
}

// ---- Composer integration ----

const INJECT_MARKER = 'data-dsh-worktree-btn'
const GROUPING_BTN_MARKER = 'data-dsh-wt-grouping-btn'

/**
 * Workspace chip button aria-labels (zh/en). The chip is rendered by
 * WorkspaceChip in dsh-client-ui-conversation with aria-haspopup="menu"
 * and one of these labels, both stable across builds unlike CSS module
 * hash class names.
 */
const WORKSPACE_CHIP_LABELS = ['选择工作区', 'Choose workspace']

/**
 * Find the workspace chip button in the hero row. The chip carries
 * aria-haspopup="menu" and an aria-label matching one of the known
 * workspace-picker translations. Returns the button's nearest wrapper
 * (a span or div) so the Worktree button inserts beside the chip, not
 * inside it.
 */
function findWorkspaceWriteAnchor(): HTMLElement | null {
  for (const label of WORKSPACE_CHIP_LABELS) {
    const btn = document.querySelector<HTMLElement>(
      `button[aria-haspopup="menu"][aria-label="${label}"]`,
    )
    if (btn) return btn.closest('span') ?? btn
  }
  return null
}

/** Inject the "Worktree" button to the right of the Workspace Write button. */
function injectWorktreeButton(): void {
  if (document.querySelector(`[${INJECT_MARKER}]`)) return
  injectStyles()

  const anchor = findWorkspaceWriteAnchor()
  if (!anchor) return
  const parent = anchor.parentElement
  if (!parent) return

  const btn = el('button', {
    class: 'dsh-wt-inject-btn',
    [INJECT_MARKER]: 'true',
    text: 'Worktree',
  })
  btn.onclick = (e: MouseEvent) => {
    e.stopPropagation()
    if (activeDropdown) {
      closeDropdown()
    } else {
      void showWorktreeDropdown(btn)
    }
  }

  // Insert right after the Workspace Write button's wrapper span
  const next = anchor.nextSibling
  if (next) {
    parent.insertBefore(btn, next)
  } else {
    parent.appendChild(btn)
  }
}

/** 分组开关按钮的小分支图标 SVG。 */
const GROUPING_SVG = '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="4.2" cy="3.4" r="1.7" stroke="currentColor" stroke-width="1.2"/><circle cx="4.2" cy="12.6" r="1.7" stroke="currentColor" stroke-width="1.2"/><circle cx="11.8" cy="5" r="1.7" stroke="currentColor" stroke-width="1.2"/><path d="M4.2 5.1v5.8M11.8 6.7c0 2.9-3.4 2.6-5.9 3.1" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/></svg>'

/**
 * Inject the "group sessions by worktree" toggle into the sidebar's
 * 工作区 header row. The projection and session header badge only activate
 * while this toggle is on; otherwise the official default display is kept.
 */
function injectGroupingToggle(): void {
  if (document.querySelector(`[${GROUPING_BTN_MARKER}]`)) return
  // 找文本恰为「工作区」的最深元素（侧边栏标题）。
  let anchor: HTMLElement | null = null
  for (const node of document.querySelectorAll<HTMLElement>('span,div')) {
    if (node.childElementCount === 0 && node.textContent?.trim() === '工作区') {
      anchor = node
    }
  }
  if (anchor === null) return
  const parent = anchor.parentElement
  if (parent === null) return

  const btn = el('button', {
    class: 'dsh-wt-grouping-btn',
    [GROUPING_BTN_MARKER]: 'true',
    title: '按工作树分组会话（聚合到仓库行下并显示分支）',
    'aria-pressed': String(isGroupingEnabled()),
  })
  btn.innerHTML = GROUPING_SVG
  btn.classList.toggle('active', isGroupingEnabled())
  btn.onclick = (e: MouseEvent) => {
    e.stopPropagation()
    const next = !isGroupingEnabled()
    setGroupingEnabled(next)
    btn.classList.toggle('active', next)
    btn.setAttribute('aria-pressed', String(next))
  }
  parent.insertBefore(btn, anchor.nextSibling)
}

/** Set up a MutationObserver to inject the button when the composer row appears. */
function setupObserver(): void {
  injectWorktreeButton()
  injectGroupingToggle()

  const observer = new MutationObserver(() => {
    injectWorktreeButton()
    injectGroupingToggle()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Install the plugin: register the managed workspace sidebar (official client
 * proxy), then start the DOM observer for the task-start-window Worktree
 * button.
 */
export function apply(ctx: unknown): void {
  // 官方 Workspace Client 经代理上下文重放：拦截 sidebar.workspaces 注册，
  // 换成托管投影 Browser（聚合 + 分支徽标）。
  registerManagedWorkspaceSidebar(ctx as Parameters<typeof registerManagedWorkspaceSidebar>[0])
  // 捕获 workspace/session controller 服务（inject 列表保证已就绪），供
  // Worktree 下拉的 list/create/enter 使用；其 RPC 走 Connection 的 mux。
  workspacesService = (ctx as { get(name: string): unknown }).get('workspaces') as
    | DshWorkspacesService
    | undefined
  sessionsService = (ctx as { get(name: string): unknown }).get('sessions') as
    | DshSessionsService
    | undefined
  // 会话头部（聊天窗口）的 worktree 分支胶囊。
  registerSessionBranchBadge(ctx as Parameters<typeof registerSessionBranchBadge>[0])
  // Start the DOM observer for the task-start-window Worktree button.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver)
  } else {
    setupObserver()
  }
}
