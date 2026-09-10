/**
 * Self-check for the /api/changes git pipeline: builds a throwaway repo with
 * a submodule plus modified/untracked changes, then asserts that the real
 * `git status --porcelain=v2 -z` output parses into the expected rows and
 * that gitlink rows are flagged for the submodule section.
 *
 * Run: node scripts/changes-self-check.mjs   (after `npm run build`)
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseDiffTree, parseStatusPorcelainV2, parseSubmoduleStatus } from '../lib/index.js'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
}

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, env: GIT_ENV }).toString()

const base = mkdtempSync(join(tmpdir(), 'dsh-wt-selfcheck-'))
const sub = join(base, 'sub')
const main = join(base, 'main')
mkdirSync(sub)
mkdirSync(main)

// Submodule repo: one committed file.
git(sub, ['init', '-q'])
writeFileSync(join(sub, 'a.txt'), 'a\n')
git(sub, ['add', 'a.txt'])
git(sub, ['commit', '-qm', 'init'])

// Superproject: track the submodule, then dirty the worktree.
git(main, ['init', '-q'])
git(main, ['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', sub, 'sub'])
git(main, ['commit', '-qm', 'add-sub'])
writeFileSync(join(main, 'tracked.txt'), 'hello\n')
writeFileSync(join(main, 'new.txt'), 'untracked\n')
// Dirty the submodule checkout (main/sub, not the standalone sub repo) and
// commit there so its HEAD advances past the superproject's recorded pointer.
const subWt = join(main, 'sub')
writeFileSync(join(subWt, 'a.txt'), 'a\nchanged\n')
git(subWt, ['add', 'a.txt'])
git(subWt, ['commit', '-qm', 'subchange'])

const porcelain = git(main, ['status', '--porcelain=v2', '-z', '--untracked-files=normal'])
const rows = parseStatusPorcelainV2(porcelain)

// Untracked files parse as `??` rows.
const untracked = rows.filter(row => row.code === '??').map(row => row.path).sort()
assert.deepEqual(untracked, ['new.txt', 'tracked.txt'])

// The submodule pointer row is a gitlink (mode 160000) — the handler filters
// it out of `files` and reports it via `git submodule status` instead.
const pointerRow = rows.find(row => row.path === 'sub')
assert.ok(pointerRow !== undefined, 'submodule pointer row present')
assert.equal(pointerRow.gitlink, true, 'gitlink row flagged')

// `git submodule status` marks the advanced submodule HEAD with '+'.
const subStatus = parseSubmoduleStatus(git(main, ['submodule', 'status']))
assert.equal(subStatus.length, 1)
assert.equal(subStatus[0].path, 'sub')
assert.equal(subStatus[0].newCommits, true)
assert.equal(subStatus[0].uninitialized, false)

// Commit detail: commit the submodule pointer, then the pointer-update commit's
// diff-tree row is a gitlink whose old/new shas bracket the submodule commits
// the pointer moved over.
git(main, ['add', 'sub'])
git(main, ['commit', '-qm', 'pointer-update'])
const diffRows = parseDiffTree(git(main, ['diff-tree', '-r', '-z', '--no-commit-id', 'HEAD']))
const commitPointer = diffRows.find(row => row.path === 'sub')
assert.ok(commitPointer !== undefined, 'pointer row present in commit diff')
assert.equal(commitPointer.gitlink, true)
assert.match(commitPointer.oldSha ?? '', /^[0-9a-f]{40}$/)
assert.equal(commitPointer.newSha, git(subWt, ['rev-parse', 'HEAD']).trim())

// Untracked file pseudo-diff: `git diff --no-index /dev/null <file>` exits 1
// with the diff on stdout (the /api/diff fallback path).
let pseudoDiff = ''
try {
  pseudoDiff = git(main, ['diff', '--no-index', '--', '/dev/null', 'new.txt'])
} catch (err) {
  pseudoDiff = String(err.stdout ?? '')
}
assert.match(pseudoDiff, /\+untracked/)

console.log('changes self-check: OK')
