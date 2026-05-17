import { h, type Session, Universal } from "@satorijs/core";
import type { Message as SatoriMessage } from "@satorijs/protocol";
import { SUBJECT_NAME } from "@yuiju/utils";

interface LarkRawMessage {
  message_id?: string;
  chat_id?: string;
  msg_type?: string;
  create_time?: string;
  update_time?: string;
  sender?: {
    id?: string;
  };
  body?: {
    content?: string;
  };
  mentions?: LarkMention[];
}

interface LarkMention {
  key?: string;
  name?: string;
  id?: string;
}

interface LarkPostContent {
  title?: string;
  content?: LarkPostElement[][];
}

interface LarkPostElement {
  tag?: string;
  text?: string;
  href?: string;
  user_id?: string;
  user_name?: string;
  image_key?: string;
  file_key?: string;
  emoji_type?: string;
}

interface LarkBotWithInternal {
  selfId?: string;
  config?: {
    appId?: string;
  };
  getResourceUrl?(type: string, messageId: string, fileKey: string): string;
  internal?: {
    im?: {
      message?: {
        get(messageId: string): Promise<{ items?: LarkRawMessage[] }>;
      };
    };
  };
}

export async function normalizeLarkSession(session: Session): Promise<Session> {
  const userId = session.userId || session.event.user?.id;
  if (session.guildId && userId) {
    try {
      const members = await session.bot.getGuildMemberList(session.guildId);
      const member = members.data.find((item) => item.user?.id === userId);
      const displayName =
        member?.name?.trim() || member?.nick?.trim() || member?.user?.name?.trim();
      if (displayName) {
        session.event.user = {
          ...session.event.user,
          id: userId,
          name: displayName,
        };
      }
    } catch {
      // Lark member display name is a best-effort normalization; raw session data is still usable.
    }
  }

  const quote = session.quote ?? session.event.message?.quote;
  if (!quote) {
    return session;
  }

  let normalizedQuote: SatoriMessage = quote;
  if (!hasReadableMessageContent(quote)) {
    const messageId = quote.id ?? quote.messageId;
    if (!messageId) {
      return session;
    }

    const bot = session.bot as unknown as LarkBotWithInternal;
    const larkMessage = await bot.internal?.im?.message?.get(messageId).catch(() => null);
    const rawMessage = larkMessage?.items?.[0];
    if (!rawMessage) {
      return session;
    }

    const decodedQuote = decodeLarkMessage(bot, rawMessage);
    if (!hasReadableMessageContent(decodedQuote)) {
      return session;
    }

    normalizedQuote = {
      ...quote,
      ...decodedQuote,
    };
  }

  const quoteUserId = normalizedQuote.user?.id || quote.user?.id;
  let quoteUserName = normalizedQuote.user?.name?.trim() || quote.user?.name?.trim();
  const selfIds = [
    session.selfId,
    session.bot.selfId,
    (session.bot as LarkBotWithInternal).config?.appId,
  ];
  if (quoteUserId && selfIds.includes(quoteUserId)) {
    quoteUserName = SUBJECT_NAME;
  } else if (quoteUserId && session.guildId && !quoteUserName) {
    try {
      const members = await session.bot.getGuildMemberList(session.guildId);
      const member = members.data.find((item) => item.user?.id === quoteUserId);
      quoteUserName =
        member?.name?.trim() || member?.nick?.trim() || member?.user?.name?.trim() || undefined;
    } catch {
      // Lark quote speaker display name is best-effort; keeping the user id is still useful.
    }
  }

  normalizedQuote = {
    ...normalizedQuote,
    user: quoteUserId
      ? {
          ...normalizedQuote.user,
          id: quoteUserId,
          name: quoteUserName,
        }
      : normalizedQuote.user,
  };
  session.quote = normalizedQuote;
  if (session.event.message) {
    session.event.message.quote = normalizedQuote;
  }

  return session;
}

function hasReadableMessageContent(message: SatoriMessage): boolean {
  return Boolean(message.elements?.length || message.content?.trim());
}

