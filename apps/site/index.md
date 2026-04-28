---
layout: home
hero:
  name: "ゆいじゅ"
  text: "让角色拥有自己的生活"
  tagline: "一个由 LLM 驱动的角色自主生活模拟项目——不做 AI 助手，做一个有自己日常的人。"
  image:
    src: "https://raw.githubusercontent.com/yixiaojiu/yuiju/main/packages/source/picture/repo_avatar.webp"
    alt: "Yuiju Avatar"
  actions:
    - theme: brand
      text: GitHub
      link: https://github.com/yixiaojiu/yuiju
features:
  - title: 持续运转的世界
    details: 角色在持续 tick 的世界中拥有连续的状态、时间与行为历史，不是一次性对话。
  - title: LLM 自主决策
    details: 在每个 tick，由 LLM 基于当前状态与可用行为做出选择，而不是写死规则。
  - title: 场景化行为系统
    details: Home / School / Shop / Cafe 等场景下的行为各自定义前置条件与参数，可自由扩展。
  - title: 可追溯的轨迹
    details: Redis 承载实时状态，MongoDB 沉淀行为历史，每一次决策都可复盘。
---

## 关于项目

**ゆいじゅ（悠酱）** 不是为了完成任务而存在，她有自己的作息、心情和选择。
项目的核心是一个长期运行的世界引擎：读取角色当前状态、由 LLM 在合理的行为空间内做出决策、执行并记录下来，再推进时间。

如果你对「让 AI 角色真的活着」这件事感兴趣，欢迎来 GitHub 看看代码。
