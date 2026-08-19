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
