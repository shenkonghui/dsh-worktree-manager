/**
 * 宿主侧 Workspace Provider 生命周期。
 *
 * 移植自 dsh-git-worktree 的 workspace-provider-lifecycle：与 Loader 的公开
 * 生命周期协调条件补丁。禁用表达式由 Loader 动态求值，但 Web 模块注册表按
 * 插件名缓存行——仅替换方变化不会重新选举 Workspace。通过 Loader 操作重启
 * 官方条目可以发布真实模块事件，同时不保存任何 disabled 标志、也不改变
 * 用户的 profile。
 */
import type { Context } from '@deepseek-ai/cordis';
export declare const WORKSPACE_PROVIDER_CONDITION = "!!get('worktreeWorkspaceProvider') && [...loader.entries()].some(entry => entry.options?.name === 'dsh-worktree-manager' && !entry.disabled)";
declare module '@deepseek-ai/cordis' {
    interface Context {
        worktreeWorkspaceProvider: boolean;
    }
}
export declare function mountWorkspaceProviderLifecycle(ctx: Context): Promise<void>;
