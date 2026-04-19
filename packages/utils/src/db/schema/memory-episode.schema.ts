import dayjs from "dayjs";
import mongoose, { type Document, Schema } from "mongoose";
import type {
  MemoryEpisodeSource,
  MemoryEpisodeType,
  MemoryEpisodeWriteInput,
} from "../../memory/episode";
import { connectDB } from "../connect";

declare global {
  var __yuiju_in_memory_memory_episodes: unknown[] | undefined;
}

function isMongoDisabled(): boolean {
  return process.env.YUIJU_DISABLE_MONGO === "1" || process.env.VITEST === "true";
}

type InMemoryEpisode = Omit<IMemoryEpisode, keyof Document> & { id: string };

function getInMemoryEpisodeStore(): InMemoryEpisode[] {
  globalThis.__yuiju_in_memory_memory_episodes ??= [];
  return globalThis.__yuiju_in_memory_memory_episodes as InMemoryEpisode[];
}

function isOnlyTodayOptions(options: GetRecentMemoryEpisodesOptions): boolean {
  return (options as { onlyToday?: boolean }).onlyToday === true;
}
/**
 * MongoDB 中的统一 Episode 文档。
 *
 * 说明：
 * - payload 使用 Mixed，允许不同事件类型保存各自的结构化明细；
 * - summaryText 作为当前检索与展示的主摘要字段；
 * - createdAt / updatedAt 由 mongoose timestamps 自动维护。
 */
export interface IMemoryEpisode extends Document {
  source: MemoryEpisodeSource;
  type: MemoryEpisodeType;
  subject: string;
  happenedAt: Date;
  summaryText: string;
  payload: Record<string, unknown>;
  isDev: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const MemoryEpisodeSchema = new Schema<IMemoryEpisode>(
  {
    source: {
      type: String,
      enum: ["world_tick", "chat", "system"],
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "behavior",
        "conversation",
        "plan_created",
        "plan_updated",
        "plan_completed",
        "plan_abandoned",
        "weather_changed",
        "system",
      ],
      required: true,
      index: true,
    },
    subject: { type: String, required: true, index: true },
    happenedAt: { type: Date, required: true, index: true },
    summaryText: { type: String, required: true },
    payload: { type: Schema.Types.Mixed, required: true },
    isDev: { type: Boolean, required: true, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "memory_episode",
  },
);

MemoryEpisodeSchema.index({ subject: 1, happenedAt: -1 });
MemoryEpisodeSchema.index({ subject: 1, type: 1, happenedAt: -1 });
MemoryEpisodeSchema.index({ subject: 1, isDev: 1, happenedAt: -1 });

export const MemoryEpisodeModel =
  (mongoose.models.MemoryEpisode as mongoose.Model<IMemoryEpisode> | undefined) ??
  mongoose.model<IMemoryEpisode>("MemoryEpisode", MemoryEpisodeSchema);

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
  if (isMongoDisabled()) {
    const now = new Date();
    const episode: InMemoryEpisode = {
      id: `mem_ep_${now.getTime()}_${Math.random().toString(16).slice(2)}`,
      source: input.source,
      type: input.type,
      subject: input.subject,
      happenedAt: input.happenedAt,
      summaryText: input.summaryText,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      isDev: input.isDev ?? false,
      createdAt: now,
      updatedAt: now,
    };

    getInMemoryEpisodeStore().push(episode);
    return episode as any;
  }

  await connectDB();
  const episode = new MemoryEpisodeModel({
    ...input,
    payload: input.payload as Record<string, unknown>,
    isDev: input.isDev ?? false,
  });
  return await episode.save();
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
  if (isMongoDisabled()) {
    let items = getInMemoryEpisodeStore().slice();

    if (options.types?.length) {
      const types = new Set(options.types);
      items = items.filter((item) => types.has(item.type));
    }
    if (options.subject) {
      items = items.filter((item) => item.subject === options.subject);
    }
    if (typeof options.isDev === "boolean") {
      items = items.filter((item) => item.isDev === options.isDev);
    }
    if (options.onlyDate) {
      const startOfTargetDate = dayjs(options.onlyDate).startOf("day");
      const startOfNextDate = startOfTargetDate.add(1, "day");
      items = items.filter(
        (item) =>
          item.happenedAt >= startOfTargetDate.toDate() &&
          item.happenedAt < startOfNextDate.toDate(),
      );
    } else if (isOnlyTodayOptions(options)) {
      const startOfToday = dayjs().startOf("day");
      const startOfTomorrow = startOfToday.add(1, "day");
      items = items.filter(
        (item) =>
          item.happenedAt >= startOfToday.toDate() && item.happenedAt < startOfTomorrow.toDate(),
      );
    } else if (options.happenedAfter || options.happenedBefore) {
      items = items.filter((item) => {
        if (options.happenedAfter && item.happenedAt < options.happenedAfter) return false;
        if (options.happenedBefore && item.happenedAt >= options.happenedBefore) return false;
        return true;
      });
    }

    const sortDirection = options.sortDirection === "asc" ? 1 : -1;
    const sortField = options.sortField ?? "happenedAt";

    items.sort((left, right) => {
      const primaryDiff =
        sortDirection *
        (sortField === "createdAt"
          ? left.createdAt.getTime() - right.createdAt.getTime()
          : left.happenedAt.getTime() - right.happenedAt.getTime());
      if (primaryDiff !== 0) return primaryDiff;
      return sortDirection * (left.createdAt.getTime() - right.createdAt.getTime());
    });

    const skip = options.skip ?? 0;
    const limit = options.limit ?? 10;
    return items.slice(skip, skip + limit) as any;
  }

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
  if (isMongoDisabled()) {
    const all = await getRecentMemoryEpisodes({
      ...options,
      limit: Number.MAX_SAFE_INTEGER,
      skip: 0,
    });
    return all.length;
  }

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
  } else if (isOnlyTodayOptions(options)) {
    const startOfToday = dayjs().startOf("day");
    const startOfTomorrow = startOfToday.add(1, "day");
    filter.happenedAt = {
      $gte: startOfToday.toDate(),
      $lt: startOfTomorrow.toDate(),
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
