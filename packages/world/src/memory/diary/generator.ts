import { buildDiarySystemPrompt } from "@yuiju/source";
import {
  DEFAULT_DIARY_SUBJECT,
  DEFAULT_MEMORY_SUBJECT_ID,
  deepseekProvider,
  getRecentMemoryEpisodes,
  type IMemoryEpisode,
  minimaxModel,
  upsertMemoryDiary,
} from "@yuiju/utils";
import { generateText } from "ai";
import dayjs from "dayjs";
import { logger } from "@/utils/logger";

const MAX_EPISODES_PER_DAY = 500;
const SLEEP_DIARY_ROLLOVER_HOUR = 6;
const RAW_CONVERSATION_CHAR_BUDGET = 50_000;
const CONVERSATION_EPISODES_PER_CHUNK = 30;

interface ConversationMessage {
  speaker_name: string;
  content: string;
  timestamp: string;
}

interface ConversationPayload {
  counterpartyName?: string;
  subjectName?: string;
  windowStart?: string;
  windowEnd?: string;
  messageCount?: number;
  messages?: ConversationMessage[];
}

interface DiaryMaterialItem {
  type: string;
  happenedAt: string;
  content: string;
}

export interface GenerateDiaryForDateInput {
  diaryDate: Date;
  subject?: string;
  isDev: boolean;
}

function getConversationPayload(episode: IMemoryEpisode): ConversationPayload {
  return (episode.payload ?? {}) as ConversationPayload;
}

function getConversationMessages(episode: IMemoryEpisode): ConversationMessage[] {
  const payload = getConversationPayload(episode);
  return Array.isArray(payload.messages) ? payload.messages : [];
}

function estimateConversationChars(episode: IMemoryEpisode): number {
  return getConversationMessages(episode).reduce((total, message) => {
    return total + message.speaker_name.length + message.content.length + message.timestamp.length;
  }, 0);
}

function buildRawConversationMaterial(episode: IMemoryEpisode): DiaryMaterialItem {
  const payload = getConversationPayload(episode);
  const messages = getConversationMessages(episode)
    .map((message) => `${message.timestamp} ${message.speaker_name}：${message.content}`)
    .join("\n");

  return {
    type: "conversation",
    happenedAt: dayjs(episode.happenedAt).toISOString(),
    content: [
      `对话对象：${payload.counterpartyName ?? episode.counterparty ?? "未知对象"}`,
      `窗口摘要：${episode.summaryText}`,
      messages ? `消息记录：\n${messages}` : undefined,
    ]
      .filter((item): item is string => Boolean(item))
      .join("\n"),
  };
}

function buildConversationEpisodePrompt(episode: IMemoryEpisode): string {
  const payload = getConversationPayload(episode);
  const messages = getConversationMessages(episode)
    .map((message) => `${message.timestamp} ${message.speaker_name}：${message.content}`)
    .join("\n");

  return [
    `对话对象：${payload.counterpartyName ?? episode.counterparty ?? "未知对象"}`,
    `窗口摘要：${episode.summaryText}`,
    messages ? `消息记录：\n${messages}` : undefined,
  ]
    .filter((item): item is string => Boolean(item))
    .join("\n");
}

function chunkConversationEpisodes(episodes: IMemoryEpisode[]): IMemoryEpisode[][] {
  const chunks: IMemoryEpisode[][] = [];
  let currentChunk: IMemoryEpisode[] = [];

  for (const episode of episodes) {
    const shouldFlush = currentChunk.length >= CONVERSATION_EPISODES_PER_CHUNK;

    if (shouldFlush && currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = [];
    }

    currentChunk.push(episode);
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }

  return chunks;
}

