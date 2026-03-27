import "@yuiju/utils/env";

import dayjs from "dayjs";
import mongoose from "mongoose";
import {
  connectDB,
  DEFAULT_MEMORY_SUBJECT_ID,
  getMemoryDiaries,
  MemoryDiaryModel,
  MemoryEpisodeModel,
  memoryQueryRouter,
  processMemoryEpisode,
  saveMemoryEpisode,
  type IMemoryEpisode,
  type MemoryEpisode,
} from "@yuiju/utils";
import { generateDiaryForDate } from "@/memory/diary";

const DEMO_IS_DEV = true;
const DEMO_DATE = new Date("2026-03-19T00:00:00+08:00");
const DEMO_TAG = "memory-capability-demo-v2";

type DemoCategory = "positive" | "negative" | "boundary";

interface DemoExpectation {
  shouldBecomeFact: boolean;
  expectedHints: string[];
  note: string;
}

interface DemoEpisodeCase {
  id: string;
  title: string;
  category: DemoCategory;
  episode: MemoryEpisode<Record<string, unknown>>;
  expectation: DemoExpectation;
}

interface SavedDemoEpisode {
  demoCase: DemoEpisodeCase;
  doc: IMemoryEpisode;
}

interface MemoryQueryCase {
  title: string;
  query: string;
  memoryType: "fact" | "diary";
  startTime?: string;
  endTime?: string;
  topK?: number;
  expectation: string;
}

interface ConversationMessageItem {
  speaker_name: string;
  content: string;
  timestamp: string;
}

/**
 * 构建对话类 Episode。
 *
 * 说明：
 * - 对话 payload 尽量贴近正式写库结构，便于直接复用当前抽取与日记生成链路；
 * - summaryText 保留最关键的最近片段，方便 Mongo 侧快速人工排查。
 */
function createConversationEpisode(input: {
  caseId: string;
  counterpartyName: string;
  happenedAt: Date;
  messages: ConversationMessageItem[];
}): MemoryEpisode<Record<string, unknown>> {
  const previewText = input.messages
    .slice(-3)
    .map((message) => `${message.speaker_name}：${message.content}`)
    .join(" | ");

  return {
    source: "chat",
    type: "conversation",
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    counterparty: input.counterpartyName,
    happenedAt: input.happenedAt,
    summaryText: [
      `【${DEMO_TAG} / ${input.caseId}】悠酱与 ${input.counterpartyName} 发生了一段对话`,
      `最近内容：${previewText}`,
    ].join("；"),
    extractionStatus: "pending",
    isDev: DEMO_IS_DEV,
    payload: {
      demoTag: DEMO_TAG,
      demoCaseId: input.caseId,
      counterpartyName: input.counterpartyName,
      messageCount: input.messages.length,
      windowStart: input.messages[0]?.timestamp ?? input.happenedAt.toISOString(),
      windowEnd: input.messages.at(-1)?.timestamp ?? input.happenedAt.toISOString(),
      messages: input.messages,
    },
  };
}

/**
 * 构建行为类 Episode。
 *
 * 说明：
 * - 这里专门放一个“一次性购买饮料”的边界样本，用于观察系统是否会误记成稳定偏好；
 * - payload 只保留当前抽取逻辑真正会消费的核心字段。
 */
function createBehaviorEpisode(input: {
  caseId: string;
  happenedAt: Date;
  action: string;
  reason: string;
  executionResult: string;
  durationMinutes: number;
  location: string;
}): MemoryEpisode<Record<string, unknown>> {
  return {
    source: "world_tick",
    type: "behavior",
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    happenedAt: input.happenedAt,
    summaryText: [
      `【${DEMO_TAG} / ${input.caseId}】悠酱执行了行为「${input.action}」`,
      `原因：${input.reason}`,
      `结果：${input.executionResult}`,
    ].join("；"),
    extractionStatus: "pending",
    isDev: DEMO_IS_DEV,
    payload: {
      demoTag: DEMO_TAG,
      demoCaseId: input.caseId,
      action: input.action,
      reason: input.reason,
      executionResult: input.executionResult,
      durationMinutes: input.durationMinutes,
      location: input.location,
    },
  };
}

