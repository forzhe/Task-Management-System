export type ISODateTime = string;

export const DEFAULT_USER_ID = "local-host";

export type AgentId =
  | "orchestrator"
  | "dialogue"
  | "planning"
  | "review"
  | "insight"
  | "coach"
  | "reminder"
  | "profile"
  | "companion"
  | "decision"
  | "steward"
  | "economy"
  | "evolution"
  | "safety";

export type ModelTier = "haiku" | "sonnet" | "opus";

export type TriggerKind =
  | "user_message"
  | "morning_planning"
  | "daily_review"
  | "task_completed"
  | "companion_tick"
  | "insight_analysis"
  | "coach_session"
  | "reminder_check"
  | "decision_analysis"
  | "system";

export type EventType =
  | "action"
  | "mood"
  | "decision"
  | "dialogue"
  | "external_data"
  | "agent_output"
  | "system";

export type GoalLevel = "ultimate" | "long_term" | "stage" | "weekly" | "daily";
export type GoalStatus = "active" | "paused" | "completed" | "frozen" | "archived";

export type TaskSource = "manual" | "ai" | "recurring";
export type TaskStatus =
  | "not_started"
  | "ready"
  | "in_progress"
  | "paused"
  | "completed"
  | "reviewed"
  | "failed";

export interface GoalStatusUpdateInput {
  status: GoalStatus;
}

export interface TaskStatusUpdateEvidence {
  note?: string;
  proofLink?: string;
  actualMinutes?: number;
  source?: "desktop" | "api";
}

export interface TaskStatusUpdateInput {
  status: TaskStatus;
  evidence?: TaskStatusUpdateEvidence;
}

/** §6.7 数据管理 / §6.4 计划编辑：可手动修改的任务字段 */
export interface TaskEditInput {
  title?: string;
  description?: string;
  energyRequired?: EnergyLevel;
  estimatedMinutes?: number | null;
  rewardPoints?: number;
  acceptanceCriteria?: string;
  proofMethod?: string;
  goalId?: string | null;
}

export interface ProfileUpdateInput {
  basicInfo?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  motivations?: Record<string, unknown>;
  redLines?: string[];
  longTermVision?: Record<string, unknown>;
}

export type EnergyLevel = "low" | "medium" | "high";
export type ReviewType = "daily" | "weekly" | "monthly" | "quarterly" | "annual";

export type CompanionState =
  | "idle"
  | "focus"
  | "reminding"
  | "celebrating"
  | "disappointed"
  | "strict"
  | "caring"
  | "evolving";

export interface AgentOutputEnvelope<TData> {
  schemaVersion: 1;
  agentId: AgentId;
  summary: string;
  data: TData;
  warnings: string[];
  fallbackUsed: boolean;
}

export interface PlannedTask {
  title: string;
  description: string;
  energyRequired: EnergyLevel;
  estimatedMinutes: number;
  acceptanceCriteria: string;
  proofMethod: string;
  rewardPoints: number;
}

export interface PlanningOutput {
  planTitle: string;
  rationale: string;
  tasks: PlannedTask[];
  risks: string[];
}

export interface ReviewOutput {
  summary: string;
  honestDelta: string;
  risks: string[];
  tomorrowAdjustment: string;
  emotionTags: string[];
  /** §6.6.3：今天是否构成"关键时刻"（小人记忆来源，复用复盘调用不增加 LLM 成本）*/
  keyMoment?: {
    type: "low_point" | "near_quit" | "recovery" | "peak" | "promise";
    summary: string;
    emotionalWeight: number;
  } | null;
}

export interface InsightOutput {
  /** 1-3 句核心洞察 */
  coreInsight: string;
  /** 识别到的行为模式（正向/负向）*/
  patterns: Array<{ type: "positive" | "negative"; description: string }>;
  /** 建议下一步校准方向 */
  calibrationSuggestion: string;
  /** 可信度信号（基于最近复盘数据）*/
  credibilitySignal: "high" | "medium" | "low";
}

export interface CoachOutput {
  /** 苏格拉底式追问，引导宿主明确目标 */
  question: string;
  /** 追问轮次（1-5）*/
  round: number;
  /** 是否已到评估阶段 */
  readyToEvaluate: boolean;
  /** 若已评估，给出冲动概率（0-1）*/
  impulseProbability?: number;
  /** 建议行动：继续/暂存3天/重构目标 */
  recommendation?: "proceed" | "defer_3days" | "reframe";
}

export interface ReminderOutput {
  /** 是否需要发送提醒 */
  shouldNotify: boolean;
  /** 提醒类型 */
  type: "task_due" | "review_missed" | "goal_stalled" | "streak_at_risk" | "none";
  /** 提醒文案 */
  message: string;
}

export interface CompanionOutput {
  state: CompanionState;
  dialogue: string;
}

export interface SafetyOutput {
  safe: boolean;
  flags: string[];
  responseOverride?: string;
}

// ── 系统进化引擎 §6.4 ──────────────────────────────────────────────

export type EvolutionStatus = "proposed" | "applied" | "rolled_back" | "rejected";

/**
 * 一条进化提议：Evolution Agent 对某个 Agent 提示词的改进建议。
 * 铁律：仅提议不自动应用；全程可见可回滚（§6.4）。
 */
export interface EvolutionProposal {
  id: string;
  /** 目标提示词 key（planning/review/companion/...）*/
  targetKey: string;
  reason: string;
  oldPrompt: string;
  newPrompt: string;
  status: EvolutionStatus;
  createdAt: ISODateTime;
  appliedAt?: ISODateTime | null;
}

/** Evolution Agent 结构化输出 */
export interface EvolutionOutput {
  targetKey: string;
  changeNeeded: boolean;
  reason: string;
  /** 完整替换提示词；changeNeeded=false 时可空 */
  newPrompt: string;
}

