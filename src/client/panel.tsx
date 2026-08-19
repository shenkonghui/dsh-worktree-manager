/**
 * Sidebar footer-action panel: lists sessions grouped by their git worktree.
 *
 * Reads workspace and session data through the dsh global standard hooks
 * (useWorkspaces / useSessions), resolves each workspace's git repository
 * root through the plugin's own `/api/repos` route, and renders sessions
 * grouped by worktree. Clicking a session opens it via the injected
 * `openSession` callback.
 *
 * Styling uses inline style objects: this standalone package has no CSS
 * Modules build chain (tsc only), so hashed class names are unavailable.
 * Tokens fall back to dsh CSS custom properties where they exist.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { translate, type WorktreePanelKey } from './locales'

// ---- Minimal runtime types (no dsh build-time dependency) ----

/** One workspace row from useWorkspaces. */
interface WorkspaceItem {
  workspaceId: string
  path: string
  title: string
  sessionIds: readonly string[]
}

/** Workspace list snapshot from useWorkspaces. */
interface WorkspaceListState {
  items: readonly WorkspaceItem[]
  archivedSessionIds: readonly string[]
}

/** One session row from useSessions. */
interface SessionSummary {
  id: string
  displayTitle: string
  title?: string
  cwd?: string
  running: boolean
  blank: boolean
  updatedAt: number
  /** Coarse durable origin for navigation filtering; absent on ordinary sessions. */
  origin?: 'subagent'
}

/** Session list snapshot from useSessions. */
interface SessionListState {
  ids: readonly string[]
  byId: Record<string, SessionSummary>
  current: string | undefined
}

/** Selector hook shape (zustand-style: subscribe + getSnapshot). */
type SelectorHook<S> = <T>(selector: (state: S) => T) => T

/** Props delivered by the sidebar.footer.action slot registration. */
export interface WorktreePanelProps {
  /** Sidebar column width state: wide renders the full panel, rail the icon. */
  wide: boolean
  /** Selector hook over the workspace list (global standard prop). */
  useWorkspaces: SelectorHook<WorkspaceListState>
  /** Selector hook over the session list (global standard prop). */
  useSessions: SelectorHook<SessionListState>
  /** Open a session by id (delegates to ctx.sessions.open). */
  openSession: (sessionId: string) => void
  /** Translate function bound to the panel's locale namespace. */
  t: (key: WorktreePanelKey, params?: Record<string, string | number>) => string
}

// ---- API types (matching the host half) ----

/** One discovered repository root with its registered dsh workspaces. */
interface RepoGroup {
  root: string
  name: string
  workspaces: { id: string; path: string; title: string }[]
}

/** Response from GET /api/repos. */
interface ReposResponse {
  repos: RepoGroup[]
}

/** One git worktree row from GET /api/list. */
interface WorktreeInfo {
  path: string
  head: string
  branch?: string
  bare: boolean
  locked: boolean
  prunable: boolean
}

/** Response from GET /api/list. */
interface ListResponse {
  worktrees: WorktreeInfo[]
}

// ---- API helpers ----

const API_BASE = '/plugins/dsh-worktree-manager/api/'

async function apiGet<T>(action: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams(params).toString()
  const res = await fetch(`${API_BASE}${action}?${qs}`)
  const json = await res.json() as T & { error?: string }
  if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
  return json
}

// ---- Grouping logic ----

/** One worktree group with its sessions. */
interface WorktreeGroup {
  /** Display label (worktree directory basename). */
  label: string
  /** Full worktree path (for tooltip). */
  path: string
  /** Sessions whose workspace lives inside this worktree. */
  sessions: SessionSummary[]
}

/** UNGROUPED_KEY for sessions whose workspace is not inside any git worktree. */
const UNGROUPED_KEY = '__ungrouped__'

/** Extract the final path component (trailing slashes trimmed). */
function basename(p: string): string {
  const parts = p.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || p
}

/**
 * Derive worktree groups from sessions, workspaces, and repo/worktree data.
 *
 * Each workspace is mapped to the git worktree whose path is the longest
 * prefix of the workspace path. Sessions inherit their workspace's worktree.
 * Sessions whose workspace has no worktree (or no workspace at all) fall into
 * the ungrouped bucket.
 */
