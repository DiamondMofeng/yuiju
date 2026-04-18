import type { Tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { initCharacterStateData, initPlanStateData, initWorldStateData } from "../../redis";
import { getTimeWithWeekday } from "../../time";

export const queryStateTool: Tool = {
  description:
    "查询 state，包括当前时间、ゆいじゅ角色状态、世界天气，以及长期计划和短期计划。返回内容为客观事实。",
  inputSchema: z.object({}),
  execute: async () => {
    const characterState = await initCharacterStateData();
    const worldState = await initWorldStateData();
    const planState = await initPlanStateData();
    const now = dayjs();

    console.log("[工具调用]", "queryState");

    return {
      currentTime: getTimeWithWeekday(now, "MM-DD HH:mm"),
      characterState,
      worldState: {
        weather: worldState.weather?.type,
        temperatureLevel: worldState.weather?.temperatureLevel,
      },
      planState: {
        longTermPlan: planState.longTermPlan?.title ?? null,
        shortTermPlans: planState.shortTermPlans.map((plan) => plan.title),
      },
    };
  },
};
