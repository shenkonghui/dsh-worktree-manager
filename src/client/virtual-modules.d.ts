/**
 * 构建期虚拟模块的声明：`virtual:dsh-official-workspace-client` 由
 * scripts/build-client.mjs 的 esbuild 插件在打包时物化（版本 + SHA-256
 * 门控的官方 Workspace Client 源码），仅导出官方 apply / inject。
 */
declare module 'virtual:dsh-official-workspace-client' {
  export const apply: (ctx: unknown) => Promise<void> | void
  export const inject: readonly string[]
}
