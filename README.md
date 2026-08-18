# dsh-worktree-manager

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) plugin that adds git worktree management to the task start window — list, create, and select worktrees for development.

## Why

Git worktrees let you have multiple working directories connected to the same repository, each on a different branch. This is useful when you want to:

- Work on a feature branch without stashing changes on `main`
- Run tests on one branch while developing on another
- Keep a clean `main` checkout for reference while developing

The dsh task start window has a workspace picker for selecting a directory to work in, but it doesn't know about git worktrees. This plugin bridges that gap by:

1. Adding a "Git Worktree" button to the workspace picker area
2. Providing a dialog to list existing worktrees for any repository
3. Allowing creation of new worktrees (new branch or existing branch)
4. Auto-registering selected/created worktrees as dsh workspaces so they appear in the picker

## Architecture

The plugin follows the dsh dual-half plugin pattern:

### Host half (`src/index.ts`)

A Cordis plugin that injects `ctx.webServer`, `ctx.shell`, and `ctx.workspaceRegistry`. It registers HTTP routes under `/plugins/dsh-worktree-manager/api/`:

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/list?repoPath=<path>` | List git worktrees for a repository |
| POST | `/api/create` | Create a new worktree and register it as a workspace |
| POST | `/api/remove` | Remove a git worktree |
| POST | `/api/branches` | List branches in a repository |

The host half uses `node:child_process` to run `git worktree` commands and `ctx.workspaceRegistry.create()` to register worktrees as dsh workspaces.

### Client half (`src/client/index.ts`)

A browser module loaded at boot (`immediately: true`). It uses a `MutationObserver` to detect when the workspace picker appears in the SPA, then injects a "Git Worktree" button. Clicking the button opens a dialog with two tabs:

- **Select Worktree**: Enter a repo path, load existing worktrees, and click one to select it for development
- **Create Worktree**: Enter a repo path, choose a branch (or create a new one), optionally specify a target path, and create + select the worktree

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
2. In the task start window, look for the "Git Worktree" button near the workspace picker
3. Click it to open the worktree manager dialog
4. **To select an existing worktree**: enter the repository path, click "Load", then click a worktree in the list
5. **To create a new worktree**: switch to the "Create Worktree" tab, enter the repo path, load branches, choose a branch (or toggle "Create a new branch"), optionally set a target path, then click "Create & Select"

The selected/created worktree directory is fed back into the workspace picker, and the worktree is registered as a dsh workspace so it appears in future sessions.

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
