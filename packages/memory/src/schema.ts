import { integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  createdAt: text("created_at").notNull(),
  currentLevel: integer("current_level").notNull().default(1),
  totalExp: integer("total_exp").notNull().default(0),
  credibilityScore: real("credibility_score").notNull().default(1),
  energyPoints: integer("energy_points").notNull().default(0),
  attributesJson: text("attributes_json").notNull().default("{}"),
  attributeMetaJson: text("attribute_meta_json").notNull().default("{}"),
});

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  basicInfoJson: text("basic_info_json").notNull(),
  traitsJson: text("traits_json").notNull(),
  motivationsJson: text("motivations_json").notNull(),
  redLinesJson: text("red_lines_json").notNull(),
  longTermVisionJson: text("long_term_vision_json").notNull(),
  updatedAt: text("updated_at").notNull(),
  version: integer("version").notNull().default(1),
});

export const goals = sqliteTable("goals", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  parentGoalId: text("parent_goal_id"),
  level: text("level").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type"),
  metricsJson: text("metrics_json").notNull(),
  startAt: text("start_at"),
  deadline: text("deadline"),
  status: text("status").notNull(),
  progress: real("progress").notNull().default(0),
  aiBreakdownLogJson: text("ai_breakdown_log_json").notNull(),
  impulseProbability: real("impulse_probability"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  goalId: text("goal_id"),
  source: text("source").notNull(),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type"),
  difficulty: integer("difficulty").notNull(),
  energyRequired: text("energy_required").notNull(),
  estimatedMinutes: integer("estimated_minutes"),
  actualMinutes: integer("actual_minutes"),
  rewardPoints: integer("reward_points").notNull(),
  expRewardsJson: text("exp_rewards_json").notNull(),
  failurePenalty: text("failure_penalty"),
  acceptanceCriteria: text("acceptance_criteria").notNull(),
  proofMethod: text("proof_method").notNull(),
  scheduledAt: text("scheduled_at"),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  status: text("status").notNull(),
  statusHistoryJson: text("status_history_json").notNull(),
  evidenceJson: text("evidence_json").notNull(),
  verifiedByAi: integer("verified_by_ai").notNull().default(0),
});

export const reviews = sqliteTable("reviews", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  scopeStart: text("scope_start").notNull(),
  scopeEnd: text("scope_end").notNull(),
  subjectiveJson: text("subjective_json").notNull(),
  objectiveJson: text("objective_json").notNull(),
  aiAnalysisJson: text("ai_analysis_json").notNull(),
  suggestedAdjustmentsJson: text("suggested_adjustments_json").notNull(),
  emotionTagsJson: text("emotion_tags").notNull(),
  credibilityCheck: text("credibility_check"),
  createdAt: text("created_at").notNull(),
});

export const companions = sqliteTable("companions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  currentForm: text("current_form").notNull(),
  personalityParamsJson: text("personality_params_json").notNull(),
  unlockedActionsJson: text("unlocked_actions_json").notNull(),
  unlockedSkinsJson: text("unlocked_skins_json").notNull(),
  currentState: text("current_state").notNull(),
  currentDialogue: text("current_dialogue").notNull(),
  stateHistoryJson: text("state_history_json").notNull(),
});

export const events = sqliteTable("events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  source: text("source").notNull(),
  type: text("type").notNull(),
  category: text("category"),
  rawPayload: text("raw_payload").notNull(),
  structured: text("structured").notNull(),
  embedding: text("embedding"),
  occurredAt: text("occurred_at").notNull(),
  ingestedAt: text("ingested_at").notNull(),
  confidence: real("confidence").notNull(),
  tags: text("tags").notNull(),
  relatedGoalIds: text("related_goal_ids").notNull(),
  relatedTaskIds: text("related_task_ids").notNull(),
});

export const systemEvolutionLogs = sqliteTable("system_evolution_logs", {
  id: text("id").primaryKey(),
  evolutionAgentRunId: text("evolution_agent_run_id"),
  agentModified: text("agent_modified"),
  targetKey: text("target_key"),
  changeType: text("change_type"),
  oldConfig: text("old_config"),
  newConfig: text("new_config"),
  reason: text("reason"),
  abTestMetric: text("ab_test_metric"),
  status: text("status").notNull().default("proposed"),
  createdAt: text("created_at"),
  appliedAt: text("applied_at"),
  rollbackAvailable: integer("rollback_available").notNull().default(1),
});

// ── 持续力引擎 §6.6 ────────────────────────────────────────────────

export const userStreaks = sqliteTable(
  "user_streaks",
  {
    userId: text("user_id").notNull(),
    category: text("category").notNull(),
    goalId: text("goal_id").notNull().default(""),
    currentStreak: integer("current_streak").notNull().default(0),
    longestStreak: integer("longest_streak").notNull().default(0),
    lastActiveDate: text("last_active_date").notNull().default(""),
    brokenAt: text("broken_at").notNull().default("[]"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.category, table.goalId] })],
);

export const companionMemories = sqliteTable("companion_memories", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  type: text("type").notNull(),
  summary: text("summary").notNull(),
  occurredAt: text("occurred_at").notNull(),
  refEventIds: text("ref_event_ids").notNull().default("[]"),
  emotionalWeight: real("emotional_weight").notNull().default(0.5),
});

export const interventionLog = sqliteTable("intervention_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  signal: text("signal").notNull(),
  firedDate: text("fired_date").notNull(),
  responded: integer("responded").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const divergences = sqliteTable("divergences", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  claim: text("claim").notNull(),
  evidence: text("evidence").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("open"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
  resolutionNote: text("resolution_note"),
});

export const profileChangeLog = sqliteTable("profile_change_log", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  field: text("field").notNull(),
  subPath: text("sub_path"),
  currentValue: text("current_value"),
  proposedValue: text("proposed_value"),
  reason: text("reason").notNull(),
  confidence: real("confidence").notNull().default(0.5),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

// ── 自定义悬赏与 AI 定价（商城子系统）─────────────────────────────
export const bounties = sqliteTable("bounties", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  title: text("title").notNull(),
  hostNote: text("host_note"),
  valueTier: text("value_tier").notNull(),
  category: text("category").notNull().default("other"),
  estimatedValueCny: integer("estimated_value_cny").notNull().default(0),
  alignment: text("alignment").notNull(),
  relatedGoalIdsJson: text("related_goal_ids_json").notNull().default("[]"),
  price: integer("price").notNull().default(0),
  priceBreakdownJson: text("price_breakdown_json").notNull().default("{}"),
  state: text("state").notNull(),
  companionLine: text("companion_line").notNull().default(""),
  rejectReason: text("reject_reason"),
  evidenceRef: text("evidence_ref"),
  createdAt: text("created_at").notNull(),
  pricedAt: text("priced_at"),
  redeemedAt: text("redeemed_at"),
  fulfilledAt: text("fulfilled_at"),
});
