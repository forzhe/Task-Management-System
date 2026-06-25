import type {
  AgentId,
  AgentOutputEnvelope,
  ChoicePredictionOutput,
  CoachOutput,
  CompanionOutput,
  CompanionState,
  EconomyOutput,
  EvolutionOutput,
  InsightOutput,
  NetGrowthOutput,
  PathSimulationOutput,
  PeriodReportOutput,
  PlannedTask,
  PlanningOutput,
  ProfileEvolutionOutput,
  ReminderOutput,
  ReviewOutput,
  StewardOutput,
} from "@nexus/shared";
import { z } from "zod";

const bountyValueTier = z.enum(["small", "light", "medium", "large", "major"]);
const bountyAlignment = z.enum(["aligned", "neutral", "indulgent", "conflict"]);
const bountyCategory = z.enum([
  "electronics",
  "food",
  "apparel",
  "entertainment",
  "travel",
  "learning",
  "fitness",
  "home",
  "beauty",
  "other",
]);

const companionStates: readonly CompanionState[] = [
  "idle",
  "focus",
  "reminding",
  "celebrating",
  "disappointed",
  "strict",
  "caring",
  "evolving",
];

const plannedTaskSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().default(""),
  energyRequired: z.enum(["low", "medium", "high"]).default("medium"),
  estimatedMinutes: z.coerce.number().int().min(5).max(240).default(30),
  acceptanceCriteria: z.string().trim().min(1),
  proofMethod: z.string().trim().min(1),
  rewardPoints: z.coerce.number().int().min(0).max(100).default(10),
}) as z.ZodType<PlannedTask>;

export const planningOutputSchema = z.object({
  planTitle: z.string().trim().min(1).default("今日执行协议"),
  rationale: z.string().trim().min(1).default("基于当前目标与最近事件生成。"),
  tasks: z.array(plannedTaskSchema).min(1).max(3),
  risks: z.array(z.string().trim()).default([]),
}) as z.ZodType<PlanningOutput>;

export const reviewOutputSchema = z.object({
  summary: z.string().trim().min(1),
  honestDelta: z.string().trim().min(1),
  risks: z.array(z.string().trim()).default([]),
  tomorrowAdjustment: z.string().trim().min(1),
  emotionTags: z.array(z.string().trim()).default([]),
  keyMoment: z
    .object({
      type: z.enum(["low_point", "near_quit", "recovery", "peak", "promise"]),
      summary: z.string().trim().min(1),
      emotionalWeight: z.coerce.number().min(0).max(1).default(0.5),
    })
    .nullish()
    .default(null),
}) as z.ZodType<ReviewOutput>;

/** §6.6.2 微洞察 / 断链分析的极简输出 */
export const streakMessageSchema = z.object({
  message: z.string().trim().min(1).transform((v) => v.slice(0, 200)),
}) as z.ZodType<{ message: string }>;

/** §8 Decision Agent：今日净成长值 */
export const netGrowthSchema = z.object({
  netValue: z.coerce.number().min(-100).max(100),
  verdict: z.enum(["closer", "neutral", "further"]),
  positives: z
    .array(z.object({ label: z.string().trim().min(1), weight: z.coerce.number().min(0).max(100) }))
    .default([]),
  negatives: z
    .array(z.object({ label: z.string().trim().min(1), weight: z.coerce.number().min(0).max(100) }))
    .default([]),
  summary: z.string().trim().min(1),
}) as z.ZodType<NetGrowthOutput>;

/** §9 Decision Agent：选择前预测 */
export const choicePredictionSchema = z.object({
  options: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        alignmentScore: z.coerce.number().min(0).max(100),
        shortTermCost: z.string().trim().default(""),
        longTermGain: z.string().trim().default(""),
        risk: z.string().trim().default(""),
      }),
    )
    .min(1),
  recommendation: z.string().trim().min(1),
  warning: z.string().trim().optional(),
}) as z.ZodType<ChoicePredictionOutput>;

/** §9 人生路线模拟 */
export const pathSimulationSchema = z.object({
  paths: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        trajectory: z
          .array(
            z.object({
              horizon: z.string().trim().min(1),
              state: z.string().trim().min(1),
            }),
          )
          .default([]),
        endState: z.string().trim().min(1),
        alignmentScore: z.coerce.number().min(0).max(100),
        keyRisks: z.array(z.string().trim()).default([]),
      }),
    )
    .min(1),
  divergencePoint: z.string().trim().min(1),
  recommendation: z.string().trim().min(1),
}) as z.ZodType<PathSimulationOutput>;

