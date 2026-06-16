import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  type ChoicePredictionInput,
  type CoachSessionInput,
  type NexusTools,
  Orchestrator,
  type PathSimulationInput,
  clearPromptOverride,
  createLlmClient,
  setPromptOverride,
} from "@nexus/ai-core";
import { NexusRepository } from "@nexus/memory";
import type {
  CalendarEvent,
  CalendarImportResult,
  DataImportResult,
  DivergenceOutcome,
  FinanceSummary,
  Goal,
  GoalStatus,
  GraphEdge,
  GraphNode,
  HealthDaySummary,
  InterventionSignal,
  PeriodReport,
  PeriodStats,
  Profile,
  ProfileUpdateInput,
  RelationshipGraph,
  ReviewType,
  ShopPurchaseResult,
  ShopView,
  StreakCategory,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  TriggerKind,
} from "@nexus/shared";
import {
  ATTRIBUTE_LABELS,
  DIVERGENCE_CREDIBILITY_DELTA,
  SHOP_CATALOG,
  isEvolutionTargetAllowed,
} from "@nexus/shared";
import { ActivityWatchClient } from "./activity-watch.js";
import { computeDeepAnalysis } from "./analysis/deep-analysis.js";
import { BrowserHistoryClient } from "./browser-history.js";
import { CalendarIcsSource } from "./data-sources/calendar-ics.js";
import { loadConfig } from "./config.js";
import {
  FinanceCsvSource,
  summarizeFinance,
  summarizeFinanceByDay,
} from "./data-sources/finance-csv.js";
import {
  HealthCsvSource,
  staminaXpForDay,
  summarizeHealthByDay,
} from "./data-sources/health-csv.js";
import { VaultWriter } from "./vault-writer.js";

