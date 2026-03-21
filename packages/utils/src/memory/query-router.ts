import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getRecentMemoryEpisodes } from "../db";
import { isDev } from "../env";
import { initPlanStateData } from "../redis";
import { DEFAULT_MEMORY_SUBJECT_ID } from "./episode";
import { getMemoryServiceClientFromEnv, type MemorySearchItem } from "./memory-service-client";
import { rerankEpisodesWithSiliconFlow } from "./rerank";

dayjs.extend(customParseFormat);

export type MemoryQueryType = "episode" | "fact" | "plan";
export type MemoryQueryTimeRange = "today" | "yesterday" | "day_before_yesterday";
export type MemoryQueryTimeSort = "asc" | "desc";

export interface MemorySearchInput {
  query: string;
  memoryType: MemoryQueryType;
  timeRange?: MemoryQueryTimeRange;
  startTime?: string;
  endTime?: string;
  timeSort?: MemoryQueryTimeSort;
  counterpartyName?: string;
  topK?: number;
}

export interface MemorySearchResult {
  source: "episode" | "fact" | "plan";
  score: number;
  summary: string;
  happenedAt?: string;
  validFrom?: string;
  validTo?: string;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
}

interface MemoryQueryRouter {
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
}

const DEFAULT_TOP_K = 5;
const EPISODE_SEARCH_LIMIT = 20;
const EPISODE_RERANK_THRESHOLD = 3;
const MEMORY_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

interface NormalizedMemorySearchInput {
  query: string;
  memoryType: MemoryQueryType;
  timeRange?: MemoryQueryTimeRange;
  startTime: string;
  endTime: string;
  timeSort: MemoryQueryTimeSort;
  counterpartyName: string;
  topK: number;
}

function normalizeTopK(topK?: number): number {
  if (!Number.isFinite(topK)) {
    return DEFAULT_TOP_K;
  }

  return Math.max(1, Math.min(Number(topK), 20));
}

function normalizeInput(input: MemorySearchInput): NormalizedMemorySearchInput {
  const normalizedStartTime = input.startTime?.trim() ?? "";
  const normalizedEndTime = input.endTime?.trim() ?? "";

  return {
    query: input.query.trim(),
    memoryType: input.memoryType,
    timeRange: input.timeRange,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    timeSort: input.timeSort ?? "desc",
    counterpartyName: input.counterpartyName?.trim() ?? "",
    topK: normalizeTopK(input.topK),
  };
}

function parseMemoryTime(value: string): Date | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = dayjs(value, MEMORY_TIME_FORMAT, true);
  if (!parsed.isValid()) {
    return undefined;
  }

  return parsed.toDate();
}

function scoreEpisode(query: string, summaryText: string): number {
  const normalizedQuery = query.trim();
  if (!normalizedQuery) {
    return 0;
  }

  let score = 0;
  for (const token of normalizedQuery.split(/\s+/)) {
    if (summaryText.includes(token)) {
      score += 1;
    }
  }

  return score;
}

function scorePlan(query: string, title: string): number {
  const score = scoreEpisode(query, title);
  return score > 0 ? score : 1;
}

function getTimeRangeBounds(input: {
  timeRange?: MemoryQueryTimeRange;
  startTime?: string;
  endTime?: string;
}): {
  happenedAfter?: Date;
  happenedBefore?: Date;
  onlyDate?: Date;
} {
  // 精确时间优先于快捷时间；若 LLM 仅填对一侧，则退化为单边时间过滤。
  const parsedStartTime = parseMemoryTime(input.startTime ?? "");
  const parsedEndTime = parseMemoryTime(input.endTime ?? "");

  if (parsedStartTime || parsedEndTime) {
    let happenedAfter = parsedStartTime;
    let happenedBefore = parsedEndTime;

    if (happenedAfter && happenedBefore && happenedAfter > happenedBefore) {
      [happenedAfter, happenedBefore] = [happenedBefore, happenedAfter];
    }

    return {
      happenedAfter,
      happenedBefore,
    };
  }

  if (input.timeRange === "today") {
    return {
      onlyDate: dayjs().toDate(),
    };
  }

  if (input.timeRange === "yesterday") {
    return {
      onlyDate: dayjs().subtract(1, "day").toDate(),
    };
  }

  if (input.timeRange === "day_before_yesterday") {
    return {
      onlyDate: dayjs().subtract(2, "day").toDate(),
    };
  }

  return {};
}

