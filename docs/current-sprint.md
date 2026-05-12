# NEXUS-7 Current Sprint

## Phase

Phase 1 · 觉醒：跑通核心闭环。

## Sprint Goal

完成最小端到端链路：

宿主输入 → Orchestrator → Agent → 工具层 → SQLite 事件流 → 桌面端反馈 → Obsidian Markdown 副本。

## Active Tasks

- [x] 初始化 monorepo 与工程基线
- [x] 建立共享领域类型
- [x] 建立 SQLite 记忆仓储
- [x] 建立 AI 编排骨架与核心 Agent
- [x] 建立 NestJS API
- [x] 建立 Vue 桌面主界面
- [ ] 接入真实 Anthropic API 后调试 Prompt
- [ ] 初始化正式 Tauri Rust runtime
- [ ] 增加 Playwright e2e
- [ ] 补齐 Drizzle migration 生成脚本

## Acceptance

- `corepack pnpm install` 成功
- `corepack pnpm typecheck` 通过
- `corepack pnpm --filter @nexus/server dev` 可启动 API
- `corepack pnpm --filter @nexus/desktop dev` 可打开桌面主界面
- 无 API key 时使用离线模拟 LLM，仍可创建任务、事件和 Obsidian Markdown
