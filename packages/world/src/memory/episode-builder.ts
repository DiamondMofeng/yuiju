import type {
  ActionAgentDecision,
  ActionContext,
  MemoryEpisode,
  MemoryEpisodeType,
  PlanChange,
  WeatherSnapshot,
} from "@yuiju/utils";
import { ActionId, SUBJECT_NAME } from "@yuiju/utils";

export interface BuildBehaviorEpisodeInput {
  context: ActionContext;
  selectedAction: ActionAgentDecision;
  executionResult?: string;
  durationMinutes: number;
  happenedAt: Date;
  isDev: boolean;
}

export interface BuildPlanUpdateEpisodesInput {
  changes: PlanChange[];
  happenedAt: Date;
  isDev: boolean;
}

interface PlanLifecycleEpisodePayload {
  planId: string;
  planScope: "longTerm" | "shortTerm";
  changeType: PlanChange["changeType"];
  before?: {
    id: string;
    title: string;
    reason?: string;
    source?: string;
    expiresAt?: string;
  };
  after?: {
    id: string;
    title: string;
    reason?: string;
    source?: string;
    expiresAt?: string;
  };
  changeReason: string;
}

interface BehaviorEpisodePayload {
  action: ActionId;
  reason: string;
  executionResult?: string;
  durationMinutes: number;
  location: ActionContext["characterState"]["location"];
  characterStateSnapshot: ReturnType<ActionContext["characterState"]["log"]>;
}

interface WeatherChangedEpisodePayload {
  before: WeatherSnapshot;
  after: WeatherSnapshot;
}

/**
 * 构建行为 Episode。
 *
 * 说明：
 * - 当前只负责把 world 领域上下文映射为统一 Episode；
 * - 不负责真正写入 Graphiti，写入动作由上层 writer 决定。
 */
export function buildBehaviorEpisode(
  input: BuildBehaviorEpisodeInput,
): MemoryEpisode<BehaviorEpisodePayload> | null {
  if (input.selectedAction.action === ActionId.Idle) {
    return null;
  }

  const summaryText = [
    `悠酱执行了行为「${input.selectedAction.action}」`,
    `原因：${input.selectedAction.reason}`,
    input.executionResult ? `结果：${input.executionResult}` : undefined,
    `持续时间：${input.durationMinutes} 分钟`,
  ]
    .filter(Boolean)
    .join("；");

  return {
    source: "world_tick",
    type: "behavior",
    subject: SUBJECT_NAME,
    happenedAt: input.happenedAt,
    summaryText,
    isDev: input.isDev,
    payload: {
      action: input.selectedAction.action,
      reason: input.selectedAction.reason,
      executionResult: input.executionResult,
      durationMinutes: input.durationMinutes,
      location: input.context.characterState.location,
      characterStateSnapshot: input.context.characterState.log(),
    },
  };
}

/**
 * 构建计划生命周期 Episode 列表。
 *
 * 说明：
 * - 每个 PlanChange 都映射为单独的 episode type，方便后续查询和事实提炼；
 * - payload 同时保留 before/after 快照，用于补偿重跑时恢复上下文。
 */
export function buildPlanUpdateEpisodes(
  input: BuildPlanUpdateEpisodesInput,
): MemoryEpisode<PlanLifecycleEpisodePayload>[] {
  return input.changes.flatMap((change) => {
    const episode = createPlanLifecycleEpisode({
      change,
      happenedAt: input.happenedAt,
      isDev: input.isDev,
    });
    return episode ? [episode] : [];
  });
}

/**
 * 构建天气变化 Episode。
 *
 * 说明：
 * - 仅在天气类型或体感温度等级发生变化时写入；
 * - 只负责生成事件真相源，不再附带额外处理状态。
 */
export function buildWeatherChangedEpisode(input: {
  before: WeatherSnapshot | null;
  after: WeatherSnapshot;
  isDev: boolean;
}): MemoryEpisode<WeatherChangedEpisodePayload> | null {
  if (!input.before) {
    return null;
  }

  if (
    input.before.type === input.after.type &&
    input.before.temperatureLevel === input.after.temperatureLevel
  ) {
    return null;
  }

  return {
    source: "system",
    type: "weather_changed",
    subject: SUBJECT_NAME,
    happenedAt: new Date(input.after.periodStartAt),
    summaryText: [
      "天气发生变化",
      `天气：${input.before.type} -> ${input.after.type}`,
      `体感：${input.before.temperatureLevel} -> ${input.after.temperatureLevel}`,
    ].join("；"),
    isDev: input.isDev,
    payload: {
      before: input.before,
      after: input.after,
    },
  };
}

