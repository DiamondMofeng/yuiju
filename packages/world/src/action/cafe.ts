import {
  ActionId,
  type ActionMetadata,
  allTrue,
  CAFE_COFFEES,
  type CafeCoffee,
  type CafeCoffeeName,
  MajorScene,
} from "@yuiju/utils";
import { chooseCafeCoffeeAgent } from "@/llm/agent";
import { planManager } from "@/plan";
import { logger } from "@/utils/logger";
import { buildFoodMetadata } from "../utils/food-utils";

const CAFE_MIN_PRICE = Math.min(...CAFE_COFFEES.map((p) => p.price));

function isAtCafe(major: MajorScene) {
  return major === MajorScene.Cafe;
}

function formatCoffeeDescription(coffee: CafeCoffee) {
  const description: string[] = [];
  if (coffee.stamina) {
    description.push(`[体力+${coffee.stamina}]`);
  }
  if (coffee.satiety) {
    description.push(`[饱腹+${coffee.satiety}]`);
  }
  if (coffee.mood) {
    description.push(`[心情+${coffee.mood}]`);
  }

  return `${coffee.description}${description.join("")}`;
}

function isCafeWorkTimeWithAtLeastOneHourLeft(time: { hour: () => number; minute: () => number }) {
  const minutesSinceMidnight = time.hour() * 60 + time.minute();
  return minutesSinceMidnight >= 10 * 60 && minutesSinceMidnight <= 16 * 60;
}

/**
 * 判断字符串是否为咖啡店的合法咖啡名。
 *
 * 说明：
 * - 背包 item.name 的类型是 string（来源可能很多），这里通过清单做一次收窄；
 * - 这样后续 find/消费逻辑可以使用 CafeCoffeeName 的强类型。
 */
function isCafeCoffeeName(name: string): name is CafeCoffeeName {
  return CAFE_COFFEES.some((coffee) => coffee.name === name);
}

/**
 * 从背包中找出“可以喝的咖啡名”列表（强类型）。
 */
function getAvailableCafeCoffeeNames(context: {
  characterState: { inventory?: Array<{ name: string; category: string; quantity: number }> };
}): CafeCoffeeName[] {
  const inventory = context.characterState.inventory || [];
  return inventory
    .filter((item) => item.category === "food" && item.quantity > 0)
    .map((item) => item.name)
    .filter(isCafeCoffeeName);
}

export const cafeAction: ActionMetadata[] = [
  {
    action: ActionId.Order_Coffee,
    description: "在咖啡店点单。[金币-?][耗时10分钟]",
    precondition(context) {
      return allTrue([
        () => isAtCafe(context.characterState.location.major),
        () => context.characterState.money >= CAFE_MIN_PRICE,
      ]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Order_Coffee);

      const coffeeList = CAFE_COFFEES.map((coffee) => {
        return {
          value: coffee.name,
          description: formatCoffeeDescription(coffee),
          extra: { price: coffee.price },
        };
      });

      const selectedCoffee = await chooseCafeCoffeeAgent(
        coffeeList,
        context,
        [],
        await planManager.getState(),
      );
      if (!selectedCoffee) {
        logger.error("[Order_Coffee] 没有选择咖啡");
        return "点单失败，没有选择咖啡。";
      }

      const coffee = CAFE_COFFEES.find((p) => p.name === selectedCoffee.value);
      if (!coffee) {
        logger.error(`[Order_Coffee] 未找到咖啡: ${selectedCoffee.value}`);
        return "点单失败，未找到咖啡。";
      }

      const cost = coffee.price;
      if (context.characterState.money < cost) {
        logger.info(
          `[Order_Coffee] 余额不足，跳过点单: ${coffee.name}（单价${coffee.price}元，余额${context.characterState.money}元）`,
        );
        return "点单失败，余额不足。";
      }

      await context.characterState.changeMoney(-cost);

      await context.characterState.addItem(
        {
          name: coffee.name,
          description: coffee.description,
          category: "food",
          metadata: buildFoodMetadata({
            stamina: coffee.stamina,
            satiety: coffee.satiety,
            mood: coffee.mood,
            fallbackSatiety: 2,
          }),
        },
        1,
      );

      logger.info(`[Order_Coffee] 点单成功: ${coffee.name}，花费${cost}元`);

      return `点了${coffee.name}，花费${cost}元`;
    },
    durationMin: 10,
    completionEvent: "咖啡制作完成",
  },
  {
    action: ActionId.Drink_Coffee,
    description: "喝咖啡。[体力+?][饱腹+?][心情+?][耗时30分钟]",
    precondition(_context) {
      return false;
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Drink_Coffee);

      const availableCoffeeNames = getAvailableCafeCoffeeNames(context);
      const coffeeName = availableCoffeeNames[0];
      if (!coffeeName) {
        return "没有咖啡可以喝。";
      }

      const consumed = await context.characterState.consumeItem(coffeeName, 1);
      if (!consumed) {
        return `喝咖啡失败，没有喝到${coffeeName}。`;
      }

      const coffee = CAFE_COFFEES.find((item) => item.name === coffeeName);
      const result: string[] = [];
      if (coffee?.stamina) {
        await context.characterState.changeStamina(coffee?.stamina);
        result.push(`[体力+${coffee?.stamina}]`);
      }
      if (coffee?.satiety) {
        await context.characterState.changeSatiety(coffee?.satiety);
        result.push(`[饱腹+${coffee?.satiety}]`);
      }
      if (coffee?.mood) {
        await context.characterState.changeMood(coffee?.mood);
        result.push(`[心情+${coffee?.mood}]`);
      }

      return `喝了${coffeeName}${result.join(",")}`;
    },
    durationMin: 30,
  },
  {
    action: ActionId.Work_At_Cafe,
    // TODO：没有饱腹度变化
    description: "在咖啡店打工。[金币+200][体力-6][心情-2][耗时60分钟]",
    precondition(context) {
      return allTrue([
        () => isAtCafe(context.characterState.location.major),
        () => isCafeWorkTimeWithAtLeastOneHourLeft(context.worldState.time),
      ]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Work_At_Cafe);
      await context.characterState.changeMoney(200);
      await context.characterState.changeStamina(-6);
      await context.characterState.changeMood(-2);
      return "打工1小时，赚了200元";
    },
    durationMin: 60,
  },
  {
    action: ActionId.Go_Home_From_Cafe,
    description: "从咖啡店回家。[体力-3][耗时20分钟]",
    precondition(context) {
      return isAtCafe(context.characterState.location.major);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Go_Home_From_Cafe);
      await context.characterState.setLocation({ major: MajorScene.Home });
      await context.characterState.changeStamina(-3);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Go_To_School_From_Cafe,
    description: "从咖啡店去学校。[体力-3][耗时10分钟]",
    precondition(context) {
      return isAtCafe(context.characterState.location.major);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Go_To_School_From_Cafe);
      await context.characterState.setLocation({ major: MajorScene.School });
      await context.characterState.changeStamina(-3);
    },
    durationMin: 10,
  },
];
