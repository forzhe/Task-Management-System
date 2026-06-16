import type { AgentContext, AgentResult, HealthDaySummary, StewardOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, stewardOutputSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface HealthStewardInput {
  recentHealth: HealthDaySummary[];
  staminaValue: number;
  staminaLastActive: string;
}

/**
 * §6.7.3 健康管家（首个辅助 Agent）。专精身体维度。
 * 决策 #17：辅助 Agent 后台工作，其发现由主小人一个声音转达 —— 本 Agent
 * 不创建独立小人，而是通过 triggerCompanion 让主小人说出 companionLine。
 */
export class HealthStewardAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(
    context: AgentContext,
    input: HealthStewardInput,
    opts?: { speak?: boolean },
  ): Promise<AgentResult> {
    const speak = opts?.speak ?? true;
    const prompt = getAgentPrompt("health_steward");
    const modelTier = this.router.route({ agentId: "steward", trigger: context.trigger });

    const response = await this.llm.complete({
      agentId: "steward",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            healthGoals: context.activeGoals
              .filter((g) => /健康|运动|减|睡|身材|跑|健身/.test(g.title))
              .map((g) => g.title),
            recentHealth: input.recentHealth,
            staminaValue: input.staminaValue,
            staminaLastActive: input.staminaLastActive,
          }),
        },
      ],
      maxTokens: 700,
    });

    const fallback: StewardOutput = {
      domain: "health",
      assessment: "健康数据偏少，暂时无法形成可靠评估。",
      concernLevel: "watch",
      nudge: "导入近 14 天的运动/睡眠数据，让我看清你的身体节律。",
      companionLine: "我还看不清你身体的状态——给我点健康数据，我替你盯着。",
    };
    const { envelope } = parseStructuredOutput(
      "steward",
      response.content,
      stewardOutputSchema,
      fallback,
    );
    const data = envelope.data;

    // 主小人统一转达：健康管家不独立发声。sweep 汇总模式下 speak=false，由编排层合并发声。
    const companion = this.tools.getCompanion();
    const state = data.concernLevel === "alert" ? "caring" : "focus";
    if (speak) {
      this.tools.triggerCompanion({ companionId: companion.id, state, dialogue: data.companionLine });
    }

    const event = this.tools.logEvent({
      source: "health-steward",
      type: "agent_output",
      category: "steward_health",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: data.assessment,
        output: data,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.8,
      tags: ["steward", "health", data.concernLevel],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: data.assessment,
      structured: { steward: data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
      companionAction: { companionId: companion.id, state, dialogue: data.companionLine },
    };
  }
}
