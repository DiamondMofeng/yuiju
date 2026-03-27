import { ActionId, type ActionMetadata, allTrue, isDev, MajorScene } from "@yuiju/utils";
import { generateDiaryForDate, resolveDiaryDateForSleep } from "@/memory/diary";
import { logger } from "@/utils/logger";
import {
  isAfternoon,
  isEvening,
  isMorning,
  isNight,
  isWeekday,
  isWeekend,
  notDoneToday,
} from "./utils";

export const homeAction: ActionMetadata[] = [
  {
    action: ActionId.Wake_Up,
    description: "起床并洗漱，新的一天开始。[体力=85][饱腹=20][耗时10分钟]",
    // 已在 precheckAction 中处理
    precondition() {
      return false;
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Wake_Up);
      await context.characterState.setStamina(85);
      await context.characterState.setSatiety(20);
      await context.characterState.clearDailyActions();
    },
    durationMin: 10,
  },
  {
    action: ActionId.Sleep_For_A_Little,
    description: "再睡一会。[心情+1][耗时10分钟]",
    precondition() {
      // 已在 precheckAction 中处理
      return false;
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Sleep);
      await context.characterState.changeMood(1);
    },
    completionEvent: "闹钟响了",
    durationMin: 10,
  },
  {
    action: ActionId.Eat_Breakfast,
    description: "吃早餐[饱腹+40][耗时20分钟]",
    precondition(context) {
      return allTrue([isMorning(context), () => notDoneToday(context, ActionId.Eat_Breakfast)]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Eat_Breakfast);
      await context.characterState.changeSatiety(40);
      await context.characterState.markActionDoneToday(ActionId.Eat_Breakfast);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Go_To_School_From_Home,
    description: "前往学校。[体力-7][饱腹-4][耗时30分钟]",
    precondition(context) {
      return allTrue([isWeekday(context), isMorning(context)]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Go_To_School_From_Home);
      await context.characterState.setLocation({
        major: MajorScene.School,
      });
      await context.characterState.changeStamina(-7);
      await context.characterState.changeSatiety(-4);
    },
    durationMin: 30,
  },
  {
    action: ActionId.Go_To_Shop_From_Home,
    description: "从家前往商店。[体力-5][饱腹-3][耗时20分钟]",
    precondition(context) {
      return context.characterState.stamina >= 5 && !isNight(context);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Go_To_Shop_From_Home);
      await context.characterState.setLocation({
        major: MajorScene.Shop,
      });
      await context.characterState.changeStamina(-5);
      await context.characterState.changeSatiety(-3);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Go_To_Cafe_From_Home,
    description: "从家去咖啡店。[体力-5][饱腹-3][耗时20分钟]",
    precondition(context) {
      return allTrue([context.characterState.stamina >= 5, !isNight(context)]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Go_To_Cafe_From_Home);
      await context.characterState.setLocation({
        major: MajorScene.Cafe,
      });
      await context.characterState.changeStamina(-5);
      await context.characterState.changeSatiety(-3);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Eat_Dinner,
    description: "吃晚餐。[饱腹+40][耗时20分钟]",
    precondition(context) {
      return allTrue([isEvening(context), () => notDoneToday(context, ActionId.Eat_Dinner)]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Eat_Dinner);
      await context.characterState.changeSatiety(40);
      await context.characterState.markActionDoneToday(ActionId.Eat_Dinner);
    },
    durationMin: 20,
  },
  {
    action: ActionId.Stay_At_Home,
    description: "待在家中，放松、学习。[体力+20][饱腹-10][心情+3][耗时60分钟]",
    precondition(context) {
      if (isWeekend(context)) {
        return true;
      } else {
        return allTrue([isAfternoon(context), isEvening(context)]);
      }
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Stay_At_Home);
      await context.characterState.changeStamina(20);
      await context.characterState.changeSatiety(-10);
      await context.characterState.changeMood(3);
    },
    durationMin: 60,
  },
  {
    action: ActionId.Sleep,
    description: "睡觉。[耗时动态]",
    precondition(context) {
      return allTrue([isNight(context)]);
    },
    async executor(context) {
      await context.characterState.setAction(ActionId.Sleep);

      // 进入正式睡眠后，后台异步生成“当天日记”，不阻塞行为主链路。
      generateDiaryForDate({
        diaryDate: resolveDiaryDateForSleep(context.worldState.time.toDate()),
        isDev: isDev(),
      }).catch((error) => {
        logger.error("[homeAction.Sleep] generate diary failed", error);
      });
    },
    durationMin: async (context) => {
      const now = context.worldState.time.clone();
      let target = now.hour(7).minute(30).second(0).millisecond(0);

      if (target.isBefore(now)) {
        target = target.add(1, "day");
      }

      return target.diff(now, "minute");
    },
    completionEvent: "闹钟响了",
  },
];
