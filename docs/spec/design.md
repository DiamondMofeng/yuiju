# 技术方案

## Satori Runtime 接入第一阶段

### 目标

第一阶段只处理 `@yuiju/message` 内运行 Satori runtime 后的消息主流程边界，不接入飞书真实链路。

目标是：

- 将群聊主流程从 NapCat / OneBot v11 字段中解耦出来。
- 让现有 NapCat QQ 群聊行为保持可用。
- 在 `@yuiju/message` 进程内直接运行 Satori runtime，后续飞书接入复用同一个 runtime 边界。
- 让现有消息模型迁移到 Satori Session 和 Message Element，不再把 Satori 消息二次转换成当前代码里的 OneBot 风格消息结构。
- 简化群聊回复判断流程，不再由业务代码预先判断消息是否 at 或引用回复悠酱。

第一阶段不是自己实现 Satori 协议，也不是把 `@yuiju/message` 暴露为一个对外 Satori server。

### 核心取舍

第一阶段去掉独立的 at / reply 指向判断。

原流程中，群聊 handler 会先判断消息是否直接面向悠酱，例如：

- 是否 at 机器人账号。
- 是否引用回复机器人消息。

然后将 `at` 或 `reply` 作为额外提示传入 LLM。

改造后不再传入这类额外判断结果。Satori runtime 和平台 adapter 负责产出 at、引用回复等结构化消息语义，业务层只在渲染给 LLM 时保留可读内容，例如：

- `你好 <at name="悠酱"/>`
- `<quote speaker="悠酱">刚才那句话</quote> 我懂了`

LLM 根据当前消息体、会话历史和回复规则自行判断是否需要回复。

这样做的好处是：

- 群聊主流程少一个平台相关判断分支。
- 第一阶段不需要为 handler 设计跨平台的 `isDirectedToBot` 结果。
- 飞书接入时不必一开始就补齐引用消息查询能力。
- at / reply 仍作为消息内容的一部分保留，不丢失语义。

需要接受的边界是：

- 是否回复的判断更依赖 LLM，而不是业务代码的确定性布尔值。
- prompt 需要明确告诉 LLM：群聊中只有在消息自然面向悠酱、at 悠酱、引用悠酱或上下文需要回应时才回复。
- 如果后续发现误回复变多，再单独评估是否恢复轻量的确定性前置判断。

### Runtime 边界

第一阶段直接引入 Satori runtime，让它在 `@yuiju/message` 进程内承载平台连接、事件接收和消息发送边界。

业务代码不自己维护一套平行的 Satori-like 协议结构，也不把 Satori Session 再转换成当前代码里的 `StoredGroupMessage`、`StoredPrivateMessage` 或 `EnhancedMessageSegment`。

第一阶段要把现有 Message 相关代码迁移到 Satori 的消息模型上。会话历史、LLM prompt 和记忆归档可以按使用场景从 Satori Session / Element 读取字段并渲染内容，但这些派生内容不是新的消息事实源。

业务流程直接依赖的 Satori 消息事实包括：

- `platform`：消息来源平台，例如 `napcat`，后续可扩展 `feishu`。
- `messageId`：平台消息 ID，统一使用字符串。
- `scene`：消息场景，第一阶段保留 `group` 和 `private`。
- `channel`：群聊或会话信息，包含平台频道 ID 和展示名。
- `sender`：发送者信息，包含平台用户 ID、展示名、是否机器人自己。
- `timestamp`：消息时间。
- `elements`：Satori Message Element，替代当前代码中的 NapCat / OneBot message segment 与增强 segment。
- `rawSession`：必要时保留 Satori session 或平台原始材料，仅用于调试和少量平台补全，不进入业务判断主路径。

Satori runtime 是平台事件和发送能力的事实源。Satori Session / Element 是消息模型事实源。渲染后的 content 字符串只服务 LLM、记忆材料和日志展示，不承担消息模型职责。

### Element 范围

第一阶段需要将当前代码里的 Message Element 改造为 Satori Message Element。先覆盖现有 NapCat 链路已经使用到的消息语义：