/**
 * 绝对禁区（硬编码，§6.4）：Evolution Agent 不可触碰 Safety Agent 与自身。
 * 这是制度性护栏——不靠 LLM 自觉，靠代码拦截。
 */
export const EVOLUTION_FORBIDDEN_TARGETS: readonly string[] = ["safety", "evolution"];

/** 可被进化的提示词 key（用户可感知的行为型 Agent）*/
export const EVOLUTION_EDITABLE_KEYS: readonly string[] = [
  "planning",
  "review",
  "companion",
  "insight",
  "coach",
  "reminder",
];

export function isEvolutionTargetAllowed(key: string): boolean {
  return EVOLUTION_EDITABLE_KEYS.includes(key) && !EVOLUTION_FORBIDDEN_TARGETS.includes(key);
}

export type AttributeKey =
  | "intellect"
  | "stamina"
  | "focus"
  | "willpower"
  | "creativity"
  | "order";

export interface AttributeSet {
  intellect: number;
  stamina: number;
  focus: number;
  willpower: number;
  creativity: number;
  order: number;
}

export const ATTRIBUTE_LABELS: Record<AttributeKey, string> = {
  intellect: "智力",
  stamina: "体力",
  focus: "专注力",
  willpower: "意志力",
  creativity: "创造力",
  order: "秩序感",
};

export const EMPTY_ATTRIBUTES: AttributeSet = {
  intellect: 0,
  stamina: 0,
  focus: 0,
  willpower: 0,
  creativity: 0,
  order: 0,
};

export interface User {
  id: string;
  createdAt: ISODateTime;
  currentLevel: number;
  totalExp: number;
  credibilityScore: number;
  energyPoints: number;
  attributes: AttributeSet;
}

/** Level formula: level = floor(sqrt(totalExp / 100)), so Lv.1=100xp, Lv.10=10000xp */
export function calcLevel(totalExp: number): number {
  return Math.max(1, Math.floor(Math.sqrt(totalExp / 100)));
}

/** XP needed to reach next level */
export function xpToNextLevel(currentLevel: number): number {
  const nextLevel = currentLevel + 1;
  return nextLevel * nextLevel * 100;
}

export type FeatureKey =
  | "daily_tasks"      // Lv.1 — always on
  | "chat"             // Lv.1
  | "goals"            // Lv.1
  | "shop"             // Lv.3
  | "review"           // Lv.5
  | "review_insights"  // Lv.5
  | "attributes"       // Lv.10
  | "behavior_score"   // Lv.15
  | "weekly_summary"   // Lv.20
  | "path_simulation"  // Lv.30
  | "deep_analysis"    // Lv.50
  | "terminal"         // Lv.100

export const UNLOCK_LEVELS: Record<FeatureKey, number> = {
  daily_tasks:      1,
  chat:             1,
  goals:            1,
  shop:             3,
  review:           5,
  review_insights:  5,
  attributes:       10,
  behavior_score:   15,
  weekly_summary:   20,
  path_simulation:  30,
  deep_analysis:    50,
  terminal:         100,
};

export const UNLOCK_LABELS: Record<FeatureKey, string> = {
  daily_tasks:      "每日任务",
  chat:             "对话",
  goals:            "目标规划",
  shop:             "能量点商城",
  review:           "日终校准",
  review_insights:  "复盘洞察",
  attributes:       "六维属性面板",
  behavior_score:   "行为影响评分",
  weekly_summary:   "每周总结",
  path_simulation:  "人生路线模拟",
  deep_analysis:    "深度长期趋势",
  terminal:         "终极协议",
};

export function isFeatureUnlocked(feature: FeatureKey, level: number): boolean {
  return level >= UNLOCK_LEVELS[feature];
}

// ── 能量点商城 §6.5 / §6.7.6 ───────────────────────────────────────

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  kind: "skin" | "effect";
  /** 能量点价格 */
  cost: number;
  /** 兑换门槛：可信度下限（§6.7.6 虚拟奖励 ≥ 1.0）*/
  minCredibility: number;
}

/** 首批商城内容（虚拟奖励：小人皮肤/特效）。default 为初始皮肤，免费已拥有。*/
export const SHOP_CATALOG: ShopItem[] = [
  { id: "deepspace", name: "深空蓝", description: "冷峻的深空配色，专注者之选。", kind: "skin", cost: 1000, minCredibility: 1.0 },
  { id: "amber", name: "琥珀金", description: "温暖的琥珀光泽，陪伴感更强。", kind: "skin", cost: 1500, minCredibility: 1.0 },
  { id: "pulse", name: "脉冲光环", description: "核心外缘持续脉动的能量环。", kind: "effect", cost: 2000, minCredibility: 1.0 },
  { id: "datastream", name: "数据流", description: "环绕核心的数据流光特效。", kind: "effect", cost: 3000, minCredibility: 1.2 },
  { id: "aurora", name: "极光", description: "顶配皮肤，流动的极光色带。", kind: "skin", cost: 5000, minCredibility: 1.5 },
];

export const DEFAULT_SKIN = "default";

/** 商城视图：目录 + 拥有状态 + 当前装备 + 宿主能量/可信度 */
export interface ShopView {
  catalog: ShopItem[];
  owned: string[];
  equipped: string;
  energyPoints: number;
  credibilityScore: number;
}

export interface ShopPurchaseResult {
  ok: boolean;
  error?: string;
  itemId?: string;
  energyPoints?: number;
}

// ── 自定义悬赏与 AI 定价（商城子系统规划书 §1-11）──────────────────
// 宿主只提需求，经济官独占定价（禁区⑦）。价格一口价、锁定即终局（无再改价）。

