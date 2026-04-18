import type {
  AgentPlanChange,
  PlanApplyResult,
  PlanChange,
  PlanItem,
  PlanScope,
  PlanState,
} from "@yuiju/utils";
import { initPlanStateData, savePlanStateData } from "@yuiju/utils";

function createStablePlanId(scope: PlanScope, plan: string): string {
  const raw = `${scope}:${plan}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `plan_${hash.toString(16)}`;
}

function clonePlanState(state: PlanState): PlanState {
  return {
    longTermPlan: state.longTermPlan ? { ...state.longTermPlan } : undefined,
    shortTermPlans: state.shortTermPlans.map((plan) => ({ ...plan })),
    updatedAt: state.updatedAt,
  };
}

export class PlanManager {
  private static instance: PlanManager | null = null;

  static getInstance(): PlanManager {
    if (!PlanManager.instance) {
      PlanManager.instance = new PlanManager();
    }
    return PlanManager.instance;
  }

  async getState(): Promise<PlanState> {
    return await initPlanStateData();
  }

  async previewPlanChanges(
    planChanges: AgentPlanChange[],
    currentState?: PlanState,
  ): Promise<PlanApplyResult> {
    return this.resolvePlanChanges(planChanges, currentState ?? (await this.getState()));
  }

  /**
   * 按 agent 最终确认的 planChanges 一次性更新计划状态。
   *
   * 说明：
   * - 所有变更先作用在克隆态上，任一校验失败都会中断整次提交；
   * - longTerm 只能有一个计划，shortTerm 保持有序列表；
   * - updated 表示“同一位置上的计划内容被改写”，直接记录为一次更新。
   */
  async applyPlanChanges(planChanges: AgentPlanChange[]): Promise<PlanApplyResult> {
    const currentState = await this.getState();
    const result = await this.resolvePlanChanges(planChanges, currentState);

    if (result.changes.length === 0) {
      return result;
    }

    await savePlanStateData(result.nextState);
    return {
      changes: result.changes,
    };
  }

  private async resolvePlanChanges(
    planChanges: AgentPlanChange[],
    currentState: PlanState,
  ): Promise<PlanApplyResult & { nextState: PlanState }> {
    if (planChanges.length === 0) {
      return {
        changes: [],
        nextState: clonePlanState(currentState),
      };
    }

    const nextState = clonePlanState(currentState);
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];

    for (const planChange of planChanges) {
      if (planChange.changeType === "created") {
        if (planChange.currentPlan || !planChange.nextPlan) {
          throw new Error(`非法 created 计划变更: ${JSON.stringify(planChange)}`);
        }

        const nextPlan: PlanItem = {
          id: createStablePlanId(planChange.scope, planChange.nextPlan),
          title: planChange.nextPlan,
          scope: planChange.scope,
          reason: planChange.reason,
          source: "llm",
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        if (planChange.scope === "longTerm") {
          if (nextState.longTermPlan) {
            throw new Error(`长期计划已存在，无法 created: ${planChange.nextPlan}`);
          }

          nextState.longTermPlan = nextPlan;
        } else {
          if (nextState.shortTermPlans.some((item) => item.title === planChange.nextPlan)) {
            throw new Error(`短期计划已存在，无法 created: ${planChange.nextPlan}`);
          }

          nextState.shortTermPlans.push(nextPlan);
        }

        changes.push({
          planId: nextPlan.id,
          scope: planChange.scope,
          changeType: "created",
          after: { ...nextPlan },
        });
        continue;
      }

      if (planChange.changeType === "updated") {
        if (
          !planChange.currentPlan ||
          !planChange.nextPlan ||
          planChange.currentPlan === planChange.nextPlan
        ) {
          throw new Error(`非法 updated 计划变更: ${JSON.stringify(planChange)}`);
        }

        if (planChange.scope === "longTerm") {
          const currentPlan = nextState.longTermPlan;
          if (!currentPlan || currentPlan.title !== planChange.currentPlan) {
            throw new Error(`长期计划不存在，无法 updated: ${planChange.currentPlan}`);
          }

          const nextPlan: PlanItem = {
            ...currentPlan,
            id: createStablePlanId("longTerm", planChange.nextPlan),
            title: planChange.nextPlan,
            reason: planChange.reason,
            source: "llm",
            updatedAt: nowIso,
          };

          nextState.longTermPlan = nextPlan;
          changes.push({
            planId: nextPlan.id,
            scope: "longTerm",
            changeType: "updated",
            before: { ...currentPlan },
            after: { ...nextPlan },
          });
          continue;
        }

        const planIndex = nextState.shortTermPlans.findIndex(
          (item) => item.title === planChange.currentPlan,
        );
        if (planIndex < 0) {
          throw new Error(`短期计划不存在，无法 updated: ${planChange.currentPlan}`);
        }

        const duplicatedPlan = nextState.shortTermPlans.find(
          (item, index) => index !== planIndex && item.title === planChange.nextPlan,
        );
        if (duplicatedPlan) {
          throw new Error(`短期计划已存在，无法 updated 为: ${planChange.nextPlan}`);
        }

        const currentPlan = nextState.shortTermPlans[planIndex];
        const nextPlan: PlanItem = {
          ...currentPlan,
          id: createStablePlanId("shortTerm", planChange.nextPlan),
          title: planChange.nextPlan,
          reason: planChange.reason,
          source: "llm",
          updatedAt: nowIso,
        };

        nextState.shortTermPlans.splice(planIndex, 1, nextPlan);
        changes.push({
          planId: nextPlan.id,
          scope: "shortTerm",
          changeType: "updated",
          before: { ...currentPlan },
          after: { ...nextPlan },
        });
        continue;
      }

      if (!planChange.currentPlan || planChange.nextPlan) {
        throw new Error(`非法 ${planChange.changeType} 计划变更: ${JSON.stringify(planChange)}`);
      }

      if (planChange.scope === "longTerm") {
        const currentPlan = nextState.longTermPlan;
        if (!currentPlan || currentPlan.title !== planChange.currentPlan) {
          throw new Error(
            `长期计划不存在，无法 ${planChange.changeType}: ${planChange.currentPlan}`,
          );
        }

        nextState.longTermPlan = undefined;
        changes.push({
          planId: currentPlan.id,
          scope: "longTerm",
          changeType: planChange.changeType,
          before: { ...currentPlan },
        });
        continue;
      }

      const planIndex = nextState.shortTermPlans.findIndex(
        (item) => item.title === planChange.currentPlan,
      );
      if (planIndex < 0) {
        throw new Error(`短期计划不存在，无法 ${planChange.changeType}: ${planChange.currentPlan}`);
      }

      const currentPlan = nextState.shortTermPlans[planIndex];
      nextState.shortTermPlans.splice(planIndex, 1);
      changes.push({
        planId: currentPlan.id,
        scope: "shortTerm",
        changeType: planChange.changeType,
        before: { ...currentPlan },
      });
    }

    nextState.updatedAt = nowIso;
    return { changes, nextState };
  }
}

export const planManager = PlanManager.getInstance();
