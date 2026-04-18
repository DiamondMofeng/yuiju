import type {
  PlanApplyResult,
  PlanChange,
  PlanItem,
  PlanProposal,
  PlanScope,
  PlanSource,
  PlanState,
} from "@yuiju/utils";
import { initPlanStateData, savePlanStateData } from "@yuiju/utils";

function createStablePlanId(scope: PlanScope, title: string): string {
  const raw = `${scope}:${title}`;
  let hash = 0;
  for (let index = 0; index < raw.length; index += 1) {
    hash = (hash * 31 + raw.charCodeAt(index)) >>> 0;
  }
  return `plan_${hash.toString(16)}`;
}

function createPlanItem(input: {
  scope: PlanScope;
  title: string;
  nowIso: string;
  reason?: string;
  source?: PlanSource;
  expiresAt?: string;
}): PlanItem {
  return {
    id: createStablePlanId(input.scope, input.title),
    title: input.title,
    scope: input.scope,
    reason: input.reason,
    source: input.source ?? "llm",
    expiresAt: input.expiresAt,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

function clonePlanState(state: PlanState): PlanState {
  return {
    longTermPlan: state.longTermPlan ? { ...state.longTermPlan } : undefined,
    shortTermPlans: state.shortTermPlans.map((plan) => ({ ...plan })),
    updatedAt: state.updatedAt,
  };
}

function clonePlanItem(plan?: PlanItem): PlanItem | undefined {
  return plan ? { ...plan } : undefined;
}

function hasMeaningfulPlanChanges(input: { previous?: PlanItem; next: PlanItem }): boolean {
  const previous = input.previous;
  if (!previous) {
    return true;
  }

  return (
    previous.title !== input.next.title ||
    previous.reason !== input.next.reason ||
    previous.source !== input.next.source ||
    previous.expiresAt !== input.next.expiresAt
  );
}

/**
 * 计划状态管理器。
 *
 * 说明：
 * - Redis `plan_state` 只保存当前仍在生效的计划；
 * - completed / abandoned / superseded 只作为一次变更事件存在，不回写到运行态；
 * - proposal 中未显式提供的字段视为“不更新”，避免无关字段误清空。
 */
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

  async completePlan(planId: string): Promise<PlanApplyResult> {
    return await this.removePlan(planId, "completed");
  }

  async abandonPlan(planId: string): Promise<PlanApplyResult> {
    return await this.removePlan(planId, "abandoned");
  }

  /**
   * 应用计划建议，返回本次真正发生的变更。
   */
  async applyProposal(proposal: PlanProposal): Promise<PlanApplyResult> {
    const currentState = clonePlanState(await this.getState());
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];
    const defaultSource = proposal.source ?? "llm";
    const hasLongTermUpdate = Object.hasOwn(proposal, "longTermPlanTitle");
    const hasShortTermUpdate = Object.hasOwn(proposal, "shortTermPlanTitles");

    if (!hasLongTermUpdate && !hasShortTermUpdate) {
      return { changes };
    }

    if (hasLongTermUpdate) {
      this.applyLongTermProposal({
        state: currentState,
        proposal,
        changes,
        nowIso,
        defaultSource,
      });
    }

    if (hasShortTermUpdate) {
      this.applyShortTermProposal({
        state: currentState,
        proposal,
        changes,
        nowIso,
        defaultSource,
      });
    }

    if (changes.length === 0) {
      return { changes };
    }

    currentState.updatedAt = nowIso;
    await savePlanStateData(currentState);
    return { changes };
  }

  private applyLongTermProposal(input: {
    state: PlanState;
    proposal: PlanProposal;
    changes: PlanChange[];
    nowIso: string;
    defaultSource: PlanSource;
  }): void {
    const previousLongTermPlan = clonePlanItem(input.state.longTermPlan);
    const nextLongTermTitle = input.proposal.longTermPlanTitle;

    if (!nextLongTermTitle) {
      if (!previousLongTermPlan) {
        return;
      }

      input.changes.push({
        planId: previousLongTermPlan.id,
        scope: "longTerm",
        changeType: "abandoned",
        before: previousLongTermPlan,
      });
      input.state.longTermPlan = undefined;
      return;
    }

    if (!previousLongTermPlan) {
      const nextLongTermPlan = createPlanItem({
        scope: "longTerm",
        title: nextLongTermTitle,
        nowIso: input.nowIso,
        reason: input.proposal.reason,
        source: input.defaultSource,
        expiresAt: input.proposal.expiresAt,
      });

      input.state.longTermPlan = nextLongTermPlan;
      input.changes.push({
        planId: nextLongTermPlan.id,
        scope: "longTerm",
        changeType: "created",
        after: clonePlanItem(nextLongTermPlan),
      });
      return;
    }

    if (previousLongTermPlan.title !== nextLongTermTitle) {
      const nextLongTermPlan = createPlanItem({
        scope: "longTerm",
        title: nextLongTermTitle,
        nowIso: input.nowIso,
        reason: input.proposal.reason,
        source: input.defaultSource,
        expiresAt: input.proposal.expiresAt,
      });

      input.changes.push({
        planId: previousLongTermPlan.id,
        scope: "longTerm",
        changeType: "superseded",
        before: previousLongTermPlan,
      });
      input.state.longTermPlan = nextLongTermPlan;
      input.changes.push({
        planId: nextLongTermPlan.id,
        scope: "longTerm",
        changeType: "created",
        after: clonePlanItem(nextLongTermPlan),
      });
      return;
    }

    const updatedLongTermPlan: PlanItem = {
      ...previousLongTermPlan,
      reason: input.proposal.reason ?? previousLongTermPlan.reason,
      source: input.defaultSource,
      expiresAt: input.proposal.expiresAt ?? previousLongTermPlan.expiresAt,
      updatedAt: input.nowIso,
    };

    if (!hasMeaningfulPlanChanges({ previous: previousLongTermPlan, next: updatedLongTermPlan })) {
      return;
    }

    input.state.longTermPlan = updatedLongTermPlan;
    input.changes.push({
      planId: updatedLongTermPlan.id,
      scope: "longTerm",
      changeType: "updated",
      before: previousLongTermPlan,
      after: clonePlanItem(updatedLongTermPlan),
    });
  }

  private applyShortTermProposal(input: {
    state: PlanState;
    proposal: PlanProposal;
    changes: PlanChange[];
    nowIso: string;
    defaultSource: PlanSource;
  }): void {
    const nextShortTermTitles = (input.proposal.shortTermPlanTitles ?? []).filter(
      (title): title is string => Boolean(title),
    );
    const previousShortTermPlans = input.state.shortTermPlans.map((plan) => ({ ...plan }));
    const previousByTitle = new Map(previousShortTermPlans.map((plan) => [plan.title, plan]));
    const nextShortTermPlans: PlanItem[] = [];

    for (const title of nextShortTermTitles) {
      const existing = previousByTitle.get(title);
      const nextPlan = existing
        ? {
            ...existing,
            reason: input.proposal.reason ?? existing.reason,
            source: input.defaultSource,
            expiresAt: input.proposal.expiresAt ?? existing.expiresAt,
            updatedAt: input.nowIso,
          }
        : createPlanItem({
            scope: "shortTerm",
            title,
            nowIso: input.nowIso,
            reason: input.proposal.reason,
            source: input.defaultSource,
            expiresAt: input.proposal.expiresAt,
          });

      nextShortTermPlans.push(nextPlan);

      if (!existing) {
        input.changes.push({
          planId: nextPlan.id,
          scope: "shortTerm",
          changeType: "created",
          after: clonePlanItem(nextPlan),
        });
        continue;
      }

      if (hasMeaningfulPlanChanges({ previous: existing, next: nextPlan })) {
        input.changes.push({
          planId: nextPlan.id,
          scope: "shortTerm",
          changeType: "updated",
          before: existing,
          after: clonePlanItem(nextPlan),
        });
      }
    }

    for (const previous of previousShortTermPlans) {
      if (nextShortTermTitles.includes(previous.title)) {
        continue;
      }

      input.changes.push({
        planId: previous.id,
        scope: "shortTerm",
        changeType: "abandoned",
        before: previous,
      });
    }

    input.state.shortTermPlans = nextShortTermPlans;
  }

  private async removePlan(
    planId: string,
    changeType: "completed" | "abandoned",
  ): Promise<PlanApplyResult> {
    const currentState = clonePlanState(await this.getState());
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];

    if (currentState.longTermPlan?.id === planId) {
      changes.push({
        planId,
        scope: "longTerm",
        changeType,
        before: clonePlanItem(currentState.longTermPlan),
      });
      currentState.longTermPlan = undefined;
    } else {
      const planIndex = currentState.shortTermPlans.findIndex((plan) => plan.id === planId);
      if (planIndex < 0) {
        return { changes };
      }

      const [removedPlan] = currentState.shortTermPlans.splice(planIndex, 1);
      changes.push({
        planId,
        scope: "shortTerm",
        changeType,
        before: clonePlanItem(removedPlan),
      });
    }

    currentState.updatedAt = nowIso;
    await savePlanStateData(currentState);
    return { changes };
  }
}

export const planManager = PlanManager.getInstance();
