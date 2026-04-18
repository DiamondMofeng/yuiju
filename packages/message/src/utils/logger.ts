import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createYuijuLogger } from "@yuiju/utils";

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * message 服务的专属 logger。
 *
 * 说明：
 * - 默认日志目录固定为 `packages/message/logs`；
 */
export const logger = createYuijuLogger({
  logDir: resolve(currentDir, "../../logs"),
});
