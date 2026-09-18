/**
 * 会话视图「变更」标签：git 历史列表 —— 顶部是当前未提交的变更，其下按
 * 时间倒序列出 commit；点击任一行展开明细。点击文件行在右侧面板查看
 * 具体内容差异（unified diff）。
 *
 * - 未提交条目：文件级变更 + 各子模块（新提交徽标 + 子模块内文件）
 * - commit 条目：该提交的变更文件；子模块指针变动时列出指针扫过的子模块提交
 * - 未初始化的子模块不显示（宿主半已过滤）
 *
 * 通过 `conversation.view` slot 注册（与官方「轨迹」标签同一缝），props 为
 * `{ sessionId }`。数据来自宿主半 /api/history、/api/changes、/api/commit、
 * /api/diff；git 状态无事件推送，靠手动刷新按钮与 WORKTREE_REFRESH_EVENT
 * 触发重取。
 */
import { useEffect, useState, type ComponentType, type CSSProperties } from 'react'
import { apiGet, WORKTREE_REFRESH_EVENT } from './api.js'
import { UI, format } from './locales.js'
import { useSessionCwd, type SessionsListService } from './session-branch-badge.js'

// ---- API types (matching the host half) ----

interface ChangeFile {
  code: string
  path: string
  origPath?: string
}

interface SubmoduleChanges {
  path: string
  name: string
  newCommits: boolean
  files: ChangeFile[]
}

interface ChangesResponse {
  root: string
  branch?: string
  files: ChangeFile[]
  submodules: SubmoduleChanges[]
}

interface CommitInfo {
  hash: string
  subject: string
  author: string
  date: number
}

interface HistoryResponse {
  root: string
  branch?: string
  commits: CommitInfo[]
}

interface CommitDetailResponse {
  files: ChangeFile[]
  submodules: Array<{ path: string; name: string; commits: string[] }>
}

interface DiffResponse {
  diff: string
}

// ---- Styles (inline; no CSS Modules build chain) ----

const TOKEN = (name: string, fallback: string): string => `var(${name}, ${fallback})`

const view: CSSProperties = {
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  padding: '12px 16px',
  boxSizing: 'border-box',
  fontSize: '13px',
  lineHeight: '20px',
  overflow: 'hidden',
}

/** 左列表 + 右 diff 面板的横向容器。 */
const panes: CSSProperties = {
  flex: 1,
  minHeight: 0,
  display: 'flex',
  gap: '10px',
}

const listPane: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
}

/** 右侧文件 diff 面板：与左列表等宽，独立滚动。 */
const diffPane: CSSProperties = {
  flex: 1,
  minWidth: 0,
  overflowY: 'auto',
  paddingLeft: '12px',
  borderLeft: `1px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.08)')}`,
}

const diffHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  position: 'sticky',
  top: 0,
  background: TOKEN('--dsw-alias-bg-base', 'inherit'),
  padding: '2px 0 6px',
  fontWeight: 500,
  fontSize: '12px',
}

const diffClose: CSSProperties = {
  marginLeft: 'auto',
  border: 'none',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  fontSize: '14px',
  lineHeight: '1',
  padding: '2px 4px',
  borderRadius: '4px',
}

const diffBody: CSSProperties = {
  margin: '0',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '11px',
  lineHeight: '16px',
  whiteSpace: 'pre',
  overflowX: 'auto',
  tabSize: 4,
}

/** diff 行着色：+ 绿、- 红、@@ 蓝。 */
function diffLineStyle(line: string): CSSProperties {
  const added = line.startsWith('+') && !line.startsWith('+++')
  const removed = line.startsWith('-') && !line.startsWith('---')
  return {
    background: added
      ? TOKEN('--dsw-alias-state-success-bg', 'rgba(46,160,67,0.15)')
      : removed
        ? TOKEN('--dsw-alias-state-error-bg', 'rgba(248,81,73,0.15)')
        : undefined,
    color: line.startsWith('@@') ? TOKEN('--dsw-alias-accent', '#0969da') : undefined,
  }
}

