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
- [桌面原生客户端（Tauri 2）](#桌面原生客户端tauri-2)
- [版本路线图](#版本路线图)
- [常见问题](#常见问题)

---

## 系统概览

```
六源感知（屏幕/浏览器/健康/财务/日历/主观陈述）
  └─► Orchestrator（场景路由 + 多 Agent 汇总）
        │
        │  核心 Agent
        ├─ PlanningAgent    → 生成今日执行协议（结合日历避开占用时段）
        ├─ ReviewAgent      → 日终校准（N 源加权自欺识别）
        ├─ InsightAgent     → 长期行为模式洞察
        ├─ CoachAgent       → 苏格拉底式目标真实性检测
        ├─ DecisionAgent    → 净成长值 / 选择前预测 / 人生路线模拟
        ├─ ReportAgent      → 周/月/季/年周期报告
        ├─ ReminderAgent    → 智能提醒（定时自动触发）
        ├─ ProfileAgent     → 档案演化提议（宿主确认）
        ├─ DialogueAgent    → 通用对话
        ├─ CompanionAgent   → 系统小人（注入历史记忆）
        ├─ SafetyAgent      → 输出安全检查
        │
        │  辅助 Agent（后台工作，由主小人一个声音汇总）
        ├─ HealthStewardAgent   → 健康管家（身体维度）
        ├─ LearningStewardAgent → 学习教练（输入 vs 产出）
        │
        │  进化引擎（仅提议·可回滚·硬编码禁区）
        └─ EvolutionAgent   → 提议改进其他 Agent 的提示词
              │
              ▼
        本地 SQLite（事件流 + 向量记忆 + 任务 + 目标 + 复盘 + 分歧 + 进化日志）
        Obsidian Vault 同步（Markdown 备份）
```

### 核心特性

| 特性 | 说明 |
|------|------|
| **本地优先** | 所有数据存储在本地 SQLite，不依赖云数据库 |
| **多模型支持** | Anthropic / OpenAI / Gemini / DeepSeek / Kimi，一键切换 |
| **混合推理** | 廉价高频档位走本地 Ollama，深度推理走云端 API，本地不可达自动回落 |
| **离线模式** | 无 API Key 时自动切换为确定性本地回复，系统依然可用 |
| **六源感知** | 屏幕(AW) + 浏览器 + 健康 CSV + 财务账单 + 日历(.ics) + 主观陈述 |
| **N 源加权自欺识别** | 日终复盘按源可靠性加权对比，戳穿"我专注了/很健康/没超支" |
| **持续力引擎** | 习惯链 + 主动洞察 + 小人历史记忆 + 关键时刻主动介入 |
| **多专精 Agent** | 健康管家 / 学习教练后台工作，发现由主小人一个声音转达 |
| **黑箱裁决** | 主观与客观冲突时不强制纠正，记录分歧并追踪现实站哪边 |
| **进化引擎** | 系统提议改进自己的提示词，仅提议·可回滚·绝不碰安全/自身 |
| **觉醒等级系统** | 完成任务获得经验值，六维属性成长（会衰减），高等级解锁更多功能 |
| **向量记忆** | 事件写入即算 embedding，余弦相似度语义召回 + 关键词兜底 |
| **定时自动调度** | 提醒 / 守护巡查 / 周月季年报告 / 记忆收紧 / 档案扫描全自动 |
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
# 浏览器打开 http://127.0.0.1:5177
```

### 5. 验证运行状态

打开浏览器访问 `http://127.0.0.1:5177`，右上角显示"AI 在线"（有 Key）或"离线模拟"（无 Key）即为成功。
首次进入会触发**觉醒仪式**（全屏 onboarding，8 题初始化档案，可跳过）。

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

### 混合推理（本地 Ollama，降低成本）

配置本地模型后，廉价高频的档位（默认 `haiku`：小人台词、提醒、习惯链微洞察——一天几十次）
路由到本地 [Ollama](https://ollama.com/)，深度推理（`sonnet`/`opus`：复盘、洞察、路线模拟）仍走云端 API。
**本地不可达时自动回落云端**——没装 Ollama 也不会坏。

```bash
ollama pull qwen2.5:7b   # 先拉一个本地模型
```

```dotenv
NEXUS_LLM_PROVIDER=deepseek          # 云端主模型（深度推理）
DEEPSEEK_API_KEY=sk-你的密钥
NEXUS_LOCAL_LLM_MODEL=qwen2.5:7b     # 配此项即启用混合推理
NEXUS_LOCAL_LLM_BASE_URL=http://localhost:11434/v1
NEXUS_LOCAL_LLM_TIERS=haiku          # 哪些档位走本地（逗号分隔）
```

---

## 功能使用指南

> 提示：许多高级功能按**觉醒等级**逐步解锁（见下方「功能解锁阶梯」）。下面按使用场景说明。

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

### 持续力引擎（习惯链 + 主动巡查）

把「记录」转化为「长期坚持」的四个机制：

- **习惯链**：晨间规划/日终校准/任务完成/目标推进各自累计连续天数，主界面常驻显示。断了不隐藏——「上次连续 12 天，断于 6/10」本身是信息。
- **主动洞察**：链达到 3/7/14/30 天里程碑时触发微洞察（引用历史，不空喊加油）；≥7 天断链触发断链分析。
- **小人历史记忆**：日终复盘判定的「关键时刻」（低谷/想放弃/重启/突破）成为小人长期记忆，情绪显著时它会引用——"上周三你也说不想动，那天最后还是做了 25 分钟"。
- **关键时刻介入**：每天 19:30 守护巡查，属性荒废 ≥7 天时主小人主动提醒（每日 ≤2 次，连续忽略则静默）。

### 决策中枢（净成长值 / 选择前预测 / 路线模拟）

> 净成长值 Lv.15 · 路线模拟 Lv.30 解锁

- **今日净成长值**：日终自动评估今天的行为是接近还是远离理想人生（−100~+100），锚点是长期愿景而非"今天忙不忙"。
- **选择前预测**：给系统一个决策 + 多个方案，预测各自与愿景的契合度、短期代价、长期收益、风险。
- **人生路线模拟**：人生级抉择（如考研 vs 就业）推演成 3个月/1年/3年的轨迹，点出真正的底层分叉点。

### 全域感知（接入完整的你）

系统默认只看得见「屏幕前的你」。接入更多数据源，让它看见完整的你——每个源都喂给决策，不只展示：

| 面板 | 接入方式 | 喂给什么 |
|------|---------|---------|
| 生命体征接入 | 健康/运动 CSV（小米/Zepp/Keep 导出）| 体力属性 + 净成长值 + 复盘健康校验 |
| 财务感知 | 账单 CSV（支付宝/微信/银行）| 红线检测（冲动消费）+ 目标代价 |
| 日历接入 | .ics 文件（Google/Outlook 导出）| 晨间规划避开占用时段 + 复盘锚点 |

接入后，日终复盘会按源可靠性加权——自称"今天好好锻炼了"但手环只记录 1200 步，会被直接点名。

### 多专精 Agent（健康管家 / 学习教练）

> 健康管家在生命体征面板、学习教练在认知成长面板，点击「健康管家/学习教练」唤起

两个后台专精 Agent，但**它们的发现由主小人一个声音转达**，界面不割裂：

- **健康管家**：身体维度评估（达标/留意/荒废预警）+ 一个最小动作。
- **学习教练**：严格区分「输入」（刷视频/收藏）与「产出」（笔记/作品）——只输入不产出不算学习。
- **守护巡查**：在「系统核心」面板点「守护巡查」，系统按荒废信号决定哪个管家说话，多个发现汇总成一句话。

### 黑箱裁决（分歧档案）

当系统的多源判断与你的陈述冲突、你却坚持时，在复盘面板点「我坚持」：

- 系统**不强制纠正**，开启一条分歧记录（不即时扣可信度），进入「追踪中」。
- 后续你可在「分歧档案」裁决：现实证实了你（可信度 +0.5）/ 证伪了你（−0.5）/ 我撤回（+0.2）。
- 已裁决不可篡改——系统记得你坚持过什么，以及现实后来站在了哪一边。

### 档案演化 / 关系图谱 / 深度趋势 / 商城

- **档案演化提议**：每周系统扫描行为与档案的矛盾，在「宿主档案」提议更新（你确认才生效，可回滚）。
- **周期报告**（Lv.20）：周/月/季/年四个周期，把习惯链、净成长、健康、财务滚成长期趋势 + 一句可执行焦点。
- **关系图谱**（Lv.30）：目标 → 任务 → 属性的 SVG 网络。
- **深度长期趋势**（Lv.50）：12 周净成长/任务/健康/财务的趋势线 + 确定性观察。
- **能量点商城**（Lv.3）：能量点兑换小人皮肤/特效（门槛：可信度 ≥1.0），装备实时改变小人配色。

### 进化日志（系统自我改进）

在「进化日志」面板点任一 Agent，系统会基于近期指标提议改进它的提示词：

- **仅提议，绝不自动生效**——你在面板确认才应用，随时可一键回滚。
- **硬编码禁区**：进化引擎绝不触碰安全 Agent 与自身（代码级拦截，不靠 LLM 自觉）。
- 进化是让系统更诚实，不是更讨喜。

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

> **属性会衰减**：某维度 7 天未触发 −5%、14 天 −10%（小人关怀）、30 天 −20%。再次活跃即重置——
> 不维护的能力会自然退化，这是提醒不是惩罚。健康 CSV 导入的运动也会滋养体力属性、重置其衰减时钟。

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

### 对话与复盘

| 方法 | 路径 | Body | 说明 |
|------|------|------|------|
| POST | `/chat/send` | `{message, trigger?}` | 发送消息，触发对应 Agent |
| POST | `/reviews/daily` | `{note}` | 日终校准（N 源加权：AW + 浏览器 + 健康 + 财务 + 主观）|
| GET | `/reviews/latest` | `?type=daily` | 获取最新复盘 |
| POST | `/insights/weekly` | — | 生成行为洞察报告 |
| POST | `/coach/session` | `{goalTitle, userAnswer, previousExchanges?}` | 教练追问一轮 |
| POST | `/reminders/check` | — | 手动触发提醒检查 |
| GET / POST | `/reports/latest` `?type=` · `/reports/{weekly\|monthly\|quarterly\|annual}` | — | 周期报告 |

### 目标与任务

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/goals` · `/tasks` | 获取 / 创建目标·任务（`/tasks?status=` 筛选）|
| PATCH | `/goals/:id/status` · `/tasks/:id/status` | 更新状态（任务含证据）|
| GET / POST | `/streaks` · `/interventions/check` | 习惯链 · 触发关键时刻介入 |

### 决策中枢（§8/§9）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/decision/net-growth` | 读取 / 计算今日净成长值 |
| POST | `/decision/predict` | 选择前预测 `{question, options[]}` |
| POST | `/decision/simulate-path` | 人生路线模拟 `{scenario, paths[]}` |

### 全域感知数据源

| 方法 | 路径 | 说明 |
|------|------|------|
| POST / GET | `/data/health/import` · `/data/health/recent` | 健康 CSV 导入 / 近期汇总 |
| POST / GET | `/data/finance/import` · `/data/finance/summary` | 财务 CSV 导入 / 周期汇总 |
| POST / GET | `/data/calendar/import` · `/data/calendar/upcoming` | 日历 .ics 导入 / 即将日程 |

### 多专精 Agent / 档案演化

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/agents/health-steward` · `/agents/learning-steward` | 唤起健康管家 / 学习教练 |
| POST | `/agents/steward-sweep` | 守护巡查（多 Agent 汇总成一个声音）|
| GET / POST | `/profile/changes` · `/profile/evolution/scan` | 档案演化提议 / 扫描 |
| POST | `/profile/changes/:id/resolve` | 接受/拒绝档案提议 `{accept}` |

### 黑箱裁决 / 进化引擎 / 商城

| 方法 | 路径 | 说明 |
|------|------|------|
| GET / POST | `/divergences` | 分歧档案 / 开启分歧 `{claim, evidence}` |
| POST | `/divergences/:id/resolve` | 裁决 `{outcome: confirmed\|refuted\|withdrawn}` |
| GET / POST | `/evolution` · `/evolution/scan` | 进化日志 / 扫描提议 `{targetKey}` |
| POST | `/evolution/:id/{apply\|rollback\|reject}` | 应用 / 回滚 / 拒绝进化提议 |
| GET / POST | `/shop` · `/shop/purchase` · `/shop/equip` | 商城 / 兑换 / 装备皮肤 |

### 数据与集成

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/events/query` | 查询事件流（`?limit=` 条数）|
| GET | `/memory/search` | 向量语义召回（`?q=关键词&topK=10`）|
| GET | `/graph` · `/analysis/deep` | 关系图谱 / 深度长期趋势 |
| GET | `/companion/state` | 系统小人当前状态 |
| GET | `/activity-watch/status` · `/browser/history` | AW 状态 / 浏览器近期访问 |

### chat trigger 可选值

```
user_message      普通对话
morning_planning  晨间规划（生成执行协议）
daily_review      日终校准
task_completed    任务完成（自动触发）
insight_analysis  洞察分析
coach_session     教练追问
reminder_check    提醒检查
decision_analysis 决策分析
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
│   │       ├── llm.ts              # LlmClient + HybridLlmClient（多提供商 + 混合推理）
│   │       ├── model-router.ts     # 模型层级路由
│   │       ├── orchestrator.ts     # Agent 调度 + 场景路由 + 多 Agent 汇总
│   │       ├── prompt-registry.ts  # Agent 提示词 + 运行时覆盖（进化引擎用）
│   │       ├── structured-output.ts # JSON 输出解析验证
│   │       ├── steward-aggregate.ts # 多 Agent 输出汇总成一个声音
│   │       ├── tools.ts            # NexusTools 接口
│   │       └── agents/             # planning/review/insight/coach/decision/report/
│   │           │                   # reminder/profile/dialogue/companion/safety/
│   │           └── …                # health-steward/learning-steward/evolution/streak
│   ├── memory/          # SQLite 数据层（Node 22 node:sqlite）
│   │   └── src/
│   │       ├── repository.ts  # 全量数据操作 + 迁移
│   │       ├── embedding.ts   # 本地确定性嵌入器（向量记忆）
│   │       └── schema.ts      # Drizzle 表结构定义
│   ├── shared/          # 共享类型定义
│   │   └── src/
│   │       └── domain.ts      # 所有领域类型 + 等级/解锁/进化禁区工具函数
│   └── companion/       # 小人状态映射
├── apps/server/src/
│   ├── data-sources/    # health-csv / finance-csv / calendar-ics / csv-utils
│   ├── analysis/        # deep-analysis（深度长期趋势纯函数）
│   └── scheduler.service.ts  # 定时任务（提醒/巡查/报告/记忆收紧/档案/进化）
├── apps/desktop/
│   ├── src/components/  # OnboardingRitual / FloatingCompanion / Live2DStage
│   └── src-tauri/       # Tauri 2 原生壳（见下方专章）
├── scripts/             # probe-ai / probe-anthropic / smoke-test
├── prompts/  evals/     # Agent 提示词草稿 / 离线评估用例
├── .env.example         # 环境变量模板
├── .rust/               # 项目本地 Rust + MinGW 工具链（gitignored）
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

## 桌面原生客户端（Tauri 2）

桌面端默认以 Vite Web 壳运行（`dev:desktop`）。要打包为原生 Windows 应用，使用 Tauri 2。
为避免污染系统盘，本项目把 **Rust 工具链与 MinGW 编译器都安装在项目目录内**（均已 gitignore）。

### 工具链（项目本地，不进 C 盘）

| 组件 | 位置 | 说明 |
|------|------|------|
| Rust (rustup) | `.rust/cargo`、`.rust/rustup` | `x86_64-pc-windows-gnu` 工具链（无需 MSVC）|
| MinGW-w64 | `.rust/mingw64` | 提供 `gcc`/`ld`/`dlltool`/`as` 等完整 binutils |
| cargo 镜像 | `.rust/cargo/config.toml` | RsProxy 稀疏索引，解决国内访问 crates.io 超时 |

### ⚠️ 关键：路径不能含空格

MinGW 的 `windres`（资源编译）无法处理含空格的路径。本项目实际路径
`F:\Thinking Idea\Task Management System` 含空格，**必须通过无空格的目录联接（junction）构建**：

```powershell
# 一次性创建无空格联接（指向真实项目目录，透明访问同一份文件）
New-Item -ItemType Junction -Path "F:\nx7" -Target "F:\Thinking Idea\Task Management System"
```

构建时一律使用 `F:\nx7`（`target/` 与 `.rust/` 经联接透明复用，不重复下载）。

### 构建 / 运行（PowerShell）

```powershell
# 每个会话先设置项目本地工具链环境（全部走无空格的 junction 路径）
$j = "F:\nx7"
$env:CARGO_HOME = "$j\.rust\cargo"
$env:RUSTUP_HOME = "$j\.rust\rustup"
$env:PATH = "$env:CARGO_HOME\bin;$j\.rust\mingw64\bin;$env:PATH"
Set-Location "$j\apps\desktop"

# 开发模式（热重载，自动起 Vite dev server）
corepack pnpm tauri:dev

# 打包发布版（生成 .exe / 安装包到 src-tauri/target/release）
corepack pnpm tauri:build
```

> 已验证：`cargo build` 在本环境成功产出 `app.exe`（debug，1m31s）。
>
> Tauri 配置在 [apps/desktop/src-tauri/tauri.conf.json](apps/desktop/src-tauri/tauri.conf.json)：
> 窗口 1280×860、暗色主题、devUrl 指向 `127.0.0.1:5177`、frontendDist 指向 `../dist`。
> 前端通过 `__TAURI_INTERNALS__` 检测原生环境，状态栏显示「原生运行」。
>
> **`Cargo.toml` 注意**：`[lib] crate-type = ["lib"]`（仅 rlib）。桌面端不要加
> `cdylib`——在 windows-gnu 下会触发 ld `export ordinal too large` 链接错误；
> `cdylib`/`staticlib` 仅移动端需要。

---

## 版本路线图

详见 [NEXUS-7 整合规划书 v1.0.md](NEXUS-7%20整合规划书%20v1.0.md)。下面是已交付状态概览。

### Phase 1 · 觉醒 ✅

核心闭环（规划→执行→复盘→校准）· 多提供商 LLM · 本地 SQLite + Obsidian 同步 ·
觉醒等级 + 六维属性 + 解锁阶梯 · 洞察/教练/提醒 Agent + 定时调度 · 多源自欺识别 ·
晨间/日终仪式 · 首次启动觉醒仪式 · 白天/夜间双主题

### Phase 2 · 持续力 + 深化理解 + 具象化 ✅

- **持续力引擎**：习惯链 · 主动洞察 · 小人历史记忆 · 关键时刻介入
- **深化理解**：档案演化 · 属性衰减 · 决策中枢（净成长/选择预测/路线模拟）· 周月报告 · 关系图谱 · 记忆遗忘
- **具象化**：Tauri 2 桌面端（实测产出 `app.exe`）· Live2D 小人 + 悬浮窗 · 首启仪式

### Phase 3 · 全域感知 ✅

六源感知（屏幕/浏览器/健康/财务/日历/主观）· N 源加权自欺识别 ·
健康管家 + 学习教练（主小人统一汇总）· 场景路由守护巡查 · 季度/年度复盘 ·
黑箱裁决 · 深度长期趋势 · 向量语义记忆 · 皮肤商城

### Phase 4 · 自主进化 + 本地化（进行中）

- [x] **Evolution Agent**：提议改进其他 Agent 提示词（仅提议·可回滚·硬编码禁区）
- [x] 进化日志可视化
- [x] **混合推理**：廉价高频档位走本地 Ollama，深度推理走云端，自动回落
- [ ] 真本地模型推理（需本机 Ollama + `ollama pull`）
- [ ] Flutter 移动端
- [ ] 日成本目标 < ¥0.3（混合推理机制已就绪）

### Phase 5 · 专属协议（远期）

微调专属小模型 · AR 终端 · MCP 接口 · Lv.100 终极协议

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

**Q: 健康/财务/日历数据怎么接入？**
A: 都是 CSV/.ics 文件粘贴导入，无需 OAuth。健康用小米/Zepp/Keep 导出的步数运动 CSV，财务用支付宝/微信/银行账单 CSV，日历用 Google/Outlook 导出的 .ics。导入后会自动喂给属性、净成长值和日终复盘的跨源校验。

**Q: 进化引擎会不会乱改坏系统？**
A: 不会。进化引擎**只提议、绝不自动生效**，所有改动你在「进化日志」确认才应用、随时可一键回滚；且**硬编码禁区**——它绝不能修改安全 Agent 与自身（代码级拦截，不靠 LLM 自觉）。它也绝不会弱化诚实性原则。

**Q: 混合推理能省成本，但我没装 Ollama，会出问题吗？**
A: 不会。不配 `NEXUS_LOCAL_LLM_MODEL` 就不启用混合推理，行为和以前完全一致；即便配了、Ollama 没运行，本地档位调用失败会**自动回落云端**，绝不让整条链崩溃。

---

*NEXUS-7 是一个持续进化的个人项目。Phase 1-3 已全部交付，Phase 4 自主进化进行中。*
