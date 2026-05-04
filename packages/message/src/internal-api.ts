import { serve } from "@hono/node-server";
import { getYuijuConfig } from "@yuiju/utils";
import { Hono } from "hono";
import type { NCWebsocket } from "node-napcat-ts";
import { llmManager } from "@/llm/manager";
import { stickerState } from "@/state/sticker";
import { logger } from "@/utils/logger";
import { sendAndRecordGroupProactiveMessage } from "@/utils/reply";

interface InternalApiInput {
  napcat: NCWebsocket;
}

async function getGroupLabel(input: { napcat: NCWebsocket; groupId: number }): Promise<string> {
  const groupInfo = await input.napcat.get_group_info({
    group_id: input.groupId,
  });
  return groupInfo.group_name;
}

export function startMessageInternalApi(input: InternalApiInput) {
  const app = new Hono();
  const config = getYuijuConfig();

  app.get("/internal/stickers", (context) => {
    return context.json({
      promptSection: stickerState.getPromptSection(),
      stickers: stickerState.list().map((sticker) => ({
        key: sticker.key,
        description: sticker.description,
      })),
    });
  });

  app.get("/internal/groups/:groupId/context", async (context) => {
    const groupId = Number(context.req.param("groupId"));
    const limit = Number(context.req.query("limit") ?? 20);
    const groupLabel = await getGroupLabel({ napcat: input.napcat, groupId });
    const groupContext = await llmManager.getGroupConversationContext({ groupId, limit });

    return context.json({
      groupId,
      groupLabel,
      summary: groupContext.summary,
      historyJson: groupContext.historyJson,
    });
  });

  app.post("/internal/groups/:groupId/messages", async (context) => {
    const groupId = Number(context.req.param("groupId"));
    const body = await context.req.json<{ message: string }>();
    const message = body.message.trim();

    const groupLabel = await getGroupLabel({ napcat: input.napcat, groupId });
    const result = await sendAndRecordGroupProactiveMessage({
      napcat: input.napcat,
      groupId,
      message,
      sessionLabel: groupLabel,
    });

    return context.json(result);
  });

  return serve(
    {
      fetch: app.fetch,
      hostname: config.message.internalApi.host,
      port: config.message.internalApi.port,
    },
    (info) => {
      logger.info("[message.internal-api] 内部 HTTP 服务启动完成", {
        address: info.address,
        port: info.port,
      });
    },
  );
}