/**
 * 构建计划生命周期 Episode。
 *
 * 说明：
 * - 一个正例用于测试“主计划”是否能沉淀为长期记忆；
 * - 一个边界例用于测试计划执行细节是否会被过度记忆。
 */
function createPlanEpisode(input: {
  caseId: string;
  type: MemoryEpisode["type"];
  happenedAt: Date;
  summaryText: string;
  planId: string;
  planScope: "main" | "active";
  changeType: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  changeReason: string;
}): MemoryEpisode<Record<string, unknown>> {
  return {
    source: "world_tick",
    type: input.type,
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    happenedAt: input.happenedAt,
    summaryText: `【${DEMO_TAG} / ${input.caseId}】${input.summaryText}`,
    extractionStatus: "pending",
    isDev: DEMO_IS_DEV,
    payload: {
      demoTag: DEMO_TAG,
      demoCaseId: input.caseId,
      planId: input.planId,
      planScope: input.planScope,
      changeType: input.changeType,
      before: input.before,
      after: input.after,
      changeReason: input.changeReason,
    },
  };
}

/**
 * 构建本轮记忆能力评测样本。
 *
 * 说明：
 * - 所有样本都落在同一天，便于同时测试 facts 与 diary；
 * - 正例、反例、边界例混合放入，方便观察系统是否“该记住的记住，不该记住的别乱记”。
 */
