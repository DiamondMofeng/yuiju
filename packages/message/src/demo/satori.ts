import LarkBot from "@satorijs/adapter-lark";
import { Context, HTTP } from "@satorijs/core";
import OneBotBot from "@yuiju/satorijs-adapter-onebot";
import { getYuijuConfig } from "@yuiju/utils";

const config = getYuijuConfig();

const ctx = new Context({});
ctx.plugin(HTTP);

new LarkBot(ctx, config.message.lark);

new OneBotBot(ctx, config.message.onebot);

ctx.on("message", async (session) => {
  let nickname: string | undefined;

  if (
    (session.platform === "lark" || session.platform === "feishu") &&
    session.guildId &&
    session.userId
  ) {
    try {
      const members = await session.bot.getGuildMemberList(session.guildId);
      const member = members.data.find((item) => item.user?.id === session.userId);
      nickname = member?.name || member?.user?.name;
    } catch (error) {
      console.error("[satori] get lark member failed", error);
    }
  }

  if (!session.channelId) {
    return;
  }

  try {
    await session.bot.sendMessage(session.channelId, "收到");
  } catch (error) {
    console.error("[satori] send message failed", error);
  }
});

export async function main() {
  await ctx.start();
  console.log("[satori] runtime started");
}
