import type { Session } from "@satorijs/core";
import { normalizeLarkSession } from "./lark";

export async function normalizeSatoriSession(session: Session): Promise<Session> {
  if (session.platform === "lark" || session.platform === "feishu") {
    return normalizeLarkSession(session);
  }

  return session;
}
