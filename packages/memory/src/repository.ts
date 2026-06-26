import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AttributeDecayResult,
  AttributeKey,
  AttributeMeta,
  AttributeMetaSet,
  AttributeSet,
  Bounty,
  BountyPriceBreakdown,
  BountyState,
  Companion,
  CompanionAction,
  CompanionMemory,
  CompanionMemoryType,
  Divergence,
  DivergenceStatus,
  EvolutionProposal,
  EvolutionStatus,
  Goal,
  GoalLevel,
  InterventionSignal,
  MemoryCompactionResult,
  NexusEvent,
  Profile,
  ProfileChangeProposal,
  ProfileChangeStatus,
  ProfileFieldPath,
  Review,
  ReviewType,
  StreakCategory,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  User,
  UserStreak,
} from "@nexus/shared";
import {
  DECAY_TIERS,
  DEFAULT_USER_ID,
  EMPTY_ATTRIBUTES,
  STREAK_MILESTONES,
  calcLevel,
} from "@nexus/shared";
import { cosine, embedText } from "./embedding.js";

/** 事件用于嵌入的文本：摘要 + 类别 + 标签 + 来源 */
function eventText(input: { source: string; category?: string | null; structured?: unknown; tags?: string[] }): string {
  const summary =
    input.structured && typeof input.structured === "object" && "summary" in input.structured
      ? String((input.structured as { summary?: unknown }).summary ?? "")
      : "";
  return [summary, input.category ?? "", (input.tags ?? []).join(" "), input.source]
    .filter(Boolean)
    .join(" ");
}

const ATTRIBUTE_KEYS: AttributeKey[] = [
  "intellect",
  "stamina",
  "focus",
  "willpower",
  "creativity",
  "order",
];

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

