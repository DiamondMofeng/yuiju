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
  | "system";

/**
 * 事实抽取状态。
 *
 * 当前阶段仅作为本地领域模型保留，统一写入时默认使用 pending，
 * 等待 Python 服务升级后再真正下发和消费该字段。
 */
export type MemoryEpisodeExtractionStatus =
  | "pending"
  | "processing"
  | "done"
  | "skipped"
  | "failed";

/**
 * 统一的 Episode 写入模型。
 *
 * 说明：
 * - 该模型当前只在 TS 侧作为领域真相源使用；
 * - payload 保留结构化原始信息，summaryText 则为后续检索/抽取提供稳定摘要；
 * - isDev 用于未来恢复到真实服务端写入时，映射 dev/prod 命名空间。
 */
export interface MemoryEpisode<TPayload = object> {
  id?: string;
  source: MemoryEpisodeSource;
  type: MemoryEpisodeType;
  subjectId: string;
  counterpartyId?: string;
  happenedAt: Date;
  summaryText: string;
  importance: number;
  payload: TPayload;
  extractionStatus: MemoryEpisodeExtractionStatus;
  extractedFactIds?: string[];
  isDev?: boolean;
}

/**
 * 当前阶段写入入参与领域模型保持一致，单独导出仅为后续服务端适配预留边界。
 */
export type MemoryEpisodeWriteInput<TPayload = object> = MemoryEpisode<TPayload>;

/**
 * 当前项目中统一使用的记忆主体标识。
 */
export const DEFAULT_MEMORY_SUBJECT_ID = "ゆいじゅ";
