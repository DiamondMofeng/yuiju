import "@yuiju/utils/env";

import { connectDB, getMemoryDiaries, getRecentMemoryEpisodes } from "@yuiju/utils";
import mongoose from "mongoose";
import dayjs from "dayjs";
import { generateDiaryForDate } from "@/memory/diary/generator";

const TARGET_DATE = new Date("2026-03-19T00:00:00+08:00");
const TARGET_IS_DEV = false;

/**
 * 执行单日 Diary 生成测试。
 *
 * 说明：
 * - 固定读取数据库中 2026-03-19 且 isDev=false 的 Episode；
 * - 复用正式的日记生成逻辑，确保测试结果与线上生成链路一致；
 * - 生成完成后回读 Diary 集合，并将结果打印到控制台便于人工评估。
 */
async function generateDaily(): Promise<void> {
  await connectDB();

  const episodes = await getRecentMemoryEpisodes({
    onlyDate: TARGET_DATE,
    isDev: TARGET_IS_DEV,
    limit: 500,
    sortDirection: "asc",
  });

  console.log("=== DIARY DEMO CONFIG ===");
  console.log(`date: ${dayjs(TARGET_DATE).format("YYYY-MM-DD")}`);
  console.log(`isDev: ${TARGET_IS_DEV}`);
  console.log(`episodeCount: ${episodes.length}`);

  if (episodes.length === 0) {
    console.log("\n未查询到符合条件的 Episode，终止测试。");
    return;
  }

  const generated = await generateDiaryForDate({
    diaryDate: TARGET_DATE,
    isDev: TARGET_IS_DEV,
  });

  console.log(`generated: ${generated}`);

  const diaries = await getMemoryDiaries({
    onlyDate: TARGET_DATE,
    isDev: TARGET_IS_DEV,
    limit: 1,
  });
  const diary = diaries[0];

  if (!diary) {
    console.log("\nDiary 未生成成功或未写入数据库。");
    return;
  }

  console.log("\n=== GENERATED DIARY ===\n");
  console.log(diary.text);
}

export async function main() {
  try {
    await generateDaily();
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}
