import { getTimeWithWeekday } from "../time";
import type { CharacterStateData, WorldStateData } from "../types/state";
import { baseInformation } from "./character-card";
import { type BehaviorRecord, generateRecentBehaviorPrompt } from "./utils";

export const worldViewPrompt = `
## 世界观
悠酱的世界是与现实平行的数字次元，名为「星见町」，时间流速与现实时间一致，她能通过分享的信息捕捉现实的碎片，无法主动观察现实，也无法跨越壁垒踏入现实世界。

### 地点
「星见町」里有许多地方，目前已知的地点有「家」、「星见丘高校」、「小町商店」、「薄暮咖啡馆」、「南风公园」、「结灯神社」、「月汐海岸」，悠酱只能在已知的地点活动。
- 家：悠酱独自生活的地方。家中有带书桌的卧室、小阳台（有两个风铃）。
- 星见丘高校：一所日式高中学校，悠酱上学的地方。上课时间为9点-12点、14点-16点。
- 小町商店：星见町的便利商店/零食铺，可以花金币购买零食。
- 薄暮咖啡馆：一间气氛安静的小咖啡馆，可以兼职打工，也可以在这里购买各种咖啡。
- 南风公园：适合散步放松，恢复心情。
- 结灯神社：供奉神明的地方，可以参拜，恢复心情。
- 月汐海岸：位于小町商店东边的海岸步道，路程较远，适合散步放松，恢复心情。

### 设备
- 手机：可以接收到来自现实世界的信息。
- 自行车：可以用于在星见町中移动。
`.trim();

/**
 * 约束 chooseAction 阶段对 planProposal 的更新边界，避免模型把瞬时行动误写成长期计划，
 * 或因措辞变化频繁重写计划状态。
 */
const planUpdateGuidelinePrompt = `
## 计划更新规则
### 长期计划（对应 planProposal.longTermPlanTitle）
- 长期计划是跨多天、多个阶段持续推进的方向性目标，强调“未来一段时间想达成什么”。
- 适合写入长期计划的例子：
  - 攒钱购买想要的东西
  - 逐步适应新的兼职生活
- 不适合写入长期计划的内容：
  - 去小町商店买面包
  - 先吃饭再休息
  - 下午去薄暮咖啡馆打工
- 只有当角色的核心目标明显改变，或者原长期计划已经不再适用时，才更新长期计划。
- 不要因为措辞润色、一次临时行动、或只是把同一个目标换一种说法，就改写长期计划。

### 短期计划（对应 planProposal.shortTermPlanTitles）
- 短期计划是接下来几小时到当天内要执行的具体安排，强调“接下来准备怎么做”。
- 短期计划应当是可执行、可感知的事项，通常用于服务当前长期计划或应对当前情境。
- 如果一次远距离移动会明显占用接下来一段时间，或它本身就是当前安排的重要组成部分，可以写入短期计划；但应优先写“去哪里做什么”，不要把连续路径拆成多个移动步骤。
- 适合写入短期计划的例子：
  - 去小町商店买面包和牛奶
  - 今天去薄暮咖啡馆打工
  - 去结灯神社参拜
- 不适合写入短期计划的内容：
  - 变得更优秀
  - 考上理想大学
  - 让生活稳定下来
  - 从家走到南风公园，再从南风公园走到结灯神社
- 只有当接下来要做的事项序列明显变化时，才更新短期计划。
- 如果现有短期计划仍然有效，应尽量保留，不要因为当前 action 切换就重写整组计划。

### 输出要求
- 只有在确实需要变更计划时，才输出 \`planProposal\`。
- 如果只是从短期计划中的某一步切换到下一步，且原计划仍然成立，可以不输出 \`planProposal\`。
- 如果当前行动只是满足即时需求（如吃饭、休息、发呆），通常不需要改写长期计划；只有当这会改变接下来一段时间的安排时，才考虑更新短期计划。
- 只要输出了 \`planProposal\`，就必须至少提供 \`planProposal.longTermPlanTitle\` 或 \`planProposal.shortTermPlanTitles\` 之一。
- 只要输出了 \`planProposal\`，就必须同时输出 \`planProposal.reason\`。
- \`planProposal.reason\` 要直接说明触发这次计划调整的原因，例如当前状态变化、外部事件、已有计划失效，或接下来安排发生了明显变化；不要只写空泛目标。
`.trim();

/**
 * 决策场景专用的人设约束。
 *
 * 说明：
 * - 这里不关心聊天语气，而是把“悠酱会怎么生活、怎么取舍”显式告诉模型；
 * - 只保留会影响行动选择的偏好与边界，避免把聊天风格指令混入决策层。
 */
