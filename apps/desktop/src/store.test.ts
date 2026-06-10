import type { Companion, Goal, NexusEvent, Profile, Review, Task } from "@nexus/shared";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMock = vi.hoisted(() => ({
  health: vi.fn(),
  user: vi.fn(),
  profile: vi.fn(),
  goals: vi.fn(),
  tasks: vi.fn(),
  events: vi.fn(),
  latestReview: vi.fn(),
  companion: vi.fn(),
  awStatus: vi.fn(),
  sendChat: vi.fn(),
  morningPlan: vi.fn(),
  dailyReview: vi.fn(),
  updateTask: vi.fn(),
  weeklyInsight: vi.fn(),
  coachSession: vi.fn(),
  reminderCheck: vi.fn(),
}));

vi.mock("./api", () => ({ api: apiMock }));

import { useNexusStore } from "./store";

const profile: Profile = {
  userId: "desktop-test-host",
  basicInfo: {},
  traits: {},
  motivations: {},
  redLines: [],
  longTermVision: { statement: "保持闭环" },
  updatedAt: "2026-05-11T00:00:00.000Z",
  version: 1,
};

const task: Task = {
  id: "task-1",
  userId: "desktop-test-host",
  goalId: null,
  source: "ai",
  title: "提交证据",
  description: "验证桌面端证据流",
  type: "growth",
  difficulty: 2,
  energyRequired: "medium",
  estimatedMinutes: 20,
  actualMinutes: null,
  rewardPoints: 10,
  expRewards: { focus: 5 },
  failurePenalty: null,
  acceptanceCriteria: "证据字段发送成功",
  proofMethod: "store 测试",
  scheduledAt: "2026-05-11T00:00:00.000Z",
  startedAt: null,
  completedAt: null,
  status: "not_started",
  statusHistory: [{ status: "not_started", at: "2026-05-11T00:00:00.000Z" }],
  evidence: {},
  verifiedByAi: false,
};

const review: Review = {
  id: "review-1",
  userId: "desktop-test-host",
  type: "daily",
  scopeStart: "2026-05-11T00:00:00.000Z",
  scopeEnd: "2026-05-11T23:59:59.000Z",
  subjective: {},
  objective: {},
  aiAnalysis: {
    summary: "今天有真实推进。",
    honestDelta: "偏差已记录。",
    risks: ["拖延"],
    tomorrowAdjustment: "保留 20 分钟推进块。",
  },
  suggestedAdjustments: { tomorrow: "保留 20 分钟推进块。" },
  emotionTags: ["calibration"],
  credibilityCheck: "ok",
  createdAt: "2026-05-11T23:59:59.000Z",
};

const companion: Companion = {
  id: "main",
  userId: "desktop-test-host",
  type: "main",
  currentForm: "cubism-sample",
  personalityParams: { intimacy: 0.2, strictness: 0.4, trust: 0.5 },
  unlockedActions: ["idle"],
  unlockedSkins: ["default"],
  currentState: "idle",
  currentDialogue: "NEXUS-7 已待命。",
  stateHistory: [],
};

const user = {
  id: "desktop-test-host",
  createdAt: "2026-05-11T00:00:00.000Z",
  currentLevel: 1,
  totalExp: 0,
  credibilityScore: 1,
  energyPoints: 0,
  attributes: { intellect: 0, stamina: 0, focus: 0, willpower: 0, creativity: 0, order: 0 },
};

function mockRefreshPayload(
  overrides: Partial<{ tasks: Task[]; latestReview: Review | null }> = {},
) {
  apiMock.health.mockResolvedValue({ ok: true, offlineLlm: true });
  apiMock.user.mockResolvedValue(user);
  apiMock.profile.mockResolvedValue(profile);
  apiMock.goals.mockResolvedValue([] satisfies Goal[]);
  apiMock.tasks.mockResolvedValue(overrides.tasks ?? [task]);
  apiMock.events.mockResolvedValue([] satisfies NexusEvent[]);
  apiMock.latestReview.mockResolvedValue(overrides.latestReview ?? review);
  apiMock.companion.mockResolvedValue(companion);
  apiMock.awStatus.mockResolvedValue({ connected: false });
}

describe("nexus desktop store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mockRefreshPayload();
  });

  it("loads latest review during refresh", async () => {
    const store = useNexusStore();

    await store.refresh();

    expect(apiMock.latestReview).toHaveBeenCalledTimes(1);
    expect(store.latestReview?.id).toBe("review-1");
    expect(store.tasks).toHaveLength(1);
  });

  it("sends evidence when updating task status", async () => {
    const store = useNexusStore();
    apiMock.updateTask.mockResolvedValue({ ...task, status: "completed" });

    await store.updateTaskStatus("task-1", "completed", {
      note: "证据已提交",
      proofLink: "https://example.test/desktop",
      actualMinutes: 16,
      source: "desktop",
    });

    expect(apiMock.updateTask).toHaveBeenCalledWith("task-1", "completed", {
      note: "证据已提交",
      proofLink: "https://example.test/desktop",
      actualMinutes: 16,
      source: "desktop",
    });
    expect(apiMock.latestReview).toHaveBeenCalledTimes(1);
  });
});
