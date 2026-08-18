/**
 * Browser face of the dsh-worktree-manager plugin.
 *
 * Injects a "Git Worktree" button into the task start window's workspace
 * picker. Clicking it opens a dialog that lists existing git worktrees for
 * a repository, lets the user create new worktrees, and selects a worktree
 * for development by registering it as a dsh workspace and feeding the path
 * back into the workspace picker's directory browser.
 *
 * Communication with the host goes through the custom HTTP routes registered
 * by the host half at /plugins/dsh-worktree-manager/api/*.
 */

/** API base URL for worktree operations. */
const API_BASE = '/plugins/dsh-worktree-manager/api/'

/** Required services: none; runs in the browser at boot. */
export const inject: string[] = []

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

interface BranchesResponse {
  branches: string[]
  current?: string
}

// ---- API helpers ----

async function apiGet(action: string, params: Record<string, string>): Promise<unknown> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}${action}?${qs}`)
  const json = await res.json()
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json
}

async function apiPost(action: string, body: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${API_BASE}${action}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = await res.json()
  if (!res.ok) throw new Error((json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json
}

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
}`
  document.head.appendChild(style)
}

// ---- Current workspace detection ----

interface WorkspaceItem {
  workspaceId: string
  path: string
  title: string
}

/** Fetch all workspaces via the workspace.list RPC. */
async function listWorkspaces(): Promise<WorkspaceItem[]> {
  const res = await fetch('/api/workspace.list', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'workspace.list',
      payload: {},
    }),
  })
  const json = await res.json()
  return json?.result?.value?.items ?? []
}

/**
 * Detect the git repo path for the current context.
 * Strategy:
 *   1. Get the current workspace name from the composer's workspace label.
 *   2. Match it to a workspace path via workspace.list.
 *   3. Try that path as a git repo (the host will walk up if needed).
 *   4. If it fails, try every other workspace path until one works.
 *   5. Return null if no workspace is a git repo.
 */
async function detectGitRepoPath(): Promise<string | null> {
  const items = await listWorkspaces().catch(() => [] as WorkspaceItem[])
  if (items.length === 0) return null

  // Identify the current workspace by the composer label
  const wsBtn = document.querySelector<HTMLElement>('.pXSMma_workspace')
  const currentName = (wsBtn?.textContent ?? '').trim()

  // Sort: current workspace first, then others
  const sorted = [...items].sort((a, b) => {
    if (a.title === currentName) return -1
    if (b.title === currentName) return 1
    return 0
  })

  // Try each workspace path until one is a valid git repo
  for (const it of sorted) {
    try {
      const res = await fetch(
        `/plugins/dsh-worktree-manager/api/list?repoPath=${encodeURIComponent(it.path)}`,
      )
      if (res.ok) return it.path
    } catch {
      // continue to next
    }
  }
  return null
}

// ---- workspace RPC helpers ----

/**
 * Ensure a workspace exists for the given path.
 * If the path is already registered as a workspace, do nothing.
 * Otherwise, create it via workspace.create RPC.
 */
