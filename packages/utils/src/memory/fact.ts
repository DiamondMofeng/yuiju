import { generateText, Output } from "ai";
import { z } from "zod";
import { deepseekProvider } from "../llm/models";
import type { MemoryEpisode } from "./episode";

const MAX_FACTS_PER_EPISODE = 2;
const MIN_FACT_CONFIDENCE = 0.75;

/**
 * 当前支持进入 Graphiti 的事实类型。
 *
 * 说明：
 * - Graphiti 仅沉淀人物长期画像相关事实；
 * - 计划变更仍保留在 Episode 真相源中，但不进入事实图谱。
 */
export type FactCandidateType = "preference" | "relation";

/**
 * 进入 Graphiti 前的业务候选事实。
 *
 * 说明：
 * - id 是“本次候选事实”的唯一标识，用于 TS 与 Python 之间回传、回写 extractedFactIds；
 * - dedupeKey 是“语义去重键”，用于在补偿重跑、批量回灌或多条 episode 指向同一事实时识别重复事实；
 * - evidenceEpisodeId 让图事实始终可追溯到真相层事件。
 */
export interface FactCandidate {
  id: string;
  dedupeKey: string;
  type: FactCandidateType;
  subject: string;
  predicate: string;
  object: string;
  summary: string;
  confidence: number;
  evidenceEpisodeId: string;
  validAt: string;
  metadata?: Record<string, unknown>;
}

export interface MemoryExtractor {
  extract(episode: MemoryEpisode): Promise<FactCandidate[]>;
}

/**
 * 生成候选事实 ID。
 *
 * 说明：
 * - id 只负责标识“这一条候选事实记录”，不承担语义去重职责；
 * - 语义去重由 dedupeKey 负责，因此这里直接使用随机 UUID 即可。
 */
function createFactId(): string {
  return `fact_${crypto.randomUUID()}`;
}

/**
 * 生成语义去重键。
 *
 * 说明：
 * - dedupeKey 需要在相同语义事实上保持稳定，因此使用能表达事实语义的核心字段拼接；
 * - 当前先采用可读、可调试的稳定字符串，不额外引入 hash，以便后续排查重复写入。
 */
function createFactDedupeKey(parts: string[]): string {
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join("|");
}

const extractedFactItemSchema = z.object({
  type: z
    .enum(["preference", "relation"])
    .describe("事实类型，只能是人物喜好 preference 或人物关系 relation。"),
  subject: z.string().min(1).describe("事实主体，使用中文并保持称呼稳定。"),
  predicate: z
    .string()
    .min(1)
    .describe(
      "稳定、简短、机器友好的英文谓词标识，例如 likes、dislikes、prefers、trusts、relies_on、avoids。",
    ),
  object: z.string().min(1).describe("事实对象，优先保留原始中文表述，不要翻译成英文。"),
  summary: z.string().min(1).describe("中文摘要，用一句话简要说明该事实。"),
  confidence: z.number().min(0).max(1).describe("事实置信度，范围 0 到 1。"),
  metadata: z
    .record(z.string(), z.unknown())
    .optional()
    .describe("可选补充信息；没有必要时不要填写。"),
});

const extractedFactSchema = z.object({
  shouldWrite: z.boolean().describe("是否应该把当前 episode 提炼结果写入长期事实图谱。"),
  discardReason: z.string().optional().describe("当 shouldWrite 为 false 时，填写丢弃原因。"),
  facts: z
    .array(extractedFactItemSchema)
    .max(MAX_FACTS_PER_EPISODE)
    .describe("候选事实列表；只有 shouldWrite 为 true 时才允许返回非空数组。"),
});

/**
 * 收敛传给 extractor 的 episode 上下文，避免把完整快照噪声直接暴露给模型。
 *
 * 说明：
 * - behavior 只保留与动作决策直接相关的字段；
 * - conversation 只保留对话窗口的计数、对象和最近几条消息；
 * - plan 生命周期仍保留必要上下文，便于后续基于 episode 做事件层检索；
 * - 其他类型回退为原始 payload，避免未来新增类型时完全失去上下文。
 */
function buildEpisodePayloadContext(episode: MemoryEpisode): unknown {
  const payload = episode.payload as Record<string, unknown>;

  if (episode.type === "behavior") {
    return {
      action: payload.action,
      reason: payload.reason,
      executionResult: payload.executionResult,
      durationMinutes: payload.durationMinutes,
      relatedPlanId: payload.relatedPlanId,
      location: payload.location,
    };
  }

  if (episode.type === "conversation") {
    const rawMessages = Array.isArray(payload.messages) ? payload.messages : [];

    return {
      counterpartyName: payload.counterpartyName,
      messageCount: payload.messageCount,
      windowStart: payload.windowStart,
      windowEnd: payload.windowEnd,
      recentMessages: rawMessages.slice(-6),
    };
  }

  if (episode.type.startsWith("plan_")) {
    return {
      planId: payload.planId,
      planScope: payload.planScope,
      changeType: payload.changeType,
      before: payload.before,
      after: payload.after,
      changeReason: payload.changeReason,
    };
  }

  return payload;
}