/** 奖励价值层级（决定目标兑现周期，越高周期越长）*/
export type BountyValueTier = "small" | "light" | "medium" | "large" | "major";

/** 对齐判定：奖励与目标/红线的关系 */
export type BountyAlignment = "aligned" | "neutral" | "indulgent" | "conflict";

/** 奖励语义类别（按"是什么"分类，用于奖励库陈列）*/
export type BountyCategory =
  | "electronics" // 电子数码
  | "food" // 美食
  | "apparel" // 服饰鞋包
  | "entertainment" // 娱乐游戏
  | "travel" // 旅行出游
  | "learning" // 学习成长
  | "fitness" // 运动健康
  | "home" // 居家生活
  | "beauty" // 美妆个护
  | "other"; // 其他

export const BOUNTY_CATEGORY_LABELS: Record<BountyCategory, string> = {
  electronics: "电子数码",
  food: "美食",
  apparel: "服饰鞋包",
  entertainment: "娱乐游戏",
  travel: "旅行出游",
  learning: "学习成长",
  fitness: "运动健康",
  home: "居家生活",
  beauty: "美妆个护",
  other: "其他",
};

/** 悬赏契约生命周期（不可逆推进；priced 起锁价）*/
export type BountyState =
  | "appraising" // 经济官估值中
  | "clarify" // 需宿主澄清
  | "priced" // 已定价并锁定
  | "saving" // 攒能量中（priced 后默认态）
  | "redeemable" // 能量已够，可兑现
  | "redeemed" // 已兑现（扣能量）
  | "fulfilled" // 已确认现实兑现
  | "rejected" // 红线/有害，拒绝纳入经济
  | "abandoned"; // 宿主放弃

export const BOUNTY_VALUE_TIER_LABELS: Record<BountyValueTier, string> = {
  small: "小确幸",
  light: "轻奖励",
  medium: "中奖励",
  large: "大奖励",
  major: "重大奖励",
};

export const BOUNTY_STATE_LABELS: Record<BountyState, string> = {
  appraising: "估值中",
  clarify: "待澄清",
  priced: "已定价",
  saving: "攒能量中",
  redeemable: "可兑现",
  redeemed: "已兑现",
  fulfilled: "已确认",
  rejected: "已婉拒",
  abandoned: "已放弃",
};

/**
 * 价值层级 → 目标兑现周期带（周）。经济官估值的参考锚，也是确定性兜底的系数来源。
 * mid 用于确定性公式取中值。
 */
export const BOUNTY_HORIZON_BY_TIER: Record<
  BountyValueTier,
  { minWeeks: number; maxWeeks: number; midWeeks: number; valueFloorCny: number }
> = {
  small: { minWeeks: 0.3, maxWeeks: 1, midWeeks: 0.6, valueFloorCny: 0 },
  light: { minWeeks: 1, maxWeeks: 3, midWeeks: 2, valueFloorCny: 50 },
  medium: { minWeeks: 3, maxWeeks: 8, midWeeks: 5, valueFloorCny: 300 },
  large: { minWeeks: 8, maxWeeks: 16, midWeeks: 12, valueFloorCny: 1500 },
  major: { minWeeks: 16, maxWeeks: 28, midWeeks: 20, valueFloorCny: 6000 },
};

/** 全局护栏：隐含兑现周期被夹逼在此区间，防止「秒到手」或「天价」*/
export const BOUNTY_HORIZON_FLOOR_WEEKS = 0.3;
export const BOUNTY_HORIZON_CEILING_WEEKS = 28;

/** 可信度危机线：低于此值暂停开新悬赏（呼应 §6.1 积分暂停）*/
export const BOUNTY_MIN_CREDIBILITY = 0.5;

/** 新宿主无赚取历史时的兜底周赚取率（能量点/周）*/
export const BOUNTY_DEFAULT_WEEKLY_RATE = 200;

/** 节奏漂移再校准：赚取率漂移达此倍数（上或下）才重定价（滞回，防抖）*/
export const BOUNTY_REPRICE_DRIFT_FACTOR = 2.5;

/** 临门一脚锁定：进度达此比例（或已可兑换）即永久锁价，绝不再上调 */
export const BOUNTY_REPRICE_LOCK_PROGRESS = 0.9;

/** 定价依据（可回溯，宿主只读，禁区⑦）*/
export interface BountyPriceBreakdown {
  /** 可持续周赚取率（定价那一刻；再校准时作为漂移基准）*/
  rWeek: number;
  /** 最终价格隐含的兑现周期（周）= 这条悬赏的「努力锚」，再校准保持不变 */
  impliedHorizonWeeks: number;
  /** 经济官综合评判的关键因子 */
  keyFactors: string[];
  /** 护栏是否生效 */
  clampApplied: "none" | "floor" | "ceiling";
  /** 是否走了确定性兜底（离线/解析失败）*/
  offlineFallback: boolean;
  /** 临门一脚锁定后为 true：价格永久冻结，不再被再校准 */
  locked?: boolean;
  /** 最近一次再校准时间（节奏漂移触发）*/
  repricedAt?: ISODateTime | null;
  /** 最近一次再校准前的价格（卡片上展示 旧→新）*/
  repriceFrom?: number | null;
}

