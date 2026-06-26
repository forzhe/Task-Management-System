import type { AgentContext, AgentResult, BrowserVisitSummary, FinanceSummary, HealthDaySummary, ModelTier, ScreenActivitySummary, StewardOutput, TriggerKind } from "@nexus/shared";
import { CompanionAgent } from "./agents/companion-agent.js";
import { CoachAgent, type CoachSessionInput } from "./agents/coach-agent.js";
import {
  DecisionAgent,
  type ChoicePredictionInput,
  type PathSimulationInput,
} from "./agents/decision-agent.js";
import { DialogueAgent } from "./agents/dialogue-agent.js";
import { EconomyAgent, type EconomyInput } from "./agents/economy-agent.js";
import { EvolutionAgent, type EvolutionInput } from "./agents/evolution-agent.js";
import { HealthStewardAgent, type HealthStewardInput } from "./agents/health-steward-agent.js";
import { InsightAgent } from "./agents/insight-agent.js";
import {
  LearningStewardAgent,
  type LearningStewardInput,
} from "./agents/learning-steward-agent.js";
import { PlanningAgent } from "./agents/planning-agent.js";
import { ProfileAgent } from "./agents/profile-agent.js";
import { ReminderAgent } from "./agents/reminder-agent.js";
import { ReportAgent, type PeriodReportInput } from "./agents/report-agent.js";
import { ReviewAgent } from "./agents/review-agent.js";
import { SafetyAgent } from "./agents/safety-agent.js";
import {
  StreakAgent,
  type StreakBreakInput,
  type StreakMilestoneInput,
} from "./agents/streak-agent.js";
import type { LlmClient } from "./llm.js";
import { ModelRouter } from "./model-router.js";
import { computeProfileObservation, deriveMbtiProposals } from "./profile/observation.js";
import { aggregateStewardLines, aggregateStewardState } from "./steward-aggregate.js";
import type { NexusTools } from "./tools.js";

export class Orchestrator {
  private readonly router = new ModelRouter();
  private readonly dialogueAgent: DialogueAgent;
  private readonly planningAgent: PlanningAgent;
  private readonly reviewAgent: ReviewAgent;
  private readonly profileAgent: ProfileAgent;
  private readonly companionAgent: CompanionAgent;
  private readonly insightAgent: InsightAgent;
  private readonly coachAgent: CoachAgent;
  private readonly reminderAgent: ReminderAgent;
  private readonly streakAgent: StreakAgent;
  private readonly decisionAgent: DecisionAgent;
  private readonly reportAgent: ReportAgent;
  private readonly healthSteward: HealthStewardAgent;
  private readonly learningSteward: LearningStewardAgent;
  private readonly economyAgent: EconomyAgent;
  private readonly evolutionAgent: EvolutionAgent;
  private readonly safetyAgent = new SafetyAgent();

  constructor(
    private readonly llm: LlmClient,
    private readonly tools: NexusTools,
    private readonly userId: string,
  ) {
    this.dialogueAgent = new DialogueAgent(llm, this.router, tools);
    this.planningAgent = new PlanningAgent(llm, this.router, tools);
    this.reviewAgent = new ReviewAgent(llm, this.router, tools);
    this.profileAgent = new ProfileAgent(llm, this.router, tools);
    this.companionAgent = new CompanionAgent(llm, this.router, tools);
    this.insightAgent = new InsightAgent(llm, this.router, tools);
    this.coachAgent = new CoachAgent(llm, this.router, tools);
    this.reminderAgent = new ReminderAgent(llm, this.router, tools);
    this.streakAgent = new StreakAgent(llm, this.router, tools);
    this.decisionAgent = new DecisionAgent(llm, this.router, tools);
    this.reportAgent = new ReportAgent(llm, this.router, tools);
    this.healthSteward = new HealthStewardAgent(llm, this.router, tools);
    this.learningSteward = new LearningStewardAgent(llm, this.router, tools);
    this.economyAgent = new EconomyAgent(llm, this.router, tools);
    this.evolutionAgent = new EvolutionAgent(llm, this.router, tools);
  }

  async handle(
    trigger: TriggerKind,
    message?: string,
    extras?: {
      screenActivity?: ScreenActivitySummary;
      browserVisits?: BrowserVisitSummary[];
      healthToday?: HealthDaySummary;
      financeRecent?: FinanceSummary;
    },
    override?: { modelTier?: ModelTier; model?: string },
  ): Promise<AgentResult> {
    const context = this.buildContext(trigger, message, extras, override);
    const primary = await this.dispatch(context);
    const companion = await this.companionAgent.run(context);
    return this.safetyAgent.run(context, {
      ...primary,
      events: [...(primary.events ?? []), ...(companion.events ?? [])],
      companionAction: companion.companionAction,
    });
  }

