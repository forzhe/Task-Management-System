import { type ChildProcess, spawn } from "node:child_process";
import { access, rm } from "node:fs/promises";
import { join } from "node:path";

const smokeRoot = join(process.cwd(), ".tmp", "smoke");
const port = 3741;

process.env.NEXUS_PORT = String(port);
process.env.NEXUS_DB_PATH = join(smokeRoot, "nexus-smoke.db");
process.env.NEXUS_VAULT_PATH = join(smokeRoot, "NEXUS-7");
process.env.NEXUS_USER_ID = "smoke-host";
process.env.ANTHROPIC_API_KEY = "";

interface TaskResponse {
  id: string;
  title: string;
  actualMinutes?: number | null;
}

interface EventResponse {
  category?: string | null;
}

async function main() {
  await rm(smokeRoot, { recursive: true, force: true });

  const server = spawn(
    "corepack",
    ["pnpm", "--filter", "@nexus/server", "exec", "tsx", "src/main.ts"],
    {
      cwd: process.cwd(),
      env: process.env,
      shell: true,
      stdio: "pipe",
    },
  );

  try {
    await waitForHealth(server);
    const health = await getJson<{ ok: boolean }>("/health");
    assert(health.ok, "health check failed");

    await postJson("/chat/send", { message: "今天开始执行 NEXUS-7，先记录一次启动事件。" });
    await postJson("/chat/send", { message: "开始晨间规划", trigger: "morning_planning" });

    const tasks = await getJson<TaskResponse[]>("/tasks");
    assert(tasks.length > 0, "planning did not create tasks");
    await patchJson(`/tasks/${tasks[0]?.id}/status`, {
      status: "in_progress",
      evidence: { note: "烟测开始执行", source: "api" },
    });
    const completedTask = await patchJson<TaskResponse>(`/tasks/${tasks[0]?.id}/status`, {
      status: "completed",
      evidence: {
        note: "烟测任务已完成",
        proofLink: "https://example.test/smoke",
        actualMinutes: 12,
        source: "api",
      },
    });
    assert(completedTask.actualMinutes === 12, "completed task did not persist actual minutes");

    await postJson("/reviews/daily", { note: "今天完成了烟测任务，并记录真实状态。" });
    const latestReview = await getJson<{ id: string } | null>("/reviews/latest?type=daily");
    assert(latestReview?.id, "latest review endpoint did not return a review");
    const events = await getJson<EventResponse[]>("/events/query?limit=20");
    assert(events.length >= 3, "event stream did not record enough events");
    assert(
      events.some((event) => event.category === "task_status_changed"),
      "task status change event was not recorded",
    );

    await access(join(smokeRoot, "NEXUS-7", "02_任务", "今日.md"));
    await access(join(smokeRoot, "NEXUS-7", "03_复盘", "每日"));
    await access(join(smokeRoot, "NEXUS-7", "05_系统日志", "事件流", "latest.md"));
    console.log("Smoke test passed.");
  } finally {
    await killProcessTree(server);
  }
}

async function waitForHealth(server: ChildProcess): Promise<void> {
  let lastError = "";
  for (let index = 0; index < 50; index += 1) {
    if (server.exitCode !== null) {
      throw new Error(`server exited before health check; exitCode=${server.exitCode}`);
    }
    try {
      const health = await getJson<{ ok: boolean }>("/health");
      if (health.ok) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`server did not become healthy: ${lastError}`);
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`);
  assert(response.ok, `${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

async function postJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

async function patchJson<T = unknown>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "PATCH",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`${path} returned ${response.status}: ${await response.text()}`);
  }
  return response.json() as Promise<T>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function killProcessTree(child: ChildProcess): Promise<void> {
  if (!child.pid) return;
  if (globalThis.process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
      killer.on("close", () => resolve());
      killer.on("error", () => resolve());
    });
    return;
  }
  child.kill("SIGTERM");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
