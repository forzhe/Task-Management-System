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
    process.env.ANTHROPIC_API_KEY = "";

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
