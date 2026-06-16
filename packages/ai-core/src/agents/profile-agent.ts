import type { AgentContext, AgentResult, ProfileEvolutionOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, profileEvolutionSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

/**
 * §5.3 档案演化：扫描事件流，识别行为与档案的矛盾，提出更新候选。
 * 只提议、不直接改——所有提议写入 profile_change_log，交宿主在周复盘确认。
 */
export class ProfileAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools?: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const prompt = getAgentPrompt("profile");
    // 月度深度扫描用 opus，周度用 sonnet（requiresDeepReasoning 由调用方控制）
    const modelTier = this.router.route({
      agentId: "profile",
      trigger: context.trigger,
      requiresDeepReasoning: context.trigger === "system",
    });

    const longHistory = this.tools?.queryEvents(80) ?? context.recentEvents;
    const response = await this.llm.complete({
      agentId: "profile",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            message: context.message,
            recentEvents: longHistory.slice(0, 40).map((e) => ({
              category: e.category,
              occurredAt: e.occurredAt,
              summary: typeof e.structured.summary === "string" ? e.structured.summary : null,
              tags: e.tags,
            })),
          }),
        },
      ],
      maxTokens: 1500,
    });

    const fallback: ProfileEvolutionOutput = { proposals: [] };
    const { envelope } = parseStructuredOutput(
      "profile",
      response.content,
      profileEvolutionSchema,
      fallback,
    );

    // 持久化每条提议（仅当 tools 可用 —— 兼容旧调用）
    const savedIds: string[] = [];
    if (this.tools) {
      for (const p of envelope.data.proposals) {
        const saved = this.tools.saveProfileChangeProposal({
          field: p.field,
          subPath: p.subPath ?? null,
          currentValue: p.currentValue ?? null,
          proposedValue: p.proposedValue,
          reason: p.reason,
          confidence: p.confidence,
        });
        savedIds.push(saved.id);
      }
    }

    const event = this.tools?.logEvent({
      source: "profile-agent",
      type: "agent_output",
      category: "profile_evolution",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: `档案演化扫描：${envelope.data.proposals.length} 条提议`,
        proposalCount: envelope.data.proposals.length,
        proposalIds: savedIds,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.7,
      tags: ["profile", "evolution"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });

    const summary =
      envelope.data.proposals.length === 0
        ? "档案扫描完成：当前行为与档案一致，无更新提议。"
        : `档案扫描发现 ${envelope.data.proposals.length} 处可能的演化，等待你在复盘时确认。`;

    return {
      response: summary,
      structured: { profileEvolution: envelope.data, proposalIds: savedIds },
      events: event ? [event] : [],
    };
  }
}
