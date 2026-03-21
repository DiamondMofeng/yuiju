import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/llm/agent", () => ({
  chooseFoodAgent: vi.fn(),
}));

import { anywhereAction } from "@/action/anywhere";
import { chooseFoodAgent } from "@/llm/agent";
import { ActionId, type InventoryItem } from "@yuiju/utils";

process.env.NODE_ENV = "development";

// Mock logger 避免日志输出干扰测试
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

import { logger } from "@/utils/logger";

// 获取 Eat_Item action 定义
const eatItemAction = anywhereAction.find((a) => a.action === ActionId.Eat_Item);
if (!eatItemAction) {
  throw new Error("Eat_Item action not found");
}

/**
 * 创建测试用的食物物品
 */
function createFoodItem(name: string, quantity: number, staminaRestore: number): InventoryItem {
  return {
    name,
    description: `${name}可以恢复${staminaRestore}点体力`,
    category: "food",
    quantity,
    metadata: { stamina: staminaRestore },
  };
}

/**
 * 创建测试用的材料物品
 */
function createMaterialItem(name: string, quantity: number): InventoryItem {
  return {
    name,
    description: `${name}是一种材料`,
    category: "material",
    quantity,
    metadata: {},
  };
}

/**
 * 创建 Mock 的角色状态
 */
