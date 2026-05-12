import type {
  AgentContext,
  Companion,
  CompanionAction,
  Goal,
  NexusEvent,
  Profile,
  Review,
  Task,
  TaskStatus,
} from "@nexus/shared";
import { describe, expect, it } from "vitest";
import type { LlmClient, LlmRequest, LlmResponse } from "../llm.js";
import { ModelRouter } from "../model-router.js";
import type { NexusTools } from "../tools.js";
import { CompanionAgent } from "./companion-agent.js";
import { PlanningAgent } from "./planning-agent.js";
import { ReviewAgent } from "./review-agent.js";

class StaticLlmClient implements LlmClient {
  constructor(private readonly content: string) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    return {
      content: this.content,
      model: `test-${request.modelTier}`,
      offline: true,
    };
  }
}

function createContext(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: "test-user",
    trigger: "morning_planning",
    message: "开始晨间规划",
    profileSummary: "长期愿景：保持真实推进",
    recentEvents: [],
    activeGoals: [],
    currentTasks: [],
    ...overrides,
  };
}

function createTools() {
  const tasks: Task[] = [];
  const events: NexusEvent[] = [];
  const reviews: Review[] = [];
  let companion: Companion = {
    id: "main",
    userId: "test-user",
    type: "main",
    currentForm: "test",
    personalityParams: { intimacy: 0.2, strictness: 0.4, trust: 0.5 },
    unlockedActions: [],
    unlockedSkins: [],
    currentState: "idle",
    currentDialogue: "",
    stateHistory: [],
  };
  const profile: Profile = {
    userId: "test-user",
    basicInfo: {},
    traits: {},
    motivations: {},
    redLines: [],
    longTermVision: {},
    updatedAt: new Date().toISOString(),
    version: 1,
  };

  const tools: NexusTools = {
    getUserProfile: () => profile,
    queryEvents: () => events,
    searchMemory: () => events,
    getActiveGoals: () => [],
    getCurrentTasks: () => tasks,
    logEvent: (event) => tools.unsafeLogEvent(event),
    unsafeLogEvent: (event) => {
      const next = {
        id: `event-${events.length + 1}`,
        userId: "test-user",
        ingestedAt: new Date().toISOString(),
        ...event,
      } as NexusEvent;
      events.push(next);
      return next;
    },
    createTask: (task) => {
      const next = {
        id: `task-${tasks.length + 1}`,
        userId: "test-user",
        source: task.source ?? "ai",
        title: task.title,
        description: task.description ?? "",
        difficulty: task.difficulty ?? 2,
        energyRequired: task.energyRequired ?? "medium",
        estimatedMinutes: task.estimatedMinutes ?? null,
        actualMinutes: null,
        rewardPoints: task.rewardPoints ?? 10,
        expRewards: {},
        acceptanceCriteria: task.acceptanceCriteria ?? "完成即可验收",
        proofMethod: task.proofMethod ?? "文字说明",
        status: task.status ?? "not_started",
        statusHistory: [],
        verifiedByAi: false,
      } as Task;
      tasks.push(next);
      return next;
    },
    createGoal: (goal) => goal as Goal,
    updateTaskStatus: (taskId: string, status: TaskStatus) => {
      const task = tasks.find((item) => item.id === taskId);
      if (!task) throw new Error("task missing");
      task.status = status;
      return task;
    },
    saveReview: (review) => {
      const next = {
        id: `review-${reviews.length + 1}`,
        userId: "test-user",
        createdAt: new Date().toISOString(),
        ...review,
      } as Review;
      reviews.push(next);
      return next;
    },
    getReview: (reviewId) => reviews.find((review) => review.id === reviewId) ?? null,
    triggerCompanion: (action: CompanionAction) => {
      companion = {
        ...companion,
        currentState: action.state,
        currentDialogue: action.dialogue,
      };
      return companion;
    },
    getCompanion: () => companion,
  };

  return { tools, tasks, events, reviews, getCompanion: () => companion };
}

describe("structured agents", () => {
  it("creates tasks from valid Planning JSON", async () => {
    const { tools, tasks } = createTools();
    const llm = new StaticLlmClient(
      JSON.stringify({
        data: {
          planTitle: "今日协议",
          rationale: "少而精",
          tasks: [
            {
              title: "写 300 字复盘",
              description: "校准昨天的偏离",
              energyRequired: "low",
              estimatedMinutes: 20,
              acceptanceCriteria: "完成 300 字",
              proofMethod: "文字",
              rewardPoints: 8,
            },
            {
              title: "推进核心任务",
              description: "45 分钟专注",
              energyRequired: "medium",
              estimatedMinutes: 45,
              acceptanceCriteria: "有产出",
              proofMethod: "截图或文字",
              rewardPoints: 15,
            },
          ],
          risks: [],
        },
      }),
    );
    const agent = new PlanningAgent(llm, new ModelRouter(), tools);

    const result = await agent.run(createContext());

    expect(tasks).toHaveLength(2);
    expect(tasks[0]?.title).toBe("写 300 字复盘");
    expect(result.structured?.planning).toBeTruthy();
  });

  it("uses Planning fallback for non-JSON output", async () => {
    const { tools, tasks } = createTools();
    const agent = new PlanningAgent(new StaticLlmClient("not json"), new ModelRouter(), tools);

    const result = await agent.run(createContext());

    expect(tasks).toHaveLength(1);
    expect(result.response).toContain("今日执行协议");
    expect(JSON.stringify(result.structured)).toContain("fallbackUsed");
  });

  it("saves structured Review output", async () => {
    const { tools, reviews } = createTools();
    const agent = new ReviewAgent(
      new StaticLlmClient(
        JSON.stringify({
          data: {
            summary: "今天完成了真实推进。",
            honestDelta: "偏离来自开始太晚。",
            risks: ["明天不要堆任务"],
            tomorrowAdjustment: "先做 20 分钟最小块。",
            emotionTags: ["focused"],
          },
        }),
      ),
      new ModelRouter(),
      tools,
    );

    const result = await agent.run(createContext({ trigger: "daily_review" }));

    expect(reviews).toHaveLength(1);
    expect(reviews[0]?.aiAnalysis.summary).toBe("今天完成了真实推进。");
    expect(result.response).toContain("真实偏差");
  });

  it("falls back to idle when Companion returns invalid state", async () => {
    const { tools, getCompanion } = createTools();
    const agent = new CompanionAgent(
      new StaticLlmClient(
        JSON.stringify({
          data: {
            state: "impossible-state",
            dialogue: "这句话会被保留，但状态要回退。",
          },
        }),
      ),
      new ModelRouter(),
      tools,
    );

    await agent.run(createContext({ trigger: "user_message" }));

    expect(getCompanion().currentState).toBe("idle");
    expect(getCompanion().currentDialogue).toBe("这句话会被保留，但状态要回退。");
  });
});
