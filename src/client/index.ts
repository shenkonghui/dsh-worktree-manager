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
`
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

// ---- workspace RPC helpers ----

/**
 * Check if a workspace exists for the given path.
 * Returns the workspace item if found, null otherwise.
 */
async function findWorkspace(path: string): Promise<WorkspaceItem | null> {
  const items = await listWorkspaces().catch(() => [] as WorkspaceItem[])
  return items.find(it => it.path === path) ?? null
}

/**
 * Create a workspace for the given path via workspace.create RPC.
 */
async function createWorkspace(path: string): Promise<void> {
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

/**
 * Ensure a workspace exists for the given path (create if missing),
 * then switch to it by clicking the corresponding sidebar item.
 */
async function ensureAndSwitchWorkspace(path: string): Promise<void> {
  // Check if workspace already exists
  let ws = await findWorkspace(path)
  // Create if missing
  if (!ws) {
    await createWorkspace(path)
    // Re-fetch to get the new workspace item
    ws = await findWorkspace(path)
  }
  if (!ws) return

  // Click the workspace in the sidebar to switch
  switchToWorkspaceInSidebar(ws)
}

/**
 * Find and click the workspace button in the dsh sidebar to switch to it.
 */
function switchToWorkspaceInSidebar(ws: WorkspaceItem): void {
  // dsh sidebar workspace buttons contain the workspace title as text
  const buttons = document.querySelectorAll<HTMLElement>('.pXSMma_workspace, [class*="workspace"]')
  for (const btn of buttons) {
    const text = (btn.textContent ?? '').trim()
    if (text === ws.title) {
      btn.click()
      return
    }
  }
  // Fallback: try by workspaceId or path in data attributes
  const all = document.querySelectorAll<HTMLElement>('[data-workspace-id], [data-path]')
  for (const el of all) {
    if (el.getAttribute('data-workspace-id') === ws.workspaceId || el.getAttribute('data-path') === ws.path) {
      el.click()
      return
    }
  }
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

  // 2. Detect current workspace path to decide which repo expands by default
  const wsItems = await listWorkspaces().catch(() => [] as WorkspaceItem[])
  const wsBtn = document.querySelector<HTMLElement>('.pXSMma_workspace')
  const currentName = (wsBtn?.textContent ?? '').trim()
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
