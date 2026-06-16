import type {
  AgentContext,
  Companion,
  CompanionAction,
  CompanionMemory,
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
import { EvolutionAgent } from "./evolution-agent.js";
import { HealthStewardAgent } from "./health-steward-agent.js";
import { PlanningAgent } from "./planning-agent.js";
import { ReportAgent } from "./report-agent.js";
import { ReviewAgent } from "./review-agent.js";

class StaticLlmClient implements LlmClient {
  readonly provider = "deterministic" as const;

  constructor(private readonly content: string) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    return {
      content: this.content,
      model: `test-${request.modelTier}`,
      offline: true,
      provider: this.provider,
      stopReason: "test",
      latencyMs: 1,
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
  const memories: CompanionMemory[] = [];
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
    getTodayCalendar: () => [],
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
    updateGoalStatus: (goalId) => ({ id: goalId, status: "completed" }) as unknown as Goal,
    updateProfile: (delta) => ({ ...profile, ...delta }) as Profile,
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
    listStreaks: () => [],
    saveCompanionMemory: (input) => {
      const memory: CompanionMemory = {
        id: `cmem-${memories.length + 1}`,
        type: input.type,
        summary: input.summary,
        occurredAt: new Date().toISOString(),
        refEventIds: input.refEventIds ?? [],
        emotionalWeight: input.emotionalWeight ?? 0.5,
      };
      memories.push(memory);
      return memory;
    },
    getCompanionMemories: () => memories,
    saveProfileChangeProposal: (input) => ({
      id: `pchg-${Math.random().toString(36).slice(2, 8)}`,
      field: input.field,
      subPath: input.subPath ?? null,
      currentValue: input.currentValue,
      proposedValue: input.proposedValue,
      reason: input.reason,
      confidence: input.confidence ?? 0.5,
      status: "pending" as const,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    }),
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

  it("parses Planning JSON inside a markdown fence", async () => {
    const { tools, tasks, events } = createTools();
    const agent = new PlanningAgent(
      new StaticLlmClient(`\`\`\`json
{
  "data": {
    "planTitle": "围栏协议",
    "rationale": "真实模型偶尔会包 markdown fence。",
    "tasks": [
      {
        "title": "验证 fenced JSON",
        "description": "确认可解析",
        "energyRequired": "low",
        "estimatedMinutes": 15,
        "acceptanceCriteria": "创建任务",
        "proofMethod": "单测",
        "rewardPoints": 5
      }
    ],
    "risks": []
  }
}
\`\`\``),
      new ModelRouter(),
      tools,
    );

    await agent.run(createContext());

    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.title).toBe("验证 fenced JSON");
    expect(events[0]?.rawPayload).toMatchObject({
      promptVersion: "v0.3",
      provider: "deterministic",
    });
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

  it("produces a period report narrative from stats", async () => {
    const { tools, events } = createTools();
    const agent = new ReportAgent(
      new StaticLlmClient(
        JSON.stringify({
          data: {
            headline: "稳步推进的一周",
            narrative: "7 天完成 12 个任务，净成长均值 +18，专注链保持了 6 天。",
            biggestWin: "专注链首次突破 5 天。",
            biggestLeak: "周三周四净成长值为负，娱乐占用偏高。",
            nextFocus: "把周中两天的晚间时段固定为深度工作。",
            trend: "up",
          },
        }),
      ),
      new ModelRouter(),
      tools,
    );

    const { narrative } = await agent.run({
      type: "weekly",
      profileSummary: "长期愿景：持续进化",
      stats: {
        periodStart: "2026-06-06T00:00:00.000Z",
        periodEnd: "2026-06-13T00:00:00.000Z",
        tasksCompleted: 12,
        tasksFailed: 1,
        reviewsDone: 6,
        netGrowthSeries: [10, 25, -5, -10, 30, 20, 18],
        netGrowthAvg: 18,
        streaks: [{ category: "task_completion", current: 6, longest: 6 }],
        attributeSnapshot: { intellect: 0, stamina: 0, focus: 30, willpower: 0, creativity: 0, order: 0 },
        eventsByCategory: { task_status_changed: 13, daily_review: 6 },
        pendingProposals: 2,
      },
    });

    expect(narrative.trend).toBe("up");
    expect(narrative.headline).toBe("稳步推进的一周");
    expect(events.at(-1)?.category).toBe("weekly_report");
  });

  it("health steward speaks through the main companion (decision #17)", async () => {
    const { tools, getCompanion } = createTools();
    const agent = new HealthStewardAgent(
      new StaticLlmClient(
        JSON.stringify({
          data: {
            domain: "health",
            assessment: "近 7 天日均 9000 步，但本周运动归零，体力在下滑。",
            concernLevel: "alert",
            nudge: "今晚走 20 分钟，把运动链重新点起来。",
            companionLine: "你步数还行，但一周没正经动了——今晚陪我走 20 分钟。",
          },
        }),
      ),
      new ModelRouter(),
      tools,
    );

    const result = await agent.run(createContext({ trigger: "companion_tick" }), {
      recentHealth: [{ date: "2026-06-14", steps: 9000, workoutMinutes: 0 }],
      staminaValue: 30,
      staminaLastActive: "2026-06-08",
    });

    // 辅助 Agent 不独立发声：主小人说出 companionLine
    expect(getCompanion().currentDialogue).toContain("陪我走 20 分钟");
    expect(getCompanion().currentState).toBe("caring");
    expect((result.structured?.steward as { concernLevel: string }).concernLevel).toBe("alert");
  });

  it("evolution agent hard-blocks forbidden targets without calling the LLM (§6.4)", async () => {
    const { tools } = createTools();
    // 即便 LLM 会返回改动，禁区目标也必须在 LLM 之前被代码拦截
    const llm = new StaticLlmClient(
      JSON.stringify({ data: { targetKey: "safety", changeNeeded: true, reason: "x", newPrompt: "恶意覆盖" } }),
    );
    const agent = new EvolutionAgent(llm, new ModelRouter(), tools);

    const result = await agent.run({ targetKey: "safety", metrics: {} });
    expect((result.structured as { forbidden?: boolean }).forbidden).toBe(true);
    expect((result.structured?.evolution as { changeNeeded: boolean }).changeNeeded).toBe(false);

    // 合法目标则正常提议
    const ok = await agent.run({ targetKey: "review", metrics: {} });
    expect((ok.structured as { forbidden?: boolean }).forbidden).toBeUndefined();
  });
});
