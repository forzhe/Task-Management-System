import type {
  AgentContext,
  AgentResult,
  ChoicePredictionOutput,
  NetGrowthOutput,
  PathSimulationOutput,
} from "@nexus/shared";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import {
  choicePredictionSchema,
  netGrowthSchema,
  parseStructuredOutput,
  pathSimulationSchema,
} from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface ChoicePredictionInput {
  question: string;
  options: string[];
}

export interface PathSimulationInput {
  scenario: string;
  paths: string[];
}

/**
 * §8/§9 决策 Agent：
 * - analyzeNetGrowth：今日净成长值（行为影响评分，回答产品核心命题）
 * - predictChoice：选择前预测（多方案对比，基于长期愿景）
 */
export class DecisionAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async analyzeNetGrowth(context: AgentContext): Promise<AgentResult> {
    const prompt = getAgentPrompt("decision_net_growth");
    const modelTier = this.router.route({ agentId: "decision", trigger: context.trigger });

    // 取今日事件做评估锚定
    const todayPrefix = new Date().toISOString().slice(0, 10);
    const todayEvents = this.tools
      .queryEvents(60)
      .filter((e) => e.occurredAt.slice(0, 10) === todayPrefix);

    const response = await this.llm.complete({
      agentId: "decision",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            activeGoals: context.activeGoals.map((g) => ({ title: g.title, level: g.level })),
            todayTasks: context.currentTasks.map((t) => ({ title: t.title, status: t.status })),
            todayEvents: todayEvents.map((e) => ({
              category: e.category,
              summary: typeof e.structured.summary === "string" ? e.structured.summary : null,
              tags: e.tags,
            })),
          }),
        },
      ],
      maxTokens: 1000,
    });

    const fallback: NetGrowthOutput = {
      netValue: 0,
      verdict: "neutral",
      positives: [],
      negatives: [],
      summary: "今天还没有可评估的行为。完成一个任务后再来看净成长值。",
    };
    const { envelope } = parseStructuredOutput(
      "decision",
      response.content,
      netGrowthSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "decision-agent",
      type: "agent_output",
      category: "net_growth",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: envelope.data.summary,
        netValue: envelope.data.netValue,
        verdict: envelope.data.verdict,
        output: envelope.data,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.8,
      tags: ["decision", "net_growth", envelope.data.verdict],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: `今日净成长值 ${envelope.data.netValue >= 0 ? "+" : ""}${envelope.data.netValue}：${envelope.data.summary}`,
      structured: { netGrowth: envelope.data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
    };
  }

  async predictChoice(context: AgentContext, input: ChoicePredictionInput): Promise<AgentResult> {
    const prompt = getAgentPrompt("decision_choice");
    const modelTier = this.router.route({
      agentId: "decision",
      trigger: context.trigger,
      requiresDeepReasoning: true,
    });

    const response = await this.llm.complete({
      agentId: "decision",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            activeGoals: context.activeGoals.map((g) => ({ title: g.title, level: g.level })),
            question: input.question,
            options: input.options,
          }),
        },
      ],
      maxTokens: 1400,
    });

    const fallback: ChoicePredictionOutput = {
      options: input.options.map((label) => ({
        label,
        alignmentScore: 50,
        shortTermCost: "未评估",
        longTermGain: "未评估",
        risk: "结构化输出不可用，无法预测",
      })),
      recommendation: "暂无足够信息给出建议，请补充方案细节后重试。",
    };
    const { envelope } = parseStructuredOutput(
      "decision",
      response.content,
      choicePredictionSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "decision-agent",
      type: "decision",
      category: "choice_prediction",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: envelope.data.recommendation,
        question: input.question,
        output: envelope.data,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.75,
      tags: ["decision", "choice_prediction"],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: envelope.data.recommendation,
      structured: { choicePrediction: envelope.data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
    };
  }

  async simulatePath(context: AgentContext, input: PathSimulationInput): Promise<AgentResult> {
    const prompt = getAgentPrompt("decision_path");
    // 人生级推演用 opus
    const modelTier = this.router.route({
      agentId: "decision",
      trigger: context.trigger,
      requiresDeepReasoning: true,
    });

    const response = await this.llm.complete({
      agentId: "decision",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            profileSummary: context.profileSummary,
            activeGoals: context.activeGoals.map((g) => ({ title: g.title, level: g.level })),
            scenario: input.scenario,
            paths: input.paths,
          }),
        },
      ],
      maxTokens: 2200,
    });

    const fallback: PathSimulationOutput = {
      paths: input.paths.map((label) => ({
        label,
        trajectory: [],
        endState: "结构化输出不可用，无法推演终局。",
        alignmentScore: 50,
        keyRisks: [],
      })),
      divergencePoint: "暂无法识别关键分叉点。",
      recommendation: "请补充场景细节后重试。",
    };
    const { envelope } = parseStructuredOutput(
      "decision",
      response.content,
      pathSimulationSchema,
      fallback,
    );

    const event = this.tools.logEvent({
      source: "decision-agent",
      type: "decision",
      category: "path_simulation",
      rawPayload: toLlmTrace(response, prompt.version),
      structured: {
        summary: envelope.data.divergencePoint,
        scenario: input.scenario,
        output: envelope.data,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.7,
      tags: ["decision", "path_simulation"],
      relatedGoalIds: context.activeGoals.map((g) => g.id),
      relatedTaskIds: [],
    });

    return {
      response: envelope.data.recommendation,
      structured: { pathSimulation: envelope.data, fallbackUsed: envelope.fallbackUsed },
      events: [event],
    };
  }
}
