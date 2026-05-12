import type { AgentContext, AgentResult } from "@nexus/shared";

const crisisTerms = ["自杀", "轻生", "伤害自己", "伤害别人", "suicide", "kill myself"];

export class SafetyAgent {
  run(context: AgentContext, draft: AgentResult): AgentResult {
    const text = [context.message, draft.response].filter(Boolean).join("\n").toLowerCase();
    const flags = crisisTerms.filter((term) => text.includes(term.toLowerCase()));
    if (flags.length === 0) return draft;
    return {
      ...draft,
      safetyFlags: flags,
      response:
        "我注意到这里可能涉及高风险内容。请优先联系身边可信任的人或当地紧急服务；NEXUS-7 可以陪你整理信息，但不能替代专业危机支持。",
    };
  }
}
