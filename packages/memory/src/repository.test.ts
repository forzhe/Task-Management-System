import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { NexusRepository } from "./repository.js";

describe("NexusRepository task status flow", () => {
  it("persists start, completion evidence, failure evidence, and history", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "memory-test-host",
    });

    try {
      const task = repository.createTask({
        title: "写执行台测试",
        acceptanceCriteria: "状态流转可以被验证",
        proofMethod: "单元测试",
      });

      const inProgress = repository.updateTaskStatus(task.id, "in_progress", {
        note: "开始推进",
        source: "api",
      });
      expect(inProgress.status).toBe("in_progress");
      expect(inProgress.startedAt).toBeTruthy();
      expect(inProgress.completedAt).toBeNull();
      expect(inProgress.statusHistory.at(-1)?.status).toBe("in_progress");
      expect(inProgress.statusHistory.at(-1)?.reason).toBe("开始推进");

      const completed = repository.updateTaskStatus(task.id, "completed", {
        note: "测试通过",
        proofLink: "https://example.test/proof",
        actualMinutes: 25,
        source: "api",
      });
      expect(completed.status).toBe("completed");
      expect(completed.startedAt).toBe(inProgress.startedAt);
      expect(completed.completedAt).toBeTruthy();
      expect(completed.actualMinutes).toBe(25);
      expect(completed.evidence?.note).toBe("测试通过");
      expect(completed.evidence?.proofLink).toBe("https://example.test/proof");
      expect(repository.getTask(task.id)?.actualMinutes).toBe(25);

      const failedTask = repository.createTask({
        title: "验证失败路径",
        acceptanceCriteria: "失败证据可以被记录",
        proofMethod: "单元测试",
      });
      const failed = repository.updateTaskStatus(failedTask.id, "failed", {
        note: "阻塞原因明确",
        source: "api",
      });
      expect(failed.status).toBe("failed");
      expect(failed.completedAt).toBeNull();
      expect(failed.evidence?.note).toBe("阻塞原因明确");
      expect(failed.statusHistory.at(-1)?.status).toBe("failed");
      expect(failed.statusHistory.at(-1)?.reason).toBe("阻塞原因明确");
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository schema bootstrap", () => {
  it("creates the tables and key columns declared in the Drizzle baseline schema", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-schema-"));
    const dbPath = join(root, "nexus.db");
    const repository = new NexusRepository({
      dbPath,
      userId: "memory-schema-test-host",
    });
    repository.close();

    const db = new DatabaseSync(dbPath);
    try {
      const tables = new Set(
        (
          db
            .prepare(
              "select name from sqlite_master where type = 'table' and name not like 'sqlite_%'",
            )
            .all() as Array<{ name: string }>
        ).map((row) => row.name),
      );
      expect(tables).toEqual(
        new Set([
          "users",
          "profiles",
          "goals",
          "tasks",
          "reviews",
          "companions",
          "events",
          "system_evolution_logs",
          "user_streaks",
          "companion_memories",
          "intervention_log",
          "profile_change_log",
          "divergences",
        ]),
      );

      expect(columnsFor(db, "tasks")).toEqual(
        expect.arrayContaining(["actual_minutes", "evidence_json"]),
      );
      expect(columnsFor(db, "reviews")).toEqual(expect.arrayContaining(["emotion_tags"]));
      expect(columnsFor(db, "events")).toEqual(
        expect.arrayContaining(["raw_payload", "structured"]),
      );
      expect(columnsFor(db, "system_evolution_logs")).toEqual(
        expect.arrayContaining(["rollback_available"]),
      );
    } finally {
      db.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository persistence engine", () => {
  it("records streaks idempotently, tracks companion memories and intervention budget", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-streak-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "streak-test-host",
    });

    try {
      // 同日重复记录幂等
      const first = repository.recordStreakActivity("task_completion");
      expect(first.streak.currentStreak).toBe(1);
      expect(first.milestoneHit).toBeNull();
      const second = repository.recordStreakActivity("task_completion");
      expect(second.streak.currentStreak).toBe(1);
      expect(second.streak.longestStreak).toBe(1);

      // 目标链与全局链独立
      const goalStreak = repository.recordStreakActivity("goal_progress", "goal-1");
      expect(goalStreak.streak.goalId).toBe("goal-1");
      expect(repository.listStreaks()).toHaveLength(2);

      // 当日活跃的链不会被结算断链
      expect(repository.settleStreaks()).toHaveLength(0);

      // 小人记忆：写入 + 注入合并去重
      repository.saveCompanionMemory({
        type: "near_quit",
        summary: "宿主说想放弃，但最后做了 25 分钟",
        emotionalWeight: 0.9,
      });
      const memories = repository.getCompanionMemories();
      expect(memories).toHaveLength(1);
      expect(memories[0]?.type).toBe("near_quit");

      // 介入预算：当日计数 + 同信号去重 + 响应标记
      repository.logIntervention("streak_at_risk");
      expect(repository.countInterventionsToday()).toBe(1);
      expect(repository.hasInterventionFiredToday("streak_at_risk")).toBe(true);
      expect(repository.hasInterventionFiredToday("silent_day")).toBe(false);
      expect(repository.consecutiveIgnoredCount("streak_at_risk")).toBe(1);
      repository.markInterventionsRespondedToday();
      expect(repository.consecutiveIgnoredCount("streak_at_risk")).toBe(0);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository profile evolution + attribute decay", () => {
  it("proposes, accepts, and applies profile changes; never decays untouched attributes", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-evo-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "evo-test-host",
    });

    try {
      // 档案演化：提议 → 接受 → 应用 → 版本升
      const before = repository.getProfile();
      const proposal = repository.saveProfileChangeProposal({
        field: "basicInfo",
        subPath: "focus",
        currentValue: before.basicInfo.focus ?? null,
        proposedValue: "深度专注于 NEXUS-7 持续力引擎",
        reason: "近 7 天事件流显示宿主主要在做该项目",
        confidence: 0.8,
      });
      expect(repository.listProfileChangeProposals("pending")).toHaveLength(1);

      const resolved = repository.resolveProfileChange(proposal.id, true);
      expect(resolved.proposal.status).toBe("accepted");
      expect(resolved.profile?.basicInfo.focus).toBe("深度专注于 NEXUS-7 持续力引擎");
      expect(resolved.profile?.version).toBe(before.version + 1);
      expect(repository.listProfileChangeProposals("pending")).toHaveLength(0);

      // 已解决的提议不可重复应用
      const reResolve = repository.resolveProfileChange(proposal.id, true);
      expect(reResolve.profile).toBeNull();

      // 拒绝路径保留日志
      const rejectable = repository.saveProfileChangeProposal({
        field: "motivations",
        proposedValue: { primary: ["test"] },
        reason: "测试拒绝路径",
      });
      const rejected = repository.resolveProfileChange(rejectable.id, false);
      expect(rejected.proposal.status).toBe("rejected");
      expect(repository.listProfileChangeProposals("rejected")).toHaveLength(1);

      // 属性衰减：从未活跃的维度不衰减
      const decay = repository.applyAttributeDecay();
      expect(decay.decayed).toHaveLength(0);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository attribute xp award", () => {
  it("awards stamina xp from non-task source and resets its decay clock", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-attr-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "attr-xp-host",
    });
    try {
      const before = repository.getUser();
      const after = repository.awardAttributeXp("stamina", 40);
      expect(after.attributes.stamina).toBe((before.attributes.stamina ?? 0) + 40);
      expect(after.totalExp).toBe(before.totalExp + 40);
      // 衰减元数据：stamina 应被标记为今日活跃、档位归零
      const meta = repository.getAttributeMetaPublic();
      expect(meta.stamina.tier).toBe(0);
      expect(meta.stamina.lastActive).not.toBe("");
      // 非正数不变更
      const same = repository.awardAttributeXp("stamina", 0);
      expect(same.totalExp).toBe(after.totalExp);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository vector memory search", () => {
  it("computes embeddings on write and ranks semantically closer events higher", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-vec-"));
    const repository = new NexusRepository({ dbPath: join(root, "nexus.db"), userId: "vec-host" });
    try {
      const mk = (summary: string, tags: string[] = []) =>
        repository.logEvent({
          source: "test",
          type: "system",
          category: "note",
          rawPayload: {},
          structured: { summary },
          occurredAt: new Date().toISOString(),
          confidence: 0.8,
          tags,
          relatedGoalIds: [],
          relatedTaskIds: [],
        });

      const health = mk("今天跑步锻炼了 30 分钟 很健康", ["health"]);
      mk("娱乐支出奶茶购物 冲动消费", ["finance"]);
      mk("晨间规划 写代码 专注", ["planning"]);

      // 写入即有向量
      expect(Array.isArray(repository.queryEvents(10)[0]?.embedding)).toBe(true);

      const results = repository.searchMemory("运动 健身 跑步 健康", 3);
      expect(results.length).toBeGreaterThan(0);
      // 健康事件应排第一
      expect(results[0]?.id).toBe(health.id);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository energy shop", () => {
  it("spends energy only when sufficient; equips only owned skins", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-shop-"));
    const repository = new NexusRepository({ dbPath: join(root, "nexus.db"), userId: "shop-host" });
    try {
      // 充能：用属性奖励间接加不到 energy（energy 来自任务奖励），直接构造：
      // 通过 spendEnergy 不足返回 false
      expect(repository.spendEnergy(100)).toBe(false); // 初始 0 能量
      // 给点能量：完成一个有 rewardPoints 的任务
      const task = repository.createTask({ title: "攒能量", rewardPoints: 1500, acceptanceCriteria: "x", proofMethod: "y" });
      repository.updateTaskStatus(task.id, "completed");
      repository.applyTaskRewards(task.id);
      expect(repository.getUser().energyPoints).toBe(1500);

      // 装备未拥有的皮肤无效
      expect(repository.equipSkin("deepspace").currentForm).not.toBe("deepspace");

      // 扣费 + 拥有 + 装备
      expect(repository.spendEnergy(1000)).toBe(true);
      expect(repository.getUser().energyPoints).toBe(500);
      const owned = repository.addUnlockedSkin("deepspace");
      expect(owned.unlockedSkins).toContain("deepspace");
      expect(repository.equipSkin("deepspace").currentForm).toBe("deepspace");

      // 余额不足无法再扣
      expect(repository.spendEnergy(1000)).toBe(false);
      expect(repository.getUser().energyPoints).toBe(500);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository black-box arbitration", () => {
  it("opens a divergence and resolves it once, immutable after resolution", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-dvg-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "dvg-test-host",
    });
    try {
      const d = repository.saveDivergence({
        claim: "我今天专注工作了 3 小时",
        evidence: "屏幕记录前台仅 26 分钟",
        domain: "focus",
      });
      expect(d.status).toBe("open");
      expect(repository.listDivergences("open")).toHaveLength(1);

      const resolved = repository.updateDivergenceStatus(d.id, "refuted", "复查后承认高估");
      expect(resolved?.status).toBe("refuted");
      expect(resolved?.resolvedAt).toBeTruthy();
      expect(repository.listDivergences("open")).toHaveLength(0);
      expect(repository.listDivergences("refuted")).toHaveLength(1);

      // 已裁决不可再改（追踪记录不可篡改）
      const again = repository.updateDivergenceStatus(d.id, "confirmed");
      expect(again?.status).toBe("refuted");
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusRepository memory compaction", () => {
  it("aggregates stale untagged events but preserves important memories", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-memory-compact-"));
    const repository = new NexusRepository({
      dbPath: join(root, "nexus.db"),
      userId: "compact-test-host",
    });

    try {
      const now = Date.now();
      const old = (days: number) => new Date(now - days * 86400000).toISOString();

      // 40 天前的三条琐碎事件（无标签、非保护类别、低置信度）→ 应被聚合
      for (let i = 0; i < 3; i += 1) {
        repository.logEvent({
          source: "test",
          type: "system",
          category: "noise",
          rawPayload: {},
          structured: { summary: `琐碎事件 ${i}` },
          occurredAt: old(40),
          confidence: 0.5,
          tags: [],
          relatedGoalIds: [],
          relatedTaskIds: [],
        });
      }
      // 40 天前但有标签 → 保护
      repository.logEvent({
        source: "test",
        type: "agent_output",
        category: "noise",
        rawPayload: {},
        structured: { summary: "有标签的重要事件" },
        occurredAt: old(40),
        confidence: 0.5,
        tags: ["insight"],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
      // 40 天前但保护类别 → 保护
      repository.logEvent({
        source: "test",
        type: "agent_output",
        category: "weekly_report",
        rawPayload: {},
        structured: { summary: "周报" },
        occurredAt: old(40),
        confidence: 0.5,
        tags: [],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });
      // 10 天前的琐碎事件 → 未到 30 天保留期，不动
      repository.logEvent({
        source: "test",
        type: "system",
        category: "noise",
        rawPayload: {},
        structured: { summary: "近期事件" },
        occurredAt: old(10),
        confidence: 0.5,
        tags: [],
        relatedGoalIds: [],
        relatedTaskIds: [],
      });

      const before = repository.queryEvents(100).length;
      const result = repository.compactMemory(now);

      expect(result.compacted).toBe(3);
      expect(result.digests).toBe(1);

      const after = repository.queryEvents(100);
      // 3 条被删 + 1 条 digest 新增 = 净减 2
      expect(after.length).toBe(before - 2);
      // 摘要事件存在且记录来源数
      const digest = after.find((e) => e.category === "memory_digest");
      expect(digest?.structured.sourceCount).toBe(3);
      // 重要事件仍在
      expect(after.some((e) => e.tags.includes("insight"))).toBe(true);
      expect(after.some((e) => e.category === "weekly_report")).toBe(true);
      expect(after.some((e) => String(e.structured.summary) === "近期事件")).toBe(true);
    } finally {
      repository.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

function columnsFor(db: DatabaseSync, tableName: string): string[] {
  return (db.prepare(`pragma table_info(${tableName})`).all() as Array<{ name: string }>).map(
    (row) => row.name,
  );
}
