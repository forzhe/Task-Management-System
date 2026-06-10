---
项目代号: NEXUS-7
全称: 个性化人生优化系统 (Personal Life Optimization System)
版本: v0.3 (增量修订)
日期: 2026-06-08
状态: Phase 0 进行中
基线文档: NEXUS-7 开发规划书 v0.2.md
作者: 用户 + Claude (Opus 4.8) 协同
---

# NEXUS-7 开发规划书 v0.3（增量修订）

> 本文档**不替代 v0.2**。v0.2 的架构、Agent 设计、数据模型、80 项功能蓝图全部继续有效。
> v0.3 只做三处定向修订，解决 v0.2 在落地时暴露的三个真实问题。
>
> 阅读方式：先读 v0.2 建立全局认知，再读本文档覆盖被修订的章节。被修订的章节在 v0.2 中作废，以本文档为准。

---

## 0. 为什么需要这次修订

v0.2 是一份忠实、完整、甚至超集于「任务管理系统.md」根基愿景的工程稿。但在准备进入开发、并已写出第一批真实代码后，暴露出三个与现实脱节的地方：

| # | 问题 | 严重度 | v0.2 中的位置 | 本文档修订章节 |
|---|---|---|---|---|
| 1 | 数据接入层 P0 源全是 Apple 生态（HealthKit / EventKit / Screen Time），但实际开发在 **Windows** | 🔴 严重 | §7.1、§7.3 | 本文档 §1 |
| 2 | Phase 1 范围过重（Tauri + Live2D + 11 Agent 全量），与根基文档"先用 Obsidian + Claude Code 验证逻辑"的建议、以及当前真实代码进度都脱节 | 🟡 中 | §12、§13、§19 | 本文档 §2 |
| 3 | §18 把"半途而废"列为头号风险，应对却是"3 个月做完 30 项功能"，风险与计划自相矛盾 | 🟢 轻 | §18 | 本文档 §3 |

修订原则：**只改这三处，不动其余。** v0.2 的产品灵魂（§1.2）、五条不可妥协原则（§1.3）、反模式清单（§1.4）原样保留，是本次所有修订的判据。

---

## 1. 修订一：数据接入层 Windows 化（替代 v0.2 §7.1 / §7.3）

### 1.1 问题本质

v0.2 §7.1 的 P0、Phase 1 数据源依赖 macOS/iOS 专属 API：

- 苹果健康（HealthKit）— P0
- 系统日历（CalDAV / **EventKit**）— P0
- 屏幕使用时间（**macOS / iOS Screen Time**）— P0
- Apple Notes（AppleScript）、iMessage（macOS SQLite）

这些在 Windows 上**不存在**。而"多源数据校验 / 自欺识别"（v0.2 §7.3，系统灵魂功能之一）依赖屏幕使用、健康、位置等多源交叉验证。照搬原表，Phase 2 的自欺识别会直接失去数据基础。

CLAUDE.md 已明确本项目在 Windows + PowerShell 下开发，因此数据层必须以 Windows 为第一公民。

### 1.2 修订后的数据源完整清单（Windows 优先）

> 设计原则：P0 源必须在 Windows 上有**真实可行的本地采集路径**；跨平台开源方案优先；Apple/iOS 源整体降级到 Phase 3，作为"未来多设备"扩展，不再是 Phase 1 前置。

