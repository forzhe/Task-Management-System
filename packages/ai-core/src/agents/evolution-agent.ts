import type { AgentResult, EvolutionOutput } from "@nexus/shared";
import { isEvolutionTargetAllowed } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt, getPromptSystem } from "../prompt-registry.js";
import { evolutionOutputSchema, parseStructuredOutput } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface EvolutionInput {
  targetKey: string;
  metrics: Record<string, unknown>;
}

/**
 * §6.4 系统进化引擎。唯一能提议修改其他 Agent 提示词的 Agent。
 * 安全铁律（代码级、非 LLM 自觉）：
 *  - 仅对允许的目标提议（硬编码禁区拦在调用前 + Agent 内再校验）
 *  - 仅提议，绝不自动应用（由 service 在宿主确认后才 setPromptOverride）
 */
export class EvolutionAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(input: EvolutionInput): Promise<AgentResult> {
    // 硬编码禁区：不可触碰 Safety / 自身 / 不在白名单的 key
    if (!isEvolutionTargetAllowed(input.targetKey)) {
      return {
        response: `进化引擎拒绝：${input.targetKey} 属于禁区或不可进化目标。`,
        structured: {
          evolution: {
            targetKey: input.targetKey,
            changeNeeded: false,
            reason: "目标在硬编码禁区内或不可进化，已拒绝。",
            newPrompt: "",
          } satisfies EvolutionOutput,
          forbidden: true,
        },
        events: [],
      };
    }

    const currentPrompt = getPromptSystem(input.targetKey) ?? "";
    const prompt = getAgentPrompt("evolution");
    const response = await this.llm.complete({
      agentId: "evolution",
      modelTier: this.router.route({ agentId: "evolution", trigger: "system" }),
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            targetKey: input.targetKey,
            currentPrompt,
            metrics: input.metrics,
          }),
        },
      ],
      maxTokens: 2000,
    });

    const fallback: EvolutionOutput = {
      targetKey: input.targetKey,
      changeNeeded: false,
      reason: "结构化输出不可用，本轮不提议改动。",
      newPrompt: "",
    };
    const { envelope } = parseStructuredOutput(
      "evolution",
      response.content,
      evolutionOutputSchema,
      fallback,
    );
    const data = envelope.data;
    // 二次校验：即便 LLM 返回了别的 targetKey，也强制回到允许目标
    if (!isEvolutionTargetAllowed(data.targetKey)) {
      data.targetKey = input.targetKey;
      data.changeNeeded = false;
      data.newPrompt = "";
    }

    const event = this.tools.logEvent({
      source: "evolution-agent",
      type: "agent_output",
      category: "evolution_proposal",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: data.changeNeeded
          ? `进化提议：${data.targetKey} —— ${data.reason.slice(0, 50)}`
          : `进化扫描：${data.targetKey} 无需改动`,
        output: { ...data, oldPrompt: currentPrompt },
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.7,
      tags: ["evolution", data.changeNeeded ? "proposed" : "no-change"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });

    return {
      response: data.reason,
      structured: { evolution: data, oldPrompt: currentPrompt },
      events: [event],
    };
  }
}
