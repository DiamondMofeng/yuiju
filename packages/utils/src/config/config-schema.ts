import type { NCWebsocketOptions } from "node-napcat-ts";

/**
 * Napcat 重连配置。
 *
 * 说明：
 * - 这里抽象为项目内部配置类型，避免根配置文件直接依赖第三方 SDK 类型；
 * - 字段保持与 node-napcat-ts 常用配置语义一致，message 包在运行时直接透传即可。
 */
export interface YuijuNapcatReconnectionConfig {
  enable: boolean;
  attempts: number;
  delay: number;
}

/**
 * Napcat WebSocket 连接配置。
 */
export interface YuijuNapcatConfig {
  protocol: "ws" | "wss";
  host: string;
  port: number;
  accessToken: string;
  reconnection?: YuijuNapcatReconnectionConfig;
}

/**
 * 消息服务相关配置。
 */
export interface YuijuMessageConfig {
  napcat: NCWebsocketOptions;
  whiteList: number[];
  groupWhiteList: number[];
}

/**
 * 数据存储相关配置。
 */
export interface YuijuDatabaseConfig {
  mongoUri: string;
  redisUrl: string;
}

/**
 * LLM 提供商相关配置。
 */
export interface YuijuLlmConfig {
  deepseekApiKey: string;
  siliconflowApiKey: string;
  moonshotApiKey: string;
}

/**
 * 项目级运行配置。
 */
export interface YuijuAppConfig {
  publicDeployment: boolean;
}

/**
 * 项目根配置总结构。
 *
 * 说明：
 * - 所有原先散落在 .env / 子包 config.ts 中的运行配置统一收口到这里；
 * - NODE_ENV 仍保留为运行时环境变量，因此不纳入该配置结构。
 */
export interface YuijuConfig {
  app: YuijuAppConfig;
  database: YuijuDatabaseConfig;
  llm: YuijuLlmConfig;
  message: YuijuMessageConfig;
}

/**
 * 为根配置文件提供类型约束与自动补全。
 *
 * 说明：
 * - 该函数本身不做运行时转换，只负责让 yuiju.config.ts 获得清晰的类型提示；
 * - 单独拆到 schema 模块中，避免与配置读取器产生循环依赖。
 */
export function defineYuijuConfig(config: YuijuConfig): YuijuConfig {
  return config;
}
