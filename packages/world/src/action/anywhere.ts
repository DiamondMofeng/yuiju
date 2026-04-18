import {
  type ActionContext,
  ActionId,
  type ActionMetadata,
  type ChoiceOption,
  allTrue,
  type FoodMetadata,
} from "@yuiju/utils";
import { chooseFoodAgent } from "@/llm/agent";
import { planManager } from "@/plan";
import { logger } from "@/utils/logger";
import { resolveFoodRecoveryPerUnit } from "../utils/food-utils";
import { notDoneToday } from "./utils";

function getAvailableFoodOptions(context: ActionContext): ChoiceOption[] {
  const inventory = context.characterState.inventory || [];
  const availableFood = inventory.filter((item) => item.category === "food" && item.quantity! > 0);

  return availableFood.map((food) => {
    return {
      value: food.name,
      description: `${food.description}（剩余${food.quantity}个）`,
      extra: food.metadata as FoodMetadata,
    };
  });
}

export const anywhereAction: ActionMetadata[] = [
  {
    action: ActionId.Idle,
    description: "休息等待，可以在任何地点进行。[耗时需要给出]",
    precondition(_context) {
      return true;
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Idle);
    },
    async durationMin(_context, selectedAction) {
      return selectedAction?.durationMinute ?? 10;
    },
  },
  {
    action: ActionId.Eat_Lunch,
    description: "吃午饭。[体力+50][饱腹+50][耗时20分钟]",
    precondition(context) {
      const hour = context.worldState.time.get("hour");
      return allTrue([
        () => hour >= 11 && hour < 14,
        () => notDoneToday(context, ActionId.Eat_Lunch),
      ]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Eat_Lunch);
      await context.characterState.changeStamina(50);
      await context.characterState.changeSatiety(50);
      await context.characterState.markActionDoneToday(ActionId.Eat_Lunch);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Eat_Item,
    description:
      "吃食物。[体力+?][饱腹+?][心情+?][耗时10分钟]（可调用 queryAvailableFood 查看可用食物）",
    precondition: (context) => {
      return allTrue([
        () => {
          return getAvailableFoodOptions(context).length > 0;
        },
      ]);
    },
    async executor(context) {
      const foodList = getAvailableFoodOptions(context);
      if (foodList.length === 0) {
        return "没有可吃的食物。";
      }

      // 设置当前动作
      await context.characterState.setAction(ActionId.Eat_Item);

      const selectionResult = await chooseFoodAgent(
        foodList,
        context,
        [],
        await planManager.getState(),
      );
      const selectedFoodList = selectionResult
        ?.filter((item) => foodList.find((param) => param.value === item.value))
        ?.map((item) => {
          const baseParam = foodList.find((param) => param.value === item.value)!;

          return {
            ...baseParam,
            quantity: item.quantity,
          };
        });

      if (!selectedFoodList || selectedFoodList.length === 0) {
        return "没有选择要吃的食物。";
      }

      const eatenSummary: string[] = [];

      // 遍历处理所有选择的食物
      for (const selectedFood of selectedFoodList) {
        const quantity = selectedFood.quantity || 1;

        // 消费指定数量的物品
        const consumed = await context.characterState.consumeItem(selectedFood.value, quantity);
        if (!consumed) {
          logger.error(`[Eat_Item] 消费食物失败: ${selectedFood.value} x${quantity}`);
          continue;
        }

        // 统一通过 metadata 解析收益，避免购买时配置的 mood/satiety 在消费时丢失。
        const { stamina, satiety, mood } = resolveFoodRecoveryPerUnit(selectedFood.extra);
        const staminaPerUnit = stamina;
        const totalStamina = staminaPerUnit * quantity;
        if (totalStamina !== 0) {
          await context.characterState.changeStamina(totalStamina);
        }

        const satietyPerUnit = satiety;
        const totalSatiety = satietyPerUnit * quantity;
        if (totalSatiety !== 0) {
          await context.characterState.changeSatiety(totalSatiety);
        }

        const totalMood = mood * quantity;
        if (totalMood !== 0) {
          await context.characterState.changeMood(totalMood);
        }

        logger.info(
          `[Eat_Item] 成功消费 ${selectedFood.value} x${quantity}，恢复 ${totalStamina} 点体力，恢复 ${totalSatiety} 点饱腹，恢复 ${totalMood} 点心情`,
        );

        eatenSummary.push(`${selectedFood.value}${quantity}个`);
      }

      if (eatenSummary.length === 0) {
        return "尝试吃东西，但都没吃成功。";
      }

      return `吃了${eatenSummary.join("，")}`;
    },

    durationMin: 10,
  },
];
