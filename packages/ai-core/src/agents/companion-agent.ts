import type { AgentContext, AgentResult, CompanionState } from "@nexus/shared";
import type { LlmClient } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
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
    const response = await this.llm.complete({
      agentId: "companion",
      modelTier: this.router.route({ agentId: "companion", trigger: context.trigger }),
      messages: [
        {
          role: "system",
          content:
            "你是 NEXUS-7 主小人。只返回 JSON，不要 Markdown。JSON 必须符合：{schemaVersion:1,agentId:'companion',summary:string,data:{state:'idle'|'focus'|'reminding'|'celebrating'|'disappointed'|'strict'|'caring'|'evolving',dialogue:string},warnings:[],fallbackUsed:false}。台词不超过 80 字，有性格，不过度解释功能。",
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
    return {
      response: envelope.data.dialogue,
      structured: { companion: envelope },
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
