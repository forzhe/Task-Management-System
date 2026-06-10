import { type ChildProcess, spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";

const e2eRoot = join(process.cwd(), ".tmp", "e2e");

async function main() {
  await rm(e2eRoot, { recursive: true, force: true });

  const server = spawn(
    "corepack",
    ["pnpm", "--filter", "@nexus/server", "exec", "tsx", "src/main.ts"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NEXUS_PORT: "3751",
        NEXUS_DB_PATH: join(e2eRoot, "nexus-e2e.db"),
        NEXUS_VAULT_PATH: join(e2eRoot, "NEXUS-7"),
        NEXUS_USER_ID: "e2e-host",
        NEXUS_LLM_PROVIDER: "deterministic",
        ANTHROPIC_API_KEY: "",
        ANTHROPIC_AUTH_TOKEN: "",
        ANTHROPIC_BASE_URL: "",
      },
      shell: true,
      stdio: "inherit",
    },
  );

  wireShutdown(server);
}

function wireShutdown(child: ChildProcess): void {
  const shutdown = async () => {
    await killProcessTree(child);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  child.on("exit", (code) => process.exit(code ?? 0));
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
