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

function normalizePlanTitle(title?: string): string | undefined {
  const normalized = title?.trim();
  return normalized ? normalized : undefined;
}

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
  parentPlanId?: string;
  reason?: string;
  source?: PlanSource;
  expiresAt?: string;
}): PlanItem {
  return {
    id: createStablePlanId(input.scope, input.title),
    title: input.title,
    scope: input.scope,
    status: "active",
    parentPlanId: input.parentPlanId,
    reason: input.reason,
    source: input.source ?? "llm",
    expiresAt: input.expiresAt,
    createdAt: input.nowIso,
    updatedAt: input.nowIso,
  };
}

function clonePlanState(state: PlanState): PlanState {
  return {
    mainPlanId: state.mainPlanId,
    activePlanIds: [...state.activePlanIds],
    mainPlan: state.mainPlan ? { ...state.mainPlan } : undefined,
    activePlans: state.activePlans.map((plan) => ({ ...plan })),
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
    previous.parentPlanId !== input.next.parentPlanId ||
    previous.reason !== input.next.reason ||
    previous.source !== input.next.source ||
    previous.expiresAt !== input.next.expiresAt
  );
}

function markPlanTerminal(
  plan: PlanItem,
  status: "completed" | "abandoned" | "superseded",
  nowIso: string,
): PlanItem {
  return {
    ...plan,
    status,
    updatedAt: nowIso,
  };
}

function rebuildPlanReferences(state: PlanState): void {
  state.mainPlanId = state.mainPlan?.id;
  state.activePlanIds = state.activePlans.map((plan) => plan.id);
}

function createApplyResult(state: PlanState, changes: PlanChange[]): PlanApplyResult {
  return {
    state,
    changes,
    relatedPlanId: state.activePlanIds[0] ?? state.mainPlanId,
  };
}