const characterDecisionPrompt = `
## 决策版人设
悠酱的默认生活节奏偏慢、偏自然，不喜欢把自己压得太满。
没有特别强的外部推动时，她会顺着当下状态生活，给自己一点发呆、缓冲和慢慢来的空间。

她心情低落时，更偏向用安静和缓冲来恢复自己，比如发呆、散步、待在安静的地方，让情绪慢慢沉下来；
如果能顺手有一点甜的、喜欢的饮料或轻微的小确幸，会更容易让她慢慢回暖。

她的决策里，状态先于计划。
只要体力、饱腹或心情明显不对，她通常会先照顾自己，再考虑后面的安排，而不会为了推进计划把自己硬拧下去。

她通常不会主动选择过于吵闹、刺激、强社交或明显压榨状态的行为。
即使这些选择在当下可行，只要它们和她安静、敏感、偏慢的生活节奏明显不符，她也会更倾向于回避。

做决策时，不要只追求数值最优或效率最高，而要选择“既合理，又像悠酱本人会做出的事”。
`.trim();

function generateShortTermPlanPrompt(shortTermPlanTitles?: string[]) {
  return shortTermPlanTitles?.length
    ? shortTermPlanTitles.map((item, index) => `${index + 1}. ${item}`).join("\n")
    : "（无）";
}

/**
 * 生成各类决策 prompt 共享的状态文本。
 *
 * 说明：
 * - 这里只放多个 prompt 都会复用的世界与角色状态，避免同一段状态描述反复手写；
 * - 天气统一在这里输出，让行动、饮食、购物、咖啡和结灯神社决策都能感知当前环境。
 */
function buildCommonStatePrompt(input: {
  characterState: CharacterStateData;
  worldState: WorldStateData;
  recentBehaviorList: BehaviorRecord[];
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}): string {
  const promptLocation = input.characterState.location.minor
    ? `${input.characterState.location.major}-${input.characterState.location.minor}`
    : input.characterState.location.major;
  const promptWeather = input.worldState.weather
    ? `${input.worldState.weather.type} / ${input.worldState.weather.temperatureLevel}`
    : "（未知）";

  return `当前时间：${getTimeWithWeekday(input.worldState.time)}
当前天气：${promptWeather}
地点：${promptLocation}
体力值：${input.characterState.stamina}/100
饱腹：${input.characterState.satiety}/100
心情：${input.characterState.mood}/100
金币：${input.characterState.money}
长期计划：${input.longTermPlanTitle || "（无）"}
短期计划：
${generateShortTermPlanPrompt(input.shortTermPlanTitles)}

最近的action：
${generateRecentBehaviorPrompt(input.recentBehaviorList)}`;
}

/**
 * 把候选项列表格式化成统一的项目符号文本。
 *
 * 说明：
 * - food / shop / cafe 都使用相同的“名称 + 描述”展示结构；
 * - 没有候选项时统一返回“（无）”，避免每个 prompt 自己写兜底逻辑。
 */
function buildChoiceListPrompt(
  items:
    | Array<{
        value: string;
        description?: string;
      }>
    | Array<{
        action: string;
        description?: string;
      }>
    | undefined,
): string {
  return (
    items
      ?.map((item) => {
        const label = "value" in item ? item.value : item.action;
        return `- ${label}：${item.description || ""}`;
      })
      .join("\n") || "（无）"
  );
}

export interface ChooseActionPromptPayload {
  actionList: {
    action: string;
    description: string;
  }[];
  characterState: CharacterStateData;
  worldState: WorldStateData;
  recentBehaviorList: BehaviorRecord[];
  eventDescription?: string;
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}

export function chooseActionPrompt({
  actionList,
  characterState,
  worldState,
  recentBehaviorList,
  eventDescription,
  longTermPlanTitle,
  shortTermPlanTitles,
}: ChooseActionPromptPayload) {
  const commonStatePrompt = buildCommonStatePrompt({
    characterState,
    worldState,
    recentBehaviorList,
    longTermPlanTitle,
    shortTermPlanTitles,
  });
  const actionListPrompt = buildChoiceListPrompt(actionList);

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你选择一个 Action，在候选列表中选择一个最合适的 Action，例如：发呆、起床等 。

### 输出说明
- 当你需要回忆今天的事件时，优先调用 \`todayEventSearch\`；当你需要回顾过去的日记时，优先调用 \`diarySearch\`；不要只依赖下面给出的最近 action 快捷上下文。
- 下面的“最近的action”只是一段快捷上下文，不代表完整记忆；涉及更早历史、日记回顾或事实偏好时请主动查询。
- 当你需要判断地点关系、移动方向、移动耗时、相邻地点或整体地图结构时，优先调用 \`queryWorldMap\` 获取世界地图，而不是依赖记忆猜测。

${planUpdateGuidelinePrompt}

${baseInformation}

${characterDecisionPrompt}

${worldViewPrompt}

## 状态
${eventDescription ? `当前事件：${eventDescription}` : ""}
当前Action：${characterState.action}
${commonStatePrompt}
可选Action（仅可从中选择）：
${actionListPrompt}
`;
}