function deriveWorktreeGroups(
  sessions: SessionListState,
  workspaces: readonly WorkspaceItem[],
  archived: readonly string[],
  repos: readonly RepoGroup[],
  worktreesByRepo: ReadonlyMap<string, WorktreeInfo[]>,
): WorktreeGroup[] {
  const archivedSet = new Set(archived)

  // Build a flat list of (worktreePath, repoName) pairs sorted by path length
  // descending so the longest-prefix match wins.
  const allWorktrees: { path: string; label: string }[] = []
  for (const repo of repos) {
    const wts = worktreesByRepo.get(repo.root) ?? []
    for (const wt of wts) {
      if (wt.bare) continue
      allWorktrees.push({ path: wt.path, label: basename(wt.path) })
    }
  }
  allWorktrees.sort((a, b) => b.path.length - a.path.length)

  /** Find the worktree path that contains the given directory. */
  const findWorktree = (dir: string): { path: string; label: string } | undefined =>
    allWorktrees.find(wt => dir === wt.path || dir.startsWith(wt.path + '/'))

  // Map each workspace to a worktree path.
  const wsToWorktree = new Map<string, { path: string; label: string } | undefined>()
  for (const ws of workspaces) {
    wsToWorktree.set(ws.workspaceId, findWorktree(ws.path))
  }

  // Group sessions by their workspace's worktree (or ungrouped).
  const groupsMap = new Map<string, WorktreeGroup>()
  const getGroup = (key: string, label: string, path: string): WorktreeGroup => {
    let g = groupsMap.get(key)
    if (g === undefined) {
      g = { label, path, sessions: [] }
      groupsMap.set(key, g)
    }
    return g
  }

  // Collect sessions from workspace accounts.
  const accounted = new Set<string>()
  for (const ws of workspaces) {
    const wt = wsToWorktree.get(ws.workspaceId)
    const key = wt?.path ?? UNGROUPED_KEY
    const label = wt?.label ?? ''
    const path = wt?.path ?? ''
    const group = getGroup(key, label, path)
    for (const id of ws.sessionIds) {
      if (accounted.has(id)) continue
      const summary = sessions.byId[id]
      if (summary === undefined) continue
      accounted.add(id)
      if (archivedSet.has(id)) continue
      if (summary.origin === 'subagent') continue
      if (summary.blank && id !== sessions.current) continue
      group.sessions.push(summary)
    }
  }

  // Stray sessions (no workspace).
  for (const id of sessions.ids) {
    if (accounted.has(id)) continue
    const summary = sessions.byId[id]
    if (summary === undefined) continue
    if (archivedSet.has(id)) continue
    if (summary.origin === 'subagent') continue
    if (summary.blank && id !== sessions.current) continue
    // Try to place by cwd.
    const wt = summary.cwd !== undefined ? findWorktree(summary.cwd) : undefined
    const key = wt?.path ?? UNGROUPED_KEY
    const label = wt?.label ?? ''
    const path = wt?.path ?? ''
    getGroup(key, label, path).sessions.push(summary)
  }

  // Sort sessions within each group by recency (newest first).
  for (const g of groupsMap.values()) {
    g.sessions.sort((a, b) => b.updatedAt - a.updatedAt)
  }

  // Output order: groups with a worktree first (by label), ungrouped last.
  const groups = [...groupsMap.values()].filter(g => g.path !== '')
  groups.sort((a, b) => a.label.localeCompare(b.label))
  const ungrouped = groupsMap.get(UNGROUPED_KEY)
  if (ungrouped !== undefined && ungrouped.sessions.length > 0) {
    groups.push(ungrouped)
  }
  return groups
}

// ---- Styles (inline; no CSS Modules build chain) ----

const TOKEN = (name: string, fallback: string): string => `var(${name}, ${fallback})`

const layer: CSSProperties = {
  position: 'relative',
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  width: '100%',
  height: '49px',
  marginTop: '8px',
}

const layerRail: CSSProperties = {
  ...layer,
  width: '36px',
  height: '36px',
  marginTop: '0',
}

const badge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  height: '49px',
  padding: '0 8px 0 6px',
  border: 'none',
  borderRadius: '12px',
  background: 'transparent',
  color: TOKEN('--dsw-alias-label-primary', 'inherit'),
  fontFamily: 'inherit',
  fontSize: '14px',
  cursor: 'pointer',
  overflow: 'hidden',
}

const badgeRail: CSSProperties = {
  ...badge,
  justifyContent: 'center',
  gap: '0',
  width: '36px',
  height: '36px',
  padding: '0',
  borderRadius: '50%',
}