/**
 * 计划状态管理器。
 *
 * 说明：
 * - 计划状态以 Redis `plan_state` 为唯一真相源；
 * - 显式维护 mainPlanId / activePlanIds 引用层，避免后续只靠对象嵌套推导当前活跃计划；
 * - proposal 中未显式提供的字段视为“不更新”，从而把计划变更改为按条件触发。
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

  /**
   * 显式完成计划。
   *
   * 说明：
   * - completed 只负责声明“该计划已经完成”，并将其从 Redis 运行态中移除；
   * - 关联中的活跃计划不会被强制终止，但会同步更新 parentPlanId，避免悬挂引用。
   */
  async completePlan(planId: string): Promise<PlanApplyResult> {
    return await this.transitionPlanToTerminal({
      planId,
      status: "completed",
    });
  }

  /**
   * 显式放弃计划。
   */
  async abandonPlan(planId: string): Promise<PlanApplyResult> {
    return await this.transitionPlanToTerminal({
      planId,
      status: "abandoned",
    });
  }

  /**
   * 清理当前运行态中可能残留的终态计划。
   *
   * 说明：
   * - 历史终态应只通过 Episode 回溯，不继续停留在 Redis plan_state；
   * - 该方法可作为补偿清理入口，避免旧数据或异常写入导致状态膨胀。
   */
  async cleanupTerminalPlans(): Promise<PlanApplyResult> {
    const currentState = clonePlanState(await this.getState());
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];

    if (currentState.mainPlan && currentState.mainPlan.status !== "active") {
      changes.push({
        planId: currentState.mainPlan.id,
        scope: "main",
        changeType: currentState.mainPlan.status,
        before: clonePlanItem(currentState.mainPlan),
        after: clonePlanItem(currentState.mainPlan),
      });
      currentState.mainPlan = undefined;
      currentState.mainPlanId = undefined;
    }

    const activePlans = currentState.activePlans.filter((plan) => {
      if (plan.status === "active") {
        return true;
      }

      changes.push({
        planId: plan.id,
        scope: "active",
        changeType: plan.status,
        before: clonePlanItem(plan),
        after: clonePlanItem(plan),
      });
      return false;
    });

    currentState.activePlans = activePlans;
    rebuildPlanReferences(currentState);
    this.syncActivePlanParentReferences(currentState, changes, nowIso);
    currentState.updatedAt = nowIso;

    await savePlanStateData(currentState);
    return createApplyResult(currentState, changes);
  }

  /**
   * 应用计划建议，返回计划变更结果。
   *
   */
  async applyProposal(proposal: PlanProposal): Promise<PlanApplyResult> {
    const currentState = clonePlanState(await this.getState());
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];
    const defaultSource = proposal.source ?? "llm";
    const mainPlanExplicitlyProvided = Object.hasOwn(proposal, "mainPlanTitle");
    const activePlansExplicitlyProvided = Object.hasOwn(proposal, "activePlanTitles");

    const previousMainPlan = clonePlanItem(currentState.mainPlan);

    if (mainPlanExplicitlyProvided) {
      const nextMainTitle = normalizePlanTitle(proposal.mainPlanTitle);

      if (!nextMainTitle && previousMainPlan) {
        changes.push({
          planId: previousMainPlan.id,
          scope: "main",
          changeType: "abandoned",
          before: previousMainPlan,
          after: markPlanTerminal(previousMainPlan, "abandoned", nowIso),
        });
        currentState.mainPlan = undefined;
        currentState.mainPlanId = undefined;
      } else if (nextMainTitle) {
        if (!previousMainPlan) {
          currentState.mainPlan = createPlanItem({
            scope: "main",
            title: nextMainTitle,
            nowIso,
            reason: proposal.reason,
            source: defaultSource,
            expiresAt: proposal.expiresAt,
          });
          currentState.mainPlanId = currentState.mainPlan.id;
          changes.push({
            planId: currentState.mainPlan.id,
            scope: "main",
            changeType: "created",
            after: clonePlanItem(currentState.mainPlan),
          });
        } else if (previousMainPlan.title !== nextMainTitle) {
          const nextMainPlan = createPlanItem({
            scope: "main",
            title: nextMainTitle,
            nowIso,
            reason: proposal.reason,
            source: defaultSource,
            expiresAt: proposal.expiresAt,
          });
          changes.push({
            planId: previousMainPlan.id,
            scope: "main",
            changeType: "superseded",
            before: previousMainPlan,
            after: markPlanTerminal(previousMainPlan, "superseded", nowIso),
          });
          currentState.mainPlan = nextMainPlan;
          currentState.mainPlanId = nextMainPlan.id;
          changes.push({
            planId: nextMainPlan.id,
            scope: "main",
            changeType: "created",
            after: clonePlanItem(nextMainPlan),
          });
        } else {
          const updatedMainPlan: PlanItem = {
            ...previousMainPlan,
            parentPlanId: undefined,
            reason: proposal.reason ?? previousMainPlan.reason,
            source: defaultSource,
            expiresAt: proposal.expiresAt ?? previousMainPlan.expiresAt,
            updatedAt: nowIso,
          };

          if (hasMeaningfulPlanChanges({ previous: previousMainPlan, next: updatedMainPlan })) {
            currentState.mainPlan = updatedMainPlan;
            currentState.mainPlanId = updatedMainPlan.id;
            changes.push({
              planId: updatedMainPlan.id,
              scope: "main",
              changeType: "updated",
              before: previousMainPlan,
              after: clonePlanItem(updatedMainPlan),
            });
          }
        }
      }
    }

    if (activePlansExplicitlyProvided) {
      const nextActiveTitles = (proposal.activePlanTitles ?? [])
        .map((title) => normalizePlanTitle(title))
        .filter((title): title is string => Boolean(title));

      const previousActivePlans = currentState.activePlans.map((plan) => ({ ...plan }));
      const previousByTitle = new Map(previousActivePlans.map((plan) => [plan.title, plan]));
      const nextActivePlans: PlanItem[] = [];
      const parentPlanId = currentState.mainPlanId;

      for (const title of nextActiveTitles) {
        const existing = previousByTitle.get(title);
        const nextPlan = existing
          ? {
              ...existing,
              status: "active" as const,
              parentPlanId,
              reason: proposal.reason ?? existing.reason,
              source: defaultSource,
              expiresAt: proposal.expiresAt ?? existing.expiresAt,
              updatedAt: nowIso,
            }
          : createPlanItem({
              scope: "active",
              title,
              nowIso,
              parentPlanId,
              reason: proposal.reason,
              source: defaultSource,
              expiresAt: proposal.expiresAt,
            });

        nextActivePlans.push(nextPlan);

        if (!existing) {
          changes.push({
            planId: nextPlan.id,
            scope: "active",
            changeType: "created",
            after: clonePlanItem(nextPlan),
          });
        } else if (hasMeaningfulPlanChanges({ previous: existing, next: nextPlan })) {
          changes.push({
            planId: nextPlan.id,
            scope: "active",
            changeType: "updated",
            before: existing,
            after: clonePlanItem(nextPlan),
          });
        }
      }

      for (const previous of previousActivePlans) {
        if (!nextActiveTitles.includes(previous.title)) {
          changes.push({
            planId: previous.id,
            scope: "active",
            changeType: "abandoned",
            before: previous,
            after: markPlanTerminal(previous, "abandoned", nowIso),
          });
        }
      }

      currentState.activePlans = nextActivePlans;
      rebuildPlanReferences(currentState);
    }

    this.syncActivePlanParentReferences(currentState, changes, nowIso);
    currentState.updatedAt = nowIso;
    rebuildPlanReferences(currentState);

    await savePlanStateData(currentState);

    return createApplyResult(currentState, changes);
  }

  private async transitionPlanToTerminal(input: {
    planId: string;
    status: "completed" | "abandoned";
  }): Promise<PlanApplyResult> {
    const currentState = clonePlanState(await this.getState());
    const nowIso = new Date().toISOString();
    const changes: PlanChange[] = [];

    if (currentState.mainPlan?.id === input.planId) {
      const before = clonePlanItem(currentState.mainPlan);
      const after = before ? markPlanTerminal(before, input.status, nowIso) : undefined;
      if (before && after) {
        changes.push({
          planId: before.id,
          scope: "main",
          changeType: input.status,
          before,
          after,
        });
      }
      currentState.mainPlan = undefined;
      currentState.mainPlanId = undefined;
    } else {
      const index = currentState.activePlans.findIndex((plan) => plan.id === input.planId);
      if (index >= 0) {
        const before = clonePlanItem(currentState.activePlans[index]);
        const after = before ? markPlanTerminal(before, input.status, nowIso) : undefined;
        if (before && after) {
          changes.push({
            planId: before.id,
            scope: "active",
            changeType: input.status,
            before,
            after,
          });
        }
        currentState.activePlans.splice(index, 1);
      }
    }

    this.syncActivePlanParentReferences(currentState, changes, nowIso);
    rebuildPlanReferences(currentState);
    currentState.updatedAt = nowIso;

    await savePlanStateData(currentState);
    return createApplyResult(currentState, changes);
  }

  /**
   * 维护活跃计划与主计划之间的引用一致性。
   *
   * 说明：
   * - 当主计划被创建、替换、完成或清空后，活跃计划的 parentPlanId 也需要同步；
   * - 只有引用真实发生变化时才产出 updated 事件，避免制造低质量噪音。
   */
  private syncActivePlanParentReferences(
    state: PlanState,
    changes: PlanChange[],
    nowIso: string,
  ): void {
    state.activePlans = state.activePlans.map((plan) => {
      const expectedParentPlanId = state.mainPlanId;
      if (plan.parentPlanId === expectedParentPlanId) {
        return plan;
      }

      const nextPlan: PlanItem = {
        ...plan,
        parentPlanId: expectedParentPlanId,
        updatedAt: nowIso,
      };

      if (hasMeaningfulPlanChanges({ previous: plan, next: nextPlan })) {
        changes.push({
          planId: plan.id,
          scope: "active",
          changeType: "updated",
          before: clonePlanItem(plan),
          after: clonePlanItem(nextPlan),
        });
      }

      return nextPlan;
    });
  }
}

export const planManager = PlanManager.getInstance();
