import type {
  AgentResult,
  Companion,
  Goal,
  GoalStatus,
  NexusEvent,
  Profile,
  ProfileUpdateInput,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
} from "@nexus/shared";

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
};
