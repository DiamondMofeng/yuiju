import dayjs from "dayjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { shopAction } from "@/action/shop";
import { chooseShopProductAgent } from "@/llm/agent";
import { ActionId, MajorScene, type InventoryItem } from "@yuiju/utils";

process.env.NODE_ENV = "development";

vi.mock("@/llm/agent", () => ({
  chooseShopProductAgent: vi.fn(),
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

const buyItemAtShopAction = shopAction.find((a) => a.action === ActionId.Buy_Item_At_Shop);
if (!buyItemAtShopAction) {
  throw new Error("Buy_Item_At_Shop action not found");
}

function createMockCharacterState(opts: {
  money: number;
  stamina?: number;
  inventory?: InventoryItem[];
  locationMajor: MajorScene;
}) {
  let currentMoney = opts.money;
  let currentStamina = opts.stamina ?? 100;
  let currentInventory = [...(opts.inventory ?? [])];
  let currentAction: ActionId = ActionId.Idle;
  let currentLocationMajor = opts.locationMajor;

  return {
    action: currentAction,
    location: { major: currentLocationMajor },
    stamina: currentStamina,
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
    async consumeItem(_itemName: string, _quantity: number = 1) {
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
        money: currentMoney,
        dailyActionsDoneToday: [],
        inventory: currentInventory,
        runningAction: this.runningAction,
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

describe("Buy_Item_At_Shop Action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("precondition - 前置条件", () => {
    it("在商店且金币足够时返回 true", () => {
      const context: any = {
        characterState: createMockCharacterState({
          money: 30,
          locationMajor: MajorScene.Shop,
        }),
        worldState: createMockWorldState(),
      };
      expect(buyItemAtShopAction.precondition(context)).toBe(true);
    });

    it("不在商店时返回 false", () => {
      const context: any = {
        characterState: createMockCharacterState({
          money: 100,
          locationMajor: MajorScene.Home,
        }),
        worldState: createMockWorldState(),
      };
      expect(buyItemAtShopAction.precondition(context)).toBe(false);
    });

    it("金币不足时返回 false", () => {
      const context: any = {
        characterState: createMockCharacterState({
          money: 29,
          locationMajor: MajorScene.Shop,
        }),
        worldState: createMockWorldState(),
      };
      expect(buyItemAtShopAction.precondition(context)).toBe(false);
    });
  });

  describe("executor - 执行器", () => {
    it("余额足够时扣钱并入包（支持 quantity>1）", async () => {
      vi.mocked(chooseShopProductAgent).mockResolvedValue({
        value: "百奇",
        quantity: 2,
        reason: "想吃甜的",
      } as any);

      const characterState = createMockCharacterState({
        money: 200,
        locationMajor: MajorScene.Shop,
      });
      const context: any = {
        characterState,
        worldState: createMockWorldState(),
      };
      const result = await buyItemAtShopAction.executor(context);

      expect(characterState.action).toBe(ActionId.Buy_Item_At_Shop);
      expect(characterState.money).toBe(100);
      expect(characterState.getItemQuantity("百奇")).toBe(2);
      expect(result).toContain("百奇");
    });

    it("余额不足时跳过购买，不扣钱不入包", async () => {
      vi.mocked(chooseShopProductAgent).mockResolvedValue({
        value: "百奇",
        quantity: 1,
        reason: "试试",
      } as any);

      const characterState = createMockCharacterState({
        money: 49,
        locationMajor: MajorScene.Shop,
      });
      const context: any = {
        characterState,
        worldState: createMockWorldState(),
      };
      const result = await buyItemAtShopAction.executor(context);

      expect(characterState.money).toBe(49);
      expect(characterState.getItemQuantity("百奇")).toBe(0);
      expect(result).toContain("余额不足");
    });

    it("购买数量超过余额上限时会裁剪到可承受数量", async () => {
      vi.mocked(chooseShopProductAgent).mockResolvedValue({
        value: "纯软糖",
        quantity: 10,
        reason: "多买点",
      } as any);

      const characterState = createMockCharacterState({
        money: 120,
        locationMajor: MajorScene.Shop,
      });
      const context: any = {
        characterState,
        worldState: createMockWorldState(),
      };
      const result = await buyItemAtShopAction.executor(context);

      expect(characterState.money).toBe(20);
      expect(characterState.getItemQuantity("纯软糖")).toBe(2);
      expect(result).toContain("纯软糖");
    });
  });
});
