import type { AgentId, ModelTier, TriggerKind } from "@nexus/shared";

export interface RouteRequest {
  agentId: AgentId;
  trigger: TriggerKind;
  inputTokensEstimate?: number;
  requiresDeepReasoning?: boolean;
}

export class ModelRouter {
  route(request: RouteRequest): ModelTier {
    if (request.inputTokensEstimate && request.inputTokensEstimate > 50_000) return "opus";
    if (request.requiresDeepReasoning) return "opus";
    if (["review", "insight", "evolution"].includes(request.agentId)) return "opus";
    if (
      ["planning", "coach", "profile", "decision", "steward", "economy", "orchestrator"].includes(
        request.agentId,
      )
    ) {
      return "sonnet";
    }
    return "haiku";
  }
}