/** 一条悬赏契约 */
export interface Bounty {
  id: string;
  userId: string;
  /** 宿主心愿描述 */
  title: string;
  /** 宿主补充：理由 / 参考价 / 链接（可选）*/
  hostNote?: string | null;
  valueTier: BountyValueTier;
  /** 语义类别（按"是什么"分类，用于奖励库陈列）*/
  category: BountyCategory;
  estimatedValueCny: number;
  alignment: BountyAlignment;
  relatedGoalIds: string[];
  /** 锁定的悬赏能量，经济官独占写入、宿主不可改 */
  price: number;
  priceBreakdown: BountyPriceBreakdown;
  state: BountyState;
  /** 主小人口吻的一句估值说明 */
  companionLine: string;
  rejectReason?: string | null;
  /** 兑现凭证（可选，§8）*/
  evidenceRef?: string | null;
  createdAt: ISODateTime;
  pricedAt?: ISODateTime | null;
  redeemedAt?: ISODateTime | null;
  fulfilledAt?: ISODateTime | null;
}

/** 心愿单视图：契约列表 + 宿主当前能量/可信度（前端算进度）*/
export interface BountyView {
  bounties: Bounty[];
  energyPoints: number;
  credibilityScore: number;
  /** 当前进行中（攒能量/可兑现）的悬赏数，仅供展示，无上限 */
  activeCount: number;
}

/** 提交心愿/兑现等操作的统一结果 */
export interface BountyActionResult {
  ok: boolean;
  error?: string;
  bounty?: Bounty;
  energyPoints?: number;
}

/** 提交心愿（估值）的结果：经济官一次综合评判后给定价/澄清/婉拒 */
export interface BountyProposeResult {
  ok: boolean;
  verdict: "price" | "clarify" | "reject";
  /** 已定价时返回新建的契约 */
  bounty?: Bounty;
  /** 需澄清时返回问题（宿主补充后重新提交）*/
  clarifyingQuestions?: string[];
  /** 主小人口吻的一句话 */
  companionLine: string;
  rejectReason?: string;
  /** 受理失败（前置校验，如冷却/并发/可信度）*/
  error?: string;
}

/**
 * 经济官 Agent 的结构化输出（§11 契约）。经济官综合评判后给出 recommendedPrice，
 * 定价引擎再施加护栏夹逼。verdict=clarify 时只返回澄清问题；reject 时给 rejectReason。
 */
export interface EconomyOutput {
  appraisal: {
    valueTier: BountyValueTier;
    category: BountyCategory;
    estimatedValueCny: number;
    estimatedBasis: string;
    needsClarification: boolean;
    clarifyingQuestions: string[];
  };
  alignment: {
    verdict: BountyAlignment;
    relatedGoalIds: string[];
    redLineHit: boolean;
    rationale: string;
  };
  judgment: {
    /** 经济官自主综合评判的价格（未夹逼）*/
    recommendedPrice: number;
    impliedHorizonWeeks: number;
    keyFactors: string[];
  };
  verdict: "price" | "clarify" | "reject";
  /** 主小人口吻的一句话 */
  companionLine: string;
  rejectReason?: string;
}

// ── 深度长期趋势 §7.3 Lv.50 ────────────────────────────────────────

export interface TrendPoint {
  /** 周标签 MM-DD（该周周一）*/
  period: string;
  value: number;
}

/** 跨周期深度趋势分析（确定性聚合，Lv.50 解锁）*/
export interface DeepAnalysis {
  windowDays: number;
  weeks: number;
  /** 每周净成长均值 */
  netGrowthTrend: TrendPoint[];
  /** 每周完成任务数 */
  taskTrend: TrendPoint[];
  /** 每周日均步数（无健康数据则空）*/
  healthTrend: TrendPoint[];
  /** 每周总支出（无财务数据则空）*/
  financeTrend: TrendPoint[];
  /** 习惯链历史：每类的历史最长 + 断链次数 */
  streakHistory: Array<{ category: StreakCategory; longest: number; breaks: number }>;
  attributeSnapshot: AttributeSet;
  credibilityNow: number;
  levelNow: number;
  /** 确定性观察结论 */
  observations: string[];
}

export interface Profile {
  userId: string;
  basicInfo: Record<string, unknown>;
  traits: Record<string, unknown>;
  motivations: Record<string, unknown>;
  redLines: string[];
  longTermVision: Record<string, unknown>;
  updatedAt: ISODateTime;
  version: number;
}

