import { z } from "zod";

export const agentPlanChangeSchema = z.object({
  scope: z.enum(["longTerm", "shortTerm"]).describe("计划范围。"),
  changeType: z.enum(["created", "updated", "abandoned", "completed"]).describe("计划变更类型。"),
  currentPlan: z
    .string()
    .optional()
    .describe("当前已有计划。updated / abandoned / completed 时按规则填写。"),
  nextPlan: z.string().optional().describe("变更后的新计划。created / updated 时按规则填写。"),
  reason: z.string().describe("这次计划变更的理由。"),
});