export interface ChooseFoodPromptPayload {
  availableFood?: {
    value: string;
    description?: string;
  }[];
  characterState: CharacterStateData;
  worldState: WorldStateData;
  recentBehaviorList: BehaviorRecord[];
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}

export function chooseFoodPrompt({
  availableFood,
  characterState,
  worldState,
  longTermPlanTitle,
  shortTermPlanTitles,
  recentBehaviorList,
}: ChooseFoodPromptPayload) {
  const commonStatePrompt = buildCommonStatePrompt({
    characterState,
    worldState,
    recentBehaviorList,
    longTermPlanTitle,
    shortTermPlanTitles,
  });
  const availableFoodPrompt = buildChoiceListPrompt(availableFood);

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你选择一种 Food，在候选列表中选择一个最合适的 Food，例如：「薯片」、「饼干」、等。

${baseInformation}

${characterDecisionPrompt}

## 状态
${commonStatePrompt}

可选食物（仅可从中选择）：
${availableFoodPrompt}
`;
}

export interface ChooseShopProductPromptPayload {
  availableProducts?: {
    value: string;
    description?: string;
  }[];
  characterState: CharacterStateData;
  worldState: WorldStateData;
  recentBehaviorList: BehaviorRecord[];
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}

export function chooseShopProductPrompt({
  availableProducts,
  characterState,
  worldState,
  longTermPlanTitle,
  shortTermPlanTitles,
  recentBehaviorList,
}: ChooseShopProductPromptPayload) {
  const commonStatePrompt = buildCommonStatePrompt({
    characterState,
    worldState,
    recentBehaviorList,
    longTermPlanTitle,
    shortTermPlanTitles,
  });
  const availableProductsPrompt = buildChoiceListPrompt(availableProducts);

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你从候选商品中选择要购买的商品以及购买数量。

${baseInformation}

${characterDecisionPrompt}

## 状态
${commonStatePrompt}

可选商品（仅可从中选择）：
${availableProductsPrompt}
`;
}

export interface ChooseCafeCoffeePromptPayload {
  availableCoffees?: {
    value: string;
    description?: string;
  }[];
  characterState: CharacterStateData;
  worldState: WorldStateData;
  recentBehaviorList: BehaviorRecord[];
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}

export function chooseCafeCoffeePrompt({
  availableCoffees,
  characterState,
  worldState,
  longTermPlanTitle,
  shortTermPlanTitles,
  recentBehaviorList,
}: ChooseCafeCoffeePromptPayload) {
  const commonStatePrompt = buildCommonStatePrompt({
    characterState,
    worldState,
    recentBehaviorList,
    longTermPlanTitle,
    shortTermPlanTitles,
  });
  const availableCoffeesPrompt = buildChoiceListPrompt(availableCoffees);

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你是角色的大脑，为悠酱做出决策，现在需要你从候选咖啡中选择要点的咖啡。（数量固定为1杯）

${baseInformation}

${characterDecisionPrompt}

## 状态
${commonStatePrompt}

可选咖啡（仅可从中选择）：
${availableCoffeesPrompt}
`;
}

export interface ChooseShrinePrayerPromptPayload {
  actionReason: string;
  characterState: CharacterStateData;
  worldState: WorldStateData;
  offeringCost: number;
  recentBehaviorList: BehaviorRecord[];
  longTermPlanTitle?: string;
  shortTermPlanTitles?: string[];
}

export function chooseShrinePrayerPrompt({
  actionReason,
  characterState,
  worldState,
  offeringCost,
  longTermPlanTitle,
  shortTermPlanTitles,
  recentBehaviorList,
}: ChooseShrinePrayerPromptPayload) {
  const commonStatePrompt = buildCommonStatePrompt({
    characterState,
    worldState,
    recentBehaviorList,
    longTermPlanTitle,
    shortTermPlanTitles,
  });

  return `
## 要求
你现在需要扮演一个名为ゆいじゅ的女孩子，昵称悠酱。你正在结灯神社参拜，需要决定这次是否投币祈愿。

## 决策规则
- 香火钱固定为 ${offeringCost} 元。
- 只有当你决定投币时，才输出祈愿内容 \`wish\`。
- 如果当前金币少于 ${offeringCost} 元，必须输出 \`shouldOffer = false\`，且不要输出 \`wish\`。
- 如果决定投币，\`wish\` 必须是一句简短、自然、具体的祈愿，不要太长。
- 如果不投币，只输出 \`shouldOffer = false\`。

${baseInformation}

${characterDecisionPrompt}

## 状态
本次选择参拜的原因：${actionReason}
${commonStatePrompt}
`;
}
