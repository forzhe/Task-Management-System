# NEXUS-7 Current Sprint

## Phase

Phase 0 · 内核（v0.3）：核心闭环最小可用，自己能每天用起来。

参考：NEXUS-7 开发规划书 v0.3 增量修订.md §2

## Sprint Goal

完成最小端到端链路并接入 ActivityWatch 客观数据：

宿主输入 → Orchestrator → Agent → 工具层 → SQLite 事件流 → 桌面端反馈 → Obsidian Markdown 副本
+ ActivityWatch 屏幕数据 → ReviewAgent 主客观对比 → 自欺识别雏形

## Active Tasks

### 工程基线（已完成）
- [x] 初始化 monorepo 与工程基线
- [x] 建立共享领域类型
- [x] 建立 SQLite 记忆仓储
- [x] 建立 AI 编排骨架与核心 Agent（Orchestrator + 6 Agent）
- [x] 建立 NestJS API
- [x] 建立 Vue 桌面主界面
- [x] 接入真实 Anthropic API 后调试 Prompt
- [x] 增加 Playwright e2e

### ActivityWatch 集成（v0.3 新增，本次完成）
- [x] ScreenActivitySummary 共享类型（packages/shared/src/domain.ts）
- [x] ActivityWatchClient（apps/server/src/activity-watch.ts）
- [x] NEXUS_AW_URL 配置项（apps/server/src/config.ts）
- [x] Orchestrator.handle() 支持 extras.screenActivity
- [x] ReviewAgent 注入屏幕数据到 objective + user message
- [x] Review Prompt v0.3（主客观对比 + 自欺识别指令）
- [x] NexusService.runDailyReview 拉取 AW 数据
- [x] GET /activity-watch/status 端点
- [x] 桌面端 AW 状态徽章（store + App.vue）

### Sprint 收尾（已完成）
- [x] 补齐 Drizzle migration 生成脚本（db:generate / db:check）
- [x] .env.example 更新（加入 NEXUS_AW_URL 说明）
- [x] 目标管理 UI（goals-section：列表 + 添加表单，为晨间规划提供目标上下文）
- [x] 修复缺失的 aw-on/aw-off CSS + select 样式

### 待完成（Phase 1 预留）
- [ ] 初始化正式 Tauri Rust runtime（Phase 1，当前 Vite 壳已足够）

## Phase 0 成功标准（硬门槛）

- 作者本人连续 **7 天**真实使用：每天完成 晨间规划 → 执行 → 日终复盘
- 至少 **1 条** AI 复盘洞察让作者感到"被理解"
- 所有数据写入 SQLite **并**同步出可读的 Obsidian Markdown
- ActivityWatch 客观数据至少**成功反驳过 1 次**作者的主观高估

> 若 Phase 0 结束上述标准未达成，立刻停下反思，不进 Phase 1（Tauri + Live2D）。

## Acceptance

- `corepack pnpm install` 成功
- `corepack pnpm typecheck` 通过
- `corepack pnpm --filter @nexus/server dev` 可启动 API
- `corepack pnpm --filter @nexus/desktop dev` 可打开桌面主界面
- 无 API key 时使用离线模拟 LLM，仍可创建任务、事件和 Obsidian Markdown
- ActivityWatch 未运行时，日终复盘仍正常工作（awConnected=false 降级路径）
- ActivityWatch 运行时，日终复盘的 objective 字段包含 focusMinutes/distractMinutes
