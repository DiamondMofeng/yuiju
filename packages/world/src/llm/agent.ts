import {
  chooseActionPrompt,
  chooseCafeCoffeePrompt,
  chooseFoodPrompt,
  chooseShopProductPrompt,
} from "@yuiju/source";
import type {
  ActionAgentDecision,
  ActionContext,
  ActionMetadata,
  ActionParameter,
  BehaviorRecord,
  PlanState,
} from "@yuiju/utils";
import { memorySearchTool as unifiedMemorySearchTool } from "@yuiju/utils";
import { generateText, Output, stepCountIs } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import { logger } from "@/utils/logger";
import { queryAvailableFood } from "./tools";
import { strong_model } from "./utils";

const RETRY_COUNT = 3;

type ParameterAgentSelectedItem = {
  value: string;
  quantity: number;
};

export type FoodAgentDecision = {
  selectedList: ParameterAgentSelectedItem[];
};

export type ShopProductAgentDecision = {
  selectedList: ParameterAgentSelectedItem[];
};

/**
 *
 * 选择 Action
 */
export async function chooseActionAgent(
  actionList: ActionMetadata[],
  context: ActionContext,
  actionMemoryList: BehaviorRecord[],
  planState: PlanState,
): Promise<ActionAgentDecision | undefined> {
  const systemPrompt = chooseActionPrompt({
    actionList,
    currentAction: context.characterState.action,
    money: context.characterState.money,
    stamina: context.characterState.stamina,
    satiety: context.characterState.satiety,
    mood: context.characterState.mood,
    worldTime: context.worldState.time,
    recentBehaviorList: actionMemoryList.map((item) => ({
      behavior: item.behavior,
      description: item.description,
      time: dayjs(item.timestamp),
    })),
    location: `${context.characterState.location.major}${
      context.characterState.location.minor ? `-${context.characterState.location.minor}` : ""
    }`,
    mainPlanTitle: planState.mainPlan?.title,
    activePlanTitles: planState.activePlans.map((plan) => plan.title),
  });

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const { output, reasoningText } = await generateText({
        model: strong_model,
        tools: {
          memorySearch: unifiedMemorySearchTool,
          queryAvailableFood: queryAvailableFood(context),
        },
        output: Output.object({
          schema: z.object({
            action: z
              .enum(actionList?.map((item) => item.action))
              .describe("Action ID，例如：发呆、起床等"),
            reason: z.string().describe("说明为什么选择这个Action"),
            durationMinute: z
              .number()
              .optional()
              .describe("Action持续多少分钟，只有特殊的Action需要给出持续时间"),
            updateShortTermPlan: z
              .array(z.string())
              .optional()
              .describe("如果需要修改短期计划，在此输出新的计划内容"),
            updateLongTermPlan: z
              .string()
              .optional()
              .describe("如果需要修改长期计划，在此输出新的计划内容"),
          }),
        }),
        prompt: systemPrompt,
        stopWhen: stepCountIs(20),
      });
      logger.info("[chooseActionAgent] 选择行动结果", output);
      logger.info("[chooseActionAgent reasoning]: ", reasoningText);
      return output;
    } catch (error) {
      logger.error("[chooseActionAgent] 选择行动失败", error);
    }
  }
}

/**
 *
 * 选择食物
 */
