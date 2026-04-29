---
layout: home
hero:
  name: "ゆいじゅ"
  text: "让角色拥有自己的生活"
  tagline: "一个由 LLM 驱动的角色自主生活模拟项目——不做 AI 助手，而是让角色在持续运转的世界里拥有自己的作息、心情与选择。"
  image:
    src: "https://raw.githubusercontent.com/yixiaojiu/yuiju/main/packages/source/picture/repo_avatar.webp"
    alt: "Yuiju Avatar"
  actions:
    - theme: brand
      text: GitHub
      link: https://github.com/yixiaojiu/yuiju
    - theme: alt
      text: 了解世界
      link: "#world"
features:
  - title: 她不是一次性回答器
    details: 角色不会在收到一句话后短暂出现又消失，而是在一个会继续流动的世界里持续生活。
  - title: 决策来自当下状态
    details: 每个 tick 都会结合地点、状态和可用行为，由 LLM 判断此刻更合理的选择。
  - title: 日常有场景，也有节奏
    details: Home、School、Shop、Cafe 等场景各自展开，让生活不是一团抽象能力，而是具体发生的事情。
  - title: 轨迹会被留下来
    details: Redis 承载实时状态，MongoDB 记录行为历史，让每一次行动、变化与回忆都可回看。
---

<div class="home-section home-story" id="world">
  <div class="home-story-copy">
    <p class="home-eyebrow">世界观</p>
    <h2>她不是为了完成任务而存在，而是在认真过自己的日子。</h2>
    <p>
      <strong>ゆいじゅ（悠酱）</strong>
      不是一个站在输入框另一端等待命令的助手。她会起床、出门、犹豫、选择、留下记忆，也会在没有人打断的时候继续把今天过下去。
    </p>
    <p>
      这个项目尝试做的，不是给角色拼出更多技能按钮，而是给她一个可以持续运转的世界，让行为、时间与状态自然地连接起来。
    </p>
  </div>
  <div class="home-story-panel">
    <div class="story-stat">
      <span>世界时间</span>
      <strong>持续推进</strong>
      <p>不是一问一答，而是会一直往前走的日常。</p>
    </div>
    <div class="story-stat">
      <span>决策方式</span>
      <strong>基于当下状态</strong>
      <p>让选择来自此刻，而不是来自预设台词表。</p>
    </div>
    <div class="story-stat">
      <span>记录方式</span>
      <strong>留下轨迹</strong>
      <p>行为历史、状态变化与记忆可以被回看与复盘。</p>
    </div>
  </div>
</div>

<div class="home-section home-rhythm">
  <div class="home-card">
    <p class="home-eyebrow">生活节奏</p>
    <h2>她的一天，不该只是对话窗口里的几轮往返。</h2>
    <p>
      早上在家里磨蹭，下午去学校，路过咖啡店时临时起意进去坐一会儿，晚上回到房间整理今天发生的事。
      一个角色真正鲜活，来自这些连续的小决定，而不是一串堆叠出来的能力描述。
    </p>
  </div>
  <div class="home-card">
    <p class="home-eyebrow">一个 tick 里会发生什么</p>
    <ol class="tick-list">
      <li>
        <strong>读取状态</strong>
        <span>从 Redis 取出角色当前所处的地点、时间、需求与上下文。</span>
      </li>
      <li>
        <strong>收敛可选行为</strong>
        <span>根据场景和前置条件筛出此刻真正可能发生的事情。</span>
      </li>
      <li>
        <strong>让 LLM 做决定</strong>
        <span>不是死规则拍板，而是由模型判断这时候更像她会做的选择。</span>
      </li>
      <li>
        <strong>执行并留下痕迹</strong>
        <span>状态被更新，历史被写入，时间继续向前推进。</span>
      </li>
    </ol>
  </div>
</div>

<div class="home-section home-quote">
  <p>
    "不做 AI 助手，做一个有自己生活的人。"
  </p>
</div>

<div class="home-section home-architecture">
  <div class="home-card home-architecture-copy">
    <p class="home-eyebrow">世界结构</p>
    <h2>技术实现服务于生活感，而不是反过来。</h2>
    <p>
      world 引擎负责 tick、行为筛选与执行，Redis 保存实时状态，MongoDB 沉淀行为历史。
      架构的目标不是把系统堆得更复杂，而是让角色的日常能连续、可信、可追溯地发生。
    </p>
  </div>
  <div class="architecture-frame">
    <img src="./architecture.png" alt="Yuiju architecture overview" />
  </div>
</div>