function getPlanIdFromPayload(payload: Record<string, unknown> | undefined): string | null {
  if (typeof payload?.relatedPlanId === "string") {
    return payload.relatedPlanId;
  }
  if (typeof payload?.planId === "string") {
    return payload.planId;
  }
  return null;
}

function normalizeEvidenceIds(item: MemorySearchItem): string[] {
  if (Array.isArray(item.evidenceIds)) {
    return item.evidenceIds.filter((value): value is string => typeof value === "string");
  }

  if (Array.isArray(item.evidence_ids)) {
    return item.evidence_ids.filter((value): value is string => typeof value === "string");
  }

  return [];
}

function normalizeFactMetadata(item: MemorySearchItem): Record<string, unknown> | undefined {
  const metadata = item.metadata ?? {};

  const rawExtras: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    if (
      key === "memory" ||
      key === "time" ||
      key === "source" ||
      key === "score" ||
      key === "validFrom" ||
      key === "validTo" ||
      key === "valid_from" ||
      key === "valid_to" ||
      key === "evidenceIds" ||
      key === "evidence_ids" ||
      key === "metadata"
    ) {
      continue;
    }
    rawExtras[key] = value;
  }

  const mergedMetadata: Record<string, unknown> = {
    ...rawExtras,
    ...metadata,
  };

  if (item.source) {
    mergedMetadata.source = item.source;
  }

  return Object.keys(mergedMetadata).length > 0 ? mergedMetadata : undefined;
}

