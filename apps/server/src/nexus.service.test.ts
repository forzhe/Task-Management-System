import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { NexusService } from "./nexus.service.js";

const originalEnv = { ...process.env };

describe("NexusService task status events", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("records task status events and syncs Vault output", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-server-"));
    process.env.NEXUS_DB_PATH = join(root, "nexus.db");
    process.env.NEXUS_VAULT_PATH = join(root, "NEXUS-7");
    process.env.NEXUS_USER_ID = "server-test-host";
    process.env.NEXUS_LLM_PROVIDER = "deterministic";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    process.env.ANTHROPIC_BASE_URL = "";

    const service = new NexusService();
    try {
      await service.bootstrapVault();
      const task = await service.createTask({
        title: "同步任务状态",
        acceptanceCriteria: "事件流和 Vault 都更新",
        proofMethod: "服务层测试",
      });
      const updated = await service.updateTaskStatus(task.id, "completed", {
        note: "服务层证据",
        proofLink: "https://example.test/service",
        actualMinutes: 18,
        source: "api",
      });

      expect(updated.status).toBe("completed");
      expect(updated.actualMinutes).toBe(18);

      const statusEvent = service
        .queryEvents(20)
        .find((event) => event.category === "task_status_changed");
      expect(statusEvent?.structured).toMatchObject({
        taskId: task.id,
        fromStatus: "not_started",
        toStatus: "completed",
        actualMinutes: 18,
      });
      expect(statusEvent?.structured.evidence).toMatchObject({
        note: "服务层证据",
        proofLink: "https://example.test/service",
      });

      const todayPath = join(root, "NEXUS-7", "02_任务", "今日.md");
      await access(todayPath);
      await access(join(root, "NEXUS-7", "05_系统日志", "事件流", "latest.md"));
      const todayMarkdown = await readFile(todayPath, "utf8");
      expect(todayMarkdown).toContain("同步任务状态");
      expect(todayMarkdown).toContain("completed");
    } finally {
      await service.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("NexusService custom bounties (offline pricing → redeem)", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("prices a wish offline, locks it, then redeems once enough energy is earned", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-server-bounty-"));
    process.env.NEXUS_DB_PATH = join(root, "nexus.db");
    process.env.NEXUS_VAULT_PATH = join(root, "NEXUS-7");
    process.env.NEXUS_USER_ID = "bounty-service-host";
    process.env.NEXUS_LLM_PROVIDER = "deterministic";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    process.env.ANTHROPIC_BASE_URL = "";

    const service = new NexusService();
    try {
      await service.bootstrapVault();

      // 提交心愿 → 经济官离线确定性定价，落库为锁定的悬赏
      const proposed = await service.proposeBounty({ title: "一杯奶茶", referenceCny: 20 });
      expect(proposed.ok).toBe(true);
      expect(proposed.verdict).toBe("price");
      const bounty = proposed.bounty;
      expect(bounty).toBeTruthy();
      expect(bounty?.price).toBeGreaterThan(0);
      expect(bounty?.category).toBe("food");
      expect(bounty?.priceBreakdown.offlineFallback).toBe(true);
      // 隐含周期被夹逼在护栏内
      expect(bounty?.priceBreakdown.impliedHorizonWeeks).toBeLessThanOrEqual(28);

      // 能量不足时不能兑现
      const tooEarly = service.redeemBounty(bounty!.id);
      expect(tooEarly.ok).toBe(false);

      // 攒够能量：完成一个高奖励任务
      const task = await service.createTask({
        title: "攒能量",
        rewardPoints: 2000,
        acceptanceCriteria: "x",
        proofMethod: "y",
      });
      await service.updateTaskStatus(task.id, "completed");

      // 现在可以兑现 → 扣能量、进入 redeemed（终局价格不变）
      const redeemed = service.redeemBounty(bounty!.id);
      expect(redeemed.ok).toBe(true);
      expect(redeemed.bounty?.state).toBe("redeemed");
      expect(redeemed.energyPoints).toBe(2000 - bounty!.price);

      // 已兑现不能二次兑现
      expect(service.redeemBounty(bounty!.id).ok).toBe(false);

      const view = service.getBounties();
      expect(view.bounties).toHaveLength(1);
      expect(view.activeCount).toBe(0);
    } finally {
      await service.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("recalibration locks a bounty once the host can nearly afford it", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-server-recal-"));
    process.env.NEXUS_DB_PATH = join(root, "nexus.db");
    process.env.NEXUS_VAULT_PATH = join(root, "NEXUS-7");
    process.env.NEXUS_USER_ID = "recal-service-host";
    process.env.NEXUS_LLM_PROVIDER = "deterministic";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    process.env.ANTHROPIC_BASE_URL = "";

    const service = new NexusService();
    try {
      await service.bootstrapVault();
      const proposed = await service.proposeBounty({ title: "一杯奶茶", referenceCny: 20 });
      const price = proposed.bounty?.price ?? 0;
      expect(price).toBeGreaterThan(0);

      // 攒到 ≥90% 价格
      const task = await service.createTask({
        title: "攒能量",
        rewardPoints: Math.ceil(price * 0.95),
        acceptanceCriteria: "x",
        proofMethod: "y",
      });
      await service.updateTaskStatus(task.id, "completed");

      // 打开商城触发再校准 → 临门一脚永久锁价
      const view = service.getBounties();
      const b = view.bounties.find((x) => x.id === proposed.bounty?.id);
      expect(b?.priceBreakdown.locked).toBe(true);
      expect(b?.price).toBe(price); // 锁定价，没有被上调
    } finally {
      await service.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("records a focus session: accumulates actualMinutes, awards focus xp, logs an event", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-server-focus-"));
    process.env.NEXUS_DB_PATH = join(root, "nexus.db");
    process.env.NEXUS_VAULT_PATH = join(root, "NEXUS-7");
    process.env.NEXUS_USER_ID = "focus-service-host";
    process.env.NEXUS_LLM_PROVIDER = "deterministic";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    process.env.ANTHROPIC_BASE_URL = "";

    const service = new NexusService();
    try {
      await service.bootstrapVault();
      const task = await service.createTask({
        title: "深度工作",
        acceptanceCriteria: "x",
        proofMethod: "y",
      });
      const focusBefore = service.getUser().attributes.focus;

      const r = await service.recordFocusSession(task.id, 25);
      expect(r).toMatchObject({ ok: true, focusXp: 25 });
      expect(service.listTasks().find((t) => t.id === task.id)?.actualMinutes).toBe(25);
      expect(service.getUser().attributes.focus).toBeGreaterThan(focusBefore);

      const ev = service.queryEvents(20).find((e) => e.category === "focus_session");
      expect(ev?.structured.minutes).toBe(25);

      // 第二段专注累加
      await service.recordFocusSession(task.id, 10);
      expect(service.listTasks().find((t) => t.id === task.id)?.actualMinutes).toBe(35);
    } finally {
      await service.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
    }
  });

  it("refuses to price a red-line reward and never charges for it", async () => {
    const root = await mkdtemp(join(tmpdir(), "nexus-server-bounty-redline-"));
    process.env.NEXUS_DB_PATH = join(root, "nexus.db");
    process.env.NEXUS_VAULT_PATH = join(root, "NEXUS-7");
    process.env.NEXUS_USER_ID = "bounty-redline-host";
    process.env.NEXUS_LLM_PROVIDER = "deterministic";
    process.env.ANTHROPIC_API_KEY = "";
    process.env.ANTHROPIC_AUTH_TOKEN = "";
    process.env.ANTHROPIC_BASE_URL = "";

    const service = new NexusService();
    try {
      await service.bootstrapVault();
      service.updateProfile({ redLines: ["不赌博"] });

      const proposed = await service.proposeBounty({ title: "去赌博一把" });
      expect(proposed.verdict).toBe("reject");
      expect(proposed.bounty?.price).toBe(0);
      // 被婉拒的悬赏不占用并发位
      expect(service.getBounties().activeCount).toBe(0);
    } finally {
      await service.onModuleDestroy();
      await rm(root, { recursive: true, force: true });
    }
  });
});
