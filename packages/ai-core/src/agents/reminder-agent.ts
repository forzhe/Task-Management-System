import type { AgentContext, AgentResult, ReminderOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, reminderOutputSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export class ReminderAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const prompt = getAgentPrompt("reminder");
    const modelTier = this.router.route({
      agentId: "reminder",
      trigger: context.trigger,
      requiresDeepReasoning: false,
    });

    const now = new Date().toISOString();
    const overdueTasks = context.currentTasks.filter(
      (t) => t.scheduledAt && t.scheduledAt < now && t.status === "not_started",
    );
    const stalledGoals = context.activeGoals.filter((g) => {
      if (!g.updatedAt) return false;
      const daysSinceUpdate =
        (Date.now() - new Date(g.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      return daysSinceUpdate > 3;
    });

    const response = await this.llm.complete({
      agentId: "reminder",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            currentTime: now,
            signalHint: context.message ?? null,
            overdueTasks: overdueTasks.map((t) => ({
              title: t.title,
              scheduledAt: t.scheduledAt,
            })),
            stalledGoals: stalledGoals.map((g) => ({
              title: g.title,
              updatedAt: g.updatedAt,
            })),
            recentEventCount: context.recentEvents.length,
          }),
        },
      ],
      maxTokens: 400,
    });

    const fallback: ReminderOutput = {
      shouldNotify: false,
      type: "none",
      message: "",
    };

    const { envelope } = parseStructuredOutput(
      "reminder",
      response.content,
      reminderOutputSchema,
      fallback,
    );

    if (envelope.data.shouldNotify) {
      this.tools.logEvent({
        source: "reminder-agent",
        type: "action",
        category: "reminder_check",
        rawPayload: toLlmTrace(response, prompt.version),
        structured: { reminder: envelope.data },
        occurredAt: new Date().toISOString(),
        confidence: 0.95,
        tags: ["reminder", envelope.data.type],
        relatedGoalIds: [],
        relatedTaskIds: overdueTasks.map((t) => t.id),
      });
    }

    return {
      response: envelope.data.shouldNotify ? envelope.data.message : undefined,
      structured: { reminder: envelope.data, fallbackUsed: envelope.fallbackUsed },
      events: [],
    };
  }
}
