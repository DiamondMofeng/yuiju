import { beforeEach, describe, expect, it, vi } from "vitest";

describe("Plan Manager", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    vi.clearAllMocks();
    vi.resetModules();
  });

  async function createPlanTestContext(initialState?: unknown) {
    let planStateJson = initialState ? JSON.stringify(initialState) : null;
    const redisInstance = {
      get: vi.fn(async (key: string) => {
        if (key.includes("plan:state")) {
          return planStateJson;
        }
        return null;
      }),
      set: vi.fn(async (_key: string, value: string) => {
        planStateJson = value;
        return "OK";
      }),
      hgetall: vi.fn(async () => ({})),
      hset: vi.fn(async () => 1),
      hget: vi.fn(async () => null),
      quit: vi.fn(async () => undefined),
    };

    vi.doMock("ioredis", () => {
      return {
        default: function MockRedis() {
          return redisInstance as any;
        },
      };
    });

    const { planManager } = await import("../../src/plan");
    const { initPlanStateData } = await import("../../../utils/src/redis");
    return {
      planManager,
      initPlanStateData,
      redisInstance,
    };
  }

  it("创建主计划后可以稳定读取并维护引用字段", async () => {
    const { planManager, initPlanStateData } = await createPlanTestContext();

    const result = await planManager.applyProposal({
      mainPlanTitle: "努力学习，考上理想的大学",
      reason: "阶段性长期目标",
      source: "llm",
    });

    expect(result.state.mainPlan?.title).toBe("努力学习，考上理想的大学");
    expect(result.state.mainPlanId).toBe(result.state.mainPlan?.id);
    expect(result.state.mainPlan?.reason).toBe("阶段性长期目标");

    const persisted = await initPlanStateData();
    expect(persisted.mainPlan?.title).toBe("努力学习，考上理想的大学");
    expect(persisted.mainPlanId).toBe(persisted.mainPlan?.id);
  });

  it("创建活跃计划集合后会继承主计划引用", async () => {
    const { planManager } = await createPlanTestContext();

    await planManager.applyProposal({
      mainPlanTitle: "准备考试",
    });

    const result = await planManager.applyProposal({
      activePlanTitles: ["完成今天的作业", "复习数学", "预习明天课程"],
      reason: "拆分当前执行步骤",
    });

    expect(result.state.activePlans.map((plan) => plan.title)).toEqual([
      "完成今天的作业",
      "复习数学",
      "预习明天课程",
    ]);
    expect(result.state.activePlanIds).toEqual(result.state.activePlans.map((plan) => plan.id));
    expect(
      result.state.activePlans.every((plan) => plan.parentPlanId === result.state.mainPlanId),
    ).toBe(true);
  });

  it("同内容重复 proposal 不产生无意义变更", async () => {
    const { planManager } = await createPlanTestContext();

    await planManager.applyProposal({
      mainPlanTitle: "准备考试",
      activePlanTitles: ["复习数学"],
      reason: "第一次规划",
    });

    const result = await planManager.applyProposal({
      mainPlanTitle: "准备考试",
      activePlanTitles: ["复习数学"],
      reason: "第一次规划",
    });

    expect(result.changes).toHaveLength(0);
  });

  it("更新活跃计划时会放弃旧计划并创建新计划", async () => {
    const { planManager } = await createPlanTestContext({
      activePlanIds: ["plan_old"],
      activePlans: [
        {
          id: "plan_old",
          title: "完成作业",
          scope: "active",
          status: "active",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.applyProposal({
      activePlanTitles: ["复习数学", "准备考试"],
    });

    expect(result.changes.some((change) => change.changeType === "abandoned")).toBe(true);
    expect(result.changes.filter((change) => change.changeType === "created")).toHaveLength(2);
  });

  it("主计划改名时会产出 superseded 和 created 两条事件", async () => {
    const { planManager } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "努力学习",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: [],
      activePlans: [],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.applyProposal({
      mainPlanTitle: "准备考试",
    });

    expect(result.changes.map((change) => change.changeType).slice(0, 2)).toEqual([
      "superseded",
      "created",
    ]);
  });

  it("清空主计划时会标记 abandoned", async () => {
    const { planManager } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "努力学习",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: [],
      activePlans: [],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.applyProposal({
      mainPlanTitle: undefined,
    });

    expect(result.state.mainPlan).toBeUndefined();
    expect(result.changes[0]?.changeType).toBe("abandoned");
  });

  it("未显式提供计划字段时不会误清空已有计划", async () => {
    const { planManager } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "努力学习",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: [],
      activePlans: [],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.applyProposal({
      reason: "本次 tick 没有新的计划调整",
    });

    expect(result.state.mainPlan?.title).toBe("努力学习");
    expect(result.changes).toHaveLength(0);
  });

  it("主计划替换后会同步更新活跃计划的 parentPlanId", async () => {
    const { planManager } = await createPlanTestContext({
      mainPlanId: "plan_old_main",
      mainPlan: {
        id: "plan_old_main",
        title: "旧长期计划",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: ["plan_active_1"],
      activePlans: [
        {
          id: "plan_active_1",
          title: "今天复习数学",
          scope: "active",
          status: "active",
          parentPlanId: "plan_old_main",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.applyProposal({
      mainPlanTitle: "新长期计划",
    });

    expect(result.state.mainPlan?.title).toBe("新长期计划");
    expect(result.state.activePlans[0]?.parentPlanId).toBe(result.state.mainPlanId);
    expect(
      result.changes.some((change) => change.scope === "active" && change.changeType === "updated"),
    ).toBe(true);
  });

  it("显式完成活跃计划后会将其从运行态中移除", async () => {
    const { planManager, initPlanStateData } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "准备考试",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: ["plan_active_1", "plan_active_2"],
      activePlans: [
        {
          id: "plan_active_1",
          title: "完成今天作业",
          scope: "active",
          status: "active",
          parentPlanId: "plan_main",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
        {
          id: "plan_active_2",
          title: "复习数学",
          scope: "active",
          status: "active",
          parentPlanId: "plan_main",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.completePlan("plan_active_1");

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]?.changeType).toBe("completed");
    expect(result.state.activePlans.map((plan) => plan.id)).toEqual(["plan_active_2"]);

    const persisted = await initPlanStateData();
    expect(persisted.activePlanIds).toEqual(["plan_active_2"]);
  });

  it("显式完成主计划后会清空主计划并解除活跃计划挂靠", async () => {
    const { planManager } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "准备考试",
        scope: "main",
        status: "active",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: ["plan_active_1"],
      activePlans: [
        {
          id: "plan_active_1",
          title: "复习数学",
          scope: "active",
          status: "active",
          parentPlanId: "plan_main",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.completePlan("plan_main");

    expect(result.state.mainPlan).toBeUndefined();
    expect(result.state.activePlans[0]?.parentPlanId).toBeUndefined();
    expect(result.changes.map((change) => change.changeType)).toEqual(["completed", "updated"]);
  });

  it("清理终态计划时会从 Redis 运行态中移除残留数据", async () => {
    const { planManager, initPlanStateData } = await createPlanTestContext({
      mainPlanId: "plan_main",
      mainPlan: {
        id: "plan_main",
        title: "过期主计划",
        scope: "main",
        status: "abandoned",
        source: "llm",
        createdAt: "2026-03-14T10:00:00.000Z",
        updatedAt: "2026-03-14T10:00:00.000Z",
      },
      activePlanIds: ["plan_active_1", "plan_active_2"],
      activePlans: [
        {
          id: "plan_active_1",
          title: "已完成子计划",
          scope: "active",
          status: "completed",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
        {
          id: "plan_active_2",
          title: "仍在执行的子计划",
          scope: "active",
          status: "active",
          parentPlanId: "plan_main",
          source: "llm",
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
        },
      ],
      updatedAt: "2026-03-14T10:00:00.000Z",
    });

    const result = await planManager.cleanupTerminalPlans();

    expect(result.state.mainPlan).toBeUndefined();
    expect(result.state.activePlans.map((plan) => plan.id)).toEqual(["plan_active_2"]);
    expect(result.state.activePlans[0]?.parentPlanId).toBeUndefined();
    expect(result.changes.some((change) => change.changeType === "completed")).toBe(true);
    expect(result.changes.some((change) => change.changeType === "abandoned")).toBe(true);

    const persisted = await initPlanStateData();
    expect(persisted.mainPlan).toBeUndefined();
    expect(persisted.activePlanIds).toEqual(["plan_active_2"]);
  });
});
