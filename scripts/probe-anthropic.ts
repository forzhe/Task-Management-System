import { access, rm } from "node:fs/promises";
import { join } from "node:path";
import { NexusService } from "../apps/server/src/nexus.service.js";

const probeRoot = join(process.cwd(), ".tmp", "anthropic-probe");
const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
const authToken = process.env.ANTHROPIC_AUTH_TOKEN?.trim();

if (!authToken && !apiKey) {
  console.error(
    "ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY is required for ai:probe. Set one first, then run `corepack pnpm ai:probe`.",
  );
  process.exit(1);
}

process.env.NEXUS_LLM_PROVIDER = "anthropic";
process.env.NEXUS_DB_PATH = join(probeRoot, "nexus-anthropic-probe.db");
process.env.NEXUS_VAULT_PATH = join(probeRoot, "NEXUS-7");
process.env.NEXUS_USER_ID = "anthropic-probe-host";

async function main() {
  await rm(probeRoot, { recursive: true, force: true });

  const service = new NexusService();
  try {
    await service.bootstrapVault();
    const health = service.getHealth();
    assert(health.llmProvider === "anthropic", "probe did not select Anthropic provider");

    const planning = await service.handleChat(
      "请根据当前状态生成今天 1-3 个真实可验收的推进任务。",
      "morning_planning",
    );
    const tasks = service.listTasks();
    assert(tasks.length >= 1 && tasks.length <= 3, "planning did not create 1-3 tasks");

    const task = tasks[0];
    assert(task, "planning did not create a task");
    await service.updateTaskStatus(task.id, "completed", {
      note: "Anthropic probe 完成第一项任务。",
      actualMinutes: task.estimatedMinutes ?? 20,
      proofLink: "probe://anthropic",
      source: "api",
    });

    const review = await service.runDailyReview(
      "今天完成了一次 Anthropic probe，重点观察结构化输出是否稳定。",
    );
    const latestReview = service.getLatestReview("daily");
    const companion = service.getCompanion();
    const events = service.queryEvents(30);

    assert(latestReview, "daily review was not saved");
    assert(companion.currentState, "companion state was not updated");
    assert(
      events.some((event) => event.category === "morning_plan"),
      "morning plan event was not recorded",
    );
    assert(
      events.some((event) => event.category === "daily_review"),
      "daily review event was not recorded",
    );
    assert(
      events.some(
        (event) => event.rawPayload && JSON.stringify(event.rawPayload).includes("usage"),
      ),
      "LLM usage metadata was not recorded",
    );

    await access(join(probeRoot, "NEXUS-7", "02_任务", "今日.md"));
    await access(join(probeRoot, "NEXUS-7", "03_复盘", "每日"));
    await access(join(probeRoot, "NEXUS-7", "05_系统日志", "事件流", "latest.md"));

    console.log("Anthropic probe passed.");
    console.log(
      JSON.stringify(
        {
          provider: health.llmProvider,
          createdTaskCount: tasks.length,
          firstTask: task.title,
          planningSummary: planning.response,
          reviewSummary: review.response,
          companionState: companion.currentState,
          traces: summarizeLlmTraces(events),
          vaultPath: join(probeRoot, "NEXUS-7"),
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

function summarizeLlmTraces(events: ReturnType<NexusService["queryEvents"]>) {
  return events
    .map((event) => {
      const rawPayload = event.rawPayload;
      if (!rawPayload || typeof rawPayload !== "object") return null;
      const raw = rawPayload as Record<string, unknown>;
      if (raw.provider !== "anthropic") return null;
      return {
        category: event.category,
        model: raw.model,
        promptVersion: raw.promptVersion,
        hasUsage: raw.usage !== null && raw.usage !== undefined,
        latencyMs: raw.latencyMs,
      };
    })
    .filter((trace): trace is NonNullable<typeof trace> => Boolean(trace));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
