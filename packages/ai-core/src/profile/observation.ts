import type {
  MbtiAxisEvidence,
  MbtiAxisKey,
  NetGrowthVerdict,
  NexusEvent,
  ObservedDim,
  ObservedDimValue,
  Profile,
  ProfileFieldPath,
  ProfileObservation,
  RedLineFit,
} from "@nexus/shared";
import { MBTI_AXIS_KEYS } from "@nexus/shared";

/**
 * 宿主档案 · 观测层（活体画像）确定性引擎（规划书 §6）。
 *
 * 纯函数、无 LLM、无 I/O —— 这是离线可跑、可测的护栏层；LLM 侧写是后置增强。
 * 只读 NexusEvent 的通用字段（occurredAt / category / type / tags / structured），
 * 对事件结构做防御式解读，因此对具体类目命名鲁棒、且易于单测构造。
 */

// ── MBTI 漂移阈值（规划书 §7.4）──────────────────────────────────────
export const MBTI_DRIFT_CONFIDENCE = 0.7;
export const MBTI_DRIFT_MIN_SAMPLES = 8;

export interface ObservationOptions {
  windowDays?: number;
  source?: "daily" | "deep-scan";
  now?: Date;
}

export interface EvolutionProposalDraft {
  field: ProfileFieldPath;
  subPath?: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  confidence: number;
}

// ── 小工具 ──────────────────────────────────────────────────────────
function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}
function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}
function hourOf(iso: string): number | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getHours();
}
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}
/** 置信度随样本量平滑爬升（n 达到 full 时约 0.86）*/
function confFromN(n: number, full: number): number {
  if (n <= 0) return 0;
  return clamp01(1 - Math.exp(-n / Math.max(1, full)));
}
function mean(xs: number[]): number {
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0;
}
/** 基尼系数：0=完全均匀，1=完全集中 */
function gini(counts: number[]): number {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total <= 0 || counts.length === 0) return 0;
  const sorted = [...counts].sort((a, b) => a - b);
  const cum = sorted.reduce((acc, v, i) => acc + (i + 1) * v, 0);
  const n = sorted.length;
  return clamp01((2 * cum) / (n * total) - (n + 1) / n);
}

const COMPLETION_STATUSES = new Set(["completed", "reviewed"]);
function isCompletion(e: NexusEvent): boolean {
  if (e.category === "task_completion") return true;
  return (
    e.category === "task_status_changed" && COMPLETION_STATUSES.has(asString(e.structured.toStatus))
  );
}
function isInitiation(e: NexusEvent): boolean {
  return e.category === "morning_plan" || e.category === "user_input";
}
function isCreative(e: NexusEvent): boolean {
  const tags = (e.tags ?? []).join(" ").toLowerCase();
  return (
    /creativ|创作|创意|design|设计|writing|写作/.test(tags) ||
    asString(e.category).includes("creative")
  );
}

function axisEvidence(
  a: string,
  b: string,
  aCount: number,
  bCount: number,
  full: number,
): MbtiAxisEvidence {
  const n = aCount + bCount;
  if (n === 0) return { lean: "", score: 0, confidence: 0, sampleN: 0 };
  const pA = aCount / n;
  return {
    lean: pA >= 0.5 ? a : b,
    score: clamp01(Math.abs(pA - 0.5) * 2),
    confidence: confFromN(n, full),
    sampleN: n,
  };
}

