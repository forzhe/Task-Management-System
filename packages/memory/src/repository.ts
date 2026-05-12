import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  Companion,
  CompanionAction,
  Goal,
  GoalLevel,
  NexusEvent,
  Profile,
  Review,
  ReviewType,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
} from "@nexus/shared";
import { DEFAULT_USER_ID } from "@nexus/shared";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  return JSON.parse(value) as T;
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

export interface NexusRepositoryOptions {
  dbPath: string;
  userId?: string;
}

export class NexusRepository {
  readonly userId: string;
  private readonly db: DatabaseSync;

  constructor(options: NexusRepositoryOptions) {
    this.userId = options.userId ?? DEFAULT_USER_ID;
    mkdirSync(dirname(options.dbPath), { recursive: true });
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec("pragma journal_mode = WAL; pragma foreign_keys = ON;");
    this.migrate();
    this.seedLocalUser();
  }

  close(): void {
    this.db.close();
  }

  getUser(): User {
    const row = this.db.prepare("select * from users where id = ?").get(this.userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new Error(`User ${this.userId} was not initialized`);
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      currentLevel: Number(row.current_level),
      totalExp: Number(row.total_exp),
      credibilityScore: Number(row.credibility_score),
    };
  }

  getProfile(): Profile {
    const row = this.db.prepare("select * from profiles where user_id = ?").get(this.userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) throw new Error(`Profile ${this.userId} was not initialized`);
    return {
      userId: String(row.user_id),
      basicInfo: parseJson(String(row.basic_info_json), {}),
      traits: parseJson(String(row.traits_json), {}),
      motivations: parseJson(String(row.motivations_json), {}),
      redLines: parseJson(String(row.red_lines_json), []),
      longTermVision: parseJson(String(row.long_term_vision_json), {}),
      updatedAt: String(row.updated_at),
      version: Number(row.version),
    };
  }

  updateProfile(delta: Partial<Omit<Profile, "userId" | "updatedAt" | "version">>): Profile {
    const current = this.getProfile();
    const next: Profile = {
      ...current,
      ...delta,
      updatedAt: now(),
      version: current.version + 1,
    };
    this.db
      .prepare(
        `update profiles set
          basic_info_json = @basicInfoJson,
          traits_json = @traitsJson,
          motivations_json = @motivationsJson,
          red_lines_json = @redLinesJson,
          long_term_vision_json = @longTermVisionJson,
          updated_at = @updatedAt,
          version = @version
        where user_id = @userId`,
      )
      .run({
        userId: next.userId,
        basicInfoJson: toJson(next.basicInfo),
        traitsJson: toJson(next.traits),
        motivationsJson: toJson(next.motivations),
        redLinesJson: toJson(next.redLines),
        longTermVisionJson: toJson(next.longTermVision),
        updatedAt: next.updatedAt,
        version: next.version,
      });
    return next;
  }

  listGoals(status = "active"): Goal[] {
    const rows = this.db
      .prepare("select * from goals where user_id = ? and status = ? order by created_at desc")
      .all(this.userId, status) as Record<string, unknown>[];
    return rows.map((row) => this.mapGoal(row));
  }

