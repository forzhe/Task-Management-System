import type { AgentContext, AgentResult } from "@nexus/shared";
import type { LlmClient } from "../llm.js";
import type { ModelRouter } from "../model-router.js";

export class ProfileAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const response = await this.llm.complete({
      agentId: "profile",
      modelTier: this.router.route({ agentId: "profile", trigger: context.trigger }),
      messages: [
        {
          role: "system",
          content: "你是 NEXUS-7 Profile Agent。只提出档案更新候选，不在证据不足时武断修改。",
        },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            message: context.message,
            recentEvents: context.recentEvents.slice(0, 10),
          }),
        },
      ],
    });
    return { response: response.content };
  }
}
