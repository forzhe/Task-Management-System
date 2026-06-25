import type {
  AgentResult,
  BountyActionResult,
  BountyProposeResult,
  BountyView,
  CalendarEvent,
  CalendarImportResult,
  ChoicePredictionOutput,
  Companion,
  DataImportResult,
  DeepAnalysis,
  Divergence,
  EvolutionProposal,
  FinanceSummary,
  Goal,
  GoalStatus,
  HealthDaySummary,
  ModelTier,
  NetGrowthOutput,
  NexusEvent,
  PeriodReport,
  Profile,
  ProfileUpdateInput,
  RelationshipGraph,
  Review,
  ShopPurchaseResult,
  ShopView,
  StewardOutput,
  Task,
  TaskEditInput,
  ProfileChangeProposal,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
  UserStreak,
} from "@nexus/shared";

export type NetGrowthSnapshot = NetGrowthOutput & { at: string };
export interface DayData {
  date: string;
  tasks: Task[];
  events: NexusEvent[];
  reviews: Review[];
}
export interface PlanModelOverride {
  modelTier?: ModelTier;
  model?: string;
}

import { ref } from "vue";

const API_BASE = import.meta.env.VITE_NEXUS_API_BASE ?? "http://127.0.0.1:3737";

/**
 * 全局在途请求计数：每个后端调用都经过 request()，进出时增减。
 * 顶部进度条据此显示——任何按钮触发的异步操作都会有反馈，用户不再空等。
 */
export const pendingRequests = ref(0);
export const isBusy = ref(false);

// 隐藏防抖：动作结束到后续 refresh 之间常有微小空档，留 180ms 缓冲避免进度条闪烁。
let hideTimer: ReturnType<typeof setTimeout> | null = null;
function syncBusy(): void {
  if (pendingRequests.value > 0) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    isBusy.value = true;
  } else if (!hideTimer) {
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (pendingRequests.value === 0) isBusy.value = false;
    }, 180);
  }
}

/** 把服务端返回的相对资源路径（如 /uploads/xxx.png）拼成可直接显示的完整地址 */
export const assetUrl = (path: string): string =>
  path.startsWith("http") || path.startsWith("data:") ? path : `${API_BASE}${path}`;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  pendingRequests.value += 1;
  syncBusy();
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      ...init,
    });
    if (!response.ok) {
      throw new Error(`NEXUS API ${response.status}: ${await response.text()}`);
    }
    const text = await response.text();
    return (text ? JSON.parse(text) : null) as T;
  } finally {
    pendingRequests.value = Math.max(0, pendingRequests.value - 1);
    syncBusy();
  }
}

