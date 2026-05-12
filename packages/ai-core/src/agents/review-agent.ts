import type { AgentContext, AgentResult } from "@nexus/shared";
import type { LlmClient } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import {
  fallbackReviewOutput,
  formatReviewResponse,
  parseStructuredOutput,
  reviewOutputSchema,
} from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export class ReviewAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const response = await this.llm.complete({
      agentId: "review",
      modelTier: this.router.route({
        agentId: "review",
        trigger: context.trigger,
        requiresDeepReasoning: true,
      }),
      messages: [
        {
          role: "system",
          content:
            "你是 NEXUS-7 复盘 Agent。只返回 JSON，不要 Markdown。JSON 必须符合：{schemaVersion:1,agentId:'review',summary:string,data:{summary:string,honestDelta:string,risks:string[],tomorrowAdjustment:string,emotionTags:string[]},warnings:[],fallbackUsed:false}。进行主客观对比，识别偏离与真实推进，不讨好宿主。",
        },
        {
          role: "user",
          content: JSON.stringify({
            message: context.message,
            tasks: context.currentTasks,
            recentEvents: context.recentEvents,
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
      rawPayload: { response: response.content },
      structured: { reviewId: review.id, output: envelope },
      occurredAt: timestamp,
      confidence: 0.8,
      tags: ["review"],
      relatedGoalIds: [],
      relatedTaskIds: context.currentTasks.map((task) => task.id),
    });

    return {
      response: formatReviewResponse(envelope.data),
      structured: { review: envelope },
      events: [event],
      nextActions: [`review:${review.id}`],
    };
  }
}
