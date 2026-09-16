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
 *   GET  /plugins/dsh-worktree-manager/api/topology
 *   GET  /plugins/dsh-worktree-manager/api/changes?path=<dir>
 *   GET  /plugins/dsh-worktree-manager/api/history?path=<dir>&limit=<n>
 *   GET  /plugins/dsh-worktree-manager/api/commit?path=<dir>&hash=<sha>
 *   GET  /plugins/dsh-worktree-manager/api/diff?path=<dir>&file=<rel>[&sub=<rel>][&hash=<sha>]
 *   POST /plugins/dsh-worktree-manager/api/create   { repoPath, branch, targetPath?, newBranch? }
 *   POST /plugins/dsh-worktree-manager/api/remove   { worktreePath, force? }
 *   POST /plugins/dsh-worktree-manager/api/branches { repoPath }
 *
 * `topology` 聚合了仓库发现（原 /api/repos）与各仓库的 worktree 列表，供
 * 下拉与侧边栏投影一次拉全。POST 写操作校验 Origin 与 Host 同源。
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
        delete(id: string): Promise<boolean>;
    };
}
/** Cordis plugin name. */
export declare const name = "dsh-worktree-manager";
/** Required services: the HTTP carrier, the bash executor, and the workspace registry. */
export declare const inject: readonly ["webServer", "shell", "workspaceRegistry"];
/** One parsed worktree row from `git worktree list --porcelain`. */
interface WorktreeInfo {
    /** Absolute path of the working tree. */
    path: string;
    /** HEAD commit hash (detached) or branch ref. */
    head: string;
    /** Branch name when checked out, absent when detached. */
    branch?: string;
    /** Whether this is the main working tree. */
    bare: boolean;
    /** Whether the worktree is locked. */
    locked: boolean;
    /** Whether the worktree is prunable. */
    prunable: boolean;
}
/** One workspace entry under a discovered repository root. */
interface RepoWorkspace {
    /** dsh workspace id. */
    id: string;
    /** Workspace directory path (canonicalized at registry create time). */
    path: string;
    /** Display title. */
    title: string;
}
/** 每个仓库的侧边栏投影拓扑：分支归属、workspace 归属与合并状态。 */
interface RepoTopology {
    /** 规范化 git 仓库根（主工作树目录）。 */
    root: string;
    /** 展示名（根路径 basename）。 */
    name: string;
    /** 主工作树（path === root）当前分支；detached HEAD 时缺省。 */
    mainBranch?: string;
    /** 非主 worktree 列表（含各自分支、合并状态与 locked/prunable 徽标）。 */
    worktrees: Array<{
        path: string;
        branch?: string;
        merged?: boolean;
        locked?: boolean;
        prunable?: boolean;
    }>;
    /** 注册在该仓库下的 dsh workspace（主 + worktree），id/path/title 齐全。 */
    workspaces: RepoWorkspace[];
}
/**
 * 列出仓库内已完全合并到 baseRef 的本地分支（其 tip 可从 baseRef 到达）。
 * baseRef 不存在时返回 undefined —— 调用方据此保持「未知」而不是报告未合并。
 * 导出供自检脚本使用。
 */
export declare function mergedBranchesInto(root: string, baseRef: string): Promise<Set<string> | undefined>;
/**
 * detached HEAD 的 worktree 无法用 {@link mergedBranchesInto} 的分支集合判定，
 * 改为单点判断其 HEAD 提交是否可从 baseRef 到达。导出供自检脚本使用。
 */
export declare function headMergedInto(root: string, baseRef: string, head: string): Promise<boolean>;
/**
 * 把仓库的 linked worktree 转成拓扑行，并为每行判定 `merged`。基准分支或分支
 * 集合不可用时省略该字段（保持「未知」，客户端维持原有配色）——绝不因为判定
 * 不出来就把 worktree 标成未合并。行上还带 locked/prunable 供下拉徽标展示。
 * 导出供自检脚本使用。
 */
export declare function worktreeRows(root: string, baseRef: string | undefined, mergedBranches: Set<string> | undefined, linked: Array<{
    path: string;
    wt: WorktreeInfo;
}>): Promise<RepoTopology['worktrees']>;
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
