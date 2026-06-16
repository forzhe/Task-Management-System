import type {
  AgentResult,
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
  ProfileChangeProposal,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
  UserStreak,
} from "@nexus/shared";

export type NetGrowthSnapshot = NetGrowthOutput & { at: string };

const API_BASE = import.meta.env.VITE_NEXUS_API_BASE ?? "http://127.0.0.1:3737";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`NEXUS API ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}

export const api = {
  health: () => request<{ ok: boolean; offlineLlm: boolean }>("/health"),
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
  morningPlan: () =>
    request<AgentResult>("/chat/send", {
      method: "POST",
      body: JSON.stringify({ message: "开始晨间规划", trigger: "morning_planning" }),
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