  createGoal(input: Pick<Goal, "title" | "level"> & Partial<Goal>): Goal {
    const createdAt = now();
    const goal: Goal = {
      id: input.id ?? id("goal"),
      userId: this.userId,
      parentGoalId: input.parentGoalId ?? null,
      level: input.level,
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "growth",
      metrics: input.metrics ?? {},
      startAt: input.startAt ?? null,
      deadline: input.deadline ?? null,
      status: input.status ?? "active",
      progress: input.progress ?? 0,
      aiBreakdownLog: input.aiBreakdownLog ?? [],
      impulseProbability: input.impulseProbability ?? null,
      createdAt,
      updatedAt: createdAt,
    };
    this.db
      .prepare(
        `insert into goals values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .run(
        goal.id,
        goal.userId,
        goal.parentGoalId ?? null,
        goal.level,
        goal.title,
        goal.description ?? null,
        goal.type ?? null,
        toJson(goal.metrics),
        goal.startAt ?? null,
        goal.deadline ?? null,
        goal.status,
        goal.progress,
        toJson(goal.aiBreakdownLog),
        goal.impulseProbability ?? null,
        goal.createdAt,
        goal.updatedAt,
      );
    return goal;
  }

  listTasks(status?: TaskStatus): Task[] {
    const sql = status
      ? "select * from tasks where user_id = ? and status = ? order by scheduled_at asc, rowid desc"
      : "select * from tasks where user_id = ? order by scheduled_at asc, rowid desc";
    const rows = status
      ? (this.db.prepare(sql).all(this.userId, status) as Record<string, unknown>[])
      : (this.db.prepare(sql).all(this.userId) as Record<string, unknown>[]);
    return rows.map((row) => this.mapTask(row));
  }

  getTask(taskId: string): Task | null {
    const row = this.db
      .prepare("select * from tasks where id = ? and user_id = ?")
      .get(taskId, this.userId) as Record<string, unknown> | undefined;
    return row ? this.mapTask(row) : null;
  }

  createTask(input: Pick<Task, "title"> & Partial<Task>): Task {
    const task: Task = {
      id: input.id ?? id("task"),
      userId: this.userId,
      goalId: input.goalId ?? null,
      source: input.source ?? "manual",
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "growth",
      difficulty: input.difficulty ?? 2,
      energyRequired: input.energyRequired ?? "medium",
      estimatedMinutes: input.estimatedMinutes ?? 30,
      actualMinutes: input.actualMinutes ?? null,
      rewardPoints: input.rewardPoints ?? 10,
      expRewards: input.expRewards ?? { focus: 5 },
      failurePenalty: input.failurePenalty ?? null,
      acceptanceCriteria: input.acceptanceCriteria ?? "能明确说明完成结果",
      proofMethod: input.proofMethod ?? "文字说明",
      scheduledAt: input.scheduledAt ?? now(),
      startedAt: input.startedAt ?? null,
      completedAt: input.completedAt ?? null,
      status: input.status ?? "not_started",
      statusHistory: input.statusHistory ?? [{ status: input.status ?? "not_started", at: now() }],
      evidence: input.evidence ?? {},
      verifiedByAi: input.verifiedByAi ?? false,
    };
    this.db
      .prepare(
        `insert into tasks values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .run(
        task.id,
        task.userId,
        task.goalId ?? null,
        task.source,
        task.title,
        task.description ?? null,
        task.type ?? null,
        task.difficulty,
        task.energyRequired,
        task.estimatedMinutes ?? null,
        task.actualMinutes ?? null,
        task.rewardPoints,
        toJson(task.expRewards),
        task.failurePenalty ?? null,
        task.acceptanceCriteria,
        task.proofMethod,
        task.scheduledAt ?? null,
        task.startedAt ?? null,
        task.completedAt ?? null,
        task.status,
        toJson(task.statusHistory),
        toJson(task.evidence),
        task.verifiedByAi ? 1 : 0,
      );
    return task;
  }

  updateTaskStatus(taskId: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence): Task {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} was not found`);
    const timestamp = now();
    const startedAt =
      status === "in_progress" ? (task.startedAt ?? timestamp) : (task.startedAt ?? null);
    const completedAt = status === "completed" ? timestamp : (task.completedAt ?? null);
    const actualMinutes = evidence?.actualMinutes ?? task.actualMinutes ?? null;
    const nextEvidence = evidence
      ? { ...(task.evidence ?? {}), ...evidence }
      : (task.evidence ?? {});
    const reason =
      typeof evidence?.note === "string" && evidence.note.trim() ? evidence.note : undefined;
    const history = [
      ...task.statusHistory,
      { status, at: timestamp, ...(reason ? { reason } : {}) },
    ];
    this.db
      .prepare(
        `update tasks set status = ?, started_at = ?, completed_at = ?, actual_minutes = ?,
          status_history_json = ?, evidence_json = ?
        where id = ? and user_id = ?`,
      )
      .run(
        status,
        startedAt,
        completedAt,
        actualMinutes,
        toJson(history),
        toJson(nextEvidence),
        taskId,
        this.userId,
      );
    return {
      ...task,
      status,
      startedAt,
      completedAt,
      actualMinutes,
      statusHistory: history,
      evidence: nextEvidence,
    };
  }

  logEvent(
    input: Omit<NexusEvent, "id" | "userId" | "ingestedAt"> & Partial<NexusEvent>,
  ): NexusEvent {
    const event: NexusEvent = {
      id: input.id ?? id("event"),
      userId: this.userId,
      source: input.source,
      type: input.type,
      category: input.category ?? null,
      rawPayload: input.rawPayload,
      structured: input.structured ?? {},
      embedding: input.embedding ?? null,
      occurredAt: input.occurredAt ?? now(),
      ingestedAt: now(),
      confidence: input.confidence ?? 0.8,
      tags: input.tags ?? [],
      relatedGoalIds: input.relatedGoalIds ?? [],
      relatedTaskIds: input.relatedTaskIds ?? [],
    };
    this.db
      .prepare(
        `insert into events values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .run(
        event.id,
        event.userId,
        event.source,
        event.type,
        event.category ?? null,
        toJson(event.rawPayload),
        toJson(event.structured),
        toJson(event.embedding),
        event.occurredAt,
        event.ingestedAt,
        event.confidence,
        toJson(event.tags),
        toJson(event.relatedGoalIds),
        toJson(event.relatedTaskIds),
      );
    return event;
  }

