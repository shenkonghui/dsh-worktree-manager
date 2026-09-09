/**
 * 官方 Workspace Client 的构建期门控与派生（移植自 dsh-git-worktree 的
 * workspace-sidebar-upstream.mjs，按本项目语义改造）。
 *
 * 读取已发布的 `@deepseek-ai/dsh-client-ui-workspace/client`（loader 格式
 * bundle），版本 + SHA-256 双重门控（fail-closed：上游升级必须显式换Pin），
 * 然后用精确唯一的字符串 seam 注入：
 *
 * 1. 分支徽标：会话行/搜索行/hover 中渲染所属 worktree 的分支名
 *    （`__dshWorktreeManager` 元数据）；
 * 2. workspace 行分支徽标：group 行渲染 `__dshWorktreeManagerBranch`；
 * 3. 托管会话行禁用拖拽、过滤 fork 菜单（避免把聚合会话拖出/复制出仓库组）。
 *
 * 最后把官方 ModuleLoader factory 函数体提取出来，包成一个可被 esbuild
 * 内联的 virtual module，仅导出官方的 `apply` / `inject`。
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

export const WORKSPACE_UI_VERSION = '0.1.2-rc.1'
export const WORKSPACE_CLIENT_SHA256 = '53c40660195c42cde709b802e239f473dd721f45bc329684af31c01fdb73282a'
export const OFFICIAL_WORKSPACE_VIRTUAL_ID = 'virtual:dsh-official-workspace-client'
export const RESOLVED_OFFICIAL_WORKSPACE_VIRTUAL_ID = `\0${OFFICIAL_WORKSPACE_VIRTUAL_ID}`

export function readOfficialWorkspaceClient() {
  const require = createRequire(import.meta.url)
  const packagePath = require.resolve('@deepseek-ai/dsh-client-ui-workspace/package.json')
  const packageJson = JSON.parse(readFileSync(packagePath, 'utf8'))
  if (packageJson.version !== WORKSPACE_UI_VERSION) {
    throw new Error(`Unsupported @deepseek-ai/dsh-client-ui-workspace ${packageJson.version}; expected ${WORKSPACE_UI_VERSION}`)
  }
  const clientPath = require.resolve('@deepseek-ai/dsh-client-ui-workspace/client')
  const source = readFileSync(clientPath, 'utf8')
  const digest = createHash('sha256').update(source).digest('hex')
  if (digest !== WORKSPACE_CLIENT_SHA256) {
    throw new Error(`Official Workspace Client hash drifted: ${digest}; expected ${WORKSPACE_CLIENT_SHA256}`)
  }
  return { source, clientPath }
}

/** Replace exactly one occurrence; fail closed when the seam is missing or duplicated. */
function replaceExactlyOnce(source, needle, replacement, label) {
  const first = source.indexOf(needle)
  const last = source.lastIndexOf(needle)
  if (first < 0 || first !== last) {
    throw new Error(`Unable to derive official Workspace Client ${label}: expected one stable source seam`)
  }
  return source.slice(0, first) + replacement + source.slice(first + needle.length)
}

/**
 * Add package-owned branch decorations to the version/hash-gated official
 * Browser. Every replacement is exact and therefore fails closed if the
 * upstream generated structure changes.
 */