function decodeLarkMessage(bot: LarkBotWithInternal, rawMessage: LarkRawMessage): SatoriMessage {
  const elements = decodeLarkMessageElements(bot, rawMessage);

  return {
    id: rawMessage.message_id,
    messageId: rawMessage.message_id,
    timestamp: Number(rawMessage.create_time || rawMessage.update_time || Date.now()),
    createdAt: rawMessage.create_time ? Number(rawMessage.create_time) : undefined,
    updatedAt: rawMessage.update_time ? Number(rawMessage.update_time) : undefined,
    user: rawMessage.sender?.id ? { id: rawMessage.sender.id } : undefined,
    channel: rawMessage.chat_id
      ? {
          id: rawMessage.chat_id,
          type: Universal.Channel.Type.TEXT,
        }
      : undefined,
    content: elements.map((element) => element.toString()).join(" "),
    elements,
  };
}

function decodeLarkMessageElements(bot: LarkBotWithInternal, rawMessage: LarkRawMessage): h[] {
  const content = parseLarkMessageContent(rawMessage);

  switch (rawMessage.msg_type) {
    case "text":
      return decodeLarkTextElements(content, rawMessage.mentions);
    case "post":
      return decodeLarkPostElements(bot, rawMessage, content);
    case "image":
      return buildLarkResourceElements(bot, rawMessage, "image", content.image_key);
    case "audio":
      return buildLarkResourceElements(bot, rawMessage, "audio", content.file_key);
    case "media":
      return buildLarkResourceElements(bot, rawMessage, "media", content.file_key);
    case "file":
      return buildLarkResourceElements(bot, rawMessage, "file", content.file_key);
    case "sticker":
      return content.file_key ? [h.text("[表情消息]")] : [];
    case "interactive":
      return [h.text("[卡片消息]")];
    default:
      return [];
  }
}

function parseLarkMessageContent(rawMessage: LarkRawMessage): Record<string, any> {
  const rawContent = rawMessage.body?.content;
  if (!rawContent) {
    return {};
  }

  try {
    return JSON.parse(rawContent);
  } catch {
    return {};
  }
}

function decodeLarkTextElements(content: Record<string, any>, mentions?: LarkMention[]): h[] {
  const text = typeof content.text === "string" ? content.text : "";
  if (!text) {
    return [];
  }

  if (!mentions?.length) {
    return [h.text(text)];
  }

  return text.split(" ").map((word) => {
    const mention = mentions.find((item) => item.key === word);
    if (!mention?.id) {
      return h.text(word);
    }

    return h.at(mention.id, { name: mention.name });
  });
}

function decodeLarkPostElements(
  bot: LarkBotWithInternal,
  rawMessage: LarkRawMessage,
  content: LarkPostContent,
): h[] {
  if (!Array.isArray(content.content)) {
    return [];
  }

  const elements: h[] = [];
  for (const [paragraphIndex, paragraph] of content.content.entries()) {
    if (paragraphIndex > 0) {
      elements.push(h.text("\n"));
    }

    for (const element of paragraph) {
      elements.push(...decodeLarkPostElement(bot, rawMessage, element));
    }
  }

  return elements;
}

function decodeLarkPostElement(
  bot: LarkBotWithInternal,
  rawMessage: LarkRawMessage,
  element: LarkPostElement,
): h[] {
  switch (element.tag) {
    case "text":
    case "md":
      return element.text ? [h.text(element.text)] : [];
    case "a":
      return element.text
        ? [h.text(element.href ? `${element.text} (${element.href})` : element.text)]
        : [];
    case "at":
      return element.user_id ? [h.at(element.user_id, { name: element.user_name })] : [];
    case "img":
      return buildLarkResourceElements(bot, rawMessage, "image", element.image_key);
    case "media":
      return buildLarkResourceElements(bot, rawMessage, "media", element.file_key);
    case "emoji":
      return element.emoji_type ? [h.text(`[${element.emoji_type}]`)] : [];
    default:
      return [];
  }
}

function buildLarkResourceElements(
  bot: LarkBotWithInternal,
  rawMessage: LarkRawMessage,
  type: "image" | "audio" | "media" | "file",
  fileKey: string | undefined,
): h[] {
  if (!fileKey || !rawMessage.message_id || !bot.getResourceUrl) {
    return [];
  }

  const url = bot.getResourceUrl(type === "media" ? "file" : type, rawMessage.message_id, fileKey);
  if (type === "image") {
    return [h.image(url)];
  }
  if (type === "audio") {
    return [h.audio(url)];
  }
  if (type === "media") {
    return [h.video(url)];
  }
  return [h.file(url)];
}
