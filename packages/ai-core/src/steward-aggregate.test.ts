import type { StewardOutput } from "@nexus/shared";
import { describe, expect, it } from "vitest";
import { aggregateStewardLines, aggregateStewardState } from "./steward-aggregate.js";

function steward(over: Partial<StewardOutput>): StewardOutput {
  return {
    domain: "health",
    assessment: "a",
    concernLevel: "watch",
    nudge: "走 20 分钟",
    companionLine: "今晚陪我走 20 分钟。",
    ...over,
  };
}

describe("aggregateStewardLines (多 Agent 汇总成一个声音)", () => {
  it("returns empty for no outputs", () => {
    expect(aggregateStewardLines([])).toBe("");
  });

  it("passes through a single steward line", () => {
    const line = aggregateStewardLines([steward({ companionLine: "就这一句。" })]);
    expect(line).toBe("就这一句。");
  });

  it("merges two into one voice, most severe leads", () => {
    const line = aggregateStewardLines([
      steward({ domain: "health", concernLevel: "watch", companionLine: "身体还行。" }),
      steward({ domain: "learning", concernLevel: "alert", companionLine: "脑子荒废了，写点东西。", nudge: "写 200 字笔记" }),
    ]);
    // alert（learning）领衔
    expect(line.startsWith("脑子荒废了，写点东西。")).toBe(true);
    // 另一域以短句附后，提到「身体」
    expect(line).toContain("身体也别松");
    expect(line.length).toBeLessThanOrEqual(140);
  });

  it("state is caring if any alert, else focus", () => {
    expect(aggregateStewardState([steward({ concernLevel: "good" })])).toBe("focus");
    expect(aggregateStewardState([steward({ concernLevel: "alert" })])).toBe("caring");
  });
});