/** §9 周期报告 LLM 叙事输出 */
export const periodReportSchema = z.object({
  headline: z.string().trim().min(1),
  narrative: z.string().trim().min(1),
  biggestWin: z.string().trim().min(1),
  biggestLeak: z.string().trim().min(1),
  nextFocus: z.string().trim().min(1),
  trend: z.enum(["up", "flat", "down"]).default("flat"),
}) as z.ZodType<PeriodReportOutput>;

/** §6.4 系统进化引擎输出 */
export const evolutionOutputSchema = z.object({
  targetKey: z.string().trim().min(1),
  changeNeeded: z.boolean(),
  reason: z.string().trim().min(1),
  newPrompt: z.string().trim().default(""),
}) as z.ZodType<EvolutionOutput>;

/** §6.7.3 辅助 Agent（健康管家等）统一输出 */
export const stewardOutputSchema = z.object({
  domain: z.enum(["health", "learning"]),
  assessment: z.string().trim().min(1),
  concernLevel: z.enum(["good", "watch", "alert"]).default("watch"),
  nudge: z.string().trim().min(1),
  companionLine: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.slice(0, 80)),
}) as z.ZodType<StewardOutput>;

/** §5.3 档案演化 Profile Agent 提议输出 */
export const profileEvolutionSchema = z.object({
  proposals: z
    .array(
      z.object({
        field: z.enum(["basicInfo", "traits", "motivations", "redLines", "longTermVision"]),
        subPath: z.string().trim().optional(),
        currentValue: z.unknown().optional(),
        proposedValue: z.unknown(),
        reason: z.string().trim().min(1),
        confidence: z.coerce.number().min(0).max(1).default(0.5),
      }),
    )
    .default([]),
}) as z.ZodType<ProfileEvolutionOutput>;

/** 经济官 Agent 输出（商城子系统规划书 §11 契约）*/
export const economyOutputSchema = z.object({
  appraisal: z.object({
    valueTier: bountyValueTier.default("light"),
    category: bountyCategory.default("other"),
    estimatedValueCny: z.coerce.number().min(0).default(0),
    estimatedBasis: z.string().trim().default(""),
    needsClarification: z.boolean().default(false),
    clarifyingQuestions: z.array(z.string().trim().min(1)).default([]),
  }),
  alignment: z.object({
    verdict: bountyAlignment.default("neutral"),
    relatedGoalIds: z.array(z.string().trim().min(1)).default([]),
    redLineHit: z.boolean().default(false),
    rationale: z.string().trim().default(""),
  }),
  judgment: z.object({
    recommendedPrice: z.coerce.number().min(0).default(0),
    impliedHorizonWeeks: z.coerce.number().min(0).default(0),
    keyFactors: z.array(z.string().trim().min(1)).default([]),
  }),
  verdict: z.enum(["price", "clarify", "reject"]).default("price"),
  companionLine: z
    .string()
    .trim()
    .min(1)
    .transform((v) => v.slice(0, 80)),
  rejectReason: z.string().trim().optional(),
}) as z.ZodType<EconomyOutput>;

export const companionOutputSchema = z.object({
  state: z.enum(companionStates as [CompanionState, ...CompanionState[]]).catch("idle"),
  dialogue: z
    .string()
    .trim()
    .min(1)
    .transform((value) => value.slice(0, 80)),
}) as z.ZodType<CompanionOutput>;

export interface StructuredParseResult<TData> {
  envelope: AgentOutputEnvelope<TData>;
  rawContent: string;
}

export function parseStructuredOutput<TData>(
  agentId: AgentId,
  rawContent: string,
  dataSchema: z.ZodType<TData>,
  fallbackData: TData,
): StructuredParseResult<TData> {
  const parsedJson = tryParseJson(rawContent);
  if (parsedJson.ok) {
    const dataCandidate = unwrapDataCandidate(parsedJson.value);
    const dataResult = dataSchema.safeParse(dataCandidate);
    if (dataResult.success) {
      return {
        rawContent,
        envelope: {
          schemaVersion: 1,
          agentId,
          summary: readSummary(parsedJson.value, dataResult.data),
          data: dataResult.data,
          warnings: readWarnings(parsedJson.value),
          fallbackUsed: false,
        },
      };
    }
  }

  return {
    rawContent,
    envelope: {
      schemaVersion: 1,
      agentId,
      summary: fallbackSummary(agentId, fallbackData),
      data: fallbackData,
      warnings: ["LLM output was not valid structured JSON; deterministic fallback was used."],
      fallbackUsed: true,
    },
  };
}

