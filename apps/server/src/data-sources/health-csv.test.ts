import { describe, expect, it } from "vitest";
import { HealthCsvSource, staminaXpForDay, summarizeHealthByDay } from "./health-csv.js";

describe("HealthCsvSource", () => {
  const source = new HealthCsvSource();

  it("parses English headers into normalized signals", () => {
    const csv = [
      "date,steps,workout minutes,sleep hours",
      "2026-06-14,9200,45,7.5",
      "2026-06-15,6100,0,6.2",
    ].join("\n");
    const signals = source.parse(csv);
    // 2 天 × 3 指标 = 6 信号
    expect(signals).toHaveLength(6);
    expect(signals.every((s) => s.kind === "health")).toBe(true);
    const steps = signals.filter((s) => s.metric === "steps");
    expect(steps.map((s) => s.value)).toEqual([9200, 6100]);
  });

  it("recognizes Chinese headers (小米/Zepp style) and slash dates", () => {
    const csv = ["日期,步数,运动时长,睡眠", "2026/06/14,12000,60,8", "2026/6/15,3000,0,5"].join("\n");
    const signals = source.parse(csv);
    const days = summarizeHealthByDay(signals);
    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: "2026-06-14", steps: 12000, workoutMinutes: 60, sleepHours: 8 });
    expect(days[1]?.date).toBe("2026-06-15");
  });

  it("returns empty when no date column or no metric columns", () => {
    expect(source.parse("foo,bar\n1,2")).toHaveLength(0);
    expect(source.parse("date\n2026-06-14")).toHaveLength(0);
    expect(source.parse("")).toHaveLength(0);
  });

  it("computes capped stamina xp with bonuses", () => {
    // workout 60 + active 0 + steps>=8000(+5) + sleep in [7,9](+5) = 70 → 封顶 60
    expect(staminaXpForDay({ date: "d", workoutMinutes: 60, steps: 9000, sleepHours: 8 })).toBe(60);
    // 仅 3000 步、无运动、睡眠 5h → 0
    expect(staminaXpForDay({ date: "d", steps: 3000, sleepHours: 5, workoutMinutes: 0 })).toBe(0);
    // active 30 → 3xp，步数达标 +5 = 8
    expect(staminaXpForDay({ date: "d", activeMinutes: 30, steps: 8000 })).toBe(8);
  });
});