function buildDemoEpisodeCases(): DemoEpisodeCase[] {
  return [
    {
      id: "preference-dessert-tea",
      title: "稳定偏好：霜莓千层蛋糕与柚香热红茶",
      category: "positive",
      episode: createConversationEpisode({
        caseId: "preference-dessert-tea",
        counterpartyName: "小满",
        happenedAt: new Date("2026-03-19T09:15:00+08:00"),
        messages: [
          {
            speaker_name: "小满",
            content: "如果让你连续选甜品和饮料，你大多会选什么？",
            timestamp: "2026-03-19 09:10:00",
          },
          {
            speaker_name: "ゆいじゅ",
            content: "甜品的话，我长期最偏爱霜莓千层蛋糕，基本不会改。",
            timestamp: "2026-03-19 09:12:00",
          },
          {
            speaker_name: "ゆいじゅ",
            content: "饮料我也总会先选柚香热红茶，这个口味最让我安心。",
            timestamp: "2026-03-19 09:15:00",
          },
        ],
      }),
      expectation: {
        shouldBecomeFact: true,
        expectedHints: ["霜莓千层蛋糕", "柚香热红茶"],
        note: "这是稳定偏好的标准正例，应该进入长期记忆。",
      },
    },
    {
      id: "negative-greeting",
      title: "寒暄反例：普通问候不应进入长期记忆",
      category: "negative",
      episode: createConversationEpisode({
        caseId: "negative-greeting",
        counterpartyName: "夏实",
        happenedAt: new Date("2026-03-19T11:30:00+08:00"),
        messages: [
          {
            speaker_name: "夏实",
            content: "早安呀，今天也要加油。",
            timestamp: "2026-03-19 11:28:00",
          },
          {
            speaker_name: "ゆいじゅ",
            content: "早安，也祝你今天顺利。",
            timestamp: "2026-03-19 11:30:00",
          },
        ],
      }),
      expectation: {
        shouldBecomeFact: false,
        expectedHints: [],
        note: "普通寒暄没有长期价值，理应被丢弃。",
      },
    },
    {
      id: "boundary-once-drink",
      title: "一次性行为：顺手买海盐青柠汽水",
      category: "boundary",
      episode: createBehaviorEpisode({
        caseId: "boundary-once-drink",
        happenedAt: new Date("2026-03-19T14:20:00+08:00"),
        action: "购买海盐青柠汽水",
        reason: "路过自动贩卖机时一时兴起，想喝点冰的。",
        executionResult: "喝完觉得还行，但没有继续讨论，也没有复购打算。",
        durationMinutes: 8,
        location: "学校走廊",
      }),
      expectation: {
        shouldBecomeFact: false,
        expectedHints: [],
        note: "单次消费不应被误记成稳定喜好。",
      },
    },
    {
      id: "relation-trust-chengfeng",
      title: "关系信号：对澄风的信任增强",
      category: "positive",
      episode: createConversationEpisode({
        caseId: "relation-trust-chengfeng",
        counterpartyName: "澄风",
        happenedAt: new Date("2026-03-19T17:45:00+08:00"),
        messages: [
          {
            speaker_name: "澄风",
            content: "如果你今晚还想复盘，我可以继续陪你一起整理笔记。",
            timestamp: "2026-03-19 17:39:00",
          },
          {
            speaker_name: "ゆいじゅ",
            content: "谢谢你，这几次一起复盘后，我越来越信任你了。",
            timestamp: "2026-03-19 17:42:00",
          },
          {
            speaker_name: "ゆいじゅ",
            content: "以后我如果又卡住，大概会先来找你商量。",
            timestamp: "2026-03-19 17:45:00",
          },
        ],
      }),
      expectation: {
        shouldBecomeFact: true,
        expectedHints: ["澄风", "信任"],
        note: "这是可持续的关系变化，应该进入 relation fact。",
      },
    },
    {
      id: "plan-main-ranzan",
      title: "主计划：准备岚山夜景采风",
      category: "positive",
      episode: createPlanEpisode({
        caseId: "plan-main-ranzan",
        type: "plan_created",
        happenedAt: new Date("2026-03-19T20:30:00+08:00"),
        summaryText: "悠酱创建了主计划：准备岚山夜景采风",
        planId: "demo-plan-main-ranzan",
        planScope: "main",
        changeType: "created",
        after: {
          id: "demo-plan-main-ranzan",
          title: "准备岚山夜景采风",
          status: "active",
          source: "system",
        },
        changeReason: "把这件事确认为当前阶段最重要的主计划。",
      }),
      expectation: {
        shouldBecomeFact: true,
        expectedHints: ["岚山夜景采风", "主计划"],
        note: "主计划属于长期状态信息，应稳定进入记忆。",
      },
    },
    {
      id: "plan-detail-train-price",
      title: "计划细节边界：今晚先比较车票价格",
      category: "boundary",
      episode: createPlanEpisode({
        caseId: "plan-detail-train-price",
        type: "plan_updated",
        happenedAt: new Date("2026-03-19T21:10:00+08:00"),
        summaryText: "悠酱更新了活跃计划：今晚先比较车票价格",
        planId: "demo-plan-active-budget",
        planScope: "active",
        changeType: "updated",
        before: {
          id: "demo-plan-active-budget",
          title: "整理岚山采风预算",
          status: "active",
          parentPlanId: "demo-plan-main-ranzan",
          source: "system",
        },
        after: {
          id: "demo-plan-active-budget",
          title: "今晚先比较车票价格",
          status: "active",
          parentPlanId: "demo-plan-main-ranzan",
          source: "system",
        },
        changeReason: "这是执行层的临时细节调整，不应该沉淀为长期记忆。",
      }),
      expectation: {
        shouldBecomeFact: false,
        expectedHints: [],
        note: "计划执行细节通常不该进入长期记忆。",
      },
    },
  ];
}

/**
 * 清理本轮 dev 测试数据。
 *
 * 说明：
 * - 根据你的要求，只清理 Mongo 里的 dev episode 与 dev diary；
 * - 不额外清理外部 memory service 的历史 dev facts，避免把脚本职责做得太重。
 */
async function clearDevCollections(): Promise<void> {
  await connectDB();

  const [episodeDeleteResult, diaryDeleteResult] = await Promise.all([
    MemoryEpisodeModel.deleteMany({ isDev: DEMO_IS_DEV }).exec(),
    MemoryDiaryModel.deleteMany({ isDev: DEMO_IS_DEV }).exec(),
  ]);

  console.log("=== 1. 清理 dev 测试数据 ===");
  console.log(`memory_episode deleted: ${episodeDeleteResult.deletedCount ?? 0}`);
  console.log(`memory_diary deleted: ${diaryDeleteResult.deletedCount ?? 0}`);
}