- `text`：普通文本。
- `at`：at 用户，保留展示名与是否机器人自己。
- `quote`：引用回复，尽量保留被引用消息的发送者和内容。
- `image`：图片或表情包，继续沿用现有图片描述能力。
- `face`：QQ 表情，保留可读描述。

渲染给 LLM 和记忆时，应从 Satori Element 产出接近自然聊天文本的 content 字符串，而不是保留当前 OneBot JSON 消息段。

### 主流程变化

群聊主流程调整为：

1. `@yuiju/message` 启动 Satori runtime。
2. Satori runtime 通过 NapCat / OneBot 相关 adapter 接收平台群消息。
3. Handler 判断消息源和群聊是否在允许范围内。
4. Handler 将 Satori session 写入当前会话上下文。
5. Handler 根据角色状态判断是否允许发送回复。
6. Handler 调用 LLM 判断是否回复并生成回复内容。
7. Handler 通过 Satori session 发送回复。
8. Handler 将机器人回复按 Satori 消息模型写入会话上下文。

主流程不再调用 `isGroupMessageDirectedToBot`，也不再向 LLM 传入 `latestMessageDirectedType`。

### 预计修改范围

第一阶段预计修改：

- `packages/message/src/utils/message.ts`
  - 将当前 OneBot / NapCat message segment 与增强 segment 改造为 Satori Message Element。
  - 定义 Satori Element 渲染为 LLM / 记忆可读 content 的逻辑。
  - 保留图片描述、at 展示名、引用消息展示等已有能力。

- `packages/message/src/handler/group-message.ts`
  - 入参改为 Satori session。
  - 删除 at / reply 指向判断流程。
  - 保留白名单、记录上下文、睡眠状态检查、LLM 决策和回复发送顺序。

- `packages/message/src/utils/reply.ts`
  - 将发送群聊回复改为通过 Satori session 完成。
  - 将机器人回复按 Satori 消息模型记录回会话历史。

- `packages/message/src/llm/manager.ts`
  - 群聊 session key 改为基于 `platform + channelId` 的字符串。
  - requestId 改为字符串。
  - 群聊 prompt 不再写死 QQ 群。
  - 不再接收 `directedType`。

- `packages/message/src/llm/chat-session-manager.ts`
  - 历史构建改为读取 Satori Session / Element。
  - content 使用 Satori Element 渲染结果。

- `packages/message/src/memory/episode-builder.ts`
  - 对话 Episode 使用 Satori 消息字段构建 payload。

- `packages/message/src/server.ts`
  - 启动 Satori runtime。
  - 注册 NapCat / OneBot 相关 adapter。
  - 将 runtime 产出的 session 交给 handler。

### 暂不修改范围

第一阶段不处理：

- 不接入飞书事件通道。
- 不新增飞书配置。
- 不自己实现 Satori 协议。
- 不单独部署 Satori server。
- 不把 `@yuiju/message` 暴露为 Satori server。
- 不改造通知戳一戳能力。
- 不改造私聊策略，除非统一消息类型迁移时需要做最小适配。
- 不重新设计人物记忆主键；人物记忆以昵称作为主键的改造已经完成，本阶段只保证迁移消息模型时不破坏该行为。
- 不改变表情包配置来源。
- 不迁移历史人物记忆文件。
- 不建立跨平台用户绑定关系。
- 不改变主动消息目标配置；主动消息多平台化留到飞书真实接入阶段。

### 验证方式

第一阶段完成后需要验证：

- QQ 群聊消息可以正常进入会话历史。
- 普通群聊消息仍由 LLM 自行判断是否回复。
- at 悠酱的群消息能在 LLM 可见内容中体现 at 语义。
- 引用回复能在 LLM 可见内容中体现引用语义；如果平台取引用失败，应保留可读的引用占位。
- 悠酱发送的回复会被记录回同一会话历史。
- 人物记忆更新仍保持现有昵称主键行为。
- 现有 NapCat 群聊链路不因内部模型迁移中断。