const badgeLabel: CSSProperties = {
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const badgeCount: CSSProperties = {
  flex: 'none',
  marginLeft: 'auto',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
  fontSize: '12px',
  lineHeight: '16px',
  fontVariantNumeric: 'tabular-nums',
}

const panel: CSSProperties = {
  position: 'fixed',
  left: '12px',
  bottom: '128px',
  zIndex: 30,
  display: 'flex',
  flexDirection: 'column',
  width: '420px',
  maxWidth: 'calc(100vw - 24px)',
  maxHeight: '60vh',
  overflow: 'hidden',
  border: `1px solid ${TOKEN('--dsw-alias-border-l1', 'rgba(0,0,0,0.1)')}`,
  borderRadius: '12px',
  background: TOKEN('--dsw-alias-bg-base', '#fff'),
  boxShadow: 'var(--dsw-shadow-lv2, 0 6px 24px rgba(0,0,0,0.15))',
}

const panelHeader: CSSProperties = {
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  minHeight: '44px',
  padding: '10px 12px',
  boxSizing: 'border-box',
  borderBottom: `1px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.06)')}`,
}

const panelTitle: CSSProperties = {
  fontSize: '13px',
  fontWeight: 500,
  lineHeight: '20px',
  color: TOKEN('--dsw-alias-label-primary', 'inherit'),
}

const searchBox: CSSProperties = {
  flex: 'none',
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 12px',
  border: 'none',
  borderBottom: `1px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.06)')}`,
  fontSize: '13px',
  background: 'transparent',
  color: 'inherit',
  outline: 'none',
}

const panelBody: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  padding: '4px 0 12px',
}

const groupHeader: CSSProperties = {
  margin: '8px 12px 4px',
  fontSize: '11px',
  fontWeight: 500,
  lineHeight: '16px',
  color: TOKEN('--dsw-alias-label-caption', 'rgba(0,0,0,0.4)'),
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  userSelect: 'none',
  cursor: 'pointer',
}

const groupCount: CSSProperties = {
  marginLeft: '6px',
  fontWeight: 400,
  textTransform: 'none',
  letterSpacing: 'normal',
  opacity: 0.7,
}

const sessionList: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  margin: '0',
  padding: '0 4px',
  listStyle: 'none',
}

const sessionRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  padding: '6px 12px',
  border: 'none',
  borderRadius: '8px',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: '13px',
  textAlign: 'left',
  cursor: 'pointer',
  overflow: 'hidden',
}

const sessionTitle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const dot: CSSProperties = {
  flex: 'none',
  width: '6px',
  height: '6px',
  borderRadius: '50%',
}

const note: CSSProperties = {
  margin: '4px 12px',
  fontSize: '12px',
  lineHeight: '18px',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
}

const errorNote: CSSProperties = {
  ...note,
  color: TOKEN('--dsw-alias-state-error-primary', '#f38ba8'),
}

// ---- Panel component ----

/** State of the repo/worktree data fetch. */
type FetchState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; repos: RepoGroup[]; worktreesByRepo: Map<string, WorktreeInfo[]> }
  | { phase: 'empty' }

/**
 * Render the worktree-grouped session panel as a sidebar footer action.
 */
