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
| GET | `/api/repos` | Scan all dsh workspaces and group them by git repository root |
| POST | `/api/create` | Create a new worktree and register it as a workspace |
| POST | `/api/remove` | Remove a git worktree |
| POST | `/api/branches` | List branches in a repository |

The host half uses `node:child_process` to run `git worktree` commands and `ctx.workspaceRegistry.create()` to register worktrees as dsh workspaces.

### Client half (`src/client/index.ts`)

A browser module loaded at boot (`immediately: true`). It uses a `MutationObserver` to detect when the workspace picker appears in the SPA, then injects a "Git Worktree" button. Clicking the button opens a dropdown that:

- Calls `GET /api/repos` to discover all git repositories among the registered dsh workspaces
- Concurrently loads worktrees for every discovered repository via `GET /api/list`
- Renders worktrees grouped by repository, each section collapsible; the repository containing the current workspace expands by default
- Provides a search box that filters worktrees across all repositories by name, branch, or path
- Offers a create row with a target-repo selector (defaulting to the current workspace's repo) and a new-branch input

The client communicates with the host through `fetch()` calls to the custom HTTP routes.

## Install

Build and install the package into the harness environment, then start the web UI:

```sh
pnpm build
npm install <path-to-this-package>
npx @deepseek-ai/dsh web
```

The harness discovers the plugin from the `dsh` manifest field and:
- Loads the host half as a Cordis plugin (registers HTTP routes)
- Injects the client bundle at boot (`immediately: true`)

## Usage

1. Start the dsh web UI
2. In the task start window, look for the "Worktree" button near the workspace picker
3. Click it to open the worktree dropdown — it scans all registered workspaces and groups worktrees by repository
4. **To select an existing worktree**: expand a repository section, then click a worktree to switch to it
5. **To filter**: type in the search box to match worktrees across all repositories by name, branch, or path
6. **To create a new worktree**: choose a target repository from the selector (defaults to the current repo), type a new branch name, and click "创建"

The selected/created worktree directory is registered as a dsh workspace and the sidebar switches to it.

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

### `GET /plugins/dsh-worktree-manager/api/repos`

No parameters. Scans every registered dsh workspace, resolves its git repository root via `git rev-parse --git-common-dir` (so linked worktrees group under their main worktree), and returns one entry per distinct root.

Returns:
```json
{
  "repos": [
    {
      "root": "/path/to/repo",
      "name": "repo",
      "workspaces": [
        { "id": "ws-uuid", "path": "/path/to/repo", "title": "repo" },
        { "id": "ws-uuid-2", "path": "/path/to/repo-worktrees/feature", "title": "feature" }
      ]
    }
  ]
}
```

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
