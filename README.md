# dsh-worktree-manager

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds git worktree management to the task start window — list, create, and select worktrees for development.

## Why

Git worktrees let you have multiple working directories connected to the same repository, each on a different branch. This is useful when you want to:

- Work on a feature branch without stashing changes on `main`
- Run tests on one branch while developing on another
- Keep a clean `main` checkout for reference while developing

The dsh task start window has a workspace picker for selecting a directory to work in, but it doesn't know about git worktrees. This plugin bridges that gap by:

1. Adding a "Git Worktree" button to the workspace picker area
2. Scanning all registered dsh workspaces and grouping those inside a git repository by their shared repository root
3. Providing a dropdown that lists worktrees grouped by repository, with per-repo collapsible sections and a cross-repo search filter
4. Allowing creation of new worktrees (new branch) with a target-repo selector
5. Auto-registering selected/created worktrees as dsh workspaces and switching to them

## Architecture

The plugin follows the dsh dual-half plugin pattern:

### Host half (`src/index.ts`)

A Cordis plugin that injects `ctx.webServer`, `ctx.shell`, and `ctx.workspaceRegistry`. It registers HTTP routes under `/plugins/dsh-worktree-manager/api/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/list?repoPath=<path>` | List git worktrees for a repository |
| GET | `/api/topology` | Per-repo branch/workspace topology (repo discovery + worktree lists + merge status in one scan) |
| GET | `/api/changes?path=<dir>` | Working-tree changes of the containing repo, recursing into submodules |
| GET | `/api/history?path=<dir>&limit=<n>` | Commit history of the containing worktree, newest first |
| GET | `/api/commit?path=<dir>&hash=<sha>[&sub=<rel>]` | One commit's changed files; submodule pointer moves list the submodule commits in between. With `sub`, `hash` refers to a commit inside that submodule |
| GET | `/api/diff?path=<dir>&file=<rel>[&sub=<rel>][&hash=<sha>]` | Unified diff of one file (working tree vs HEAD, or one commit) |
| POST | `/api/create` | Create a new worktree and register it as a workspace |
| POST | `/api/remove` | Remove a git worktree and unregister its dsh workspace |
| POST | `/api/branches` | List branches in a repository |

The host half uses `node:child_process` to run `git worktree` commands and `ctx.workspaceRegistry.create()` to register worktrees as dsh workspaces. POST requests are rejected when the `Origin` header doesn't match the request `Host` (CSRF guard); non-browser clients that omit `Origin` are unaffected.

### Client half (`src/client/index.ts`)

A browser module loaded at boot (`immediately: true`). It uses a `MutationObserver` to detect when the workspace picker appears in the SPA, then injects a "Git Worktree" button. Clicking the button opens a dropdown that:

- Calls `GET /api/topology` to discover all git repositories among the registered dsh workspaces
- Concurrently loads worktrees for every discovered repository via `GET /api/list`
- Renders worktrees grouped by repository, each section collapsible; the repository containing the current workspace expands by default
- Provides a search box that filters worktrees across all repositories by name, branch, or path
- Offers a create row with a target-repo selector (defaulting to the current workspace's repo) and a new-branch input

The client communicates with the host through `fetch()` calls to the custom HTTP routes.

## Install

从 git 源直接安装即可——仓库已提交构建产物 `lib/`，安装过程中不做任何编译，也不需要 `allowBuilds` 构建授权：

```sh
dsh plugin --profile web add github:shenkonghui/dsh-worktree-manager
```

也可以从本地检出构建后安装，再启动 Web UI：

```sh
npm run build
npm install <path-to-this-package>
npx @deepseek-ai/dsh web
```

The harness discovers the plugin from the `dsh` manifest field and:
- Loads the host half as a Cordis plugin (registers HTTP routes)
- Injects the client bundle at boot (`immediately: true`)

### 产物维护

`lib/` 已纳入版本控制（`.gitignore` 不再忽略它），这正是 git 源安装能免构建的原因。代价是：**改动 `src/` 后必须重新构建并连同 `lib/` 一起提交**，否则远程仓库会停留在旧产物上。

```sh
npm run build      # 重建 lib/（host 半 tsc 输出 + client 半 esbuild 打包）
npm run check:lib  # 把源码重建到临时目录，与入库产物逐字节比对
```

`npm run check:lib` 在产物缺失、多余或内容不同时以非零码退出并列出差异文件，用来在提交前拦住漂移。

### 自检脚本

两个脚本都读 `lib/` 产物，所以要在 `npm run build` 之后跑：

```sh
node scripts/changes-self-check.mjs   # 「变更」视图的 git 管线（status/diff-tree/submodule）
node scripts/merge-self-check.mjs     # worktree 合并状态判定（分支级快查 + detached HEAD 单点判定）
```

## Usage

1. Start the dsh web UI
2. In the task start window, look for the "Worktree" button near the workspace picker
3. Click it to open the worktree dropdown — it scans all registered workspaces and groups worktrees by repository
4. **To select an existing worktree**: expand a repository section, then click a worktree to switch to it
5. **To filter**: type in the search box to match worktrees across all repositories by name, branch, or path
6. **To create a new worktree**: choose a target repository from the selector (defaults to the current repo), type a new branch name, and click "创建"

The selected/created worktree directory is registered as a dsh workspace and the sidebar switches to it.

### 合并状态配色

分组开启后，侧边栏里每个 worktree 行的分支徽标会体现它是否已经合回主干：

- **基准分支** = 该仓库主工作树当前检出的分支（`/api/topology` 的 `mainBranch`）。主工作树自身是基准，不参与判定，保持蓝色。
- **判定方式** = 该 worktree 分支的 tip 是否可从基准到达，即完全合并（`git branch --merged <base>`）；detached HEAD 的 worktree 改用其 HEAD 提交做单点祖先判定（`git merge-base --is-ancestor`）。合并后又有新提交的算未合并。
- **绿色** = 已合并到基准；**蓝色** = 未合并。
- 徽标的 hover 提示会写明 `已合并到 <基准>` / `未合并到 <基准>`。
- 判不出来时（基准不存在，例如主工作树处于 detached HEAD）不在 `/api/topology` 的 worktree 行上给 `merged` 字段：徽标保持蓝色，但提示只显示分支名，不会被误报成「未合并」。

判定在宿主侧完成（`/api/topology` 的 `worktrees[].merged`），客户端只负责取色，因此拓扑刷新时状态会一起更新。

## API Reference

### `GET /plugins/dsh-worktree-manager/api/list`

Query parameters: `repoPath` (required)

Returns:
```json
{
  "worktrees": [
    {
      "path": "/repo/main",
      "head": "abc123...",
      "branch": "main",
      "bare": false,
      "locked": false,
      "prunable": false
    }
  ]
}
```

### `GET /plugins/dsh-worktree-manager/api/topology`

No parameters. Scans every registered dsh workspace, resolves its git repository root via `git rev-parse --git-common-dir` (so linked worktrees group under their main worktree), and returns one entry per distinct root — repo discovery, per-repo worktree lists and merge status all in one response.

```json
{
  "repos": [
    {
      "root": "/path/to/repo",
      "name": "repo",
      "mainBranch": "main",
      "worktrees": [
        { "path": "/path/to/repo-worktrees/feature", "branch": "feature", "merged": true, "locked": true }
      ],
      "workspaces": [
        { "id": "ws-uuid", "path": "/path/to/repo", "title": "repo" },
        { "id": "ws-uuid-2", "path": "/path/to/repo-worktrees/feature", "title": "feature" }
      ]
    }
  ]
}
```

`worktrees` lists only linked worktrees (the main worktree is `root` itself); `merged` is absent when the host could not decide (e.g. the main worktree is on detached HEAD). `locked`/`prunable` are present only when set, for dropdown badges.

### `GET /plugins/dsh-worktree-manager/api/changes`

Query parameters: `path` (required, any directory inside the repo/worktree)

Returns the working-tree changes of the containing worktree. Submodule pointer rows are excluded from `files` and reported per submodule instead; each submodule's own working-tree changes are listed file-level.

```json
{
  "root": "/path/to/worktree",
  "branch": "main",
  "files": [{ "code": "??", "path": "new.txt" }],
  "submodules": [
    {
      "path": "sub",
      "name": "sub",
      "newCommits": true,
      "uninitialized": false,
      "files": [{ "code": " M", "path": "a.txt" }]
    }
  ]
}
```

### `GET /plugins/dsh-worktree-manager/api/history`

Query parameters: `path` (required), `limit` (optional, 1–200, default 50)

Returns `{ root, branch?, commits: [{ hash, subject, author, date }] }` (date = epoch ms). Empty `commits` for a repository with no commits yet.

### `GET /plugins/dsh-worktree-manager/api/commit`

Query parameters: `path` (required), `hash` (required, commit hash), `sub` (optional, submodule path relative to the worktree root)

Returns one commit's changed files. Submodule pointer rows become `submodules` entries listing the submodule commits between the old and new pointer (`git -C <submodule> log old..new`). With `sub`, `hash` refers to a commit inside that submodule instead — the handler runs `git diff-tree` inside the submodule and returns only that commit's `files` (empty `submodules`).

```json
{
  "files": [{ "code": "M", "path": "f.txt" }],
  "submodules": [{ "path": "sub", "name": "sub", "commits": ["abc1234 sub change"] }]
}
```

### `GET /plugins/dsh-worktree-manager/api/diff`

Query parameters: `path` (required), `file` (required, repo-relative), `sub` (optional, submodule-relative directory the file lives in), `hash` (optional, commit hash)

Returns `{ diff }` — the unified diff of one file. With `hash`, the commit's diff for the file; otherwise the working tree vs HEAD (staged + unstaged). Untracked files fall back to a `/dev/null` pseudo-diff. `file`/`sub` must stay inside the worktree (absolute paths and `..` segments are rejected).

### `POST /plugins/dsh-worktree-manager/api/create`

Body:
```json
{
  "repoPath": "/path/to/repo",
  "branch": "feature/my-feature",
  "newBranch": true,
  "targetPath": "/path/to/worktree"
}
```

Returns the created worktree info and the dsh workspace ID.

### `POST /plugins/dsh-worktree-manager/api/remove`

Body:
```json
{
  "worktreePath": "/path/to/worktree",
  "force": false
}
```

Deletes the worktree from its main worktree and unregisters the dsh workspace registered for it (if any).

### `POST /plugins/dsh-worktree-manager/api/branches`

Body:
```json
{
  "repoPath": "/path/to/repo"
}
```

Returns `{ "branches": ["main", "develop", ...], "current": "main" }`.

## License

MIT
