import type {
  AgentId,
  AgentOutputEnvelope,
  CompanionOutput,
  CompanionState,
  PlannedTask,
  PlanningOutput,
  ReviewOutput,
} from "@nexus/shared";
import { z } from "zod";

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
}) as z.ZodType<ReviewOutput>;

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