export const api = {
  health: () => request<{ ok: boolean; offlineLlm: boolean; llmProvider: string }>("/health"),
  user: () => request<User>("/user"),
  awStatus: () =>
    request<{
      connected: boolean;
      focusMinutes?: number;
      distractMinutes?: number;
      totalActiveMinutes?: number;
    }>("/activity-watch/status"),
  profile: () => request<Profile>("/profile"),
  goals: () => request<Goal[]>("/goals"),
  tasks: () => request<Task[]>("/tasks"),
  events: () => request<NexusEvent[]>("/events/query?limit=12"),
  latestReview: () => request<Review | null>("/reviews/latest?type=daily"),
  companion: () => request<Companion>("/companion/state"),
  sendChat: (message: string) =>
    request<AgentResult>("/chat/send", {
      method: "POST",
      body: JSON.stringify({ message }),
    }),
  morningPlan: (override?: PlanModelOverride) =>
    request<AgentResult>("/chat/send", {
      method: "POST",
      body: JSON.stringify({
        message: "开始晨间规划",
        trigger: "morning_planning",
        ...(override ?? {}),
      }),
    }),
  dailyReview: (note: string) =>
    request<AgentResult>("/reviews/daily", {
      method: "POST",
      body: JSON.stringify({ note }),
    }),
  createGoal: (body: Pick<Goal, "title" | "level"> & Partial<Goal>) =>
    request<Goal>("/goals", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateGoalStatus: (id: string, status: GoalStatus) =>
    request<Goal>(`/goals/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    }),
  updateProfile: (body: ProfileUpdateInput) =>
    request<Profile>("/profile", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  updateTask: (id: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence) =>
    request<Task>(`/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, evidence: { source: "desktop", ...(evidence ?? {}) } }),
    }),
  // §6.7 数据管理 / #12 计划编辑
  editTask: (id: string, patch: TaskEditInput) =>
    request<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),
  // 番茄钟「深度协议」：记录一段专注 → 累加 actualMinutes + 专注力 XP
  recordFocusSession: (id: string, minutes: number) =>
    request<{ ok: boolean; focusXp?: number; error?: string }>(`/tasks/${id}/focus-session`, {
      method: "POST",
      body: JSON.stringify({ minutes }),
    }),
  deleteTask: (id: string) =>
    request<{ ok: boolean }>(`/tasks/${id}`, { method: "DELETE" }),
  deleteEvent: (id: string) =>
    request<{ ok: boolean }>(`/events/${id}`, { method: "DELETE" }),
  deleteReview: (id: string) =>
    request<{ ok: boolean }>(`/reviews/${id}`, { method: "DELETE" }),
  dayData: (date: string) => request<DayData>(`/data/day?date=${encodeURIComponent(date)}`),
  // #10 证据图片：上传 base64 data URL，返回 { url: "/uploads/..." }
  uploadImage: (dataUrl: string, filename?: string) =>
    request<{ url: string }>("/uploads", {
      method: "POST",
      body: JSON.stringify({ dataUrl, filename }),
    }),
  weeklyInsight: () =>
    request<AgentResult>("/insights/weekly", { method: "POST", body: "{}" }),
  coachSession: (
    goalTitle: string,
    userAnswer: string,
    previousExchanges: Array<{ question: string; answer: string }> = [],
  ) =>
    request<AgentResult>("/coach/session", {
      method: "POST",
      body: JSON.stringify({ goalTitle, userAnswer, previousExchanges }),
    }),
  reminderCheck: () =>
    request<AgentResult>("/reminders/check", { method: "POST", body: "{}" }),
  streaks: () => request<UserStreak[]>("/streaks"),
  profileChanges: () =>
    request<ProfileChangeProposal[]>("/profile/changes?status=pending"),
  runProfileEvolution: () =>
    request<AgentResult>("/profile/evolution/scan", { method: "POST", body: "{}" }),
  resolveProfileChange: (id: string, accept: boolean) =>
    request<{ proposal: ProfileChangeProposal }>(`/profile/changes/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ accept }),
    }),
  netGrowth: () => request<NetGrowthSnapshot | null>("/decision/net-growth"),
  runNetGrowth: () =>
    request<AgentResult>("/decision/net-growth", { method: "POST", body: "{}" }),
  predictChoice: (question: string, options: string[]) =>
    request<AgentResult>("/decision/predict", {
      method: "POST",
      body: JSON.stringify({ question, options }),
    }),
  latestReport: (type = "weekly") =>
    request<PeriodReport | null>(`/reports/latest?type=${type}`),
  runReport: (type: "weekly" | "monthly" | "quarterly" | "annual") =>
    request<PeriodReport>(`/reports/${type}`, { method: "POST", body: "{}" }),
  graph: () => request<RelationshipGraph>("/graph"),
  simulatePath: (scenario: string, paths: string[]) =>
    request<AgentResult>("/decision/simulate-path", {
      method: "POST",
      body: JSON.stringify({ scenario, paths }),
    }),
  importHealth: (csv: string) =>
    request<DataImportResult>("/data/health/import", {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
  recentHealth: () => request<HealthDaySummary[]>("/data/health/recent?days=14"),
  importFinance: (csv: string) =>
    request<DataImportResult>("/data/finance/import", {
      method: "POST",
      body: JSON.stringify({ csv }),
    }),
  financeSummary: () => request<FinanceSummary | null>("/data/finance/summary"),
  importCalendar: (ics: string) =>
    request<CalendarImportResult>("/data/calendar/import", {
      method: "POST",
      body: JSON.stringify({ ics }),
    }),
  upcomingCalendar: () => request<CalendarEvent[]>("/data/calendar/upcoming?days=7"),
  healthSteward: () =>
    request<AgentResult>("/agents/health-steward", { method: "POST", body: "{}" }),
  learningSteward: () =>
    request<AgentResult>("/agents/learning-steward", { method: "POST", body: "{}" }),
  stewardSweep: (force = true) =>
    request<{ outputs: StewardOutput[]; companionLine: string; domains: string[]; skipped: boolean }>(
      "/agents/steward-sweep",
      { method: "POST", body: JSON.stringify({ force }) },
    ),
  divergences: () => request<Divergence[]>("/divergences"),
  openDivergence: (claim: string, evidence: string, domain?: string) =>
    request<Divergence>("/divergences", {
      method: "POST",
      body: JSON.stringify({ claim, evidence, domain }),
    }),
  resolveDivergence: (id: string, outcome: "confirmed" | "refuted" | "withdrawn", note?: string) =>
    request<Divergence>(`/divergences/${id}/resolve`, {
      method: "POST",
      body: JSON.stringify({ outcome, note }),
    }),
  deepAnalysis: () => request<DeepAnalysis>("/analysis/deep"),
  shop: () => request<ShopView>("/shop"),
  purchaseShopItem: (itemId: string) =>
    request<ShopPurchaseResult>("/shop/purchase", {
      method: "POST",
      body: JSON.stringify({ itemId }),
    }),
  equipSkin: (skinId: string) =>
    request<{ equipped: string }>("/shop/equip", {
      method: "POST",
      body: JSON.stringify({ skinId }),
    }),
  // 自定义悬赏与 AI 定价（商城子系统）
  bounties: () => request<BountyView>("/bounties"),
  proposeBounty: (title: string, hostNote?: string, referenceCny?: number) =>
    request<BountyProposeResult>("/bounties", {
      method: "POST",
      body: JSON.stringify({ title, hostNote, referenceCny }),
    }),
  redeemBounty: (id: string) =>
    request<BountyActionResult>(`/bounties/${id}/redeem`, { method: "POST", body: "{}" }),
  fulfillBounty: (id: string, evidenceRef?: string) =>
    request<BountyActionResult>(`/bounties/${id}/fulfill`, {
      method: "POST",
      body: JSON.stringify({ evidenceRef }),
    }),
  abandonBounty: (id: string) =>
    request<BountyActionResult>(`/bounties/${id}/abandon`, { method: "POST", body: "{}" }),
  evolution: () => request<EvolutionProposal[]>("/evolution"),
  runEvolution: (targetKey: string) =>
    request<AgentResult>("/evolution/scan", {
      method: "POST",
      body: JSON.stringify({ targetKey }),
    }),
  applyEvolution: (id: string) =>
    request<{ ok: boolean; error?: string }>(`/evolution/${id}/apply`, { method: "POST", body: "{}" }),
  rollbackEvolution: (id: string) =>
    request<{ ok: boolean }>(`/evolution/${id}/rollback`, { method: "POST", body: "{}" }),
  rejectEvolution: (id: string) =>
    request<{ ok: boolean }>(`/evolution/${id}/reject`, { method: "POST", body: "{}" }),
};

export type { ChoicePredictionOutput };
