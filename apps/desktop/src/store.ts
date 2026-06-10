import type {
  AgentResult,
  Companion,
  Goal,
  GoalStatus,
  InsightOutput,
  NexusEvent,
  Profile,
  ProfileUpdateInput,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
} from "@nexus/shared";
import { defineStore } from "pinia";
import { api } from "./api";

export interface ChatLine {
  role: "host" | "nexus";
  text: string;
  at: string;
}

export const useNexusStore = defineStore("nexus", {
  state: () => ({
    loading: false,
    offlineLlm: true,
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
    latestInsight: null as InsightOutput | null,
    error: "",
  }),
  getters: {
    completedToday: (state) => state.tasks.filter((task) => task.status === "completed").length,
    activeTasks: (state) => state.tasks.filter((task) => task.status !== "completed"),
  },
  actions: {
    async refresh() {
      this.loading = true;
      this.error = "";
      try {
        const [health, user, profile, goals, tasks, events, latestReview, companion] = await Promise.all([
          api.health(),
          api.user(),
          api.profile(),
          api.goals(),
          api.tasks(),
          api.events(),
          api.latestReview(),
          api.companion(),
        ]);
        this.offlineLlm = health.offlineLlm;
        this.user = user;
        this.profile = profile;
        this.goals = goals;
        this.tasks = tasks;
        this.events = events;
        this.latestReview = latestReview;
        this.companion = companion;
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
    async morningPlan() {
      try {
        const result = await api.morningPlan();
        this.captureResult(result);
        await this.refresh();
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
