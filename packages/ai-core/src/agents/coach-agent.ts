import type { AgentContext, AgentResult, CoachOutput } from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { coachOutputSchema, parseStructuredOutput } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface CoachSessionInput {
  goalTitle: string;
  previousExchanges: Array<{ question: string; answer: string }>;
  userAnswer: string;
}

export class CoachAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext, session: CoachSessionInput): Promise<AgentResult> {
    const prompt = getAgentPrompt("coach");
    const modelTier = this.router.route({
      agentId: "coach",
      trigger: context.trigger,
      requiresDeepReasoning: false,
    });

    const round = session.previousExchanges.length + 1;

    const response = await this.llm.complete({
      agentId: "coach",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            goalTitle: session.goalTitle,
            round,
            previousExchanges: session.previousExchanges,
            currentAnswer: session.userAnswer,
            activeGoals: context.activeGoals,
          }),
        },
      ],
      maxTokens: 800,
    });

    const fallback: CoachOutput = {
      question: "你设定这个目标的最核心驱动力是什么？",
      round,
      readyToEvaluate: false,
    };

    const { envelope } = parseStructuredOutput(
      "coach",
      response.content,
      coachOutputSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "coach-agent",
      type: "dialogue",
      category: "coach_session",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        output: envelope.data,
        goalTitle: session.goalTitle,
        round,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.9,
      tags: ["coach", `round-${round}`],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: envelope.data.question,
      structured: {
        coach: envelope.data,
        round,
        goalTitle: session.goalTitle,
        fallbackUsed: envelope.fallbackUsed,
      },
      events: [event],
    };
  }
}
