import type { AgentContext, AgentResult, CompanionState } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import {
  companionOutputSchema,
  fallbackCompanionOutput,
  parseStructuredOutput,
} from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export class CompanionAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext, preferredState?: CompanionState): Promise<AgentResult> {
    const companion = this.tools.getCompanion();
    const prompt = getAgentPrompt("companion");
    const modelTier = this.router.route({ agentId: "companion", trigger: context.trigger });
    const response = await this.llm.complete({
      agentId: "companion",
      modelTier,
      messages: [
        {
          role: "system",
          content: prompt.system,
        },
        {
          role: "user",
          content: JSON.stringify({
            trigger: context.trigger,
            message: context.message,
            currentTasks: context.currentTasks,
          }),
        },
      ],
    });

    const fallbackState = preferredState ?? this.pickState(context);
    const { envelope } = parseStructuredOutput(
      "companion",
      response.content,
      companionOutputSchema,
      fallbackCompanionOutput(fallbackState),
    );
    const state = preferredState ?? this.pickState(context, envelope.data.state);
    const action = {
      companionId: companion.id,
      state,
      dialogue: envelope.data.dialogue,
    };
    this.tools.triggerCompanion(action);
    const event = this.tools.unsafeLogEvent({
      source: "companion-agent",
      type: "agent_output",
      category: "companion_feedback",
      rawPayload: { response: response.content, ...toLlmTrace(response, prompt.version) },
      structured: { output: envelope, action, modelTier },
      occurredAt: new Date().toISOString(),
      confidence: 0.75,
      tags: ["companion"],
      relatedGoalIds: [],
      relatedTaskIds: context.currentTasks.map((task) => task.id),
    });
    return {
      response: envelope.data.dialogue,
      structured: { companion: envelope },
      events: [event],
      companionAction: action,
    };
  }

  private pickState(context: AgentContext, proposed: CompanionState = "idle"): CompanionState {
    if (context.trigger === "task_completed") return "celebrating";
    if (context.trigger === "daily_review") return "caring";
    if (context.currentTasks.some((task) => task.status === "failed")) return "strict";
    if (context.currentTasks.some((task) => task.status === "in_progress")) return "focus";
    return proposed;
  }
}
