import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import { getYuijuConfig } from "../config";
import { getMemoryDiaries, getRecentMemoryEpisodes } from "../db";
import { isDev } from "../env";
import { rerankEpisodesWithSiliconFlow } from "../llm/rerank";
import { DEFAULT_DIARY_SUBJECT } from "./diary";
import { DEFAULT_MEMORY_SUBJECT_ID } from "./episode";
import { getMemoryServiceClientFromEnv, type MemorySearchItem } from "./memory-service-client";

dayjs.extend(customParseFormat);

export type MemoryQueryType = "episode" | "diary" | "fact";
export type MemoryQueryTimeSort = "asc" | "desc";

export interface MemorySearchInput {
  query: string;
  memoryType: MemoryQueryType;
  startTime?: string;
  endTime?: string;
  timeSort?: MemoryQueryTimeSort;
  counterpartyName?: string;
  topK?: number;
}

export interface MemorySearchResult {
  source: "episode" | "diary" | "fact";
  score: number;
  summary: string;
  happenedAt?: string;
  validFrom?: string;
  validTo?: string;
  evidenceIds: string[];
  metadata?: Record<string, unknown>;
}

const DEFAULT_TOP_K = 5;
const EPISODE_SEARCH_LIMIT = 20;
const EPISODE_RERANK_THRESHOLD = 3;
const MEMORY_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

interface NormalizedMemorySearchInput {
  query: string;
  memoryType: MemoryQueryType;
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

function normalizeDayRange(input: { startTime?: string; endTime?: string }): {
  startDay?: Date;
  endDay?: Date;
} {
  const parsedStartTime = parseMemoryTime(input.startTime ?? "");
  const parsedEndTime = parseMemoryTime(input.endTime ?? "");

  return {
    startDay: parsedStartTime ? dayjs(parsedStartTime).startOf("day").toDate() : undefined,
    endDay: parsedEndTime ? dayjs(parsedEndTime).startOf("day").toDate() : undefined,
  };
}

function isToday(value: Date): boolean {
  return dayjs(value).isSame(dayjs(), "day");
}

function resolveEpisodeTimeFilter(input: NormalizedMemorySearchInput): {
  onlyDate?: Date;
  happenedAfter?: Date;
  happenedBefore?: Date;
} | null {
  const parsedStartTime = parseMemoryTime(input.startTime);
  const parsedEndTime = parseMemoryTime(input.endTime);

  if (parsedStartTime || parsedEndTime) {
    const candidates = [parsedStartTime, parsedEndTime].filter((value): value is Date =>
      Boolean(value),
    );
    if (candidates.some((value) => !isToday(value))) {
      return null;
    }

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

  return {
    onlyDate: dayjs().toDate(),
  };
}

function resolveDiaryTimeFilter(input: NormalizedMemorySearchInput): {
  onlyDate?: Date;
  diaryDateAfter?: Date;
  diaryDateBefore?: Date;
} | null {
  const dayRange = normalizeDayRange(input);

  if (dayRange.startDay || dayRange.endDay) {
    const candidates = [dayRange.startDay, dayRange.endDay].filter((value): value is Date =>
      Boolean(value),
    );
    if (candidates.some((value) => isToday(value))) {
      return null;
    }

    let diaryDateAfter = dayRange.startDay;
    let diaryDateBefore = dayRange.endDay
      ? dayjs(dayRange.endDay).add(1, "day").toDate()
      : undefined;

    if (diaryDateAfter && diaryDateBefore && diaryDateAfter > diaryDateBefore) {
      [diaryDateAfter, diaryDateBefore] = [diaryDateBefore, diaryDateAfter];
    }

    return {
      diaryDateAfter,
      diaryDateBefore,
    };
  }

  return {
    diaryDateBefore: dayjs().startOf("day").toDate(),
  };
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
  counterparty?: string;
  payload?: Record<string, unknown>;
}): string {
  const action =
    typeof doc.payload?.action === "string" ? `行为: ${doc.payload.action}` : undefined;
  const planId = getPlanIdFromPayload(doc.payload);
  const counterparty = doc.counterparty ? `对象: ${doc.counterparty}` : undefined;

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
  const timeRangeFilter = resolveEpisodeTimeFilter(normalized);
  if (!timeRangeFilter) {
    return [];
  }

  const docs = await getRecentMemoryEpisodes({
    limit: Math.max(normalized.topK, EPISODE_SEARCH_LIMIT),
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    isDev: isDev(),
    counterparty: normalized.counterpartyName || undefined,
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
    getYuijuConfig().llm.siliconflowApiKey.trim()
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
 * 查询 Diary 回忆。
 *
 * 说明：
 * - Diary 只负责昨天及更早的“经历回忆”；
 * - 结果直接返回完整日记正文，保持叙事感，不额外拆摘要字段。
 */
export async function searchDiaries(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const timeFilter = resolveDiaryTimeFilter(normalized);
  if (!timeFilter) {
    return [];
  }

  const diaries = await getMemoryDiaries({
    limit: Math.max(normalized.topK, 20),
    subject: DEFAULT_DIARY_SUBJECT,
    isDev: isDev(),
    sortDirection: normalized.timeSort,
    ...timeFilter,
  });

  return diaries
    .map((diary) => ({
      source: "diary" as const,
      score: scoreEpisode(normalized.query, diary.text),
      summary: diary.text,
      happenedAt: dayjs(diary.diaryDate).toISOString(),
      evidenceIds: [String(diary._id)],
      metadata: {
        subject: diary.subject,
        displayDate: dayjs(diary.diaryDate).format("YYYY-MM-DD"),
      },
    }))
    .filter((item) => item.score > 0 || !normalized.query)
    .sort((left, right) => compareResultsByScoreAndTime(left, right, normalized.timeSort))
    .slice(0, normalized.topK);
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

class MemoryQueryRouter {
  async search(input: MemorySearchInput): Promise<MemorySearchResult[]> {
    const normalized = normalizeInput(input);

    if (normalized.memoryType === "episode") {
      return await searchEpisodes(normalized);
    }

    if (normalized.memoryType === "diary") {
      return await searchDiaries(normalized);
    }

    if (normalized.memoryType === "fact") {
      return await searchFacts(normalized);
    }

    return [];
  }
}

export const memoryQueryRouter: MemoryQueryRouter = new MemoryQueryRouter();
