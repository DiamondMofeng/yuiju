将当前同步 extractor + Graphiti 改为异步链路：pending -> extractor -> graph sync -> done/failed。
新增独立的待处理 Episode 扫描与补偿机制，支持失败重试。
支持历史 Episode 批量回灌与重提炼。
为 Graphiti 写入增加可回放、可重跑、可观测的日志与状态记录。

完善 Plan Manager 生命周期管理，补齐 completed / abandoned / superseded 等终态。
为 PlanState 增加更完整字段：parentPlanId、reason、source、expiresAt。
建立主计划与活跃计划的引用层，向文档中的 character_state 引用结构靠拢。
增加计划终态后的 Redis 清理、TTL 和膨胀控制。
将计划更新机制从“每个 tick 顺带处理”演进为“按条件触发”。

将当前统一 plan_update 细化为更明确的计划事件类型：
plan_created、plan_updated、plan_completed、plan_abandoned、plan_superseded。
细化计划历史查询能力，让“当前计划”“历史计划”“长期目标倾向”三类查询边界更清晰。
增强行为与计划的关联分析能力，例如统计某计划的推进行为与中断行为。

完善 Graphiti 事实治理：
偏好、关系、长期目标倾向的提炼规则收敛与质量控制。
为 fact 增加更明确的证据链结构，而不只是 evidenceEpisodeId 单点引用。
设计重复 fact 合并、冲突 fact 并存与后续治理策略。

收敛旧兼容层，让 IBehaviorRecord 逐步退化为兼容读模型或派生视图。
将活动流、最近行为等读取能力进一步迁移到 MemoryEpisode 派生查询。
按文档建议补齐目录结构上的 adapter/router 拆分：
query-router.ts、world-memory-adapter、message-memory-adapter 等。
