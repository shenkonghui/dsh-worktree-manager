/**
 * Self-check for the「worktree 是否已合并到基准分支」判定。
 *
 * 造一个主工作树检出于 `dev` 的仓库，挂上四个 linked worktree：已合回 dev 的
 * 分支、仍有未合并提交的分支、以及两个 detached HEAD（分别停在已合并/未合并
 * 的提交上），断言：
 * - `git branch --merged <base>` 的分支级快查命中/未命中；
 * - detached HEAD 走 `git merge-base --is-ancestor` 单点判定；
 * - 基准分支不存在时是「未知」（undefined / 无 merged 字段）而非「未合并」。
 *
 * Run: node scripts/merge-self-check.mjs   (after `npm run build`)
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { headMergedInto, mergedBranchesInto, worktreeRows } from '../lib/index.js'

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 't',
  GIT_AUTHOR_EMAIL: 't@t',
  GIT_COMMITTER_NAME: 't',
  GIT_COMMITTER_EMAIL: 't@t',
}

const git = (cwd, args) =>
  execFileSync('git', args, { cwd, env: GIT_ENV }).toString().trim()

const base = mkdtempSync(join(tmpdir(), 'dsh-wt-merge-selfcheck-'))
const repo = join(base, 'repo')
mkdirSync(repo)

// 主工作树检出于 dev：基准分支即主工作树的分支。
git(repo, ['init', '-q', '-b', 'dev'])
writeFileSync(join(repo, 'seed.txt'), 'seed\n')
git(repo, ['add', 'seed.txt'])
git(repo, ['commit', '-qm', 'seed'])

/** 造一个 linked worktree 并在其中提交一次，返回 { path, head }。 */
const addWorktree = (name, branch) => {
  const path = join(base, name)
  git(repo, ['worktree', 'add', '-q', '-b', branch, path])
  writeFileSync(join(path, `${name}.txt`), `${name}\n`)
  git(path, ['add', '.'])
  git(path, ['commit', '-qm', name])
  return { path, head: git(path, ['rev-parse', 'HEAD']) }
}

// 已合回 dev 的分支。
const merged = addWorktree('wt-merged', 'feature/merged')
git(repo, ['merge', '-q', '--no-edit', 'feature/merged'])
// 仍有未合并提交的分支。
const wip = addWorktree('wt-wip', 'feature/wip')
// 两个 detached HEAD worktree，分别停在已合并 / 未合并的提交上。
const detachedMergedPath = join(base, 'wt-detached-merged')
git(repo, ['worktree', 'add', '-q', '--detach', detachedMergedPath, merged.head])
const detachedWipPath = join(base, 'wt-detached-wip')
git(repo, ['worktree', 'add', '-q', '--detach', detachedWipPath, wip.head])

// ---- 分支级快查 ----
const mergedBranches = await mergedBranchesInto(repo, 'dev')
assert.ok(mergedBranches instanceof Set, 'dev 存在时应返回分支集合')
assert.equal(mergedBranches.has('feature/merged'), true, '已合并的分支命中')
assert.equal(mergedBranches.has('feature/wip'), false, '未合并的分支不命中')

// ---- detached HEAD 单点判定 ----
assert.equal(await headMergedInto(repo, 'dev', merged.head), true)
assert.equal(await headMergedInto(repo, 'dev', wip.head), false)

// ---- 基准分支不存在：未知而非未合并 ----
assert.equal(await mergedBranchesInto(repo, 'no-such-base'), undefined)

// ---- topology 行 ----
const wt = (path, head, branch) => ({
  path,
  wt: {
    path,
    head,
    ...(branch === undefined ? {} : { branch }),
    bare: false,
    locked: false,
    prunable: false,
  },
})
const linked = [
  wt(merged.path, merged.head, 'feature/merged'),
  wt(wip.path, wip.head, 'feature/wip'),
  wt(detachedMergedPath, merged.head, undefined),
  wt(detachedWipPath, wip.head, undefined),
]
assert.deepEqual(await worktreeRows(repo, 'dev', mergedBranches, linked), [
  { path: merged.path, branch: 'feature/merged', merged: true },
  { path: wip.path, branch: 'feature/wip', merged: false },
  { path: detachedMergedPath, merged: true },
  { path: detachedWipPath, merged: false },
])

// 基准不可用（主工作树 detached HEAD）时省略 merged：未知不能降级成未合并。
const unknown = await worktreeRows(repo, undefined, undefined, linked)
assert.equal(unknown.every(row => !('merged' in row)), true, '基准缺失时不带 merged')

console.log('merge self-check: OK')