// ── 主入口 ──────────────────────────────────────────────────────────
export function computeProfileObservation(
  events: NexusEvent[],
  profile: Profile,
  options: ObservationOptions = {},
): ProfileObservation {
  const windowDays = options.windowDays ?? 14;
  const now = options.now ?? new Date();
  const source = options.source ?? "daily";
  const cutoff = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const win = events.filter((e) => {
    const t = new Date(e.occurredAt).getTime();
    return !Number.isNaN(t) && t >= cutoff && t <= now.getTime() + 60_000;
  });

  const completions = win.filter(isCompletion);
  const focusSessions = win.filter((e) => e.category === "focus_session");
  const initiations = win.filter(isInitiation);
  const netGrowths = win.filter((e) => e.category === "net_growth");
  const reviewDays = new Set(
    win.filter((e) => e.category === "daily_review").map((e) => dayKey(e.occurredAt)),
  );

  // ── rhythm：活动小时分布的集中度 + 高峰时段 ──
  const segments: Array<{ label: string; lo: number; hi: number }> = [
    { label: "清晨", lo: 5, hi: 8 },
    { label: "上午", lo: 8, hi: 12 },
    { label: "下午", lo: 12, hi: 18 },
    { label: "夜晚", lo: 18, hi: 24 },
    { label: "深夜", lo: 0, hi: 5 },
  ];
  const hours = win.map((e) => hourOf(e.occurredAt)).filter((h): h is number => h !== null);
  const segStats = segments.map((s) => ({
    label: s.label,
    count: hours.filter((h) => h >= s.lo && h < s.hi).length,
  }));
  const peakSeg = segStats.reduce((best, s) => (s.count > best.count ? s : best), {
    label: "",
    count: 0,
  });
  const rhythm: ObservedDimValue = {
    score: hours.length ? clamp01(peakSeg.count / hours.length) : 0,
    confidence: confFromN(hours.length, 20),
    sampleN: hours.length,
    note: hours.length ? `高峰在${peakSeg.label}` : "暂无活动数据",
  };

  // ── focus：番茄钟平均时长 ──
  const focusMins = focusSessions.map((e) => asNumber(e.structured.minutes) ?? 0);
  const avgFocus = mean(focusMins);
  const focus: ObservedDimValue = {
    score: clamp01(avgFocus / 50),
    confidence: confFromN(focusSessions.length, 6),
    sampleN: focusSessions.length,
    note: focusSessions.length
      ? `平均专注 ${Math.round(avgFocus)} 分钟 · ${focusSessions.length} 次`
      : "暂无深度专注记录",
  };

  // ── drive：主动发起强度 + 自评动机标签 ──
  const driveScore = clamp01(initiations.length / windowDays / 2);
  const motivationLabel = asString(
    (profile.traits as Record<string, unknown> | undefined)?.motivation,
  );
  const drive: ObservedDimValue = {
    score: driveScore,
    confidence: confFromN(initiations.length, 10),
    sampleN: initiations.length,
    note: `主动发起 ${initiations.length} 次${motivationLabel ? ` · 自评动机:${motivationLabel}` : ""}`,
  };

  // ── execution：完成在窗口内的均匀度（稳定持续 vs 冲刺爆发）──
  const perDay: number[] = Array.from({ length: windowDays }, () => 0);
  for (const e of completions) {
    const idx = Math.floor(
      (now.getTime() - new Date(e.occurredAt).getTime()) / (24 * 60 * 60 * 1000),
    );
    if (idx >= 0 && idx < windowDays) perDay[idx] = (perDay[idx] ?? 0) + 1;
  }
  const steadiness = completions.length >= 2 ? 1 - gini(perDay) : 0.5;
  const execution: ObservedDimValue = {
    score: clamp01(steadiness),
    confidence: confFromN(completions.length, 8),
    sampleN: completions.length,
    note:
      completions.length < 2
        ? "完成样本不足"
        : steadiness > 0.6
          ? "稳定持续"
          : steadiness < 0.4
            ? "冲刺爆发"
            : "节奏混合",
  };

  // ── discipline：净增长向好率 + 复盘覆盖 ──
  const closer = netGrowths.filter(
    (e) =>
      asString(e.structured.verdict) === "closer" || (asNumber(e.structured.netValue) ?? 0) > 0,
  ).length;
  const ngRate = netGrowths.length ? closer / netGrowths.length : 0.5;
  const reviewRate = clamp01(reviewDays.size / windowDays);
  const discipline: ObservedDimValue = {
    score: clamp01(0.6 * ngRate + 0.4 * reviewRate),
    confidence: confFromN(netGrowths.length + reviewDays.size, 8),
    sampleN: netGrowths.length + reviewDays.size,
    note: `净增长向好 ${closer}/${netGrowths.length} 天 · 复盘 ${reviewDays.size} 天`,
  };

  // ── creativity：创造类信号占比（信号稀疏时诚实低置信）──
  const creativeEvents = win.filter(isCreative);
  const creativity: ObservedDimValue = {
    score: creativeEvents.length
      ? clamp01(creativeEvents.length / Math.max(1, completions.length))
      : 0.2,
    confidence: confFromN(creativeEvents.length, 6),
    sampleN: creativeEvents.length,
    note: creativeEvents.length ? `创造类信号 ${creativeEvents.length} 条` : "暂无明显创造类信号",
  };

  const dimensions: Record<ObservedDim, ObservedDimValue> = {
    rhythm,
    focus,
    drive,
    execution,
    discipline,
    creativity,
  };

  // ── MBTI 行为证据（与自评基线并行）──
  const socialCount = win.filter(
    (e) => e.category === "user_input" || (e.tags ?? []).includes("social"),
  ).length;
  const soloCount = focusSessions.length;
  const concreteCount = completions.length;
  const abstractCount = win.filter((e) =>
    ["morning_plan", "insight_analysis", "path_simulation"].includes(asString(e.category)),
  ).length;
  const logicCount = win.filter((e) =>
    ["net_growth", "insight_analysis", "choice_prediction"].includes(asString(e.category)),
  ).length;
  const feelingCount = win.filter((e) =>
    ["companion_feedback", "low_valley"].includes(asString(e.category)),
  ).length;
  const planDays = new Set(
    win.filter((e) => e.category === "morning_plan").map((e) => dayKey(e.occurredAt)),
  );
  const plannedExec = completions.filter((e) => planDays.has(dayKey(e.occurredAt))).length;
  const improvisedExec = completions.length - plannedExec;

  const mbtiEvidence: Record<MbtiAxisKey, MbtiAxisEvidence> = {
    EI: axisEvidence("E", "I", socialCount, soloCount, 10),
    SN: axisEvidence("S", "N", concreteCount, abstractCount, 10),
    TF: axisEvidence("T", "F", logicCount, feelingCount, 8),
    JP: axisEvidence("J", "P", plannedExec, improvisedExec, 8),
  };

  // ── 红线契合度 ──
  const redLines = Array.isArray(profile.redLines) ? profile.redLines.filter((l) => l.trim()) : [];
  const redLineFit: RedLineFit[] = redLines.map((line) => {
    const breaches = win.filter(
      (e) => (e.tags ?? []).includes("redline_breach") && asString(e.structured.line) === line,
    ).length;
    return { line, adherence: breaches === 0 ? 1 : clamp01(1 - breaches / windowDays), breaches };
  });

  // ── 净增长判定（对照长期愿景）──
  const recentNg = netGrowths.slice(0, 3).map((e) => asNumber(e.structured.netValue) ?? 0);
  const avgNg = mean(recentNg);
  const netGrowthVerdict: NetGrowthVerdict =
    recentNg.length === 0 ? "neutral" : avgNg > 8 ? "closer" : avgNg < -8 ? "further" : "neutral";
  // 周期评级主信号：观测窗内净增长均值（区别于 recentNg 的近 3 条"方向"）
  const allNg = netGrowths.map((e) => asNumber(e.structured.netValue) ?? 0);
  const netGrowthScore = allNg.length ? Math.round(mean(allNg)) : 0;

  const verdictText = { closer: "更接近", neutral: "持平于", further: "更远离" }[netGrowthVerdict];
  const summary =
    win.length === 0
      ? `近 ${windowDays} 天暂无足够行为数据，画像继续观察中。`
      : `近 ${windowDays} 天观测：${rhythm.note}，自律 ${Math.round(discipline.score * 100)}%，执行${execution.note}，行为正${verdictText}理想人生。`;

  return {
    takenAt: now.toISOString(),
    windowDays,
    dimensions,
    mbtiEvidence,
    redLineFit,
    netGrowthVerdict,
    netGrowthScore,
    source,
    engine: "deterministic",
    summary,
  };
}