  queryEvents(limit = 20): NexusEvent[] {
    const rows = this.db
      .prepare("select * from events where user_id = ? order by occurred_at desc limit ?")
      .all(this.userId, limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapEvent(row));
  }

  saveReview(input: Omit<Review, "id" | "userId" | "createdAt"> & Partial<Review>): Review {
    const review: Review = {
      id: input.id ?? id("review"),
      userId: this.userId,
      type: input.type,
      scopeStart: input.scopeStart,
      scopeEnd: input.scopeEnd,
      subjective: input.subjective,
      objective: input.objective,
      aiAnalysis: input.aiAnalysis,
      suggestedAdjustments: input.suggestedAdjustments,
      emotionTags: input.emotionTags,
      credibilityCheck: input.credibilityCheck ?? null,
      createdAt: now(),
    };
    this.db
      .prepare(
        `insert into reviews values (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )`,
      )
      .run(
        review.id,
        review.userId,
        review.type,
        review.scopeStart,
        review.scopeEnd,
        toJson(review.subjective),
        toJson(review.objective),
        toJson(review.aiAnalysis),
        toJson(review.suggestedAdjustments),
        toJson(review.emotionTags),
        review.credibilityCheck ?? null,
        review.createdAt,
      );
    return review;
  }

  getReview(reviewId: string): Review | null {
    const row = this.db
      .prepare("select * from reviews where id = ? and user_id = ?")
      .get(reviewId, this.userId) as Record<string, unknown> | undefined;
    return row ? this.mapReview(row) : null;
  }

  getLatestReview(type: ReviewType = "daily"): Review | null {
    const row = this.db
      .prepare(
        "select * from reviews where user_id = ? and type = ? order by created_at desc limit 1",
      )
      .get(this.userId, type) as Record<string, unknown> | undefined;
    return row ? this.mapReview(row) : null;
  }