function createMockCharacterState(opts: {
  inventory: InventoryItem[];
  stamina?: number;
  satiety?: number;
  mood?: number;
  action?: ActionId;
}) {
  let currentStamina = opts.stamina ?? 100;
  let currentSatiety = opts.satiety ?? 70;
  let currentMood = opts.mood ?? 60;
  let currentAction = opts.action ?? ActionId.Idle;
  let currentInventory = [...opts.inventory];

  return {
    action: currentAction,
    location: { major: "home" as const },
    stamina: currentStamina,
    satiety: currentSatiety,
    mood: currentMood,
    money: 0,
    dailyActionsDoneToday: [],
    inventory: currentInventory,
    runningAction: null,

    // Mock 方法
    async setAction(action: ActionId) {
      currentAction = action;
      this.action = action;
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
    async changeMoney(_delta: number) {},
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
    async addItem(_item: any, _quantity?: number) {},
    async consumeItem(itemName: string, quantity: number = 1): Promise<boolean> {
      const item = this.inventory.find((item) => item.name === itemName);

      if (!item || item.quantity < quantity) {
        return false;
      }

      item.quantity -= quantity;

      // 如果数量为0，从背包中移除
      if (item.quantity <= 0) {
        const index = this.inventory.indexOf(item);
        this.inventory.splice(index, 1);
      }

      currentInventory = this.inventory;
      return true;
    },
    getItemQuantity(itemName: string): number {
      const item = this.inventory.find((item) => item.name === itemName);
      return item ? item.quantity : 0;
    },
    log() {
      return {
        action: currentAction,
        location: this.location,
        stamina: currentStamina,
        satiety: currentSatiety,
        mood: currentMood,
        money: this.money,
        dailyActionsDoneToday: [],
        inventory: currentInventory,
      };
    },
  };
}

/**
 * 创建 Mock 的世界状态
 */
function createMockWorldState(timeISO: string = "2025-01-01T12:00:00") {
  return {
    time: dayjs(timeISO),
    log() {
      return {
        time: dayjs(timeISO),
      };
    },
    async updateTime(_newTime?: dayjs.Dayjs) {},
    async reset() {},
  };
}

describe("Eat_Item Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("precondition - 前置条件", () => {
    it("有食物时返回 true", () => {
      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 2, 10)],
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = eatItemAction.precondition(context);

      expect(result).toBe(true);
    });

    it("无食物时返回 false", () => {
      const characterState = createMockCharacterState({
        inventory: [],
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = eatItemAction.precondition(context);

      expect(result).toBe(false);
    });

    it("只有材料物品时返回 false", () => {
      const characterState = createMockCharacterState({
        inventory: [createMaterialItem("木材", 5)],
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = eatItemAction.precondition(context);

      expect(result).toBe(false);
    });

    it("食物数量为 0 时返回 false", () => {
      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 0, 10)],
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = eatItemAction.precondition(context);

      expect(result).toBe(false);
    });
  });

  describe("executor - 执行器", () => {
    it("消费单个食物（默认数量 1）", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([
        { value: "苹果", quantity: 1, reason: "有点饿" },
      ] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 1, 10)],
        stamina: 50,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };
      const result = await eatItemAction.executor(context);

      // 验证状态变更
      expect(characterState.action).toBe(ActionId.Eat_Item);
      expect(characterState.stamina).toBe(60);
      expect(characterState.inventory).toHaveLength(0); // 苹果被消费完，从背包移除
      expect(result).toContain("苹果");
    });

    it("消费多个食物（指定数量）", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([
        { value: "面包", quantity: 3, reason: "需要补充体力" },
      ] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("面包", 5, 15)],
        stamina: 40,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };
      const result = await eatItemAction.executor(context);

      // 验证状态变更
      expect(characterState.action).toBe(ActionId.Eat_Item);
      expect(characterState.stamina).toBe(85); // 40 + 15 * 3
      expect(characterState.inventory[0].quantity).toBe(2); // 5 - 3 = 2
      expect(result).toContain("面包");
    });

    it("消费多个不同食物", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([
        { value: "苹果", quantity: 2, reason: "先吃水果" },
        { value: "蛋糕", quantity: 1, reason: "想吃甜的" },
      ] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 2, 10), createFoodItem("蛋糕", 1, 25)],
        stamina: 30,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };
      const result = await eatItemAction.executor(context);

      // 验证状态变更
      expect(characterState.action).toBe(ActionId.Eat_Item);
      expect(characterState.stamina).toBe(75); // 30 + 10 * 2 + 25
      expect(characterState.inventory).toHaveLength(0); // 所有食物都被消费完
      expect(result).toContain("苹果");
      expect(result).toContain("蛋糕");
    });

    it("无食物时返回提示", async () => {
      const characterState = createMockCharacterState({
        inventory: [createMaterialItem("木材", 5)],
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = await eatItemAction.executor(context);
      expect(result).toContain("没有可吃的食物");
      expect(characterState.action).toBe(ActionId.Idle);
    });

    it("agent 未选择时返回提示", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 1, 10)],
        stamina: 50,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };

      const result = await eatItemAction.executor(context);
      expect(result).toContain("没有选择");
      expect(characterState.action).toBe(ActionId.Eat_Item);
      expect(characterState.stamina).toBe(50);
    });

    it("物品不存在时记录错误并继续执行", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([
        { value: "不存在的食物", quantity: 1, reason: "试试" },
      ] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 1, 10)],
        stamina: 50,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };
      const result = await eatItemAction.executor(context);

      // action 仍被设置
      expect(characterState.action).toBe(ActionId.Eat_Item);

      // 体力没有变化
      expect(characterState.stamina).toBe(50);
      expect(result).toContain("没有选择");
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("处理部分物品不存在的情况", async () => {
      vi.mocked(chooseFoodAgent).mockResolvedValue([
        { value: "苹果", quantity: 1, reason: "先吃水果" },
        { value: "不存在的食物", quantity: 1, reason: "试试" },
        { value: "面包", quantity: 1, reason: "再吃点" },
      ] as any);

      const characterState = createMockCharacterState({
        inventory: [createFoodItem("苹果", 2, 10), createFoodItem("面包", 1, 15)],
        stamina: 40,
        action: ActionId.Idle,
      });
      const worldState = createMockWorldState();

      const context: any = {
        characterState,
        worldState,
      };
      await eatItemAction.executor(context);

      // 验证状态变更
      expect(characterState.action).toBe(ActionId.Eat_Item);
      expect(characterState.stamina).toBe(65); // 40 + 10 + 15（不存在的食物没有恢复体力）
      expect(characterState.inventory).toHaveLength(1); // 苹果和面包被消费，不存在的食物不在背包中
      expect(characterState.inventory[0].name).toBe("苹果"); // 苹果剩 1 个
      expect(characterState.inventory[0].quantity).toBe(1);
      expect(logger.error).not.toHaveBeenCalled();
    });
  });

  describe("durationMin - 持续时间", () => {
    it("固定持续时间为 10 分钟", async () => {
      const context: any = {
        characterState: createMockCharacterState({ inventory: [] }),
        worldState: createMockWorldState(),
      };

      // durationMin 可能是 number 或函数，需要判断类型
      const duration =
        typeof eatItemAction.durationMin === "function"
          ? await eatItemAction.durationMin(context, undefined, [])
          : eatItemAction.durationMin;

      expect(duration).toBe(10);
    });
  });
});