const toolbar: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  marginBottom: '8px',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
  fontSize: '12px',
}

const refreshBtn: CSSProperties = {
  marginLeft: 'auto',
  padding: '2px 10px',
  border: `1px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.1)')}`,
  borderRadius: '6px',
  background: 'transparent',
  color: 'inherit',
  fontFamily: 'inherit',
  fontSize: '12px',
  cursor: 'pointer',
}

const note: CSSProperties = {
  margin: '8px 0',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
}

const errorNote: CSSProperties = {
  ...note,
  color: TOKEN('--dsw-alias-state-error-primary', '#f38ba8'),
}

const list: CSSProperties = {
  margin: '0',
  padding: '0',
  listStyle: 'none',
}

const entryRow: CSSProperties = {
  padding: '6px 8px',
  borderRadius: '8px',
  cursor: 'pointer',
  userSelect: 'none',
}

function entryRowStyle(selected: boolean): CSSProperties {
  return {
    ...entryRow,
    background: selected ? TOKEN('--dsw-alias-bg-l2', 'rgba(0,0,0,0.05)') : 'transparent',
  }
}

const entryTitle: CSSProperties = {
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
}

const entryMeta: CSSProperties = {
  display: 'flex',
  gap: '8px',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
  fontSize: '11px',
  lineHeight: '16px',
}

const hashText: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  flex: 'none',
}

const entryMetaRight: CSSProperties = {
  marginLeft: 'auto',
  flex: 'none',
}

const detailBox: CSSProperties = {
  margin: '0 0 6px 14px',
  padding: '4px 0 4px 8px',
  borderLeft: `2px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.08)')}`,
}

const fileList: CSSProperties = {
  margin: '0',
  padding: '0',
  listStyle: 'none',
}

const fileRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '2px 4px',
  minWidth: '0',
  borderRadius: '4px',
  cursor: 'pointer',
}

function fileRowStyle(selected: boolean): CSSProperties {
  return {
    ...fileRow,
    background: selected ? TOKEN('--dsw-alias-bg-l2', 'rgba(0,0,0,0.05)') : 'transparent',
  }
}

const codeBadge = (code: string): CSSProperties => ({
  flex: 'none',
  width: '20px',
  padding: '0 2px',
  boxSizing: 'border-box',
  textAlign: 'center',
  borderRadius: '4px',
  fontSize: '11px',
  fontFamily: 'ui-monospace, monospace',
  color: '#fff',
  background: code.includes('D')
    ? '#e5534b'
    : code.includes('R') || code.includes('C')
      ? '#8250df'
      : code.includes('A') || code === '??'
        ? '#1a7f37'
        : '#9a6700',
})

const filePath: CSSProperties = {
  minWidth: '0',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '12px',
}

const origPath: CSSProperties = {
  flex: 'none',
  color: TOKEN('--dsw-alias-label-tertiary', 'rgba(0,0,0,0.4)'),
  fontSize: '11px',
}

const subHeader: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  margin: '8px 0 2px',
  padding: '4px 8px',
  borderRadius: '6px',
  background: TOKEN('--dsw-alias-bg-l2', 'rgba(0,0,0,0.04)'),
  fontWeight: 600,
  fontSize: '12px',
  userSelect: 'none',
}

const subBadge: CSSProperties = {
  flex: 'none',
  padding: '0 6px',
  borderRadius: '8px',
  fontSize: '10px',
  lineHeight: '16px',
  background: TOKEN('--dsw-alias-badge-bg', 'rgba(0,0,0,0.1)'),
  color: TOKEN('--dsw-alias-label-secondary', 'inherit'),
}

const subBody: CSSProperties = {
  margin: '0 0 0 14px',
  paddingLeft: '8px',
  borderLeft: `2px solid ${TOKEN('--dsw-alias-border-l2', 'rgba(0,0,0,0.08)')}`,
}

const commitLine: CSSProperties = {
  fontFamily: 'ui-monospace, monospace',
  fontSize: '12px',
  color: TOKEN('--dsw-alias-label-secondary', 'inherit'),
}

