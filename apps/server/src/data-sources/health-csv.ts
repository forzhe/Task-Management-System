import type { HealthDaySummary, NormalizedSignal } from "@nexus/shared";
import { findColumn, normalizeDate, normalizeHeader, parseNumber, splitCsvLine } from "./csv-utils.js";

/**
 * §6.7.1 DataSource 契约：任意源把原始输入归一化为 NormalizedSignal[]。
 * 后续日历/财务源实现同一接口。
 */
export interface DataSource {
  kind: NormalizedSignal["kind"];
  mode: "csv_import" | "oauth" | "local_rest";
  parse(input: string): NormalizedSignal[];
}

/** 表头关键词 → 指标映射（兼容小米/Zepp/Keep 等中英文导出）*/
const HEADER_MATCHERS: Array<{ metric: string; unit: string; keys: string[] }> = [
  { metric: "steps", unit: "count", keys: ["step", "步数", "步"] },
  {
    metric: "active_minutes",
    unit: "min",
    keys: ["active", "活动分钟", "活动时长", "活跃分钟"],
  },
  {
    metric: "workout_minutes",
    unit: "min",
    keys: ["workout", "exercise", "运动时长", "锻炼时长", "训练时长", "运动分钟"],
  },
  { metric: "sleep_hours", unit: "hour", keys: ["sleep", "睡眠"] },
  {
    metric: "resting_hr",
    unit: "bpm",
    keys: ["resting", "静息心率", "心率", "heart"],
  },
];

const DATE_KEYS = ["date", "日期", "time", "时间", "day"];

export class HealthCsvSource implements DataSource {
  readonly kind = "health" as const;
  readonly mode = "csv_import" as const;

  parse(input: string): NormalizedSignal[] {
    const lines = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    if (lines.length < 2) return [];

    const header = splitCsvLine(lines[0] ?? "").map(normalizeHeader);
    const dateCol = findColumn(header, DATE_KEYS);
    if (dateCol === -1) return [];

    // 每个指标列 → matcher（取第一个命中的列）
    const metricCols: Array<{ col: number; metric: string; unit: string }> = [];
    for (const matcher of HEADER_MATCHERS) {
      const col = findColumn(header, matcher.keys);
      if (col !== -1) {
        metricCols.push({ col, metric: matcher.metric, unit: matcher.unit });
      }
    }
    if (metricCols.length === 0) return [];

    const signals: NormalizedSignal[] = [];
    for (let i = 1; i < lines.length; i += 1) {
      const cells = splitCsvLine(lines[i] ?? "");
      const date = normalizeDate(cells[dateCol] ?? "");
      if (!date) continue;
      for (const mc of metricCols) {
        const value = parseNumber(cells[mc.col] ?? "");
        if (value === null) continue;
        signals.push({ kind: "health", metric: mc.metric, value, unit: mc.unit, date });
      }
    }
    return signals;
  }
}

/** 把健康信号按日聚合（同日同指标取最大值，容忍重复导出）*/
export function summarizeHealthByDay(signals: NormalizedSignal[]): HealthDaySummary[] {
  const byDate = new Map<string, HealthDaySummary>();
  for (const s of signals) {
    const day = byDate.get(s.date) ?? { date: s.date };
    const assign = (key: keyof HealthDaySummary) => {
      const prev = day[key];
      day[key] = (typeof prev === "number" ? Math.max(prev, s.value) : s.value) as never;
    };
    if (s.metric === "steps") assign("steps");
    else if (s.metric === "active_minutes") assign("activeMinutes");
    else if (s.metric === "workout_minutes") assign("workoutMinutes");
    else if (s.metric === "sleep_hours") assign("sleepHours");
    else if (s.metric === "resting_hr") assign("restingHeartRate");
    byDate.set(s.date, day);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 体力属性奖励公式（§6.5 防刷精神：每日封顶，避免 CSV 灌水）。
 * workout 1x + active 0.1x + 步数达标奖励 + 睡眠达标奖励，单日上限 60。
 */
export function staminaXpForDay(day: HealthDaySummary): number {
  let xp = 0;
  xp += (day.workoutMinutes ?? 0) * 1;
  xp += (day.activeMinutes ?? 0) * 0.1;
  if ((day.steps ?? 0) >= 8000) xp += 5;
  if (day.sleepHours !== undefined && day.sleepHours >= 7 && day.sleepHours <= 9) xp += 5;
  return Math.min(60, Math.round(xp));
}