function createPlanLifecycleEpisode(input: {
  change: PlanChange;
  happenedAt: Date;
  isDev: boolean;
}): MemoryEpisode<PlanLifecycleEpisodePayload> | null {
  const { change } = input;
  if (shouldSkipPlanLifecycleEpisode(change)) {
    return null;
  }

  const scopeText = change.scope === "longTerm" ? "长期计划" : "短期计划";
  const actionText = describeChangeType(change.changeType);
  const episodeType = mapPlanChangeTypeToEpisodeType(change.changeType);
  const changeReason = `本次 tick ${actionText}${scopeText}`;

  return {
    source: "world_tick",
    type: episodeType,
    subject: SUBJECT_NAME,
    happenedAt: input.happenedAt,
    summaryText: buildPlanLifecycleSummaryText(change, scopeText, actionText),
    isDev: input.isDev,
    payload: {
      planId: change.planId,
      planScope: change.scope,
      changeType: change.changeType,
      before: change.before
        ? {
            id: change.before.id,
            title: change.before.title,
            reason: change.before.reason,
            source: change.before.source,
            expiresAt: change.before.expiresAt,
          }
        : undefined,
      after: change.after
        ? {
            id: change.after.id,
            title: change.after.title,
            reason: change.after.reason,
            source: change.after.source,
            expiresAt: change.after.expiresAt,
          }
        : undefined,
      changeReason,
    },
  };
}

/**
 * 过滤不值得进入记忆层的计划更新事件。
 *
 * 说明：
 * - 方案 B 约定：只要标题未变化，就视为内部元数据同步，不写入 memory episode；
 * - 计划状态本身仍然会由 PlanManager 正常保存，这里只控制记忆层噪音。
 */
function shouldSkipPlanLifecycleEpisode(change: PlanChange): boolean {
  if (change.changeType !== "updated") {
    return false;
  }

  return !hasPlanTitleChanged(change);
}

function hasPlanTitleChanged(change: Pick<PlanChange, "before" | "after">): boolean {
  return change.before?.title !== change.after?.title;
}

/**
 * 根据不同生命周期事件生成更贴近业务语义的摘要文案。
 *
 * 说明：
 * - created / updated 关注“计划内容”；
 * - completed / abandoned / superseded 关注“原计划进入终态”，避免错误展示成“有了一个同名新计划”。
 */
function buildPlanLifecycleSummaryText(
  change: PlanChange,
  scopeText: string,
  actionText: string,
): string {
  const prefix = `悠酱${actionText}${scopeText}`;
  const planReason = change.after?.reason ?? change.before?.reason;

  switch (change.changeType) {
    case "created":
      return [
        prefix,
        `新计划：${stringifyPlanValue(change.after?.title)}`,
        planReason && `原因：${planReason}`,
      ]
        .filter((item): item is string => Boolean(item))
        .join("；");
    case "updated":
      return [
        prefix,
        `原计划：${stringifyPlanValue(change.before?.title)}`,
        `新计划：${stringifyPlanValue(change.after?.title)}`,
        planReason && `原因：${planReason}`,
      ]
        .filter((item): item is string => Boolean(item))
        .join("；");
    case "completed":
      return [
        prefix,
        `计划：${stringifyPlanValue(change.before?.title)}`,
        "结果：已完成",
        planReason && `原因：${planReason}`,
      ]
        .filter((item): item is string => Boolean(item))
        .join("；");
    case "abandoned":
      return [
        prefix,
        `计划：${stringifyPlanValue(change.before?.title)}`,
        "结果：已放弃",
        planReason && `原因：${planReason}`,
      ]
        .filter((item): item is string => Boolean(item))
        .join("；");
    case "superseded":
      return [
        prefix,
        `计划：${stringifyPlanValue(change.before?.title)}`,
        "结果：已被替代",
        planReason && `原因：${planReason}`,
      ]
        .filter((item): item is string => Boolean(item))
        .join("；");
    default:
      return prefix;
  }
}

function mapPlanChangeTypeToEpisodeType(changeType: PlanChange["changeType"]): MemoryEpisodeType {
  switch (changeType) {
    case "created":
      return "plan_created";
    case "updated":
      return "plan_updated";
    case "completed":
      return "plan_completed";
    case "abandoned":
      return "plan_abandoned";
    case "superseded":
      return "plan_superseded";
    default:
      return "system";
  }
}

function stringifyPlanValue(value?: string | string[]): string {
  if (value === undefined) {
    return "无";
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? value.join("、") : "空列表";
  }

  return value || "空字符串";
}

function describeChangeType(changeType: PlanChange["changeType"]): string {
  switch (changeType) {
    case "created":
      return "创建了";
    case "updated":
      return "更新了";
    case "completed":
      return "完成了";
    case "abandoned":
      return "放弃了";
    case "superseded":
      return "替换了";
    default:
      return "更新了";
  }
}
