import { getYuijuConfig, type MongoReadSource } from "@yuiju/utils";
import { Hono } from "hono";
import {
  normalizeActivityPage,
  normalizeActivityPageSize,
  queryActivityEvents,
} from "@/lib/activity/activity-query";
import { rejectPublicRequest } from "./public-guard";

export const activityRoute = new Hono();

const parsePage = (value: string | undefined) => {
  if (!value) return normalizeActivityPage(undefined);
  const parsed = Number.parseInt(value, 10);
  return normalizeActivityPage(parsed);
};

const parsePageSize = (value: string | undefined) => {
  if (!value) return normalizeActivityPageSize(undefined);
  const parsed = Number.parseInt(value, 10);
  return normalizeActivityPageSize(parsed);
};

activityRoute.get("/activity", async (context) => {
  const page = parsePage(context.req.query("page"));
  const pageSize = parsePageSize(context.req.query("pageSize"));
  const readFrom: MongoReadSource = getYuijuConfig().app.publicDeployment ? "sync" : "primary";
  const { events, pagination } = await queryActivityEvents({ page, pageSize, readFrom });

  return context.json({
    code: 0,
    data: {
      events,
      pagination,
    },
    message: "ok",
  });
});