/** 子模块提交行：可点击展开该提交的变更文件。 */
function commitLineStyle(selected: boolean): CSSProperties {
  return {
    ...commitLine,
    cursor: 'pointer',
    borderRadius: '4px',
    padding: '0 4px',
    background: selected ? TOKEN('--dsw-alias-bg-l2', 'rgba(0,0,0,0.05)') : 'transparent',
  }
}

// ---- Component ----

/** 相对时间：分钟/小时/天前，超过 30 天显示日期。 */
function relTime(ms: number): string {
  const diff = Date.now() - ms
  const minute = 60_000
  if (diff < minute) return UI.changes.justNow
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} ${UI.changes.minutesAgo}`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / 3_600_000)} ${UI.changes.hoursAgo}`
  if (diff < 30 * 86_400_000) return `${Math.floor(diff / 86_400_000)} ${UI.changes.daysAgo}`
  return new Date(ms).toLocaleDateString()
}

type FetchState<T> =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; data: T }

/** 展开项：未提交工作区，或某个 commit（按完整 hash）。 */
type Selection = { kind: 'worktree' } | { kind: 'commit'; hash: string } | null

/** 右侧 diff 面板的选中文件：所属仓库（子模块相对路径或空）+ 文件相对路径 + 所属 commit。 */
interface FileSelection {
  sub: string
  file: string
  hash?: string
}

const fileKey = (f: { sub: string; file: string }): string => `${f.sub}\u0000${f.file}`

/** 状态码徽标颜色语义与 GitHub 对齐：D 红、R/C 紫、A/?? 绿、M 黄。 */

function FileRows(props: {
  files: ChangeFile[]
  /** 所属仓库：子模块相对路径，主仓库为空串。 */
  sub: string
  /** 所属 commit（工作区条目为空）——决定 diff 取自哪个基线。 */
  hash?: string
  selected: FileSelection | null
  onSelect: (file: FileSelection) => void
}): JSX.Element {
  return (
    <ul style={list}>
      {props.files.map(file => {
        const selection: FileSelection = { sub: props.sub, file: file.path, ...(props.hash !== undefined ? { hash: props.hash } : {}) }
        const key = fileKey(selection)
        return (
          <li
            key={`${file.code}:${file.path}`}
            style={fileRowStyle(props.selected !== null && fileKey(props.selected) === key)}
            title={file.path}
            onClick={() => { props.onSelect(selection) }}
          >
            <span style={codeBadge(file.code)}>{file.code}</span>
            <span style={filePath}>{file.path}</span>
            {file.origPath !== undefined && <span style={origPath}>← {file.origPath}</span>}
          </li>
        )
      })}
    </ul>
  )
}

/** 子模块分组头：名称 + 徽标（新提交/指针提交）。未初始化子模块不显示。 */
function SubmoduleHead({ sub, badge }: { sub: SubmoduleChanges; badge?: string }): JSX.Element {
  return (
    <div style={subHeader} title={sub.path}>
      <span>{sub.name}</span>
      {sub.newCommits && <span style={subBadge}>{UI.changes.newCommits}</span>}
      {badge !== undefined && <span style={subBadge}>{badge}</span>}
    </div>
  )
}

/** 未提交工作区明细：主仓库文件 + 各子模块（含子模块内文件级变更）。 */
function WorktreeDetail(props: {
  data: ChangesResponse
  selected: FileSelection | null
  onSelect: (file: FileSelection) => void
}): JSX.Element {
  const subCount = props.data.submodules.length
  const fileCount = props.data.files.length + props.data.submodules.reduce((n, sub) => n + sub.files.length, 0)
  return (
    <>
      {props.data.files.length > 0 && <FileRows files={props.data.files} sub="" selected={props.selected} onSelect={props.onSelect} />}
      {props.data.submodules.map(sub => (
        <div key={sub.path}>
          <SubmoduleHead sub={sub} />
          <div style={subBody}>
            {sub.files.length > 0
              ? <FileRows files={sub.files} sub={sub.path} selected={props.selected} onSelect={props.onSelect} />
              : <p style={note}>{sub.newCommits ? UI.changes.subNoFileChange : UI.changes.noChanges}</p>}
          </div>
        </div>
      ))}
      {fileCount === 0 && subCount === 0 && <p style={note}>{UI.changes.clean}</p>}
    </>
  )
}

