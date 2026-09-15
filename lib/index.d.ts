/**
 * Host half of the dsh-worktree-manager plugin.
 *
 * Registers HTTP routes under /plugins/dsh-worktree-manager/api/ that the
 * browser half calls to list, create, and remove git worktrees. Created
 * worktrees are also registered in ctx.workspaceRegistry so they appear in
 * the existing workspace picker — the task start window's "open folder" flow
 * then selects them like any other workspace.
 *
 * Routes:
 *   GET  /plugins/dsh-worktree-manager/api/list?repoPath=<path>
 *   GET  /plugins/dsh-worktree-manager/api/repos
 *   GET  /plugins/dsh-worktree-manager/api/topology
 *   GET  /plugins/dsh-worktree-manager/api/changes?path=<dir>
 *   GET  /plugins/dsh-worktree-manager/api/history?path=<dir>&limit=<n>
 *   GET  /plugins/dsh-worktree-manager/api/commit?path=<dir>&hash=<sha>
 *   GET  /plugins/dsh-worktree-manager/api/diff?path=<dir>&file=<rel>[&sub=<rel>][&hash=<sha>]
 *   POST /plugins/dsh-worktree-manager/api/create   { repoPath, branch, targetPath?, newBranch? }
 *   POST /plugins/dsh-worktree-manager/api/remove   { worktreePath, force? }
 *   POST /plugins/dsh-worktree-manager/api/branches { repoPath }
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
/**
 * Minimal Context type — the full @deepseek-ai/cordis Context is available at
 * runtime in the dsh host environment; this local declaration avoids a
 * build-time dependency on the cordis package. Only the services this plugin
 * injects are declared here.
 */
interface Context {
    webServer: {
        register(route: {
            kind: 'exact' | 'prefix';
            path: string;
            handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
        }): () => void;
    };
    workspaceRegistry: {
        create(path: string, title?: string): Promise<{
            id: string;
            path: string;
            title: string;
        }>;
        list(): Array<{
            id: string;
            path: string;
            title: string;
        }>;
        resolveByPath(path: string): Promise<{
            id: string;
            path: string;
            title: string;
        } | undefined>;
    };
}
/** Cordis plugin name. */
export declare const name = "dsh-worktree-manager";
/** Required services: the HTTP carrier, the bash executor, and the workspace registry. */
export declare const inject: readonly ["webServer", "shell", "workspaceRegistry"];
/** One changed path from `git status --porcelain=v2`. */
interface ChangeFile {
    /** Two-letter XY status code; `??` marks untracked. */
    code: string;
    /** Path relative to the containing worktree root. */
    path: string;
    /** Original path for renames/copies. */
    origPath?: string;
    /** Whether the row is a gitlink (submodule pointer) change. */
    gitlink?: boolean;
}
/** Parse `git status --porcelain=v2 -z` output into changed-path rows. Exported for the self-check script. */
export declare function parseStatusPorcelainV2(out: string): ChangeFile[];
/** Parse `git submodule status` output. Exported for the self-check script. */
export declare function parseSubmoduleStatus(out: string): Array<{
    path: string;
    newCommits: boolean;
    uninitialized: boolean;
}>;
/**
 * One changed path in a commit: `git diff-tree -r -z` rows. Gitlink rows
 * (mode 160000) carry the old/new submodule pointers instead of a blob sha.
 */
interface DiffRow {
    code: string;
    path: string;
    origPath?: string;
    gitlink?: boolean;
    /** Old submodule pointer (all-zero when the submodule was added). */
    oldSha?: string;
    /** New submodule pointer (all-zero when the submodule was removed). */
    newSha?: string;
}
/**
 * Parse `git diff-tree -r -z --no-commit-id <hash>` output. Each record is
 * `:<oldMode> <newMode> <oldSha> <newSha> <status>[score]` NUL `<path>` NUL
 * (plus `<origPath>` NUL for renames/copies). Exported for the self-check script.
 */
export declare function parseDiffTree(out: string): DiffRow[];
/** Plugin entry: register HTTP routes for the worktree management API. */
export declare function apply(ctx: Context): Promise<void>;
export {};
