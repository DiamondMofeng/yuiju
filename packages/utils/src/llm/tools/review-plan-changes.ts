import { generateText, Output, tool } from "ai";
import dayjs from "dayjs";
import { z } from "zod";
import type { BehaviorRecord, CharacterStateData, PlanState, WorldStateData } from "../../types";
import { deepseekProvider } from "../models";

const planChangeSchema = z.object({
  scope: z.enum(["longTerm", "shortTerm"]).describe("计划范围。"),
  changeType: z.enum(["created", "updated", "abandoned", "completed"]).describe("计划变更类型。"),
  currentPlan: z
    .string()
    .optional()
    .describe("当前已有计划。updated / abandoned / completed 时按规则填写。"),
  nextPlan: z.string().optional().describe("变更后的新计划。created / updated 时按规则填写。"),
  reason: z.string().describe("这次计划变更的直接依据。"),
});

const reviewResultSchema = z.object({
  approved: z.boolean().describe("是否通过审查。"),
  reason: z.string().describe("审查结论。"),
  issues: z.array(z.string()).optional().describe("未通过时需要修正的问题列表。"),
});

function formatPlanState(planState: PlanState): string {
  const longTermPlan = planState.longTermPlan?.title ?? "（无）";
  const shortTermPlans =
    planState.shortTermPlans.length > 0
      ? planState.shortTermPlans.map((plan, index) => `${index + 1}. ${plan.title}`).join("\n")
      : "（无）";

  return `长期计划：${longTermPlan}
短期计划：
${shortTermPlans}`;
}

function formatRecentBehaviors(recentBehaviorList: BehaviorRecord[]): string {
  if (recentBehaviorList.length === 0) {
    return "（无）";
  }

  return recentBehaviorList
    .map((item) => {
      const timestamp = dayjs(item.timestamp).format("YYYY-MM-DD HH:mm");
      return `- ${timestamp}｜${item.behavior}｜${item.description}`;
    })
    .join("\n");
}

export function reviewPlanChangesTool(input: {
  planState: PlanState;
  characterState: CharacterStateData;
  worldState: WorldStateData;
  eventDescription?: string;
  recentBehaviorList: BehaviorRecord[];
}) {
  return tool({
    description:
      "审查候选 planChanges 是否合理。只有审查通过后，才能把 planChanges 写进最终 JSON。",
    inputSchema: z.object({
      planChanges: z
        .array(planChangeSchema)
        .min(1)
        .describe("候选计划变更。必须传入你准备写进最终 JSON 的完整 planChanges。"),
    }),
    execute: async ({ planChanges }) => {
      const { output } = await generateText({
        model: deepseekProvider("deepseek-chat"),
        output: Output.object({
          schema: reviewResultSchema,
        }),
        prompt: `
你是计划变更审查 agent。你的任务是判断这些候选计划变更是否应该被接受。

## 当前计划状态
${formatPlanState(input.planState)}

## 当前角色状态
${JSON.stringify(input.characterState, null, 2)}

## 当前世界状态
${JSON.stringify(input.worldState, null, 2)}

## 当前事件
${input.eventDescription ?? "（无）"}

## 最近行为摘要
${formatRecentBehaviors(input.recentBehaviorList)}

## 候选 planChanges
${JSON.stringify(planChanges, null, 2)}

## 审查规则
- 只根据当前状态、当前事件、最近行为和当前计划来判断，不要脑补额外背景。
- created 只能有 nextPlan，不能有 currentPlan。
- updated 必须同时有 currentPlan 和 nextPlan，且两者不能只是同义改写或措辞润色。
- abandoned 只能有 currentPlan，不能有 nextPlan。
- completed 只能有 currentPlan，不能有 nextPlan，而且必须表示“这个计划已经完成”，不能只是“准备去做”。
- 不要把瞬时 action、即时需求或一步临时操作误判成长期计划。
- 如果更像是完成原计划，就不要判成 abandoned。
- 如果缺少明确依据，或者计划与当前上下文脱节，应驳回。

## 输出要求
- approved=true 表示通过审查。
- approved=false 表示驳回，并在 issues 中列出具体问题。
- 不要提供修正版，只做通过/驳回判断。
`.trim(),
      });

      return output;
    },
  });
}
