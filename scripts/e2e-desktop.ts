import { type ChildProcess, spawn } from "node:child_process";

const desktop = spawn(
  "corepack",
  [
    "pnpm",
    "--filter",
    "@nexus/desktop",
    "exec",
    "vite",
    "--host",
    "127.0.0.1",
    "--port",
    "5178",
    "--strictPort",
  ],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      VITE_NEXUS_API_BASE: "http://127.0.0.1:3751",
    },
    shell: true,
    stdio: "inherit",
  },
);

wireShutdown(desktop);

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