| 类别 | 数据源 | Windows 接入方式 | 优先级 | Phase |
|---|---|---|---|---|
| **行为（核心）** | 屏幕/应用使用时长 | **ActivityWatch**（开源、跨平台，本地 REST `localhost:5600`，含 `aw-watcher-window` / `aw-watcher-afk`）| **P0** | 0 |
| | 浏览器历史 | Chrome/Edge `History` SQLite（`%LOCALAPPDATA%\...\User Data\Default\History`，需停浏览器或只读副本）| P1 | 1 |
| **笔记** | Obsidian | 文件系统直读（**跨平台，无变化**）| **P0** | 0 |
| **日历** | 本地 / Outlook 日历 | **Microsoft Graph API**（Microsoft 365 / Outlook.com）或本地 `.ics` 导入 | **P0** | 1 |
| | Google Calendar | Calendar API（OAuth）| P1 | 2 |
| **手动** | 手动录入 | 应用内表单 + 语音转写（**跨平台**）| **P0** | 0 |
| **健康** | 小米手环 / 手表 | **Zepp Life / 米家**数据导出（CSV / 抓包）；无官方实时 API，按日导入 | P1 | 2 |
| | 华为运动健康 | Huawei Health Kit（需开发者账号）/ 导出 | P2 | 2 |
| | 通用聚合 | **Google Fit REST API**（若设备同步到 Google Fit）| P2 | 2 |
| **运动** | Keep | 无官方 API → 抓包 / 手动导入 | P2 | 3 |
| | Strava | 官方 API（OAuth，跨平台）| P2 | 3 |
| **环境** | 地理位置 | Windows Location API / 手机轨迹手动导入 | P2 | 2 |
| | IoT / 智能家居 | 米家 / Home Assistant（本地 REST）| P2 | 3 |
| **通讯** | 邮件 | IMAP / Microsoft Graph / Gmail API | P1 | 2 |
| | 微信 | Windows 本地数据库**加密**，难度高 → 推迟，优先手动摘要 | P3 | 3+ |
| **财务** | 银行 / 支付账单 | 手动导入 CSV（**跨平台**）| P2 | 3 |
| **内容** | B站 / YouTube 观看历史 | 数据导出 / API | P2 | 3 |
| **（未来多设备）** | 苹果健康 / EventKit / Screen Time / iMessage | 仅当用户接入 Mac/iPhone 时启用，作为 Windows 源的补充 | P2 | 3 |

**关键变化**：
- 屏幕使用从"macOS Screen Time"换成 **ActivityWatch**——这是本次最重要的一处。它开源、跨平台、本地存储、有 REST 接口，是 Windows 上实现"自欺识别"的最佳 ground truth 源，且不依赖任何云服务，符合 v0.2 §16"本地优先"。
- 日历从 EventKit 换成 **Microsoft Graph / .ics**。
- Apple 全家桶整体从 Phase 1-2 降到 **Phase 3 多设备扩展**，不再阻塞主线。
- Phase 0 的三个 P0 源收敛为：**ActivityWatch + Obsidian + 手动录入**——这三个在 Windows 上零障碍，足以跑通核心闭环和最早的客观数据对比。

### 1.3 修订后的多源校验示例（替代 v0.2 §7.3）

把 v0.2 §7.3 中基于 HealthKit/Keep 的示例，改写为 Windows 实际可得的数据：

```
场景：宿主说"今天专注学习了 2 小时 Claude Code"
        ↓
检索同时段数据（Windows 本地源）：
- ActivityWatch（窗口）：VSCode/终端前台时长 26 分钟，其余时间前台为浏览器(B站)
- ActivityWatch（AFK）：键鼠活跃 31 分钟，离开 89 分钟
- 浏览器历史：同时段集中在视频站点
- Obsidian：当天无新增/修改的学习笔记
        ↓
Decision Agent 综合判断：
- 多源数据不支持"专注学习 2 小时"
- 标记任务为"伪完成"（待确认）
- 触发小人对话："系统注意到一些不一致的信号……"
        ↓
宿主解释或修正
        ↓
若坚持完成 → 系统可信度 -1
若承认 → 可信度 +0.5（诚实奖励）+ 任务标记真实状态
```

这套机制完全不依赖任何 Apple API，纯 Windows 本地源即可成立，证明"自欺识别"在 Windows 上是可落地的。

---

## 2. 修订二：新增 Phase 0 + Phase 重排（替代 v0.2 §13 的 Phase 1 定义）

### 2.1 问题本质

- 根基文档（任务管理系统.md 第 1049-1071 行）明确建议：**阶段 1 = Obsidian + Claude Code 原型，先验证系统逻辑**，不写完整 App。
- v0.2 的 Phase 1 却直接上 Tauri + Live2D + 桌面悬浮 + 仪式动画 + 11 Agent 全量（30 项功能 / 约 130 人日）。
- 而**当前真实代码**（NestJS server + ai-core + memory(node:sqlite) + Vite 桌面壳 + 确定性离线 LLM/Anthropic 可切换）恰好就是根基文档说的"先验证逻辑"那一层——**尚未上 Tauri、尚未上 Live2D**。

