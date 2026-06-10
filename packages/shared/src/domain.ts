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

export interface ProfileUpdateInput {
  basicInfo?: Record<string, unknown>;
  traits?: Record<string, unknown>;
  motivations?: Record<string, unknown>;
  redLines?: string[];
  longTermVision?: Record<string, unknown>;
}

export type EnergyLevel = "low" | "medium" | "high";
export type ReviewType = "daily" | "weekly" | "monthly" | "quarterly";

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
