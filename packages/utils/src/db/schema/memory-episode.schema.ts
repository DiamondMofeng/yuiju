import dayjs from "dayjs";
import mongoose, { type Document, Schema } from "mongoose";
import type {
  MemoryEpisodeExtractionStatus,
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

function getInMemoryEpisodeStore(): InMemoryEpisode[] {
  if (!globalThis.__yuiju_in_memory_memory_episodes) {
    globalThis.__yuiju_in_memory_memory_episodes = [];
  }

  return globalThis.__yuiju_in_memory_memory_episodes as InMemoryEpisode[];
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
  subjectId: string;
  counterpartyId?: string;
  happenedAt: Date;
  summaryText: string;
  importance: number;
  payload: Record<string, unknown>;
  extractionStatus: MemoryEpisodeExtractionStatus;
  extractedFactIds?: string[];
  isDev: boolean;
  createdAt: Date;
  updatedAt: Date;
}

type InMemoryEpisode = Omit<IMemoryEpisode, keyof Document> & { id: string };

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
      enum: ["behavior", "conversation", "plan_update", "system"],
      required: true,
      index: true,
    },
    subjectId: { type: String, required: true, index: true },
    counterpartyId: { type: String, required: false, index: true },
    happenedAt: { type: Date, required: true, index: true },
    summaryText: { type: String, required: true },
    importance: { type: Number, required: true, default: 0.5 },
    payload: { type: Schema.Types.Mixed, required: true },
    extractionStatus: {
      type: String,
      enum: ["pending", "processing", "done", "skipped", "failed"],
      required: true,
      default: "pending",
      index: true,
    },
    extractedFactIds: {
      type: [String],
      required: false,
      default: undefined,
    },
    isDev: { type: Boolean, required: true, default: false, index: true },
  },
  {
    timestamps: true,
    collection: "memory_episode",
  },
);

MemoryEpisodeSchema.index({ subjectId: 1, happenedAt: -1 });
MemoryEpisodeSchema.index({ subjectId: 1, type: 1, happenedAt: -1 });
MemoryEpisodeSchema.index({ subjectId: 1, isDev: 1, happenedAt: -1 });

export const MemoryEpisodeModel =
  (mongoose.models.MemoryEpisode as mongoose.Model<IMemoryEpisode> | undefined) ??
  mongoose.model<IMemoryEpisode>("MemoryEpisode", MemoryEpisodeSchema);

export interface GetRecentMemoryEpisodesOptions {
  limit?: number;
  types?: MemoryEpisodeType[];
  subjectId?: string;
  isDev?: boolean;
  onlyToday?: boolean;
  happenedAfter?: Date;
  happenedBefore?: Date;
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
      subjectId: input.subjectId,
      counterpartyId: input.counterpartyId,
      happenedAt: input.happenedAt,
      summaryText: input.summaryText,
      importance: input.importance ?? 0.5,
      payload: (input.payload ?? {}) as Record<string, unknown>,
      extractionStatus: "pending",
      extractedFactIds: undefined,
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
 * 更新 Episode 的抽取状态与已写入事实列表。
 */
export async function updateMemoryEpisodeExtraction(
  episodeId: string,
  input: {
    extractionStatus: MemoryEpisodeExtractionStatus;
    extractedFactIds?: string[];
  },
): Promise<void> {
  if (isMongoDisabled()) {
    const store = getInMemoryEpisodeStore();
    const target = store.find((item) => item.id === episodeId);
    if (target) {
      target.extractionStatus = input.extractionStatus;
      target.extractedFactIds = input.extractedFactIds;
      target.updatedAt = new Date();
    }
    return;
  }

  await connectDB();
  await MemoryEpisodeModel.findByIdAndUpdate(episodeId, {
    extractionStatus: input.extractionStatus,
    extractedFactIds: input.extractedFactIds,
  }).exec();
}

/**
 * 查询最近 Episode。
 *
 * 说明：
 * - 默认按发生时间倒序返回；
 * - onlyToday 用于兼容当前“只看今天最近行为”的既有逻辑。
 */
export async function getRecentMemoryEpisodes(
  options: GetRecentMemoryEpisodesOptions = {},
): Promise<IMemoryEpisode[]> {
  if (isMongoDisabled()) {
    const store = getInMemoryEpisodeStore();

    let items = store.slice();
    if (options.types?.length) {
      const types = new Set(options.types);
      items = items.filter((item) => types.has(item.type));
    }
    if (options.subjectId) {
      items = items.filter((item) => item.subjectId === options.subjectId);
    }
    if (typeof options.isDev === "boolean") {
      items = items.filter((item) => item.isDev === options.isDev);
    }
    if (options.onlyToday) {
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

    items.sort((left, right) => {
      const happenedDiff = right.happenedAt.getTime() - left.happenedAt.getTime();
      if (happenedDiff !== 0) return happenedDiff;
      return right.createdAt.getTime() - left.createdAt.getTime();
    });

    return items.slice(0, options.limit ?? 10) as any;
  }

  await connectDB();

  const filter: Record<string, unknown> = {};
  if (options.types?.length) {
    filter.type = { $in: options.types };
  }
  if (options.subjectId) {
    filter.subjectId = options.subjectId;
  }
  if (typeof options.isDev === "boolean") {
    filter.isDev = options.isDev;
  }
  if (options.onlyToday) {
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

  return await MemoryEpisodeModel.find(filter)
    .sort({ happenedAt: -1, createdAt: -1 })
    .limit(options.limit ?? 10)
    .exec();
}
