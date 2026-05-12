import type {
  AgentResult,
  Companion,
  Goal,
  NexusEvent,
  Profile,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
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
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<{ ok: boolean; offlineLlm: boolean }>("/health"),
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
  updateTask: (id: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence) =>
    request<Task>(`/tasks/${id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, evidence: { source: "desktop", ...(evidence ?? {}) } }),
    }),
};