  getCompanion(): Companion {
    const row = this.db
      .prepare("select * from companions where user_id = ? and type = 'main'")
      .get(this.userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error("Main companion was not initialized");
    return this.mapCompanion(row);
  }

  updateCompanion(action: CompanionAction): Companion {
    const current = this.getCompanion();
    const stateHistory = [
      ...current.stateHistory,
      { state: action.state, at: now(), dialogue: action.dialogue },
    ];
    this.db
      .prepare(
        `update companions set current_state = ?, current_dialogue = ?, state_history_json = ?
        where id = ? and user_id = ?`,
      )
      .run(action.state, action.dialogue, toJson(stateHistory), action.companionId, this.userId);
    return {
      ...current,
      currentState: action.state,
      currentDialogue: action.dialogue,
      stateHistory,
    };
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists users (
        id text primary key,
        created_at text not null,
        current_level integer not null default 1,
        total_exp integer not null default 0,
        credibility_score real not null default 1
      );

      create table if not exists profiles (
        user_id text primary key,
        basic_info_json text not null,
        traits_json text not null,
        motivations_json text not null,
        red_lines_json text not null,
        long_term_vision_json text not null,
        updated_at text not null,
        version integer not null default 1
      );

      create table if not exists goals (
        id text primary key,
        user_id text not null,
        parent_goal_id text,
        level text not null,
        title text not null,
        description text,
        type text,
        metrics_json text not null,
        start_at text,
        deadline text,
        status text not null,
        progress real not null default 0,
        ai_breakdown_log_json text not null,
        impulse_probability real,
        created_at text not null,
        updated_at text not null
      );

      create table if not exists tasks (
        id text primary key,
        user_id text not null,
        goal_id text,
        source text not null,
        title text not null,
        description text,
        type text,
        difficulty integer not null,
        energy_required text not null,
        estimated_minutes integer,
        actual_minutes integer,
        reward_points integer not null,
        exp_rewards_json text not null,
        failure_penalty text,
        acceptance_criteria text not null,
        proof_method text not null,
        scheduled_at text,
        started_at text,
        completed_at text,
        status text not null,
        status_history_json text not null,
        evidence_json text not null,
        verified_by_ai integer not null default 0
      );

      create table if not exists reviews (
        id text primary key,
        user_id text not null,
        type text not null,
        scope_start text not null,
        scope_end text not null,
        subjective_json text not null,
        objective_json text not null,
        ai_analysis_json text not null,
        suggested_adjustments_json text not null,
        emotion_tags text not null,
        credibility_check text,
        created_at text not null
      );

      create table if not exists companions (
        id text primary key,
        user_id text not null,
        type text not null,
        current_form text not null,
        personality_params_json text not null,
        unlocked_actions_json text not null,
        unlocked_skins_json text not null,
        current_state text not null,
        current_dialogue text not null,
        state_history_json text not null
      );

      create table if not exists events (
        id text primary key,
        user_id text not null,
        source text not null,
        type text not null,
        category text,
        raw_payload text not null,
        structured text not null,
        embedding text,
        occurred_at text not null,
        ingested_at text not null,
        confidence real not null,
        tags text not null,
        related_goal_ids text not null,
        related_task_ids text not null
      );

      create table if not exists system_evolution_logs (
        id text primary key,
        evolution_agent_run_id text,
        agent_modified text,
        change_type text,
        old_config text,
        new_config text,
        reason text,
        ab_test_metric text,
        applied_at text,
        rollback_available integer not null default 1
      );
    `);
  }

  private seedLocalUser(): void {
    const timestamp = now();
    this.db
      .prepare(
        `insert or ignore into users
        (id, created_at, current_level, total_exp, credibility_score)
        values (?, ?, 1, 0, 1)`,
      )
      .run(this.userId, timestamp);

    this.db
      .prepare(
        `insert or ignore into profiles
        (user_id, basic_info_json, traits_json, motivations_json, red_lines_json,
         long_term_vision_json, updated_at, version)
        values (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        this.userId,
        toJson({ codename: "宿主", phase: "awakening" }),
        toJson({ style: "self-driven", currentConfidence: "unknown" }),
        toJson({ primary: ["growth", "autonomy"] }),
        toJson(["不要把任务系统退化成机械打卡"]),
        toJson({ statement: "今天的行为要比昨天更接近理想人生" }),
        timestamp,
      );

    this.db
      .prepare(
        `insert or ignore into companions
        (id, user_id, type, current_form, personality_params_json, unlocked_actions_json,
         unlocked_skins_json, current_state, current_dialogue, state_history_json)
        values (?, ?, 'main', 'cubism-sample', ?, ?, ?, 'idle', ?, ?)`,
      )
      .run(
        "main",
        this.userId,
        toJson({ intimacy: 0.2, strictness: 0.4, trust: 0.5 }),
        toJson(["idle", "focus", "celebrating", "caring", "strict"]),
        toJson(["default"]),
        "NEXUS-7 已待命。先让闭环跑起来。",
        toJson([]),
      );
  }

  private mapGoal(row: Record<string, unknown>): Goal {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      parentGoalId: row.parent_goal_id ? String(row.parent_goal_id) : null,
      level: String(row.level) as GoalLevel,
      title: String(row.title),
      description: row.description ? String(row.description) : "",
      type: row.type ? String(row.type) : "growth",
      metrics: parseJson(String(row.metrics_json), {}),
      startAt: row.start_at ? String(row.start_at) : null,
      deadline: row.deadline ? String(row.deadline) : null,
      status: String(row.status) as Goal["status"],
      progress: Number(row.progress),
      aiBreakdownLog: parseJson(String(row.ai_breakdown_log_json), []),
      impulseProbability: row.impulse_probability == null ? null : Number(row.impulse_probability),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  private mapTask(row: Record<string, unknown>): Task {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      goalId: row.goal_id ? String(row.goal_id) : null,
      source: String(row.source) as Task["source"],
      title: String(row.title),
      description: row.description ? String(row.description) : "",
      type: row.type ? String(row.type) : "growth",
      difficulty: Number(row.difficulty),
      energyRequired: String(row.energy_required) as Task["energyRequired"],
      estimatedMinutes: row.estimated_minutes == null ? null : Number(row.estimated_minutes),
      actualMinutes: row.actual_minutes == null ? null : Number(row.actual_minutes),
      rewardPoints: Number(row.reward_points),
      expRewards: parseJson(String(row.exp_rewards_json), {}),
      failurePenalty: row.failure_penalty ? String(row.failure_penalty) : null,
      acceptanceCriteria: String(row.acceptance_criteria),
      proofMethod: String(row.proof_method),
      scheduledAt: row.scheduled_at ? String(row.scheduled_at) : null,
      startedAt: row.started_at ? String(row.started_at) : null,
      completedAt: row.completed_at ? String(row.completed_at) : null,
      status: String(row.status) as Task["status"],
      statusHistory: parseJson(String(row.status_history_json), []),
      evidence: parseJson(String(row.evidence_json), {}),
      verifiedByAi: Boolean(row.verified_by_ai),
    };
  }

  private mapEvent(row: Record<string, unknown>): NexusEvent {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      source: String(row.source),
      type: String(row.type) as NexusEvent["type"],
      category: row.category ? String(row.category) : null,
      rawPayload: parseJson(String(row.raw_payload), {}),
      structured: parseJson(String(row.structured), {}),
      embedding: parseJson(String(row.embedding), null),
      occurredAt: String(row.occurred_at),
      ingestedAt: String(row.ingested_at),
      confidence: Number(row.confidence),
      tags: parseJson(String(row.tags), []),
      relatedGoalIds: parseJson(String(row.related_goal_ids), []),
      relatedTaskIds: parseJson(String(row.related_task_ids), []),
    };
  }

