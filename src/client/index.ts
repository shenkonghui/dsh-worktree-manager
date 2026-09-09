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
 * 2. **视图选项菜单项** (DOM injection): a MutationObserver injects the
 *    "按工作树" grouping toggle into the official sidebar 视图选项 dropdown's
 *    分组方式 group, so the projection switch lives with the official view
 *    options instead of a standalone button.
 *
 * Communication with the host goes through the custom HTTP routes registered
 * by the host half at /plugins/dsh-worktree-manager/api/*.
 */

import { inject as officialWorkspaceInject } from 'virtual:dsh-official-workspace-client'
import { registerManagedWorkspaceSidebar } from './workspace-sidebar/index.js'
import { registerSessionBranchBadge } from './session-branch-badge.js'
import { isGroupingEnabled, setGroupingEnabled } from './api.js'

// ---- Minimal ClientContext type (no dsh build-time dependency) ----
// The real ClientContext is merged at runtime by the dsh client runtime; this
// local declaration carries only what this plugin's apply touches.

/**
 * Services required for the official Workspace Client re-apply (its inject
 * list); the DOM-injection surface uses none of them directly.
 */
export const inject = [...officialWorkspaceInject as string[]] as const

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
`
  document.head.appendChild(style)
}

// ---- 视图选项注入 ----

const VIEW_OPTION_ITEM_MARKER = 'data-dsh-wt-viewoption-item'

/** 官方「视图选项」菜单中「分组方式」一组的标题文案（zh/en）。 */
const GROUP_BY_LABELS = ['分组方式', 'Group by']

/** 「按工作树」菜单项文案：与所在菜单的语言保持一致。 */
const WORKTREE_OPTION_LABEL: Record<string, string> = {
  '分组方式': '按工作树',
  'Group by': 'By worktree',
}

/**
 * 把「按工作树」开关注入官方侧边栏「视图选项」下拉菜单：插入「分组方式」
 * 一组的末尾（按工作区／单列表 之后），选中时显示官方菜单项的勾选图标。
 *
 * 菜单每次打开都由 React 重建并以 portal 挂到 body，故每次出现后注入一次
 * （以 marker 去重）。样式与选中态直接复用官方既有菜单行（克隆一行并改
 * 文案、按需补勾选 svg），因此无需知道 CSS Module 的 hash 类名即可与官方
 * 外观一致。
 */
function injectViewOptionsGroupingItem(): void {
  for (const menu of document.querySelectorAll<HTMLElement>('div[role="menu"]')) {
    if (menu.querySelector(`[${VIEW_OPTION_ITEM_MARKER}]`) !== null) continue
    const viewport = menu.firstElementChild
    if (viewport === null) continue
    const rows = [...viewport.children] as HTMLElement[]
    const labelIndex = rows.findIndex(row => GROUP_BY_LABELS.includes(row.textContent?.trim() ?? ''))
    if (labelIndex === -1) continue
    // 「分组方式」标题之后连续的菜单行同属该组；插入到该组最后一行之后。
    let last = labelIndex
    while (last + 1 < rows.length && rows[last + 1].querySelector('button[role="menuitem"]') !== null) last += 1
    if (last === labelIndex) continue

    const source = rows[last]
    const item = source.cloneNode(true) as HTMLElement
    const button = item.querySelector<HTMLElement>('button')
    if (button === null) continue
    item.setAttribute(VIEW_OPTION_ITEM_MARKER, 'true')

    const labelText = (rows[labelIndex].textContent ?? '').trim()
    const labelEl = button.querySelector('span')
    if (labelEl !== null) labelEl.textContent = WORKTREE_OPTION_LABEL[labelText] ?? '按工作树'
    button.title = '按工作树聚合会话：隐藏 worktree 独立行，把会话聚合到仓库主行并显示分支'

    // 官方菜单项以末尾的勾选 svg 表示选中，并带一个 selected 类名；
    // 从当前菜单里各取一个选中/未选中行的类名作为切换模板。
    const items = [...menu.querySelectorAll<HTMLElement>('button[role="menuitem"]')]
    const selectedItem = items.find(candidate => candidate.querySelector('svg') !== null)
    const plainItem = items.find(candidate => candidate.querySelector('svg') === null)
    const baseClass = plainItem?.className ?? button.className
    let check = button.querySelector<SVGElement>('svg')
    if (check === null && selectedItem !== undefined) {
      const svg = [...selectedItem.querySelectorAll('svg')].pop()
      if (svg !== undefined) {
        check = svg.cloneNode(true) as SVGElement
        button.appendChild(check)
      }
    }

    const applyState = (on: boolean): void => {
      button.className = on && selectedItem !== undefined ? selectedItem.className : baseClass
      if (check !== null) check.style.display = on ? '' : 'none'
    }
    applyState(isGroupingEnabled())

    button.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      const next = !isGroupingEnabled()
      setGroupingEnabled(next)
      applyState(next)
      // 交回 React 收起菜单：官方 Menu 在 document 上监听 Escape。
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    source.insertAdjacentElement('afterend', item)
  }
}

/** 用 MutationObserver 在官方视图选项菜单每次出现时注入「按工作树」项。 */
function setupObserver(): void {
  injectViewOptionsGroupingItem()

  const observer = new MutationObserver(() => {
    injectViewOptionsGroupingItem()
  })
  observer.observe(document.body, { childList: true, subtree: true })
}

/**
 * Install the plugin: register the managed workspace sidebar (official client
 * proxy), then start the DOM observer for the 视图选项 menu item.
 */
export function apply(ctx: unknown): void {
  // 官方 Workspace Client 经代理上下文重放：拦截 sidebar.workspaces 注册，
  // 换成托管投影 Browser（聚合 + 分支徽标）。
  registerManagedWorkspaceSidebar(ctx as Parameters<typeof registerManagedWorkspaceSidebar>[0])
  // 会话头部（聊天窗口）的 worktree 分支胶囊。
  registerSessionBranchBadge(ctx as Parameters<typeof registerSessionBranchBadge>[0])
  // Start the DOM observer for the 视图选项 menu item.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver)
  } else {
    setupObserver()
  }
}
