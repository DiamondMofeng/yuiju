import {
  type ActionMetadata,
  buildProactiveGroupMessagePrompt,
  type CharacterStateData,
  chatReplyRulesPrompt,
  createToolCallLoggingHooks,
  flashModel,
  generateStructuredOutput,
  getCharacterCardPrompt,
  getYuijuConfig,
  messageHistorySchemaPrompt,
  type RunningActionState,
  type WorldStateData,
} from "@yuiju/utils";
import { Output } from "ai";
import { z } from "zod";
import { logger } from "@/utils/logger";

interface ScheduleActionCompletionProactiveShareInput {
  actionMetadata: ActionMetadata;
  runningAction: RunningActionState;
  eventDescription?: string;
  completionContext?: Record<string, unknown>;
  characterStateSnapshot: CharacterStateData;
  worldStateSnapshot: WorldStateData;
}

interface InternalStickerContext {
  promptSection: string;
  stickers: {
    key: string;
    description: string;
  }[];
}

interface InternalGroupConversationContext {
  groupId: number;
  groupLabel: string;
  summary?: string;
  historyJson: string;
}

interface ProactiveGroupMessageDecision {
  shouldSend: boolean;
  reason: string;
  message: string;
}

export function scheduleActionCompletionProactiveShare(
  input: ScheduleActionCompletionProactiveShareInput,
) {
  const shareIntent = input.runningAction.proactiveShareIntent;
  if (!shareIntent?.shouldShare || !input.actionMetadata.proactiveShare?.enabled) {
    return;
  }

  shareActionCompletionToGroup({
    ...input,
    shareReason: shareIntent.reason,
  }).catch((error) => {
    logger.error("[proactive-message] 主动分享失败", {
      action: input.runningAction.action,
      behaviorEpisodeId: input.runningAction.behaviorEpisodeId,
      error,
    });
  });
}

async function shareActionCompletionToGroup(
  input: ScheduleActionCompletionProactiveShareInput & {
    shareReason: string;
  },
) {
  const config = getYuijuConfig();
  const internalApiBaseUrl = `http://${config.message.internalApi.host}:${config.message.internalApi.port}`;
  const groupId = config.message.proactive.groupTargetId;
  const stickersResponse = await fetch(`${internalApiBaseUrl}/internal/stickers`);
  const stickers = (await stickersResponse.json()) as InternalStickerContext;
  const groupContextResponse = await fetch(
    `${internalApiBaseUrl}/internal/groups/${groupId}/context?limit=6`,
  );
  const groupContext = (await groupContextResponse.json()) as InternalGroupConversationContext;

  const result = await generateStructuredOutput({
    model: flashModel,
    providerOptions: {
      Siliconflow: {
        enable_thinking: false,
      },
    },
    system: [
      getCharacterCardPrompt(),
      messageHistorySchemaPrompt,
      chatReplyRulesPrompt,
      stickers.promptSection,
    ].join("\n\n"),
    messages: [
      {
        role: "user",
        content: buildProactiveGroupMessagePrompt({
          action: input.runningAction.action,
          shareReason: input.shareReason,
          eventDescription: input.eventDescription,
          completionContext: input.completionContext,
          characterStateSnapshot: input.characterStateSnapshot,
          worldStateSnapshot: input.worldStateSnapshot,
          groupContext,
        }),
      },
    ],
    ...createToolCallLoggingHooks({
      scene: "world.llm.proactive-message",
    }),
    output: Output.object({
      schema: z.object({
        shouldSend: z.boolean().describe("当前是否适合发送这条主动生活分享"),
        reason: z.string().describe("适合或不适合发送的简短原因"),
        message: z.string().describe("最终要发送到群里的消息，shouldSend=false 时为空字符串"),
      }),
    }),
  });

  const decision = result.output as ProactiveGroupMessageDecision;
  logger.info("[proactive-message] 主动分享决策完成", {
    action: input.runningAction.action,
    behaviorEpisodeId: input.runningAction.behaviorEpisodeId,
    shouldSend: decision.shouldSend,
    reason: decision.reason,
  });

  if (!decision.shouldSend) {
    return;
  }

  const sendResponse = await fetch(`${internalApiBaseUrl}/internal/groups/${groupId}/messages`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      message: decision.message,
    }),
  });
  await sendResponse.json();
}
