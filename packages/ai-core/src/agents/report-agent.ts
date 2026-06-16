import type { AgentResult, PeriodReportOutput, PeriodStats, ReviewType } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, periodReportSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface PeriodReportInput {
  type: ReviewType;
  stats: PeriodStats;
  profileSummary: string;
}

/**
 * §9 周期报告 Agent：把确定性统计翻译成有意义的叙事。
 * 月度报告走 opus（更深的趋势洞察），周报走 sonnet。
 */
export class ReportAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(input: PeriodReportInput): Promise<{
    result: AgentResult;
    narrative: PeriodReportOutput;
  }> {
    const prompt = getAgentPrompt("period_report");
    const deepPeriods: ReviewType[] = ["monthly", "quarterly", "annual"];
    const modelTier = this.router.route({
      agentId: "review",
      trigger: "system",
      requiresDeepReasoning: deepPeriods.includes(input.type),
    });

    const response = await this.llm.complete({
      agentId: "review",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            periodType: input.type,
            profileSummary: input.profileSummary,
            stats: input.stats,
          }),
        },
      ],
      maxTokens: 1200,
    });

    const periodLabel: Record<ReviewType, string> = {
      daily: "今日",
      weekly: "本周",
      monthly: "本月",
      quarterly: "本季",
      annual: "本年",
    };
    const fallback: PeriodReportOutput = {
      headline: `${periodLabel[input.type]}已归档`,
      narrative: "本周期数据不足以形成深度结论。继续保持每日闭环，下个周期的报告会更有信息量。",
      biggestWin: "保持了系统的持续运转。",
      biggestLeak: "数据量偏少，暂无法定位主要泄漏。",
      nextFocus: "稳定每日的规划与校准节奏。",
      trend: "flat",
    };

    const { envelope } = parseStructuredOutput(
      "review",
      response.content,
      periodReportSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "report-agent",
      type: "agent_output",
      category: `${input.type}_report`,
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: envelope.data.headline,
        output: envelope.data,
        stats: input.stats,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.8,
      tags: ["report", input.type, envelope.data.trend],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });

    return {
      result: {
        response: `${envelope.data.headline}\n${envelope.data.narrative}`,
        structured: { periodReport: envelope.data, fallbackUsed: envelope.fallbackUsed },
        events: [event],
      },
      narrative: envelope.data,
    };
  }
}
