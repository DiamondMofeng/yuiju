import { connectDB, getYuijuConfig, initializePersonMemoryHeat } from "@yuiju/utils";
import { NCWebsocket } from "node-napcat-ts";
import { groupMessageHandler } from "./handler/group-message";
import { noticePokeHandler } from "./handler/notice-poke";
import { privateMessageHandler } from "./handler/private-message";
import { startMessageInternalApi } from "./internal-api";
import { stickerState } from "./state/sticker";
import { logger } from "./utils/logger";

const config = getYuijuConfig();

const onebotEndpoint = new URL(config.message.onebot.endpoint);
const napcat = new NCWebsocket({
  protocol: config.message.onebot.protocol,
  host: onebotEndpoint.hostname,
  port: Number(onebotEndpoint.port),
  accessToken: config.message.onebot.token,
  reconnection: {
    enable: true,
    attempts: config.message.onebot.retryTimes,
    delay: config.message.onebot.retryInterval,
  },
});

napcat.on("message.private", (context) => privateMessageHandler(context, napcat));

napcat.on("message.group", (context) => groupMessageHandler(context, napcat));
// napcat.on("message.group", (context) => {
//   console.log(context.message);
// });

napcat.on("notice.notify.poke", (context) => noticePokeHandler(context, napcat));

async function main() {
  await connectDB();
  // 初始化人物记忆
  await initializePersonMemoryHeat();
  // 初始化表情
  await stickerState.initialize();
  // 连接 napcat
  await napcat.connect();
  startMessageInternalApi({ napcat });
  logger.info("[message.server] 消息服务启动完成");
}

main();
