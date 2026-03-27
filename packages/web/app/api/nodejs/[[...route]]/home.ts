import { initCharacterStateData, initPlanStateData, initWorldStateData } from "@yuiju/utils";
import { Hono } from "hono";

export const homeRoute = new Hono();

const STAMINA_MAX = 100;

// 语义化的响应类型名称
export interface HomeResponse {
  code: number;
  message: string;
  data: {
    status?: {
      behavior?: string;
      location?: string;
      stamina?: { current?: number; max?: number };
      money?: number;
    };
    todayActions?: string[];
    inventory?: { name: string; count: number }[];
    plans?: { longTerm?: string; shortTerm?: string[] };
    world?: { time?: string };
  };
}

homeRoute.get("/summary", async (context) => {
  // 核心逻辑：角色状态、计划状态、世界时间分别来自不同真相源，首页聚合时统一读取。
  const [state, planState, world] = await Promise.all([
    initCharacterStateData(),
    initPlanStateData(),
    initWorldStateData(),
  ]);

  const inventory =
    state.inventory?.map((item) => ({
      name: item.name,
      count: Number.isFinite(item.quantity) ? item.quantity : 0,
    })) ?? [];

  const staminaMax = Math.max(STAMINA_MAX, state.stamina);

  return context.json({
    code: 0,
    data: {
      status: {
        behavior: state.action,
        location: state.location.major,
        stamina: { current: state.stamina, max: staminaMax },
        money: state.money,
      },
      todayActions: state.dailyActionsDoneToday,
      inventory,
      plans: {
        longTerm: planState.mainPlan?.title,
        shortTerm: planState.activePlans.map((plan) => plan.title),
      },
      world: {
        time: world.time.format("YYYY-MM-DD HH:mm"),
      },
    },
    message: "ok",
  });
});
