import type { AgentContext, AgentResult, StewardOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { parseStructuredOutput, stewardOutputSchema } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface LearningStewardInput {
  intellect: number;
  focus: number;
  creativity: number;
  lastActive: { intellect: string; focus: string; creativity: string };
  focusMinutesToday?: number;
}

/**
 * §6.7.3 学习教练（第二个辅助 Agent）。专精认知成长维度。
 * 独特视角：严格区分「输入」与「产出」——只输入不产出不算学习。
 * 决策 #17：发现由主小人一个声音转达。
 */
export class LearningStewardAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(
    context: AgentContext,
    input: LearningStewardInput,
    opts?: { speak?: boolean },
  ): Promise<AgentResult> {
    const speak = opts?.speak ?? true;
    const prompt = getAgentPrompt("learning_steward");
    const modelTier = this.router.route({ agentId: "steward", trigger: context.trigger });

    // 从事件流抽取学习类信号（任务完成/洞察/复盘等）
    const learningEvents = this.tools
      .queryEvents(60)
      .filter((e) =>
        ["task_status_changed", "daily_review", "insight_analysis", "net_growth"].includes(
          e.category ?? "",
        ),
      )
      .slice(0, 20)
      .map((e) => ({
        category: e.category,
        occurredAt: e.occurredAt.slice(0, 10),
        summary: typeof e.structured.summary === "string" ? e.structured.summary : null,
      }));

    const response = await this.llm.complete({
      agentId: "steward",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            learningGoals: context.activeGoals
              .filter((g) => /学|读|写|考|研|技能|课程|英语|编程|知识/.test(g.title))
              .map((g) => g.title),
            cognitiveAttributes: {
              intellect: input.intellect,
              focus: input.focus,
              creativity: input.creativity,
              lastActive: input.lastActive,
            },
            focusMinutesToday: input.focusMinutesToday ?? null,
            recentLearningSignals: learningEvents,
          }),
        },
      ],
      maxTokens: 700,
    });

    const fallback: StewardOutput = {
      domain: "learning",
      assessment: "近期认知成长信号偏少，暂时无法形成可靠评估。",
      concernLevel: "watch",
      nudge: "今天产出一点：写 200 字笔记，或把一个学到的概念复述给我听。",
      companionLine: "你最近像是只在输入没在产出——今天写点东西给我看看？",
    };
    const { envelope } = parseStructuredOutput(
      "steward",
      response.content,
      stewardOutputSchema,
      fallback,
    );
    const data = envelope.data;

    const companion = this.tools.getCompanion();
    const state = data.concernLevel === "alert" ? "caring" : "focus";
    if (speak) {
      this.tools.triggerCompanion({ companionId: companion.id, state, dialogue: data.companionLine });
    }

    const event = this.tools.logEvent({
      source: "learning-steward",
      type: "agent_output",
      category: "steward_learning",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: { summary: data.assessment, output: data },
      occurredAt: new Date().toISOString(),
      confidence: 0.8,
      tags: ["steward", "learning", data.concernLevel],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: data.assessment,
      structured: { steward: data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
      companionAction: { companionId: companion.id, state, dialogue: data.companionLine },
    };
  }
}
