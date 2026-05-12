import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { type NexusTools, Orchestrator, createLlmClient } from "@nexus/ai-core";
import { NexusRepository } from "@nexus/memory";
import type {
  Goal,
  ReviewType,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  TriggerKind,
} from "@nexus/shared";
import { loadConfig } from "./config.js";
import { VaultWriter } from "./vault-writer.js";

@Injectable()
export class NexusService implements OnModuleDestroy {
  private readonly config = loadConfig();
  private readonly repository = new NexusRepository({
    dbPath: this.config.NEXUS_DB_PATH,
    userId: this.config.NEXUS_USER_ID,
  });
  private readonly vault = new VaultWriter(this.config.NEXUS_VAULT_PATH);
  private readonly orchestrator = new Orchestrator(
    createLlmClient(this.config.ANTHROPIC_API_KEY),
    this.tools(),
    this.repository.userId,
  );

  async onModuleDestroy(): Promise<void> {
    this.repository.close();
  }

  async bootstrapVault(): Promise<void> {
    await this.vault.writeProfile(this.repository.getProfile());
    await this.vault.writeTodayTasks(this.repository.listTasks());
    await this.vault.appendEventSnapshot(this.repository.queryEvents(50));
  }

  getHealth() {
    return {
      ok: true,
      phase: "phase-1-awakening",
      userId: this.repository.userId,
      offlineLlm: !this.config.ANTHROPIC_API_KEY,
    };
  }

  async handleChat(message: string, trigger: TriggerKind = "user_message") {
    const result = await this.orchestrator.handle(trigger, message);
    await this.syncVault();
    return result;
  }

  getProfile() {
    return this.repository.getProfile();
  }

  listGoals() {
    return this.repository.listGoals();
  }

  createGoal(input: Pick<Goal, "title" | "level"> & Partial<Goal>) {
    return this.repository.createGoal(input);
  }

  listTasks(status?: TaskStatus) {
    return this.repository.listTasks(status);
  }

  async createTask(input: Pick<Task, "title"> & Partial<Task>) {
    const task = this.repository.createTask(input);
    await this.syncVault();
    return task;
  }

  async updateTaskStatus(taskId: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence) {
    const previousTask = this.repository.getTask(taskId);
    const task = this.repository.updateTaskStatus(taskId, status, evidence);
    this.repository.logEvent({
      source: "tasks-api",
      type: "action",
      category: "task_status_changed",
      rawPayload: { taskId, status, evidence },
      structured: {
        taskId,
        fromStatus: previousTask?.status ?? null,
        toStatus: status,
        evidence: task.evidence ?? {},
        actualMinutes: task.actualMinutes ?? null,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["task", status],
      relatedGoalIds: task.goalId ? [task.goalId] : [],
      relatedTaskIds: [task.id],
    });
    await this.orchestrator.handle(
      status === "completed" ? "task_completed" : "system",
      `任务 ${task.title} 状态更新为 ${status}`,
    );
    await this.syncVault();
    return task;
  }

  async runDailyReview(note: string) {
    const result = await this.orchestrator.handle("daily_review", note);
    await this.syncVault();
    return result;
  }

  getCompanion() {
    return this.repository.getCompanion();
  }

  queryEvents(limit = 20) {
    return this.repository.queryEvents(limit);
  }

  getLatestReview(type: ReviewType = "daily") {
    return this.repository.getLatestReview(type);
  }

  private async syncVault(): Promise<void> {
    await this.vault.writeProfile(this.repository.getProfile());
    await this.vault.writeTodayTasks(this.repository.listTasks());
    const latestReviewEvent = this.repository
      .queryEvents(10)
      .find((event) => event.category === "daily_review");
    if (latestReviewEvent?.structured.reviewId) {
      const review = this.repository.getReview(String(latestReviewEvent.structured.reviewId));
      if (review) await this.vault.writeDailyReview(review);
    }
    await this.vault.appendEventSnapshot(this.repository.queryEvents(50));
  }

  private tools(): NexusTools {
    return {
      getUserProfile: () => this.repository.getProfile(),
      queryEvents: (limit) => this.repository.queryEvents(limit),
      searchMemory: (_query, topK) => this.repository.queryEvents(topK),
      getActiveGoals: () => this.repository.listGoals("active"),
      getCurrentTasks: () => this.repository.listTasks(),
      logEvent: (event) => this.repository.logEvent(event),
      unsafeLogEvent: (event) => this.repository.logEvent(event),
      createTask: (task) => this.repository.createTask(task),
      createGoal: (goal) => this.repository.createGoal(goal),
      updateTaskStatus: (taskId, status, evidence) =>
        this.repository.updateTaskStatus(taskId, status, evidence),
      saveReview: (review) => this.repository.saveReview(review),
      getReview: (reviewId) => this.repository.getReview(reviewId),
      triggerCompanion: (action) => this.repository.updateCompanion(action),
      getCompanion: () => this.repository.getCompanion(),
    };
  }
}
