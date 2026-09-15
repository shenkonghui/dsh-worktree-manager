/**
 * 官方 Workspace Client 的构建期门控与派生（移植自 dsh-git-worktree 的
 * workspace-sidebar-upstream.mjs，按本项目语义改造）。
 *
 * 读取已发布的 `@deepseek-ai/dsh-client-ui-workspace/client`（loader 格式
 * bundle），版本 + SHA-256 双重门控（fail-closed：上游升级必须显式换Pin），
 * 然后用精确唯一的字符串 seam 注入：
 *
 * 1. 嵌套层级：worktree group section 渲染 `__dshWorktreeManagerNested`
 *    缩进 class，使其成为所属仓库主行下的一个层级；
 * 2. 分支徽标：workspace 行渲染 `__dshWorktreeManagerBranch`；搜索行与
 *    hover 卡片渲染会话级 `__dshWorktreeManager` 分支名（会话树行不渲染，
 *    标题独占整行宽度，分支由所属 worktree 行徽标承担）；linked worktree
 *    行再按 `__dshWorktreeManagerMerged` 追加 `dsh-worktree-manager-merged`
 *    修饰类，把已合并到基准分支的分支徽标染绿；
 * 3. 托管会话行禁用拖拽、过滤 fork 菜单。
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
    '\t\t\t\tconst group = buildGroup(workspace.workspaceId, workspace.workspaceId, workspace.path, Date.parse(workspace.createdAt), workspace.title, members, "account");\n\t\t\t\tif (workspace.__dshWorktreeManagerBranch !== void 0) group.__dshWorktreeManagerBranch = workspace.__dshWorktreeManagerBranch;\n\t\t\t\tif (workspace.__dshWorktreeManagerMerged !== void 0) group.__dshWorktreeManagerMerged = workspace.__dshWorktreeManagerMerged;\n\t\t\t\tif (workspace.__dshWorktreeManagerMergeLabel !== void 0) group.__dshWorktreeManagerMergeLabel = workspace.__dshWorktreeManagerMergeLabel;\n\t\t\t\tif (workspace.__dshWorktreeManagerNested === true) group.__dshWorktreeManagerNested = true;\n\t\t\t\tif (workspace.__dshWorktreeManagerParent !== void 0) group.__dshWorktreeManagerParent = workspace.__dshWorktreeManagerParent;\n\t\t\t\tif (workspace.__dshWorktreeManagerVirtual === true) { group.__dshWorktreeManagerVirtual = true; group.__dshWorktreeManagerHost = workspace.__dshWorktreeManagerHost; }\n\t\t\t\tgroups.push(group);',
    'Managed workspace metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\tlabel: g.label,\n\t\t\t\t\tsessionCount: g.sessions.length,',
    '\t\t\t\t\tlabel: g.label,\n\t\t\t\t\t...g.__dshWorktreeManagerBranch === void 0 ? {} : { __dshWorktreeManagerBranch: g.__dshWorktreeManagerBranch },\n\t\t\t\t\t...g.__dshWorktreeManagerMerged === void 0 ? {} : { __dshWorktreeManagerMerged: g.__dshWorktreeManagerMerged },\n\t\t\t\t\t...g.__dshWorktreeManagerMergeLabel === void 0 ? {} : { __dshWorktreeManagerMergeLabel: g.__dshWorktreeManagerMergeLabel },\n\t\t\t\t\t...g.__dshWorktreeManagerNested === true ? { __dshWorktreeManagerNested: true } : {},\n\t\t\t\t\t...g.__dshWorktreeManagerParent === void 0 ? {} : { __dshWorktreeManagerParent: g.__dshWorktreeManagerParent },\n\t\t\t\t\t...g.__dshWorktreeManagerVirtual === true ? { __dshWorktreeManagerVirtual: true, __dshWorktreeManagerHost: g.__dshWorktreeManagerHost, workspaceId: void 0 } : {},\n\t\t\t\t\tsessionCount: g.sessions.length,',
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
    `\t\tfunction managedWorktreeDecoration(node, t) {\n\t\t\tconst value = node.__dshWorktreeManager;\n\t\t\tif (value === void 0 || typeof value.branch !== "string" || value.branch.length === 0) return void 0;\n\t\t\treturn {\n\t\t\t\tbranch: value.branch,\n\t\t\t\tariaLabel: \`\${t("dshWorktreeManager.workspace")}, \${value.branch}, \${displayTitle(node, t)}\`\n\t\t\t};\n\t\t}\n\t\tfunction ManagedWorktreeIdentity({ decoration }) {\n\t\t\tconst merged = decoration.merged === true;\n\t\t\tconst title = decoration.mergeLabel !== void 0 ? decoration.mergeLabel : decoration.branch;\n\t\t\treturn (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\tclassName: clsx("dsh-worktree-manager-sidebar-icon", merged && "dsh-worktree-manager-merged"),\n\t\t\t\t"data-worktree-branch": decoration.branch,\n\t\t\t\t"data-worktree-merged": merged ? "true" : "false",\n\t\t\t\ttitle,\n\t\t\t\t"aria-hidden": "true",\n\t\t\t\tchildren: (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconBranchOutline16, {})\n\t\t\t}), (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\tclassName: clsx("dsh-worktree-manager-sidebar-badge", merged && "dsh-worktree-manager-merged"),\n\t\t\t\t"data-worktree-branch": decoration.branch,\n\t\t\t\t"data-worktree-merged": merged ? "true" : "false",\n\t\t\t\ttitle,\n\t\t\t\t"aria-hidden": "true",\n\t\t\t\tchildren: decoration.branch\n\t\t\t})] });\n\t\t}\n\t\t/** Hover-card body: full title, relative time, and every relevant live status. */\n\t\tfunction SessionHoverContent`,
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

  // ---- Workspace row: nested worktree rows render the label as a branch
  //      identity (icon + pill); top-level rows keep title + trailing badge ----
  derived = replaceExactlyOnce(derived,
    '\t\t\tconst label = row.workspaceId === void 0 ? t("group.ungrouped") : row.label;\n\t\t\tconst active = group.expanded && group.containsCurrent;',
    '\t\t\tconst label = row.__dshWorktreeManagerVirtual === true || row.workspaceId !== void 0 ? row.label : t("group.ungrouped");\n\t\t\tconst worktreeBranchDecoration = row.__dshWorktreeManagerBranch;\n\t\t\tconst worktreeMerged = row.__dshWorktreeManagerMerged === true;\n\t\t\tconst worktreeMergeLabel = row.__dshWorktreeManagerMergeLabel;\n\t\t\tconst worktreeNested = row.__dshWorktreeManagerNested === true;\n\t\t\tconst active = group.expanded && group.containsCurrent;',
    'Managed workspace row metadata')
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t(0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: Rows_module_css_default.projectText,\n\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.title,\n\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t})\n\t\t\t\t\t}),',
    '\t\t\t\t\tworktreeNested && worktreeBranchDecoration !== void 0\n\t\t\t\t\t\t? (0, react_jsx_runtime.jsx)(ManagedWorktreeIdentity, { decoration: {\n\t\t\t\t\t\t\tbranch: worktreeBranchDecoration,\n\t\t\t\t\t\t\tmerged: worktreeMerged,\n\t\t\t\t\t\t\tmergeLabel: worktreeMergeLabel,\n\t\t\t\t\t\t\tariaLabel: worktreeBranchDecoration\n\t\t\t\t\t\t} })\n\t\t\t\t\t\t: (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\tclassName: Rows_module_css_default.projectText,\n\t\t\t\t\t\t\tchildren: (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\t\t\tclassName: Rows_module_css_default.title,\n\t\t\t\t\t\t\t\tchildren: label\n\t\t\t\t\t\t\t})\n\t\t\t\t\t\t}),\n\t\t\t\t\tworktreeBranchDecoration !== void 0 && !worktreeNested && (0, react_jsx_runtime.jsx)("span", {\n\t\t\t\t\t\tclassName: clsx("dsh-worktree-manager-sidebar-badge", worktreeMerged && "dsh-worktree-manager-merged"),\n\t\t\t\t\t\t"data-worktree-branch": worktreeBranchDecoration,\n\t\t\t\t\t\t"data-worktree-merged": worktreeMerged ? "true" : "false",\n\t\t\t\t\t\ttitle: worktreeMergeLabel !== void 0 ? worktreeMergeLabel : worktreeBranchDecoration,\n\t\t\t\t\t\t"aria-hidden": "true",\n\t\t\t\t\t\tchildren: worktreeBranchDecoration\n\t\t\t\t\t}),',
    'Managed workspace branch badge')

  // ---- Virtual main-worktree row: "+" creates in the real host workspace ----
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\t\t\t\t\tonCreate: () => {\n\t\t\t\t\t\t\t\t\t\t\tif (group.workspaceId !== void 0) {\n\t\t\t\t\t\t\t\t\t\t\t\tsetGroupExpanded(group.key, true);\n\t\t\t\t\t\t\t\t\t\t\t\tstartSession(group.workspaceId);\n\t\t\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t\t\t},',
    '\t\t\t\t\t\t\t\t\t\tonCreate: () => {\n\t\t\t\t\t\t\t\t\t\t\tconst createTarget = group.__dshWorktreeManagerHost ?? group.workspaceId;\n\t\t\t\t\t\t\t\t\t\t\tif (createTarget !== void 0) {\n\t\t\t\t\t\t\t\t\t\t\t\tsetGroupExpanded(group.key, true);\n\t\t\t\t\t\t\t\t\t\t\t\tstartSession(createTarget);\n\t\t\t\t\t\t\t\t\t\t\t}\n\t\t\t\t\t\t\t\t\t\t},',
    'virtual Worktree row create')

  // ---- Nested rows follow the parent's collapse: hidden while it is
  //      collapsed, and expanding the current session's nested group also
  //      expands its parent so the row stays reachable ----
  derived = replaceExactlyOnce(derived,
    '}), groups.map((group) => {',
    '}), groups.filter((group) => group.__dshWorktreeManagerParent === void 0 || expandedGroups.includes(group.__dshWorktreeManagerParent)).map((group) => {',
    'nested Worktree collapse filter')
  derived = replaceExactlyOnce(derived,
    '\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;\n\t\t\t\tsetGroupExpanded(currentGroup, true);\n\t\t\t}, [',
    '\t\t\t(0, react.useEffect)(() => {\n\t\t\t\tif (current === void 0 || currentGroup === void 0 || Object.hasOwn(groupExpansion, currentGroup)) return;\n\t\t\t\tsetGroupExpanded(currentGroup, true);\n\t\t\t\tconst parentKey = workspaces.find((w) => w.workspaceId === currentGroup)?.__dshWorktreeManagerParent;\n\t\t\t\tif (parentKey !== void 0 && !Object.hasOwn(groupExpansion, parentKey)) setGroupExpanded(parentKey, true);\n\t\t\t}, [',
    'nested Worktree parent auto-expand')

  // ---- Nested worktree group: indent the whole section one level ----
  derived = replaceExactlyOnce(derived,
    '\t\t\t\t\t\t\t\tclassName: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter),',
    '\t\t\t\t\t\t\t\tclassName: clsx(WorkspaceBrowser_module_css_default.groupSection, workspaceMarker === "before" && WorkspaceBrowser_module_css_default.workspaceDropBefore, workspaceMarker === "after" && WorkspaceBrowser_module_css_default.workspaceDropAfter, group.__dshWorktreeManagerNested === true && "dsh-worktree-manager-nested"),',
    'nested Worktree group indent')

  // ---- Session rows: decoration capture, fork guard, aria, drag ----
  // （会话树行不渲染分支徽标：嵌套 worktree 行已承担分支展示，标题独占整行。）
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
