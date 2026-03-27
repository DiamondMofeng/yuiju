import dayjs from "dayjs";
import mongoose, { type Document, Schema } from "mongoose";
import { connectDB } from "../connect";

/**
 * MongoDB 中的 Diary 条目。
 *
 * 说明：
 * - diaryDate 统一归一化到自然日零点，确保“一天一篇”约束稳定；
 * - text 保留完整日记正文，不额外拆分标题、摘要等结构；
 * - generatedAt / updatedAt 手动维护，避免引入与业务无关的 createdAt。
 */
export interface IMemoryDiary extends Document {
  subject: string;
  diaryDate: Date;
  text: string;
  generatedAt: Date;
  updatedAt: Date;
  isDev: boolean;
}

const MemoryDiarySchema = new Schema<IMemoryDiary>(
  {
    subject: { type: String, required: true, index: true },
    diaryDate: { type: Date, required: true, index: true },
    text: { type: String, required: true },
    generatedAt: { type: Date, required: true },
    updatedAt: { type: Date, required: true },
    isDev: { type: Boolean, required: true, default: false, index: true },
  },
  {
    collection: "memory_diary",
  },
);

MemoryDiarySchema.index({ subject: 1, diaryDate: 1, isDev: 1 }, { unique: true });

export const MemoryDiaryModel =
  (mongoose.models.MemoryDiary as mongoose.Model<IMemoryDiary> | undefined) ??
  mongoose.model<IMemoryDiary>("MemoryDiary", MemoryDiarySchema);

export interface MemoryDiaryWriteInput {
  subject: string;
  diaryDate: Date;
  text: string;
  isDev?: boolean;
}

export interface GetMemoryDiariesOptions {
  limit?: number;
  skip?: number;
  subject?: string;
  isDev?: boolean;
  onlyDate?: Date;
  diaryDateAfter?: Date;
  diaryDateBefore?: Date;
  sortDirection?: "asc" | "desc";
}

function normalizeDiaryDate(value: Date): Date {
  return dayjs(value).startOf("day").toDate();
}

/**
 * 统一构建 Diary 查询条件。
 *
 * 说明：
 * - 日期过滤在这里集中归一化，避免列表查询与总数统计出现条件漂移；
 * - `diaryDateBefore` 语义上是排他上界，便于调用方表达“结束日期 + 1 天”。
 */
function buildMemoryDiaryFilter(options: GetMemoryDiariesOptions = {}): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (options.subject) {
    filter.subject = options.subject;
  }
  if (typeof options.isDev === "boolean") {
    filter.isDev = options.isDev;
  }
  if (options.onlyDate) {
    filter.diaryDate = normalizeDiaryDate(options.onlyDate);
  } else if (options.diaryDateAfter || options.diaryDateBefore) {
    filter.diaryDate = {};
    if (options.diaryDateAfter) {
      (filter.diaryDate as Record<string, Date>).$gte = normalizeDiaryDate(options.diaryDateAfter);
    }
    if (options.diaryDateBefore) {
      (filter.diaryDate as Record<string, Date>).$lt = normalizeDiaryDate(options.diaryDateBefore);
    }
  }

  return filter;
}

/**
 * 按“同主体 + 同自然日”幂等写入或覆盖日记。
 */
export async function upsertMemoryDiary(input: MemoryDiaryWriteInput): Promise<IMemoryDiary> {
  await connectDB();

  const diaryDate = normalizeDiaryDate(input.diaryDate);
  const now = new Date();

  const diary = await MemoryDiaryModel.findOneAndUpdate(
    {
      subject: input.subject,
      diaryDate,
      isDev: input.isDev ?? false,
    },
    {
      $set: {
        text: input.text,
        generatedAt: now,
        updatedAt: now,
      },
      $setOnInsert: {
        subject: input.subject,
        diaryDate,
        isDev: input.isDev ?? false,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    },
  ).exec();

  if (!diary) {
    throw new Error("upsertMemoryDiary failed");
  }

  return diary;
}

/**
 * 查询 Diary 条目。
 *
 * 说明：
 * - onlyDate 用于自然日精确匹配；
 * - 区间查询统一按 diaryDate 过滤，适配昨天及更早的日记回忆。
 */
export async function getMemoryDiaries(
  options: GetMemoryDiariesOptions = {},
): Promise<IMemoryDiary[]> {
  await connectDB();

  const filter = buildMemoryDiaryFilter(options);
  const sortDirection = options.sortDirection === "asc" ? 1 : -1;

  return await MemoryDiaryModel.find(filter)
    .sort({ diaryDate: sortDirection, updatedAt: sortDirection })
    .skip(Math.max(0, options.skip ?? 0))
    .limit(options.limit ?? 10)
    .exec();
}

/**
 * 统计 Diary 条目总数。
 *
 * 说明：
 * - 与列表查询复用同一套 filter 构建逻辑，确保分页总数与列表结果一致。
 */
export async function countMemoryDiaries(options: GetMemoryDiariesOptions = {}): Promise<number> {
  await connectDB();
  return await MemoryDiaryModel.countDocuments(buildMemoryDiaryFilter(options)).exec();
}