async function ensureWorkspaceForWorktree(path: string): Promise<void> {
  // Check if the path is already a workspace
  const items = await listWorkspaces().catch(() => [] as WorkspaceItem[])
  const exists = items.some(it => it.path === path)
  if (exists) return

  // Create new workspace
  const res = await fetch('/api/workspace.create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: 'workspace.create',
      payload: { path },
    }),
  })
  const json = await res.json()
  if (!res.ok) throw new Error(json?.result?.error?.message ?? `HTTP ${res.status}`)
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
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '正在检测 git 仓库…' }))

  // 1. Detect git repo path from current workspace (or any workspace)
  const wsPath = await detectGitRepoPath()
  if (!wsPath) {
    dropdown.innerHTML = ''
    dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: '当前所有工作区均不是 git 仓库' }))
    return
  }

  // 2. Load worktrees for the detected git repo
  dropdown.innerHTML = ''
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '正在加载 worktree 列表…' }))

  let worktrees: WorktreeInfo[] = []
  let branches: string[] = []
  let currentBranch = ''
  try {
    const [listRes, branchesRes] = await Promise.all([
      apiGet('list', { repoPath: wsPath }) as Promise<ListResponse>,
      apiPost('branches', { repoPath: wsPath }) as Promise<BranchesResponse>,
    ])
    worktrees = listRes.worktrees
    branches = branchesRes.branches
    currentBranch = branchesRes.current ?? ''
  } catch (err) {
    dropdown.innerHTML = ''
    const msg = err instanceof Error ? err.message : String(err)
    dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: msg }))
    return
  }

  // 3. Render worktree list with search filter
  dropdown.innerHTML = ''

  // Helper: extract basename from a path
  const basename = (p: string): string => {
    const parts = p.replace(/\/+$/, '').split('/')
    return parts[parts.length - 1] || p
  }

  const headerText = worktrees.length > 0
    ? `当前仓库: ${basename(wsPath)} (${worktrees.length} 个 worktree)`
    : `当前仓库: ${basename(wsPath)} (无 worktree)`
  dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-header', text: headerText }))

  // Search input
  const searchBox = el('input', {
    class: 'dsh-wt-dropdown-input',
    placeholder: '筛选 worktree…',
    style: 'width:100%;box-sizing:border-box;margin:0;border:0;border-bottom:1px solid var(--dsh-border, rgba(0,0,0,0.06));border-radius:0;padding:8px 12px;',
  })
  dropdown.appendChild(searchBox)

  // List container
  const listContainer = el('div')
  dropdown.appendChild(listContainer)

  function renderList(filter: string): void {
    listContainer.innerHTML = ''
    const lower = filter.toLowerCase()
    const filtered = worktrees.filter(wt => {
      if (!filter) return true
      const name = basename(wt.path).toLowerCase()
      const branch = (wt.branch ?? '').toLowerCase()
      return name.includes(lower) || branch.includes(lower) || wt.path.toLowerCase().includes(lower)
    })

    if (filtered.length === 0) {
      listContainer.appendChild(el('div', { class: 'dsh-wt-dropdown-loading', text: '无匹配 worktree' }))
      return
    }

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
          await ensureWorkspaceForWorktree(wt.path)
          closeDropdown()
        } catch (err) {
          item.removeAttribute('disabled')
          const msg = err instanceof Error ? err.message : String(err)
          dropdown.appendChild(el('div', { class: 'dsh-wt-dropdown-error', text: msg }))
        }
      }
      listContainer.appendChild(item)
    }
  }

  searchBox.oninput = () => renderList(searchBox.value)
  searchBox.onclick = (e: MouseEvent) => e.stopPropagation()
  renderList('')

  // 4. Create-new-worktree row
  const createRow = el('div', { class: 'dsh-wt-dropdown-create' })
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
    createBtn.setAttribute('disabled', 'disabled')
    try {
      const result = await apiPost('create', {
        repoPath: wsPath,
        branch,
        newBranch: true,
      }) as CreateResponse
      await ensureWorkspaceForWorktree(result.worktree.path)
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

/** Find the Workspace Write trigger button's parent span in the composer. */
function findWorkspaceWriteAnchor(): HTMLElement | null {
  const trigger = document.querySelector<HTMLElement>('.Sh0Q9G_trigger')
  if (!trigger) return null
  // The trigger is wrapped in a span._root_19372_1; insert after that span
  const span = trigger.closest('span')
  return span ?? trigger
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

/** Set up a MutationObserver to inject the button when the composer row appears. */
function setupObserver(): void {
  injectWorktreeButton()

  const observer = new MutationObserver(() => {
    injectWorktreeButton()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/** Install the plugin. */
export function apply(): void {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver)
  } else {
    setupObserver()
  }
}
