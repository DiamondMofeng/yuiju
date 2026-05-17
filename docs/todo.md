## TODO

- 继续改造 message 模块，采用 satori XHTML 形式的消息体内容
- 群聊消息也存一下 redis，用于服务重启时可以恢复消息记录，如果时间过长的话直接丢弃
- Action 模块能力拓展
- 调研一下 b 站直播的接入
  - [blive-message-listener](https://github.com/ddiu8081/blive-message-listener)
- 最新的消息测回时，应该取消当前的 LLM 调用，重新执行
- @ 与回复消息时走快速回复，其余情况可以走深度思考，增加回复质量

## 消息改造

1. satorijs 的消息体中没有 quote 的内容，这部分内容需要我们处理一下

## 想法

- 按照 DDD 规范，规范现在的 Redis 与 Mongodb 操作
- 睡觉叫醒机制
- 实现种菜功能
- 实现钓鱼功能
- 物品售卖机制
- 实现做饭功能
- 监控告警

## Bad Case

- 世界观还需要加强，日记里妈妈都来了。`晚饭按时吃了，妈妈做的菜虽然普通，但就是吃得特别安心。`
