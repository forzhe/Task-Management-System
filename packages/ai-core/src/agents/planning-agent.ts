import type { AgentContext, AgentResult } from "@nexus/shared";
import type { LlmClient } from "../llm.js";
import type { ModelRouter } from "../model-router.js";
import {
  fallbackPlanningOutput,
  formatPlanningResponse,
  parseStructuredOutput,
  planningOutputSchema,
} from "../structured-output.js";
import type { NexusTools } from "../tools.js";

export class PlanningAgent {
  constructor(
    private readonly llm: LlmClient,
    private readonly router: ModelRouter,
    private readonly tools: NexusTools,
  ) {}

  async run(context: AgentContext): Promise<AgentResult> {
    const modelTier = this.router.route({ agentId: "planning", trigger: context.trigger });
    const response = await this.llm.complete({
      agentId: "planning",
      modelTier,
      messages: [
        {
          role: "system",
          content:
            "你是 NEXUS-7 规划 Agent。只返回 JSON，不要 Markdown。JSON 必须符合：{schemaVersion:1,agentId:'planning',summary:string,data:{planTitle:string,rationale:string,tasks:[{title,description,energyRequired:'low'|'medium'|'high',estimatedMinutes,acceptanceCriteria,proofMethod,rewardPoints}],risks:string[]},warnings:[],fallbackUsed:false}。生成 1-3 个少而精的今日执行协议。",
        },
        {
          role: "user",
          content: JSON.stringify({
            profile: context.profileSummary,
            goals: context.activeGoals,
            recentEvents: context.recentEvents.slice(0, 5),
          }),
        },
      ],
    });

    const { envelope } = parseStructuredOutput(
      "planning",
      response.content,
      planningOutputSchema,
      fallbackPlanningOutput(),
    );

    const tasks = envelope.data.tasks.map((plannedTask) =>
      this.tools.createTask({
        source: "ai",
        title: plannedTask.title,
        description: plannedTask.description,
        energyRequired: plannedTask.energyRequired,
        estimatedMinutes: plannedTask.estimatedMinutes,
        acceptanceCriteria: plannedTask.acceptanceCriteria,
        proofMethod: plannedTask.proofMethod,
        rewardPoints: plannedTask.rewardPoints,
      }),
    );

    const event = this.tools.unsafeLogEvent({
      source: "planning-agent",
      type: "agent_output",
      category: "morning_plan",
      rawPayload: { response: response.content },
      structured: {
        output: envelope,
        createdTaskIds: tasks.map((task) => task.id),
        modelTier,
      },
      occurredAt: new Date().toISOString(),
      confidence: 0.75,
      tags: ["planning", "task-created"],
      relatedGoalIds: [],
      relatedTaskIds: tasks.map((task) => task.id),
    });

    return {
      response: formatPlanningResponse(envelope.data),
      structured: { planning: envelope },
      events: [event],
      nextActions: tasks.map((task) => `task:${task.id}`),
    };
  }
}
