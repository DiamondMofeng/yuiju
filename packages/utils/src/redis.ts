import dayjs from "dayjs";
import Redis from "ioredis";
import { getYuijuConfig } from "./config";
import { isDev } from "./env";
import {
  ActionId,
  type CharacterStateData,
  type Location,
  MajorScene,
  type PlanState,
  type RunningActionState,
  TEMPERATURE_LEVELS,
  WEATHER_TYPES,
  type WeatherSnapshot,
  type WorldStateData,
} from "./types";
import { safeParseJson } from "./utils";

let redis: Redis | null = null;

export const REDIS_KEY_CHARACTER_STATE = isDev()
  ? "dev:yuiju:charactor:state"
  : "yuiju:charactor:state";

export const REDIS_KEY_WORLD_STATE = isDev() ? "dev:yuiju:world:state" : "yuiju:world:state";
export const REDIS_KEY_PLAN_STATE = isDev() ? "dev:yuiju:plan:state" : "yuiju:plan:state";

export const getRedis = () => {
  if (!redis) {
    const redisUrl = getYuijuConfig().database.redisUrl.trim();
    redis = new Redis(redisUrl || "redis://localhost:6379");
  }
  return redis;
};

export const closeRedis = async () => {
  if (redis) {
    await redis.quit();
    redis = null;
  }
};

const DEFAULT_CHARACTER_STATE_DATA: CharacterStateData = {
  action: ActionId.Idle,
  location: { major: MajorScene.Home },
  stamina: 100,
  satiety: 70,
  mood: 60,
  money: 0,
  dailyActionsDoneToday: [],
  inventory: [],
  runningAction: null,
};

const DEFAULT_PLAN_STATE: PlanState = {
  shortTermPlans: [],
  updatedAt: new Date(0).toISOString(),
};

const isActionId = (value: string): value is ActionId => {
  return (Object.values(ActionId) as string[]).includes(value);
};

const isMajorScene = (value: unknown): value is MajorScene => {
  return typeof value === "string" && (Object.values(MajorScene) as string[]).includes(value);
};

const isValidIsoDateString = (value: unknown): value is string => {
  return typeof value === "string" && dayjs(value).isValid();
};

const isWeatherType = (value: unknown): value is WeatherSnapshot["type"] => {
  return typeof value === "string" && WEATHER_TYPES.includes(value as WeatherSnapshot["type"]);
};

const isTemperatureLevel = (value: unknown): value is WeatherSnapshot["temperatureLevel"] => {
  return (
    typeof value === "string" &&
    TEMPERATURE_LEVELS.includes(value as WeatherSnapshot["temperatureLevel"])
  );
};

const parseWeatherSnapshot = (value: unknown): WeatherSnapshot | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeWeather = value as Partial<WeatherSnapshot>;

  if (!isWeatherType(maybeWeather.type)) {
    return null;
  }

  if (!isTemperatureLevel(maybeWeather.temperatureLevel)) {
    return null;
  }

  if (!isValidIsoDateString(maybeWeather.periodStartAt)) {
    return null;
  }

  if (!isValidIsoDateString(maybeWeather.periodEndAt)) {
    return null;
  }

  if (!isValidIsoDateString(maybeWeather.updatedAt)) {
    return null;
  }

  return {
    type: maybeWeather.type,
    temperatureLevel: maybeWeather.temperatureLevel,
    periodStartAt: maybeWeather.periodStartAt,
    periodEndAt: maybeWeather.periodEndAt,
    updatedAt: maybeWeather.updatedAt,
  };
};

const parseRunningActionState = (value: unknown): RunningActionState | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const maybeRunningAction = value as Partial<RunningActionState>;

  if (!maybeRunningAction.action || !isActionId(maybeRunningAction.action)) {
    return null;
  }

  if (!isValidIsoDateString(maybeRunningAction.actionStartedAt)) {
    return null;
  }

  if (!isValidIsoDateString(maybeRunningAction.waitUntil)) {
    return null;
  }

  if (
    typeof maybeRunningAction.actionDurationMinutes !== "number" ||
    !Number.isFinite(maybeRunningAction.actionDurationMinutes) ||
    maybeRunningAction.actionDurationMinutes < 0
  ) {
    return null;
  }

  if (
    maybeRunningAction.completionEvent !== undefined &&
    typeof maybeRunningAction.completionEvent !== "string"
  ) {
    return null;
  }

  return {
    action: maybeRunningAction.action,
    actionStartedAt: maybeRunningAction.actionStartedAt,
    actionDurationMinutes: maybeRunningAction.actionDurationMinutes,
    waitUntil: maybeRunningAction.waitUntil,
    completionEvent: maybeRunningAction.completionEvent,
  };
};