function buildExtractorPrompt(episode: MemoryEpisode): string {
  return [
    "你是记忆系统的事实提炼器，需要从 episode 中提炼值得写入长期记忆图谱的候选事实。",
    "你的首要目标是减少垃圾写入，宁可少写，也不要把一次性、模糊、对未来无帮助的信息写入长期记忆。",
    "只允许输出以下两类事实：preference、relation。",
    "请先判断该 episode 是否值得进入长期记忆：只有未来多次决策可能用到、具有稳定性或持续性、能影响角色画像或关系判断的信息才允许写入。",
    "以下内容必须废弃：",
    "- 单次动作、一次性结果、纯事件流水账。",
    "- 礼貌寒暄、闲聊填充语、没有后续影响的短对话。",
    "- 短时情绪波动、含糊猜测、证据不足的推断。",
    "- 所有计划相关信息，包括主计划、活跃计划、计划完成、计划放弃、计划替换、计划微调与执行细节。",
    "- 只是复述 episode，而没有抽象出稳定事实的信息。",
    "分类型规则：",
    "- preference：必须是明确表达或有充分证据支持的稳定偏好、喜恶、长期倾向；单次消费/单次提及不能直接推出长期偏好。",
    "- relation：必须体现稳定态度、关系变化、互动倾向或信任/依赖/回避等长期关系信号；普通聊过一次天不算。",
    "当信息不足、有歧义、无法确认是否具有长期价值时，必须选择丢弃。",
    `输出要求：先给出 shouldWrite；如果不应写入，facts 必须为空数组，并在 discardReason 中说明原因；如果应写入，facts 最多 ${MAX_FACTS_PER_EPISODE} 条。`,
    "语言与命名要求：整个 fact 必须与当前 episode 的语言保持一致；当前 episode 是中文语境，因此 subject、object、summary 必须使用中文，不要把“草莓蛋糕”“红茶”这类内容翻译成英文。",
    "语言与命名要求补充：如果原文里已经出现明确中文称呼，object 必须优先保留原始中文表述，不要改写成英文近义词或其他语言版本。",
    "predicate 命名要求：predicate 必须使用稳定、简短、机器友好的固定英文标识，不要使用自然语言长句，也不要随意切换同义词；例如 preference 可用 likes / dislikes / prefers，relation 可用 trusts / relies_on / avoids / attitude_towards。",
    `输出要求补充：subject/predicate/object 必须简洁稳定，summary 使用中文，confidence 取 0-1；没有把握时降低 confidence，低置信度不要勉强输出。`,
    `episode_type=${episode.type}`,
    `subject=${episode.subject}`,
    `counterparty=${episode.counterparty ?? ""}`,
    `happened_at=${episode.happenedAt.toISOString()}`,
    `summary_text=${episode.summaryText}`,
    `payload=${JSON.stringify(buildEpisodePayloadContext(episode), null, 2)}`,
  ].join("\n");
}

function normalizeFactText(value: string): string {
  return value.trim();
}

/**
 * 在 TS 侧做一层保守过滤，避免 prompt 漏网后把低价值事实直接写入图谱。
 *
 * 说明：
 * - shouldWrite=false 时直接丢弃整批输出；
 * - 低于置信度阈值的事实不写入；
 * - 同一批次内如果 dedupeKey 重复，只保留第一条，降低重复写入概率。
 */
function filterExtractedFacts(
  output: z.infer<typeof extractedFactSchema>,
): z.infer<typeof extractedFactItemSchema>[] {
  if (!output.shouldWrite) {
    return [];
  }

  const keptFacts: z.infer<typeof extractedFactItemSchema>[] = [];
  const seenDedupeKeys = new Set<string>();

  for (const fact of output.facts) {
    if (fact.confidence < MIN_FACT_CONFIDENCE) {
      continue;
    }

    const dedupeKey = createFactDedupeKey([
      fact.type,
      normalizeFactText(fact.subject),
      normalizeFactText(fact.predicate),
      normalizeFactText(fact.object),
    ]);
    if (!dedupeKey || seenDedupeKeys.has(dedupeKey)) {
      continue;
    }

    seenDedupeKeys.add(dedupeKey);
    keptFacts.push(fact);
  }

  return keptFacts.slice(0, MAX_FACTS_PER_EPISODE);
}

function normalizeExtractedFacts(
  episode: MemoryEpisode,
  output: z.infer<typeof extractedFactSchema>,
): FactCandidate[] {
  const episodeId = episode.id;
  if (!episodeId) {
    return [];
  }

  const filteredFacts = filterExtractedFacts(output);

  return filteredFacts.map((fact) => ({
    id: createFactId(),
    dedupeKey: createFactDedupeKey([
      fact.type,
      normalizeFactText(fact.subject),
      normalizeFactText(fact.predicate),
      normalizeFactText(fact.object),
    ]),
    type: fact.type,
    subject: normalizeFactText(fact.subject),
    predicate: normalizeFactText(fact.predicate),
    object: normalizeFactText(fact.object),
    summary: normalizeFactText(fact.summary),
    confidence: fact.confidence,
    evidenceEpisodeId: episodeId,
    validAt: episode.happenedAt.toISOString(),
    metadata: fact.metadata,
  }));
}

/**
 * 基于 LLM 的同步 extractor。
 *
 * 说明：
 * - 使用结构化 schema 约束模型输出，避免自由文本污染图谱；
 * - 候选事实仍由业务侧定义类型边界，Graphiti 只接收提炼后的结果。
 */
export const llmMemoryExtractor: MemoryExtractor = {
  async extract(episode) {
    if (!episode.id) {
      return [];
    }

    /**
     * 计划事件只保留在 Episode 真相源，不进入 Graphiti 事实图谱。
     */
    if (episode.type.startsWith("plan_")) {
      return [];
    }

    const { output } = await generateText({
      model: deepseekProvider("deepseek-chat"),
      output: Output.object({
        schema: extractedFactSchema,
      }),
      prompt: buildExtractorPrompt(episode),
    });

    return normalizeExtractedFacts(episode, output);
  },
};