/**
 * 持久化测试 Episode。
 */
async function saveDemoEpisodes(cases: DemoEpisodeCase[]): Promise<SavedDemoEpisode[]> {
  const savedEpisodes: SavedDemoEpisode[] = [];

  for (const demoCase of cases) {
    const doc = await saveMemoryEpisode(demoCase.episode);
    savedEpisodes.push({ demoCase, doc });
  }

  return savedEpisodes;
}

/**
 * 打印写入后的原始 Episode，便于人工对照。
 */
function printSeedSummary(savedEpisodes: SavedDemoEpisode[]): void {
  console.log("\n=== 2. 写入的测试 Episode ===");

  for (const { demoCase, doc } of savedEpisodes) {
    console.log(`- [${demoCase.category}] ${demoCase.title}`);
    console.log(`  caseId: ${demoCase.id}`);
    console.log(`  happenedAt: ${dayjs(doc.happenedAt).format("YYYY-MM-DD HH:mm:ss")}`);
    console.log(`  summary: ${doc.summaryText}`);
    console.log(`  expectedHints: ${demoCase.expectation.expectedHints.join("、") || "无"}`);
    console.log(`  shouldBecomeFact: ${demoCase.expectation.shouldBecomeFact}`);
    console.log(`  note: ${demoCase.expectation.note}`);
  }
}

/**
 * 执行正式的事实抽取链路，并回读 Mongo 中的最新状态。
 */
async function processSavedEpisodes(savedEpisodes: SavedDemoEpisode[]): Promise<IMemoryEpisode[]> {
  for (const savedEpisode of savedEpisodes) {
    await processMemoryEpisode(savedEpisode.doc);
  }

  const ids = savedEpisodes
    .map((item) => item.doc.id)
    .filter((value): value is string => Boolean(value));

  return await MemoryEpisodeModel.find({
    _id: { $in: ids },
  })
    .sort({ happenedAt: 1, createdAt: 1 })
    .exec();
}

/**
 * 打印 Episode 抽取状态。
 *
 * 说明：
 * - 这里不直接展示外部 memory service 的内部图谱，只展示本地真相源回写状态；
 * - extractedFactIds 非空时，表示对应 Episode 已成功沉淀出候选事实并写入完成。
 */
function printExtractionSummary(input: {
  savedEpisodes: SavedDemoEpisode[];
  processedDocs: IMemoryEpisode[];
}): void {
  console.log("\n=== 3. 事实抽取结果 ===");

  const processedDocMap = new Map(input.processedDocs.map((doc) => [String(doc._id), doc]));

  for (const savedEpisode of input.savedEpisodes) {
    const processedDoc = processedDocMap.get(String(savedEpisode.doc._id));
    console.log(`- ${savedEpisode.demoCase.title}`);
    console.log(`  status: ${processedDoc?.extractionStatus ?? "unknown"}`);
    console.log(`  extractedFactIds: ${processedDoc?.extractedFactIds?.join("、") || "无"}`);
    console.log(
      `  expected: ${savedEpisode.demoCase.expectation.shouldBecomeFact ? "应被记住" : "不应被记住"}`,
    );
  }
}

/**
 * 生成并打印指定日期的 dev diary。
 */
async function generateAndPrintDiary(): Promise<void> {
  const generated = await generateDiaryForDate({
    diaryDate: DEMO_DATE,
    isDev: DEMO_IS_DEV,
  });

  const diaries = await getMemoryDiaries({
    onlyDate: DEMO_DATE,
    isDev: DEMO_IS_DEV,
    limit: 1,
  });
  const diary = diaries[0];

  console.log("\n=== 4. Diary 生成结果 ===");
  console.log(`generated: ${generated}`);

  if (!diary) {
    console.log("diary: 未生成成功");
    return;
  }

  console.log(`diaryDate: ${dayjs(diary.diaryDate).format("YYYY-MM-DD")}`);
  console.log("\n--- diary text ---\n");
  console.log(diary.text);
}

