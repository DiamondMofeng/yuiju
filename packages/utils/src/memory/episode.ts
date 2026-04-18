/**
 * 当前主角色在记忆系统中的默认 subject 标识。
 *
 * 说明：
 * - 目前项目只有单主角场景，subject 直接复用角色名；
 * - 单独导出常量，方便 episode / diary / 检索链路共用统一标识。
 */

/**
 * 统一 Episode 写入来源。
 *
 * 说明：
 * - source 只描述事件来自哪条业务链路；
 * - 具体语义类型由 type 区分。
 */
export type MemoryEpisodeSource = "world_tick" | "chat" | "system";

/**
 * 统一 Episode 事件类型。
 *
 * 说明：
 * - behavior: 世界 tick 中执行的行为事件；
 * - conversation: 对话窗口归档事件；
 * - plan_*: 细粒度计划生命周期事件；
 * - weather_changed: 天气时间片变化事件；
 * - system: 外部注入或系统侧状态变更事件。
 */
export type MemoryEpisodeType =
  | "behavior"
  | "conversation"
  | "plan_created"
  | "plan_updated"
  | "plan_completed"
  | "plan_abandoned"
  | "plan_superseded"
  | "weather_changed"
  | "system";

/**
 * 统一的 Episode 写入模型。
 *
 * 说明：
 * - 该模型当前只在 TS 侧作为领域真相源使用；
 * - subject 表示“这是谁的人生记录”，即这条 episode 围绕的主语；
 * - 当前项目虽然是单主角场景，subject 基本固定为主角标识，但仍保留该字段，让单条 episode 自身语义完整；
 * - payload 保留结构化原始信息，summaryText 则为后续检索/抽取提供稳定摘要；
 * - isDev 用于未来恢复到真实服务端写入时，映射 dev/prod 命名空间。
 */
export interface MemoryEpisode<TPayload = object> {
  id?: string;
  source: MemoryEpisodeSource;
  type: MemoryEpisodeType;
  subject: string;
  happenedAt: Date;
  summaryText: string;
  payload: TPayload;
  isDev?: boolean;
}

/**
 * 当前阶段写入入参与领域模型保持一致，单独导出仅为后续服务端适配预留边界。
 */
export type MemoryEpisodeWriteInput<TPayload = object> = MemoryEpisode<TPayload>;
