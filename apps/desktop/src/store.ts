import type {
  AgentResult,
  Companion,
  Goal,
  GoalStatus,
  InsightOutput,
  NexusEvent,
  PlanningOutput,
  Profile,
  ProfileChangeProposal,
  ProfileUpdateInput,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
  UserStreak,
} from "@nexus/shared";
import type { BountyProposeResult, BountyView, CalendarEvent, ChoicePredictionOutput, DataImportResult, DeepAnalysis, Divergence, EvolutionProposal, FinanceSummary, HealthDaySummary, PathSimulationOutput, PeriodReport, RelationshipGraph, ShopView, StewardOutput } from "@nexus/shared";
import type { TaskEditInput } from "@nexus/shared";
import { defineStore } from "pinia";
import { api, type DayData, type NetGrowthSnapshot, type PlanModelOverride } from "./api";

export interface ChatLine {
  role: "host" | "nexus";
  text: string;
  at: string;
}

export const useNexusStore = defineStore("nexus", {
  state: () => ({
    loading: false,
    offlineLlm: true,
    llmProvider: "",
    awConnected: false,
    awFocusMinutes: 0,
    user: null as User | null,
    profile: null as Profile | null,
    goals: [] as Goal[],
    tasks: [] as Task[],
    events: [] as NexusEvent[],
    latestReview: null as Review | null,
    companion: null as Companion | null,
    chat: [] as ChatLine[],
    lastPlan: null as PlanningOutput | null,
    latestInsight: null as InsightOutput | null,
    streaks: [] as UserStreak[],
    profileChanges: [] as ProfileChangeProposal[],
    netGrowth: null as NetGrowthSnapshot | null,
    choicePrediction: null as ChoicePredictionOutput | null,
    report: null as PeriodReport | null,
    graph: null as RelationshipGraph | null,
    pathSimulation: null as PathSimulationOutput | null,
    recentHealth: [] as HealthDaySummary[],
    lastHealthImport: null as DataImportResult | null,
    upcomingCalendar: [] as CalendarEvent[],
    financeSummary: null as FinanceSummary | null,
    lastFinanceImport: null as DataImportResult | null,
    healthSteward: null as StewardOutput | null,
    learningSteward: null as StewardOutput | null,
    divergences: [] as Divergence[],
    shop: null as ShopView | null,
    bounties: null as BountyView | null,
    lastBountyResult: null as BountyProposeResult | null,
    deepAnalysis: null as DeepAnalysis | null,
    evolution: [] as EvolutionProposal[],
    dayData: null as DayData | null,
    error: "",
  }),
  getters: {
    completedToday: (state) => state.tasks.filter((task) => task.status === "completed").length,
    activeTasks: (state) => state.tasks.filter((task) => task.status !== "completed"),
    // 首次启动仪式判定：档案未标记 onboarded 即视为未觉醒
    needsOnboarding: (state) =>
      state.profile !== null && state.profile.basicInfo?.onboarded !== true,
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        const [health, user, profile, goals, tasks, events, latestReview, companion, streaks, profileChanges, netGrowth, report, graph, recentHealth, financeSummary, divergences, shop, upcomingCalendar, evolution, bounties] = await Promise.all([
          api.health(),
          api.user(),
          api.profile(),
          api.goals(),
          api.tasks(),
          api.events(),
          api.latestReview(),
          api.companion(),
          api.streaks(),
          api.profileChanges(),
          api.netGrowth(),
          api.latestReport(),
          api.graph(),
          api.recentHealth(),
          api.financeSummary(),
          api.divergences(),
          api.shop(),
          api.upcomingCalendar(),
          api.evolution(),
          api.bounties(),
        ]);
        this.offlineLlm = health.offlineLlm;
        this.llmProvider = health.llmProvider;
        this.user = user;
        this.profile = profile;
        this.goals = goals;
        this.tasks = tasks;
        this.events = events;
        this.latestReview = latestReview;
        this.companion = companion;
        this.streaks = streaks;
        this.profileChanges = profileChanges;
        this.netGrowth = netGrowth;
        this.report = report;
        this.graph = graph;
        this.recentHealth = recentHealth;
        this.financeSummary = financeSummary;
        this.divergences = divergences;
        this.shop = shop;
        this.upcomingCalendar = upcomingCalendar;
        this.evolution = evolution;
        this.bounties = bounties;
        // AW status is best-effort, never blocks the main refresh
        api
          .awStatus()
          .then((aw) => {
            this.awConnected = aw.connected;
            this.awFocusMinutes = aw.focusMinutes ?? 0;
          })
          .catch(() => {
            this.awConnected = false;
          });
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      } finally {
        this.loading = false;
      }
    },
    async send(message: string) {
      this.chat.push({ role: "host", text: message, at: new Date().toISOString() });
      try {
        const result = await api.sendChat(message);
        this.captureResult(result);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async morningPlan(override?: PlanModelOverride) {
      try {
        const result = await api.morningPlan(override);
        this.captureResult(result);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    /** #12 重做晨间规划：先清掉当天 AI 生成的任务，再用（可选的）新模型重生成 */
    async regenerateMorning(override?: PlanModelOverride) {
      try {
        const today = new Date();
        const isToday = (iso?: string | null) => {
          if (!iso) return false;
          const d = new Date(iso);
          return (
            d.getFullYear() === today.getFullYear() &&
            d.getMonth() === today.getMonth() &&
            d.getDate() === today.getDate()
          );
        };
        for (const t of this.tasks) {
          if (t.source === "ai" && isToday(t.scheduledAt ?? null)) {
            await api.deleteTask(t.id);
          }
        }
        const result = await api.morningPlan(override);
        this.captureResult(result);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    /** §6.7 数据管理 / #12 计划编辑 */
    async editTask(id: string, patch: TaskEditInput) {
      try {
        await api.editTask(id, patch);
        await this.refresh();
        if (this.dayData) await this.loadDayData(this.dayData.date);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async removeTask(id: string) {
      try {
        await api.deleteTask(id);
        await this.refresh();
        if (this.dayData) await this.loadDayData(this.dayData.date);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async removeEvent(id: string) {
      try {
        await api.deleteEvent(id);
        await this.refresh();
        if (this.dayData) await this.loadDayData(this.dayData.date);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async removeReview(id: string) {
      try {
        await api.deleteReview(id);
        await this.refresh();
        if (this.dayData) await this.loadDayData(this.dayData.date);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadDayData(date: string) {
      try {
        this.dayData = await api.dayData(date);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async dailyReview(note: string) {
      try {
        const result = await api.dailyReview(note);
        this.captureResult(result);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async createGoal(input: Pick<Goal, "title" | "level"> & Partial<Goal>) {
      try {
        await api.createGoal(input);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async updateGoalStatus(id: string, status: GoalStatus) {
      try {
        await api.updateGoalStatus(id, status);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async updateProfile(input: ProfileUpdateInput) {
      try {
        const updated = await api.updateProfile(input);
        this.profile = updated;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async completeTask(id: string) {
      await this.updateTaskStatus(id, "completed", { source: "desktop" });
    },
    async updateTaskStatus(id: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence) {
      try {
        await api.updateTask(id, status, evidence);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    /** 番茄钟完成一段专注 → 累加 actualMinutes + 专注力 XP */
    async recordFocusSession(taskId: string, minutes: number) {
      try {
        const r = await api.recordFocusSession(taskId, minutes);
        if (!r.ok && r.error) this.error = r.error;
        await this.refresh();
        return r;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        return null;
      }
    },
    async simulatePath(scenario: string, paths: string[]) {
      try {
        const result = await api.simulatePath(scenario, paths);
        this.captureResult(result);
        const sim = (result.structured as Record<string, unknown>)?.pathSimulation;
        if (sim) this.pathSimulation = sim as PathSimulationOutput;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadGraph() {
      try {
        this.graph = await api.graph();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadShop() {
      try {
        this.shop = await api.shop();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadDeepAnalysis() {
      try {
        this.deepAnalysis = await api.deepAnalysis();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadEvolution() {
      try {
        this.evolution = await api.evolution();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runEvolution(targetKey: string) {
      try {
        await api.runEvolution(targetKey);
        await this.loadEvolution();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async resolveEvolution(id: string, action: "apply" | "rollback" | "reject") {
      try {
        if (action === "apply") {
          const r = await api.applyEvolution(id);
          if (!r.ok && r.error) this.error = r.error;
        } else if (action === "rollback") await api.rollbackEvolution(id);
        else await api.rejectEvolution(id);
        await this.loadEvolution();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async purchaseShopItem(itemId: string) {
      try {
        const result = await api.purchaseShopItem(itemId);
        if (!result.ok && result.error) this.error = result.error;
        await this.loadShop();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async equipSkin(skinId: string) {
      try {
        await api.equipSkin(skinId);
        await this.loadShop();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadBounties() {
      try {
        this.bounties = await api.bounties();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    /** 提交心愿 → 经济官估值。返回结果供 UI 区分定价/澄清/婉拒 */
    async proposeBounty(title: string, hostNote?: string, referenceCny?: number) {
      try {
        const result = await api.proposeBounty(title, hostNote, referenceCny);
        this.lastBountyResult = result;
        if (!result.ok && result.error) this.error = result.error;
        await this.loadBounties();
        await this.refresh();
        return result;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        return null;
      }
    },
    clearBountyResult() {
      this.lastBountyResult = null;
    },
    async redeemBounty(id: string) {
      try {
        const result = await api.redeemBounty(id);
        if (!result.ok && result.error) this.error = result.error;
        await this.loadBounties();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async fulfillBounty(id: string) {
      try {
        await api.fulfillBounty(id);
        await this.loadBounties();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async abandonBounty(id: string) {
      try {
        await api.abandonBounty(id);
        await this.loadBounties();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async openDivergence(claim: string, evidence: string, domain?: string) {
      try {
        await api.openDivergence(claim, evidence, domain);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async resolveDivergence(id: string, outcome: "confirmed" | "refuted" | "withdrawn") {
      try {
        await api.resolveDivergence(id, outcome);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadHealth() {
      try {
        this.recentHealth = await api.recentHealth();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadCalendar() {
      try {
        this.upcomingCalendar = await api.upcomingCalendar();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async importCalendar(ics: string) {
      try {
        await api.importCalendar(ics);
        await this.loadCalendar();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runHealthSteward() {
      try {
        const result = await api.healthSteward();
        this.captureResult(result);
        const steward = (result.structured as Record<string, unknown>)?.steward;
        if (steward) this.healthSteward = steward as StewardOutput;
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runLearningSteward() {
      try {
        const result = await api.learningSteward();
        this.captureResult(result);
        const steward = (result.structured as Record<string, unknown>)?.steward;
        if (steward) this.learningSteward = steward as StewardOutput;
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runStewardSweep() {
      try {
        const result = await api.stewardSweep(true);
        for (const s of result.outputs) {
          if (s.domain === "health") this.healthSteward = s;
          else if (s.domain === "learning") this.learningSteward = s;
        }
        if (result.companionLine && this.companion) {
          this.companion = { ...this.companion, currentDialogue: result.companionLine };
        }
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async importHealth(csv: string) {
      try {
        this.lastHealthImport = await api.importHealth(csv);
        await this.loadHealth();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async importFinance(csv: string) {
      try {
        this.lastFinanceImport = await api.importFinance(csv);
        this.financeSummary = await api.financeSummary();
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    /** 首次启动仪式完成：写入采集到的档案 + 创建第一个目标 */
    async completeOnboarding(payload: {
      codename: string;
      primaryChange: string;
      idealDay: string;
      failureHistory: string;
      redLine: string;
      personalityPreference: "strict" | "gentle";
      yearGoal: string;
      dailyCommitmentMinutes: number;
      hostId: string;
    }) {
      try {
        await api.updateProfile({
          basicInfo: {
            ...(this.profile?.basicInfo ?? {}),
            codename: payload.codename || "宿主",
            focus: payload.primaryChange,
            onboarded: true,
            hostId: payload.hostId,
            personalityPreference: payload.personalityPreference,
            dailyCommitmentMinutes: payload.dailyCommitmentMinutes,
          },
          motivations: {
            ...(this.profile?.motivations ?? {}),
            primaryChange: payload.primaryChange,
          },
          longTermVision: {
            ...(this.profile?.longTermVision ?? {}),
            idealDay: payload.idealDay,
          },
          traits: {
            ...(this.profile?.traits ?? {}),
            failureHistory: payload.failureHistory,
          },
          ...(payload.redLine ? { redLines: [payload.redLine] } : {}),
        });
        if (payload.yearGoal.trim()) {
          await api.createGoal({ title: payload.yearGoal.trim(), level: "stage" });
        }
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runReport(type: "weekly" | "monthly" | "quarterly" | "annual") {
      try {
        this.report = await api.runReport(type);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async loadReport(type: "weekly" | "monthly" | "quarterly" | "annual") {
      try {
        this.report = await api.latestReport(type);
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runNetGrowth() {
      try {
        const result = await api.runNetGrowth();
        this.captureResult(result);
        const ng = (result.structured as Record<string, unknown>)?.netGrowth;
        if (ng) this.netGrowth = { ...(ng as NetGrowthSnapshot), at: new Date().toISOString() };
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async predictChoice(question: string, options: string[]) {
      try {
        const result = await api.predictChoice(question, options);
        this.captureResult(result);
        const cp = (result.structured as Record<string, unknown>)?.choicePrediction;
        if (cp) this.choicePrediction = cp as ChoicePredictionOutput;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async runProfileEvolution() {
      try {
        const result = await api.runProfileEvolution();
        this.captureResult(result);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async resolveProfileChange(id: string, accept: boolean) {
      try {
        await api.resolveProfileChange(id, accept);
        await this.refresh();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    async weeklyInsight() {
      try {
        const result = await api.weeklyInsight();
        this.captureResult(result);
        const insight = (result.structured as Record<string, unknown>)?.insight as InsightOutput | undefined;
        if (insight) this.latestInsight = insight;
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
      }
    },
    captureResult(result: AgentResult) {
      if (result.response) {
        this.chat.push({ role: "nexus", text: result.response, at: new Date().toISOString() });
      }
      const planning = (result.structured as { planning?: { data?: PlanningOutput } } | undefined)
        ?.planning;
      if (planning?.data) this.lastPlan = planning.data;
      if (result.companionAction && this.companion) {
        this.companion = {
          ...this.companion,
          currentState: result.companionAction.state,
          currentDialogue: result.companionAction.dialogue,
        };
      }
    },
  },
});