也就是说：真实进度已经在走更稳的路线，v0.2 的 Phase 1 定义偏理想化。本次把这个事实显式化。

### 2.2 把 v0.2 的 Phase 1 一分为二

```
v0.2:   [        Phase 1 (3个月/30项)        ] → Phase 2 → ...
v0.3:   [ Phase 0 (2-4周) ] [ Phase 1 (2-3月) ] → Phase 2 → ...
          核心闭环验证        桌面端 + 小人
          无 Tauri/无 Live2D
```

后续 Phase 2/3/4/5 编号与内容**不变**，只是整体顺延一个 Phase 0 的身位。

### 2.3 Phase 0 · 内核（2-4 周）：核心闭环最小可用，自己能用起来

**目标**：在**不碰 Tauri、不碰 Live2D** 的前提下，跑通根基文档的灵魂闭环——
`宿主输入 → Orchestrator → Agent → 工具层 → 本地 SQLite 事件流 → 反馈 → Obsidian Markdown 副本`。
这与 CLAUDE.md 当前定义的"Phase 1 · Awakening"目标完全一致（CLAUDE.md 的措辞即本文档的 Phase 0）。

**形态**：NestJS 后端 + 现有 Vite 桌面壳（或临时 Web 页）。界面可以朴素，**先要逻辑跑通、自己愿意每天用**。

**包含（从 v0.2 蓝图中抽取，约 8-10 项原子功能）**：

| v0.2 蓝图# | 功能 | 备注 |
|---|---|---|
| 30 | Orchestrator 框架 | 已在 ai-core 中起步 |
| 31 | LLM 抽象层 | 已有 LlmClient + ModelRouter |
| 33 | 工具调用框架 | NexusTools 统一数据访问 |
| 34 | Prompt 模板系统 | 已有 prompt-registry 雏形 |
| 39 | 事件流 schema + 写入 | 已有 memory 包 + node:sqlite |
| 43 | Obsidian 单向同步（先单向：DB→MD）| 双向放到 Phase 1 |
| 7 | 五层目标 CRUD（先核心层级）| - |
| 13/14 | 任务 9 字段 + 状态机 | - |
| 65 | 每日复盘（主观 + 客观，客观源先接 ActivityWatch）| 灵魂功能 |
| 32（裁剪）| 先实现 4 个 Agent：对话 / 规划 / 复盘 / Orchestrator | 其余 7 个 Agent 留到 Phase 1 |

**明确不做**：Tauri 打包、Live2D、桌面悬浮、仪式动画、外星科技完整 UI、权限解锁、衰减、多源校验（Phase 0 只接 ActivityWatch 一个客观源验证机制成立即可）。

**Phase 0 成功标准（硬门槛）**：
- 作者本人连续 **7 天**真实使用：每天能完成 晨间生成任务 → 执行 → 日终复盘。
- 至少 **1 条** AI 复盘洞察让作者感到"被理解"（主观-客观对比真的戳中过一次）。
- 所有数据写入 SQLite **并**同步出可读的 Obsidian Markdown。
- ActivityWatch 客观数据至少**成功反驳过 1 次**作者的主观高估（验证自欺识别机制的雏形成立）。

> **若 Phase 0 结束这几条没达成，立刻停下反思，不进 Phase 1。** 这是防半途而废的真正闸门——先证明"这套逻辑对我有用"，再投入做小人和沉浸 UI。

### 2.4 修订后的 Phase 1 · 觉醒（Phase 0 通过后，2-3 个月）

**前提**：Phase 0 成功标准全部达成。

**包含**：v0.2 原 Phase 1 中**剩余**的部分——
- 迁移到 **Tauri 桌面端** + 外星科技 UI 主题 + 词汇表
- 主小人 Live2D + Companion Agent + 桌面悬浮
- 补齐剩余 7 个 Agent（洞察/教练/提醒/Profile/Companion/Decision/Safety）
- 语义记忆（向量化）+ Obsidian **双向**同步
- 仪式化首启动（10 步）+ 晨间/日终两个全屏仪式
- 6 维属性 + 觉醒等级 + 能量点 + 简单商城

**成功标准**：沿用 v0.2 §13 原 Phase 1 标准（连续 4 周日活 > 80%、小人对话不重复且反映状态、能复述 5 条洞察等）。

### 2.5 蓝图与现有代码的对齐确认

