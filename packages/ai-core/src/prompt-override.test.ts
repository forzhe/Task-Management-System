import { isEvolutionTargetAllowed } from "@nexus/shared";
import { afterEach, describe, expect, it } from "vitest";
import {
  clearPromptOverride,
  getAgentPrompt,
  getPromptSystem,
  setPromptOverride,
} from "./prompt-registry.js";

describe("runtime prompt override (§6.4)", () => {
  afterEach(() => {
    clearPromptOverride("review");
    clearPromptOverride("planning");
  });

  it("getAgentPrompt returns override when set, base otherwise", () => {
    const base = getAgentPrompt("review").system;
    setPromptOverride("review", "进化后的复盘提示词");
    const overridden = getAgentPrompt("review");
    expect(overridden.system).toBe("进化后的复盘提示词");
    expect(overridden.version).toContain("+evo");
    clearPromptOverride("review");
    expect(getAgentPrompt("review").system).toBe(base);
  });

  it("getPromptSystem reflects the active (overridden) prompt", () => {
    setPromptOverride("planning", "X");
    expect(getPromptSystem("planning")).toBe("X");
    expect(getPromptSystem("nonexistent-key")).toBeNull();
  });
});

describe("evolution forbidden targets (§6.4 hardcoded guard)", () => {
  it("blocks safety and self, allows behavioral agents", () => {
    expect(isEvolutionTargetAllowed("safety")).toBe(false);
    expect(isEvolutionTargetAllowed("evolution")).toBe(false);
    expect(isEvolutionTargetAllowed("review")).toBe(true);
    expect(isEvolutionTargetAllowed("planning")).toBe(true);
    // 不在可进化白名单的 key 也拒绝
    expect(isEvolutionTargetAllowed("decision_path")).toBe(false);
  });
});
