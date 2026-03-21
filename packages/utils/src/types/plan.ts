/**
 * 计划范围。
 *
 * - main: 当前主计划，通常承载长期目标。
 * - active: 当前活跃执行中的短期计划。
 */
export type PlanScope = "main" | "active";

/**
 * 计划状态。
 */
export type PlanStatus = "active" | "completed" | "abandoned" | "superseded";

/**
 * 计划来源。
 *
 * - llm: 由 LLM 在 tick 决策阶段提出；
 * - system: 由系统逻辑直接写入；
 * - user: 预留给未来人工干预入口。
 */
export type PlanSource = "llm" | "system" | "user";

/**
 * 计划项。
 *
 * 说明：
 * - id 由业务侧按标题与范围生成稳定标识；
 * - parentPlanId 用于表达活跃计划挂靠到主计划的引用关系；
 * - reason / source / expiresAt 为后续生命周期治理与记忆提炼保留稳定字段。
 */
export interface PlanItem {
  id: string;
  title: string;
  scope: PlanScope;
  status: PlanStatus;
  parentPlanId?: string;
  reason?: string;
  source: PlanSource;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Redis 中保存的当前计划真相源。
 */
export interface PlanState {
  mainPlanId?: string;
  activePlanIds: string[];
  mainPlan?: PlanItem;
  activePlans: PlanItem[];
  updatedAt: string;
}

/**
 * LLM 在 tick 阶段给出的计划变更提议。
 */
export interface PlanProposal {
  mainPlanTitle?: string;
  activePlanTitles?: string[];
  reason?: string;
  source?: PlanSource;
  expiresAt?: string;
}

/**
 * 计划变更类型。
 * superseded 被取代
 */
export type PlanChangeType = "created" | "updated" | "completed" | "abandoned" | "superseded";

/**
 * 单次计划变更记录。
 *
 * 说明：
 * - before / after 用于生成 plan_update episode 以及后续 fact 提炼；
 * - planId 为统一的历史串联锚点。
 */
export interface PlanChange {
  planId: string;
  scope: PlanScope;
  changeType: PlanChangeType;
  before?: PlanItem;
  after?: PlanItem;
}

/**
 * Plan Manager 应用 proposal 后的返回结果。
 */
export interface PlanApplyResult {
  state: PlanState;
  changes: PlanChange[];
  relatedPlanId?: string;
}