  async runInsight(): Promise<AgentResult> {
    const context = this.buildContext("insight_analysis");
    return this.insightAgent.run(context);
  }

  async runCoachSession(goalTitle: string, session: CoachSessionInput): Promise<AgentResult> {
    const context = this.buildContext("coach_session");
    return this.coachAgent.run(context, session);
  }

  async runReminderCheck(hint?: string): Promise<AgentResult> {
    const context = this.buildContext("reminder_check", hint);
    return this.reminderAgent.run(context);
  }

  async runStreakMilestone(input: StreakMilestoneInput): Promise<AgentResult> {
    return this.streakAgent.runMilestone(input);
  }

  async runStreakBreak(input: StreakBreakInput): Promise<AgentResult> {
    return this.streakAgent.runBreakAnalysis(input);
  }

  /** §5.3 档案演化扫描。deep=true 走 opus（月度深扫）*/
  async runProfileEvolution(deep = false): Promise<AgentResult> {
    const context = this.buildContext(deep ? "system" : "daily_review");
    return this.profileAgent.run(context);
  }

  /**
   * 宿主档案 · 观测层（活体画像）刷新（规划书 §6）。
   * 确定性引擎计算六维画像快照 → 落事件流（profile_observation）；
   * deep=true（手动深扫）时额外做 MBTI 漂移检测，产出高风险演化提议（只提议、必裁决）。
   */
  async runProfileObservation(deep = false): Promise<AgentResult> {
    const events = this.tools.queryEvents(deep ? 400 : 150);
    const profile = this.tools.getUserProfile();
    const observation = computeProfileObservation(events, profile, {
      windowDays: deep ? 28 : 14,
      source: deep ? "deep-scan" : "daily",
    });

    const event = this.tools.logEvent({
      source: "profiler",
      type: "agent_output",
      category: "profile_observation",
      rawPayload: { deep },
      structured: {
        summary: observation.summary,
        observation: observation as unknown as Record<string, unknown>,
      },
      occurredAt: observation.takenAt,
      confidence: 0.7,
      tags: ["profile", "observation", observation.source],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });

    // P4：高风险演化提议只在深扫触发（避免日终每天打扰），且需通过漂移阈值
    const proposalIds: string[] = [];
    if (deep) {
      for (const draft of deriveMbtiProposals(observation, profile)) {
        proposalIds.push(this.tools.saveProfileChangeProposal(draft).id);
      }
    }

    return {
      response: observation.summary,
      structured: { observation: observation as unknown as Record<string, unknown>, proposalIds },
      events: [event],
    };
  }

  /** §8 今日净成长值 */
  async runNetGrowth(): Promise<AgentResult> {
    const context = this.buildContext("decision_analysis");
    return this.decisionAgent.analyzeNetGrowth(context);
  }

  /** §9 选择前预测 */
  async runChoicePrediction(input: ChoicePredictionInput): Promise<AgentResult> {
    const context = this.buildContext("decision_analysis");
    return this.decisionAgent.predictChoice(context, input);
  }

  /** §9 人生路线模拟 */
  async runPathSimulation(input: PathSimulationInput): Promise<AgentResult> {
    const context = this.buildContext("decision_analysis");
    return this.decisionAgent.simulatePath(context, input);
  }

  /** §9 周期报告叙事（统计由 service 聚合后传入）*/
  async runPeriodReport(input: PeriodReportInput) {
    return this.reportAgent.run(input);
  }

  /** §6.7.3 健康管家（辅助 Agent，主小人统一转达）*/
  async runHealthSteward(input: HealthStewardInput): Promise<AgentResult> {
    const context = this.buildContext("companion_tick");
    return this.healthSteward.run(context, input);
  }

  /** §6.7.3 学习教练（辅助 Agent，主小人统一转达）*/
  async runLearningSteward(input: LearningStewardInput): Promise<AgentResult> {
    const context = this.buildContext("companion_tick");
    return this.learningSteward.run(context, input);
  }

  /** §6.4 系统进化引擎（仅提议）*/
  async runEvolution(input: EvolutionInput): Promise<AgentResult> {
    return this.evolutionAgent.run(input);
  }

  /** 商城子系统：经济官对宿主心愿做一次综合估值定价（提交时一次性，无再改价）*/
  async runEconomyAppraisal(input: EconomyInput): Promise<AgentResult> {
    const context = this.buildContext("companion_tick");
    return this.economyAgent.run(context, input);
  }

