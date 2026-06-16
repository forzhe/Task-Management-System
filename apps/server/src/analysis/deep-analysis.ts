import type {
  AttributeSet,
  DeepAnalysis,
  NexusEvent,
  TrendPoint,
  UserStreak,
} from "@nexus/shared";

export interface DeepAnalysisInput {
  events: NexusEvent[];
  attributes: AttributeSet;
  credibilityScore: number;
  currentLevel: number;
  streaks: UserStreak[];
  windowDays?: number;
  now?: number;
}

/** 某日期所在周的周一（YYYY-MM-DD），用作周分桶键 */
function weekStart(d: Date): string {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (copy.getDay() + 6) % 7; // 周一=0
  copy.setDate(copy.getDate() - day);
  const y = copy.getFullYear();
  const m = String(copy.getMonth() + 1).padStart(2, "0");
  const dd = String(copy.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function trendDirection(points: TrendPoint[]): "up" | "flat" | "down" {
  if (points.length < 2) return "flat";
  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);
  const avg = (arr: TrendPoint[]) =>
    arr.length ? arr.reduce((s, p) => s + p.value, 0) / arr.length : 0;
  const delta = avg(secondHalf) - avg(firstHalf);
  const scale = Math.max(1, Math.abs(avg(firstHalf)));
  if (delta > scale * 0.1) return "up";
  if (delta < -scale * 0.1) return "down";
  return "flat";
}

/**
 * §7.3 Lv.50 深度长期趋势：把事件流按周分桶，计算多指标趋势 + 确定性观察。
 * 纯函数，不调 LLM、不触库，便于单测。
 */
export function computeDeepAnalysis(input: DeepAnalysisInput): DeepAnalysis {
  const windowDays = input.windowDays ?? 84; // 默认 12 周
  const nowMs = input.now ?? Date.now();
  const sinceMs = nowMs - windowDays * 86400000;

  // 生成周桶（按周一升序）
  const weekKeys: string[] = [];
  const seen = new Set<string>();
  for (let t = sinceMs; t <= nowMs; t += 86400000) {
    const k = weekStart(new Date(t));
    if (!seen.has(k)) {
      seen.add(k);
      weekKeys.push(k);
    }
  }

  const netByWeek = new Map<string, number[]>();
  const taskByWeek = new Map<string, number>();
  const stepsByWeek = new Map<string, number[]>();
  const expenseByWeek = new Map<string, number>();
  let hasHealth = false;
  let hasFinance = false;

  const pushTo = (map: Map<string, number[]>, key: string, value: number) => {
    const arr = map.get(key) ?? [];
    arr.push(value);
    map.set(key, arr);
  };

  for (const e of input.events) {
    const occurred = new Date(e.occurredAt);
    if (occurred.getTime() < sinceMs) continue;
    const wk = weekStart(occurred);
    const s = e.structured as Record<string, unknown>;
    if (e.category === "net_growth" && typeof s.netValue === "number") {
      pushTo(netByWeek, wk, s.netValue);
    } else if (e.category === "task_status_changed" && s.toStatus === "completed") {
      taskByWeek.set(wk, (taskByWeek.get(wk) ?? 0) + 1);
    } else if (e.category === "health_day") {
      hasHealth = true;
      if (typeof s.steps === "number") pushTo(stepsByWeek, wk, s.steps);
    } else if (e.category === "finance_day" && typeof s.expense === "number") {
      hasFinance = true;
      expenseByWeek.set(wk, (expenseByWeek.get(wk) ?? 0) + s.expense);
    }
  }

  const label = (wk: string) => wk.slice(5); // MM-DD
  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

  const netGrowthTrend: TrendPoint[] = weekKeys.map((wk) => ({
    period: label(wk),
    value: avg(netByWeek.get(wk) ?? []),
  }));
  const taskTrend: TrendPoint[] = weekKeys.map((wk) => ({
    period: label(wk),
    value: taskByWeek.get(wk) ?? 0,
  }));
  const healthTrend: TrendPoint[] = hasHealth
    ? weekKeys.map((wk) => ({ period: label(wk), value: avg(stepsByWeek.get(wk) ?? []) }))
    : [];
  const financeTrend: TrendPoint[] = hasFinance
    ? weekKeys.map((wk) => ({ period: label(wk), value: Math.round(expenseByWeek.get(wk) ?? 0) }))
    : [];

  const streakHistory = input.streaks.map((s) => ({
    category: s.category,
    longest: s.longestStreak,
    breaks: s.brokenAt.length,
  }));

  // 确定性观察
  const observations: string[] = [];
  const ngDir = trendDirection(netGrowthTrend);
  const totalTasks = taskTrend.reduce((s, p) => s + p.value, 0);
  observations.push(
    `近 ${weekKeys.length} 周净成长值${ngDir === "up" ? "呈上升趋势" : ngDir === "down" ? "在下滑——值得警惕" : "总体平稳"}。`,
  );
  observations.push(`累计完成 ${totalTasks} 个任务。`);
  const bestStreak = [...streakHistory].sort((a, b) => b.longest - a.longest)[0];
  if (bestStreak && bestStreak.longest > 0) {
    observations.push(
      `最长习惯链 ${bestStreak.longest} 天（断过 ${bestStreak.breaks} 次）——韧性比单次冲刺更重要。`,
    );
  }
  if (healthTrend.length) {
    const activeWeeks = healthTrend.filter((p) => p.value > 0).length;
    observations.push(`${activeWeeks}/${weekKeys.length} 周有健康记录，身体维度已纳入长期视野。`);
  }
  if (financeTrend.length) {
    const totalExpense = financeTrend.reduce((s, p) => s + p.value, 0);
    observations.push(`期间总支出 ${totalExpense}，财务已纳入"完整的你"。`);
  }
  observations.push(
    `当前可信度 ${input.credibilityScore.toFixed(2)} · 觉醒等级 Lv.${input.currentLevel}。`,
  );

  return {
    windowDays,
    weeks: weekKeys.length,
    netGrowthTrend,
    taskTrend,
    healthTrend,
    financeTrend,
    streakHistory,
    attributeSnapshot: input.attributes,
    credibilityNow: input.credibilityScore,
    levelNow: input.currentLevel,
    observations,
  };
}
