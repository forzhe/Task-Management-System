import type { AgentResult, StreakCategory, UserStreak } from "@nexus/shared";
import { STREAK_LABELS } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, streakMessageSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface StreakMilestoneInput {
  streak: UserStreak;
  milestone: number;
}

export interface StreakBreakInput {
  streak: UserStreak;
  previousLength: number;
}

/**
 * §6.6.2 主动洞察触发器：
 * - 里程碑微洞察（haiku 档，一句话，必须引用历史）
 * - 断链分析（sonnet 档，3 句以内，给最小重启动作）
 */
export class StreakAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async runMilestone(input: StreakMilestoneInput): Promise<AgentResult> {
    const prompt = getAgentPrompt("streak_milestone");
    const label = STREAK_LABELS[input.streak.category];

    const response = await this.llm.complete({
      agentId: "insight",
      modelTier: "haiku",
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            category: label,
            currentStreak: input.milestone,
            longestStreak: input.streak.longestStreak,
            pastBreaks: input.streak.brokenAt.slice(-3),
          }),
        },
      ],
      maxTokens: 300,
    });

    const fallback = {
      message: `${label}已连续 ${input.milestone} 天。历史最长 ${input.streak.longestStreak} 天。`,
    };
    const { envelope } = parseStructuredOutput(
      "insight",
      response.content,
      streakMessageSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "streak-agent",
      type: "agent_output",
      category: "streak_milestone",
      rawPayload: { ...toLlmTrace(response, prompt.version), milestone: input.milestone },
      structured: {
        summary: envelope.data.message,
        category: input.streak.category,
        milestone: input.milestone,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["streak", "milestone", input.streak.category],
      relatedGoalIds: input.streak.goalId ? [input.streak.goalId] : [],
      relatedTaskIds: [],
    });

    // 小人庆祝状态 + 微洞察台词
    const companion = this.tools.getCompanion();
    this.tools.triggerCompanion({
      companionId: companion.id,
      state: "celebrating",
      dialogue: envelope.data.message,
    });

    return {
      response: envelope.data.message,
      structured: { milestone: input.milestone, streak: input.streak },
      events: [event],
    };
  }

  async runBreakAnalysis(input: StreakBreakInput): Promise<AgentResult> {
    const prompt = getAgentPrompt("streak_break");
    const label = STREAK_LABELS[input.streak.category];
    const recentEvents = this.tools.queryEvents(30);

    const response = await this.llm.complete({
      agentId: "insight",
      modelTier: "sonnet",
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            category: label,
            brokenStreakLength: input.previousLength,
            longestStreak: input.streak.longestStreak,
            pastBreaks: input.streak.brokenAt.slice(-5),
            recentEvents: recentEvents.slice(0, 15).map((e) => ({
              category: e.category,
              occurredAt: e.occurredAt,
              summary: typeof e.structured.summary === "string" ? e.structured.summary : null,
            })),
          }),
        },
      ],
      maxTokens: 500,
    });

    const fallback = {
      message: `${label}链在 ${input.previousLength} 天后断裂。历史最长 ${input.streak.longestStreak} 天仍然有效。明天完成一次最小动作即可重启。`,
    };
    const { envelope } = parseStructuredOutput(
      "insight",
      response.content,
      streakMessageSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "streak-agent",
      type: "agent_output",
      category: "streak_break",
      rawPayload: { ...toLlmTrace(response, prompt.version), previousLength: input.previousLength },
      structured: {
        summary: envelope.data.message,
        category: input.streak.category,
        previousLength: input.previousLength,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["streak", "break", input.streak.category],
      relatedGoalIds: input.streak.goalId ? [input.streak.goalId] : [],
      relatedTaskIds: [],
    });

    const companion = this.tools.getCompanion();
    this.tools.triggerCompanion({
      companionId: companion.id,
      state: "caring",
      dialogue: envelope.data.message.slice(0, 80),
    });

    return {
      response: envelope.data.message,
      structured: { previousLength: input.previousLength, streak: input.streak },
      events: [event],
    };
  }
}

export type { StreakCategory };
