import { ActionId, MajorScene } from "@yuiju/utils";
import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { getActionList } from "@/action";

process.env.NODE_ENV = "development";

function createContext(opts: {
  action: ActionId;
  major: MajorScene | string;
  stamina?: number;
  money?: number;
  time?: string;
}): any {
  return {
    characterState: {
      action: opts.action,
      location: { major: opts.major as any },
      stamina: opts.stamina ?? 100,
      money: opts.money ?? 0,
      dailyActionsDoneToday: [],
      inventory: [],
      runningAction: null,
      async setAction() {},
      async setLocation() {},
      async setStamina() {},
      async setSatiety() {},
      async setMood() {},
      async changeStamina() {},
      async changeSatiety() {},
      async changeMood() {},
      async changeMoney() {},
      async markActionDoneToday() {},
      async clearDailyActions() {},
      async setRunningAction() {},
      async clearRunningAction() {},
      getRunningAction() {
        return null;
      },
      async addItem(_item: any, _quantity?: number) {},
      async consumeItem() {
        return true;
      },
      getItemQuantity() {
        return 0;
      },
      log() {
        return {
          action: opts.action,
          location: { major: opts.major as any },
          stamina: opts.stamina ?? 100,
          money: opts.money ?? 0,
          dailyActionsDoneToday: [],
          inventory: [],
          runningAction: null,
        };
      },
    },
    worldState: {
      time: dayjs(opts.time ?? "2025-01-01T08:00:00"),
      log() {
        return {
          time: dayjs(opts.time ?? "2025-01-01T08:00:00"),
        };
      },
      async updateTime() {},
      async reset() {},
    },
  };
}

describe("getActionList", () => {
  it("returns only Wake_Up when current action is Sleep", () => {
    const context = createContext({ action: ActionId.Sleep, major: MajorScene.Home });
    const list = getActionList(context).map((a) => a.action);
    expect(list.length).toBe(2);
    expect(list).toEqual([ActionId.Wake_Up, ActionId.Sleep_For_A_Little]);
  });

  it("Home morning weekday 08:00 returns breakfast, go to school, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-01T08:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Eat_Breakfast,
      ActionId.Go_To_School_From_Home,
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Idle,
    ]);
  });

  it("Home noon weekday 12:00 returns idle, eat lunch", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-01T12:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Idle,
      ActionId.Eat_Lunch,
    ]);
  });

  it("Home evening weekday 19:00 returns eat dinner, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-01T19:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Eat_Dinner,
      ActionId.Idle,
    ]);
  });

  it("Home night weekday 23:00 returns sleep, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-01T23:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([ActionId.Sleep, ActionId.Idle]);
  });

  it("Home weekend afternoon Sunday 15:00 returns stay at home, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-05T15:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Stay_At_Home,
      ActionId.Idle,
    ]);
  });

  it("Home weekend morning Sunday 08:00 returns breakfast, go to school, stay at home, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-05T08:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Eat_Breakfast,
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Stay_At_Home,
      ActionId.Idle,
    ]);
  });

  it("Home weekend noon Sunday 12:00 returns stay at home, idle, eat lunch", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-05T12:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Stay_At_Home,
      ActionId.Idle,
      ActionId.Eat_Lunch,
    ]);
  });

  it("Home weekend evening Sunday 19:00 returns eat dinner, stay at home, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-05T19:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_To_Shop_From_Home,
      ActionId.Go_To_Cafe_From_Home,
      ActionId.Eat_Dinner,
      ActionId.Stay_At_Home,
      ActionId.Idle,
    ]);
  });

  it("Home weekend night Sunday 23:00 returns sleep, stay at home, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Home,
      time: "2025-01-05T23:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([ActionId.Stay_At_Home, ActionId.Sleep, ActionId.Idle]);
  });
  it("School weekday 10:00 returns study, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.School,
      time: "2025-01-01T10:00:00",
      stamina: 20,
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Study_At_School,
      ActionId.Go_To_Shop_From_School,
      ActionId.Go_To_Cafe_From_School,
      ActionId.Idle,
    ]);
  });

  it("School weekday 17:00 returns go home, idle", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.School,
      time: "2025-01-01T17:00:00",
      stamina: 20,
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Go_Home_From_School,
      ActionId.Go_To_Shop_From_School,
      ActionId.Go_To_Cafe_From_School,
      ActionId.Idle,
    ]);
  });

  it("Cafe noon 12:00 returns order coffee, work, go home/school, idle, eat lunch", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Cafe,
      time: "2025-01-01T12:00:00",
      money: 100,
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Order_Coffee,
      ActionId.Work_At_Cafe,
      ActionId.Go_Home_From_Cafe,
      ActionId.Go_To_School_From_Cafe,
      ActionId.Idle,
      ActionId.Eat_Lunch,
    ]);
  });

  it("Cafe 16:30 returns no work action", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Cafe,
      time: "2025-01-01T16:30:00",
      money: 100,
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Order_Coffee,
      ActionId.Go_Home_From_Cafe,
      ActionId.Go_To_School_From_Cafe,
      ActionId.Idle,
    ]);
  });

  it("returns only Drink_Coffee when current action is Order_Coffee", () => {
    const context = createContext({ action: ActionId.Order_Coffee, major: MajorScene.Cafe });
    const list = getActionList(context).map((a) => a.action);
    expect(list.length).toBe(1);
    expect(list).toEqual([ActionId.Drink_Coffee]);
  });

  it("Shop noon 12:00 returns buy, go home, go school, idle, eat lunch", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: MajorScene.Shop,
      time: "2025-01-01T12:00:00",
      money: 100,
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([
      ActionId.Buy_Item_At_Shop,
      ActionId.Go_Home_From_Shop,
      ActionId.Go_To_School_From_Shop,
      ActionId.Idle,
      ActionId.Eat_Lunch,
    ]);
  });

  it("Unknown location noon 12:00 returns anywhere filtered: idle, eat lunch", () => {
    const context = createContext({
      action: ActionId.Idle,
      major: "unknown",
      time: "2025-01-01T12:00:00",
    });
    const list = getActionList(context).map((a) => a.action);
    expect(list).toEqual([ActionId.Idle, ActionId.Eat_Lunch]);
  });
});
