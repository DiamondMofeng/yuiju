/**
 * 当前项目的业务配置统一来自项目根目录的 yuiju.config.ts。
 *
 * 说明：
 * - 这里保留 env 模块，是为了兼容现有大量 `import "@yuiju/utils/env"` 的副作用导入；
 * - 该模块不再负责加载 .env，只保留运行模式判断工具函数。
 */
export const isDev = () => process.env.NODE_ENV === "development";
export const isProd = () => process.env.NODE_ENV === "production";
