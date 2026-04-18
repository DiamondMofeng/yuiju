# Web 应用 (@yuiju/web)

`@yuiju/web` 是悠酱项目的可视化入口，负责提供 Web 页面与 Node.js API，帮助开发者和用户观察角色状态、行为历史与世界信息。

## 项目概述

这个子包基于 `Next.js 16` 构建，页面层使用 App Router，服务端接口使用 `Hono` 挂载在 `/api/nodejs` 下。

## 核心能力

- **首页概览**：展示角色当前位置、当前行为、状态摘要与世界时间
- **活动页**：展示最近行为轨迹与事件时间线
- **设置页**：展示基础配置与用户信息
- **Node API 通道**：通过 Hono 聚合 Home / Activity / Profile / State 等接口

## 目录结构

```text
app/
├── page.tsx                 # 首页
├── activity/                # 活动页
├── settings/                # 设置页
└── api/
    └── nodejs/[[...route]]/ # Hono Node.js API

components/ui/               # 通用 UI 组件
lib/                         # Web 侧工具函数
public/                      # 静态资源
```

## 依赖关系

- `@yuiju/utils`：状态读取、数据库连接、公共工具
- `@yuiju/source`：Prompt 与内容资源
- `swr`：客户端数据获取与缓存
- `hono`：Node.js API 路由

## 运行命令

```bash
# 开发模式
pnpm run dev:web

# 生产构建
pnpm run build:web

# 生产启动
pnpm run start:web
```

## 访问方式

- 本地开发地址：`http://localhost:3010`
- 健康检查可先访问：`/api/nodejs/hello`

## 注意事项

- `web` 运行依赖根目录的 `yuiju.config.ts`；若还未创建，可先执行 `cp yuiju.config.ts.example yuiju.config.ts`。
- `api/nodejs` 会在启动时尝试初始化 MongoDB 连接，若 `yuiju.config.ts` 中的 `database.mongoUri` 未配置，部分接口会返回不可用状态。
- 前端首页当前通过 `SWR` 请求 `/api/nodejs/home` 相关接口，因此建议 `world` 与 `web` 一起联调。
- 若构建环境无法访问外网，`next/font/google` 相关字体下载可能导致 `build` 失败，需要改成本地字体或可访问网络环境。
