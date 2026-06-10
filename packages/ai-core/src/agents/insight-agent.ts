import type { AgentContext, AgentResult, InsightOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { insightOutputSchema, parseStructuredOutput } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export class InsightAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const prompt = getAgentPrompt("insight");
    const modelTier = this.router.route({
      agentId: "insight",
      trigger: context.trigger,
      requiresDeepReasoning: true,
    });

    // 拉取更多历史事件用于长期模式分析
    const longHistory = this.tools.queryEvents(100);

    const response = await this.llm.complete({
      agentId: "insight",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            activeGoals: context.activeGoals,
            longHistory,
            recentEvents: context.recentEvents,
          }),
        },
      ],
      maxTokens: 1800,
    });

    const fallback: InsightOutput = {
      coreInsight: "数据积累不足，暂无深度洞察。继续使用系统后将生成首个洞察报告。",
      patterns: [],
      calibrationSuggestion: "继续完成每日任务和复盘，积累足够数据。",
      credibilitySignal: "medium",
    };

    const { envelope } = parseStructuredOutput(
      "insight",
      response.content,
      insightOutputSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "insight-agent",
      type: "agent_output",
      category: "insight_analysis",
      rawPayload: { ...toLlmTrace(response, prompt.version), insightRun: true },
      structured: {
        output: envelope.data,
        summary: envelope.data.coreInsight,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.85,
      tags: ["insight", envelope.data.credibilitySignal],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: formatInsightResponse(envelope.data),
      structured: { insight: envelope.data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
    };
  }
}

function formatInsightResponse(data: InsightOutput): string {
  const positives = data.patterns.filter((p) => p.type === "positive");
  const negatives = data.patterns.filter((p) => p.type === "negative");
  const lines: string[] = [`【洞察报告】\n${data.coreInsight}`];
  if (positives.length) {
    lines.push(`\n正向模式：${positives.map((p) => p.description).join("；")}`);
  }
  if (negatives.length) {
    lines.push(`\n需要注意：${negatives.map((p) => p.description).join("；")}`);
  }
  lines.push(`\n校准建议：${data.calibrationSuggestion}`);
  return lines.join("");
}