/**
 * 构建查询评测样本。
 *
 * 说明：
 * - fact 用于验证长期记忆召回；
 * - diary 用于验证日记式回忆；
 * - diary 查询使用固定日期窗口，确保只观察本轮造出的那一天。
 */
function buildQueryCases(): MemoryQueryCase[] {
  return [
    {
      title: "Fact 查询：稳定偏好",
      query: "ゆいじゅ 更偏爱 霜莓千层蛋糕 柚香热红茶",
      memoryType: "fact",
      topK: 3,
      expectation: "应优先召回甜品与饮料偏好。",
    },
    {
      title: "Fact 查询：关系变化",
      query: "ゆいじゅ 信任 澄风",
      memoryType: "fact",
      topK: 3,
      expectation: "应召回对澄风的信任增强。",
    },
    {
      title: "Fact 查询：当前主计划",
      query: "ゆいじゅ 当前 主计划 岚山夜景采风",
      memoryType: "fact",
      topK: 3,
      expectation: "应召回主计划，而不是执行细节。",
    },
    {
      title: "Fact 查询：一次性饮料边界",
      query: "ゆいじゅ 喜欢 海盐青柠汽水",
      memoryType: "fact",
      topK: 3,
      expectation: "理想情况下不应出现把一次性购买误判为长期偏好的结果。",
    },
    {
      title: "Diary 查询：回忆 2026-03-19",
      query: "",
      memoryType: "diary",
      startTime: "2026-03-19 00:00:00",
      endTime: "2026-03-19 23:59:59",
      topK: 1,
      expectation: "应返回刚生成的当日日记。",
    },
  ];
}

/**
 * 打印统一查询结果。
 */
async function runQueryCases(): Promise<void> {
  const queryCases = buildQueryCases();

  console.log("\n=== 5. 记忆查询结果 ===");

  for (const queryCase of queryCases) {
    console.log(`- ${queryCase.title}`);
    console.log(`  memoryType: ${queryCase.memoryType}`);
    console.log(`  query: ${queryCase.query || "(empty query)"}`);
    if (queryCase.startTime || queryCase.endTime) {
      console.log(`  startTime: ${queryCase.startTime ?? "-"}`);
      console.log(`  endTime: ${queryCase.endTime ?? "-"}`);
    }
    console.log(`  expectation: ${queryCase.expectation}`);

    try {
      const results = await memoryQueryRouter.search({
        query: queryCase.query,
        memoryType: queryCase.memoryType,
        startTime: queryCase.startTime,
        endTime: queryCase.endTime,
        topK: queryCase.topK,
      });

      if (results.length === 0) {
        console.log("  results: 无");
        continue;
      }

      for (const [index, result] of results.entries()) {
        console.log(`  result ${index + 1}:`);
        console.log(`    source: ${result.source}`);
        console.log(`    score: ${result.score}`);
        if (result.happenedAt) {
          console.log(`    happenedAt: ${result.happenedAt}`);
        }
        console.log(`    summary: ${result.summary}`);
        console.log(`    evidenceIds: ${result.evidenceIds.join("、") || "无"}`);
      }
    } catch (error) {
      console.log(`  error: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

/**
 * 主入口：清理旧数据、写入样本、执行事实抽取、生成日记、跑查询。
 */
async function demoMemoryCapability(): Promise<void> {
  const demoCases = buildDemoEpisodeCases();

  await clearDevCollections();

  const savedEpisodes = await saveDemoEpisodes(demoCases);
  printSeedSummary(savedEpisodes);

  const processedDocs = await processSavedEpisodes(savedEpisodes);
  printExtractionSummary({
    savedEpisodes,
    processedDocs,
  });

  await generateAndPrintDiary();
  await runQueryCases();
}

export async function main() {
  try {
    await demoMemoryCapability();
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
}
