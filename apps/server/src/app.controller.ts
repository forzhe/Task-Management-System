import { Body, Controller, Delete, Get, Inject, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  Goal,
  GoalStatusUpdateInput,
  ModelTier,
  ProfileUpdateInput,
  ReviewType,
  Task,
  TaskEditInput,
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
  sendChat(
    @Body() body: { message: string; trigger?: TriggerKind; modelTier?: ModelTier; model?: string },
  ) {
    const override =
      body.modelTier || body.model ? { modelTier: body.modelTier, model: body.model } : undefined;
    return this.nexus.handleChat(body.message, body.trigger ?? "user_message", override);
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

  @Patch("tasks/:id")
  editTask(@Param("id") id: string, @Body() body: TaskEditInput) {
    return this.nexus.updateTask(id, body);
  }

  @Post("tasks/:id/focus-session")
  recordFocusSession(@Param("id") id: string, @Body() body: { minutes: number }) {
    return this.nexus.recordFocusSession(id, body.minutes ?? 0);
  }

  @Delete("tasks/:id")
  deleteTask(@Param("id") id: string) {
    return this.nexus.deleteTask(id);
  }

  @Delete("events/:id")
  deleteEvent(@Param("id") id: string) {
    return this.nexus.deleteEvent(id);
  }

  @Delete("reviews/:id")
  deleteReview(@Param("id") id: string) {
    return this.nexus.deleteReview(id);
  }

  @Get("data/day")
  getDayData(@Query("date") date: string) {
    return this.nexus.getDayData(date ?? new Date().toISOString().slice(0, 10));
  }

  @Post("uploads")
  uploadImage(@Body() body: { dataUrl: string; filename?: string }) {
    return this.nexus.saveUpload(body.dataUrl, body.filename);
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

  @Get("streaks")
  listStreaks() {
    return this.nexus.listStreaks();
  }

  @Post("interventions/check")
  runInterventionCheck() {
    return this.nexus.runInterventionCheck();
  }

  @Get("attributes/meta")
  getAttributeMeta() {
    return this.nexus.getAttributeMeta();
  }

  @Post("attributes/decay")
  applyAttributeDecay() {
    return this.nexus.applyAttributeDecay();
  }

  @Post("profile/evolution/scan")
  runProfileEvolution(@Body() body: { deep?: boolean }) {
    return this.nexus.runProfileEvolution(body?.deep ?? false);
  }

  @Get("profile/observation")
  getProfileObservation() {
    return this.nexus.getProfileObservation();
  }

  @Post("profile/observation/scan")
  runProfileObservation(@Body() body: { deep?: boolean }) {
    return this.nexus.runProfileObservation(body?.deep ?? true);
  }

  @Get("profile/changes")
  listProfileChanges(@Query("status") status?: "pending" | "accepted" | "rejected" | "rolled_back") {
    return this.nexus.listProfileChanges(status);
  }

  @Post("profile/changes/:id/resolve")
  resolveProfileChange(@Param("id") id: string, @Body() body: { accept: boolean }) {
    return this.nexus.resolveProfileChange(id, body.accept);
  }

  @Post("profile/changes/:id/rollback")
  rollbackProfileChange(@Param("id") id: string) {
    return this.nexus.rollbackProfileChange(id);
  }

  @Get("decision/net-growth")
  getLatestNetGrowth() {
    return this.nexus.getLatestNetGrowth();
  }

  @Post("decision/net-growth")
  runNetGrowth() {
    return this.nexus.runNetGrowth();
  }

  @Post("decision/predict")
  runChoicePrediction(@Body() body: { question: string; options: string[] }) {
    return this.nexus.runChoicePrediction({
      question: body.question,
      options: body.options ?? [],
    });
  }

  @Get("reports/latest")
  getLatestReport(@Query("type") type?: ReviewType) {
    return this.nexus.getLatestReport(type ?? "weekly");
  }

  @Post("reports/weekly")
  runWeeklyReport() {
    return this.nexus.runWeeklyReport();
  }

  @Post("reports/monthly")
  runMonthlyReport() {
    return this.nexus.runMonthlyReport();
  }

  @Post("reports/quarterly")
  runQuarterlyReport() {
    return this.nexus.runQuarterlyReport();
  }

  @Post("reports/annual")
  runAnnualReport() {
    return this.nexus.runAnnualReport();
  }

  @Post("decision/simulate-path")
  runPathSimulation(@Body() body: { scenario: string; paths: string[] }) {
    return this.nexus.runPathSimulation({
      scenario: body.scenario,
      paths: body.paths ?? [],
    });
  }

  @Get("graph")
  getRelationshipGraph() {
    return this.nexus.getRelationshipGraph();
  }

  @Get("analysis/deep")
  getDeepAnalysis(@Query("days") days?: string) {
    return this.nexus.getDeepAnalysis(days ? Number(days) : 84);
  }

  @Post("memory/compact")
  compactMemory() {
    return this.nexus.compactMemory();
  }

  @Post("data/health/import")
  importHealthCsv(@Body() body: { csv: string }) {
    return this.nexus.importHealthCsv(body.csv ?? "");
  }

  @Get("data/health/recent")
  getRecentHealth(@Query("days") days?: string) {
    return this.nexus.getRecentHealth(days ? Number(days) : 14);
  }

  @Post("data/finance/import")
  importFinanceCsv(@Body() body: { csv: string }) {
    return this.nexus.importFinanceCsv(body.csv ?? "");
  }

  @Get("data/finance/summary")
  getFinanceSummary() {
    return this.nexus.getLatestFinanceSummary();
  }

  @Post("data/calendar/import")
  importCalendarIcs(@Body() body: { ics: string }) {
    return this.nexus.importCalendarIcs(body.ics ?? "");
  }

  @Get("data/calendar/upcoming")
  getUpcomingCalendar(@Query("days") days?: string) {
    return this.nexus.getUpcomingCalendar(days ? Number(days) : 7);
  }

  @Post("agents/health-steward")
  runHealthSteward() {
    return this.nexus.runHealthSteward();
  }

  @Post("agents/learning-steward")
  runLearningSteward() {
    return this.nexus.runLearningSteward();
  }

  @Post("agents/steward-sweep")
  runStewardSweep(@Body() body?: { force?: boolean }) {
    return this.nexus.runStewardSweep(body?.force ?? false);
  }

  @Get("divergences")
  listDivergences(@Query("status") status?: "open" | "confirmed" | "refuted" | "withdrawn") {
    return this.nexus.listDivergences(status);
  }

  @Post("divergences")
  openDivergence(@Body() body: { claim: string; evidence: string; domain?: string }) {
    return this.nexus.openDivergence({
      claim: body.claim,
      evidence: body.evidence,
      domain: body.domain,
    });
  }

  @Post("divergences/:id/resolve")
  resolveDivergence(
    @Param("id") id: string,
    @Body() body: { outcome: "confirmed" | "refuted" | "withdrawn"; note?: string },
  ) {
    return this.nexus.resolveDivergence(id, body.outcome, body.note);
  }

  @Get("shop")
  getShop() {
    return this.nexus.getShop();
  }

  @Post("shop/purchase")
  purchaseShopItem(@Body() body: { itemId: string }) {
    return this.nexus.purchaseShopItem(body.itemId);
  }

  @Post("shop/equip")
  equipSkin(@Body() body: { skinId: string }) {
    return this.nexus.equipSkin(body.skinId);
  }

  // ── 自定义悬赏与 AI 定价（商城子系统）──────────────────────────────

  @Get("bounties")
  getBounties() {
    return this.nexus.getBounties();
  }

  @Post("bounties")
  proposeBounty(@Body() body: { title: string; hostNote?: string; referenceCny?: number }) {
    return this.nexus.proposeBounty({
      title: body.title,
      hostNote: body.hostNote,
      referenceCny: body.referenceCny,
    });
  }

  @Post("bounties/:id/redeem")
  redeemBounty(@Param("id") id: string) {
    return this.nexus.redeemBounty(id);
  }

  @Post("bounties/:id/fulfill")
  fulfillBounty(@Param("id") id: string, @Body() body?: { evidenceRef?: string }) {
    return this.nexus.fulfillBounty(id, body?.evidenceRef);
  }

  @Post("bounties/:id/abandon")
  abandonBounty(@Param("id") id: string) {
    return this.nexus.abandonBounty(id);
  }

  @Get("evolution")
  listEvolution(@Query("status") status?: "proposed" | "applied" | "rolled_back" | "rejected") {
    return this.nexus.listEvolutionProposals(status);
  }

  @Post("evolution/scan")
  runEvolution(@Body() body: { targetKey: string }) {
    return this.nexus.runEvolution(body.targetKey);
  }

  @Post("evolution/:id/apply")
  applyEvolution(@Param("id") id: string) {
    return this.nexus.applyEvolution(id);
  }

  @Post("evolution/:id/rollback")
  rollbackEvolution(@Param("id") id: string) {
    return this.nexus.rollbackEvolution(id);
  }

  @Post("evolution/:id/reject")
  rejectEvolution(@Param("id") id: string) {
    return this.nexus.rejectEvolution(id);
  }
}
