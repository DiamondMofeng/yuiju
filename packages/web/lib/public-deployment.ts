import "server-only";

import { getYuijuConfig } from "@yuiju/utils";

// 核心逻辑：yuiju.config.ts 中 app.publicDeployment=true 时视为对外展示。
export const isPublicDeployment = (): boolean => {
  return getYuijuConfig().app.publicDeployment;
};
