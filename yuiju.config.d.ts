import type { YuijuConfig } from "./packages/utils/src/config/config-schema";

/**
 * 项目根配置文件的类型声明。
 *
 * 说明：
 * - 本地开发环境通常会提供被 gitignore 忽略的 yuiju.config.ts 作为真实运行时配置；
 * - CI 环境中该文件可能不存在，因此通过同名 .d.ts 为 TypeScript 提供稳定的模块解析结果；
 * - 这里仅声明默认导出类型，不参与任何运行时逻辑。
 */
declare const config: YuijuConfig;

export default config;
