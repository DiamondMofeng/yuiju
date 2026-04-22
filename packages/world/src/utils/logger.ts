import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createYuijuLogger, setYuijuLogger } from "@yuiju/utils";

const currentDir = dirname(fileURLToPath(import.meta.url));

/**
 * world 服务的专属 logger。
 *
 * 说明：
 * - 保持原有日志落盘目录 `packages/world/logs` 不变；
 * - 仅复用公共格式与 transport 构建逻辑。
 */
const logger = createYuijuLogger({
  logDir: resolve(currentDir, "../../logs"),
});

setYuijuLogger(logger);

export { logger };
