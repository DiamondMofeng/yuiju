import dayjs from "dayjs";
import { SUBJECT_NAME } from "../constants";
import { getMemoryDiaries, getRecentMemoryEpisodes } from "../db";
import { isDev } from "../env";
import { formatProjectTime, parseProjectTime } from "../time";
import { DEFAULT_DIARY_SUBJECT } from "./diary";
import { getMemoryServiceClientFromEnv, type MemorySearchItem } from "./memory-service-client";

export type MemoryQueryType = "episode" | "diary" | "fact";
export type MemoryQueryTimeSort = "asc" | "desc";

export interface MemorySearchInput {
  query?: string;
  memoryType: MemoryQueryType;
  startTime?: string;
  endTime?: string;
  timeSort?: MemoryQueryTimeSort;
  topK?: number;
}

export interface MemorySearchResult {
  source: "episode" | "diary" | "fact";
  score: number;
  summary: string;
  happenedAt?: string;
  validFrom?: string;
  validTo?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_TOP_K = 5;
const MEMORY_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

interface NormalizedMemorySearchInput {
  query: string;
  memoryType: MemoryQueryType;
  startTime: string;
  endTime: string;
  timeSort: MemoryQueryTimeSort;
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
    query: input.query?.trim() ?? "",
    memoryType: input.memoryType,
    startTime: normalizedStartTime,
    endTime: normalizedEndTime,
    timeSort: input.timeSort ?? "desc",
    topK: normalizeTopK(input.topK),
  };
}

function parseMemoryTime(value: string): Date | undefined {
  return parseProjectTime(value, MEMORY_TIME_FORMAT);
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
  if (typeof payload?.planId === "string") {
    return payload.planId;
  }
  return null;
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

/**
 * 查询 Episode 记忆。
 *
 * 说明：
 * - episode 检索只关心时间窗口与返回顺序，不再依赖 query 相关性评分；
 * - 返回结构会补充 episodeType / planId 等 metadata，供上游稳定消费。
 */
export async function searchEpisodes(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const timeRangeFilter = resolveEpisodeTimeFilter(normalized);
  if (!timeRangeFilter) {
    return [];
  }

  const docs = await getRecentMemoryEpisodes({
    limit: normalized.topK,
    subject: SUBJECT_NAME,
    isDev: isDev(),
    sortDirection: normalized.timeSort,
    ...timeRangeFilter,
  });

  return docs.map((doc) => {
    const planId = getPlanIdFromPayload(doc.payload);

    return {
      source: "episode" as const,
      // episode 检索现在只按时间筛选与排序，score 固定为 0 以表达“无相关度参与”。
      score: 0,
      summary: doc.summaryText,
      happenedAt: formatProjectTime(doc.happenedAt, "MM-DD HH:mm"),
      metadata: {
        episodeType: doc.type,
        planId,
        source: doc.source,
        displayTime: formatProjectTime(doc.happenedAt, "MM-DD HH:mm"),
      },
    };
  });
}

/**
 * 查询 Diary 回忆。
 *
 * 说明：
 * - Diary 只负责昨天及更早的“经历回忆”；
 * - 检索只关心日期范围与返回顺序，不再依赖 query 相关性评分；
 * - 结果直接返回完整日记正文，保持叙事感，不额外拆摘要字段。
 */
export async function searchDiaries(input: MemorySearchInput): Promise<MemorySearchResult[]> {
  const normalized = normalizeInput(input);
  const timeFilter = resolveDiaryTimeFilter(normalized);
  if (!timeFilter) {
    return [];
  }

  const diaries = await getMemoryDiaries({
    limit: normalized.topK,
    subject: DEFAULT_DIARY_SUBJECT,
    isDev: isDev(),
    sortDirection: normalized.timeSort,
    ...timeFilter,
  });

  return diaries.map((diary) => ({
    source: "diary" as const,
    // diary 检索现在只按日期范围筛选与排序，score 固定为 0 以表达“无相关度参与”。
    score: 0,
    summary: diary.text,
    happenedAt: formatProjectTime(diary.diaryDate, "YYYY-MM-DD"),
    metadata: {
      subject: diary.subject,
      displayDate: formatProjectTime(diary.diaryDate, "YYYY-MM-DD"),
    },
  }));
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
  if (!normalized.query) {
    return [];
  }

  const client = getMemoryServiceClientFromEnv();
  if (!client) {
    return [];
  }

  const facts = await client.searchMemory({
    query: normalized.query,
    top_k: normalized.topK,
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
      metadata: normalizeFactMetadata(item),
    }))
    .sort((left, right) => compareResultsByScoreAndTime(left, right, normalized.timeSort))
    .slice(0, normalized.topK);
}
