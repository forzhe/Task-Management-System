import type { AgentContext, AgentResult, TriggerKind } from "@nexus/shared";
import { CompanionAgent } from "./agents/companion-agent.js";
import { DialogueAgent } from "./agents/dialogue-agent.js";
import { PlanningAgent } from "./agents/planning-agent.js";
import { ProfileAgent } from "./agents/profile-agent.js";
import { ReviewAgent } from "./agents/review-agent.js";
import { SafetyAgent } from "./agents/safety-agent.js";
import type { LlmClient } from "./llm.js";
import { ModelRouter } from "./model-router.js";
import type { NexusTools } from "./tools.js";

export class Orchestrator {
  private readonly router = new ModelRouter();
  private readonly dialogueAgent: DialogueAgent;
  private readonly planningAgent: PlanningAgent;
  private readonly reviewAgent: ReviewAgent;
  private readonly profileAgent: ProfileAgent;
  private readonly companionAgent: CompanionAgent;
  private readonly safetyAgent = new SafetyAgent();

  constructor(
    private readonly llm: LlmClient,
    private readonly tools: NexusTools,
    private readonly userId: string,
  ) {
    this.dialogueAgent = new DialogueAgent(llm, this.router, tools);
    this.planningAgent = new PlanningAgent(llm, this.router, tools);
    this.reviewAgent = new ReviewAgent(llm, this.router, tools);
    this.profileAgent = new ProfileAgent(llm, this.router);
    this.companionAgent = new CompanionAgent(llm, this.router, tools);
  }

  async handle(trigger: TriggerKind, message?: string): Promise<AgentResult> {
    const context = this.buildContext(trigger, message);
    const primary = await this.dispatch(context);
    const companion = await this.companionAgent.run(context);
    return this.safetyAgent.run(context, {
      ...primary,
      companionAction: companion.companionAction,
    });
  }

  private async dispatch(context: AgentContext): Promise<AgentResult> {
    if (context.trigger === "morning_planning") return this.planningAgent.run(context);
    if (context.trigger === "daily_review") return this.reviewAgent.run(context);

    if (context.message?.includes("规划") || context.message?.includes("今天做什么")) {
      return this.planningAgent.run(context);
    }
    if (context.message?.includes("复盘") || context.message?.includes("校准")) {
      return this.reviewAgent.run(context);
    }
    if (context.message?.includes("档案") || context.message?.includes("我总是")) {
      return this.profileAgent.run(context);
    }
    return this.dialogueAgent.run(context);
  }

  private buildContext(trigger: TriggerKind, message?: string): AgentContext {
    const profile = this.tools.getUserProfile();
    const profileSummary = [
      `基本信息=${JSON.stringify(profile.basicInfo)}`,
      `动机=${JSON.stringify(profile.motivations)}`,
      `红线=${profile.redLines.join("、")}`,
      `长期愿景=${JSON.stringify(profile.longTermVision)}`,
    ].join("\n");

    return {
      userId: this.userId,
      trigger,
      message,
      profileSummary,
      recentEvents: this.tools.queryEvents(20),
      activeGoals: this.tools.getActiveGoals(),
      currentTasks: this.tools.getCurrentTasks(),
    };
  }
}
