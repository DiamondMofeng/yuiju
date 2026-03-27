import {
  DEFAULT_MEMORY_SUBJECT_ID,
  getRecentMemoryEpisodes,
  type IMemoryEpisode,
  isDev,
} from "@yuiju/utils";
import { Hono } from "hono";
import { mapEpisodeToActivityItem } from "@/lib/activity/activity-view";
import { rejectPublicRequest } from "./public-guard";

export const activityRoute = new Hono();

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

const parseLimit = (value: string | undefined) => {
  if (!value) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return DEFAULT_LIMIT;
  if (parsed <= 0) return DEFAULT_LIMIT;
  if (parsed > MAX_LIMIT) return MAX_LIMIT;
  return parsed;
};

activityRoute.use("*", async (context, next) => {
  const blocked = rejectPublicRequest(context);
  if (blocked) {
    return blocked;
  }
  await next();
});

activityRoute.get("/activity", async (context) => {
  const limit = parseLimit(context.req.query("limit"));
  let docs: IMemoryEpisode[] = [];
  try {
    docs = await getRecentMemoryEpisodes({
      limit,
      types: [
        "behavior",
        "conversation",
        "plan_created",
        "plan_updated",
        "plan_completed",
        "plan_abandoned",
        "plan_superseded",
        "system",
      ],
      subject: DEFAULT_MEMORY_SUBJECT_ID,
      isDev: isDev(),
      // 仅拉取当前自然日的动态，保持活动页聚焦“今天发生了什么”。
      onlyDate: new Date(),
    });
  } catch (error) {
    console.error("getRecentMemoryEpisodes failed:", error);
    docs = [];
  }

  const events = docs
    .slice()
    .reverse()
    .map((item) => mapEpisodeToActivityItem(item));

  return context.json({
    code: 0,
    data: {
      count: events.length,
      events,
    },
    message: "ok",
  });
});
