import {
  DEFAULT_MEMORY_SUBJECT_ID,
  emitMemoryEpisode,
  getRedis,
  initCharacterStateData,
  isDev,
  processPendingMemoryEpisodes,
  REDIS_KEY_CHARACTER_STATE,
} from "@yuiju/utils";
import { Hono } from "hono";
import { rejectPublicRequest } from "./public-guard";

const parseAmount = (value: unknown): number | null => {
  if (typeof value !== "number") return null;
  if (!Number.isFinite(value)) return null;
  if (!Number.isInteger(value)) return null;
  return value;
};

export const stateRoute = new Hono();

stateRoute.post("/allowance", async (context) => {
  const blocked = rejectPublicRequest(context);
  if (blocked) {
    return blocked;
  }

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return context.json(
      {
        code: 400,
        data: null,
        message: "invalid JSON body",
      },
      400,
    );
  }

  const payload = body as { amount?: unknown; reason?: unknown; mode?: unknown };
  let mode: "add" | "set" = "add";
  if (payload.mode !== undefined) {
    if (payload.mode === "add" || payload.mode === "set") {
      mode = payload.mode;
    } else {
      return context.json(
        {
          code: 400,
          data: null,
          message: "mode must be add or set",
        },
        400,
      );
    }
  }
  const amount = parseAmount(payload.amount);

  if (amount === null) {
    return context.json(
      {
        code: 400,
        data: null,
        message: "amount must be an integer number",
      },
      400,
    );
  }

  if (mode === "add" && amount <= 0) {
    return context.json(
      {
        code: 400,
        data: null,
        message: "amount must be > 0 when mode=add",
      },
      400,
    );
  }

  if (mode === "set" && amount < 0) {
    return context.json(
      {
        code: 400,
        data: null,
        message: "amount must be >= 0 when mode=set",
      },
      400,
    );
  }

  const reason = typeof payload.reason === "string" ? payload.reason.trim() : "";

  await initCharacterStateData();

  const redis = getRedis();
  let previousMoney = 0;
  let currentMoney = 0;
  let delta = 0;

  if (mode === "add") {
    currentMoney = await redis.hincrby(REDIS_KEY_CHARACTER_STATE, "money", amount);
    previousMoney = currentMoney - amount;
    delta = amount;
  } else {
    const results = await redis
      .multi()
      .hget(REDIS_KEY_CHARACTER_STATE, "money")
      .hset(REDIS_KEY_CHARACTER_STATE, "money", amount)
      .hget(REDIS_KEY_CHARACTER_STATE, "money")
      .exec();

    if (!results) {
      throw new Error("redis transaction failed");
    }

    const [oldErr, oldValue] = results?.[0] ?? [];
    const [setErr] = results?.[1] ?? [];
    const [newErr, newValue] = results?.[2] ?? [];

    if (oldErr || setErr || newErr) {
      throw oldErr || setErr || newErr;
    }

    previousMoney = Number.parseInt(String(oldValue ?? "0"), 10);
    currentMoney = Number.parseInt(String(newValue ?? "0"), 10);
    delta = currentMoney - previousMoney;
  }

  const descriptionBase =
    mode === "add"
      ? `翊小久给金币：+${amount}（${previousMoney} -> ${currentMoney}）`
      : `翊小久设置金币：${previousMoney} -> ${currentMoney}`;

  try {
    await emitMemoryEpisode({
      source: "system",
      type: "system",
      subject: DEFAULT_MEMORY_SUBJECT_ID,
      happenedAt: new Date(),
      summaryText: reason ? `${descriptionBase}；原因：${reason}` : descriptionBase,
      extractionStatus: "pending",
      isDev: isDev(),
      payload: {
        eventName: "金币变动",
        mode,
        previousMoney,
        currentMoney,
        delta,
        reason: reason || undefined,
      },
    });
    processPendingMemoryEpisodes({ limit: 1, isDev: isDev() }).catch((error) => {
      console.error("Failed to process pending memory episodes:", error);
    });
  } catch (err) {
    try {
      if (mode === "add") {
        await redis.hincrby(REDIS_KEY_CHARACTER_STATE, "money", -amount);
      } else {
        await redis.hset(REDIS_KEY_CHARACTER_STATE, "money", previousMoney);
      }
    } catch {}

    throw err;
  }

  return context.json({
    code: 0,
    data: {
      previousMoney,
      currentMoney,
      delta,
      mode,
    },
    message: "ok",
  });
});
