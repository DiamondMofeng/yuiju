import { describe, expect, it } from "vitest";
import { ActionId, MajorScene, type ActionAgentDecision, type ActionContext } from "@yuiju/utils";
import { buildBehaviorEpisode, buildPlanUpdateEpisodes } from "../../src/memory/episode-builder";

function createContext(): ActionContext {
  return {
    characterState: {
      action: ActionId.Idle,
      location: { major: MajorScene.Home },
      stamina: 80,
      satiety: 70,
      mood: 60,
      money: 100,
      dailyActionsDoneToday: [],
      inventory: [],
      runningAction: null,
      setAction: async () => {},
      setStamina: async () => {},
      setSatiety: async () => {},
      setMood: async () => {},
      setLocation: async () => {},
      changeStamina: async () => {},
      changeSatiety: async () => {},
      changeMood: async () => {},
      changeMoney: async () => {},
      markActionDoneToday: async () => {},
      clearDailyActions: async () => {},
      setRunningAction: async () => {},
      clearRunningAction: async () => {},
      getRunningAction: () => null,
      log() {
        return {
          action: this.action,
          location: this.location,
          stamina: this.stamina,
          satiety: this.satiety,
          mood: this.mood,
          money: this.money,
          dailyActionsDoneToday: this.dailyActionsDoneToday,
          inventory: this.inventory,
          runningAction: this.runningAction,
        };
      },
      addItem: async () => {},
      consumeItem: async () => false,
      getItemQuantity: () => 0,
    },
    worldState: {
      time: {} as never,
      log: () => ({ time: {} as never }),
      updateTime: async () => {},
      reset: async () => {},
    },
  };
}

function createDecision(overrides: Partial<ActionAgentDecision> = {}): ActionAgentDecision {
  return {
    action: ActionId.Study_At_School,
    reason: "需要推进学习计划",
    ...overrides,
  };
}

describe("world episode builder", () => {
  it("行为执行成功时生成 behavior episode", () => {
    const episode = buildBehaviorEpisode({
      context: createContext(),
      selectedAction: createDecision(),
      executionResult: "完成了一章练习",
      durationMinutes: 45,
      happenedAt: new Date("2026-03-13T10:00:00.000Z"),
      isDev: true,
    });

    expect(episode).not.toBeNull();
    expect(episode?.type).toBe("behavior");
    expect(episode?.summaryText).toContain("在学校学习");
    expect(episode?.summaryText).toContain("完成了一章练习");
    expect(episode?.payload.durationMinutes).toBe(45);
  });

  it("发呆行为不生成 behavior episode", () => {
    const episode = buildBehaviorEpisode({
      context: createContext(),
      selectedAction: createDecision({ action: ActionId.Idle }),
      durationMinutes: 10,
      happenedAt: new Date("2026-03-13T10:00:00.000Z"),
      isDev: true,
    });

    expect(episode).toBeNull();
  });

  it("计划未变化时不生成计划生命周期 episode", () => {
    const episodes = buildPlanUpdateEpisodes({
      changes: [],
      happenedAt: new Date("2026-03-13T10:00:00.000Z"),
      isDev: true,
    });

    expect(episodes).toHaveLength(0);
  });

  it("长期与短期计划变化时分别生成细粒度计划事件", () => {
    const episodes = buildPlanUpdateEpisodes({
      changes: [
        {
          planId: "plan_main_old",
          scope: "main",
          changeType: "superseded",
          before: {
            id: "plan_main_old",
            title: "努力学习",
            scope: "main",
            status: "active",
            source: "llm",
            createdAt: "2026-03-13T08:00:00.000Z",
            updatedAt: "2026-03-13T08:00:00.000Z",
          },
          after: {
            id: "plan_main_old",
            title: "努力学习",
            scope: "main",
            status: "superseded",
            source: "llm",
            createdAt: "2026-03-13T08:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
          },
        },
        {
          planId: "plan_active_1",
          scope: "active",
          changeType: "created",
          after: {
            id: "plan_active_1",
            title: "复习数学",
            scope: "active",
            status: "active",
            parentPlanId: "plan_main_1",
            source: "llm",
            createdAt: "2026-03-13T10:00:00.000Z",
            updatedAt: "2026-03-13T10:00:00.000Z",
          },
        },
      ],
      happenedAt: new Date("2026-03-13T10:00:00.000Z"),
      isDev: true,
    });

    expect(episodes).toHaveLength(2);
    expect(episodes[0]?.type).toBe("plan_superseded");
    expect(episodes[0]?.payload.planScope).toBe("main");
    expect(episodes[1]?.type).toBe("plan_created");
    expect(episodes[1]?.payload.planScope).toBe("active");
    expect(episodes[1]?.summaryText).toContain("复习数学");
    expect(episodes[1]?.payload.after?.parentPlanId).toBe("plan_main_1");
  });
});
