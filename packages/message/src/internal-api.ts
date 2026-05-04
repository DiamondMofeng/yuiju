import { serve } from "@hono/node-server";
import { getTimeWithWeekday, getYuijuConfig } from "@yuiju/utils";
import dayjs from "dayjs";
import { Hono } from "hono";
import type { NCWebsocket } from "node-napcat-ts";
import { logger } from "@/utils/logger";
import {
  createStoredGroupMessageFromFetched,
  getProtocolMessageSenderName,
  projectHistoryMessageContent,
} from "@/utils/message";
import { sendAndRecordGroupProactiveMessage } from "@/utils/reply";

interface InternalApiInput {
  napcat: NCWebsocket;
}

function readGroupId(value: string | undefined): number | null {
  const groupId = Number(value);
  return Number.isSafeInteger(groupId) && groupId > 0 ? groupId : null;
}

function readHistoryLimit(value: string | undefined): number {
  const limit = Number(value ?? 20);
  if (!Number.isSafeInteger(limit) || limit <= 0) {
    return 20;
  }

  return Math.min(limit, 50);
}

async function getGroupLabel(input: { napcat: NCWebsocket; groupId: number }): Promise<string> {
  try {
    const groupInfo = await input.napcat.get_group_info({
      group_id: input.groupId,
    });
    return groupInfo.group_name || String(input.groupId);
  } catch (error) {
    logger.warn("[message.internal-api] 获取群信息失败，使用群号作为展示名", {
      groupId: input.groupId,
      error,
    });
    return String(input.groupId);
  }
}

export function startMessageInternalApi(input: InternalApiInput) {
  const app = new Hono();
  const config = getYuijuConfig();

  app.get("/internal/groups/:groupId/context", async (context) => {
    const groupId = readGroupId(context.req.param("groupId"));
    if (!groupId) {
      return context.json({ error: "invalid groupId" }, 400);
    }

    const limit = readHistoryLimit(context.req.query("limit"));
    const groupLabel = await getGroupLabel({ napcat: input.napcat, groupId });
    const history = await input.napcat.get_group_msg_history({
      group_id: groupId,
      count: limit,
    });
    const groupMessages = history.messages.filter((message) => message.message_type === "group");
    const storedMessages = await Promise.all(
      groupMessages.map((message) => createStoredGroupMessageFromFetched(message, input.napcat)),
    );

    storedMessages.sort((left, right) => {
      if (left.time !== right.time) {
        return left.time - right.time;
      }
      return left.message_id - right.message_id;
    });

    const historyItems = storedMessages.map((message) => ({
      speaker: getProtocolMessageSenderName(message),
      time: getTimeWithWeekday(dayjs.unix(message.time)),
      content: projectHistoryMessageContent(message.message),
    }));

    return context.json({
      groupId,
      groupLabel,
      historyJson: JSON.stringify(historyItems, null, 2),
    });
  });

  app.post("/internal/groups/:groupId/messages", async (context) => {
    const groupId = readGroupId(context.req.param("groupId"));
    if (!groupId) {
      return context.json({ error: "invalid groupId" }, 400);
    }

    const body = await context.req.json().catch(() => null);
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    if (!message) {
      return context.json({ error: "message is required" }, 400);
    }

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
