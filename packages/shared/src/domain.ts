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

export interface CompanionOutput {
  state: CompanionState;
  dialogue: string;
}

export interface SafetyOutput {
  safe: boolean;
  flags: string[];
  responseOverride?: string;
}

export interface User {
  id: string;
  createdAt: ISODateTime;
  currentLevel: number;
  totalExp: number;
  credibilityScore: number;
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

export interface AgentContext {
  userId: string;
  trigger: TriggerKind;
  message?: string;
  profileSummary: string;
  recentEvents: NexusEvent[];
  activeGoals: Goal[];
  currentTasks: Task[];
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