  private mapCompanion(row: Record<string, unknown>): Companion {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: "main",
      currentForm: String(row.current_form),
      personalityParams: parseJson(String(row.personality_params_json), {
        intimacy: 0.2,
        strictness: 0.4,
        trust: 0.5,
      }),
      unlockedActions: parseJson(String(row.unlocked_actions_json), []),
      unlockedSkins: parseJson(String(row.unlocked_skins_json), []),
      currentState: String(row.current_state) as Companion["currentState"],
      currentDialogue: String(row.current_dialogue),
      stateHistory: parseJson(String(row.state_history_json), []),
    };
  }

  private mapReview(row: Record<string, unknown>): Review {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      type: String(row.type) as Review["type"],
      scopeStart: String(row.scope_start),
      scopeEnd: String(row.scope_end),
      subjective: parseJson(String(row.subjective_json), {}),
      objective: parseJson(String(row.objective_json), {}),
      aiAnalysis: parseJson(String(row.ai_analysis_json), {}),
      suggestedAdjustments: parseJson(String(row.suggested_adjustments_json), {}),
      emotionTags: parseJson(String(row.emotion_tags), []),
      credibilityCheck: row.credibility_check ? String(row.credibility_check) : null,
      createdAt: String(row.created_at),
    };
  }
}
