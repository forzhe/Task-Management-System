import type { CompanionState } from "@nexus/shared";

export interface CompanionVisualState {
  state: CompanionState;
  expression: "neutral" | "smile" | "focused" | "concerned" | "strict";
  motion: "idle" | "nod" | "celebrate" | "lean-in";
}

export function toVisualState(state: CompanionState): CompanionVisualState {
  switch (state) {
    case "celebrating":
      return { state, expression: "smile", motion: "celebrate" };
    case "focus":
      return { state, expression: "focused", motion: "lean-in" };
    case "strict":
    case "disappointed":
      return { state, expression: "strict", motion: "idle" };
    case "caring":
      return { state, expression: "concerned", motion: "nod" };
    default:
      return { state, expression: "neutral", motion: "idle" };
  }
}
