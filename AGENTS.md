```
# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.
```

## 项目概述

**ゆいじゅ（悠酱）** 是一个 LLM 驱动的「角色自主生活模拟」项目，可理解为 AI 驱动的模拟经营游戏。项目让一个角色在持续推进的世界里，基于自身状态与环境信息进行决策、执行行为，并留下可追溯的生活轨迹。

## 项目架构

项目采用 Monorepo 架构，使用 pnpm 作为包管理器，包含以下核心子包：

### 1. @yuiju/world（世界模拟引擎）

- **核心功能**：负责角色决策、行为执行、状态管理的主引擎
- **关键特性**：LLM 驱动决策、状态持久化（Redis + MongoDB）、参数化行为、动态时间系统
- **主要目录**：
  - `src/engine/`：引擎循环和决策流程
  - `src/action/`：行为系统（按场景划分：家中/学校/通用/商店/咖啡馆）
  - `src/state/`：角色和世界状态管理
  - `src/llm/`：LLM 决策和工具调用
- **开发命令**：`pnpm dev:world`、`pnpm start:world`、`pnpm test:world`

### 2. @yuiju/message（消息服务）

- **核心功能**：提供与外部系统的消息通信功能
- **技术栈**：使用 node-napcat-ts 进行消息处理
- **开发命令**：`pnpm dev:message`、`pnpm start:message`

### 3. @yuiju/web（Web 界面）

- **核心功能**：提供可视化界面，用于观察角色状态和世界运行
- **技术栈**：Next.js 16 + React 19 + Tailwind CSS 4
- **开发命令**：`pnpm dev:web`、`pnpm start:web`、`pnpm build:web`

### 4. @yuiju/utils（工具库）

- **核心功能**：通用工具函数和类型定义
- **开发命令**：`pnpm run type-check:utils`

### 5. @yuiju/source（数据源）

- **核心功能**：提供项目的静态资源和数据源

### 6. packages/python（Python 服务）

- **核心功能**：提供额外的 Python 服务（如机器学习模型）
- **开发命令**：`pnpm start:python`

## 常用开发命令

### 安装依赖

```bash
pnpm install
```

### 代码格式化与检查

```bash
pnpm run format:write     # 自动格式化所有代码
pnpm run lint             # 运行代码检查

# 使用 Biome 手动检查
pnpm dlx @biomejs/biome check .
pnpm dlx @biomejs/biome check --write .
```

### 类型检查

```bash
pnpm run type-check       # 检查所有包类型
pnpm run type-check:world # 只检查 world 包
```

### 运行开发服务器

```bash
# 同时启动所有服务（推荐使用 pm2 或类似工具）
pnpm run dev:world       # 启动世界模拟引擎
pnpm run dev:message     # 启动消息服务
pnpm run dev:web         # 启动 Web 界面（端口 3010）
pnpm run start:python    # 启动 Python 服务（端口 9196）
```

### 运行测试

```bash
pnpm run test:world      # 运行世界模拟引擎的所有测试
```

### 生产环境启动

```bash
pnpm run start:world
pnpm run start:message
pnpm run start:web
```

## 代码规范

### 格式化工具

使用 **Biome** 进行代码格式化和检查。配置文件：`biome.json`

- 缩进：2 个空格
- 行宽：100 字符
- 忽略目录：`**/dist`、`**/node_modules`、`**/.venv`、`**/logs`、`**/.next`、`packages/source/dataset/opensource`

### TypeScript 配置

- 路径别名：`@/` 指向 `src/` 目录
- 严格模式：开启
- 编译目标：ESNext

### 环境变量

项目依赖以下环境变量（定义在根目录 `.env` 文件）：

```bash
# LLM API
DEEPSEEK_API_KEY=xxx

# 数据库
MONGODB_URI=mongodb://localhost:27017/yuiju
REDIS_URL=redis://localhost:6379

# 运行环境
NODE_ENV=development | production
```

## 关键架构概念

### 引擎循环（Engine Loop）

1. 获取当前状态（Redis）
2. 计算可用行为（基于角色状态和场景）
3. LLM 决策（选择行为）
4. 执行行为（修改状态）
5. 保存历史记录（MongoDB）
6. 推进时间
7. 等待下一个 tick

### 行为系统

- 行为按场景划分（Home/School/Anywhere/Shop/Cafe）
- 每个行为必须定义 `precondition`（前置条件）
- 支持参数化行为（如"吃"行为需要选择具体食物）
- 行为执行器通过 `actionExecutor` 定义

### 状态管理

- **Redis**：角色状态的实时缓存（唯一真相源）
- **MongoDB**：行为历史记录存储
- **内存状态**：Redis 数据的缓存，定期同步

## 开发工作流程

1. 确定要修改的子包
2. 在对应子包目录开发
3. 使用 `pnpm run type-check` 验证类型
4. 使用 `pnpm run format:write` 格式化代码
5. 运行相关测试
6. 提交代码

## 注意事项

1. **Redis 依赖**：开发过程中需要运行 Redis 服务器
2. **MongoDB 依赖**：需要运行 MongoDB 服务器
3. **LLM API 依赖**：需要配置有效的 DeepSeek API 密钥
4. 当前项目处于早期开发阶段，在进行技术方案设计时，请不用考虑历史逻辑的兼容性，按照最佳方案设计。