当前仓库已落地的部分，正好覆盖 Phase 0 的工程地基，无返工：

- `apps/server`（NestJS）+ `nexus.service` ✅
- `packages/ai-core`（LlmClient / ModelRouter / Orchestrator / companion·planning·review agents / prompt-registry）✅
- `packages/memory`（node:sqlite 仓储 + Drizzle 迁移基线）✅
- `apps/desktop`（Vite 壳，待 Phase 1 迁 Tauri）✅
- 确定性离线 LLM ↔ Anthropic 可切换 ✅（对应 v0.2 §4.10 Phase 1 AI 底座）

---

## 3. 修订三：风险应对重排（替代 v0.2 §18 中的"半途而废"行）

v0.2 §18 把"个人项目半途而废"列为**高概率 / 极高影响**，但应对里"Phase 1 控制在 3 个月内出闭环"本身就是高强度承诺，反而加剧风险。修订该行：

| 风险 | 概率 | 影响 | 修订后的应对 |
|---|---|---|---|
| **个人项目半途而废** | 高 | 极高 | ① **Phase 0 在 2-4 周内拿到"对我有用"的正反馈**，把第一个里程碑前移到 1 个月内可达；② 蓝图打勾产生正反馈；③ Phase 0 不达标就停，避免在没验证价值前投入小人/UI 的重工；④ 每周写开发日志到 Obsidian（自我承诺 + 进化引擎原料）|

§18 其余各行（Agent 质量、多源接入、Live2D、Tauri、成本、数据丢失等）**保持不变**。

---

## 4. 决策日志增补（接续 v0.2 §20.1）

| # | 决策 | 时间 |
|---|---|---|
| 11 | 数据层以 **Windows 为第一公民**；屏幕使用采用 **ActivityWatch**；Apple 全家桶降级到 Phase 3 多设备扩展 | 2026-06-08 |
| 12 | v0.2 的 Phase 1 拆为 **Phase 0（核心闭环，无 Tauri/Live2D）+ Phase 1（桌面端+小人）**；后续 Phase 顺延 | 2026-06-08 |
| 13 | 第一个硬里程碑前移到 **Phase 0 末（约 1 个月）**，作为防弃坑闸门 | 2026-06-08 |

### 待决策开放问题（接续 v0.2 §20.2）

8. ActivityWatch 之外，是否需要补一个 Windows 原生窗口追踪兜底（防 AW 进程未启动导致客观数据缺口）？
9. Obsidian 同步 Phase 0 先单向（DB→MD），双向监听文件冲突的合并策略放到 Phase 1，是否接受这一债务？

---

## 5. 本次修订未触及的内容（仍以 v0.2 为准）

- §1 设计哲学、产品灵魂、五大原则、反模式 —— **完全不变，仍是最高判据**
- §2 三层能力、§3 八层架构、§4 11 个子系统设计
- §5 AI 中枢与 12 Agent、§6 记忆与人格档案层
- §8 数据模型（11 张表）、§9 终端层、§10 外星科技沉浸体系
- §11 技术栈、§12 80 项功能蓝图（仅 Phase 归属随本文档 §2 微调）
- §14 AI 协同开发方法论、§15 评估可观测、§16 安全备份、§17 指标体系

---

## 附录：v0.3 相对 v0.2 的改动一览

| 改动 | v0.2 原状 | v0.3 修订 |
|---|---|---|
| 屏幕使用数据源 | macOS Screen Time（P0） | ActivityWatch（P0，跨平台开源）|
| 日历数据源 | EventKit / CalDAV（P0） | Microsoft Graph / .ics（P0）|
| 健康数据源 | HealthKit（P0/Phase1） | 小米/华为/Google Fit 导入（P1/Phase2）|
| Apple 生态整体 | Phase 1-2 前置 | Phase 3 多设备扩展 |
| Phase 划分 | Phase 1 含 Tauri+Live2D | 新增 Phase 0（无 Tauri/Live2D）|
| 首个里程碑 | Phase 1 末（3 个月） | Phase 0 末（约 1 个月）|
| 半途而废应对 | "3 个月出闭环" | "1 个月内拿到价值正反馈 + 不达标即停" |

—— 用户 + Claude (Opus 4.8)，2026 年 6 月 8 日