/**
 * P3/P4：MBTI 行为证据与自评基线显著相反时，生成高风险演化提议（只提议，必裁决）。
 * 自评基线缺失、或证据未达阈值时返回空。
 */
export function deriveMbtiProposals(
  observation: ProfileObservation,
  profile: Profile,
): EvolutionProposalDraft[] {
  const self = (profile.traits as Record<string, unknown> | undefined)?.mbti as
    | { type?: unknown; source?: unknown }
    | undefined;
  const selfType = asString(self?.type).toUpperCase();
  if (selfType.length !== 4 || self?.source !== "self") return [];

  const axisPos: Record<MbtiAxisKey, number> = { EI: 0, SN: 1, TF: 2, JP: 3 };
  const chars = selfType.split("");
  const flips: Array<{ from: string; to: string; confidence: number }> = [];
  for (const key of MBTI_AXIS_KEYS) {
    const ev = observation.mbtiEvidence[key];
    const pos = axisPos[key];
    const selfLetter = selfType[pos] ?? "";
    if (
      ev.lean &&
      ev.lean !== selfLetter &&
      ev.confidence >= MBTI_DRIFT_CONFIDENCE &&
      ev.sampleN >= MBTI_DRIFT_MIN_SAMPLES
    ) {
      chars[pos] = ev.lean;
      flips.push({ from: selfLetter, to: ev.lean, confidence: ev.confidence });
    }
  }
  if (flips.length === 0) return [];

  const newType = chars.join("");
  const reason = `行为证据与自评不一致：${flips
    .map((f) => `${f.from}→${f.to}（置信 ${Math.round(f.confidence * 100)}%）`)
    .join("，")}。是否把人格基线校准为 ${newType}？`;
  const confidence = mean(flips.map((f) => f.confidence));

  return [
    {
      field: "traits",
      subPath: "mbti",
      currentValue: self,
      proposedValue: {
        type: newType,
        source: "self",
        setAt: observation.takenAt,
        calibrated: true,
      },
      reason,
      confidence,
    },
  ];
}
