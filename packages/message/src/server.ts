import "@yuiju/utils/env";
import { setTimeout } from "node:timers/promises";
import { connectDB } from "@yuiju/utils";
import { type AllHandlers, NCWebsocket, Structs } from "node-napcat-ts";
import { config } from "@/config";
import { llmManager } from "./llm/manager";

const whiteList = config.whiteList;

const napcat = new NCWebsocket(
  {
    ...config.napcat,
    accessToken: process.env.NAPCAT_TOKEN || "",
    throwPromise: true,
  },
  false,
);

/**
 * 根据“下一条即将发送”的文本长度估算等待间隔，让消息节奏更接近真人组织下一句回复。
 *
 * 说明：
 * - 基础等待保证极短句也不会瞬间连发；
 * - 按字符数线性增加等待时间，使长句拥有更自然的停顿；
 * - 使用上下限避免回复过慢；
 * - 叠加轻微随机扰动，减少固定模板感。
 */
function getReplyDelayMs(text: string): number {
  const baseDelayMs = 1000;
  const perCharacterDelayMs = 200;
  const minDelayMs = 400;
  const maxDelayMs = 10000;
  const randomJitterMs = (Math.random() - 0.5) * 360;
  const estimatedDelayMs = baseDelayMs + text.trim().length * perCharacterDelayMs;

  return Math.round(Math.min(maxDelayMs, Math.max(minDelayMs, estimatedDelayMs + randomJitterMs)));
}

// 背后调用的接口是 .handle_quick_operation
// 只支持 message request 这两个事件
napcat.on("message.private", messageHandler);

async function messageHandler(context: AllHandlers["message.private"]) {
  let receiveMessage: string | null = null;
  for (const item of context.message) {
    if (item.type === "text") {
      receiveMessage = item.data.text;
    }
  }

  if (!receiveMessage) {
    return;
  }

  if (!whiteList.includes(context.sender.user_id) && !context.sender.nickname) {
    return;
  }

  console.log(
    `收到来自 ${context.sender.nickname}(${context.sender.user_id}) 的消息: ${receiveMessage}`,
  );
  const userName = context.sender.nickname || String(context.sender.user_id);

  try {
    if (!process.env.DEEPSEEK_API_KEY) {
      await context.quick_action([Structs.text("DeepSeek 未配置，稍后再试呢~")]);
      return;
    }

    const { text } = await llmManager.chatWithLLM(receiveMessage, userName);

    const reply = (text || "").trim() || "呜…这句话我一时没理解呢。";
    console.log(`回复给 ${context.sender.nickname}(${context.sender.user_id}) 的消息: ${reply}`);

    const replyList = reply.split("\n");
    for (const [index, item] of replyList.entries()) {
      await context.quick_action([Structs.text(item)]);

      const nextReply = replyList[index + 1];
      if (nextReply) {
        await setTimeout(getReplyDelayMs(nextReply));
      }
    }
  } catch (error) {
    console.log(error);
    await context.quick_action([Structs.text("小久刚刚摔了一跤，重试下呀~")]);
  }
}

async function main() {
  await connectDB();
  await napcat.connect();
}

main();