  /**
   * §6.7.3 场景路由 + 多 Agent 汇总：按 service 选定的领域跑对应辅助 Agent（静默），
   * 再把它们的发现汇总成主小人的「一个声音」一次性发声。
   */
  async runStewardSweep(inputs: {
    health?: HealthStewardInput;
    learning?: LearningStewardInput;
  }): Promise<{ outputs: StewardOutput[]; companionLine: string; domains: StewardOutput["domain"][] }> {
    const context = this.buildContext("companion_tick");
    const outputs: StewardOutput[] = [];

    if (inputs.health) {
      const r = await this.healthSteward.run(context, inputs.health, { speak: false });
      const s = r.structured?.steward as StewardOutput | undefined;
      if (s) outputs.push(s);
    }
    if (inputs.learning) {
      const r = await this.learningSteward.run(context, inputs.learning, { speak: false });
      const s = r.structured?.steward as StewardOutput | undefined;
      if (s) outputs.push(s);
    }

    const companionLine = aggregateStewardLines(outputs);
    if (companionLine) {
      const companion = this.tools.getCompanion();
      this.tools.triggerCompanion({
        companionId: companion.id,
        state: aggregateStewardState(outputs),
        dialogue: companionLine,
      });
      this.tools.logEvent({
        source: "orchestrator",
        type: "agent_output",
        category: "steward_sweep",
        rawPayload: { domains: outputs.map((o) => o.domain) },
        structured: { summary: companionLine, outputs },
        occurredAt: new Date().toISOString(),
        confidence: 0.85,
        tags: ["steward", "sweep"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
    }

    return { outputs, companionLine, domains: outputs.map((o) => o.domain) };
  }

  private async dispatch(context: AgentContext): Promise<AgentResult> {
    if (context.trigger === "morning_planning") return this.planningAgent.run(context);
    if (context.trigger === "daily_review") return this.reviewAgent.run(context);
    if (context.trigger === "insight_analysis") return this.insightAgent.run(context);
    if (context.trigger === "reminder_check") return this.reminderAgent.run(context);

    if (context.message?.includes("规划") || context.message?.includes("今天做什么")) {
      return this.planningAgent.run(context);
    }
    if (context.message?.includes("复盘") || context.message?.includes("校准")) {
      return this.reviewAgent.run(context);
    }
    if (context.message?.includes("档案") || context.message?.includes("我总是")) {
      return this.profileAgent.run(context);
    }
    if (context.message?.includes("洞察") || context.message?.includes("模式分析")) {
      return this.insightAgent.run(context);
    }
    return this.dialogueAgent.run(context);
  }

  private buildContext(
    trigger: TriggerKind,
    message?: string,
    extras?: {
      screenActivity?: ScreenActivitySummary;
      browserVisits?: BrowserVisitSummary[];
      healthToday?: HealthDaySummary;
      financeRecent?: FinanceSummary;
    },
    override?: { modelTier?: ModelTier; model?: string },
  ): AgentContext {
    const profile = this.tools.getUserProfile();
    // 宿主在觉醒仪式里选过 strict/gentle，这里据此给全体 Agent 一个统一语气指令；默认温和。
    const preference = (profile.basicInfo as { personalityPreference?: string }).personalityPreference;
    const tone =
      preference === "strict"
        ? "语气偏好=直接克制：简洁、可直接点名问题，但保持尊重，不嘲讽、不说教、不贴人格标签。"
        : "语气偏好=温和陪伴：先认可已发生的努力，再具体指出问题与下一步；如实但不冷硬、不评判其为人。";
    const profileSummary = [
      `基本信息=${JSON.stringify(profile.basicInfo)}`,
      `动机=${JSON.stringify(profile.motivations)}`,
      `红线=${profile.redLines.join("、")}`,
      `长期愿景=${JSON.stringify(profile.longTermVision)}`,
      // #2 性格/风格画像：作息节律、动机类型、做事风格等，供 Agent 因人调整方案与语气
      `特质画像=${JSON.stringify(profile.traits)}`,
      tone,
    ].join("\n");

    return {
      userId: this.userId,
      trigger,
      message,
      profileSummary,
      recentEvents: this.tools.queryEvents(20),
      activeGoals: this.tools.getActiveGoals(),
      currentTasks: this.tools.getCurrentTasks(),
      calendarToday: this.tools.getTodayCalendar(),
      screenActivity: extras?.screenActivity,
      browserVisits: extras?.browserVisits,
      healthToday: extras?.healthToday,
      financeRecent: extras?.financeRecent,
      modelTierOverride: override?.modelTier,
      modelOverride: override?.model,
    };
  }
}
