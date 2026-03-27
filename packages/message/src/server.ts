import { connectDB, getYuijuConfig } from "@yuiju/utils";
import { NCWebsocket } from "node-napcat-ts";
import { groupMessageHandler } from "./handler/group-message";
import { privateMessageHandler } from "./handler/private-message";

const config = getYuijuConfig();

const napcat = new NCWebsocket(config.message.napcat);

napcat.on("message.private", (context) => privateMessageHandler(context, napcat));

napcat.on("message.group", (context) => groupMessageHandler(context, napcat));

async function main() {
  await connectDB();
  await napcat.connect();
}

main();