export function formatPlanningResponse(output: PlanningOutput): string {
  const tasks = output.tasks
    .map((task, index) => `${index + 1}. ${task.title} (${task.estimatedMinutes} 分钟)`)
    .join("\n");
  const risks = output.risks.length > 0 ? `\n风险：${output.risks.join("；")}` : "";
  return `${output.planTitle}\n${output.rationale}\n${tasks}${risks}`;
}

export function formatReviewResponse(output: ReviewOutput): string {
  const risks = output.risks.length > 0 ? `\n风险：${output.risks.join("；")}` : "";
  return `${output.summary}\n真实偏差：${output.honestDelta}${risks}\n明日调整：${output.tomorrowAdjustment}`;
}

export function fallbackPlanningOutput(): PlanningOutput {
  return {
    planTitle: "今日执行协议",
    rationale: "结构化输出不可用，使用最小闭环兜底计划。",
    tasks: [
      {
        title: "完成今日最小推进块",
        description: "用一个 45 分钟任务验证目标、任务、复盘闭环。",
        energyRequired: "medium",
        estimatedMinutes: 45,
        acceptanceCriteria: "产出一个可以被描述或截图证明的结果",
        proofMethod: "日终校准时用文字说明",
        rewardPoints: 15,
      },
    ],
    risks: ["当前为兜底计划，未充分利用上下文。"],
  };
}

export function fallbackReviewOutput(): ReviewOutput {
  return {
    summary: "日终校准已记录。",
    honestDelta: "需要继续补充客观任务完成证据。",
    risks: ["复盘输入不足时，系统可能低估真实阻力。"],
    tomorrowAdjustment: "保留一个 20-45 分钟最小推进块。",
    emotionTags: [],
  };
}

export const insightOutputSchema = z.object({
  coreInsight: z.string().trim().min(1),
  patterns: z
    .array(
      z.object({
        type: z.enum(["positive", "negative"]),
        description: z.string().trim().min(1),
      }),
    )
    .default([]),
  calibrationSuggestion: z.string().trim().min(1),
  credibilitySignal: z.enum(["high", "medium", "low"]).default("medium"),
}) as z.ZodType<InsightOutput>;

export const coachOutputSchema = z.object({
  question: z.string().trim().min(1),
  round: z.coerce.number().int().min(1).max(5).default(1),
  readyToEvaluate: z.boolean().default(false),
  impulseProbability: z.coerce.number().min(0).max(1).optional(),
  recommendation: z.enum(["proceed", "defer_3days", "reframe"]).optional(),
}) as z.ZodType<CoachOutput>;

export const reminderOutputSchema = z.object({
  shouldNotify: z.boolean(),
  type: z
    .enum(["task_due", "review_missed", "goal_stalled", "streak_at_risk", "none"])
    .default("none"),
  message: z.string().trim().default(""),
}) as z.ZodType<ReminderOutput>;

export function fallbackCompanionOutput(state: CompanionState = "idle"): CompanionOutput {
  return {
    state,
    dialogue: "协议已记录。我会看你接下来有没有把它变成行动。",
  };
}

function tryParseJson(content: string): { ok: true; value: unknown } | { ok: false } {
  const candidates = [
    content,
    content.match(/```json\s*([\s\S]*?)```/i)?.[1],
    content.slice(content.indexOf("{"), content.lastIndexOf("}") + 1),
  ].filter((candidate): candidate is string => Boolean(candidate?.trim()));

  for (const candidate of candidates) {
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      // Try the next extraction strategy.
    }
  }
  return { ok: false };
}

function unwrapDataCandidate(value: unknown): unknown {
  if (isRecord(value) && "data" in value) return value.data;
  return value;
}

function readSummary<TData>(value: unknown, data: TData): string {
  if (isRecord(value) && typeof value.summary === "string" && value.summary.trim()) {
    return value.summary.trim();
  }
  return fallbackSummary("orchestrator", data);
}

function readWarnings(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.warnings)) return [];
  return value.warnings.filter((item): item is string => typeof item === "string");
}

function fallbackSummary<TData>(_agentId: AgentId, data: TData): string {
  if (isRecord(data) && typeof data.summary === "string") return data.summary;
  if (isRecord(data) && typeof data.planTitle === "string") return data.planTitle;
  return "Structured output parsed.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
