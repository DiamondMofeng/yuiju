import dayjs from "dayjs";
import type { MemoryEpisodeType, MemoryEpisodeWriteInput } from "../../memory/episode";
import { connectDB } from "../connect";
import { type IMemoryEpisode, MemoryEpisodeModel } from "../schema/memory-episode.schema";

export interface GetRecentMemoryEpisodesOptions {
  limit?: number;
  skip?: number;
  types?: MemoryEpisodeType[];
  subject?: string;
  isDev?: boolean;
  onlyDate?: Date;
  happenedAfter?: Date;
  happenedBefore?: Date;
  sortDirection?: "asc" | "desc";
  sortField?: "happenedAt" | "createdAt";
}

/**
 * 保存统一 Episode 到 MongoDB。
 */
export async function saveMemoryEpisode(input: MemoryEpisodeWriteInput): Promise<IMemoryEpisode> {
  await connectDB();
  const episode = new MemoryEpisodeModel({
    ...input,
    payload: input.payload as Record<string, unknown>,
    isDev: input.isDev ?? false,
  });
  return await episode.save();
}

export async function getMemoryEpisodeById(id: string): Promise<IMemoryEpisode | null> {
  await connectDB();
  return await MemoryEpisodeModel.findById(id).exec();
}

export interface UpdateMemoryEpisodeByIdInput {
  summaryText?: string;
  payload?: Record<string, unknown>;
}

export async function updateMemoryEpisodeById(
  id: string,
  input: UpdateMemoryEpisodeByIdInput,
): Promise<IMemoryEpisode | null> {
  await connectDB();

  const update: Record<string, unknown> = {};

  if (input.summaryText !== undefined) {
    update.summaryText = input.summaryText;
  }

  if (input.payload !== undefined) {
    update.payload = input.payload;
  }

  if (Object.keys(update).length === 0) {
    return await MemoryEpisodeModel.findById(id).exec();
  }

  return await MemoryEpisodeModel.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();
}

/**
 * 查询最近 Episode。
 *
 * 说明：
 * - 默认按发生时间倒序返回；
 * - onlyDate 用于按某个自然日过滤，适配“今天 / 昨天 / 前天”等快捷时间查询。
 */
export async function getRecentMemoryEpisodes(
  options: GetRecentMemoryEpisodesOptions = {},
): Promise<IMemoryEpisode[]> {
  await connectDB();
  const filter = buildRecentMemoryEpisodesFilter(options);

  const sortDirection = options.sortDirection === "asc" ? 1 : -1;
  const primarySortField = options.sortField ?? "happenedAt";

  return await MemoryEpisodeModel.find(filter)
    .sort(
      primarySortField === "createdAt"
        ? { createdAt: sortDirection, happenedAt: sortDirection }
        : { happenedAt: sortDirection, createdAt: sortDirection },
    )
    .skip(options.skip ?? 0)
    .limit(options.limit ?? 10)
    .exec();
}

export async function countRecentMemoryEpisodes(
  options: GetRecentMemoryEpisodesOptions = {},
): Promise<number> {
  await connectDB();

  return await MemoryEpisodeModel.countDocuments(buildRecentMemoryEpisodesFilter(options)).exec();
}

function buildRecentMemoryEpisodesFilter(
  options: GetRecentMemoryEpisodesOptions,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (options.types?.length) {
    filter.type = { $in: options.types };
  }
  if (options.subject) {
    filter.subject = options.subject;
  }
  if (typeof options.isDev === "boolean") {
    filter.isDev = options.isDev;
  }
  if (options.onlyDate) {
    const startOfTargetDate = dayjs(options.onlyDate).startOf("day");
    const startOfNextDate = startOfTargetDate.add(1, "day");
    filter.happenedAt = {
      $gte: startOfTargetDate.toDate(),
      $lt: startOfNextDate.toDate(),
    };
  } else if (options.happenedAfter || options.happenedBefore) {
    filter.happenedAt = {};
    if (options.happenedAfter) {
      (filter.happenedAt as Record<string, Date>).$gte = options.happenedAfter;
    }
    if (options.happenedBefore) {
      (filter.happenedAt as Record<string, Date>).$lt = options.happenedBefore;
    }
  }

  return filter;
}