/** 本地自然日（与 repository 的链结算同一时区口径）*/
function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function localDateOf(iso: string): string {
  return localDate(new Date(iso));
}

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
  private readonly healthSource = new HealthCsvSource();
  private readonly financeSource = new FinanceCsvSource();
  private readonly calendarSource = new CalendarIcsSource();
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
    // 混合推理（本地 Ollama）P4-3：配了本地模型即把 localTiers 路由到本地，回落云端
    localModel: this.config.NEXUS_LOCAL_LLM_MODEL,
    localBaseURL: this.config.NEXUS_LOCAL_LLM_BASE_URL,
    localTiers: this.config.NEXUS_LOCAL_LLM_TIERS?.split(",")
      .map((t) => t.trim())
      .filter((t): t is "haiku" | "sonnet" | "opus" =>
        ["haiku", "sonnet", "opus"].includes(t),
      ),
  });
  private readonly orchestrator = new Orchestrator(this.llm, this.tools(), this.repository.userId);

  async onModuleDestroy(): Promise<void> {
    this.repository.close();
  }

  async bootstrapVault(): Promise<void> {
    // §6.7.5：为历史事件回填向量（升级前写入的事件无 embedding）
    const filled = this.repository.backfillEmbeddings();
    if (filled > 0) console.log(`[memory] backfilled embeddings for ${filled} events`);
    // §6.4：把已应用的进化提议同步进运行时提示词覆盖表
    this.syncPromptOverrides();
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
    this.repository.markInterventionsRespondedToday();
    const result = await this.orchestrator.handle(trigger, message);
    if (trigger === "morning_planning") {
      await this.recordStreak("morning_planning");
    }
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
      this.repository.markInterventionsRespondedToday();
      await this.recordStreak("task_completion");
      if (task.goalId) {
        await this.recordStreak("goal_progress", task.goalId);
      }
    }
    await this.syncVault();
    return task;
  }

  /** §6.6.1+6.6.2：记录链活动；命中里程碑时触发微洞察（失败不阻塞主流程）*/
  private async recordStreak(category: StreakCategory, goalId = ""): Promise<void> {
    try {
      const { streak, milestoneHit } = this.repository.recordStreakActivity(category, goalId);
      if (milestoneHit) {
        await this.orchestrator.runStreakMilestone({ streak, milestone: milestoneHit });
      }
    } catch (err) {
      console.error(`streak record failed for ${category}:`, err);
    }
  }

  listStreaks() {
    return this.repository.listStreaks();
  }

  // ── 属性衰减 §8.1 ────────────────────────────────────────────────

  /** 每日衰减结算（00:10 调度）。新跨入 14 天档的维度触发小人关怀 */
  applyAttributeDecay() {
    const result = this.repository.applyAttributeDecay();
    if (result.decayed.length > 0) {
      this.repository.logEvent({
        source: "growth-engine",
        type: "system",
        category: "attribute_decay",
        rawPayload: { decayed: result.decayed },
        structured: {
          summary: `${result.decayed.length} 个维度发生衰减`,
          decayed: result.decayed,
        },
        occurredAt: new Date().toISOString(),
        confidence: 1,
        tags: ["attribute", "decay"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
    }
    if (result.needsCare.length > 0) {
      const labels = result.needsCare.map((k) => ATTRIBUTE_LABELS[k]).join("、");
      this.repository.updateCompanion({
        companionId: "main",
        state: "caring",
        dialogue: `已经两周没有滋养${labels}了。属性在退化——不是惩罚，是提醒。给它一个最小的推进就能回到正轨。`,
      });
    }
    return result;
  }

  getAttributeMeta() {
    return this.repository.getAttributeMetaPublic();
  }

  // ── 能量点商城 §6.7.6 ────────────────────────────────────────────

  getShop(): ShopView {
    const user = this.repository.getUser();
    const companion = this.repository.getCompanion();
    return {
      catalog: SHOP_CATALOG,
      owned: companion.unlockedSkins,
      equipped: companion.currentForm,
      energyPoints: user.energyPoints,
      credibilityScore: user.credibilityScore,
    };
  }

  /** 兑换皮肤/特效：校验门槛 → 扣能量点 → 加入已拥有（虚拟奖励，§6.7.6）*/
  purchaseShopItem(itemId: string): ShopPurchaseResult {
    const item = SHOP_CATALOG.find((i) => i.id === itemId);
    if (!item) return { ok: false, error: "商品不存在" };
    const user = this.repository.getUser();
    const companion = this.repository.getCompanion();
    if (companion.unlockedSkins.includes(itemId)) return { ok: false, error: "已拥有该物品" };
    if (user.credibilityScore < item.minCredibility) {
      return { ok: false, error: `需要可信度 ≥ ${item.minCredibility.toFixed(1)}` };
    }
    if (user.energyPoints < item.cost) return { ok: false, error: "能量点不足" };

    if (!this.repository.spendEnergy(item.cost)) return { ok: false, error: "能量点不足" };
    this.repository.addUnlockedSkin(itemId);
    this.repository.logEvent({
      source: "shop",
      type: "action",
      category: "shop_purchase",
      rawPayload: { itemId, cost: item.cost },
      structured: { summary: `兑换「${item.name}」，消耗 ${item.cost} 能量点`, itemId, cost: item.cost },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["shop", item.kind],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return { ok: true, itemId, energyPoints: user.energyPoints - item.cost };
  }

  /** 装备已拥有的皮肤（或恢复 default）*/
  equipSkin(skinId: string) {
    const companion = this.repository.equipSkin(skinId);
    return { equipped: companion.currentForm };
  }

  // ── 黑箱裁决 §6.7.4 ──────────────────────────────────────────────

  /**
   * 宿主对多源冲突坚持原陈述 → 开启一条分歧。系统不强制修正、不即时扣可信度，
   * 进入「追踪中」：记得你坚持过什么，现实后来会说话。
   */
  openDivergence(input: { claim: string; evidence: string; domain?: string }) {
    const divergence = this.repository.saveDivergence({
      claim: input.claim,
      evidence: input.evidence,
      domain: input.domain || "review",
    });
    this.repository.logEvent({
      source: "arbiter",
      type: "decision",
      category: "divergence_opened",
      rawPayload: { divergenceId: divergence.id },
      structured: {
        summary: `分歧已记录（追踪中）：${divergence.claim.slice(0, 40)}`,
        divergenceId: divergence.id,
        domain: divergence.domain,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["divergence", "open"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    this.repository.updateCompanion({
      companionId: "main",
      state: "strict",
      dialogue: "记下了。我不强迫你认同——但我会记得你坚持过什么。现实会说话。",
    });
    return divergence;
  }

  listDivergences(status?: "open" | "confirmed" | "refuted" | "withdrawn") {
    return this.repository.listDivergences(status);
  }

  /**
   * 裁决一条分歧。confirmed=现实证实了宿主(+可信度)；refuted=证伪(-可信度，§6.1 延后的惩罚)；
   * withdrawn=宿主主动撤回(小幅+，诚实让步)。
   */
  resolveDivergence(id: string, outcome: DivergenceOutcome, note?: string) {
    const updated = this.repository.updateDivergenceStatus(id, outcome, note);
    if (!updated || updated.status !== outcome) return updated;
    const delta = DIVERGENCE_CREDIBILITY_DELTA[outcome];
    this.repository.adjustCredibility(delta);
    this.repository.logEvent({
      source: "arbiter",
      type: "decision",
      category: "divergence_resolved",
      rawPayload: { divergenceId: id, outcome, delta },
      structured: {
        summary: `分歧裁决：${outcome}（可信度 ${delta >= 0 ? "+" : ""}${delta}）`,
        divergenceId: id,
        outcome,
        credibilityDelta: delta,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["divergence", outcome],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return updated;
  }

  // ── 系统进化引擎 §6.4 ────────────────────────────────────────────

  /** 启动时：已应用的进化 → 运行时提示词覆盖；非应用态确保清除 */
  private syncPromptOverrides(): void {
    for (const p of this.repository.listAppliedEvolutions()) {
      if (isEvolutionTargetAllowed(p.targetKey)) setPromptOverride(p.targetKey, p.newPrompt);
    }
  }

  /** 进化指标（确定性，从现有数据派生）*/
  private evolutionMetrics(): Record<string, unknown> {
    const now = Date.now();
    const events = this.repository.queryEventsSince(new Date(now - 28 * 86400000).toISOString());
    const completedIn = (fromDays: number, toDays: number) =>
      events.filter((e) => {
        if (e.category !== "task_status_changed") return false;
        if ((e.structured as Record<string, unknown>).toStatus !== "completed") return false;
        const age = (now - new Date(e.occurredAt).getTime()) / 86400000;
        return age >= fromDays && age < toDays;
      }).length;
    const profileChanges = this.repository.listProfileChangeProposals();
    const accepted = profileChanges.filter((p) => p.status === "accepted").length;
    const rejected = profileChanges.filter((p) => p.status === "rejected").length;
    const divergences = this.repository.listDivergences();
    const refuted = divergences.filter((d) => d.status === "refuted").length;
    const confirmed = divergences.filter((d) => d.status === "confirmed").length;
    return {
      tasksCompletedLast14: completedIn(0, 14),
      tasksCompletedPrev14: completedIn(14, 28),
      profileChangeAcceptRate:
        accepted + rejected > 0 ? Number((accepted / (accepted + rejected)).toFixed(2)) : null,
      divergenceRefutedVsConfirmed: `${refuted} 证伪 / ${confirmed} 证实`,
    };
  }

  /** §6.4 运行进化扫描（仅提议）。目标禁区在 Agent 内硬拦截 */
  async runEvolution(targetKey: string) {
    const result = await this.orchestrator.runEvolution({
      targetKey,
      metrics: this.evolutionMetrics(),
    });
    const evo = result.structured?.evolution as
      | { changeNeeded: boolean; reason: string; newPrompt: string; targetKey: string }
      | undefined;
    const oldPrompt = String(result.structured?.oldPrompt ?? "");
    // 仅当确实需要改动且非禁区时，落一条 proposed 记录待宿主确认
    if (evo?.changeNeeded && evo.newPrompt && isEvolutionTargetAllowed(evo.targetKey)) {
      this.repository.saveEvolutionProposal({
        targetKey: evo.targetKey,
        reason: evo.reason,
        oldPrompt,
        newPrompt: evo.newPrompt,
      });
    }
    return result;
  }

  listEvolutionProposals(status?: "proposed" | "applied" | "rolled_back" | "rejected") {
    return this.repository.listEvolutionProposals(status);
  }

  /** 应用一条进化提议：写运行时覆盖 + 标记 applied（§6.4，仅宿主确认后）*/
  applyEvolution(id: string) {
    const p = this.repository.getEvolutionProposal(id);
    if (!p || p.status !== "proposed") return { ok: false, error: "提议不存在或已处理" };
    if (!isEvolutionTargetAllowed(p.targetKey)) return { ok: false, error: "目标在禁区，拒绝应用" };
    setPromptOverride(p.targetKey, p.newPrompt);
    this.repository.updateEvolutionStatus(id, "applied");
    this.repository.logEvent({
      source: "evolution",
      type: "decision",
      category: "evolution_applied",
      rawPayload: { id, targetKey: p.targetKey },
      structured: { summary: `进化已应用：${p.targetKey}`, id, targetKey: p.targetKey },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["evolution", "applied"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return { ok: true };
  }

  /** 回滚一条已应用的进化：清除运行时覆盖 + 标记 rolled_back */
  rollbackEvolution(id: string) {
    const p = this.repository.getEvolutionProposal(id);
    if (!p) return { ok: false, error: "提议不存在" };
    clearPromptOverride(p.targetKey);
    this.repository.updateEvolutionStatus(id, "rolled_back");
    this.repository.logEvent({
      source: "evolution",
      type: "decision",
      category: "evolution_rolled_back",
      rawPayload: { id, targetKey: p.targetKey },
      structured: { summary: `进化已回滚：${p.targetKey}`, id, targetKey: p.targetKey },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["evolution", "rolled_back"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return { ok: true };
  }

  /** 拒绝一条提议（不应用，仅留痕）*/
  rejectEvolution(id: string) {
    this.repository.updateEvolutionStatus(id, "rejected");
    return { ok: true };
  }

  // ── 记忆遗忘 §5.2 ────────────────────────────────────────────────

  /** 每日凌晨记忆收紧：聚合琐碎旧事件，保护重要记忆 */
  compactMemory() {
    return this.repository.compactMemory();
  }

  // ── 深度长期趋势 §7.3 Lv.50 ──────────────────────────────────────

  /** 跨周期深度趋势分析（确定性，默认 84 天/12 周）*/
  getDeepAnalysis(windowDays = 84) {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const user = this.repository.getUser();
    return computeDeepAnalysis({
      events: this.repository.queryEventsSince(since),
      attributes: user.attributes,
      credibilityScore: user.credibilityScore,
      currentLevel: user.currentLevel,
      streaks: this.repository.listStreaks(),
      windowDays,
    });
  }

  // ── 关系图谱 §5.1 ────────────────────────────────────────────────

  /** 构建目标-任务-属性关系图（只读聚合，不存储）*/
  getRelationshipGraph(): RelationshipGraph {
    const goals = this.repository.listGoals("active");
    const tasks = this.repository.listTasks();
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];

    for (const goal of goals) {
      nodes.push({
        id: `goal:${goal.id}`,
        type: "goal",
        label: goal.title,
        weight: Math.max(10, Math.round(goal.progress * 100)),
      });
    }

    // 属性节点（六维），权重为当前数值
    const attributes = this.repository.getUser().attributes;
    for (const [key, value] of Object.entries(attributes)) {
      nodes.push({
        id: `attr:${key}`,
        type: "attribute",
        label: ATTRIBUTE_LABELS[key as keyof typeof ATTRIBUTE_LABELS] ?? key,
        weight: Math.max(8, Number(value)),
      });
    }

    const goalIds = new Set(goals.map((g) => g.id));
    for (const task of tasks) {
      // 只纳入与活跃目标相关或近期的任务，避免图过载
      const relevant = (task.goalId && goalIds.has(task.goalId)) || task.status !== "completed";
      if (!relevant) continue;
      nodes.push({
        id: `task:${task.id}`,
        type: "task",
        label: task.title,
        weight: Math.max(6, task.rewardPoints),
        status: task.status,
      });
      if (task.goalId && goalIds.has(task.goalId)) {
        edges.push({
          from: `task:${task.id}`,
          to: `goal:${task.goalId}`,
          kind: "task_of_goal",
          weight: 1,
        });
      }
      for (const [attr, xp] of Object.entries(task.expRewards)) {
        if (attr in attributes) {
          edges.push({
            from: `task:${task.id}`,
            to: `attr:${attr}`,
            kind: "task_feeds_attribute",
            weight: Number(xp),
          });
        }
      }
    }

    return { nodes, edges };
  }

  // ── 周期报告 §9 ──────────────────────────────────────────────────

  /** 聚合某周期的确定性统计（不调 LLM）*/
  private buildPeriodStats(days: number): PeriodStats {
    const now = new Date();
    const sinceMs = now.getTime() - days * 86400000;
    const sinceIso = new Date(sinceMs).toISOString();
    const events = this.repository.queryEventsSince(sinceIso);

    let tasksCompleted = 0;
    let tasksFailed = 0;
    let reviewsDone = 0;
    const netGrowthSeries: number[] = [];
    const eventsByCategory: Record<string, number> = {};

    // §6.7 多源滚动汇总累加器
    let healthDays = 0;
    let stepsSum = 0;
    let workoutSum = 0;
    let financeExpense = 0;
    let financeIncome = 0;
    let impulseSignals = 0;

    for (const e of events) {
      const cat = e.category ?? e.type;
      eventsByCategory[cat] = (eventsByCategory[cat] ?? 0) + 1;
      if (e.category === "task_status_changed") {
        const to = e.structured.toStatus;
        if (to === "completed") tasksCompleted += 1;
        else if (to === "failed") tasksFailed += 1;
      }
      if (e.category === "daily_review") reviewsDone += 1;
      if (e.category === "net_growth") {
        const v = e.structured.netValue;
        if (typeof v === "number") netGrowthSeries.push(v);
      }
      if (e.category === "health_day") {
        healthDays += 1;
        const s = e.structured as Record<string, unknown>;
        if (typeof s.steps === "number") stepsSum += s.steps;
        if (typeof s.workoutMinutes === "number") workoutSum += s.workoutMinutes;
      }
      if (e.category === "finance_day") {
        const s = e.structured as Record<string, unknown>;
        if (typeof s.expense === "number") financeExpense += s.expense;
        if (typeof s.income === "number") financeIncome += s.income;
      }
      if (e.category === "finance_import") {
        const fs = (e.structured as Record<string, unknown>).financeSummary as
          | { impulseFlags?: unknown[] }
          | undefined;
        if (Array.isArray(fs?.impulseFlags)) impulseSignals += fs.impulseFlags.length;
      }
    }

    const healthRollup =
      healthDays > 0
        ? {
            activeDays: healthDays,
            avgSteps: Math.round(stepsSum / healthDays),
            totalWorkoutMinutes: Math.round(workoutSum),
          }
        : undefined;
    const financeRollup =
      financeExpense > 0 || financeIncome > 0
        ? {
            totalExpense: Math.round(financeExpense),
            totalIncome: Math.round(financeIncome),
            impulseSignals,
          }
        : undefined;

    const netGrowthAvg =
      netGrowthSeries.length > 0
        ? Math.round(netGrowthSeries.reduce((s, v) => s + v, 0) / netGrowthSeries.length)
        : null;

    const streaks = this.repository.listStreaks().map((s) => ({
      category: s.category,
      current: s.currentStreak,
      longest: s.longestStreak,
    }));

    const pendingProposals = this.repository.listProfileChangeProposals("pending").length;

    return {
      periodStart: sinceIso,
      periodEnd: now.toISOString(),
      tasksCompleted,
      tasksFailed,
      reviewsDone,
      netGrowthSeries,
      netGrowthAvg,
      streaks,
      attributeSnapshot: this.repository.getUser().attributes,
      eventsByCategory,
      pendingProposals,
      ...(healthRollup ? { healthRollup } : {}),
      ...(financeRollup ? { financeRollup } : {}),
    };
  }

  /** §9 周期报告：聚合统计 → LLM 叙事 → 存为 Review */
  private async runPeriodReport(type: ReviewType, days: number): Promise<PeriodReport> {
    const stats = this.buildPeriodStats(days);
    const profile = this.repository.getProfile();
    const profileSummary = [
      `动机=${JSON.stringify(profile.motivations)}`,
      `长期愿景=${JSON.stringify(profile.longTermVision)}`,
    ].join("\n");

    const { narrative } = await this.orchestrator.runPeriodReport({ type, stats, profileSummary });

    const review = this.repository.saveReview({
      type,
      scopeStart: stats.periodStart,
      scopeEnd: stats.periodEnd,
      subjective: {},
      objective: { ...stats },
      aiAnalysis: { ...narrative },
      suggestedAdjustments: { nextFocus: narrative.nextFocus },
      emotionTags: [narrative.trend],
      credibilityCheck: null,
    });

    await this.syncVault();
    return { type, stats, narrative, reviewId: review.id, createdAt: review.createdAt };
  }

  async runWeeklyReport(): Promise<PeriodReport> {
    return this.runPeriodReport("weekly", 7);
  }

  async runMonthlyReport(): Promise<PeriodReport> {
    return this.runPeriodReport("monthly", 30);
  }

  /** §9 / P3-9 季度报告（90 天多源长期趋势）*/
  async runQuarterlyReport(): Promise<PeriodReport> {
    return this.runPeriodReport("quarterly", 90);
  }

  /** §9 / P3-9 年度报告（365 天）*/
  async runAnnualReport(): Promise<PeriodReport> {
    return this.runPeriodReport("annual", 365);
  }

  /** 读取最近某周期报告（事件流缓存，避免每次都调 LLM）*/
  getLatestReport(type: ReviewType): PeriodReport | null {
    const category = `${type}_report`;
    const event = this.repository.queryEvents(200).find((e) => e.category === category);
    if (!event) return null;
    const output = event.structured.output;
    const stats = event.structured.stats;
    if (!output || typeof output !== "object" || !stats || typeof stats !== "object") return null;
    return {
      type,
      stats: stats as PeriodStats,
      narrative: output as PeriodReport["narrative"],
      reviewId: "",
      createdAt: event.occurredAt,
    };
  }

  // ── Decision Agent §8/§9 ─────────────────────────────────────────

  /** §8 今日净成长值 */
  async runNetGrowth() {
    const result = await this.orchestrator.runNetGrowth();
    await this.syncVault();
    return result;
  }

  /** §9 选择前预测 */
  async runChoicePrediction(input: ChoicePredictionInput) {
    return this.orchestrator.runChoicePrediction(input);
  }

  /** §9 人生路线模拟 */
  async runPathSimulation(input: PathSimulationInput) {
    return this.orchestrator.runPathSimulation(input);
  }

  /** 读取最近一次净成长值（事件流缓存，避免每次刷新都调 LLM）*/
  getLatestNetGrowth() {
    const event = this.repository
      .queryEvents(80)
      .find((e) => e.category === "net_growth");
    if (!event) return null;
    const output = event.structured.output;
    return output && typeof output === "object"
      ? { ...(output as Record<string, unknown>), at: event.occurredAt }
      : null;
  }

  // ── 档案演化 §5.3 ────────────────────────────────────────────────

  /** 运行档案演化扫描（每周触发或手动）。deep=true 走 opus 月度深扫 */
  async runProfileEvolution(deep = false) {
    const result = await this.orchestrator.runProfileEvolution(deep);
    await this.syncVault();
    return result;
  }

  listProfileChanges(status?: "pending" | "accepted" | "rejected" | "rolled_back") {
    return this.repository.listProfileChangeProposals(status);
  }

  resolveProfileChange(proposalId: string, accept: boolean) {
    const result = this.repository.resolveProfileChange(proposalId, accept);
    this.repository.logEvent({
      source: "profile-api",
      type: "decision",
      category: "profile_change_resolved",
      rawPayload: { proposalId, accept },
      structured: {
        summary: `档案提议${accept ? "已接受" : "已拒绝"}：${result.proposal.field}`,
        proposalId,
        accepted: accept,
        field: result.proposal.field,
      },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["profile", accept ? "accepted" : "rejected"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    return result;
  }

  /** §6.6.1：日界结算（00:05 调度）。断链 ≥7 天触发断链分析；顺带做低谷检测 */
  async settleDailyStreaks() {
    const broken = this.repository.settleStreaks();
    for (const item of broken) {
      if (item.previousLength >= 7) {
        try {
          await this.orchestrator.runStreakBreak({
            streak: item.streak,
            previousLength: item.previousLength,
          });
        } catch (err) {
          console.error("streak break analysis failed:", err);
        }
      }
    }
    this.detectLowValley();
    return { brokenCount: broken.length };
  }

  /** §6.6.2：低谷检测——连续 3 天零任务完成且仍有未完成任务 */
  private detectLowValley(): void {
    const tasks = this.repository.listTasks();
    if (tasks.length === 0) return;
    const last3Days = [1, 2, 3].map((i) => localDate(new Date(Date.now() - i * 86400000)));
    const hasCompletionInWindow = tasks.some(
      (t) => t.completedAt && last3Days.includes(localDateOf(t.completedAt)),
    );
    if (hasCompletionInWindow) return;
    const hasPendingWork = tasks.some(
      (t) => t.status !== "completed" && t.status !== "reviewed" && t.status !== "failed",
    );
    if (!hasPendingWork) return;

    this.repository.logEvent({
      source: "persistence-engine",
      type: "system",
      category: "low_valley",
      rawPayload: { window: last3Days },
      structured: { summary: "连续 3 天无任务完成，触发低谷关怀" },
      occurredAt: new Date().toISOString(),
      confidence: 1,
      tags: ["streak", "low_valley"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });
    this.repository.updateCompanion({
      companionId: "main",
      state: "caring",
      dialogue: "已经三天没有推进了。不追问原因——但如果有什么挡着你，输入「教练」，我们聊聊。",
    });
  }

  /** §6.6.4：关键时刻主动介入（每小时调度，纯 SQL 信号 + 预算 + 升级阶梯）*/
  async runInterventionCheck(): Promise<{ fired: InterventionSignal[] }> {
    const hour = new Date().getHours();
    const today = localDate();
    const fired: InterventionSignal[] = [];
    const signals: InterventionSignal[] = [];

    const tasks = this.repository.listTasks();
    const streaks = this.repository.listStreaks();
    const completedToday = tasks.filter(
      (t) => t.completedAt && localDateOf(t.completedAt) === today,
    ).length;

    // streak_at_risk：19:00 后当日 0 完成且存在 ≥3 天的链今日未活跃
    const anyChainAtRisk = streaks.some(
      (s) => s.currentStreak >= 3 && s.lastActiveDate !== today,
    );
    if (hour >= 19 && completedToday === 0 && anyChainAtRisk) signals.push("streak_at_risk");

    // stalled_task：in_progress 停留 > 2h 无状态变化
    const TWO_HOURS = 2 * 3600 * 1000;
    const hasStalled = tasks.some((t) => {
      if (t.status !== "in_progress") return false;
      const last = t.statusHistory.at(-1);
      return Boolean(last && Date.now() - new Date(last.at).getTime() > TWO_HOURS);
    });
    if (hasStalled) signals.push("stalled_task");

    // review_at_risk：22:00 后未做日终校准且校准链 ≥3
    const reviewStreak = streaks.find((s) => s.category === "daily_review");
    if (
      hour >= 22 &&
      reviewStreak &&
      reviewStreak.currentStreak >= 3 &&
      reviewStreak.lastActiveDate !== today
    ) {
      signals.push("review_at_risk");
    }

    // silent_day：20:00 后全天无任何事件
    const recentEvents = this.repository.queryEvents(50);
    const anyEventToday = recentEvents.some((e) => localDateOf(e.occurredAt) === today);
    if (hour >= 20 && !anyEventToday) signals.push("silent_day");

    for (const signal of signals) {
      // 预算：每日总数 ≤ 2；同信号每日 1 次
      if (this.repository.countInterventionsToday() >= 2) break;
      if (this.repository.hasInterventionFiredToday(signal)) continue;
      // 静默：连续 3 次被忽略且 7 天内触发过 → 跳过（7 天后自动解除）
      if (
        this.repository.consecutiveIgnoredCount(signal) >= 3 &&
        this.repository.countSignalLastDays(signal, 7) > 0
      ) {
        continue;
      }

      // 升级阶梯：同类信号一周第 3 次 → 提议教练对话
      const weekCount = this.repository.countSignalLastDays(signal, 7);
      const hint =
        weekCount >= 2
          ? `介入信号 ${signal} 本周第 ${weekCount + 1} 次触发。生成一条邀请宿主进行教练对话的提醒（邀请语气，不强制，例如"要不要聊聊是什么在挡着你？"）。shouldNotify 必须为 true。`
          : `检测到介入信号：${signal}。生成一条简短、克制的提醒。shouldNotify 必须为 true。`;
      try {
        await this.orchestrator.runReminderCheck(hint);
        this.repository.logIntervention(signal);
        fired.push(signal);
      } catch (err) {
        console.error(`intervention ${signal} failed:`, err);
      }
    }
    return { fired };
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
    // §6.7.2：今日健康源（仅当匹配今天日期，缺失=未同步，不等于矛盾）
    const today = localDate();
    const healthToday = this.getRecentHealth(2).find((d) => d.date === today);
    const financeRecent = this.getLatestFinanceSummary() ?? undefined;
    const result = await this.orchestrator.handle("daily_review", note, {
      screenActivity,
      browserVisits,
      healthToday,
      financeRecent,
    });
    await this.recordStreak("daily_review");
    // 日终顺带刷新今日净成长值（失败不阻塞复盘）
    try {
      await this.orchestrator.runNetGrowth();
    } catch (err) {
      console.error("net growth refresh failed:", err);
    }
    await this.syncVault();
    return result;
  }

  async getBrowserHistory(limitHours = 8) {
    return this.browserHistory.getRecentVisits(limitHours);
  }

  // ── 全域感知 · 日历 §6.7 ─────────────────────────────────────────

  /** 导入 .ics 日历：解析 → 事件流（去重 uid）。日程喂晨间规划 + 复盘客观锚点。*/
  importCalendarIcs(ics: string): CalendarImportResult {
    const parsed = this.calendarSource.parse(ics);
    // 近 90 天已存在的日历 uid，避免重复导入
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const existingUids = new Set(
      this.repository
        .queryEventsSince(since)
        .filter((e) => e.category === "calendar_event")
        .map((e) => String((e.structured as Record<string, unknown>).uid ?? "")),
    );

    let imported = 0;
    let skipped = 0;
    for (const ev of parsed) {
      if (existingUids.has(ev.uid)) {
        skipped += 1;
        continue;
      }
      this.repository.logEvent({
        source: "calendar-ics",
        type: "external_data",
        category: "calendar_event",
        rawPayload: { ...ev },
        structured: {
          summary: `${ev.start.slice(0, 16).replace("T", " ")} ${ev.title}`,
          ...ev,
        },
        occurredAt: ev.start,
        confidence: 0.95,
        tags: ["calendar"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
      imported += 1;
    }
    return {
      imported,
      skipped,
      summary:
        parsed.length === 0
          ? "未解析到有效的日历事件（需要 .ics 文件内容）。"
          : `导入 ${imported} 个日程${skipped > 0 ? `，跳过 ${skipped} 个重复` : ""}。`,
    };
  }

  /** 读取某窗口内的日历事件（按开始时间正序）*/
  private readCalendar(fromMs: number, toMs: number): CalendarEvent[] {
    const since = new Date(Math.min(fromMs, Date.now() - 1)).toISOString();
    return this.repository
      .queryEventsSince(since)
      .filter((e) => e.category === "calendar_event")
      .map((e) => e.structured as unknown as CalendarEvent)
      .filter((c) => {
        const t = new Date(c.start).getTime();
        return t >= fromMs && t <= toMs;
      })
      .sort((a, b) => a.start.localeCompare(b.start));
  }

  getTodayCalendar(): CalendarEvent[] {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    return this.readCalendar(start, start + 86400000);
  }

  getUpcomingCalendar(days = 7): CalendarEvent[] {
    return this.readCalendar(Date.now(), Date.now() + days * 86400000);
  }

  // ── 全域感知 · 健康数据 §6.7 ─────────────────────────────────────

  /** 导入健康/运动 CSV：归一化 → 事件流 + 体力属性奖励 */
  importHealthCsv(csv: string) {
    const signals = this.healthSource.parse(csv);
    const days = summarizeHealthByDay(signals);
    let attributeXpAwarded = 0;

    for (const day of days) {
      const xp = staminaXpForDay(day);
      if (xp > 0) {
        this.repository.awardAttributeXp("stamina", xp);
        attributeXpAwarded += xp;
      }
      // health 事件带 ["health"] 标签 → 记忆遗忘策略保护，可做长期趋势
      this.repository.logEvent({
        source: "health-csv",
        type: "external_data",
        category: "health_day",
        rawPayload: { ...day },
        structured: {
          summary: `${day.date} 健康：步数 ${day.steps ?? "-"}、运动 ${day.workoutMinutes ?? day.activeMinutes ?? 0} 分钟、睡眠 ${day.sleepHours ?? "-"}h`,
          ...day,
          staminaXp: xp,
        },
        occurredAt: `${day.date}T12:00:00.000Z`,
        confidence: 0.9,
        tags: ["health", "stamina"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
    }

    const result: DataImportResult = {
      kind: "health",
      daysImported: days.length,
      signalsImported: signals.length,
      attributeXpAwarded,
      summary:
        days.length === 0
          ? "未识别到有效的健康数据列（需要日期列 + 步数/运动/睡眠等至少一列）。"
          : `导入 ${days.length} 天健康数据，体力 +${attributeXpAwarded}。`,
    };
    return result;
  }

  /** 导入财务账单 CSV：归一化 → 事件流 + 冲动消费检测（§6.7.6）*/
  importFinanceCsv(csv: string) {
    const txns = this.financeSource.parseTxns(csv);
    const days = summarizeFinanceByDay(txns);
    const summary = summarizeFinance(txns);

    for (const day of days) {
      this.repository.logEvent({
        source: "finance-csv",
        type: "external_data",
        category: "finance_day",
        rawPayload: { ...day },
        structured: {
          summary: `${day.date} 财务：支出 ${day.expense}、收入 ${day.income}`,
          ...day,
        },
        occurredAt: `${day.date}T20:00:00.000Z`,
        confidence: 0.9,
        tags: ["finance"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
    }
    // 周期汇总事件（含冲动信号），供复盘/洞察检索
    this.repository.logEvent({
      source: "finance-csv",
      type: "external_data",
      category: "finance_import",
      rawPayload: { summary },
      structured: { summary: `财务导入：支出 ${summary.totalExpense}，冲动信号 ${summary.impulseFlags.length} 条`, financeSummary: summary },
      occurredAt: new Date().toISOString(),
      confidence: 0.9,
      tags: ["finance", "summary"],
      relatedGoalIds: [],
      relatedTaskIds: [],
    });

    const result: DataImportResult = {
      kind: "finance",
      daysImported: days.length,
      signalsImported: txns.length,
      attributeXpAwarded: 0,
      impulseFlags: summary.impulseFlags,
      summary:
        txns.length === 0
          ? "未识别到有效账单（需要日期列 + 金额列；收/支与分类列可选）。"
          : `导入 ${txns.length} 笔交易，支出 ${summary.totalExpense}，识别 ${summary.impulseFlags.length} 条冲动信号。`,
    };
    return result;
  }

  /** 最近一次财务周期汇总（从 finance_import 事件还原），近 35 天内有效 */
  getLatestFinanceSummary(): FinanceSummary | null {
    const cutoff = new Date(Date.now() - 35 * 86400000).toISOString();
    const event = this.repository
      .queryEventsSince(cutoff)
      .reverse()
      .find((e) => e.category === "finance_import");
    const fs = event?.structured.financeSummary;
    return fs && typeof fs === "object" ? (fs as FinanceSummary) : null;
  }

  /** §6.7.3 唤起健康管家：评估健康数据，主小人统一转达 */
  async runHealthSteward() {
    const recentHealth = this.getRecentHealth(14);
    const user = this.repository.getUser();
    const meta = this.repository.getAttributeMetaPublic();
    const result = await this.orchestrator.runHealthSteward({
      recentHealth,
      staminaValue: user.attributes.stamina ?? 0,
      staminaLastActive: meta.stamina.lastActive || "从未",
    });
    await this.syncVault();
    return result;
  }

  /** 属性自上次活跃以来的空闲天数；从未活跃返回 -1 */
  private attrIdleDays(lastActive: string): number {
    if (!lastActive) return -1;
    const days = Math.floor(
      (Date.now() - new Date(`${lastActive}T00:00:00`).getTime()) / 86400000,
    );
    return Number.isFinite(days) ? days : -1;
  }

  /**
   * §6.7.3 守护巡查（场景路由）：按确定性信号（属性荒废天数）决定哪些辅助 Agent 该说话，
   * 多个发现由主小人汇总成一个声音。无荒废信号时安静返回，不调 LLM。
   * force=true 时无视阈值，至少跑一次（手动唤起）。
   */
  async runStewardSweep(force = false) {
    const user = this.repository.getUser();
    const meta = this.repository.getAttributeMetaPublic();
    const THRESHOLD = 7;

    const staminaIdle = this.attrIdleDays(meta.stamina.lastActive);
    const cognitiveIdle = Math.max(
      this.attrIdleDays(meta.intellect.lastActive),
      this.attrIdleDays(meta.focus.lastActive),
      this.attrIdleDays(meta.creativity.lastActive),
    );

    const healthConcern = staminaIdle >= THRESHOLD;
    const learningConcern = cognitiveIdle >= THRESHOLD;

    const inputs: Parameters<typeof this.orchestrator.runStewardSweep>[0] = {};
    if (healthConcern || (force && staminaIdle !== -1)) {
      inputs.health = {
        recentHealth: this.getRecentHealth(14),
        staminaValue: user.attributes.stamina ?? 0,
        staminaLastActive: meta.stamina.lastActive || "从未",
      };
    }
    if (learningConcern || (force && cognitiveIdle !== -1)) {
      inputs.learning = {
        intellect: user.attributes.intellect ?? 0,
        focus: user.attributes.focus ?? 0,
        creativity: user.attributes.creativity ?? 0,
        lastActive: {
          intellect: meta.intellect.lastActive || "从未",
          focus: meta.focus.lastActive || "从未",
          creativity: meta.creativity.lastActive || "从未",
        },
      };
    }

    if (!inputs.health && !inputs.learning) {
      return { outputs: [], companionLine: "", domains: [], skipped: true as const };
    }

    const result = await this.orchestrator.runStewardSweep(inputs);
    await this.syncVault();
    return { ...result, skipped: false as const };
  }

  /** §6.7.3 唤起学习教练：评估认知成长，主小人统一转达 */
  async runLearningSteward() {
    const user = this.repository.getUser();
    const meta = this.repository.getAttributeMetaPublic();
    const aw = await this.activityWatch.getDayActivity().catch(() => null);
    const result = await this.orchestrator.runLearningSteward({
      intellect: user.attributes.intellect ?? 0,
      focus: user.attributes.focus ?? 0,
      creativity: user.attributes.creativity ?? 0,
      lastActive: {
        intellect: meta.intellect.lastActive || "从未",
        focus: meta.focus.lastActive || "从未",
        creativity: meta.creativity.lastActive || "从未",
      },
      focusMinutesToday: aw?.focusMinutes,
    });
    await this.syncVault();
    return result;
  }

  /** 读取近期健康按日汇总（从事件流还原）*/
  getRecentHealth(days = 14): HealthDaySummary[] {
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
    return this.repository
      .queryEventsSince(cutoff)
      .filter((e) => e.category === "health_day")
      .map((e) => {
        const s = e.structured as Record<string, unknown>;
        return {
          date: String(s.date ?? e.occurredAt.slice(0, 10)),
          steps: typeof s.steps === "number" ? s.steps : undefined,
          activeMinutes: typeof s.activeMinutes === "number" ? s.activeMinutes : undefined,
          workoutMinutes: typeof s.workoutMinutes === "number" ? s.workoutMinutes : undefined,
          sleepHours: typeof s.sleepHours === "number" ? s.sleepHours : undefined,
          restingHeartRate:
            typeof s.restingHeartRate === "number" ? s.restingHeartRate : undefined,
        } satisfies HealthDaySummary;
      });
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
      getTodayCalendar: () => this.getTodayCalendar(),
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
      listStreaks: () => this.repository.listStreaks(),
      saveCompanionMemory: (input) => this.repository.saveCompanionMemory(input),
      getCompanionMemories: () => this.repository.getCompanionMemories(),
      saveProfileChangeProposal: (input) => this.repository.saveProfileChangeProposal(input),
    };
  }
}
