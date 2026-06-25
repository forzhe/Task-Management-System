import type {
  AgentContext,
  AgentResult,
  BountyAlignment,
  BountyCategory,
  BountyPriceBreakdown,
  BountyValueTier,
  EconomyOutput,
} from "@nexus/shared";
import {
  clampToHorizon,
  classifyCategory,
  computeDeterministicPrice,
  estimateAlignment,
  estimateValueTier,
} from "../economy/pricing.js";
import { type LlmClient, toLlmTrace } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import { getAgentPrompt } from "../prompt-registry.js";
import { economyOutputSchema, parseStructuredOutput } from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export interface EconomyInput {
  /** 宿主心愿描述 */
  title: string;
  /** 宿主补充：理由 / 链接（可选）*/
  hostNote?: string;
  /** 宿主可选参考价（¥）*/
  referenceCny?: number;
  /** 可持续周赚取率（能量点/周）*/
  rWeek: number;
  /** 可信度 0-2 */
  credibility: number;
  /** 宿主红线（命中即拒绝纳入经济）*/
  redLines: string[];
}

/** 经济官处理后的定价决策（已过护栏）。service 据此落库为悬赏契约。*/
export interface EconomyDecision {
  verdict: "price" | "clarify" | "reject";
  valueTier: BountyValueTier;
  category: BountyCategory;
  estimatedValueCny: number;
  alignment: BountyAlignment;
  relatedGoalIds: string[];
  /** 最终价格（已夹逼护栏；仅 verdict=price 时有意义）*/
  price: number;
  priceBreakdown: BountyPriceBreakdown;
  companionLine: string;
  clarifyingQuestions: string[];
  rejectReason: string | null;
}

/**
 * 经济官 Agent（商城子系统规划书 §4/§6）。在宿主提交心愿的那一刻做一次自主综合评判：
 * 估值 → 对齐 → 定价。LLM 给出 recommendedPrice，本 Agent 再施加护栏夹逼；
 * 离线/解析失败时回退确定性公式。纯计算 + 无落库副作用，落库交由 service。
 */
export class EconomyAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext, input: EconomyInput): Promise<AgentResult> {
    const goals = context.activeGoals.map((g) => ({ id: g.id, title: g.title }));
    const fallback = this.buildFallback(input, goals);

    const prompt = getAgentPrompt("economy");
    const modelTier = this.router.route({ agentId: "economy", trigger: context.trigger });

    const response = await this.llm.complete({
      agentId: "economy",
      modelTier,
      messages: [
        { role: "system", content: prompt.system },
        {
          role: "user",
          content: JSON.stringify({
            wish: input.title,
            hostNote: input.hostNote ?? "",
            referenceCny: input.referenceCny ?? null,
            sustainableWeeklyRate: Math.round(input.rWeek),
            credibility: Number(input.credibility.toFixed(2)),
            activeGoals: goals,
            redLines: input.redLines,
            profileSummary: context.profileSummary,
            // 经济官的参考锚：确定性引擎给出的建议价（仅参考，可被综合评判覆盖）
            deterministicReference: {
              valueTier: fallback.appraisal.valueTier,
              suggestedPrice: fallback.judgment.recommendedPrice,
              impliedHorizonWeeks: fallback.judgment.impliedHorizonWeeks,
            },
          }),
        },
      ],
      maxTokens: 800,
    });

    const { envelope } = parseStructuredOutput(
      "economy",
      response.content,
      economyOutputSchema,
      fallback,
    );

    const decision = this.postProcess(envelope.data, envelope.fallbackUsed, input, goals);

