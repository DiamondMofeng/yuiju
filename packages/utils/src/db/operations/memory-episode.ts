import dayjs from "dayjs";
import type { MemoryEpisodeType, MemoryEpisodeWriteInput } from "../../memory/episode";
import { hasSyncMongoUri, type MongoReadSource } from "../connect";
import { getMemoryEpisodeModel, type IMemoryEpisode } from "../schema/memory-episode.schema";

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
  readFrom?: MongoReadSource;
}

/**
 * 保存统一 Episode 到 MongoDB。
 */
export async function saveMemoryEpisode(input: MemoryEpisodeWriteInput): Promise<IMemoryEpisode> {
  const model = await getMemoryEpisodeModel();
  const episode = new model({
    ...input,
    payload: input.payload as Record<string, unknown>,
    isDev: input.isDev ?? false,
  });
  const savedEpisode = await episode.save();
  await syncMemoryEpisodeDocument(savedEpisode);
  return savedEpisode;
}

export async function getMemoryEpisodeById(
  id: string,
  options: { readFrom?: MongoReadSource } = {},
): Promise<IMemoryEpisode | null> {
  const model = await getMemoryEpisodeModel(options.readFrom);
  return await model.findById(id).exec();
}

export interface UpdateMemoryEpisodeByIdInput {
  summaryText?: string;
  payload?: Record<string, unknown>;
}

export async function updateMemoryEpisodeById(
  id: string,
  input: UpdateMemoryEpisodeByIdInput,
): Promise<IMemoryEpisode | null> {
  const update: Record<string, unknown> = {};

  if (input.summaryText !== undefined) {
    update.summaryText = input.summaryText;
  }

  if (input.payload !== undefined) {
    update.payload = input.payload;
  }

  const model = await getMemoryEpisodeModel();

  if (Object.keys(update).length === 0) {
    return await model.findById(id).exec();
  }

  const updatedEpisode = await model.findByIdAndUpdate(id, { $set: update }, { new: true }).exec();

  if (updatedEpisode) {
    await syncMemoryEpisodeDocument(updatedEpisode);
  }

  return updatedEpisode;
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
  const filter = buildRecentMemoryEpisodesFilter(options);

  const sortDirection = options.sortDirection === "asc" ? 1 : -1;
  const primarySortField = options.sortField ?? "happenedAt";
  const model = await getMemoryEpisodeModel(options.readFrom);

  return await model
    .find(filter)
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
  const model = await getMemoryEpisodeModel(options.readFrom);
  return await model.countDocuments(buildRecentMemoryEpisodesFilter(options)).exec();
}

async function syncMemoryEpisodeDocument(episode: IMemoryEpisode): Promise<void> {
  if (!hasSyncMongoUri()) {
    return;
  }

  try {
    const syncModel = await getMemoryEpisodeModel("sync");
    await syncModel
      .replaceOne(
        { _id: episode._id },
        {
          _id: episode._id,
          source: episode.source,
          type: episode.type,
          subject: episode.subject,
          happenedAt: episode.happenedAt,
          summaryText: episode.summaryText,
          payload: episode.payload,
          isDev: episode.isDev,
          createdAt: episode.createdAt,
          updatedAt: episode.updatedAt,
        },
        { upsert: true },
      )
      .exec();
  } catch (error) {
    console.error(`Sync Mongo write failed: memory_episode ${episode._id}`, error);
  }
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
