import type { AgentContext, AgentResult, BrowserVisitSummary } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import {
  fallbackReviewOutput,
  formatReviewResponse,
  parseStructuredOutput,
  reviewOutputSchema,
} from "../structured-output.js";
import type { NexusTools } from "../tools.js";

// Distill browser visits into compact top-domain counts for LLM context
function summarizeBrowserVisits(visits: BrowserVisitSummary[]): Record<string, unknown> {
  const domainMap: Record<string, number> = {};
  for (const v of visits) {
    try {
      const domain = new URL(v.url).hostname.replace(/^www\./, "");
      domainMap[domain] = (domainMap[domain] ?? 0) + 1;
    } catch {
      // skip malformed urls
    }
  }
  const topDomains = Object.entries(domainMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([domain, count]) => ({ domain, count }));

  // Heuristic distraction detection
  const DISTRACT_KEYWORDS = ["youtube", "bilibili", "tiktok", "twitter", "x.com", "weibo", "douyin", "kuaishou", "reddit", "instagram", "facebook"];
  const distractCount = topDomains
    .filter((d) => DISTRACT_KEYWORDS.some((k) => d.domain.includes(k)))
    .reduce((sum, d) => sum + d.count, 0);

  return {
    totalVisits: visits.length,
    topDomains,
    distractVisits: distractCount,
    distractRatio: visits.length > 0 ? distractCount / visits.length : 0,
  };
}

export class ReviewAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const prompt = getAgentPrompt("review");
    const modelTier = this.router.route({
      agentId: "review",
      trigger: context.trigger,
      requiresDeepReasoning: true,
    });
    const response = await this.llm.complete({
      agentId: "review",
      modelTier,
      messages: [
        {
          role: "system",
          content: prompt.system,
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            tasks: context.currentTasks,
            recentEvents: context.recentEvents,
            screenActivity: context.screenActivity ?? null,
            browserVisits: context.browserVisits
              ? summarizeBrowserVisits(context.browserVisits)
              : null,
            healthToday: context.healthToday ?? null,
            financeRecent: context.financeRecent ?? null,
          }),
        },
      ],
      maxTokens: 1600,
    });

    const { envelope } = parseStructuredOutput(
      "review",
      response.content,
      reviewOutputSchema,
      fallbackReviewOutput(),
    );
    const timestamp = new Date().toISOString();
    const review = this.tools.saveReview({
      type: "daily",
      scopeStart: timestamp.slice(0, 10),
      scopeEnd: timestamp,
      subjective: { note: context.message ?? "" },
      objective: {
        taskCount: context.currentTasks.length,
        completedTaskCount: context.currentTasks.filter((task) => task.status === "completed")
          .length,
        ...(context.screenActivity
          ? {
              totalActiveMinutes: context.screenActivity.totalActiveMinutes,
              focusMinutes: context.screenActivity.focusMinutes,
              distractMinutes: context.screenActivity.distractMinutes,
              awConnected: context.screenActivity.awConnected,
            }
          : {}),
      },
      aiAnalysis: { ...envelope.data },
      suggestedAdjustments: { tomorrow: envelope.data.tomorrowAdjustment },
      emotionTags: envelope.data.emotionTags,
      credibilityCheck: envelope.data.honestDelta,
    });

    const event = this.tools.unsafeLogEvent({
      source: "review-agent",
      type: "agent_output",
      category: "daily_review",
      rawPayload: { response: response.content, ...toLlmTrace(response, prompt.version) },
      structured: { reviewId: review.id, output: envelope, modelTier },
      occurredAt: timestamp,
      confidence: 0.8,
      tags: ["review"],
      relatedGoalIds: [],
      relatedTaskIds: context.currentTasks.map((task) => task.id),
    });

    // §6.6.3：复盘判定为"关键时刻"时写入小人记忆（复用本次调用，零额外 LLM 成本）
    if (envelope.data.keyMoment) {
      this.tools.saveCompanionMemory({
        type: envelope.data.keyMoment.type,
        summary: envelope.data.keyMoment.summary,
        refEventIds: [event.id],
        emotionalWeight: envelope.data.keyMoment.emotionalWeight,
      });
    }

    return {
      response: formatReviewResponse(envelope.data),
      structured: { review: envelope },
      events: [event],
      nextActions: [`review:${review.id}`],
    };
  }
}
