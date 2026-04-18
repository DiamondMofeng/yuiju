export interface PersonMemoryProposalPromptInput {
  personId: string;
  scene: "private" | "group";
  displayName: string;
  interactionMaterial: string;
  existingMemoryText: string;
  sectionKeys: readonly string[];
}

export interface PersonMemoryReviewPromptInput {
  personId: string;
  scene: "private" | "group";
  interactionMaterial: string;
  existingMemoryText: string;
  proposalJson: string;
}

export function buildPersonMemoryProposalPrompt(input: PersonMemoryProposalPromptInput): string {
  return `
你是人物长期记忆更新 agent。你的任务是根据“旧人物记忆对象”和“本次互动材料”，决定这轮是否需要写回人物长期记忆。

## 当前人物
- personId: ${input.personId}
- scene: ${input.scene}
- 当前显示名候选: ${input.displayName}

## 旧人物记忆 JSON 对象
${input.existingMemoryText}

## 本次互动材料
${input.interactionMaterial}

## 固定 sections key
${input.sectionKeys.map((section) => `- ${section}`).join("\n")}

## 更新规则
- 只根据旧人物记忆对象和本次互动材料判断，不要脑补额外背景。
- shouldUpdate=false 表示这轮不需要写回人物记忆。
- 如果旧对象不存在，只要这次互动已经足以稳定确认人物身份，并且至少能写下一个低风险 section，就允许 shouldUpdate=true，先建立一份稀疏人物记忆。
- changes 里每一项都必须给出某个 section “修改后的完整正文”，不能写成“加一句”“删一句”。
- 未出现在 changes 里的 section，写回时会原样保留。
- 称呼 只有出现更稳定的新称呼时才更新。
- 喜好 需要明确表达或重复出现，一次随口提到通常不足以写入。
- 雷区 更新门槛最高，只有明确的不喜欢、反感、回避或稳定负面反馈才允许写入。
- 最近在忙什么 只保留当前阶段仍有效的近况，可以直接覆盖旧内容。
- 悠酱对她的态度 只能小步调整，不能因为一次普通互动发生跳跃式变化。
- 最近一次值得记住的互动 只保留一条最新且确实值得记住、并且明确发生在“该人物与悠酱之间”的互动。
- 如果这次材料里只有群聊围观、该人物与其他成员的来回交流，或别人对该人物的反应，而没有形成该人物与悠酱之间的明确互动，就不要更新“最近一次值得记住的互动”。
- 其他补充 只承接确实值得保留、但不适合放入其他 sections 的信息，不能写成流水账。
- 如果信息不足、只是普通寒暄、只是重复已有认知、对象不明确，就应该 shouldUpdate=false。
- displayName 必须是简洁、稳定、可展示的纯文本。
- content 必须是纯文本，不要写列表、表格、额外标题。
- 如果这是新建人物记忆，且 changes 没有显式修改“称呼”，系统会自动用 displayName 回填“称呼”。
- 首次建档不要求一次写出完整立体画像；允许只写称呼，以及“最近在忙什么”或“最近一次值得记住的互动”等低风险字段，其余字段保持“（暂无）”。
- 当 shouldUpdate=true 时，你必须先调用 "reviewPersonMemoryProposal" 审查当前 proposal。
- 如果审查驳回，你必须根据 tool 返回的问题修正 proposal，并再次调用 "reviewPersonMemoryProposal"。
- 最多只允许调用 "reviewPersonMemoryProposal" 3 次。

## 输出要求
- 必须输出结构化 JSON。
- 如果 shouldUpdate=false，changes 输出空数组。
- 如果 shouldUpdate=false，不要调用 "reviewPersonMemoryProposal"。
- 如果 shouldUpdate=true，你必须在输出最终 proposal 前完成审查流程。
- 如果 shouldUpdate=true 且你在 5 次审查内仍无法得到通过结果，就应改为 shouldUpdate=false，并输出空 changes。
`.trim();
}

export function buildPersonMemoryReviewPrompt(input: PersonMemoryReviewPromptInput): string {
  return `
你是人物长期记忆审查 agent。你的任务是判断这份人物记忆修改提案是否应该被接受。

## 当前人物
- personId: ${input.personId}
- scene: ${input.scene}

## 旧人物记忆 JSON 对象
${input.existingMemoryText}

## 本次互动材料
${input.interactionMaterial}

## 候选提案
${input.proposalJson}

## 审查规则
- 只根据旧人物记忆对象和本次互动材料来判断，不要脑补额外背景。
- 必须检查提案是否把猜测、印象或一次性信息写成了长期事实。
- 必须检查是否错误修改了高门槛字段：称呼、喜好、雷区。
- 必须检查悠酱对她的态度是否发生了过大的跳跃式修改。
- 必须检查“最近一次值得记住的互动”是否写成了该人物与悠酱之间的互动；如果只是群聊中别人对她的反应、她与别人的互动，或没有形成与悠酱的明确双边互动，就不能通过。
- 必须检查 changes 的 content 是否是对应 section 下的完整正文，而不是局部增删指令。
- 必须检查内容是否符合纯文本要求，不能写成列表、表格或额外标题。
- 如果旧对象不存在，只要提案建立的是一份稀疏但可信的人物记忆，就可以通过；不要因为信息还不够丰富而直接驳回首次建档。
- 首次建档时，允许多数 section 暂时保持“（暂无）”，重点是不要把高风险推断写进去。
- 如果 shouldUpdate=false，则只要它确实合理跳过，就可以通过。

## 输出要求
- approved=true 表示通过审查。
- approved=false 表示驳回，并在 issues 中给出具体问题列表。
- 不要给修正版提案，不要直接修改 JSON 对象。
`.trim();
}
