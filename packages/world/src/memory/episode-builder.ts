import type {
  ActionAgentDecision,
  ActionContext,
  MemoryEpisode,
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