export async function chooseFoodAgent(
  foodList: ActionParameter[],
  context: ActionContext,
  actionMemoryList: BehaviorRecord[],
  planState: PlanState,
) {
  const systemPrompt = chooseFoodPrompt({
    availableFood: foodList,
    location: `${context.characterState.location.major}${
      context.characterState.location.minor ? "-" + context.characterState.location.minor : ""
    }`,
    stamina: context.characterState.stamina,
    satiety: context.characterState.satiety,
    mood: context.characterState.mood,
    worldTime: context.worldState.time,
    mainPlanTitle: planState.mainPlan?.title,
    activePlanTitles: planState.activePlans.map((plan) => plan.title),
    recentBehaviorList: actionMemoryList.map((item) => ({
      behavior: item.behavior,
      description: item.description,
      time: dayjs(item.timestamp),
    })),
  });

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const { output } = await generateText({
        model: strong_model,
        // providerOptions: {
        //   Siliconflow: {
        //     enable_thinking: true,
        //   },
        // },
        output: Output.object({
          schema: z.array(
            z.object({
              value: z.enum(foodList.map((item) => item.value)).describe("选择的食物名称"),
              quantity: z.number().describe("选择的数量"),
            }),
          ),
        }),
        prompt: systemPrompt,
      });
      // LLM 返回的是数组，需要包装成 selectedList 格式
      logger.info("[chooseFoodAgent] 选择食物结果", output);
      return output;
    } catch (error) {
      logger.error("[chooseFoodAgent] 选择食物失败", error);
    }
  }
}

/**
 *
 * 选择购买商品
 */
export async function chooseShopProductAgent(
  productList: ActionParameter[],
  context: ActionContext,
  actionMemoryList: BehaviorRecord[],
  planState: PlanState,
) {
  if (productList.length === 0) {
    return;
  }

  const systemPrompt = chooseShopProductPrompt({
    availableProducts: productList,
    location: `${context.characterState.location.major}${
      context.characterState.location.minor ? "-" + context.characterState.location.minor : ""
    }`,
    stamina: context.characterState.stamina,
    satiety: context.characterState.satiety,
    mood: context.characterState.mood,
    money: context.characterState.money,
    worldTime: context.worldState.time,
    mainPlanTitle: planState.mainPlan?.title,
    activePlanTitles: planState.activePlans.map((plan) => plan.title),
    recentBehaviorList: actionMemoryList.map((item) => ({
      behavior: item.behavior,
      description: item.description,
      time: dayjs(item.timestamp),
    })),
  });

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const { output } = await generateText({
        model: strong_model,
        output: Output.object({
          schema: z.object({
            value: z.enum(productList.map((item) => item.value)).describe("选择的商品名称"),
            quantity: z.number().describe("购买数量"),
          }),
        }),
        prompt: systemPrompt,
      });

      logger.info("[chooseShopProductAgent] 选择商品结果", output);
      return output;
    } catch (error) {
      logger.error("[chooseShopProductAgent] 选择商品失败", error);
    }
  }
}

/**
 *
 * 选择咖啡
 */
export async function chooseCafeCoffeeAgent(
  coffeeList: ActionParameter[],
  context: ActionContext,
  actionMemoryList: BehaviorRecord[],
  planState: PlanState,
) {
  if (coffeeList.length === 0) {
    return;
  }

  const systemPrompt = chooseCafeCoffeePrompt({
    availableCoffees: coffeeList,
    location: `${context.characterState.location.major}${
      context.characterState.location.minor ? "-" + context.characterState.location.minor : ""
    }`,
    stamina: context.characterState.stamina,
    satiety: context.characterState.satiety,
    mood: context.characterState.mood,
    money: context.characterState.money,
    worldTime: context.worldState.time,
    mainPlanTitle: planState.mainPlan?.title,
    activePlanTitles: planState.activePlans.map((plan) => plan.title),
    recentBehaviorList: actionMemoryList.map((item) => ({
      behavior: item.behavior,
      description: item.description,
      time: dayjs(item.timestamp),
    })),
  });

  for (let i = 0; i < RETRY_COUNT; i++) {
    try {
      const { output } = await generateText({
        model: strong_model,
        output: Output.object({
          schema: z.object({
            value: z.enum(coffeeList.map((item) => item.value)).describe("选择的咖啡名称"),
            quantity: z.number().describe("点单数量"),
          }),
        }),
        prompt: systemPrompt,
      });

      logger.info("[chooseCafeCoffeeAgent] 选择咖啡结果", output);
      return output;
    } catch (error) {
      logger.error("[chooseCafeCoffeeAgent] 选择咖啡失败", error);
    }
  }
}
