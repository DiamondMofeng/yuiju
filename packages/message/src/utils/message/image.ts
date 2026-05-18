import type { h, Session } from "@satorijs/core";
import { visionModel } from "@yuiju/utils";
import { generateText } from "ai";
import { imageCacheState } from "@/state/image-cache";
import { stickerState } from "@/state/sticker";
import { logger } from "@/utils/logger";
export async function resolveSatoriImageDescription(
  element: h,
  session?: Session,
): Promise<string | undefined> {
  const attrs = element.attrs as Record<string, unknown>;
  const summary = typeof attrs.summary === "string" ? attrs.summary.trim() : "";
  const stickerDescription = summary ? stickerState.getByKey(summary)?.description : undefined;
  if (stickerDescription) {
    return stickerDescription;
  }

  const file = String(attrs.file || attrs.url || attrs.src || "");
  const cachedDescription = file ? imageCacheState.get(file) : undefined;
  if (cachedDescription) {
    return cachedDescription;
  }

  const generatedDescription = await generateSatoriImageDescription(element, session);
  if (file && generatedDescription) {
    imageCacheState.set(file, generatedDescription);
    return generatedDescription;
  }

  return summary || undefined;
}

async function generateSatoriImageDescription(
  element: h,
  session?: Session,
): Promise<string | null> {
  const attrs = element.attrs as Record<string, unknown>;
  const imageUrl = String(attrs.url || attrs.src || "").trim();
  if (!imageUrl || imageUrl.startsWith("base64://")) {
    return null;
  }

  const summary = typeof attrs.summary === "string" ? attrs.summary.trim() : "";
  let image: string | ArrayBuffer | Buffer = imageUrl;
  let mediaType: string | undefined;

  if (imageUrl.startsWith("internal:lark/")) {
    try {
      const file = await session!.bot.ctx.http.file(imageUrl);
      image = file.data;
      mediaType = file.mime;
    } catch (error: any) {
      logger.warn("[message.image] 飞书图片下载失败", error?.message);
      return null;
    }
  }

  try {
    const result = await generateText({
      model: visionModel,
      providerOptions: {
        vision: {
          enable_thinking: false,
        },
      },
      system:
        "你是聊天消息图片描述器。请只根据图片内容输出一小段简洁、客观、自然的中文描述，方便后续聊天理解上下文，不要输出解释、身份猜测或额外寒暄。",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: [
                "请描述这张图片里最重要的可见内容，控制在 100 字以内。",
                `这个图片的 summary: ${summary || "空"}。`,
                "这个字段有语义，不是无意义元数据。",
                "如果 summary 是 [动画表情]，说明这更像 QQ 动画表情或表情包消息；如果 summary 为空，通常是普通图片。",
                "请把 summary 当作辅助线索，与图片内容一起判断，但不要机械复述字段名。",
              ].join("\n"),
            },
            {
              type: "image",
              image,
              mediaType,
            },
          ],
        },
      ],
    });

    const description = result.text.trim();
    return description || null;
  } catch (error: any) {
    logger.warn("[message.image] Satori 图片描述生成失败，降级为 summary", error?.message);
    return null;
  }
}
