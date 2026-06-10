/**
 * 通用 AI provider 探针脚本
 * 用法：NEXUS_LLM_PROVIDER=deepseek DEEPSEEK_API_KEY=sk-xxx tsx scripts/probe-ai.ts
 */
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { NexusService } from "../apps/server/src/nexus.service.js";

const probeRoot = join(process.cwd(), ".tmp", "ai-probe");

async function main() {
  await rm(probeRoot, { recursive: true, force: true });
  process.env.NEXUS_DB_PATH = join(probeRoot, "nexus-probe.db");
  process.env.NEXUS_VAULT_PATH = join(probeRoot, "NEXUS-7");
  process.env.NEXUS_USER_ID = "probe-host";

  const service = new NexusService();
  try {
    const health = service.getHealth();
    console.log(`Provider: ${health.llmProvider}  offline: ${health.offlineLlm}`);

    if (health.offlineLlm) {
      console.error("No API key detected — running in offline mode. Set the appropriate key first.");
      process.exit(1);
    }

    const planning = await service.handleChat(
      "请根据当前状态生成今天 1-3 个真实可验收的推进任务。",
      "morning_planning",
    );
    const tasks = service.listTasks();
    assert(tasks.length >= 1, "planning did not create any tasks");

    const task = tasks[0];
    assert(task, "no task created");
    await service.updateTaskStatus(task.id, "completed", {
      note: "probe 任务完成",
      actualMinutes: task.estimatedMinutes ?? 20,
      source: "api",
    });

    const review = await service.runDailyReview("今天完成了 AI probe 测试。");
    const events = service.queryEvents(30);

    assert(service.getLatestReview("daily"), "daily review not saved");
    assert(
      events.some((e) => e.rawPayload && JSON.stringify(e.rawPayload).includes("usage")),
      "LLM usage metadata not recorded",
    );

    console.log("\nProbe passed.");
    console.log(
      JSON.stringify(
        {
          provider: health.llmProvider,
          taskCount: tasks.length,
          firstTask: task.title,
          planResponse: planning.response?.slice(0, 120),
          reviewResponse: review.response?.slice(0, 120),
          companionState: service.getCompanion().currentState,
          traces: events
            .filter((e) => e.rawPayload && (e.rawPayload as Record<string, unknown>).provider)
            .map((e) => {
              const r = e.rawPayload as Record<string, unknown>;
              return { cat: e.category, model: r.model, latencyMs: r.latencyMs };
            }),
        },
        null,
        2,
      ),
    );
  } finally {
    await service.onModuleDestroy();
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
