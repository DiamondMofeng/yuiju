import { connectDB, getYuijuConfig } from "@yuiju/utils";
import { NCWebsocket } from "node-napcat-ts";
import { groupMessageHandler } from "./handler/group-message";
import { noticePokeHandler } from "./handler/notice-poke";
import { privateMessageHandler } from "./handler/private-message";
import { stickerState } from "./state/sticker";
import { logger } from "./utils/logger";

const config = getYuijuConfig();

const napcat = new NCWebsocket(config.message.napcat);

napcat.on("message.private", (context) => privateMessageHandler(context, napcat));

napcat.on("message.group", (context) => groupMessageHandler(context, napcat));
// napcat.on("message.group", (context) => {
//   console.log(context.message);
// });

napcat.on("notice.notify.poke", (context) => noticePokeHandler(context, napcat));

async function main() {
  await connectDB();
  await stickerState.initialize();
  await napcat.connect();
  logger.info("[message.server] 消息服务启动完成");
}

main();
