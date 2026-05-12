import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
