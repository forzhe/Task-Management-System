import type {
  AgentResult,
  Companion,
  Goal,
  NexusEvent,
  Profile,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
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
    profile: null as Profile | null,
    goals: [] as Goal[],
    tasks: [] as Task[],
    events: [] as NexusEvent[],
    latestReview: null as Review | null,
    companion: null as Companion | null,
    chat: [] as ChatLine[],
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
        const [health, profile, goals, tasks, events, latestReview, companion] = await Promise.all([
          api.health(),
          api.profile(),
          api.goals(),
          api.tasks(),
          api.events(),
          api.latestReview(),
          api.companion(),
        ]);
        this.offlineLlm = health.offlineLlm;
        this.profile = profile;
        this.goals = goals;
        this.tasks = tasks;
        this.events = events;
        this.latestReview = latestReview;
        this.companion = companion;
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
