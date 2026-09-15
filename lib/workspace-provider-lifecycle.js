/**
 * 宿主侧 Workspace Provider 生命周期。
 *
 * 移植自 dsh-git-worktree 的 workspace-provider-lifecycle：与 Loader 的公开
 * 生命周期协调条件补丁。禁用表达式由 Loader 动态求值，但 Web 模块注册表按
 * 插件名缓存行——仅替换方变化不会重新选举 Workspace。通过 Loader 操作重启
 * 官方条目可以发布真实模块事件，同时不保存任何 disabled 标志、也不改变
 * 用户的 profile。
 */
export const WORKSPACE_PROVIDER_CONDITION = "!!get('worktreeWorkspaceProvider') && [...loader.entries()].some(entry => entry.options?.name === 'dsh-worktree-manager' && !entry.disabled)";
const OFFICIAL_WORKSPACE = '@deepseek-ai/dsh-client-ui-workspace';
// Cordis 把 FiberState 暴露为 declaration-only const enum，不是 JS 导出。
const UNLOADING = 5;
export async function mountWorkspaceProviderLifecycle(ctx) {
    const loader = ctx.loader;
    const owned = () => [...loader.entries()].filter(entry => {
        const disabled = entry.options.disabled;
        return entry.options.name === OFFICIAL_WORKSPACE
            && typeof disabled === 'object' && disabled !== null
            && '__jsExpr' in disabled && disabled.__jsExpr === WORKSPACE_PROVIDER_CONDITION;
    });
    let released = false;
    let pending = Promise.resolve();
    const reconcile = () => {
        pending = pending.then(async () => {
            if (released)
                return;
            for (const entry of owned()) {
                if (entry.disabled) {
                    if (!released)
                        await entry.update({}, false, true);
                }
                else {
                    await entry.refresh();
                }
            }
        });
        return pending;
    };
    ctx.effect(() => async () => {
        released = true;
        // Root/Include 的卸载负责这些条目；不要复活那棵树。
        if (ctx.root.fiber.uid === null || ctx.root.fiber.state === UNLOADING)
            return;
        await pending.catch(() => { });
        for (const entry of owned()) {
            if (entry.parent.ctx.fiber.uid !== null && entry.parent.ctx.fiber.state !== UNLOADING && !entry.disabled)
                await entry.refresh();
        }
    });
    // 注册在 fallback 之后，LIFO 卸载会先释放选举、再恢复 Workspace，
    // 包括替换方 apply 失败的情况。
    ctx.provide('worktreeWorkspaceProvider', true);
    // Include 可能在替换方已激活后才追加官方行。
    ctx.on('internal/status', fiber => {
        if (fiber === ctx.fiber && !released) {
            void reconcile().catch(error => ctx.logger.warn(error));
        }
    });
    ctx.on('internal/plugin', fiber => {
        if (fiber.uid && fiber.entry?.options.name === OFFICIAL_WORKSPACE) {
            void reconcile().catch(error => ctx.logger.warn(error));
        }
    });
    await reconcile();
}
