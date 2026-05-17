import type { h } from "@satorijs/core";
import { visionModel } from "@yuiju/utils";
import { generateText } from "ai";
import { imageCacheState } from "@/state/image-cache";
import { stickerState } from "@/state/sticker";
import { logger } from "@/utils/logger";
import type { EnhancedImageSegment, ImageMessageSegment } from "./types";

export async function resolveImageSegment(
  segment: ImageMessageSegment,
): Promise<EnhancedImageSegment> {
  const stickerDescription = getStickerDescription(segment);
  if (stickerDescription) {
    return buildEnhancedImageSegment(segment, stickerDescription);
  }

  const cachedDescription = imageCacheState.get(segment.data.file);
  if (cachedDescription) {
    return buildEnhancedImageSegment(segment, cachedDescription);
  }

  const generatedDescription = await generateImageDescription(segment);
  if (generatedDescription) {
    imageCacheState.set(segment.data.file, generatedDescription);
    return buildEnhancedImageSegment(segment, generatedDescription);
  }

  const fallbackDescription = segment.data.summary?.trim();
  if (fallbackDescription) {
    return buildEnhancedImageSegment(segment, fallbackDescription);
  }

  return buildEnhancedImageSegment(segment);
}
export async function resolveSatoriImageDescription(element: h): Promise<string | undefined> {
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

  const generatedDescription = await generateSatoriImageDescription(element);
  if (file && generatedDescription) {
    imageCacheState.set(file, generatedDescription);
    return generatedDescription;
  }

  return summary || undefined;
}

async function generateSatoriImageDescription(element: h): Promise<string | null> {
  const attrs = element.attrs as Record<string, unknown>;
  const imageUrl = String(attrs.url || attrs.src || "").trim();
  if (!imageUrl || imageUrl.startsWith("base64://") || imageUrl.startsWith("data:")) {
    return null;
  }

  const summary = typeof attrs.summary === "string" ? attrs.summary.trim() : "";

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
              image: imageUrl,
            },
          ],
        },
      ],
    });

    const description = result.text.trim();
    return description || null;
  } catch (error) {
    logger.warn("[message.image] Satori 图片描述生成失败，降级为 summary", {
      url: imageUrl,
      summary,
      error,
    });
    return null;
  }
}

function getStickerDescription(segment: ImageMessageSegment): string | null {
  const stickerKey = segment.data.summary?.trim();
  if (!stickerKey) {
    return null;
  }

  const sticker = stickerState.getByKey(stickerKey);
  return sticker?.description || null;
}

async function generateImageDescription(segment: ImageMessageSegment): Promise<string | null> {
  const imageUrl = segment.data.url?.trim();
  if (!imageUrl) {
    return null;
  }

  const summary = segment.data.summary?.trim();
  const summaryText = summary || "空";

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
                `这个图片的 summary: ${summaryText}。`,
                "这个字段有语义，不是无意义元数据。",
                "如果 summary 是 [动画表情]，说明这更像 QQ 动画表情或表情包消息；如果 summary 为空，通常是普通图片。",
                "请把 summary 当作辅助线索，与图片内容一起判断，但不要机械复述字段名。",
              ].join("\n"),
            },
            {
              type: "image",
              image: imageUrl,
            },
          ],
        },
      ],
    });

    const description = result.text.trim();
    return description || null;
  } catch (error) {
    logger.warn("[message.image] 图片描述生成失败，降级为 summary", {
      file: segment.data.file,
      summary: segment.data.summary,
      error,
    });
    return null;
  }
}

function buildEnhancedImageSegment(
  segment: ImageMessageSegment,
  description?: string,
): EnhancedImageSegment {
  if (!description) {
    return {
      ...segment,
      data: {
        ...segment.data,
      },
    };
  }

  return {
    ...segment,
    data: {
      ...segment.data,
      description,
    },
  };
}
