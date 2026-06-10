import { Body, Controller, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  Goal,
  GoalStatusUpdateInput,
  ProfileUpdateInput,
  ReviewType,
  Task,
  TaskStatus,
  TaskStatusUpdateInput,
  TriggerKind,
} from "@nexus/shared";
import { NexusService } from "./nexus.service.js";

@Controller()
export class AppController {
  constructor(@Inject(NexusService) private readonly nexus: NexusService) {}

  @Get("health")
  getHealth() {
    return this.nexus.getHealth();
  }

  @Get("user")
  getUser() {
    return this.nexus.getUser();
  }

  @Post("chat/send")
  sendChat(@Body() body: { message: string; trigger?: TriggerKind }) {
    return this.nexus.handleChat(body.message, body.trigger ?? "user_message");
  }

  @Get("profile")
  getProfile() {
    return this.nexus.getProfile();
  }

  @Get("goals")
  listGoals() {
    return this.nexus.listGoals();
  }

  @Post("goals")
  createGoal(@Body() body: Pick<Goal, "title" | "level"> & Partial<Goal>) {
    return this.nexus.createGoal(body);
  }

  @Patch("goals/:id/status")
  updateGoalStatus(@Param("id") id: string, @Body() body: GoalStatusUpdateInput) {
    return this.nexus.updateGoalStatus(id, body.status);
  }

  @Patch("profile")
  updateProfile(@Body() body: ProfileUpdateInput) {
    return this.nexus.updateProfile(body);
  }

  @Get("tasks")
  listTasks(@Query("status") status?: TaskStatus) {
    return this.nexus.listTasks(status);
  }

  @Post("tasks")
  createTask(@Body() body: Pick<Task, "title"> & Partial<Task>) {
    return this.nexus.createTask(body);
  }

  @Patch("tasks/:id/status")
  updateTaskStatus(@Param("id") id: string, @Body() body: TaskStatusUpdateInput) {
    return this.nexus.updateTaskStatus(id, body.status, body.evidence);
  }

  @Post("reviews/daily")
  runDailyReview(@Body() body: { note: string }) {
    return this.nexus.runDailyReview(body.note);
  }

  @Get("reviews/latest")
  getLatestReview(@Query("type") type?: ReviewType) {
    return this.nexus.getLatestReview(type ?? "daily");
  }

  @Get("companion/state")
  getCompanion() {
    return this.nexus.getCompanion();
  }

  @Get("events/query")
  queryEvents(@Query("limit") limit?: string) {
    return this.nexus.queryEvents(limit ? Number(limit) : 20);
  }

  @Get("activity-watch/status")
  getActivityWatchStatus() {
    return this.nexus.getActivityWatchStatus();
  }

  @Post("insights/weekly")
  runWeeklyInsight() {
    return this.nexus.runWeeklyInsight();
  }

  @Post("coach/session")
  runCoachSession(
    @Body()
    body: {
      goalTitle: string;
      userAnswer: string;
      previousExchanges?: Array<{ question: string; answer: string }>;
    },
  ) {
    return this.nexus.runCoachSession(body.goalTitle, {
      goalTitle: body.goalTitle,
      userAnswer: body.userAnswer,
      previousExchanges: body.previousExchanges ?? [],
    });
  }

  @Post("reminders/check")
  runReminderCheck() {
    return this.nexus.runReminderCheck();
  }

  @Get("browser/history")
  getBrowserHistory(@Query("hours") hours?: string) {
    return this.nexus.getBrowserHistory(hours ? Number(hours) : 8);
  }

  @Get("memory/search")
  searchMemory(@Query("q") q: string, @Query("topK") topK?: string) {
    return this.nexus.searchMemory(q ?? "", topK ? Number(topK) : 10);
  }
}
