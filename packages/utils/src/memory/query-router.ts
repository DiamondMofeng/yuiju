import dayjs from "dayjs";
import { SUBJECT_NAME } from "../constants";
import { getMemoryDiaries, getRecentMemoryEpisodes } from "../db";
import { isDev } from "../env";
import { formatProjectTime, parseProjectTime } from "../time";
import { DEFAULT_DIARY_SUBJECT } from "./diary";

export type MemoryQueryTimeSort = "asc" | "desc";

export interface EpisodeSearchInput {
  timeSort?: MemoryQueryTimeSort;
  topK?: number;
}

export interface DiarySearchInput {
  startTime?: string;
  endTime?: string;
  timeSort?: MemoryQueryTimeSort;
  topK?: number;
}

export interface EpisodeSearchResult {
  time: string;
  event: string;
}

export interface DiarySearchResult {
  date: string;
  content: string;
}

const DEFAULT_TOP_K = 5;
const MEMORY_TIME_FORMAT = "YYYY-MM-DD HH:mm:ss";

function normalizeTopK(topK?: number): number {
  if (!Number.isFinite(topK)) {
    return DEFAULT_TOP_K;
  }

  return Math.max(1, Math.min(Number(topK), 20));
}

function parseMemoryTime(value?: string): Date | undefined {
  return parseProjectTime(value?.trim() ?? "", MEMORY_TIME_FORMAT);
}

/**
 * 查询今天的 Episode 记忆。
 *
 * 说明：
 * - 固定查询今天整天；
 * - 保留 timeSort 给上层控制返回顺序；
 * - 返回结果只保留 LLM 真正需要的时间和摘要。
 */
export async function searchEpisodes(input: EpisodeSearchInput): Promise<EpisodeSearchResult[]> {
  const limit = normalizeTopK(input.topK);
  const timeSort = input.timeSort ?? "desc";

  const docs = await getRecentMemoryEpisodes({
    limit,
    subject: SUBJECT_NAME,
    isDev: isDev(),
    sortDirection: timeSort,
    onlyDate: dayjs().toDate(),
  });

  return docs.map((doc) => ({
    time: formatProjectTime(doc.happenedAt, "MM-DD HH:mm"),
    event: doc.summaryText,
  }));
}

/**
 * 查询昨天及更早的 Diary 回忆。
 *
 * 说明：
 * - 只接受自然日范围；
 * - 如果不传日期范围，默认查询今天之前的全部日记；
 * - 返回结果只保留 LLM 真正需要的时间和正文。
 */
export async function searchDiaries(input: DiarySearchInput): Promise<DiarySearchResult[]> {
  const limit = normalizeTopK(input.topK);
  const timeSort = input.timeSort ?? "desc";
  const parsedStartTime = parseMemoryTime(input.startTime);
  const parsedEndTime = parseMemoryTime(input.endTime);
  const startDay = parsedStartTime ? dayjs(parsedStartTime).startOf("day").toDate() : undefined;
  const endDay = parsedEndTime ? dayjs(parsedEndTime).startOf("day").toDate() : undefined;

  let diaryDateAfter: Date | undefined;
  let diaryDateBefore: Date | undefined;

  if (startDay || endDay) {
    const candidates = [startDay, endDay].filter((value): value is Date => Boolean(value));

    if (candidates.some((value) => dayjs(value).isSame(dayjs(), "day"))) {
      return [];
    }

    diaryDateAfter = startDay;
    diaryDateBefore = endDay ? dayjs(endDay).add(1, "day").toDate() : undefined;

    if (diaryDateAfter && diaryDateBefore && diaryDateAfter > diaryDateBefore) {
      [diaryDateAfter, diaryDateBefore] = [diaryDateBefore, diaryDateAfter];
    }
  } else {
    diaryDateBefore = dayjs().startOf("day").toDate();
  }

  const diaries = await getMemoryDiaries({
    limit,
    subject: DEFAULT_DIARY_SUBJECT,
    isDev: isDev(),
    sortDirection: timeSort,
    diaryDateAfter,
    diaryDateBefore,
  });

  return diaries.map((diary) => ({
    date: formatProjectTime(diary.diaryDate, "YYYY-MM-DD"),
    content: diary.text,
  }));
}