export interface Goal {
  id: string;
  userId: string;
  parentGoalId?: string | null;
  level: GoalLevel;
  title: string;
  description?: string;
  type?: string;
  metrics: Record<string, unknown>;
  startAt?: ISODateTime | null;
  deadline?: ISODateTime | null;
  status: GoalStatus;
  progress: number;
  aiBreakdownLog: unknown[];
  impulseProbability?: number | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface Task {
  id: string;
  userId: string;
  goalId?: string | null;
  source: TaskSource;
  title: string;
  description?: string;
  type?: string;
  difficulty: number;
  energyRequired: EnergyLevel;
  estimatedMinutes?: number | null;
  actualMinutes?: number | null;
  rewardPoints: number;
  expRewards: Record<string, number>;
  failurePenalty?: string | null;
  acceptanceCriteria: string;
  proofMethod: string;
  scheduledAt?: ISODateTime | null;
  startedAt?: ISODateTime | null;
  completedAt?: ISODateTime | null;
  status: TaskStatus;
  statusHistory: Array<{ status: TaskStatus; at: ISODateTime; reason?: string }>;
  evidence?: Record<string, unknown>;
  verifiedByAi: boolean;
}

export interface Review {
  id: string;
  userId: string;
  type: ReviewType;
  scopeStart: ISODateTime;
  scopeEnd: ISODateTime;
  subjective: Record<string, unknown>;
  objective: Record<string, unknown>;
  aiAnalysis: Record<string, unknown>;
  suggestedAdjustments: Record<string, unknown>;
  emotionTags: string[];
  credibilityCheck?: string | null;
  createdAt: ISODateTime;
}

export interface Companion {
  id: string;
  userId: string;
  type: "main";
  currentForm: string;
  personalityParams: {
    intimacy: number;
    strictness: number;
    trust: number;
  };
  unlockedActions: string[];
  unlockedSkins: string[];
  currentState: CompanionState;
  currentDialogue: string;
  stateHistory: Array<{ state: CompanionState; at: ISODateTime; dialogue?: string }>;
}

export interface NexusEvent {
  id: string;
  userId: string;
  source: string;
  type: EventType;
  category?: string | null;
  rawPayload: unknown;
  structured: Record<string, unknown>;
  embedding?: number[] | null;
  occurredAt: ISODateTime;
  ingestedAt: ISODateTime;
  confidence: number;
  tags: string[];
  relatedGoalIds: string[];
  relatedTaskIds: string[];
}

export interface ScreenActivitySummary {
  date: string;
  totalActiveMinutes: number;
  focusMinutes: number;
  distractMinutes: number;
  topApps: Array<{ app: string; minutes: number; category: "focus" | "distract" | "other" }>;
  awConnected: boolean;
}

// ── 持续力引擎 §6.6 ──────────────────────────────────────────────────

export type StreakCategory =
  | "morning_planning"
  | "daily_review"
  | "task_completion"
  | "goal_progress";

export const STREAK_LABELS: Record<StreakCategory, string> = {
  morning_planning: "晨间规划",
  daily_review: "日终校准",
  task_completion: "任务完成",
  goal_progress: "目标推进",
};

export interface UserStreak {
  category: StreakCategory;
  goalId?: string | null;
  currentStreak: number;
  longestStreak: number;
  lastActiveDate: string; // YYYY-MM-DD
  brokenAt: string[]; // 断链日期数组，供洞察分析
}

/** Streak 里程碑：达到这些天数时触发微洞察 */
export const STREAK_MILESTONES = [3, 7, 14, 21, 30, 60, 100] as const;

export type CompanionMemoryType =
  | "low_point"
  | "near_quit"
  | "recovery"
  | "peak"
  | "promise";

export interface CompanionMemory {
  id: string;
  type: CompanionMemoryType;
  summary: string;
  occurredAt: ISODateTime;
  refEventIds: string[];
  emotionalWeight: number; // 0-1，注入优先级
}

export type InterventionSignal =
  | "streak_at_risk"
  | "stalled_task"
  | "review_at_risk"
  | "silent_day";

// ── 黑箱裁决 §6.7.4 ────────────────────────────────────────────────

export type DivergenceStatus = "open" | "confirmed" | "refuted" | "withdrawn";
/** 裁决结果：现实证实了宿主 / 证伪了宿主 / 宿主主动撤回 */
export type DivergenceOutcome = "confirmed" | "refuted" | "withdrawn";

/**
 * 一条分歧：宿主主观陈述与多源客观证据严重冲突、宿主坚持时记录。
 * 系统不强制修正，但记得你坚持过什么，以及现实后来站在了哪一边。
 */
export interface Divergence {
  id: string;
  /** 宿主坚持的陈述 */
  claim: string;
  /** 与之冲突的多源证据 */
  evidence: string;
  /** 领域（health/finance/focus/review… 自由文本）*/
  domain: string;
  status: DivergenceStatus;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime | null;
  resolutionNote?: string | null;
}

export const DIVERGENCE_STATUS_LABELS: Record<DivergenceStatus, string> = {
  open: "追踪中",
  confirmed: "现实证实了你",
  refuted: "现实证伪了你",
  withdrawn: "你主动撤回",
};

/** 裁决对可信度的影响（§6.1 联动，比即时 -1.0 更graduated）*/
export const DIVERGENCE_CREDIBILITY_DELTA: Record<DivergenceOutcome, number> = {
  confirmed: 0.5,
  refuted: -0.5,
  withdrawn: 0.2,
};

// ── 关系图谱 §5.1 ──────────────────────────────────────────────────

export type GraphNodeType = "goal" | "task" | "attribute";

export interface GraphNode {
  id: string;
  type: GraphNodeType;
  label: string;
  /** 节点大小提示（目标=进度/任务=奖励/属性=数值）*/
  weight: number;
  /** 任务节点的状态，用于上色 */
  status?: string;
}

export type GraphEdgeKind = "task_of_goal" | "task_feeds_attribute";

export interface GraphEdge {
  from: string;
  to: string;
  kind: GraphEdgeKind;
  weight: number;
}

export interface RelationshipGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ── 记忆遗忘策略 §5.2 ──────────────────────────────────────────────

export interface MemoryCompactionResult {
  /** 被聚合并删除的原始事件数 */
  compacted: number;
  /** 新建的摘要事件数 */
  digests: number;
}

// ── 全域感知 · 数据源 §6.7.1 ───────────────────────────────────────

export type DataSourceKind = "health" | "finance" | "calendar" | "mail";

/** 归一化信号：任意源解析后的统一数据点，写入事件流 */
export interface NormalizedSignal {
  kind: DataSourceKind;
  metric: string; // 如 steps / active_minutes / workout_minutes / sleep_hours / resting_hr
  value: number;
  unit: string; // count / min / hour / bpm
  date: string; // YYYY-MM-DD
  raw?: Record<string, unknown>;
}

/** 健康源按日聚合 */
export interface HealthDaySummary {
  date: string;
  steps?: number;
  activeMinutes?: number;
  workoutMinutes?: number;
  sleepHours?: number;
  restingHeartRate?: number;
}

/** 数据导入结果 */
export interface DataImportResult {
  kind: DataSourceKind;
  daysImported: number;
  signalsImported: number;
  attributeXpAwarded: number;
  summary: string;
  /** 财务源：导入即时识别到的冲动消费信号（§6.7.6 红线检测）*/
  impulseFlags?: string[];
}

/** 日历事件（.ics 解析）*/
export interface CalendarEvent {
  uid: string;
  title: string;
  start: ISODateTime;
  end?: ISODateTime | null;
  location?: string | null;
  allDay: boolean;
}

export interface CalendarImportResult {
  imported: number;
  skipped: number;
  summary: string;
}

/** 财务源按日聚合 */
export interface FinanceDaySummary {
  date: string;
  expense: number;
  income: number;
}

// ── 全域感知 · 辅助 Agent §6.7.3 ──────────────────────────────────

export type StewardDomain = "health" | "learning";

/**
 * 辅助 Agent 的统一输出。决策 #17：辅助 Agent 后台工作，
 * 输出由主小人一个声音转达（companionLine），界面不割裂。
 */
export interface StewardOutput {
  domain: StewardDomain;
  /** 2-3 句领域评估，引用具体数据 */
  assessment: string;
  /** 关切级别 */
  concernLevel: "good" | "watch" | "alert";
  /** 一个具体可执行的最小动作 */
  nudge: string;
  /** 主小人替它说的一句话（≤60字，统一汇总）*/
  companionLine: string;
}

/** 财务源周期汇总（喂红线检测 + 目标代价评估）*/
export interface FinanceSummary {
  periodDays: number;
  totalExpense: number;
  totalIncome: number;
  txnCount: number;
  topCategories: Array<{ category: string; amount: number }>;
  /** 冲动消费/红线风险信号 */
  impulseFlags: string[];
}

// ── 属性衰减 §8.1 ──────────────────────────────────────────────────

/** 每个属性维度的活跃元数据：最后活跃日 + 已应用的衰减档位 */
export interface AttributeMeta {
  lastActive: string; // YYYY-MM-DD，空串表示从未活跃
  tier: 0 | 1 | 2 | 3; // 已应用衰减档位：0=正常 1=7天 2=14天 3=30天
}

export type AttributeMetaSet = Record<AttributeKey, AttributeMeta>;

/** 衰减档位定义：空闲天数 → 一次性衰减比例（在跨越档位时应用）*/
export const DECAY_TIERS: ReadonlyArray<{ tier: 1 | 2 | 3; days: number; pct: number }> = [
  { tier: 1, days: 7, pct: 0.05 },
  { tier: 2, days: 14, pct: 0.1 },
  { tier: 3, days: 30, pct: 0.2 },
];

export interface AttributeDecayResult {
  /** 本次新发生衰减的维度 */
  decayed: Array<{ attribute: AttributeKey; tier: 1 | 2 | 3; pct: number; newValue: number }>;
  /** 新跨入 14 天档（tier 2），需要小人关怀的维度 */
  needsCare: AttributeKey[];
}

// ── 档案演化 §5.3 ──────────────────────────────────────────────────

export type ProfileFieldPath =
  | "basicInfo"
  | "traits"
  | "motivations"
  | "redLines"
  | "longTermVision";

export type ProfileChangeStatus = "pending" | "accepted" | "rejected" | "rolled_back";

export interface ProfileChangeProposal {
  id: string;
  field: ProfileFieldPath;
  /** 字段内的子键路径，如 "basicInfo.focus"；整字段替换时为空 */
  subPath?: string | null;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  confidence: number; // 0-1
  status: ProfileChangeStatus;
  createdAt: ISODateTime;
  resolvedAt?: ISODateTime | null;
}

/** Profile Agent 演化扫描的结构化输出 */
export interface ProfileEvolutionOutput {
  proposals: Array<{
    field: ProfileFieldPath;
    subPath?: string;
    currentValue: unknown;
    proposedValue: unknown;
    reason: string;
    confidence: number;
  }>;
}

/** 演化提议的风险分级（宿主档案子系统规划书 §8.1）。
 *  低风险=观测层自更新；中/高风险=必须宿主裁决（高风险=身份/红线/愿景）。*/
export type ProfileRiskTier = "low" | "medium" | "high";

export function profileFieldRiskTier(
  field: ProfileFieldPath,
  subPath?: string | null,
): ProfileRiskTier {
  if (field === "redLines" || field === "longTermVision" || field === "basicInfo") return "high";
  if (field === "traits" && subPath === "mbti") return "high";
  return "medium";
}

// ── 宿主档案 · 观测层（活体画像）宿主档案子系统规划书 §6 ───────────────

/** 观测层六维（画像「模式」，区别于六维属性「能力」）*/
export type ObservedDim = "rhythm" | "focus" | "drive" | "execution" | "discipline" | "creativity";

export const OBSERVED_DIM_KEYS: readonly ObservedDim[] = [
  "rhythm",
  "focus",
  "drive",
  "execution",
  "discipline",
  "creativity",
];

export const OBSERVED_DIM_LABELS: Record<ObservedDim, string> = {
  rhythm: "作息节律",
  focus: "专注模式",
  drive: "驱动来源",
  execution: "执行风格",
  discipline: "自律强度",
  creativity: "创造倾向",
};

export interface ObservedDimValue {
  /** 0..1，越高=该模式越强 */
  score: number;
  /** 0..1，证据充分度 */
  confidence: number;
  /** 证据条数 */
  sampleN: number;
  /** 人类可读注解（如「高峰在清晨」「平均专注 42 分钟」）*/
  note?: string;
}

export type MbtiAxisKey = "EI" | "SN" | "TF" | "JP";

export const MBTI_AXIS_KEYS: readonly MbtiAxisKey[] = ["EI", "SN", "TF", "JP"];

/** MBTI 单轴的行为证据（与自评基线并行，互不覆盖；规划书 §7.3）*/
export interface MbtiAxisEvidence {
  /** 当前证据偏向的极，如 "E" / "I"；证据不足时为空串 */
  lean: string;
  /** 0..1，朝向 lean 的强度 */
  score: number;
  /** 0..1 */
  confidence: number;
  sampleN: number;
}

/** 红线契合度（规划书 §6.2 / §5 数据模型）*/
export interface RedLineFit {
  line: string;
  /** 0..1，1=完全契合 */
  adherence: number;
  /** 观测窗内触碰次数 */
  breaches: number;
}

export type NetGrowthVerdict = "closer" | "neutral" | "further";

/** 观测层快照：每日落事件流（category="profile_observation"），最新一条即「活体画像」*/
export interface ProfileObservation {
  takenAt: ISODateTime;
  /** 观测窗口（天）*/
  windowDays: number;
  dimensions: Record<ObservedDim, ObservedDimValue>;
  mbtiEvidence: Record<MbtiAxisKey, MbtiAxisEvidence>;
  redLineFit: RedLineFit[];
  /** 对照长期愿景：今天比昨天更近/持平/更远 */
  netGrowthVerdict: NetGrowthVerdict;
  /** 观测窗内净增长均值（-100..100），周期评级的主信号 */
  netGrowthScore: number;
  source: "daily" | "deep-scan";
  engine: "deterministic" | "llm";
  summary: string;
}

// ── 宿主档案 · 周期评级（对齐导向：净增长为主，自律/连续/可信为辅）──────

export type ProfileGrade = "S" | "A" | "B" | "C" | "D";

export interface ProfileAssessmentInput {
  observation: ProfileObservation | null;
  /** 可信度 0..2（§6.1）*/
  credibility?: number;
  /** 当前最长连续天数 */
  longestStreak?: number;
}

export interface ProfileAssessment {
  grade: ProfileGrade;
  /** 综合分 0..1 */
  composite: number;
  /** 状态标签：状态优异 / 稳步推进 / 轻度懈怠 / 效率下滑 / 偏科明显 */
  statusLabel: string;
  statusTone: "good" | "watch" | "alert";
  verdict: NetGrowthVerdict;
  /** 最弱观测维（证据不足时为 null）*/
  weakestDim: ObservedDim | null;
  weakestLabel: string;
  /** 一行偏差摘要（hero 带主文案）*/
  headline: string;
  /** 评级输入因子，0..1，便于 UI 画小条 */
  factors: { netGrowth: number; discipline: number; streak: number; credibility: number };
}

const clamp01Local = (x: number): number =>
  Number.isFinite(x) ? Math.min(1, Math.max(0, x)) : 0;

/**
 * 宿主档案周期评级（纯函数，对齐导向）。
 * 主信号=净增长趋势（50%）；辅信号=自律(20%) / 连续力(15%) / 可信度(15%)。
 * 刻意不计「用功时长」，避免退化成机械打卡（禁区精神）。
 */
export function assessProfileGrade(input: ProfileAssessmentInput): ProfileAssessment {
  const obs = input.observation;
  const verdict: NetGrowthVerdict = obs?.netGrowthVerdict ?? "neutral";

  // 因子归一到 0..1
  const ng = clamp01Local(((obs?.netGrowthScore ?? 0) + 40) / 80); // -40→0, 0→0.5, +40→1
  const discipline = clamp01Local(obs?.dimensions.discipline.score ?? 0);
  const streak = clamp01Local((input.longestStreak ?? 0) / 30); // 30 天封顶
  const credibility = clamp01Local(((input.credibility ?? 1) - 0.5) / 1.0); // 1.0→0.5

  const composite = clamp01Local(
    0.5 * ng + 0.2 * discipline + 0.15 * streak + 0.15 * credibility,
  );

  const grade: ProfileGrade =
    composite >= 0.8 ? "S" : composite >= 0.65 ? "A" : composite >= 0.45 ? "B" : composite >= 0.3 ? "C" : "D";

  // 最弱观测维（仅在有证据的维里挑，避免把"没观测到"误判为"弱"）
  let weakestDim: ObservedDim | null = null;
  let weakestScore = Infinity;
  if (obs) {
    for (const key of OBSERVED_DIM_KEYS) {
      const d = obs.dimensions[key];
      if (d.confidence >= 0.2 && d.score < weakestScore) {
        weakestScore = d.score;
        weakestDim = key;
      }
    }
  }
  const weakestLabel = weakestDim ? OBSERVED_DIM_LABELS[weakestDim] : "证据不足";

  // 偏科判定：有证据维之间分差过大
  const scored = obs
    ? OBSERVED_DIM_KEYS.map((k) => obs.dimensions[k]).filter((d) => d.confidence >= 0.2)
    : [];
  const spread =
    scored.length >= 2
      ? Math.max(...scored.map((d) => d.score)) - Math.min(...scored.map((d) => d.score))
      : 0;

  let statusLabel: string;
  let statusTone: "good" | "watch" | "alert";
  if (!obs) {
    statusLabel = "尚无评级";
    statusTone = "watch";
  } else if (spread >= 0.55 && weakestScore < 0.3) {
    statusLabel = "偏科明显";
    statusTone = "watch";
  } else if (composite >= 0.75) {
    statusLabel = "状态优异";
    statusTone = "good";
  } else if (composite >= 0.55) {
    statusLabel = "稳步推进";
    statusTone = "good";
  } else if (verdict === "further" || composite < 0.32) {
    statusLabel = "效率下滑";
    statusTone = "alert";
  } else {
    statusLabel = "轻度懈怠";
    statusTone = "watch";
  }

  const verdictText = { closer: "更接近", neutral: "持平于", further: "更远离" }[verdict];
  const weakClause = weakestDim ? ` · 最弱「${weakestLabel}」` : "";
  const headline = obs
    ? `本期 ${grade} 级 · ${statusLabel}${weakClause} · 行为正${verdictText}理想人生`
    : "尚无评级，日终校准后自动生成";

  return {
    grade,
    composite,
    statusLabel,
    statusTone,
    verdict,
    weakestDim,
    weakestLabel,
    headline,
    factors: { netGrowth: ng, discipline, streak, credibility },
  };
}

// ── Decision Agent §8 / §9 ─────────────────────────────────────────

/** 今日净成长值：今天的行为对理想人生的净影响（-100..100）*/
export interface NetGrowthOutput {
  /** 净成长值，正=更接近理想人生，负=更远离 */
  netValue: number;
  /** 方向判定 */
  verdict: "closer" | "neutral" | "further";
  /** 正向贡献项 */
  positives: Array<{ label: string; weight: number }>;
  /** 负向消耗项 */
  negatives: Array<{ label: string; weight: number }>;
  /** 一句话结论，诚实不讨好 */
  summary: string;
}

export const NET_GROWTH_VERDICT_LABELS: Record<NetGrowthOutput["verdict"], string> = {
  closer: "更接近理想人生",
  neutral: "原地停留",
  further: "更远离理想人生",
};

// ── 每周/月报告 §9 ─────────────────────────────────────────────────

/** 周期报告的确定性统计部分（不经 LLM，纯数据聚合）*/
export interface PeriodStats {
  periodStart: string;
  periodEnd: string;
  tasksCompleted: number;
  tasksFailed: number;
  reviewsDone: number;
  /** 本周期内每次净成长值（按时间正序）*/
  netGrowthSeries: number[];
  netGrowthAvg: number | null;
  streaks: Array<{ category: StreakCategory; current: number; longest: number }>;
  attributeSnapshot: AttributeSet;
  /** 事件按 category 计数 */
  eventsByCategory: Record<string, number>;
  /** 待裁决的档案演化提议数 */
  pendingProposals: number;
  /** §6.7 多源滚动汇总（季度/年度报告用，无数据时缺省）*/
  healthRollup?: { activeDays: number; avgSteps: number; totalWorkoutMinutes: number };
  financeRollup?: { totalExpense: number; totalIncome: number; impulseSignals: number };
}

/** 周期报告的 LLM 叙事部分 */
export interface PeriodReportOutput {
  /** 一句话标题，概括这个周期 */
  headline: string;
  /** 2-4 句叙事，基于统计数据 */
  narrative: string;
  /** 最大的一个进展 */
  biggestWin: string;
  /** 最大的一处泄漏（时间/精力流失点）*/
  biggestLeak: string;
  /** 下个周期的唯一焦点建议 */
  nextFocus: string;
  /** 整体趋势 */
  trend: "up" | "flat" | "down";
}

export const PERIOD_TREND_LABELS: Record<PeriodReportOutput["trend"], string> = {
  up: "上升轨道",
  flat: "平台期",
  down: "下行预警",
};

/** 完整周期报告：统计 + 叙事 */
export interface PeriodReport {
  type: ReviewType;
  stats: PeriodStats;
  narrative: PeriodReportOutput;
  reviewId: string;
  createdAt: ISODateTime;
}

/** 选择前预测：多方案对比，预测各自对长期目标的影响 */
export interface ChoicePredictionOutput {
  options: Array<{
    label: string;
    /** 与目标/愿景的契合度 0-100 */
    alignmentScore: number;
    shortTermCost: string;
    longTermGain: string;
    risk: string;
  }>;
  /** 推荐哪个方案 + 理由 */
  recommendation: string;
  /** 若所有方案都偏离红线或愿景时的警示 */
  warning?: string;
}

/** 人生路线模拟：把一个决策推演成多条随时间展开的人生轨迹 */
export interface SimulatedPath {
  /** 路线名称 */
  label: string;
  /** 随时间展开的轨迹（如 3个月/1年/3年 三个时间点）*/
  trajectory: Array<{ horizon: string; state: string }>;
  /** 终局画像 */
  endState: string;
  /** 与理想人生的契合度 0-100 */
  alignmentScore: number;
  /** 这条路线的关键风险 */
  keyRisks: string[];
}

export interface PathSimulationOutput {
  paths: SimulatedPath[];
  /** 关键分叉点：决定走向的那个抉择 */
  divergencePoint: string;
  /** 综合建议 */
  recommendation: string;
}

export interface BrowserVisitSummary {
  url: string;
  title: string;
  visitTime: string;
  browser: "chrome" | "edge";
}

export interface AgentContext {
  userId: string;
  trigger: TriggerKind;
  message?: string;
  profileSummary: string;
  recentEvents: NexusEvent[];
  activeGoals: Goal[];
  currentTasks: Task[];
  screenActivity?: ScreenActivitySummary;
  browserVisits?: BrowserVisitSummary[];
  /** §6.7.2 全域感知：今日健康源（跨源自欺识别第 4 源）*/
  healthToday?: HealthDaySummary;
  /** §6.7.6 全域感知：近期财务源（红线/冲动消费校验第 5 源）*/
  financeRecent?: FinanceSummary;
  /** §6.7 全域感知：今日日历（晨间规划上下文 + 复盘客观锚点）*/
  calendarToday?: CalendarEvent[];
  /** §6.4 #12：本次调用的模型档位覆盖（宿主在重做时手动指定）*/
  modelTierOverride?: ModelTier;
  /** §6.4 #12：本次调用的具体模型名覆盖（如 deepseek-reasoner）*/
  modelOverride?: string;
}

export interface CompanionAction {
  companionId: string;
  state: CompanionState;
  dialogue: string;
}

export interface AgentResult {
  response?: string;
  structured?: Record<string, unknown>;
  events?: NexusEvent[];
  companionAction?: CompanionAction;
  safetyFlags?: string[];
  nextActions?: string[];
}