export function decorateOfficialWorkspaceClient(source) {
  let derived = source
  // ---- Locale keys used by the decorations' aria labels ----
  derived = replaceExactlyOnce(derived,
    '\t\tconst zh = {',
    `\t\tconst zh = {\n\t\t\t"dshWorktreeManager.workspace": "Worktree",`,
    'Chinese Worktree locale')
  derived = replaceExactlyOnce(derived,
    '\t\tconst en = {',
    `\t\tconst en = {\n\t\t\t"dshWorktreeManager.workspace": "Worktree",`,
    'English Worktree locale')

  // ---- Workspace group carries the branch label down to the group row ----
  derived = replaceExactlyOnce(derived,
    '\t\t\t\tgroups.push(buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account"));',
    '\t\t\t\tconst group = buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account");\n\t\t\t\tif (workspace.__dshWorktreeManagerBranch !== void 0) group.__dshWorktreeManagerBranch = workspace.__dshWorktreeManagerBranch;\n\t\t\t\tgroups.push(group);',
    'Managed workspace metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\tlabel: g.label,\n\t\t\t\t\tsessionCount: g.sessions.length,',
    '\t\t\t\t\tlabel: g.label,\n\t\t\t\t\t...g.__dshWorktreeManagerBranch === void 0 ? {} : { __dshWorktreeManagerBranch: g.__dshWorktreeManagerBranch },\n\t\t\t\t\tsessionCount: g.sessions.length,',
    'Managed workspace group metadata')

  // ---- Session node metadata passthrough (list + search) ----
  derived = replaceExactlyOnce(derived,
    '\t\t\t\tupdatedAt: s.updatedAt,\n\t\t\t\t...pendingInteraction === void 0 ? {} : { pendingInteraction }',
    '\t\t\t\tupdatedAt: s.updatedAt,\n\t\t\t\t...s.__dshWorktreeManager === void 0 ? {} : { __dshWorktreeManager: s.__dshWorktreeManager },\n\t\t\t\t...pendingInteraction === void 0 ? {} : { pendingInteraction }',
    'session node metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\trunningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,\n\t\t\t\t\t\t...pendingInteraction === void 0 ? {} : { pendingInteraction },',
    '\t\t\t\t\t\trunningSubagentCount: descendants.get(summary.id)?.runningCount ?? 0,\n\t\t\t\t\t\t...summary.__dshWorktreeManager === void 0 ? {} : { __dshWorktreeManager: summary.__dshWorktreeManager },\n\t\t\t\t\t\t...pendingInteraction === void 0 ? {} : { pendingInteraction },',
    'search result metadata')

  // ---- Shared decoration helper + badge identity component ----
  derived = replaceExactlyOnce(derived,
    '\t\t/** Hover-card body: full title, relative time, and every relevant live status. */\n\t\tfunction SessionHoverContent',
    `\t\tfunction managedWorktreeDecoration(node, t) {\n\t\t\tconst value = node.__dshWorktreeManager;\n\t\t\tif (value === void 0 || typeof value.branch !== "string" || value.branch.length === 0) return void 0;\n\t\t\treturn {\n\t\t\t\tbranch: value.branch,\n\t\t\t\tariaLabel: \`\${t("dshWorktreeManager.workspace")}, \${value.branch}, \${displayTitle(node, t)}\`\n\t\t\t};\n\t\t}\n\t\tfunction ManagedWorktreeIdentity({ decoration }) {\n\t\t\treturn (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\tclassName: "dsh-worktree-manager-sidebar-icon",\n\t\t\t\t"data-worktree-branch": decoration.branch,\n\t\t\t\ttitle: decoration.branch,\n\t\t\t\t"aria-hidden": "true",\n\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})\n\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\tclassName: "dsh-worktree-manager-sidebar-badge",\n\t\t\t\t"data-worktree-branch": decoration.branch,\n\t\t\t\ttitle: decoration.branch,\n\t\t\t\t"aria-hidden": "true",\n\t\t\t\tchildren: decoration.branch\n\t\t\t})] });\n\t\t}\n\t\t/** Hover-card body: full title, relative time, and every relevant live status. */\n\t\tfunction SessionHoverContent`,
    'Managed row helper')

  // ---- Hover card ----
  derived = replaceExactlyOnce(derived,
    '\t\t\tconst statuses = sessionStatuses(node, t);\n\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: Rows_module_css_default.hoverContent,',
    '\t\t\tconst statuses = sessionStatuses(node, t);\n\t\t\tconst worktreeDecoration = managedWorktreeDecoration(node, t);\n\t\t\treturn (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\tclassName: Rows_module_css_default.hoverContent,',
    'hover metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\tchildren: displayTitle(node, t)\n\t\t\t\t\t}),\n\t\t\t\t\t!node.blank',
    '\t\t\t\t\t\tchildren: displayTitle(node, t)\n\t\t\t\t\t}),\n\t\t\t\t\tworktreeDecoration !== void 0 && (0, react_jsx_runtime.jsxs)("div", {\n\t\t\t\t\t\tclassName: Rows_module_css_default.hoverStatus,\n\t\t\t\t\t\tchildren: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {}), (0, react_jsx_runtime.jsx)("span", { children: worktreeDecoration.branch })]\n\t\t\t\t\t}),\n\t\t\t\t\t!node.blank',
    'hover Worktree identity')

  // ---- Search rows ----
  derived = replaceExactlyOnce(derived,
    '\t\t\tconst primaryStatus = statuses[0];\n\t\t\treturn (0, react_jsx_runtime.jsxs)("button", {\n\t\t\t\ttype: "button",\n\t\t\t\tclassName: clsx(Rows_module_css_default.searchResultRow, selected && Rows_module_css_default.selected),',
    '\t\t\tconst primaryStatus = statuses[0];\n\t\t\tconst worktreeDecoration = managedWorktreeDecoration(result, t);\n\t\t\treturn (0, react_jsx_runtime.jsxs)("button", {\n\t\t\t\ttype: "button",\n\t\t\t\tclassName: clsx(Rows_module_css_default.searchResultRow, selected && Rows_module_css_default.selected),\n\t\t\t\t...worktreeDecoration === void 0 ? {} : { "aria-label": worktreeDecoration.ariaLabel, "data-managed-worktree": "true" },',
    'search Worktree identity')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\t\tchildren: (primaryStatus.state !== "done" || result.completed) && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })\n\t\t\t\t\t\t}),\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.searchResultTitle,',
    '\t\t\t\t\t\t\tchildren: (primaryStatus.state !== "done" || result.completed) && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })\n\t\t\t\t\t\t}),\n\t\t\t\t\t\tworktreeDecoration !== void 0 && (0, react_jsx_runtime.jsx)(ManagedWorktreeIdentity, { decoration: worktreeDecoration }),\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.searchResultTitle,',
    'search Worktree decoration')

  // ---- Workspace row: branch badge next to the workspace title ----
  derived = replaceExactlyOnce(derived,
    '\t\t\tconst label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;\n\t\t\tconst active = group.expanded && group.containsCurrent;',
    '\t\t\tconst label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;\n\t\t\tconst worktreeBranchDecoration = row.__dshWorktreeManagerBranch;\n\t\t\tconst active = group.expanded && group.containsCurrent;',
    'Managed workspace row metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: Rows_module_css_default.projectText,\n\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.title,\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t})\n\t\t\t\t\t}),',
    '\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: Rows_module_css_default.projectText,\n\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.title,\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t})\n\t\t\t\t\t}),\n\t\t\t\t\tworktreeBranchDecoration !== void 0 && (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: "dsh-worktree-manager-sidebar-badge",\n\t\t\t\t\t\t"data-worktree-branch": worktreeBranchDecoration,\n\t\t\t\t\t\ttitle: worktreeBranchDecoration,\n\t\t\t\t\t\t"aria-hidden": "true",\n\t\t\t\t\t\tchildren: worktreeBranchDecoration\n\t\t\t\t\t}),',
    'Managed workspace branch badge')

  // ---- Session rows: decoration capture, fork guard, aria, drag, badge ----
  derived = replaceExactlyOnce(derived,
    '\t\t\tconst showStatus = statuses[0].state !== "done" || row.completed;\n\t\t\tconst [menuOpen, setMenuOpen]',
    '\t\t\tconst showStatus = statuses[0].state !== "done" || row.completed;\n\t\t\tconst worktreeDecoration = managedWorktreeDecoration(row, t);\n\t\t\tconst [menuOpen, setMenuOpen]',
    'session Worktree metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t];\n\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {',
    '\t\t\t];\n\t\t\tconst visibleSessionMenuItems = worktreeDecoration === void 0 ? sessionMenuItems : sessionMenuItems.filter((item) => item.id !== "fork");\n\t\t\treturn (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.HoverCard, {',
    'Managed session menu')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\tclassName: clsx(Rows_module_css_default.sessionRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen, flat && !showStatus && Rows_module_css_default.flatSessionRowWithoutStatus, drag?.marker === "before" && Rows_module_css_default.dropBefore, drag?.marker === "after" && Rows_module_css_default.dropAfter),\n\t\t\t\t\trole: "treeitem",',
    '\t\t\t\t\tclassName: clsx(Rows_module_css_default.sessionRow, selected && Rows_module_css_default.selected, menuOpen && Rows_module_css_default.menuOpen, flat && !showStatus && Rows_module_css_default.flatSessionRowWithoutStatus, drag?.marker === "before" && Rows_module_css_default.dropBefore, drag?.marker === "after" && Rows_module_css_default.dropAfter),\n\t\t\t\t\trole: "treeitem",\n\t\t\t\t\t...worktreeDecoration === void 0 ? {} : { "aria-label": worktreeDecoration.ariaLabel, "data-managed-worktree": "true" },',
    'session Worktree aria')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t"aria-selected": selected,\n\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\tonOpen(node.id);\n\t\t\t\t\t},\n\t\t\t\t\tdraggable: drag !== void 0,',
    '\t\t\t\t\t"aria-selected": selected,\n\t\t\t\t\tonClick: () => {\n\t\t\t\t\t\tonOpen(node.id);\n\t\t\t\t\t},\n\t\t\t\t\tdraggable: worktreeDecoration === void 0 && drag !== void 0,',
    'Managed session drag')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\t(!flat || showStatus) && (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.slot,\n\t\t\t\t\t\t\tchildren: showStatus && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })\n\t\t\t\t\t\t}),\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {',
    '\t\t\t\t\t\t(!flat || showStatus) && (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.slot,\n\t\t\t\t\t\t\tchildren: showStatus && (0, react_jsx_runtime.jsx)(SessionStatusDots, { statuses })\n\t\t\t\t\t\t}),\n\t\t\t\t\t\tworktreeDecoration !== void 0 && (0, react_jsx_runtime.jsx)(ManagedWorktreeIdentity, { decoration: worktreeDecoration }),\n\t\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {',
    'session Worktree decoration')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\t\t\titems: sessionMenuItems,',
    '\t\t\t\t\t\t\t\titems: visibleSessionMenuItems,',
    'Managed session visible menu')
  return derived
}

export function materializeOfficialWorkspaceClientModule() {
  const official = readOfficialWorkspaceClient()
  const source = decorateOfficialWorkspaceClient(official.source)
  const factoryToken = 'factory: (require) => {'
  const start = source.indexOf(factoryToken)
  const end = source.lastIndexOf('\n\t}\n});')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('Unable to extract the official Workspace Client ModuleLoader factory')
  }
  const body = source.slice(start + factoryToken.length, end)
  return `
import * as cordis from '@deepseek-ai/cordis'
import * as store from '@deepseek-ai/dsh-client-store'
import * as jsxRuntime from 'react/jsx-runtime'
import * as react from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
const modules = {
  '@deepseek-ai/cordis': cordis,
  '@deepseek-ai/dsh-client-store': store,
  'react/jsx-runtime': jsxRuntime,
  'react': react,
  '@deepseek-ai/dsh-client-ui-primitives': primitives,
}
const official = ((require) => {${body}
})(specifier => {
  const value = modules[specifier]
  if (value === undefined) throw new Error('Unsupported official Workspace Client require: ' + specifier)
  return value
})
export const apply = official.apply
export const inject = official.inject
`
}