/** 本地自然日（非 UTC）——习惯链以宿主时区的日界结算 */
function localDate(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 周键：所在周的周一日期（用于记忆遗忘按周聚合）*/
function weekKey(d: Date): string {
  const copy = new Date(d.getTime());
  const day = (copy.getDay() + 6) % 7; // 周一=0
  copy.setDate(copy.getDate() - day);
  return localDate(copy);
}

/** 月键：YYYY-MM（用于一年以上记忆按月聚合）*/
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

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
      energyPoints: Number(row.energy_points ?? 0),
      attributes: parseJson<AttributeSet>(row.attributes_json as string | null, {
        ...EMPTY_ATTRIBUTES,
      }),
    };
  }

  /**
   * Apply task rewards on completion: add energyPoints + expRewards to attributes.
   * Recalculates level from totalExp. Returns updated User.
   */
  applyTaskRewards(taskId: string): User {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const user = this.getUser();
    const gainedPoints = task.rewardPoints;
    const newEnergyPoints = user.energyPoints + gainedPoints;

    // Merge expRewards into attributes; record activity to reset decay clock
    const newAttributes = { ...user.attributes };
    const meta = this.getAttributeMeta();
    const today = localDate();
    for (const [key, xp] of Object.entries(task.expRewards)) {
      if (key in newAttributes) {
        const attr = key as AttributeKey;
        newAttributes[attr] = (newAttributes[attr] ?? 0) + Number(xp);
        meta[attr] = { lastActive: today, tier: 0 };
      }
    }
    const earnedExp = Object.values(task.expRewards).reduce((s, v) => s + Number(v), 0);
    const updatedTotalExp = user.totalExp + earnedExp;
    const newLevel = calcLevel(updatedTotalExp);

    this.db
      .prepare(
        `update users set
          energy_points = ?,
          total_exp = ?,
          current_level = ?,
          attributes_json = ?,
          attribute_meta_json = ?
        where id = ?`,
      )
      .run(
        newEnergyPoints,
        updatedTotalExp,
        newLevel,
        toJson(newAttributes),
        toJson(meta),
        this.userId,
      );

    return { ...user, energyPoints: newEnergyPoints, totalExp: updatedTotalExp, currentLevel: newLevel, attributes: newAttributes };
  }

  // ── 属性衰减 §8.1 ─────────────────────────────────────────────────

  private getAttributeMeta(): AttributeMetaSet {
    const row = this.db
      .prepare("select attribute_meta_json from users where id = ?")
      .get(this.userId) as { attribute_meta_json?: string } | undefined;
    const stored = parseJson<Partial<AttributeMetaSet>>(row?.attribute_meta_json ?? null, {});
    const full = {} as AttributeMetaSet;
    for (const key of ATTRIBUTE_KEYS) {
      full[key] = stored[key] ?? { lastActive: "", tier: 0 };
    }
    return full;
  }

  getAttributeMetaPublic(): AttributeMetaSet {
    return this.getAttributeMeta();
  }

  /**
   * §8.1 衰减策略（避免挫败，重在提醒）：
   * 7 天未触发 → -5%；14 天 → 额外 -10% + 关怀；30 天 → 额外 -20%。
   * 跨档位时一次性应用，每档只扣一次。再次活跃则清零。空闲基准从 lastActive 起算；
   * 从未活跃（lastActive 空）的维度不衰减——还没成长就不存在退化。
   */
  applyAttributeDecay(): AttributeDecayResult {
    const user = this.getUser();
    const meta = this.getAttributeMeta();
    const attributes = { ...user.attributes };
    const today = localDate();
    const result: AttributeDecayResult = { decayed: [], needsCare: [] };

    for (const attr of ATTRIBUTE_KEYS) {
      const m = meta[attr];
      if (!m.lastActive) continue; // never grown → nothing to decay
      const daysIdle = Math.floor(
        (new Date(`${today}T00:00:00`).getTime() - new Date(`${m.lastActive}T00:00:00`).getTime()) /
          86400000,
      );
      // 目标档位 = 已跨越的最高档
      let targetTier: 0 | 1 | 2 | 3 = 0;
      for (const t of DECAY_TIERS) {
        if (daysIdle >= t.days) targetTier = t.tier;
      }
      if (targetTier <= m.tier) continue;

      // 从 m.tier+1 累进到 targetTier，逐档应用各自比例
      for (const t of DECAY_TIERS) {
        if (t.tier > m.tier && t.tier <= targetTier) {
          const before = attributes[attr] ?? 0;
          const after = Math.max(0, Math.round(before * (1 - t.pct)));
          attributes[attr] = after;
          result.decayed.push({ attribute: attr, tier: t.tier, pct: t.pct, newValue: after });
          if (t.tier === 2) result.needsCare.push(attr);
        }
      }
      meta[attr] = { lastActive: m.lastActive, tier: targetTier };
    }

    if (result.decayed.length > 0) {
      this.db
        .prepare("update users set attributes_json = ?, attribute_meta_json = ? where id = ?")
        .run(toJson(attributes), toJson(meta), this.userId);
    }
    return result;
  }

  // ── 档案演化 §5.3 ─────────────────────────────────────────────────

  saveProfileChangeProposal(input: {
    field: ProfileFieldPath;
    subPath?: string | null;
    currentValue?: unknown;
    proposedValue: unknown;
    reason: string;
    confidence?: number;
  }): ProfileChangeProposal {
    const proposal: ProfileChangeProposal = {
      id: id("pchg"),
      field: input.field,
      subPath: input.subPath ?? null,
      currentValue: input.currentValue ?? null,
      proposedValue: input.proposedValue,
      reason: input.reason,
      confidence: Math.min(1, Math.max(0, input.confidence ?? 0.5)),
      status: "pending",
      createdAt: now(),
      resolvedAt: null,
    };
    this.db
      .prepare(
        `insert into profile_change_log
         (id, user_id, field, sub_path, current_value, proposed_value, reason, confidence, status, created_at, resolved_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, null)`,
      )
      .run(
        proposal.id,
        this.userId,
        proposal.field,
        proposal.subPath ?? null,
        toJson(proposal.currentValue),
        toJson(proposal.proposedValue),
        proposal.reason,
        proposal.confidence,
        proposal.createdAt,
      );
    return proposal;
  }

  listProfileChangeProposals(status?: ProfileChangeStatus): ProfileChangeProposal[] {
    const rows = status
      ? (this.db
          .prepare(
            "select * from profile_change_log where user_id = ? and status = ? order by created_at desc",
          )
          .all(this.userId, status) as Record<string, unknown>[])
      : (this.db
          .prepare("select * from profile_change_log where user_id = ? order by created_at desc")
          .all(this.userId) as Record<string, unknown>[]);
    return rows.map((row) => this.mapProfileChange(row));
  }

  /**
   * 解决一条档案演化提议。accept=true 时应用到档案并升版本；
   * 无论接受或拒绝都保留日志条目（可回滚/审计 —— 数据主权）。
   */
  resolveProfileChange(
    proposalId: string,
    accept: boolean,
  ): { proposal: ProfileChangeProposal; profile: Profile | null } {
    const row = this.db
      .prepare("select * from profile_change_log where id = ? and user_id = ?")
      .get(proposalId, this.userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Profile change ${proposalId} not found`);
    const proposal = this.mapProfileChange(row);
    if (proposal.status !== "pending") {
      return { proposal, profile: null };
    }

    let profile: Profile | null = null;
    if (accept) {
      profile = this.applyProfileChange(proposal);
    }
    const resolvedAt = now();
    this.db
      .prepare("update profile_change_log set status = ?, resolved_at = ? where id = ?")
      .run(accept ? "accepted" : "rejected", resolvedAt, proposalId);
    return { proposal: { ...proposal, status: accept ? "accepted" : "rejected", resolvedAt }, profile };
  }

  private applyProfileChange(proposal: ProfileChangeProposal): Profile {
    return this.writeProfileField(proposal, proposal.proposedValue);
  }

  /**
   * 回滚一条已接受的演化提议：把字段还原到提议前的 currentValue（数据主权 §8.3）。
   * 仅 status==="accepted" 可回滚；其余原样返回。
   */
  rollbackProfileChange(
    proposalId: string,
  ): { proposal: ProfileChangeProposal; profile: Profile | null } {
    const row = this.db
      .prepare("select * from profile_change_log where id = ? and user_id = ?")
      .get(proposalId, this.userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Profile change ${proposalId} not found`);
    const proposal = this.mapProfileChange(row);
    if (proposal.status !== "accepted") {
      return { proposal, profile: null };
    }
    const profile = this.writeProfileField(proposal, proposal.currentValue);
    const resolvedAt = now();
    this.db
      .prepare("update profile_change_log set status = 'rolled_back', resolved_at = ? where id = ?")
      .run(resolvedAt, proposalId);
    return { proposal: { ...proposal, status: "rolled_back", resolvedAt }, profile };
  }

  private writeProfileField(proposal: ProfileChangeProposal, value: unknown): Profile {
    const current = this.getProfile();
    const delta: Partial<Omit<Profile, "userId" | "updatedAt" | "version">> = {};
    if (proposal.field === "redLines") {
      delta.redLines = value as string[];
    } else if (proposal.subPath) {
      // 子键替换：合并进现有对象字段
      const base = { ...(current[proposal.field] as Record<string, unknown>) };
      base[proposal.subPath] = value;
      delta[proposal.field] = base as never;
    } else {
      delta[proposal.field] = value as never;
    }
    return this.updateProfile(delta);
  }

  private mapProfileChange(row: Record<string, unknown>): ProfileChangeProposal {
    return {
      id: String(row.id),
      field: String(row.field) as ProfileFieldPath,
      subPath: row.sub_path ? String(row.sub_path) : null,
      currentValue: parseJson(String(row.current_value ?? "null"), null),
      proposedValue: parseJson(String(row.proposed_value ?? "null"), null),
      reason: String(row.reason),
      confidence: Number(row.confidence),
      status: String(row.status) as ProfileChangeStatus,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
    };
  }

  /**
   * 直接为某个属性维度奖励 XP（任务以外的来源，如健康数据 §6.7）。
   * 同步累加 totalExp、重算等级、重置该维度衰减时钟。
   */
  awardAttributeXp(attr: AttributeKey, xp: number): User {
    if (xp <= 0) return this.getUser();
    const user = this.getUser();
    const newAttributes = { ...user.attributes };
    newAttributes[attr] = (newAttributes[attr] ?? 0) + xp;
    const updatedTotalExp = user.totalExp + xp;
    const newLevel = calcLevel(updatedTotalExp);
    const meta = this.getAttributeMeta();
    meta[attr] = { lastActive: localDate(), tier: 0 };
    this.db
      .prepare(
        `update users set total_exp = ?, current_level = ?, attributes_json = ?, attribute_meta_json = ?
         where id = ?`,
      )
      .run(updatedTotalExp, newLevel, toJson(newAttributes), toJson(meta), this.userId);
    return {
      ...user,
      attributes: newAttributes,
      totalExp: updatedTotalExp,
      currentLevel: newLevel,
    };
  }

  /**
   * Adjust credibility score by delta (clamped 0–2).
   * Pass a positive delta to reward, negative to penalise.
   */
  adjustCredibility(delta: number): User {
    const user = this.getUser();
    const next = Math.min(2, Math.max(0, user.credibilityScore + delta));
    this.db
      .prepare("update users set credibility_score = ? where id = ?")
      .run(next, this.userId);
    return { ...user, credibilityScore: next };
  }

  // ── 持续力引擎 §6.6.1：习惯链 ─────────────────────────────────────

  /**
   * 记录一次链类活动。同日重复调用幂等。
   * 返回更新后的链状态和是否命中里程碑（供微洞察触发）。
   */
  recordStreakActivity(
    category: StreakCategory,
    goalId = "",
  ): { streak: UserStreak; milestoneHit: number | null; wasBroken: boolean } {
    const today = localDate();
    const yesterday = localDate(new Date(Date.now() - 86400000));
    const row = this.db
      .prepare(
        "select * from user_streaks where user_id = ? and category = ? and goal_id = ?",
      )
      .get(this.userId, category, goalId) as Record<string, unknown> | undefined;

    if (!row) {
      this.db
        .prepare(
          `insert into user_streaks
           (user_id, category, goal_id, current_streak, longest_streak, last_active_date, broken_at)
           values (?, ?, ?, 1, 1, ?, '[]')`,
        )
        .run(this.userId, category, goalId, today);
      return {
        streak: this.mapStreak({ category, goal_id: goalId, current_streak: 1, longest_streak: 1, last_active_date: today, broken_at: "[]" }),
        milestoneHit: null,
        wasBroken: false,
      };
    }

    const lastActive = String(row.last_active_date);
    if (lastActive === today) {
      return { streak: this.mapStreak(row), milestoneHit: null, wasBroken: false };
    }

    const prevStreak = Number(row.current_streak);
    const brokenAt = parseJson<string[]>(String(row.broken_at), []);
    let newStreak: number;
    let wasBroken = false;

    if (lastActive === yesterday) {
      newStreak = prevStreak + 1;
    } else {
      // 链中断：断链日 = lastActive 的次日（第一个缺勤日）
      if (prevStreak > 0 && lastActive) {
        const dayAfter = localDate(new Date(new Date(`${lastActive}T00:00:00`).getTime() + 86400000));
        brokenAt.push(dayAfter);
        wasBroken = true;
      }
      newStreak = 1;
    }

    const newLongest = Math.max(Number(row.longest_streak), newStreak);
    this.db
      .prepare(
        `update user_streaks set current_streak = ?, longest_streak = ?, last_active_date = ?, broken_at = ?
         where user_id = ? and category = ? and goal_id = ?`,
      )
      .run(newStreak, newLongest, today, toJson(brokenAt), this.userId, category, goalId);

    const milestoneHit = (STREAK_MILESTONES as readonly number[]).includes(newStreak)
      ? newStreak
      : null;
    return {
      streak: this.mapStreak({ category, goal_id: goalId, current_streak: newStreak, longest_streak: newLongest, last_active_date: today, broken_at: toJson(brokenAt) }),
      milestoneHit,
      wasBroken,
    };
  }

  /**
   * 日界结算（00:05 调度调用）：昨日未活跃的链归零。
   * 返回被判定断链的链（含断链前长度），供断链分析触发。
   */
  settleStreaks(): Array<{ streak: UserStreak; previousLength: number }> {
    const yesterday = localDate(new Date(Date.now() - 86400000));
    const rows = this.db
      .prepare(
        "select * from user_streaks where user_id = ? and current_streak > 0 and last_active_date < ?",
      )
      .all(this.userId, yesterday) as Record<string, unknown>[];

    const broken: Array<{ streak: UserStreak; previousLength: number }> = [];
    for (const row of rows) {
      const prevLength = Number(row.current_streak);
      const brokenAt = parseJson<string[]>(String(row.broken_at), []);
      const lastActive = String(row.last_active_date);
      const dayAfter = localDate(new Date(new Date(`${lastActive}T00:00:00`).getTime() + 86400000));
      brokenAt.push(dayAfter);
      this.db
        .prepare(
          `update user_streaks set current_streak = 0, broken_at = ?
           where user_id = ? and category = ? and goal_id = ?`,
        )
        .run(toJson(brokenAt), this.userId, String(row.category), String(row.goal_id));
      broken.push({
        streak: this.mapStreak({ ...row, current_streak: 0, broken_at: toJson(brokenAt) }),
        previousLength: prevLength,
      });
    }
    return broken;
  }

  listStreaks(): UserStreak[] {
    const rows = this.db
      .prepare("select * from user_streaks where user_id = ? order by current_streak desc")
      .all(this.userId) as Record<string, unknown>[];
    return rows.map((row) => this.mapStreak(row));
  }

  // ── 持续力引擎 §6.6.3：小人历史记忆 ────────────────────────────────

  saveCompanionMemory(input: {
    type: CompanionMemoryType;
    summary: string;
    refEventIds?: string[];
    emotionalWeight?: number;
    occurredAt?: string;
  }): CompanionMemory {
    const memory: CompanionMemory = {
      id: id("cmem"),
      type: input.type,
      summary: input.summary,
      occurredAt: input.occurredAt ?? now(),
      refEventIds: input.refEventIds ?? [],
      emotionalWeight: Math.min(1, Math.max(0, input.emotionalWeight ?? 0.5)),
    };
    this.db
      .prepare(
        `insert into companion_memories
         (id, user_id, type, summary, occurred_at, ref_event_ids, emotional_weight)
         values (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        memory.id,
        this.userId,
        memory.type,
        memory.summary,
        memory.occurredAt,
        toJson(memory.refEventIds),
        memory.emotionalWeight,
      );
    return memory;
  }

  /** 注入规则：最近 recentN 条 + 情感权重最高 topWeightN 条（去重）*/
  getCompanionMemories(recentN = 3, topWeightN = 2): CompanionMemory[] {
    const recent = this.db
      .prepare(
        "select * from companion_memories where user_id = ? order by occurred_at desc limit ?",
      )
      .all(this.userId, recentN) as Record<string, unknown>[];
    const topWeight = this.db
      .prepare(
        "select * from companion_memories where user_id = ? order by emotional_weight desc, occurred_at desc limit ?",
      )
      .all(this.userId, topWeightN) as Record<string, unknown>[];

    const seen = new Set<string>();
    const merged: CompanionMemory[] = [];
    for (const row of [...recent, ...topWeight]) {
      const memId = String(row.id);
      if (seen.has(memId)) continue;
      seen.add(memId);
      merged.push({
        id: memId,
        type: String(row.type) as CompanionMemoryType,
        summary: String(row.summary),
        occurredAt: String(row.occurred_at),
        refEventIds: parseJson(String(row.ref_event_ids), []),
        emotionalWeight: Number(row.emotional_weight),
      });
    }
    return merged;
  }

  // ── 持续力引擎 §6.6.4：介入预算与升级 ──────────────────────────────

  logIntervention(signal: InterventionSignal): void {
    this.db
      .prepare(
        `insert into intervention_log (id, user_id, signal, fired_date, responded, created_at)
         values (?, ?, ?, ?, 0, ?)`,
      )
      .run(id("intv"), this.userId, signal, localDate(), now());
  }

  countInterventionsToday(): number {
    const row = this.db
      .prepare(
        "select count(*) as cnt from intervention_log where user_id = ? and fired_date = ?",
      )
      .get(this.userId, localDate()) as { cnt: number };
    return Number(row.cnt);
  }

  hasInterventionFiredToday(signal: InterventionSignal): boolean {
    const row = this.db
      .prepare(
        "select count(*) as cnt from intervention_log where user_id = ? and signal = ? and fired_date = ?",
      )
      .get(this.userId, signal, localDate()) as { cnt: number };
    return Number(row.cnt) > 0;
  }

  countSignalLastDays(signal: InterventionSignal, days = 7): number {
    const since = localDate(new Date(Date.now() - days * 86400000));
    const row = this.db
      .prepare(
        "select count(*) as cnt from intervention_log where user_id = ? and signal = ? and fired_date >= ?",
      )
      .get(this.userId, signal, since) as { cnt: number };
    return Number(row.cnt);
  }

  /** 连续被忽略次数（按时间倒序数未响应的条数，遇到已响应即停）*/
  consecutiveIgnoredCount(signal: InterventionSignal): number {
    const rows = this.db
      .prepare(
        "select responded from intervention_log where user_id = ? and signal = ? order by created_at desc limit 10",
      )
      .all(this.userId, signal) as Array<{ responded: number }>;
    let count = 0;
    for (const row of rows) {
      if (Number(row.responded) === 1) break;
      count += 1;
    }
    return count;
  }

  /** 宿主当日产生任何主动行为（对话/完成任务）即视为已响应今日介入 */
  markInterventionsRespondedToday(): void {
    this.db
      .prepare(
        "update intervention_log set responded = 1 where user_id = ? and fired_date = ?",
      )
      .run(this.userId, localDate());
  }

  // ── 系统进化引擎 §6.4 ─────────────────────────────────────────────

  saveEvolutionProposal(input: {
    targetKey: string;
    reason: string;
    oldPrompt: string;
    newPrompt: string;
  }): EvolutionProposal {
    const proposal: EvolutionProposal = {
      id: id("evo"),
      targetKey: input.targetKey,
      reason: input.reason,
      oldPrompt: input.oldPrompt,
      newPrompt: input.newPrompt,
      status: "proposed",
      createdAt: now(),
      appliedAt: null,
    };
    this.db
      .prepare(
        `insert into system_evolution_logs
         (id, agent_modified, target_key, change_type, old_config, new_config, reason, status, created_at, rollback_available)
         values (?, ?, ?, 'prompt', ?, ?, ?, 'proposed', ?, 1)`,
      )
      .run(
        proposal.id,
        input.targetKey,
        input.targetKey,
        input.oldPrompt,
        input.newPrompt,
        input.reason,
        proposal.createdAt,
      );
    return proposal;
  }

  listEvolutionProposals(status?: EvolutionStatus): EvolutionProposal[] {
    const rows = status
      ? (this.db
          .prepare(
            "select * from system_evolution_logs where status = ? order by created_at desc",
          )
          .all(status) as Record<string, unknown>[])
      : (this.db
          .prepare("select * from system_evolution_logs order by created_at desc")
          .all() as Record<string, unknown>[]);
    return rows.map((row) => this.mapEvolution(row));
  }

  getEvolutionProposal(proposalId: string): EvolutionProposal | null {
    const row = this.db
      .prepare("select * from system_evolution_logs where id = ?")
      .get(proposalId) as Record<string, unknown> | undefined;
    return row ? this.mapEvolution(row) : null;
  }

  updateEvolutionStatus(proposalId: string, status: EvolutionStatus): EvolutionProposal | null {
    const existing = this.getEvolutionProposal(proposalId);
    if (!existing) return null;
    const appliedAt = status === "applied" ? now() : existing.appliedAt ?? null;
    this.db
      .prepare("update system_evolution_logs set status = ?, applied_at = ? where id = ?")
      .run(status, appliedAt, proposalId);
    return { ...existing, status, appliedAt };
  }

  /** 当前已应用的进化（启动时同步进运行时覆盖表）*/
  listAppliedEvolutions(): EvolutionProposal[] {
    return this.listEvolutionProposals("applied");
  }

  private mapEvolution(row: Record<string, unknown>): EvolutionProposal {
    return {
      id: String(row.id),
      targetKey: String(row.target_key ?? row.agent_modified ?? ""),
      reason: String(row.reason ?? ""),
      oldPrompt: String(row.old_config ?? ""),
      newPrompt: String(row.new_config ?? ""),
      status: String(row.status ?? "proposed") as EvolutionStatus,
      createdAt: String(row.created_at ?? row.applied_at ?? now()),
      appliedAt: row.applied_at ? String(row.applied_at) : null,
    };
  }

  // ── 黑箱裁决 §6.7.4 ───────────────────────────────────────────────

  saveDivergence(input: { claim: string; evidence: string; domain: string }): Divergence {
    const divergence: Divergence = {
      id: id("dvg"),
      claim: input.claim,
      evidence: input.evidence,
      domain: input.domain,
      status: "open",
      createdAt: now(),
      resolvedAt: null,
      resolutionNote: null,
    };
    this.db
      .prepare(
        `insert into divergences (id, user_id, claim, evidence, domain, status, created_at, resolved_at, resolution_note)
         values (?, ?, ?, ?, ?, 'open', ?, null, null)`,
      )
      .run(
        divergence.id,
        this.userId,
        divergence.claim,
        divergence.evidence,
        divergence.domain,
        divergence.createdAt,
      );
    return divergence;
  }

  listDivergences(status?: DivergenceStatus): Divergence[] {
    const rows = status
      ? (this.db
          .prepare(
            "select * from divergences where user_id = ? and status = ? order by created_at desc",
          )
          .all(this.userId, status) as Record<string, unknown>[])
      : (this.db
          .prepare("select * from divergences where user_id = ? order by created_at desc")
          .all(this.userId) as Record<string, unknown>[]);
    return rows.map((row) => this.mapDivergence(row));
  }

  getDivergence(divergenceId: string): Divergence | null {
    const row = this.db
      .prepare("select * from divergences where id = ? and user_id = ?")
      .get(divergenceId, this.userId) as Record<string, unknown> | undefined;
    return row ? this.mapDivergence(row) : null;
  }

  updateDivergenceStatus(
    divergenceId: string,
    status: DivergenceStatus,
    note?: string | null,
  ): Divergence | null {
    const existing = this.getDivergence(divergenceId);
    if (!existing || existing.status !== "open") return existing;
    const resolvedAt = now();
    this.db
      .prepare(
        "update divergences set status = ?, resolved_at = ?, resolution_note = ? where id = ? and user_id = ?",
      )
      .run(status, resolvedAt, note ?? null, divergenceId, this.userId);
    return { ...existing, status, resolvedAt, resolutionNote: note ?? null };
  }

  private mapDivergence(row: Record<string, unknown>): Divergence {
    return {
      id: String(row.id),
      claim: String(row.claim),
      evidence: String(row.evidence),
      domain: String(row.domain),
      status: String(row.status) as DivergenceStatus,
      createdAt: String(row.created_at),
      resolvedAt: row.resolved_at ? String(row.resolved_at) : null,
      resolutionNote: row.resolution_note ? String(row.resolution_note) : null,
    };
  }

  private mapStreak(row: Record<string, unknown>): UserStreak {
    return {
      category: String(row.category) as StreakCategory,
      goalId: row.goal_id ? String(row.goal_id) : null,
      currentStreak: Number(row.current_streak),
      longestStreak: Number(row.longest_streak),
      lastActiveDate: String(row.last_active_date),
      brokenAt: parseJson(String(row.broken_at), []),
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

  updateGoalStatus(goalId: string, status: Goal["status"]): Goal {
    const row = this.db
      .prepare("select * from goals where id = ? and user_id = ?")
      .get(goalId, this.userId) as Record<string, unknown> | undefined;
    if (!row) throw new Error(`Goal ${goalId} not found`);
    const updatedAt = now();
    this.db
      .prepare("update goals set status = ?, updated_at = ? where id = ? and user_id = ?")
      .run(status, updatedAt, goalId, this.userId);
    return this.mapGoal({ ...row, status, updated_at: updatedAt });
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

  /** 番茄钟/深度协议：把专注分钟累加进任务的 actualMinutes（不改状态）*/
  addTaskFocusMinutes(taskId: string, minutes: number): Task | null {
    const task = this.getTask(taskId);
    if (!task) return null;
    const newActual = (task.actualMinutes ?? 0) + Math.max(0, Math.round(minutes));
    this.db
      .prepare("update tasks set actual_minutes = ? where id = ? and user_id = ?")
      .run(newActual, taskId, this.userId);
    return { ...task, actualMinutes: newActual };
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

  /** §6.7 数据管理 / #12 计划编辑：手动修改任务可编辑字段 */
  updateTask(
    taskId: string,
    patch: Partial<
      Pick<
        Task,
        | "title"
        | "description"
        | "energyRequired"
        | "estimatedMinutes"
        | "rewardPoints"
        | "acceptanceCriteria"
        | "proofMethod"
        | "goalId"
      >
    >,
  ): Task {
    const task = this.getTask(taskId);
    if (!task) throw new Error(`Task ${taskId} was not found`);
    const next: Task = { ...task, ...patch };
    this.db
      .prepare(
        `update tasks set title = ?, description = ?, energy_required = ?, estimated_minutes = ?,
          reward_points = ?, acceptance_criteria = ?, proof_method = ?, goal_id = ?
        where id = ? and user_id = ?`,
      )
      .run(
        next.title,
        next.description ?? null,
        next.energyRequired,
        next.estimatedMinutes ?? null,
        next.rewardPoints,
        next.acceptanceCriteria,
        next.proofMethod,
        next.goalId ?? null,
        taskId,
        this.userId,
      );
    return next;
  }

  /** §6.7 数据管理：删除任务 */
  deleteTask(taskId: string): boolean {
    const r = this.db
      .prepare("delete from tasks where id = ? and user_id = ?")
      .run(taskId, this.userId);
    return r.changes > 0;
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
      // §6.7.5：写入即算 embedding（本地确定性向量），未提供时自动生成
      embedding: input.embedding ?? embedText(eventText(input)),
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

  /** 取某类目的事件（按时间倒序）。用于观测层画像时间线（profile_observation）等。*/
  queryEventsByCategory(category: string, limit = 60): NexusEvent[] {
    const rows = this.db
      .prepare(
        "select * from events where user_id = ? and category = ? order by occurred_at desc limit ?",
      )
      .all(this.userId, category, limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapEvent(row));
  }

  /** 取某时间点之后的所有事件（按时间正序），用于周期报告聚合 */
  queryEventsSince(sinceIso: string): NexusEvent[] {
    const rows = this.db
      .prepare(
        "select * from events where user_id = ? and occurred_at >= ? order by occurred_at asc",
      )
      .all(this.userId, sinceIso) as Record<string, unknown>[];
    return rows.map((row) => this.mapEvent(row));
  }

  /** §6.7 数据管理：取 [startIso, endIso) 区间内的事件（按时间倒序）*/
  queryEventsBetween(startIso: string, endIso: string): NexusEvent[] {
    const rows = this.db
      .prepare(
        "select * from events where user_id = ? and occurred_at >= ? and occurred_at < ? order by occurred_at desc",
      )
      .all(this.userId, startIso, endIso) as Record<string, unknown>[];
    return rows.map((row) => this.mapEvent(row));
  }

  /** §6.7 数据管理：删除单条事件 */
  deleteEvent(eventId: string): boolean {
    const r = this.db
      .prepare("delete from events where id = ? and user_id = ?")
      .run(eventId, this.userId);
    return r.changes > 0;
  }

  /**
   * §5.2 记忆遗忘策略：保护重要记忆，聚合琐碎记忆。
   * - <30 天：全保留
   * - 30 天以上、无标签、非保护类别的事件：按周聚合（>365 天按月）
   * - 有标签 / 保护类别 / 高置信度的事件：永不删除（记忆是核心资产）
   * 聚合产物是一条 memory_digest 事件，保留来源计数与类别分布。
   */
  compactMemory(nowMs = Date.now()): MemoryCompactionResult {
    const PRESERVE_CATEGORIES = new Set([
      "weekly_report",
      "monthly_report",
      "net_growth",
      "streak_milestone",
      "streak_break",
      "low_valley",
      "profile_evolution",
      "profile_change_resolved",
      "attribute_decay",
      "daily_review",
      "memory_digest",
    ]);
    const FULL_RETENTION_MS = 30 * 86400000;
    const YEAR_MS = 365 * 86400000;
    const cutoffIso = new Date(nowMs - FULL_RETENTION_MS).toISOString();

    const rows = this.db
      .prepare(
        "select * from events where user_id = ? and occurred_at < ? order by occurred_at asc",
      )
      .all(this.userId, cutoffIso) as Record<string, unknown>[];

    // 分组：仅聚合「无标签 且 非保护类别 且 低置信度」的事件
    const groups = new Map<string, NexusEvent[]>();
    for (const row of rows) {
      const event = this.mapEvent(row);
      const isImportant =
        event.tags.length > 0 ||
        PRESERVE_CATEGORIES.has(event.category ?? "") ||
        event.confidence >= 0.95;
      if (isImportant) continue;
      const occurred = new Date(event.occurredAt);
      const age = nowMs - occurred.getTime();
      const key = age >= YEAR_MS ? `m:${monthKey(occurred)}` : `w:${weekKey(occurred)}`;
      const bucket = groups.get(key) ?? [];
      bucket.push(event);
      groups.set(key, bucket);
    }

    let compacted = 0;
    let digests = 0;
    const deleteStmt = this.db.prepare("delete from events where id = ?");

    for (const [key, bucket] of groups) {
      if (bucket.length === 0) continue;
      const categories: Record<string, number> = {};
      for (const e of bucket) {
        const c = e.category ?? e.type;
        categories[c] = (categories[c] ?? 0) + 1;
      }
      const periodLabel = key.slice(2);
      const isMonth = key.startsWith("m:");
      this.logEvent({
        source: "memory-engine",
        type: "system",
        category: "memory_digest",
        rawPayload: { period: periodLabel, granularity: isMonth ? "month" : "week" },
        structured: {
          summary: `${periodLabel} ${isMonth ? "当月" : "当周"}聚合了 ${bucket.length} 条琐碎事件`,
          period: periodLabel,
          sourceCount: bucket.length,
          categories,
        },
        occurredAt: bucket[bucket.length - 1]?.occurredAt ?? new Date(nowMs).toISOString(),
        confidence: 0.6,
        tags: ["digest"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
      digests += 1;
      for (const e of bucket) {
        deleteStmt.run(e.id);
        compacted += 1;
      }
    }

    return { compacted, digests };
  }

  /**
   * §6.7.5 语义记忆 v2：向量优先 + 关键词兜底的混合召回。
   * 查询向量 vs 事件向量做余弦相似度；事件无向量时退回关键词分；再叠加近期权重。
   */
  searchMemory(query: string, topK = 10): NexusEvent[] {
    const events = this.queryEvents(500);
    if (!query.trim()) return events.slice(0, topK);

    const queryVec = embedText(query);
    const tokens = query
      .toLowerCase()
      .split(/[\s,，。！？、；：]+/)
      .filter((t) => t.length > 1);
    const now = Date.now();
    const DAY_MS = 86400000;

    const keywordScore = (event: NexusEvent): number => {
      const haystack = [
        event.category ?? "",
        event.source,
        ...event.tags,
        JSON.stringify(event.structured).toLowerCase(),
      ]
        .join(" ")
        .toLowerCase();
      let s = 0;
      for (const token of tokens) s += haystack.split(token).length - 1;
      return s;
    };

    const scored = events.map((event) => {
      // 向量分（余弦，0-1）；无向量则用归一化的关键词分兜底
      const vec = event.embedding;
      const vecScore =
        Array.isArray(vec) && vec.length === queryVec.length
          ? cosine(queryVec, vec)
          : Math.min(1, keywordScore(event) * 0.25);
      // 关键词分作为小幅加成，提升精确命中
      const kw = Math.min(1, keywordScore(event) * 0.1);
      const ageDay = (now - new Date(event.occurredAt).getTime()) / DAY_MS;
      const recencyBonus = Math.max(0, 1 - ageDay / 7) * 0.15;
      return { event, score: vecScore + kw + recencyBonus };
    });

    return scored
      .filter(({ score }) => score > 0.01)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .map(({ event }) => event);
  }

  /** 为缺失 embedding 的历史事件补算向量（§6.7.5 升级后回填）*/
  backfillEmbeddings(): number {
    const rows = this.db
      .prepare(
        "select id, source, category, structured, tags from events where user_id = ? and (embedding is null or embedding = 'null')",
      )
      .all(this.userId) as Record<string, unknown>[];
    let count = 0;
    const update = this.db.prepare("update events set embedding = ? where id = ?");
    for (const row of rows) {
      const vec = embedText(
        eventText({
          source: String(row.source),
          category: row.category ? String(row.category) : null,
          structured: parseJson(String(row.structured), {}),
          tags: parseJson(String(row.tags), []),
        }),
      );
      update.run(toJson(vec), String(row.id));
      count += 1;
    }
    return count;
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

  /** §6.7 数据管理：近期复盘列表（全类型，倒序）*/
  listReviews(limit = 50): Review[] {
    const rows = this.db
      .prepare("select * from reviews where user_id = ? order by created_at desc limit ?")
      .all(this.userId, limit) as Record<string, unknown>[];
    return rows.map((row) => this.mapReview(row));
  }

  /** §6.7 数据管理：删除单条复盘 */
  deleteReview(reviewId: string): boolean {
    const r = this.db
      .prepare("delete from reviews where id = ? and user_id = ?")
      .run(reviewId, this.userId);
    return r.changes > 0;
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

  // ── 能量点商城 §6.7.6 ─────────────────────────────────────────────

  /** 扣减能量点（不足返回 false，不扣）*/
  spendEnergy(amount: number): boolean {
    const user = this.getUser();
    if (amount <= 0 || user.energyPoints < amount) return false;
    this.db
      .prepare("update users set energy_points = ? where id = ?")
      .run(user.energyPoints - amount, this.userId);
    return true;
  }

  /** 把皮肤/特效加入已拥有 */
  addUnlockedSkin(skinId: string): Companion {
    const companion = this.getCompanion();
    if (!companion.unlockedSkins.includes(skinId)) {
      const next = [...companion.unlockedSkins, skinId];
      this.db
        .prepare("update companions set unlocked_skins_json = ? where id = ? and user_id = ?")
        .run(toJson(next), companion.id, this.userId);
      return { ...companion, unlockedSkins: next };
    }
    return companion;
  }

  /** 装备皮肤（写入 current_form），仅当已拥有 */
  equipSkin(skinId: string): Companion {
    const companion = this.getCompanion();
    if (skinId !== "default" && !companion.unlockedSkins.includes(skinId)) return companion;
    this.db
      .prepare("update companions set current_form = ? where id = ? and user_id = ?")
      .run(skinId, companion.id, this.userId);
    return { ...companion, currentForm: skinId };
  }

  // ── 自定义悬赏与 AI 定价（商城子系统规划书 §10）──────────────────

  /**
   * 可持续周赚取率（能量点/周）：近 windowDays 天已完成任务的 rewardPoints 之和 / 周数。
   * 4 周平均抑制单周脉冲；任务是能量的主来源，作为定价锚足够稳健。无数据返回 0（上层回退默认率）。
   */
  weeklyEarningRate(windowDays = 28): number {
    const since = new Date(Date.now() - windowDays * 86400000).toISOString();
    const rows = this.db
      .prepare(
        `select reward_points from tasks
         where user_id = ? and completed_at is not null and completed_at >= ?
           and status in ('completed', 'reviewed')`,
      )
      .all(this.userId, since) as Record<string, unknown>[];
    const total = rows.reduce((sum, r) => sum + Number(r.reward_points ?? 0), 0);
    const weeks = windowDays / 7;
    return weeks > 0 ? total / weeks : 0;
  }

  /**
   * 近 weeks 周每周的赚取点数桶（index 0 = 最近一周）。用于再校准取中位数，
   * 比平均更能抵抗"单周爆发"，只有持续变化才会被识别为节奏漂移（§7）。
   */
  weeklyEarningBuckets(weeks = 4): number[] {
    const nowMs = Date.now();
    const buckets = new Array<number>(weeks).fill(0);
    const since = new Date(nowMs - weeks * 7 * 86400000).toISOString();
    const rows = this.db
      .prepare(
        `select reward_points, completed_at from tasks
         where user_id = ? and completed_at is not null and completed_at >= ?
           and status in ('completed', 'reviewed')`,
      )
      .all(this.userId, since) as Record<string, unknown>[];
    for (const r of rows) {
      const ageWeeks = Math.floor(
        (nowMs - new Date(String(r.completed_at)).getTime()) / (7 * 86400000),
      );
      if (ageWeeks >= 0 && ageWeeks < weeks) {
        buckets[ageWeeks] = (buckets[ageWeeks] ?? 0) + Number(r.reward_points ?? 0);
      }
    }
    return buckets;
  }

  /** 新建一条悬赏契约（价格由 service 经经济官定好后传入；宿主无改价入口）*/
  saveBounty(input: {
    title: string;
    hostNote?: string | null;
    valueTier: Bounty["valueTier"];
    category: Bounty["category"];
    estimatedValueCny: number;
    alignment: Bounty["alignment"];
    relatedGoalIds: string[];
    price: number;
    priceBreakdown: BountyPriceBreakdown;
    state: BountyState;
    companionLine: string;
    rejectReason?: string | null;
  }): Bounty {
    const timestamp = now();
    const priced = input.state === "rejected" || input.state === "clarify" ? null : timestamp;
    const bounty: Bounty = {
      id: id("bounty"),
      userId: this.userId,
      title: input.title,
      hostNote: input.hostNote ?? null,
      valueTier: input.valueTier,
      category: input.category,
      estimatedValueCny: Math.round(input.estimatedValueCny),
      alignment: input.alignment,
      relatedGoalIds: input.relatedGoalIds,
      price: Math.round(input.price),
      priceBreakdown: input.priceBreakdown,
      state: input.state,
      companionLine: input.companionLine,
      rejectReason: input.rejectReason ?? null,
      evidenceRef: null,
      createdAt: timestamp,
      pricedAt: priced,
      redeemedAt: null,
      fulfilledAt: null,
    };
    this.db
      .prepare(
        `insert into bounties
         (id, user_id, title, host_note, value_tier, category, estimated_value_cny, alignment,
          related_goal_ids_json, price, price_breakdown_json, state, companion_line,
          reject_reason, evidence_ref, created_at, priced_at, redeemed_at, fulfilled_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, null, ?, ?, null, null)`,
      )
      .run(
        bounty.id,
        this.userId,
        bounty.title,
        bounty.hostNote ?? null,
        bounty.valueTier,
        bounty.category,
        bounty.estimatedValueCny,
        bounty.alignment,
        toJson(bounty.relatedGoalIds),
        bounty.price,
        toJson(bounty.priceBreakdown),
        bounty.state,
        bounty.companionLine,
        bounty.rejectReason ?? null,
        bounty.createdAt,
        bounty.pricedAt ?? null,
      );
    return bounty;
  }

  listBounties(): Bounty[] {
    const rows = this.db
      .prepare("select * from bounties where user_id = ? order by created_at desc")
      .all(this.userId) as Record<string, unknown>[];
    return rows.map((row) => this.mapBounty(row));
  }

  getBounty(bountyId: string): Bounty | null {
    const row = this.db
      .prepare("select * from bounties where id = ? and user_id = ?")
      .get(bountyId, this.userId) as Record<string, unknown> | undefined;
    return row ? this.mapBounty(row) : null;
  }

  /** 活跃悬赏数（占用并发位的状态）*/
  countActiveBounties(): number {
    const row = this.db
      .prepare(
        `select count(*) as n from bounties
         where user_id = ? and state in ('priced', 'saving', 'redeemable')`,
      )
      .get(this.userId) as Record<string, unknown>;
    return Number(row.n ?? 0);
  }

  /** 推进悬赏状态（终局态不可再改；时间戳/凭证按状态写入）*/
  updateBountyState(
    bountyId: string,
    state: BountyState,
    patch?: { evidenceRef?: string | null },
  ): Bounty | null {
    const existing = this.getBounty(bountyId);
    if (!existing) return null;
    // 终局态不可再改；redeemed 仍可推进到 fulfilled（§8 兑现确认），故不算终局
    const terminal: BountyState[] = ["fulfilled", "rejected", "abandoned"];
    if (terminal.includes(existing.state)) return existing;

    const redeemedAt = state === "redeemed" ? now() : existing.redeemedAt ?? null;
    const fulfilledAt = state === "fulfilled" ? now() : existing.fulfilledAt ?? null;
    const evidenceRef = patch?.evidenceRef !== undefined ? patch.evidenceRef : existing.evidenceRef ?? null;
    this.db
      .prepare(
        "update bounties set state = ?, redeemed_at = ?, fulfilled_at = ?, evidence_ref = ? where id = ? and user_id = ?",
      )
      .run(state, redeemedAt, fulfilledAt, evidenceRef, bountyId, this.userId);
    return { ...existing, state, redeemedAt, fulfilledAt, evidenceRef };
  }

  /** 再校准 / 锁价：更新一条 active 悬赏的价格、定价依据与说明（终局态不动）*/
  updateBountyPricing(
    bountyId: string,
    patch: { price?: number; priceBreakdown: BountyPriceBreakdown; companionLine?: string },
  ): Bounty | null {
    const existing = this.getBounty(bountyId);
    if (!existing) return null;
    if (existing.state !== "saving" && existing.state !== "redeemable") return existing;
    const price = patch.price ?? existing.price;
    const companionLine = patch.companionLine ?? existing.companionLine;
    this.db
      .prepare(
        "update bounties set price = ?, price_breakdown_json = ?, companion_line = ? where id = ? and user_id = ?",
      )
      .run(price, toJson(patch.priceBreakdown), companionLine, bountyId, this.userId);
    return { ...existing, price, priceBreakdown: patch.priceBreakdown, companionLine };
  }

  private mapBounty(row: Record<string, unknown>): Bounty {
    return {
      id: String(row.id),
      userId: String(row.user_id),
      title: String(row.title),
      hostNote: row.host_note ? String(row.host_note) : null,
      valueTier: String(row.value_tier) as Bounty["valueTier"],
      category: String(row.category ?? "other") as Bounty["category"],
      estimatedValueCny: Number(row.estimated_value_cny ?? 0),
      alignment: String(row.alignment) as Bounty["alignment"],
      relatedGoalIds: parseJson<string[]>(row.related_goal_ids_json as string | null, []),
      price: Number(row.price ?? 0),
      priceBreakdown: parseJson<BountyPriceBreakdown>(row.price_breakdown_json as string | null, {
        rWeek: 0,
        impliedHorizonWeeks: 0,
        keyFactors: [],
        clampApplied: "none",
        offlineFallback: false,
      }),
      state: String(row.state) as BountyState,
      companionLine: String(row.companion_line ?? ""),
      rejectReason: row.reject_reason ? String(row.reject_reason) : null,
      evidenceRef: row.evidence_ref ? String(row.evidence_ref) : null,
      createdAt: String(row.created_at),
      pricedAt: row.priced_at ? String(row.priced_at) : null,
      redeemedAt: row.redeemed_at ? String(row.redeemed_at) : null,
      fulfilledAt: row.fulfilled_at ? String(row.fulfilled_at) : null,
    };
  }

  private migrate(): void {
    this.db.exec(`
      create table if not exists users (
        id text primary key,
        created_at text not null,
        current_level integer not null default 1,
        total_exp integer not null default 0,
        credibility_score real not null default 1,
        energy_points integer not null default 0,
        attributes_json text not null default '{}'
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

      create table if not exists user_streaks (
        user_id text not null,
        category text not null,
        goal_id text not null default '',
        current_streak integer not null default 0,
        longest_streak integer not null default 0,
        last_active_date text not null default '',
        broken_at text not null default '[]',
        primary key (user_id, category, goal_id)
      );

      create table if not exists companion_memories (
        id text primary key,
        user_id text not null,
        type text not null,
        summary text not null,
        occurred_at text not null,
        ref_event_ids text not null default '[]',
        emotional_weight real not null default 0.5
      );

      create table if not exists intervention_log (
        id text primary key,
        user_id text not null,
        signal text not null,
        fired_date text not null,
        responded integer not null default 0,
        created_at text not null
      );

      create table if not exists profile_change_log (
        id text primary key,
        user_id text not null,
        field text not null,
        sub_path text,
        current_value text,
        proposed_value text,
        reason text not null,
        confidence real not null default 0.5,
        status text not null default 'pending',
        created_at text not null,
        resolved_at text
      );

      create table if not exists divergences (
        id text primary key,
        user_id text not null,
        claim text not null,
        evidence text not null,
        domain text not null,
        status text not null default 'open',
        created_at text not null,
        resolved_at text,
        resolution_note text
      );

      create table if not exists bounties (
        id text primary key,
        user_id text not null,
        title text not null,
        host_note text,
        value_tier text not null,
        category text not null default 'other',
        estimated_value_cny integer not null default 0,
        alignment text not null,
        related_goal_ids_json text not null default '[]',
        price integer not null default 0,
        price_breakdown_json text not null default '{}',
        state text not null,
        companion_line text not null default '',
        reject_reason text,
        evidence_ref text,
        created_at text not null,
        priced_at text,
        redeemed_at text,
        fulfilled_at text
      );
    `);
    // Incremental columns added after initial schema — safe to re-run
    for (const stmt of [
      `alter table users add column energy_points integer not null default 0`,
      `alter table users add column attributes_json text not null default '{}'`,
      `alter table users add column attribute_meta_json text not null default '{}'`,
      `alter table system_evolution_logs add column status text not null default 'proposed'`,
      `alter table system_evolution_logs add column target_key text`,
      `alter table system_evolution_logs add column created_at text`,
      `alter table bounties add column category text not null default 'other'`,
    ]) {
      try { this.db.exec(stmt); } catch { /* column already exists */ }
    }
  }

  private seedLocalUser(): void {
    const timestamp = now();
    this.db
      .prepare(
        `insert or ignore into users
        (id, created_at, current_level, total_exp, credibility_score, energy_points, attributes_json)
        values (?, ?, 1, 0, 1, 0, ?)`,
      )
      .run(this.userId, timestamp, toJson({ ...EMPTY_ATTRIBUTES }));

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