/** commit 明细：变更文件 + 子模块指针变动（列出指针扫过的子模块提交，点击可展开其变更文件）。 */
function CommitDetail(props: {
  /** 会话 cwd，用于拉取子模块提交的文件列表。 */
  path?: string
  detail: CommitDetailResponse
  hash: string
  selected: FileSelection | null
  onSelect: (file: FileSelection) => void
}): JSX.Element {
  const [subCommit, setSubCommit] = useState<{ sub: string; hash: string } | null>(null)
  const [subDetail, setSubDetail] = useState<FetchState<CommitDetailResponse>>({ phase: 'loading' })

  // 选中的子模块提交：拉取其变更文件；文件行点击复用 /api/diff 的 sub+hash 通道。
  const path = props.path
  useEffect(() => {
    if (subCommit === null || path === undefined) return
    let cancelled = false
    setSubDetail({ phase: 'loading' })
    void (async () => {
      try {
        const data = await apiGet<CommitDetailResponse>('commit', {
          path,
          hash: subCommit.hash,
          sub: subCommit.sub,
        })
        if (!cancelled) setSubDetail({ phase: 'ready', data })
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setSubDetail({ phase: 'error', message })
        }
      }
    })()
    return () => { cancelled = true }
  }, [path, subCommit])

  return (
    <>
      {props.detail.files.length > 0 && (
        <FileRows files={props.detail.files} sub="" hash={props.hash} selected={props.selected} onSelect={props.onSelect} />
      )}
      {props.detail.submodules.map(sub => (
        <div key={sub.path}>
          <div style={subHeader} title={sub.path}>
            <span>{sub.name}</span>
            <span style={subBadge}>{UI.changes.pointerCommits}</span>
          </div>
          <div style={subBody}>
            {sub.commits.length > 0
              ? (
                <ul style={list}>
                  {sub.commits.map(line => {
                    const hash = line.slice(0, line.indexOf(' '))
                    const active = subCommit !== null && subCommit.sub === sub.path && subCommit.hash === hash
                    return (
                      <li
                        key={line}
                        style={commitLineStyle(active)}
                        title={UI.changes.subCommitHint}
                        onClick={() => { setSubCommit(prev => (active ? null : { sub: sub.path, hash })) }}
                      >
                        {line}
                      </li>
                    )
                  })}
                </ul>
              )
              : <p style={note}>{UI.changes.subUnavailable}</p>}
            {subCommit !== null && subCommit.sub === sub.path && (
              <div style={detailBox}>
                {subDetail.phase === 'loading' && <p style={note}>{UI.changes.loading}</p>}
                {subDetail.phase === 'error' && <p style={errorNote}>{UI.changes.error}：{subDetail.message}</p>}
                {subDetail.phase === 'ready' && (
                  subDetail.data.files.length > 0
                    ? <FileRows files={subDetail.data.files} sub={subCommit.sub} hash={subCommit.hash} selected={props.selected} onSelect={props.onSelect} />
                    : <p style={note}>{UI.changes.noChanges}</p>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      {props.detail.files.length === 0 && props.detail.submodules.length === 0 && <p style={note}>{UI.changes.noChanges}</p>}
    </>
  )
}

/** 会话视图「变更」标签页。props 由 conversation.view slot 注入。 */
export function ChangesView(props: { sessionId?: string }): JSX.Element | null {
  const sessionId = props.sessionId
  const sessions = (ChangesView as unknown as { __sessions?: SessionsListService }).__sessions
  const cwd = useSessionCwd(sessionId, sessions)
  const [reload, setReload] = useState(0)
  const [history, setHistory] = useState<FetchState<HistoryResponse>>({ phase: 'loading' })
  const [worktree, setWorktree] = useState<FetchState<ChangesResponse>>({ phase: 'loading' })
  const [selected, setSelected] = useState<Selection>({ kind: 'worktree' })
  const [commitDetail, setCommitDetail] = useState<FetchState<CommitDetailResponse>>({ phase: 'loading' })
  const [selectedFile, setSelectedFile] = useState<FileSelection | null>(null)
  const [fileDiff, setFileDiff] = useState<FetchState<DiffResponse>>({ phase: 'loading' })

  // 历史列表与未提交变更并行拉取；commit 明细仅在选中 commit 时拉取。
  useEffect(() => {
    if (cwd === undefined) return
    let cancelled = false
    setHistory({ phase: 'loading' })
    setWorktree({ phase: 'loading' })
    void (async () => {
      try {
        const [h, w] = await Promise.all([
          apiGet<HistoryResponse>('history', { path: cwd }),
          apiGet<ChangesResponse>('changes', { path: cwd }),
        ])
        if (!cancelled) {
          setHistory({ phase: 'ready', data: h })
          setWorktree({ phase: 'ready', data: w })
        }
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setHistory({ phase: 'error', message })
          setWorktree({ phase: 'error', message })
        }
      }
    })()
    return () => { cancelled = true }
  }, [cwd, reload])

  useEffect(() => {
    if (selected?.kind !== 'commit' || cwd === undefined) return
    let cancelled = false
    setCommitDetail({ phase: 'loading' })
    void (async () => {
      try {
        const data = await apiGet<CommitDetailResponse>('commit', { path: cwd, hash: selected.hash })
        if (!cancelled) setCommitDetail({ phase: 'ready', data })
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setCommitDetail({ phase: 'error', message })
        }
      }
    })()
    return () => { cancelled = true }
  }, [cwd, selected, reload])

  // 右侧面板：选中文件的 unified diff。
  useEffect(() => {
    if (selectedFile === null || cwd === undefined) return
    let cancelled = false
    setFileDiff({ phase: 'loading' })
    void (async () => {
      try {
        const data = await apiGet<DiffResponse>('diff', {
          path: cwd,
          file: selectedFile.file,
          ...(selectedFile.sub !== '' ? { sub: selectedFile.sub } : {}),
          ...(selectedFile.hash !== undefined ? { hash: selectedFile.hash } : {}),
        })
        if (!cancelled) setFileDiff({ phase: 'ready', data })
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err)
          setFileDiff({ phase: 'error', message })
        }
      }
    })()
    return () => { cancelled = true }
  }, [cwd, selectedFile, reload])

  useEffect(() => {
    const listener = (): void => { setReload(prev => prev + 1) }
    window.addEventListener(WORKTREE_REFRESH_EVENT, listener)
    return () => { window.removeEventListener(WORKTREE_REFRESH_EVENT, listener) }
  }, [])

  const toggle = (next: Exclude<Selection, null>): void => {
    setSelected(prev => (JSON.stringify(prev) === JSON.stringify(next) ? null : next))
  }
  const refresh = (): void => { setReload(prev => prev + 1) }

  if (sessionId === undefined) return null

  const notRepo = history.phase === 'error' && history.message.includes('not a git repository')
  const commits = history.phase === 'ready' ? history.data.commits : []
  const worktreeData = worktree.phase === 'ready' ? worktree.data : undefined
  const worktreeCount = (worktreeData?.files.length ?? 0)
    + (worktreeData?.submodules.reduce((n, sub) => n + sub.files.length, 0) ?? 0)

  return (
    <div style={view}>
      <div style={toolbar}>
        <span title={history.phase === 'ready' ? history.data.root : cwd}>
          {history.phase === 'ready' && history.data.branch !== undefined ? `${history.data.branch} · ` : ''}
          {history.phase === 'ready' ? format(UI.changes.summary, { n: commits.length }) : ''}
        </span>
        <button type="button" style={refreshBtn} onClick={refresh}>{UI.changes.refresh}</button>
      </div>
      {history.phase === 'loading' && <p style={note}>{UI.changes.loading}</p>}
      {notRepo && <p style={note}>{UI.changes.notRepo}</p>}
      {!notRepo && history.phase === 'error' && (
        <p style={errorNote} role="alert">{UI.changes.error}：{history.message}</p>
      )}
      {history.phase === 'ready' && (
        <div style={panes}>
          <ul style={{ ...list, ...listPane }}>
            <li
              style={entryRowStyle(selected?.kind === 'worktree')}
              onClick={() => { toggle({ kind: 'worktree' }) }}
            >
              <div style={entryTitle}>{UI.changes.worktree}</div>
              <div style={entryMeta}>
                <span>{worktreeData !== undefined ? format(UI.changes.nChanges, { n: worktreeCount }) : ''}</span>
              </div>
            </li>
            {selected?.kind === 'worktree' && (
              <li>
                <div style={detailBox}>
                  {worktree.phase === 'loading' && <p style={note}>{UI.changes.loading}</p>}
                  {worktree.phase === 'error' && <p style={errorNote}>{UI.changes.error}：{worktree.message}</p>}
                  {worktree.phase === 'ready' && (
                    <WorktreeDetail data={worktree.data} selected={selectedFile} onSelect={setSelectedFile} />
                  )}
                </div>
              </li>
            )}
            {commits.map(commit => (
              <li key={commit.hash}>
                <div
                  style={entryRowStyle(selected?.kind === 'commit' && selected.hash === commit.hash)}
                  onClick={() => { toggle({ kind: 'commit', hash: commit.hash }) }}
                >
                  <div style={entryTitle}>{commit.subject}</div>
                  <div style={entryMeta}>
                    <span style={hashText}>{commit.hash.slice(0, 8)}</span>
                    <span>{commit.author}</span>
                    <span style={entryMetaRight}>{relTime(commit.date)}</span>
                  </div>
                </div>
                {selected?.kind === 'commit' && selected.hash === commit.hash && (
                  <div style={detailBox}>
                    {commitDetail.phase === 'loading' && <p style={note}>{UI.changes.loading}</p>}
                    {commitDetail.phase === 'error' && <p style={errorNote}>{UI.changes.error}：{commitDetail.message}</p>}
                    {commitDetail.phase === 'ready' && (
                      <CommitDetail path={cwd} detail={commitDetail.data} hash={commit.hash} selected={selectedFile} onSelect={setSelectedFile} />
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
          {selectedFile !== null && (
            <div style={diffPane}>
              <div style={diffHeader}>
                <span title={selectedFile.file}>{selectedFile.file}</span>
                <button
                  type="button"
                  style={diffClose}
                  aria-label="Close"
                  onClick={() => { setSelectedFile(null) }}
                >
                  ✕
                </button>
              </div>
              {fileDiff.phase === 'loading' && <p style={note}>{UI.changes.loading}</p>}
              {fileDiff.phase === 'error' && <p style={errorNote}>{UI.changes.error}：{fileDiff.message}</p>}
              {fileDiff.phase === 'ready' && (
                fileDiff.data.diff !== ''
                  ? (
                    <pre style={diffBody}>
                      {fileDiff.data.diff.split('\n').map((line, i) => (
                        <div key={i} style={diffLineStyle(line)}>{line}</div>
                      ))}
                    </pre>
                  )
                  : <p style={note}>{UI.changes.noChanges}</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ViewSlotContext {
  slots: {
    inject(name: string, callback: () => unknown): void
    register(descriptor: Record<string, unknown>, component: ComponentType<Record<string, unknown>>): unknown
  }
  get(name: string): unknown
}

/**
 * 延迟注册「变更」标签：等 conversation UI 声明 conversation.view slot 后
 * 再 register，并把 sessions 服务闭包挂到组件上供其读取会话 cwd。
 */
export function registerChangesView(ctx: ViewSlotContext): void {
  const sessions = ctx.get('sessions') as SessionsListService | undefined
  ;(ChangesView as unknown as { __sessions?: SessionsListService }).__sessions = sessions
  ctx.slots.inject('conversation.view', () => ctx.slots.register({
    name: 'conversation.view',
    id: 'worktree-changes',
    order: 20,
    label: () => UI.changes.tab,
  }, ChangesView))
}
