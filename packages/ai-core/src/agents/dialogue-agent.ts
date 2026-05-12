import type { AgentContext, AgentResult } from "@nexus/shared";
import type { LlmClient } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import type { NexusTools } from "../tools.js";

export class DialogueAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const message = context.message ?? "";
    const response = await this.llm.complete({
      agentId: "dialogue",
      modelTier: this.router.route({ agentId: "dialogue", trigger: context.trigger }),
      messages: [
        {
          role: "system",
          content:
            "你是 NEXUS-7 对话 Agent。职责是倾听、提取行为信号，并把对话转成事件流。回复短、诚实、可行动。",
        },
        { role: "user", content: message },
      ],
    });
    const event = this.tools.unsafeLogEvent({
      source: "dialogue-agent",
      type: "dialogue",
      category: "user_input",
      rawPayload: { message },
      structured: {
        summary: message.slice(0, 240),
        offlineModel: response.offline,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.8,
      tags: ["dialogue"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return {
      response: response.content,
      events: [event],
      nextActions: ["consider-planning", "companion-response"],
    };
  }
}
