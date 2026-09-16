/**
 * Worktree panel dictionaries. The panel registers its own locale namespace
 * through ctx.locale.register at apply time; these are the raw string maps.
 */

/** Dictionary namespace owned by the worktree panel. */
export const NS = 'worktree-panel'

/** Simplified Chinese dictionary (the key-set source of truth). */
export const zh = {
  'panel.trigger': 'Worktree',
  'panel.title': '按 Worktree 分组',
  'panel.aria': 'Worktree 分组视图',
  'panel.empty': '暂无会话',
  'panel.loading': '正在扫描 git 仓库…',
  'panel.noRepos': '当前所有工作区均不是 git 仓库',
  'panel.error': '加载失败：{message}',
  'panel.sessionCount': '{n} 个会话',
  'panel.ungrouped': '未归属 worktree',
  'panel.search.placeholder': '筛选会话…',
  'panel.search.noMatches': '无匹配会话',
  'session.new': '新会话',
} satisfies Record<string, string>

/** Translation keys owned by the worktree panel namespace. */
export type WorktreePanelKey = keyof typeof zh

/** English dictionary, checked complete against the zh key set. */
export const en = {
  'panel.trigger': 'Worktree',
  'panel.title': 'Group by Worktree',
  'panel.aria': 'Worktree grouped view',
  'panel.empty': 'No sessions',
  'panel.loading': 'Scanning git repositories…',
  'panel.noRepos': 'No registered workspace is a git repository',
  'panel.error': 'Failed to load: {message}',
  'panel.sessionCount': '{n} sessions',
  'panel.ungrouped': 'No worktree',
  'panel.search.placeholder': 'Filter sessions…',
  'panel.search.noMatches': 'No matching sessions',
  'session.new': 'New Session',
} satisfies Record<WorktreePanelKey, string>

/**
 * Minimal translate function: replaces `{name}` placeholders and falls back
 * to the key itself when missing.
 */
export function translate(
  dict: Record<string, string>,
  key: string,
  params?: Record<string, string | number>,
): string {
  const template = dict[key] ?? key
  if (params === undefined) return template
  return template.replace(/\{(\w+)\}/g, (_m, name) => {
    const value = params[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}

// ---- 无 locale 服务的界面文案（Worktree 下拉与「变更」视图） ----
// 这些视图拿不到 panel 的 t() props，统一走模块级字典：启动时按
// navigator.language 选定一份，与注入「视图选项」菜单项的语言判定一致。

/** zh 文案（key-set 的真值来源；带参数的条目用 {name} 占位）。 */
export const uiZh = {
  // Worktree 下拉
  dropdown: {
    scanning: '正在扫描 git 仓库…',
    loadingWorktrees: '正在加载 worktree 列表…',
    noRepos: '当前所有工作区均不是 git 仓库',
    notInRepo: '当前工作区不属于任何 git 仓库',
    noMatch: '无匹配 worktree',
    filterPlaceholder: '筛选 worktree (按名称/分支/路径)…',
    newBranchPlaceholder: '新分支名 (如 feature/xxx)',
    create: '创建',
    remove: '移除此工作树',
    removeConfirm: '确定移除工作树 {path} 吗？',
    reposSummary: '{repos} 个仓库 · {worktrees} 个 worktree',
    // 「视图选项」菜单项
    viewOptionLabel: '按工作树',
    viewOptionTitle: '按工作树聚合会话：隐藏 worktree 独立行，把会话聚合到仓库主行并显示分支',
  },
  // 「变更」视图
  changes: {
    tab: '变更',
    refresh: '刷新',
    loading: '正在读取 git 历史…',
    notRepo: '当前会话目录不是 git 仓库',
    error: '加载失败',
    worktree: '未提交的变更',
    newCommits: '新提交',
    nChanges: '{n} 个变更',
    noChanges: '无变更',
    clean: '工作区无变更',
    subNoFileChange: '工作区文件无改动（HEAD 与索引不一致）',
    pointerCommits: '子模块提交',
    subUnavailable: '子模块仓库不可用',
    noDiff: '无内容差异',
    justNow: '刚刚',
    minutesAgo: '分钟前',
    hoursAgo: '小时前',
    daysAgo: '天前',
    summary: '{n} 个提交',
  },
}

/** UI 文案键集合（用于 en 完整性校验）。 */
type UiDict = typeof uiZh

/** en 文案，逐 key 与 zh 对齐。 */
export const uiEn: UiDict = {
  dropdown: {
    scanning: 'Scanning git repositories…',
    loadingWorktrees: 'Loading worktrees…',
    noRepos: 'No registered workspace is a git repository',
    notInRepo: 'The current workspace is not inside a git repository',
    noMatch: 'No matching worktree',
    filterPlaceholder: 'Filter worktrees (name/branch/path)…',
    newBranchPlaceholder: 'New branch name (e.g. feature/xxx)',
    create: 'Create',
    remove: 'Remove this worktree',
    removeConfirm: 'Remove worktree {path}?',
    reposSummary: '{repos} repos · {worktrees} worktrees',
    // 「视图选项」菜单项
    viewOptionLabel: 'By worktree',
    viewOptionTitle: 'Group sessions by worktree: collapse worktree rows into the owning repository row and show branch badges',
  },
  changes: {
    tab: 'Changes',
    refresh: 'Refresh',
    loading: 'Reading git history…',
    notRepo: 'The session directory is not a git repository',
    error: 'Failed to load',
    worktree: 'Uncommitted changes',
    newCommits: 'new commits',
    nChanges: '{n} changes',
    noChanges: 'No changes',
    clean: 'No changes',
    subNoFileChange: 'No working-tree changes (HEAD differs from index)',
    pointerCommits: 'Submodule commits',
    subUnavailable: 'Submodule repository unavailable',
    noDiff: 'No content diff',
    justNow: 'just now',
    minutesAgo: 'min ago',
    hoursAgo: 'h ago',
    daysAgo: 'd ago',
    summary: '{n} commits',
  },
}

/** 启动时按浏览器语言选定的 UI 字典。 */
export const UI: UiDict = navigator.language.startsWith('zh') ? uiZh : uiEn

/** 插值 `{name}` 占位（与 translate 同规则，供 UI 字典使用）。 */
export function format(template: string, params: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_m, name) => {
    const value = params[name]
    return value === undefined ? `{${name}}` : String(value)
  })
}