export const initCharacterStateData = async (): Promise<CharacterStateData> => {
  const redis = getRedis();
  const raw = await redis.hgetall(REDIS_KEY_CHARACTER_STATE);

  if (Object.keys(raw).length === 0) {
    await redis.hset(REDIS_KEY_CHARACTER_STATE, {
      action: DEFAULT_CHARACTER_STATE_DATA.action,
      location: JSON.stringify(DEFAULT_CHARACTER_STATE_DATA.location),
      stamina: DEFAULT_CHARACTER_STATE_DATA.stamina,
      satiety: DEFAULT_CHARACTER_STATE_DATA.satiety,
      mood: DEFAULT_CHARACTER_STATE_DATA.mood,
      money: DEFAULT_CHARACTER_STATE_DATA.money,
      dailyActionsDoneToday: JSON.stringify(DEFAULT_CHARACTER_STATE_DATA.dailyActionsDoneToday),
      inventory: JSON.stringify(DEFAULT_CHARACTER_STATE_DATA.inventory ?? []),
      runningAction: JSON.stringify(DEFAULT_CHARACTER_STATE_DATA.runningAction),
    });

    return { ...DEFAULT_CHARACTER_STATE_DATA };
  }

  const state: CharacterStateData = {
    ...DEFAULT_CHARACTER_STATE_DATA,
    dailyActionsDoneToday: [...DEFAULT_CHARACTER_STATE_DATA.dailyActionsDoneToday],
    inventory: [...(DEFAULT_CHARACTER_STATE_DATA.inventory ?? [])],
    runningAction: DEFAULT_CHARACTER_STATE_DATA.runningAction,
  };

  if (raw.action && isActionId(raw.action)) {
    state.action = raw.action;
  }

  if (raw.location) {
    const parsedLocation = safeParseJson<unknown>(raw.location);
    if (
      parsedLocation &&
      typeof parsedLocation === "object" &&
      "major" in parsedLocation &&
      isMajorScene((parsedLocation as any).major)
    ) {
      state.location = parsedLocation as Location;
    }
  }

  if (raw.stamina) {
    const stamina = Number.parseInt(raw.stamina, 10);
    if (Number.isFinite(stamina)) state.stamina = stamina;
  }

  if (raw.satiety) {
    const satiety = Number.parseInt(raw.satiety, 10);
    if (Number.isFinite(satiety)) state.satiety = satiety;
  }

  if (raw.mood) {
    const mood = Number.parseInt(raw.mood, 10);
    if (Number.isFinite(mood)) state.mood = mood;
  }

  if (raw.money) {
    const money = Number.parseInt(raw.money, 10);
    if (Number.isFinite(money)) state.money = money;
  }

  if (raw.dailyActionsDoneToday) {
    const parsedDaily = safeParseJson<unknown>(raw.dailyActionsDoneToday);
    if (Array.isArray(parsedDaily)) {
      state.dailyActionsDoneToday = parsedDaily
        .filter((item): item is string => typeof item === "string")
        .filter((item): item is ActionId => isActionId(item));
    } else {
      state.dailyActionsDoneToday = [];
    }
  }

  if (raw.inventory) {
    const parsedInventory = safeParseJson<unknown>(raw.inventory);
    if (Array.isArray(parsedInventory)) {
      state.inventory = parsedInventory as NonNullable<CharacterStateData["inventory"]>;
    } else {
      state.inventory = [];
    }
  }

  if (raw.runningAction) {
    const parsedRunningAction = safeParseJson<unknown>(raw.runningAction);
    state.runningAction = parseRunningActionState(parsedRunningAction);
  }

  return state;
};

/**
 * 读取当前计划状态。
 *
 * 说明：
 * - 计划状态使用单个 Redis String 保存，避免多 key 更新时出现中间态；
 * - 读取失败或数据损坏时，回退到空计划状态。
 */
export const initPlanStateData = async (): Promise<PlanState> => {
  const redis = getRedis();
  const raw = await redis.get(REDIS_KEY_PLAN_STATE);

  if (!raw) {
    await redis.set(REDIS_KEY_PLAN_STATE, JSON.stringify(DEFAULT_PLAN_STATE));
    return { ...DEFAULT_PLAN_STATE, shortTermPlans: [] };
  }

  const parsed = safeParseJson<PlanState>(raw);
  if (!parsed || typeof parsed !== "object") {
    await redis.set(REDIS_KEY_PLAN_STATE, JSON.stringify(DEFAULT_PLAN_STATE));
    return { ...DEFAULT_PLAN_STATE, shortTermPlans: [] };
  }

  const maybeState = parsed as Partial<PlanState>;
  const shortTermPlans = Array.isArray(maybeState.shortTermPlans) ? maybeState.shortTermPlans : [];
  const longTermPlan = maybeState.longTermPlan;

  return {
    longTermPlan,
    shortTermPlans,
    updatedAt:
      typeof maybeState.updatedAt === "string"
        ? maybeState.updatedAt
        : DEFAULT_PLAN_STATE.updatedAt,
  };
};

/**
 * 保存当前计划状态。
 */
export const savePlanStateData = async (state: PlanState): Promise<void> => {
  const redis = getRedis();
  await redis.set(REDIS_KEY_PLAN_STATE, JSON.stringify(state));
};

export const initWorldStateData = async (): Promise<WorldStateData> => {
  const redis = getRedis();
  const raw = await redis.hgetall(REDIS_KEY_WORLD_STATE);
  const timeStr = raw.time;

  if (!timeStr) {
    const time = dayjs();
    await redis.hset(REDIS_KEY_WORLD_STATE, "time", time.toISOString());
    return { time, weather: null };
  }

  const parsed = dayjs(timeStr);
  if (!parsed.isValid()) {
    const time = dayjs();
    await redis.hset(REDIS_KEY_WORLD_STATE, "time", time.toISOString());
    return { time, weather: null };
  }

  const weather = raw.weather ? parseWeatherSnapshot(safeParseJson(raw.weather)) : null;

  return {
    time: parsed,
    weather,
  };
};
