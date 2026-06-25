import { describe, expect, it } from "vitest";
import {
  clampToHorizon,
  classifyCategory,
  computeDeterministicPrice,
  credibilityMultiplier,
  effectiveRate,
  estimateAlignment,
  estimateValueTier,
  evaluateRecalibration,
  median,
} from "./pricing.js";

describe("credibilityMultiplier", () => {
  it("rewards trust with a discount and penalizes low credibility", () => {
    expect(credibilityMultiplier(1.8)).toBe(0.85);
    expect(credibilityMultiplier(1.2)).toBe(1.0);
    expect(credibilityMultiplier(0.7)).toBe(1.15);
    expect(credibilityMultiplier(0.3)).toBe(1.3);
  });
});

describe("effectiveRate", () => {
  it("falls back to the default rate when earning history is empty", () => {
    expect(effectiveRate(0)).toBe(200);
    expect(effectiveRate(-5)).toBe(200);
    expect(effectiveRate(800)).toBe(800);
  });
});

describe("clampToHorizon", () => {
  it("lifts too-cheap prices to the floor (no instant-win)", () => {
    const r = clampToHorizon(10, 800);
    expect(r.clampApplied).toBe("floor");
    expect(r.impliedHorizonWeeks).toBeCloseTo(0.3, 1);
  });

  it("caps too-expensive prices at the ceiling (no demoralizing price)", () => {
    const r = clampToHorizon(1_000_000, 800);
    expect(r.clampApplied).toBe("ceiling");
    expect(r.impliedHorizonWeeks).toBeLessThanOrEqual(29);
  });

  it("leaves a reasonable price untouched", () => {
    const r = clampToHorizon(9600, 800);
    expect(r.clampApplied).toBe("none");
    expect(r.price).toBe(9600);
    expect(r.impliedHorizonWeeks).toBeCloseTo(12, 1);
  });
});

describe("computeDeterministicPrice", () => {
  it("prices a flagship-tier reward within its target horizon band", () => {
    const out = computeDeterministicPrice({
      rWeek: 800,
      credibility: 1.2,
      valueTier: "large",
      alignment: "neutral",
    });
    // 大奖励目标 8-16 周
    expect(out.impliedHorizonWeeks).toBeGreaterThanOrEqual(8);
    expect(out.impliedHorizonWeeks).toBeLessThanOrEqual(16);
  });

  it("gives aligned (tool-like) rewards a discount vs indulgent ones", () => {
    const base = { rWeek: 800, credibility: 1.2, valueTier: "medium" as const };
    const aligned = computeDeterministicPrice({ ...base, alignment: "aligned" });
    const indulgent = computeDeterministicPrice({ ...base, alignment: "indulgent" });
    expect(aligned.price).toBeLessThan(indulgent.price);
  });

  it("does not produce an absurd price for a brand-new host with no history", () => {
    const out = computeDeterministicPrice({
      rWeek: 0,
      credibility: 1.0,
      valueTier: "large",
      alignment: "neutral",
    });
    // 回退默认率 200/周，隐含周期仍落在护栏内
    expect(out.impliedHorizonWeeks).toBeLessThanOrEqual(28);
    expect(out.price).toBeGreaterThan(0);
  });
});

describe("estimateValueTier", () => {
  it("uses host reference price when given", () => {
    expect(estimateValueTier("某物", 5000).tier).toBe("large");
    expect(estimateValueTier("某物", 20000).tier).toBe("major");
    expect(estimateValueTier("某物", 80).tier).toBe("light");
  });

  it("falls back to a keyword dictionary", () => {
    expect(estimateValueTier("想要一部新手机").tier).toBe("large");
    expect(estimateValueTier("一杯奶茶").tier).toBe("small");
  });
});

describe("median", () => {
  it("suppresses a single-week spike (sustained signal)", () => {
    expect(median([4, 4, 4, 400])).toBe(4); // 一周爆发不算节奏变化
    expect(median([400, 400, 400, 400])).toBe(400); // 持续才算
    expect(median([4, 4, 400, 400])).toBe(202); // 两周持续提升 → 触发
  });
});

describe("evaluateRecalibration", () => {
  const base = {
    currentPrice: 68,
    rateAtPricing: 4,
    targetHorizonWeeks: 17,
    balance: 30,
    locked: false,
  };

  it("re-prices up to keep the same effort when the sustained rate jumps", () => {
    const r = evaluateRecalibration({ ...base, currentRate: 400 });
    expect(r.action).toBe("reprice");
    expect(r.direction).toBe("up");
    expect(r.newPrice).toBe(6800); // 400 × 17 周
  });

  it("re-prices down (gentler) when the sustained rate collapses", () => {
    const r = evaluateRecalibration({
      currentPrice: 6800,
      rateAtPricing: 400,
      targetHorizonWeeks: 17,
      currentRate: 100,
      balance: 100,
      locked: false,
    });
    expect(r.action).toBe("reprice");
    expect(r.direction).toBe("down");
    expect(r.newPrice).toBe(1700); // 100 × 17
  });

  it("does nothing inside the hysteresis band (small drift)", () => {
    expect(evaluateRecalibration({ ...base, currentRate: 8 }).action).toBe("none"); // 2× < 2.5×
  });

  it("locks (never raises) once you are ~90% there or can afford it", () => {
    expect(evaluateRecalibration({ ...base, currentRate: 400, balance: 64 }).action).toBe("lock");
    expect(evaluateRecalibration({ ...base, currentRate: 400, balance: 9999 }).action).toBe("lock");
  });

  it("never touches an already-locked bounty", () => {
    expect(evaluateRecalibration({ ...base, currentRate: 400, locked: true }).action).toBe("none");
  });
});

describe("classifyCategory", () => {
  it("classifies rewards by what they are", () => {
    expect(classifyCategory("想要一部新手机")).toBe("electronics");
    expect(classifyCategory("一杯奶茶")).toBe("food");
    expect(classifyCategory("周末出去旅行")).toBe("travel");
    expect(classifyCategory("买双跑步鞋健身")).toBe("fitness");
    expect(classifyCategory("一件说不清的东西")).toBe("other");
  });
});

describe("estimateAlignment", () => {
  it("flags red-line conflicts", () => {
    const r = estimateAlignment({
      text: "买个游戏机放松",
      goals: [],
      redLines: ["不玩游戏"],
    });
    expect(r.verdict).toBe("conflict");
    expect(r.redLineHit).toBe(true);
  });

  it("marks rewards that share a keyword with an active goal as aligned", () => {
    const r = estimateAlignment({
      text: "买一套跑步装备",
      goals: [{ id: "g1", title: "坚持跑步" }],
      redLines: [],
    });
    expect(r.verdict).toBe("aligned");
    expect(r.relatedGoalIds).toContain("g1");
  });

  it("treats unrelated indulgences as indulgent and other things as neutral", () => {
    expect(estimateAlignment({ text: "一杯奶茶", goals: [], redLines: [] }).verdict).toBe(
      "indulgent",
    );
    expect(estimateAlignment({ text: "一台显示器", goals: [], redLines: [] }).verdict).toBe(
      "neutral",
    );
  });
});
