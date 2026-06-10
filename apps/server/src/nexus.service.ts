import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { type CoachSessionInput, type NexusTools, Orchestrator, createLlmClient } from "@nexus/ai-core";
import { NexusRepository } from "@nexus/memory";
import type {
  Goal,
  GoalStatus,
  Profile,
  ProfileUpdateInput,
  ReviewType,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  TriggerKind,
} from "@nexus/shared";
import { ActivityWatchClient } from "./activity-watch.js";
import { BrowserHistoryClient } from "./browser-history.js";
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
  private readonly activityWatch = new ActivityWatchClient(this.config.NEXUS_AW_URL);
  private readonly browserHistory = new BrowserHistoryClient();
  private readonly llm = createLlmClient({
    provider: this.config.NEXUS_LLM_PROVIDER,
    // Model tier overrides (universal — apply regardless of provider)
    models: {
      haiku: this.config.NEXUS_LLM_MODEL_HAIKU ?? this.config.ANTHROPIC_MODEL_HAIKU,
      sonnet: this.config.NEXUS_LLM_MODEL_SONNET ?? this.config.ANTHROPIC_MODEL_SONNET,
      opus: this.config.NEXUS_LLM_MODEL_OPUS ?? this.config.ANTHROPIC_MODEL_OPUS,
    },
    // Anthropic
    apiKey: this.config.ANTHROPIC_API_KEY,
    authToken: this.config.ANTHROPIC_AUTH_TOKEN,
    baseURL: this.config.ANTHROPIC_BASE_URL,
    // OpenAI / Gemini / DeepSeek / Kimi
    openaiApiKey: this.config.OPENAI_API_KEY,
    geminiApiKey: this.config.GEMINI_API_KEY,
    deepseekApiKey: this.config.DEEPSEEK_API_KEY,
    kimiApiKey: this.config.KIMI_API_KEY,
  });
  private readonly orchestrator = new Orchestrator(this.llm, this.tools(), this.repository.userId);

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
      offlineLlm: this.llm.provider === "deterministic",
      llmProvider: this.llm.provider,
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
    // Award exp/points when task completed; adjust credibility for completing with evidence
    if (status === "completed") {
      this.repository.applyTaskRewards(taskId);
      if (evidence?.note && evidence.note.trim().length >= 10) {
        this.repository.adjustCredibility(0.02);
      }
    }
    await this.syncVault();
    return task;
  }

  getUser() {
    return this.repository.getUser();
  }

  updateGoalStatus(goalId: string, status: GoalStatus): Goal {
    return this.repository.updateGoalStatus(goalId, status);
  }

  updateProfile(input: ProfileUpdateInput): Profile {
    const delta: Partial<Omit<Profile, "userId" | "updatedAt" | "version">> = {};
    if (input.basicInfo !== undefined) delta.basicInfo = input.basicInfo;
    if (input.traits !== undefined) delta.traits = input.traits;
    if (input.motivations !== undefined) delta.motivations = input.motivations;
    if (input.redLines !== undefined) delta.redLines = input.redLines;
    if (input.longTermVision !== undefined) delta.longTermVision = input.longTermVision;
    return this.repository.updateProfile(delta);
  }

  async runWeeklyInsight() {
    const result = await this.orchestrator.runInsight();
    await this.syncVault();
    return result;
  }

  async runCoachSession(goalTitle: string, session: CoachSessionInput) {
    return this.orchestrator.runCoachSession(goalTitle, session);
  }

  async runReminderCheck() {
    return this.orchestrator.runReminderCheck();
  }

  async runDailyReview(note: string) {
    const [screenActivity, browserVisits] = await Promise.all([
      this.activityWatch.getDayActivity().catch(() => undefined),
      this.browserHistory.getRecentVisits(10).catch(() => []),
    ]);
    const result = await this.orchestrator.handle("daily_review", note, {
      screenActivity,
      browserVisits,
    });
    await this.syncVault();
    return result;
  }

  async getBrowserHistory(limitHours = 8) {
    return this.browserHistory.getRecentVisits(limitHours);
  }

  async getActivityWatchStatus() {
    const status = await this.activityWatch.getStatus();
    if (!status.connected) return { connected: false };
    const activity = await this.activityWatch.getDayActivity().catch(() => null);
    return {
      connected: true,
      focusMinutes: activity?.focusMinutes ?? 0,
      distractMinutes: activity?.distractMinutes ?? 0,
      totalActiveMinutes: activity?.totalActiveMinutes ?? 0,
    };
  }

  getCompanion() {
    return this.repository.getCompanion();
  }

  queryEvents(limit = 20) {
    return this.repository.queryEvents(limit);
  }

  searchMemory(query: string, topK = 10) {
    return this.repository.searchMemory(query, topK);
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
      searchMemory: (query, topK) => this.repository.searchMemory(query, topK),
      getActiveGoals: () => this.repository.listGoals("active"),
      getCurrentTasks: () => this.repository.listTasks(),
      logEvent: (event) => this.repository.logEvent(event),
      unsafeLogEvent: (event) => this.repository.logEvent(event),
      createTask: (task) => this.repository.createTask(task),
      createGoal: (goal) => this.repository.createGoal(goal),
      updateGoalStatus: (goalId, status) => this.repository.updateGoalStatus(goalId, status),
      updateProfile: (delta) => this.repository.updateProfile(delta),
      updateTaskStatus: (taskId, status, evidence) =>
        this.repository.updateTaskStatus(taskId, status, evidence),
      saveReview: (review) => this.repository.saveReview(review),
      getReview: (reviewId) => this.repository.getReview(reviewId),
      triggerCompanion: (action) => this.repository.updateCompanion(action),
      getCompanion: () => this.repository.getCompanion(),
    };
  }
}
