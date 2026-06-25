import "reflect-metadata";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import pino from "pino";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";

// dev:server 的工作目录在 apps/server，默认读不到仓库根目录的 .env，
// 会导致 NEXUS_LLM_PROVIDER / 各家 API key 失效、始终退回离线确定性引擎。
// 这里在启动时尽力加载根目录 .env（源码 src/ 与构建产物 dist/ 相对根目录层级一致）。
const rootEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env");
const proc = process as typeof process & { loadEnvFile?: (path?: string) => void };
if (existsSync(rootEnvPath) && typeof proc.loadEnvFile === "function") {
  proc.loadEnvFile(rootEnvPath);
}

const logger = pino({ name: "nexus-7-server" });

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { cors: true });
  // #10 证据图片：静态托管本地上传目录（cwd 相对 ./uploads，已 gitignore）
  const uploadsDir = resolve(process.cwd(), "uploads");
  if (!existsSync(uploadsDir)) mkdirSync(uploadsDir, { recursive: true });
  app.useStaticAssets(uploadsDir, { prefix: "/uploads" });
  await app.listen(config.NEXUS_PORT);
  logger.info({ port: config.NEXUS_PORT }, "NEXUS-7 server online");
}

bootstrap().catch((error) => {
  logger.error(error, "NEXUS-7 server failed to start");
  process.exit(1);
});
