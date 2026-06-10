# NEXUS-7 · 个体进化协议

> 不是加了 AI 的待办清单。任务是这个系统的末梢神经——核心是一个更大的闭环：**目标 → 行动 → 反馈 → 校准**。

NEXUS-7 是一个本地运行的个人生命优化系统，由 AI 核心驱动。它的核心问题只有一个：

**今天的行为，让你离理想的人生更近了，还是更远了？**

---

## 目录

- [系统概览](#系统概览)
- [前置要求](#前置要求)
- [快速启动](#快速启动)
- [AI 模型配置](#ai-模型配置)
- [功能使用指南](#功能使用指南)
- [API 接口参考](#api-接口参考)
- [项目结构](#项目结构)
- [开发命令](#开发命令)
- [版本路线图](#版本路线图)

---

## 系统概览

```
宿主输入
  └─► Orchestrator（路由决策）
        ├─ PlanningAgent   → 生成今日执行协议
        ├─ ReviewAgent     → 日终校准（多源自欺识别）
        ├─ InsightAgent    → 长期行为模式洞察
        ├─ CoachAgent      → 苏格拉底式目标真实性检测
        ├─ ReminderAgent   → 智能提醒（定时自动触发）
        ├─ DialogueAgent   → 通用对话
        ├─ ProfileAgent    → 宿主档案更新
        ├─ CompanionAgent  → 系统小人状态与台词
        └─ SafetyAgent     → 输出安全检查
              │
              ▼
        本地 SQLite（事件流 + 任务 + 目标 + 复盘）
        Obsidian Vault 同步（Markdown 备份）
```

### 核心特性

| 特性 | 说明 |
|------|------|
| **本地优先** | 所有数据存储在本地 SQLite，不依赖云数据库 |
| **多模型支持** | Anthropic / OpenAI / Gemini / DeepSeek / Kimi，一键切换 |
| **离线模式** | 无 API Key 时自动切换为确定性本地回复，系统依然可用 |
| **多源自欺识别** | 日终复盘对比：主观陈述 + ActivityWatch 屏幕数据 + 浏览器历史 |
| **觉醒等级系统** | 完成任务获得经验值，六维属性成长，高等级解锁更多功能 |
| **定时自动调度** | 每天 08:00 / 20:00 自动检查提醒，每周一自动生成洞察报告 |
| **Obsidian 联动** | 档案、任务、复盘自动写入 Vault，支持 Obsidian 阅读 |

---

## 前置要求

| 依赖 | 版本要求 | 备注 |
|------|---------|------|
| Node.js | ≥ 22.0.0 | 需要内置 `node:sqlite` 模块 |
| pnpm | ≥ 10.0.0 | 通过 `corepack enable` 启用 |
| AI API Key | 任意一个即可 | 无 Key 也能以离线模式运行 |

```bash
# 确认 Node 版本
node -v   # 需要 v22+

# 启用 corepack（如尚未启用）
corepack enable
```

---

## 快速启动

### 1. 克隆并安装依赖

```bash
git clone <repo-url>
cd "Task Management System"
corepack pnpm install
```

### 2. 配置环境变量

```bash
# 复制示例文件
cp .env.example .env
```

打开 `.env`，至少填入一个 AI 提供商的 API Key（或保持为空以使用离线模式）：

```dotenv
# 示例：使用 DeepSeek
NEXUS_LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-你的密钥

# 示例：使用 Anthropic Claude
NEXUS_LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-你的密钥

# 不填任何 Key → 自动使用离线确定性模式
```

### 3. 启动后端服务

```bash
corepack pnpm dev:server
# 服务运行在 http://localhost:3737
```

### 4. 启动桌面前端（新终端）

```bash
corepack pnpm dev:desktop
# 浏览器自动打开 http://localhost:5173
```

### 5. 验证运行状态

打开浏览器访问 `http://localhost:5173`，右上角显示"AI 在线"（有 Key）或"离线模拟"（无 Key）即为成功。

---

## AI 模型配置

NEXUS-7 支持 5 家 AI 提供商，全部兼容同一套 LLM 抽象层。

### 提供商配置

| 提供商 | 环境变量 | 默认模型（haiku/sonnet/opus） |
|--------|---------|------------------------------|
| Anthropic | `ANTHROPIC_API_KEY` | claude-haiku-4-5 / claude-sonnet-4-6 / claude-opus-4-8 |
| OpenAI | `OPENAI_API_KEY` | gpt-4o-mini / gpt-4o / o1 |
| Gemini | `GEMINI_API_KEY` | gemini-2.0-flash / gemini-2.0-flash / gemini-2.5-pro |
| DeepSeek | `DEEPSEEK_API_KEY` | deepseek-chat / deepseek-chat / deepseek-reasoner |
| Kimi | `KIMI_API_KEY` | moonshot-v1-8k / moonshot-v1-32k / moonshot-v1-128k |

### 自动选择模式

```dotenv
NEXUS_LLM_PROVIDER=auto
# 自动优先级：Anthropic → OpenAI → Gemini → DeepSeek → Kimi → 离线
```

### 自定义模型名称

```dotenv
# 覆盖任意提供商的模型，三个层级独立设置
NEXUS_LLM_MODEL_HAIKU=deepseek-v4-pro    # 轻量任务
NEXUS_LLM_MODEL_SONNET=deepseek-v4-pro   # 常规任务
NEXUS_LLM_MODEL_OPUS=deepseek-v4-pro     # 深度推理
```

### 代理网关（Anthropic）

```dotenv
NEXUS_LLM_PROVIDER=anthropic
ANTHROPIC_AUTH_TOKEN=你的网关 Token
ANTHROPIC_BASE_URL=https://你的代理地址/v1
```

---

## 功能使用指南

### 晨间规划仪式

点击顶部命令栏的 **「启动晨间仪式」** 按钮，系统会：
1. 弹出全屏仪式界面（动画加载）
2. 分析你的活跃目标和近期事件
3. 生成 1-3 个精炼的今日执行协议，每个协议包含验收标准和证明方式
4. 协议自动出现在「今日执行协议」面板

### 执行任务

在「今日执行协议」面板，每个任务支持：
- **开始** → 标记为进行中
- **暂停** → 保留进度
- **完成** → 填写证据备注（≥10字可获得额外可信度加成），获得经验值和属性奖励
- **失败** → 如实记录，系统会在复盘中分析原因

```
完成任务 → 获得 XP 经验值 → 升级 → 解锁更多功能
```

### 日终校准仪式

点击 **「日终校准协议」** 按钮：
1. 弹出输入框，用自然语言陈述今天真实发生了什么
2. 系统自动融合三路数据进行对比：
   - 你的主观陈述
   - ActivityWatch 屏幕专注记录（需安装 AW）
   - 浏览器历史记录（Chrome/Edge）
3. AI 生成「真实偏差」字段——如果你说专注了 3 小时但 B 站访问 47 次，它会直接点出

> 这是系统最核心的功能。诚实的复盘是一切进化的基础。

### 进化目标管理

在「进化目标」面板点击 **+** 添加目标，支持五个层级：

| 层级 | 适用场景 |
|------|---------|
| 终极目标 | 人生方向，几年以上的愿景 |
| 长期目标 | 1-2 年的阶段性方向 |
| 阶段目标 | 1-3 个月的具体项目 |
| 周目标 | 当前一周要推进的事 |
| 日目标 | 今天要完成的单项 |

设定目标后，晨间仪式的规划会针对你的目标生成更精准的执行协议。

### 行为洞察报告

在「行为洞察报告」面板点击右上角按钮，系统会：
- 分析过去 100 条事件的行为模式
- 识别正向习惯和负向模式
- 给出一个具体的校准建议
- 标注数据可信度（取决于复盘数量）

> 需要 Lv.5 解锁（完成约 25 个任务）

### 目标真实性检测（教练对话）

通过 API 调用 `/coach/session`，系统用苏格拉底式追问检验一个目标是否是真实的意愿还是冲动驱动：

```bash
curl -X POST http://localhost:3737/coach/session \
  -H "Content-Type: application/json" \
  -d '{"goalTitle":"学习量子计算","userAnswer":"我觉得这个很酷"}'
```

第 4-5 轮会给出冲动概率（0-1）和建议（继续/暂存3天/重构目标）。

### 觉醒等级与六维属性

完成任务自动积累 XP，等级公式为 `Lv = floor(sqrt(XP / 100))`。

**六维属性**（由任务的 `expRewards` 字段决定加成方向）：

| 属性 | 对应行为 |
|------|---------|
| 智力 | 学习、阅读、解题 |
| 体力 | 运动、体能训练 |
| 专注力 | 深度工作、编程 |
| 意志力 | 克服困难、坚持习惯 |
| 创造力 | 创作、设计、构思 |
| 秩序感 | 整理、规划、复盘 |

**功能解锁阶梯**：

| 等级 | 解锁功能 |
|------|---------|
| Lv.1 | 每日任务、对话、目标规划 |
| Lv.3 | 能量点商城 |
| Lv.5 | 日终校准、复盘洞察 |
| Lv.10 | 六维属性面板 |
| Lv.15 | 行为影响评分 |
| Lv.20 | 每周总结 |
| Lv.30 | 人生路线模拟 |
| Lv.50 | 深度长期趋势分析 |
| Lv.100 | 终极协议 |

### ActivityWatch 集成（可选）

安装 [ActivityWatch](https://activitywatch.net/)（免费开源）后，系统可以追踪你的屏幕使用数据，日终校准时自动对比客观专注时间与主观陈述。

```dotenv
# 默认地址，通常无需修改
NEXUS_AW_URL=http://localhost:5600
```

右上角状态栏会显示 `AW · XXm` 表示今日专注分钟数。

### Obsidian Vault 联动

启动服务时自动在 `NEXUS_VAULT_PATH`（默认 `./NEXUS-7`）生成 Markdown 文件：
- `宿主档案.md` — 个人档案
- `YYYY-MM-DD 执行协议.md` — 每日任务
- `YYYY-MM-DD 日终校准.md` — 每日复盘
- `events-snapshot.md` — 事件流快照

用 Obsidian 打开 `NEXUS-7` 文件夹即可建立知识库联动。

---

## API 接口参考

所有接口运行在 `http://localhost:3737`（默认端口）。

### 核心接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 系统状态、LLM 提供商信息 |
| GET | `/user` | 宿主等级、经验值、六维属性 |
| GET | `/profile` | 宿主档案 |
| PATCH | `/profile` | 更新档案（basicInfo / redLines / longTermVision） |

### 对话与规划

| 方法 | 路径 | Body | 说明 |
|------|------|------|------|
| POST | `/chat/send` | `{message, trigger?}` | 发送消息，触发对应 Agent |
| POST | `/reviews/daily` | `{note}` | 日终校准（自动融合 AW + 浏览器数据）|
| GET | `/reviews/latest` | `?type=daily` | 获取最新复盘 |
| POST | `/insights/weekly` | — | 生成行为洞察报告 |
| POST | `/coach/session` | `{goalTitle, userAnswer, previousExchanges?}` | 教练追问一轮 |
| POST | `/reminders/check` | — | 手动触发提醒检查 |

### 目标与任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/goals` | 获取所有目标 |
| POST | `/goals` | 创建目标 |
| PATCH | `/goals/:id/status` | 更新目标状态 |
| GET | `/tasks` | 获取任务列表（`?status=` 筛选）|
| POST | `/tasks` | 手动创建任务 |
| PATCH | `/tasks/:id/status` | 更新任务状态（含证据） |

### 数据与集成

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/events/query` | 查询事件流（`?limit=` 条数）|
| GET | `/memory/search` | 语义搜索记忆（`?q=关键词&topK=10`）|
| GET | `/companion/state` | 系统小人当前状态 |
| GET | `/activity-watch/status` | AW 连接状态及今日专注数据 |
| GET | `/browser/history` | 浏览器近期访问（`?hours=8`）|

### chat trigger 可选值

```
user_message      普通对话
morning_planning  晨间规划（生成执行协议）
daily_review      日终校准
task_completed    任务完成（自动触发）
insight_analysis  洞察分析
coach_session     教练追问
reminder_check    提醒检查
```

---

## 项目结构

```
Task Management System/
├── apps/
│   ├── server/          # NestJS API 服务（端口 3737）
│   │   └── src/
│   │       ├── app.module.ts         # 模块注册（含定时调度）
│   │       ├── app.controller.ts     # 所有 HTTP 端点
│   │       ├── nexus.service.ts      # 业务逻辑层
│   │       ├── scheduler.service.ts  # 定时任务（提醒/洞察）
│   │       ├── activity-watch.ts     # ActivityWatch 客户端
│   │       ├── browser-history.ts    # Chrome/Edge 历史读取
│   │       ├── vault-writer.ts       # Obsidian Vault 写入
│   │       └── config.ts             # 环境变量 Schema 验证
│   └── desktop/         # Vue 3 + Vite 桌面前端（端口 5173）
│       └── src/
│           ├── App.vue      # 主界面
│           ├── store.ts     # Pinia 状态管理
│           ├── api.ts       # API 调用层
│           └── styles.css   # 全局样式（双主题）
├── packages/
│   ├── ai-core/         # LLM 抽象层 + 所有 Agent
│   │   └── src/
│   │       ├── llm.ts              # LlmClient（多提供商）
│   │       ├── model-router.ts     # 模型层级路由
│   │       ├── orchestrator.ts     # Agent 调度主控
│   │       ├── prompt-registry.ts  # Agent 提示词
│   │       ├── structured-output.ts # JSON 输出解析验证
│   │       ├── tools.ts            # NexusTools 接口
│   │       └── agents/
│   │           ├── planning-agent.ts   # 晨间规划
│   │           ├── review-agent.ts     # 日终校准
│   │           ├── insight-agent.ts    # 行为洞察
│   │           ├── coach-agent.ts      # 目标真实性检测
│   │           ├── reminder-agent.ts   # 智能提醒
│   │           ├── dialogue-agent.ts   # 通用对话
│   │           ├── profile-agent.ts    # 档案更新
│   │           ├── companion-agent.ts  # 系统小人
│   │           └── safety-agent.ts     # 输出安全
│   ├── memory/          # SQLite 数据层（Node 22 node:sqlite）
│   │   └── src/
│   │       ├── repository.ts  # 全量数据操作 + 迁移
│   │       └── schema.ts      # Drizzle 表结构定义
│   ├── shared/          # 共享类型定义
│   │   └── src/
│   │       └── domain.ts      # 所有领域类型 + 等级/解锁工具函数
│   └── companion/       # 小人状态映射
├── scripts/
│   ├── probe-ai.ts       # AI 提供商连通性验证（通用）
│   ├── probe-anthropic.ts # Anthropic 专用验证
│   └── smoke-test.ts     # 完整端到端冒烟测试
├── prompts/             # Agent 提示词草稿（版本化）
├── evals/               # 离线评估用例
├── .env.example         # 环境变量模板
└── NEXUS-7/             # Obsidian Vault 输出（gitignored）
```

---

## 开发命令

```bash
# 安装依赖
corepack pnpm install

# 启动后端（热重载）
corepack pnpm dev:server

# 启动前端（热重载）
corepack pnpm dev:desktop

# 全量类型检查
corepack pnpm typecheck

# 运行测试
corepack pnpm test

# 代码格式化
corepack pnpm format

# 代码检查
corepack pnpm lint

# UTF-8 合规检查
corepack pnpm utf8:guard

# AI 提供商连通性验证
corepack pnpm ai:probe:any   # 自动检测当前 .env 提供商
corepack pnpm ai:probe       # Anthropic 专用

# 端到端冒烟测试（需先启动服务器）
corepack pnpm smoke

# 数据库迁移
corepack pnpm db:generate    # 生成迁移文件
corepack pnpm db:check       # 检查迁移状态
```

---

## 版本路线图

### Phase 1 · 觉醒（当前）✅

- [x] 核心闭环：规划 → 执行 → 复盘 → 校准
- [x] 多提供商 LLM（Anthropic / OpenAI / Gemini / DeepSeek / Kimi）
- [x] 本地 SQLite 事件流 + Obsidian Vault 同步
- [x] 觉醒等级系统 + 六维属性 + 功能解锁阶梯
- [x] InsightAgent 行为模式洞察
- [x] CoachAgent 目标真实性检测（苏格拉底对话）
- [x] ReminderAgent + 定时调度（@nestjs/schedule）
- [x] 多源自欺识别（AW + 浏览器历史 + 主观陈述三路对比）
- [x] 晨间/日终仪式全屏 Modal
- [x] 语义记忆搜索
- [x] 白天/夜间双主题

### Phase 2 · 具象化（规划中）

- [ ] Tauri 2 桌面端迁移（替换 Vite 开发壳，生成原生应用）
- [ ] Live2D 小人悬浮窗（Cubism Web SDK 集成）
- [ ] 本地向量数据库（sqlite-vec）替代关键词语义搜索
- [ ] 多目标路径模拟（人生分叉点可视化）
- [ ] Windows 系统集成强化（通知推送、任务栏图标）

### Phase 3 · 深度进化（远期）

- [ ] EvolutionAgent 长期人格模型进化
- [ ] 移动端伴侣（React Native / Flutter）
- [ ] 多设备同步（E2E 加密）
- [ ] 插件系统（第三方工具接入）

---

## 常见问题

**Q: 不填 API Key 也能用吗？**
A: 可以。系统自动切换为确定性离线模式，返回预设回复。任务管理、事件流、等级系统等功能完全正常，只是 AI 回复不会真正"思考"。

**Q: 数据存在哪里？**
A: 全部在本地，默认路径 `./nexus-7.db`（SQLite 文件）。不联网，不上传。

**Q: 如何备份数据？**
A: 复制 `nexus-7.db` 文件即可。`NEXUS-7/` 目录也有 Markdown 格式的备份，可以用 Obsidian 阅读。

**Q: ActivityWatch 必须安装吗？**
A: 不必须。AW 是可选增强。没有 AW 时，日终复盘只使用任务完成记录和浏览器历史（若可读）进行分析。

**Q: 浏览器历史功能如何工作？**
A: 系统会读取 Chrome 或 Edge 的本地 SQLite History 文件的只读副本（不修改原文件），提取当天访问记录，用于日终复盘的自欺识别。浏览器打开时文件有锁，系统会跳过锁定的文件。

**Q: 为什么任务完成后等级没有变化？**
A: 等级公式是 `floor(sqrt(XP / 100))`，所以 Lv.1 需要 100 XP，Lv.2 需要 400 XP，Lv.5 需要 2500 XP。早期升级较快，后期需要持续积累。

---

*NEXUS-7 是一个持续进化的个人项目。当前处于 Phase 1，核心闭环已可使用。*