    return {
      response: decision.companionLine,
      structured: {
        economy: decision,
        fallbackUsed: envelope.fallbackUsed,
        trace: toLlmTrace(response, prompt.version),
      },
    };
  }

  /** 把 LLM 输出（或兜底）夹逼护栏 → 最终决策。红线一律拒绝（安全压过 LLM）。*/
  private postProcess(
    out: EconomyOutput,
    fallbackUsed: boolean,
    input: EconomyInput,
    goals: Array<{ id: string; title: string }>,
  ): EconomyDecision {
    const goalIds = new Set(goals.map((g) => g.id));
    const relatedGoalIds = out.alignment.relatedGoalIds.filter((gid) => goalIds.has(gid));

    // 分类用确定性分类器优先（同一心愿恒定归类，不随 LLM 抖动）；分类器不认得才用 LLM 的判断
    const detCat = classifyCategory(`${input.title} ${input.hostNote ?? ""}`);
    const category = detCat !== "other" ? detCat : out.appraisal.category;

    // 红线安全压制：即便 LLM 给了价，命中红线也强制拒绝（禁区⑦/§9）
    const redLineHit = out.alignment.redLineHit || out.alignment.verdict === "conflict";
    if (redLineHit || out.verdict === "reject") {
      return {
        verdict: "reject",
        valueTier: out.appraisal.valueTier,
        category,
        estimatedValueCny: out.appraisal.estimatedValueCny,
        alignment: redLineHit ? "conflict" : out.alignment.verdict,
        relatedGoalIds,
        price: 0,
        priceBreakdown: this.emptyBreakdown(input.rWeek, fallbackUsed),
        companionLine: out.companionLine,
        clarifyingQuestions: [],
        rejectReason:
          out.rejectReason ??
          (redLineHit
            ? "该奖励与你的红线冲突，系统不会用悬赏经济为它背书。"
            : "经济官婉拒了这条心愿。"),
      };
    }

    if (out.verdict === "clarify" && out.appraisal.clarifyingQuestions.length > 0) {
      return {
        verdict: "clarify",
        valueTier: out.appraisal.valueTier,
        category,
        estimatedValueCny: out.appraisal.estimatedValueCny,
        alignment: out.alignment.verdict,
        relatedGoalIds,
        price: 0,
        priceBreakdown: this.emptyBreakdown(input.rWeek, fallbackUsed),
        companionLine: out.companionLine,
        clarifyingQuestions: out.appraisal.clarifyingQuestions.slice(0, 3),
        rejectReason: null,
      };
    }

    // verdict = price：把综合评判价夹逼到合理隐含周期带内
    const clamped = clampToHorizon(out.judgment.recommendedPrice, input.rWeek);
    return {
      verdict: "price",
      valueTier: out.appraisal.valueTier,
      category,
      estimatedValueCny: out.appraisal.estimatedValueCny,
      alignment: out.alignment.verdict,
      relatedGoalIds,
      price: clamped.price,
      priceBreakdown: {
        rWeek: Math.round(input.rWeek),
        impliedHorizonWeeks: clamped.impliedHorizonWeeks,
        keyFactors: out.judgment.keyFactors.slice(0, 6),
        clampApplied: clamped.clampApplied,
        offlineFallback: fallbackUsed,
      },
      companionLine: out.companionLine,
      clarifyingQuestions: [],
      rejectReason: null,
    };
  }

  /** 确定性兜底：离线或 LLM 解析失败时的完整 EconomyOutput */
  private buildFallback(
    input: EconomyInput,
    goals: Array<{ id: string; title: string }>,
  ): EconomyOutput {
    const text = `${input.title} ${input.hostNote ?? ""}`;
    const value = estimateValueTier(text, input.referenceCny);
    const category = classifyCategory(text);
    const align = estimateAlignment({ text, goals, redLines: input.redLines });

    if (align.verdict === "conflict") {
      return {
        appraisal: {
          valueTier: value.tier,
          category,
          estimatedValueCny: value.estimatedValueCny,
          estimatedBasis: "离线词典估值",
          needsClarification: false,
          clarifyingQuestions: [],
        },
        alignment: {
          verdict: "conflict",
          relatedGoalIds: [],
          redLineHit: true,
          rationale: "心愿与宿主红线冲突。",
        },
        judgment: { recommendedPrice: 0, impliedHorizonWeeks: 0, keyFactors: [] },
        verdict: "reject",
        companionLine: "这条心愿碰到了你定下的红线。我不会用悬赏给它背书——但要不要做，权在你。",
        rejectReason: "与红线冲突，拒绝纳入悬赏经济。",
      };
    }

    const priced = computeDeterministicPrice({
      rWeek: input.rWeek,
      credibility: input.credibility,
      valueTier: value.tier,
      alignment: align.verdict,
    });
    const keyFactors = [
      `可持续赚取率 ~${Math.round(input.rWeek)}/周`,
      `可信度 ${input.credibility.toFixed(1)}（×${priced.mCred}）`,
      `${align.verdict}（×${priced.mAlign}）`,
      `${value.tier} 价位`,
    ];
    return {
      appraisal: {
        valueTier: value.tier,
        category,
        estimatedValueCny: value.estimatedValueCny,
        estimatedBasis: "离线确定性估值",
        needsClarification: false,
        clarifyingQuestions: [],
      },
      alignment: {
        verdict: align.verdict,
        relatedGoalIds: align.relatedGoalIds,
        redLineHit: false,
        rationale: align.verdict === "aligned" ? "与某活跃目标相关。" : "无明显目标关联。",
      },
      judgment: {
        recommendedPrice: priced.price,
        impliedHorizonWeeks: priced.impliedHorizonWeeks,
        keyFactors,
      },
      verdict: "price",
      companionLine: `按你现在的节奏，约 ${priced.impliedHorizonWeeks} 周可以够到它。`,
    };
  }

  private emptyBreakdown(rWeek: number, offlineFallback: boolean): BountyPriceBreakdown {
    return {
      rWeek: Math.round(rWeek),
      impliedHorizonWeeks: 0,
      keyFactors: [],
      clampApplied: "none",
      offlineFallback,
    };
  }
}
