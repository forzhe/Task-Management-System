import type { NexusEvent, Profile } from "@nexus/shared";
import { assessProfileGrade } from "@nexus/shared";
import { describe, expect, it } from "vitest";
import { computeProfileObservation, deriveMbtiProposals } from "./observation.js";

const NOW = new Date("2026-06-26T12:00:00"); // 本地时区，避免 CI 时区漂移

// occurredAt 一律用「无 Z」本地时间字符串，确保 getHours() 可控
function mkEvent(over: Partial<NexusEvent> & { occurredAt: string }): NexusEvent {
  return {
    id: Math.random().toString(36).slice(2),
    userId: "u1",
    source: "test",
    type: over.type ?? "action",
    category: over.category ?? null,
    rawPayload: {},
    structured: over.structured ?? {},
    embedding: null,
    occurredAt: over.occurredAt,
    ingestedAt: over.occurredAt,
    confidence: 1,
    tags: over.tags ?? [],
    relatedGoalIds: [],
    relatedTaskIds: [],
  };
}

function mkProfile(over: Partial<Profile> = {}): Profile {
  return {
    userId: "u1",
    basicInfo: {},
    traits: {},
    motivations: {},
    redLines: [],
    longTermVision: {},
    updatedAt: "2026-06-01T00:00:00",
    version: 1,
    ...over,
  };
}

describe("computeProfileObservation", () => {
  it("returns an honest empty/low-confidence snapshot with no events", () => {
    const o = computeProfileObservation([], mkProfile(), { now: NOW });
    expect(o.engine).toBe("deterministic");
    expect(o.netGrowthVerdict).toBe("neutral");
    expect(o.dimensions.focus.sampleN).toBe(0);
    expect(o.dimensions.focus.confidence).toBe(0);
    expect(o.summary).toContain("观察中");
  });

  it("detects a morning rhythm peak", () => {
    const events = [22, 23, 24, 25, 26, 22, 23, 24, 25, 26].map((d) =>
      mkEvent({
        category: "task_status_changed",
        structured: { toStatus: "completed" },
        occurredAt: `2026-06-${d}T07:30:00`,
      }),
    );
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    expect(o.dimensions.rhythm.note).toContain("清晨");
    expect(o.dimensions.rhythm.score).toBeGreaterThan(0.5);
  });

  it("scores focus from pomodoro session minutes", () => {
    const events = [50, 50, 50].map((m, i) =>
      mkEvent({
        category: "focus_session",
        structured: { minutes: m },
        occurredAt: `2026-06-2${4 + (i % 2)}T09:00:00`,
      }),
    );
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    expect(o.dimensions.focus.score).toBe(1);
    expect(o.dimensions.focus.sampleN).toBe(3);
  });

  it("reads net-growth verdict and lifts discipline", () => {
    const events = [
      { netValue: 30, verdict: "closer" },
      { netValue: 20, verdict: "closer" },
    ].map((s, i) =>
      mkEvent({ category: "net_growth", structured: s, occurredAt: `2026-06-2${5 + i}T20:00:00` }),
    );
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    expect(o.netGrowthVerdict).toBe("closer");
    expect(o.dimensions.discipline.score).toBeGreaterThan(0.5);
  });

  it("flags red-line breaches", () => {
    const profile = mkProfile({ redLines: ["不冲动消费"] });
    const events = [
      mkEvent({
        category: "shop_purchase",
        tags: ["redline_breach"],
        structured: { line: "不冲动消费" },
        occurredAt: "2026-06-25T10:00:00",
      }),
    ];
    const o = computeProfileObservation(events, profile, { now: NOW });
    const [fit] = o.redLineFit;
    expect(fit?.breaches).toBe(1);
    expect(fit?.adherence ?? 1).toBeLessThan(1);
  });

  it("builds MBTI behavioral evidence leaning E from social initiations", () => {
    const events = Array.from({ length: 15 }, (_, i) =>
      mkEvent({ category: "user_input", occurredAt: `2026-06-${20 + (i % 6)}T10:00:00` }),
    );
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    expect(o.mbtiEvidence.EI.lean).toBe("E");
    expect(o.mbtiEvidence.EI.confidence).toBeGreaterThan(0.7);
  });
});

describe("deriveMbtiProposals", () => {
  function strongEEvidenceObservation() {
    const events = Array.from({ length: 15 }, (_, i) =>
      mkEvent({ category: "user_input", occurredAt: `2026-06-${20 + (i % 6)}T10:00:00` }),
    );
    return computeProfileObservation(events, mkProfile(), { now: NOW });
  }

  it("proposes a high-risk MBTI calibration when behavior contradicts the self baseline", () => {
    const o = strongEEvidenceObservation();
    const profile = mkProfile({ traits: { mbti: { type: "INTJ", source: "self" } } });
    const proposals = deriveMbtiProposals(o, profile);
    expect(proposals).toHaveLength(1);
    const [p] = proposals;
    expect(p?.field).toBe("traits");
    expect(p?.subPath).toBe("mbti");
    expect((p?.proposedValue as { type: string } | undefined)?.type).toBe("ENTJ");
  });

  it("stays silent without a self-declared baseline", () => {
    const o = strongEEvidenceObservation();
    expect(deriveMbtiProposals(o, mkProfile())).toHaveLength(0);
  });

  it("stays silent when the self baseline already matches the evidence", () => {
    const o = strongEEvidenceObservation();
    const profile = mkProfile({ traits: { mbti: { type: "ENTJ", source: "self" } } });
    expect(deriveMbtiProposals(o, profile)).toHaveLength(0);
  });
});

describe("assessProfileGrade", () => {
  it("awards a top grade for strong net growth + streak + credibility", () => {
    const events = [
      ...Array.from({ length: 5 }, (_, i) =>
        mkEvent({
          category: "net_growth",
          structured: { netValue: 40, verdict: "closer" },
          occurredAt: `2026-06-2${i + 1}T20:00:00`,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        mkEvent({ category: "daily_review", occurredAt: `2026-06-2${i + 1}T21:00:00` }),
      ),
    ];
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    const a = assessProfileGrade({ observation: o, credibility: 1.6, longestStreak: 30 });
    expect(["S", "A"]).toContain(a.grade);
    expect(a.statusTone).toBe("good");
    expect(a.verdict).toBe("closer");
  });

  it("is alignment-anchored: sinking net growth drags the grade down", () => {
    const events = Array.from({ length: 4 }, (_, i) =>
      mkEvent({
        category: "net_growth",
        structured: { netValue: -35, verdict: "further" },
        occurredAt: `2026-06-2${i + 2}T20:00:00`,
      }),
    );
    const o = computeProfileObservation(events, mkProfile(), { now: NOW });
    const a = assessProfileGrade({ observation: o, credibility: 0.8, longestStreak: 0 });
    expect(["C", "D"]).toContain(a.grade);
    expect(a.verdict).toBe("further");
    expect(a.statusTone).toBe("alert");
  });

  it("returns an honest empty assessment without an observation", () => {
    const a = assessProfileGrade({ observation: null });
    expect(a.statusLabel).toBe("尚无评级");
    expect(a.weakestDim).toBeNull();
  });
});
