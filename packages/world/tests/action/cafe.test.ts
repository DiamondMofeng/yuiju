import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cafeAction } from "@/action/cafe";
import { chooseCafeCoffeeAgent } from "@/llm/agent";
import { ActionId, MajorScene, type InventoryItem } from "@yuiju/utils";

process.env.NODE_ENV = "development";

vi.mock("@/llm/agent", () => ({
  chooseCafeCoffeeAgent: vi.fn(),
}));

vi.mock("@/utils/logger", () => ({
  logger: {
    error: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("@/plan", () => ({
  planManager: {
    getState: vi.fn(async () => ({
      activePlanIds: [],
      activePlans: [],
      updatedAt: new Date(0).toISOString(),
    })),
  },
}));

const orderCoffeeAction = cafeAction.find((a) => a.action === ActionId.Order_Coffee);
const drinkCoffeeAction = cafeAction.find((a) => a.action === ActionId.Drink_Coffee);
const workAtCafeAction = cafeAction.find((a) => a.action === ActionId.Work_At_Cafe);

if (!orderCoffeeAction) {
  throw new Error("Order_Coffee action not found");
}
if (!drinkCoffeeAction) {
  throw new Error("Drink_Coffee action not found");
}
if (!workAtCafeAction) {
  throw new Error("Work_At_Cafe action not found");
}

function createMockCharacterState(opts: {
  money: number;
  stamina?: number;
  satiety?: number;
  mood?: number;
  inventory?: InventoryItem[];
  locationMajor: MajorScene;
}) {
  let currentMoney = opts.money;
  let currentStamina = opts.stamina ?? 100;
  let currentSatiety = opts.satiety ?? 70;
  let currentMood = opts.mood ?? 60;
  let currentInventory = [...(opts.inventory ?? [])];
  let currentAction: ActionId = ActionId.Idle;
  let currentLocationMajor = opts.locationMajor;

  return {
    action: currentAction,
    location: { major: currentLocationMajor },
    stamina: currentStamina,
    satiety: currentSatiety,
    mood: currentMood,
    money: currentMoney,
    dailyActionsDoneToday: [],
    inventory: currentInventory,
    runningAction: null,

    async setAction(action: ActionId) {
      currentAction = action;
      (this as any).action = action;
    },
    async setLocation(location: any) {
      currentLocationMajor = location.major;
      this.location = { major: currentLocationMajor };
    },
    async setStamina(stamina: number) {
      currentStamina = Math.min(100, Math.max(0, stamina));
      this.stamina = currentStamina;
    },
    async changeStamina(delta: number) {
      currentStamina = Math.min(100, Math.max(0, currentStamina + delta));
      this.stamina = currentStamina;
    },
    async setSatiety(satiety: number) {
      currentSatiety = Math.min(100, Math.max(0, satiety));
      this.satiety = currentSatiety;
    },
    async changeSatiety(delta: number) {
      currentSatiety = Math.min(100, Math.max(0, currentSatiety + delta));
      this.satiety = currentSatiety;
    },
    async setMood(mood: number) {
      currentMood = Math.min(100, Math.max(0, mood));
      this.mood = currentMood;
    },
    async changeMood(delta: number) {
      currentMood = Math.min(100, Math.max(0, currentMood + delta));
      this.mood = currentMood;
    },
    async changeMoney(delta: number) {
      currentMoney = Math.max(0, currentMoney + delta);
      this.money = currentMoney;
    },
    async markActionDoneToday(_action: ActionId) {},
    async clearDailyActions() {},
    async setRunningAction(runningAction: any) {
      this.runningAction = runningAction;
    },
    async clearRunningAction() {
      this.runningAction = null;
    },
    getRunningAction() {
      return this.runningAction;
    },
    async addItem(item: Omit<InventoryItem, "quantity">, quantity: number = 1) {
      const existing = this.inventory.find((i: any) => i.name === item.name);
      if (existing) {
        existing.description = item.description;
        existing.category = item.category;
        existing.metadata = item.metadata;
        existing.quantity = (existing.quantity ?? 0) + quantity;
      } else {
        this.inventory.push({ ...item, quantity });
      }

      currentInventory = this.inventory;
    },
    async consumeItem(itemName: string, quantity: number = 1) {
      const item = this.inventory.find((i: any) => i.name === itemName);
      if (!item || (item.quantity ?? 0) < quantity) {
        return false;
      }
      item.quantity -= quantity;
      currentInventory = this.inventory;
      return true;
    },
    getItemQuantity(itemName: string) {
      const item = this.inventory.find((i: any) => i.name === itemName);
      return item ? (item.quantity ?? 0) : 0;
    },
    log() {
      return {
        action: currentAction,
        location: this.location,
        stamina: currentStamina,
        satiety: currentSatiety,
        mood: currentMood,
        money: currentMoney,
        dailyActionsDoneToday: [],
        inventory: currentInventory,
      };
    },
  };
}

function createMockWorldState(timeISO: string = "2025-01-01T12:00:00") {
  return {
    time: dayjs(timeISO),
    log() {
      return { time: dayjs(timeISO) };
    },
    async updateTime(_newTime?: dayjs.Dayjs) {},
    async reset() {},
  };
}

describe("Cafe Actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Order_Coffee", () => {
    it("在咖啡店且金币足够时返回 true", () => {
      const context: any = {
        characterState: createMockCharacterState({
          money: 80,
          locationMajor: MajorScene.Cafe,
        }),
        worldState: createMockWorldState(),
      };
      expect(orderCoffeeAction.precondition(context)).toBe(true);
    });

    it("点单成功会扣钱并把咖啡放入背包", async () => {
      vi.mocked(chooseCafeCoffeeAgent).mockResolvedValue({
        value: "拼配热咖啡",
        quantity: 1,
      } as any);

      const characterState = createMockCharacterState({
        money: 100,
        locationMajor: MajorScene.Cafe,
      });
      const context: any = {
        characterState,
        worldState: createMockWorldState(),
      };

      const result = await orderCoffeeAction.executor(context);

      expect(characterState.action).toBe(ActionId.Order_Coffee);
      expect(characterState.money).toBe(20);
      expect(characterState.getItemQuantity("拼配热咖啡")).toBe(1);
      expect(result).toContain("拼配热咖啡");
    });
  });

  describe("Drink_Coffee", () => {
    it("喝咖啡会消费背包咖啡并恢复体力", async () => {
      const characterState = createMockCharacterState({
        money: 0,
        stamina: 50,
        locationMajor: MajorScene.Cafe,
        inventory: [
          {
            name: "拼配热咖啡",
            description: "店家每日拼配，香气温和，口感顺口。",
            category: "food",
            quantity: 1,
            metadata: { stamina: 8 },
          },
        ],
      });
      const context: any = {
        characterState,
        worldState: createMockWorldState(),
      };

      const result = await drinkCoffeeAction.executor(context);

      expect(characterState.action).toBe(ActionId.Drink_Coffee);
      expect(characterState.getItemQuantity("拼配热咖啡")).toBe(0);
      expect(characterState.stamina).toBe(55);
      expect(result).toContain("[体力+5]");
    });
  });

  describe("Work_At_Cafe", () => {
    it("16:30 不可打工，16:00 可打工且加钱20并扣体力10", async () => {
      const characterState = createMockCharacterState({
        money: 0,
        stamina: 50,
        locationMajor: MajorScene.Cafe,
      });

      const context1630: any = {
        characterState,
        worldState: createMockWorldState("2025-01-01T16:30:00"),
      };
      expect(workAtCafeAction.precondition(context1630)).toBe(false);

      const context1600: any = {
        characterState,
        worldState: createMockWorldState("2025-01-01T16:00:00"),
      };
      expect(workAtCafeAction.precondition(context1600)).toBe(true);

      const result = await workAtCafeAction.executor(context1600);
      expect(characterState.action).toBe(ActionId.Work_At_Cafe);
      expect(characterState.money).toBe(200);
      expect(characterState.stamina).toBe(40);
      expect(result).toContain("200元");
    });
  });
});
