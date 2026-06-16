import type { AttributeSet, NexusEvent, UserStreak } from "@nexus/shared";
import { describe, expect, it } from "vitest";
import { computeDeepAnalysis } from "./deep-analysis.js";

const EMPTY_ATTRS: AttributeSet = {
  intellect: 0,
  stamina: 0,
  focus: 0,
  willpower: 0,
  creativity: 0,
  order: 0,
};

function ev(category: string, daysAgo: number, structured: Record<string, unknown>): NexusEvent {
  return {
    id: `e-${category}-${daysAgo}-${Math.random()}`,
    userId: "test",
    source: "test",
    type: "system",
    category,
    rawPayload: {},
    structured,
    occurredAt: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    ingestedAt: new Date().toISOString(),
    confidence: 1,
    tags: [],
    relatedGoalIds: [],
    relatedTaskIds: [],
  };
}

describe("computeDeepAnalysis", () => {
  it("buckets metrics by week and detects rising net growth", () => {
    const events: NexusEvent[] = [
      // 旧的一周：低净成长
      ev("net_growth", 40, { netValue: 2 }),
      ev("net_growth", 39, { netValue: 4 }),
      // 近一周：高净成长
      ev("net_growth", 3, { netValue: 30 }),
      ev("net_growth", 2, { netValue: 28 }),
      // 任务完成
      ev("task_status_changed", 3, { toStatus: "completed" }),
      ev("task_status_changed", 2, { toStatus: "completed" }),
      // 健康 + 财务
      ev("health_day", 5, { steps: 9000 }),
      ev("finance_day", 5, { expense: 200 }),
    ];
    const streaks: UserStreak[] = [
      { category: "task_completion", goalId: null, currentStreak: 3, longestStreak: 9, lastActiveDate: "2026-06-15", brokenAt: ["2026-05-01", "2026-05-20"] },
    ];

    const result = computeDeepAnalysis({
      events,
      attributes: EMPTY_ATTRS,
      credibilityScore: 1.2,
      currentLevel: 5,
      streaks,
      windowDays: 84,
    });

    expect(result.netGrowthTrend.length).toBeGreaterThan(0);
    expect(result.taskTrend.reduce((s, p) => s + p.value, 0)).toBe(2);
    expect(result.healthTrend.length).toBeGreaterThan(0); // 有健康数据
    expect(result.financeTrend.length).toBeGreaterThan(0);
    expect(result.streakHistory[0]).toMatchObject({ longest: 9, breaks: 2 });
    // 净成长从 ~3 升到 ~29 → 观察应含"上升"
    expect(result.observations.some((o) => o.includes("上升"))).toBe(true);
    expect(result.observations.some((o) => o.includes("可信度 1.20"))).toBe(true);
  });

  it("omits health/finance trends when no such events", () => {
    const result = computeDeepAnalysis({
      events: [ev("task_status_changed", 1, { toStatus: "completed" })],
      attributes: EMPTY_ATTRS,
      credibilityScore: 1,
      currentLevel: 1,
      streaks: [],
      windowDays: 28,
    });
    expect(result.healthTrend).toHaveLength(0);
    expect(result.financeTrend).toHaveLength(0);
    expect(result.taskTrend.reduce((s, p) => s + p.value, 0)).toBe(1);
  });
});
