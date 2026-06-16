import type { CompanionState, StewardOutput } from "@nexus/shared";

const SEVERITY: Record<StewardOutput["concernLevel"], number> = { alert: 2, watch: 1, good: 0 };
const DOMAIN_LABEL: Record<StewardOutput["domain"], string> = { health: "身体", learning: "脑子" };

function shorten(s: string): string {
  const t = s.trim().replace(/[。.!！]+$/, "");
  return t.length > 24 ? `${t.slice(0, 24)}…` : t;
}

/**
 * §6.7.3 多 Agent 输出汇总：把多个辅助 Agent 的发现合并成主小人的「一个声音」。
 * 0 条 → 空；1 条 → 直接用其 companionLine；多条 → 最严重者领衔，其余以短句附在后面。
 */
export function aggregateStewardLines(outputs: StewardOutput[]): string {
  const items = outputs.filter((o) => o.companionLine.trim().length > 0);
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]?.companionLine ?? "";
  const sorted = [...items].sort((a, b) => SEVERITY[b.concernLevel] - SEVERITY[a.concernLevel]);
  const primary = sorted[0];
  if (!primary) return "";
  const restClause = sorted
    .slice(1)
    .map((o) => `${DOMAIN_LABEL[o.domain]}也别松——${shorten(o.nudge)}`)
    .join("；");
  return `${primary.companionLine} 另外${restClause}。`.slice(0, 140);
}

/** 汇总后主小人状态：任一为 alert → caring，否则 focus */
export function aggregateStewardState(outputs: StewardOutput[]): CompanionState {
  return outputs.some((o) => o.concernLevel === "alert") ? "caring" : "focus";
}