export function WorktreePanel({ wide, useWorkspaces, useSessions, openSession, t }: WorktreePanelProps) {
  const workspaces = useWorkspaces(s => s.items)
  const archived = useWorkspaces(s => s.archivedSessionIds)
  const sessions = useSessions(s => s)
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const fetchRef = useRef<{ phase: 'idle' } | { phase: 'pending' }>({ phase: 'idle' })

  // Fetch repo + worktree data when the panel opens (or when stale).
  const [fetchState, setFetchState] = useState<FetchState>({ phase: 'loading' })

  useEffect(() => {
    if (!open) return
    if (fetchRef.current.phase === 'pending') return
    fetchRef.current = { phase: 'pending' }
    setFetchState({ phase: 'loading' })

    let cancelled = false
    void (async () => {
      try {
        const reposRes = await apiGet<ReposResponse>('repos', {})
        if (cancelled) return
        if (reposRes.repos.length === 0) {
          setFetchState({ phase: 'empty' })
          return
        }
        const worktreesByRepo = new Map<string, WorktreeInfo[]>()
        await Promise.all(
          reposRes.repos.map(async (repo) => {
            try {
              const listRes = await apiGet<ListResponse>('list', { repoPath: repo.root })
              if (!cancelled) worktreesByRepo.set(repo.root, listRes.worktrees)
            } catch {
              // Per-repo failure leaves that repo with no worktrees; the
              // grouping falls back to ungrouped for its workspaces.
            }
          }),
        )
        if (cancelled) return
        setFetchState({ phase: 'ready', repos: reposRes.repos, worktreesByRepo })
      } catch (err) {
        if (cancelled) return
        const message = err instanceof Error ? err.message : String(err)
        setFetchState({ phase: 'error', message })
      } finally {
        if (!cancelled) fetchRef.current = { phase: 'idle' }
      }
    })()

    return () => { cancelled = true }
  }, [open])

  const groups = useMemo<WorktreeGroup[]>(() => {
    if (fetchState.phase !== 'ready') return []
    return deriveWorktreeGroups(
      sessions,
      workspaces,
      archived,
      fetchState.repos,
      fetchState.worktreesByRepo,
    )
  }, [sessions, workspaces, archived, fetchState])

  const totalSessions = useMemo(
    () => groups.reduce((n, g) => n + g.sessions.length, 0),
    [groups],
  )

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (q === '') return groups
    return groups
      .map(g => ({
        ...g,
        sessions: g.sessions.filter(s =>
          s.displayTitle.toLowerCase().includes(q)
          || (s.cwd ?? '').toLowerCase().includes(q),
        ),
      }))
      .filter(g => g.sessions.length > 0)
  }, [groups, filter])

  const toggleGroup = (key: string): void => {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Render trigger button.
  const isRail = !wide
  const triggerStyle = isRail ? badgeRail : badge
  const triggerLayerStyle = isRail ? layerRail : layer

  return (
    <div style={triggerLayerStyle}>
      {open && (
        <section style={panel} aria-label={t('panel.aria')} data-worktree-panel>
          <header style={panelHeader}>
            <span style={panelTitle}>{t('panel.title')}</span>
            <button
              type="button"
              onClick={() => { setOpen(false) }}
              style={{
                border: 'none',
                background: 'transparent',
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '16px',
                lineHeight: '1',
                padding: '2px 4px',
                borderRadius: '4px',
              }}
              aria-label="Close"
            >
              ✕
            </button>
          </header>
          <input
            type="text"
            style={searchBox}
            placeholder={t('panel.search.placeholder')}
            value={filter}
            onChange={e => { setFilter(e.target.value) }}
            onClick={e => { e.stopPropagation() }}
          />
          <div style={panelBody}>
            {fetchState.phase === 'loading' && (
              <p style={note}>{t('panel.loading')}</p>
            )}
            {fetchState.phase === 'empty' && (
              <p style={note}>{t('panel.noRepos')}</p>
            )}
            {fetchState.phase === 'error' && (
              <p style={errorNote} role="alert">{t('panel.error', { message: fetchState.message })}</p>
            )}
            {fetchState.phase === 'ready' && filteredGroups.length === 0 && (
              <p style={note}>
                {filter.trim() !== '' ? t('panel.search.noMatches') : t('panel.empty')}
              </p>
            )}
            {fetchState.phase === 'ready' && filteredGroups.map((group) => {
              const key = group.path || UNGROUPED_KEY
              const isCollapsed = collapsed.has(key)
              const label = group.path === '' ? t('panel.ungrouped') : group.label
              return (
                <div key={key}>
                  <div
                    style={groupHeader}
                    onClick={() => { toggleGroup(key) }}
                    title={group.path}
                  >
                    <span>{isCollapsed ? '▶' : '▼'} {label}</span>
                    <span style={groupCount}>
                      {t('panel.sessionCount', { n: group.sessions.length })}
                    </span>
                  </div>
                  {!isCollapsed && (
                    <ul style={sessionList}>
                      {group.sessions.map((s) => {
                        const isCurrent = s.id === sessions.current
                        const title = s.blank ? t('session.new') : s.displayTitle
                        const dotColor = s.running
                          ? TOKEN('--dsw-alias-state-success-primary', '#a6e3a1')
                          : isCurrent
                            ? TOKEN('--dsw-alias-state-business-primary', '#89b4fa')
                            : TOKEN('--dsw-alias-label-caption', 'rgba(0,0,0,0.2)')
                        return (
                          <li key={s.id}>
                            <button
                              type="button"
                              style={{
                                ...sessionRow,
                                ...(isCurrent ? {
                                  background: TOKEN('--dsw-alias-interactive-bg-hover', 'rgba(0,0,0,0.05)'),
                                } : {}),
                              }}
                              onClick={() => { openSession(s.id) }}
                              title={s.cwd ?? title}
                            >
                              <span style={{ ...dot, background: dotColor }} />
                              <span style={sessionTitle}>{title}</span>
                            </button>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}
      <div style={{ display: 'flex', width: '100%' }}>
        <button
          type="button"
          style={triggerStyle}
          aria-label={t('panel.aria')}
          aria-expanded={open}
          onClick={() => { setOpen(v => !v) }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M2 4h5v8H2zM7 6h3v6H7zM10 3h4v9h-4z"
              stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" fill="none" />
          </svg>
          {wide && (
            <>
              <span style={badgeLabel}>{t('panel.trigger')}</span>
              {totalSessions > 0 && (
                <span style={badgeCount}>{totalSessions}</span>
              )}
            </>
          )}
        </button>
      </div>
    </div>
  )
}