async function summarizeConversationEpisodes(input: {
  chunkIndex: number;
  chunkCount: number;
  episodes: IMemoryEpisode[];
}): Promise<DiaryMaterialItem> {
  const result = await generateText({
    model: deepseekProvider("deepseek-chat"),
    prompt: [
      "你是日记生成前的聊天素材压缩器。",
      "请把下面这一组聊天窗口压成一小段自然语言摘要，供后续写日记使用。",
      "目标是帮助模型写出日记，不是做精确信息抽取。",
      "只需要概括这一组聊天大概聊了什么、整体氛围怎样、有哪些悠酱可能会记住的小片段。",
      "不要输出条目列表，不要硬拆对象/话题/情绪字段，不要编造材料里没有的内容。",
      `分组标识：第 ${input.chunkIndex + 1} 组，共 ${input.chunkCount} 组`,
      `聊天窗口数量：${input.episodes.length}`,
      `聊天材料：\n${input.episodes
        .map((episode, index) => `## 窗口 ${index + 1}\n${buildConversationEpisodePrompt(episode)}`)
        .join("\n\n")}`,
    ].join("\n"),
  });

  return {
    type: "conversation_batch_summary",
    happenedAt: dayjs(
      input.episodes.at(-1)?.happenedAt ?? input.episodes[0]?.happenedAt,
    ).toISOString(),
    content: result.text.trim(),
  };
}

async function writeDiaryText(input: {
  subject: string;
  diaryDate: Date;
  materials: DiaryMaterialItem[];
}): Promise<string> {
  const result = await generateText({
    model: minimaxModel,
    system: buildDiarySystemPrompt({
      subject: input.subject,
      diaryDate: input.diaryDate,
    }),
    prompt: [
      "以下是今天真实发生过的素材，请严格基于这些内容写日记。",
      JSON.stringify(
        input.materials.map((item) => ({
          type: item.type,
          happenedAt: item.happenedAt,
          content: item.content,
        })),
        null,
        2,
      ),
    ].join("\n"),
  });

  return result.text.trim();
}

async function loadEpisodesForDiary(input: {
  diaryDate: Date;
  subject: string;
  isDev: boolean;
}): Promise<IMemoryEpisode[]> {
  return await getRecentMemoryEpisodes({
    limit: MAX_EPISODES_PER_DAY,
    subject: input.subject,
    isDev: input.isDev,
    onlyDate: input.diaryDate,
    sortDirection: "asc",
  });
}

/**
 * 将同一天的 Episode 转换成适合写日记的素材列表。
 *
 * 说明：
 * - world 侧事件直接保留原始摘要；
 * - message 侧默认整天直喂，只有总量超限时，才按较大的 episode 分组做粗粒度聊天摘要。
 */
export async function buildDiaryMaterials(
  episodes: IMemoryEpisode[],
): Promise<DiaryMaterialItem[]> {
  const nonConversationMaterials = episodes
    .filter((episode) => episode.type !== "conversation")
    .map(function buildEpisodeMaterial(episode: IMemoryEpisode): DiaryMaterialItem {
      return {
        type: episode.type,
        happenedAt: dayjs(episode.happenedAt).toISOString(),
        content: episode.summaryText,
      };
    });

  const conversationEpisodes = episodes.filter((episode) => episode.type === "conversation");
  const totalConversationChars = conversationEpisodes.reduce((total, episode) => {
    return total + estimateConversationChars(episode);
  }, 0);

  const conversationMaterials: DiaryMaterialItem[] = [];
  const shouldSummarizeConversations = totalConversationChars > RAW_CONVERSATION_CHAR_BUDGET;

  if (!shouldSummarizeConversations) {
    for (const episode of conversationEpisodes) {
      conversationMaterials.push(buildRawConversationMaterial(episode));
    }
  } else {
    const chunks = chunkConversationEpisodes(conversationEpisodes);
    for (const [index, chunk] of chunks.entries()) {
      conversationMaterials.push(
        await summarizeConversationEpisodes({
          chunkIndex: index,
          chunkCount: chunks.length,
          episodes: chunk,
        }),
      );
    }
  }

  return [...nonConversationMaterials, ...conversationMaterials].sort((left, right) => {
    return dayjs(left.happenedAt).valueOf() - dayjs(right.happenedAt).valueOf();
  });
}

/**
 * 将“入睡时刻”映射为应写入的日记日期。
 *
 * 说明：
 * - 22:00-23:59 入睡，记为当天；
 * - 00:00-05:59 熬夜后入睡，记为前一天；
 * - 该规则与当前 isNight 的时间边界保持一致。
 */
export function resolveDiaryDateForSleep(happenedAt: Date): Date {
  const sleepTime = dayjs(happenedAt);

  if (sleepTime.hour() < SLEEP_DIARY_ROLLOVER_HOUR) {
    return sleepTime.subtract(1, "day").startOf("day").toDate();
  }

  return sleepTime.startOf("day").toDate();
}

/**
 * 为指定自然日生成或覆盖一篇 Diary。
 */
export async function generateDiaryForDate(input: GenerateDiaryForDateInput): Promise<boolean> {
  const subject = input.subject ?? DEFAULT_DIARY_SUBJECT;
  const episodes = await loadEpisodesForDiary({
    diaryDate: input.diaryDate,
    subject: DEFAULT_MEMORY_SUBJECT_ID,
    isDev: input.isDev,
  });

  if (episodes.length === 0) {
    logger.debug("[generateDiaryForDate] no episodes found", {
      subject,
      diaryDate: dayjs(input.diaryDate).format("YYYY-MM-DD"),
    });
    return false;
  }

  const materials = await buildDiaryMaterials(episodes);
  if (materials.length === 0) {
    logger.debug("[generateDiaryForDate] no diary materials built", {
      subject,
      diaryDate: dayjs(input.diaryDate).format("YYYY-MM-DD"),
    });
    return false;
  }

  const diaryText = await writeDiaryText({
    subject,
    diaryDate: input.diaryDate,
    materials,
  });

  if (!diaryText.trim()) {
    logger.warn("[generateDiaryForDate] generated empty diary text", {
      subject,
      diaryDate: dayjs(input.diaryDate).format("YYYY-MM-DD"),
    });
    return false;
  }

  await upsertMemoryDiary({
    subject,
    diaryDate: input.diaryDate,
    text: diaryText,
    isDev: input.isDev,
  });

  logger.info("[generateDiaryForDate] diary generated", {
    subject,
    diaryDate: dayjs(input.diaryDate).format("YYYY-MM-DD"),
  });

  return true;
}