function getSortableTimestamp(result: MemorySearchResult): number {
  const value = result.happenedAt ?? result.validFrom ?? result.validTo;
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function compareResultsByScoreAndTime(
  left: MemorySearchResult,
  right: MemorySearchResult,
  timeSort: MemoryQueryTimeSort,
): number {
  // 排序语义固定为“先相关度，后时间”，避免 timeSort 影响召回相关性。
  if (right.score !== left.score) {
    return right.score - left.score;
  }

  const timeDiff = getSortableTimestamp(right) - getSortableTimestamp(left);
  return timeSort === "asc" ? -timeDiff : timeDiff;
}

function buildEpisodeRerankDocument(doc: {
  summaryText: string;
  type: string;
  counterpartyId?: string;
  payload?: Record<string, unknown>;
}): string {
  const action =
    typeof doc.payload?.action === "string" ? `行为: ${doc.payload.action}` : undefined;
  const planId = getPlanIdFromPayload(doc.payload);
  const counterparty = doc.counterpartyId ? `对象: ${doc.counterpartyId}` : undefined;

  return [
    doc.summaryText,
    `类型: ${doc.type}`,
    action,
    counterparty,
    planId ? `计划: ${planId}` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

/**
 * 查询 Episode 记忆。
 *
 * 说明：
 * - 统一在 Mongo Episode 集合中按时间窗口与对象过滤；
 * - 返回结构会补充 episodeType / planId 等 metadata，供上游稳定消费。
 */
export async function searchEpisodes(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const timeRangeFilter = getTimeRangeBounds(normalized);
  const docs = await getRecentMemoryEpisodes({
    limit: Math.max(normalized.topK, EPISODE_SEARCH_LIMIT),
    subjectId: DEFAULT_MEMORY_SUBJECT_ID,
    isDev: isDev(),
    counterpartyId: normalized.counterpartyName || undefined,
    sortDirection: normalized.timeSort,
    ...timeRangeFilter,
  });

  const candidates = docs
    .map((doc) => {
      const score = scoreEpisode(normalized.query, doc.summaryText);
      const planId = getPlanIdFromPayload(doc.payload);

      return {
        item: {
          source: "episode" as const,
          score,
          summary: doc.summaryText,
          happenedAt: dayjs(doc.happenedAt).toISOString(),
          evidenceIds: [String(doc._id)],
          metadata: {
            episodeType: doc.type,
            planId,
            source: doc.source,
            displayTime: dayjs(doc.happenedAt).format("MM-DD HH:mm"),
          },
        },
        document: buildEpisodeRerankDocument(doc),
        result: {
          source: "episode" as const,
          score,
          summary: doc.summaryText,
          happenedAt: dayjs(doc.happenedAt).toISOString(),
          evidenceIds: [String(doc._id)],
          metadata: {
            episodeType: doc.type,
            planId,
            source: doc.source,
            displayTime: dayjs(doc.happenedAt).format("MM-DD HH:mm"),
          },
        },
      };
    })
    .filter((item) => item.result.score > 0 || !normalized.query)
    .sort((left, right) => {
      return compareResultsByScoreAndTime(left.result, right.result, normalized.timeSort);
    });

  if (
    normalized.query &&
    candidates.length > EPISODE_RERANK_THRESHOLD &&
    process.env.SILICONFLOW_API_KEY?.trim()
  ) {
    const reranked = await rerankEpisodesWithSiliconFlow({
      query: normalized.query,
      topK: normalized.topK,
      candidates,
    });

    if (reranked) {
      return reranked;
    }
  }

  return candidates.slice(0, normalized.topK).map((candidate) => candidate.result);
}

/**
 * 查询长期事实记忆。
 *
 * 说明：
 * - 当前调用 Python memory service；
 * - 服务端证据字段尚未完全稳定时，这里负责兼容新旧返回结构。
 */
export async function searchFacts(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const client = getMemoryServiceClientFromEnv();
  if (!client) {
    return [];
  }

  const facts = await client.searchMemory({
    query: normalized.query,
    top_k: normalized.topK,
    counterparty_name: normalized.counterpartyName || undefined,
    is_dev: isDev(),
  });

  return facts
    .map((item) => ({
      source: "fact" as const,
      score: item.score ?? 0,
      summary: item.memory,
      happenedAt: item.time ?? undefined,
      validFrom: item.validFrom ?? item.valid_from ?? undefined,
      validTo: item.validTo ?? item.valid_to ?? undefined,
      evidenceIds: normalizeEvidenceIds(item),
      metadata: normalizeFactMetadata(item),
    }))
    .sort((left, right) => compareResultsByScoreAndTime(left, right, normalized.timeSort))
    .slice(0, normalized.topK);
}

/**
 * 查询当前计划状态。
 *
 * 说明：
 * - 计划读取直接以 Redis plan_state 为准；
 * - 返回 planId 作为 evidenceIds，便于后续与计划历史串联。
 */
export async function searchPlans(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const planState = await initPlanStateData();
  const items: MemorySearchResult[] = [];

  if (planState.mainPlan) {
    items.push({
      source: "plan",
      score: scorePlan(normalized.query, planState.mainPlan.title),
      summary: `当前主计划：${planState.mainPlan.title}`,
      happenedAt: planState.mainPlan.updatedAt,
      evidenceIds: [planState.mainPlan.id],
      metadata: {
        planId: planState.mainPlan.id,
        scope: planState.mainPlan.scope,
        status: planState.mainPlan.status,
      },
    });
  }

  for (const plan of planState.activePlans) {
    items.push({
      source: "plan",
      score: scorePlan(normalized.query, plan.title),
      summary: `当前活跃计划：${plan.title}`,
      happenedAt: plan.updatedAt,
      evidenceIds: [plan.id],
      metadata: {
        planId: plan.id,
        scope: plan.scope,
        status: plan.status,
      },
    });
  }

  return items
    .sort((left, right) => compareResultsByScoreAndTime(left, right, normalized.timeSort))
    .slice(0, normalized.topK);
}

class DefaultMemoryQueryRouter implements MemoryQueryRouter {
  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const normalized = normalizeInput(input);

    if (normalized.memoryType === "episode") {
      return await searchEpisodes(normalized);
    }

    if (normalized.memoryType === "fact") {
      return await searchFacts(normalized);
    }

    if (normalized.memoryType === "plan") {
      return await searchPlans(normalized);
    }

    return [];
  }
}

export const memoryQueryRouter: MemoryQueryRouter = new DefaultMemoryQueryRouter();
