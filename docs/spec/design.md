# 技术方案

## 主动消息触发能力

### 结论

- 主动分享是 world 侧能力，不是 message 侧能力。
- 第一版只做固定目标群聊，不做私聊、多群、渠道选择。
- message 只提供“获取群聊上下文”和“发送并记录消息”。
- world 不落库主动分享结果；真实消息由 message 现有消息记录保存。

### 主流程

```text
Action 完成
  -> completionEvent 完成结算
  -> 更新 behavior episode
  -> world 判断该 Action 是否值得进入主动分享流程
  -> world 调度主动分享异步任务
  -> 清理 runningAction

主动分享异步任务
  -> world 选择目标群聊（第一版读取配置，未来由 LLM 决策）
  -> message 获取目标群最近消息
  -> world LLM 判断是否分享并生成消息
  -> shouldSend=false：结束
  -> shouldSend=true：message 发送并记录群消息
```

主动分享是异步副作用，不能阻塞 runningAction 清理，也不能影响下一次 tick 的 `eventDescription`。

### 模块边界

world 负责：

- 识别 Action 完成后的生活事件。
- 调度主动分享异步任务。
- 获取群聊上下文作为 LLM 输入。
- 调 LLM 判断是否分享、生成消息。
- 调 message 发送群消息。

message 负责：

- 返回目标群最近消息上下文。
- 发送群消息。
- 回读已发送消息。
- 记录到现有群聊会话历史。

message 不负责：

- 判断悠酱是否想分享生活。
- 理解 Action / completionEvent / 世界状态。
- 调主动分享决策 LLM。

### 决策时机

- 第一版在 Action 完成后决策。
- 不在 Action 选择阶段保存主动消息意图。
- 原因：完成时有真实结果，也能拿到最新群聊上下文。

### 目标群

- 第一版在 `yuiju.config.ts` 中显式配置目标群。
- 不从 `groupWhiteList` 隐式选择。
- 未来由 world 侧 LLM 在候选群聊中决策发送目标。

```ts
message: {
  proactive: {
    groupTargetId: 123456,
  },
}
```

### 候选目标接口

第一版只传一个固定群聊目标，但接口保留未来多目标扩展。

```ts
interface ProactiveMessageTargetCandidate {
  type: "group" | "private";
  id: number;
  label: string;
  recentContext?: {
    summary?: string;
    historyJson: string;
  };
}
```

第一版只构造：

```ts
[
  {
    type: "group",
    id: config.message.proactive.groupTargetId,
    label: "目标群聊",
    recentContext: { summary, historyJson },
  },
];
```

### LLM 输出

第一版目标固定，不让 LLM 选渠道。

```ts
interface ProactiveGroupMessageDecision {
  shouldSend: boolean;
  reason: string;
  message: string;
}
```

未来多目标时再扩展：

```ts
interface ProactiveMessageDecision {
  shouldSend: boolean;
  target?: {
    type: "group" | "private";
    id: number;
  };
  reason: string;
  message: string;
}
```

### LLM 输入

包含：

- Action 完成结果。
- completionContext。
- 当前时间、地点、角色状态摘要。
- 目标群最近消息摘要和结构化历史。
- 悠酱角色设定与群聊回复规则。

要求：

- 判断当前群聊是否适合插入这条生活分享。
- 生成自然群聊消息，不要像系统通知。
- 不提 Action、completionEvent、触发记录等内部概念。

### Action 入口规则

world 不对所有 Action 都调用主动分享 LLM。

第一版只处理明确有结果的 Action，例如：

- `Cook_At_Home` 完成并产出料理。
- `Work_At_Cafe` 完成并结算工资。

普通移动、发呆、短暂停留不进入主动分享流程。

### 行为完成链路

在 `recoverRunningAction` 中只调度异步任务，不等待发送完成：

```text
completionEvent
  -> buildCompletedBehaviorEpisodeUpdate
  -> updateMemoryEpisodeById
  -> scheduleActionCompletionProactiveShare
  -> clearRunningAction
```

### message 能力接口

```ts
interface GroupConversationContext {
  groupId: number;
  groupLabel: string;
  summary?: string;
  historyJson: string;
}

async function getGroupConversationContext(input: {
  groupId: number;
  limit?: number;
}): Promise<GroupConversationContext>;
```

```ts
async function sendAndRecordGroupProactiveMessage(input: {
  groupId: number;
  message: string;
  sessionLabel: string;
}): Promise<{
  sentMessageIds: number[];
}>;
```

### 真相源

- Action 完成事实：world behavior episode。
- 实际发出的消息：message 回读并记录的群消息。
- 主动分享决策：第一版不长期落库，只打克制日志。

### 第一版不做

- 主动分享结果落库。
- 复杂任务状态机。
- 延迟发送。
- 失败自动重试。
- Redis 去重与节流。
- 私聊主动消息。
- 多群目标选择。
- LLM 选择发送渠道。
- 主动消息修改角色状态。
