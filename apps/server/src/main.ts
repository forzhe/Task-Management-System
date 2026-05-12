import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import pino from "pino";
import { AppModule } from "./app.module.js";
import { loadConfig } from "./config.js";

const logger = pino({ name: "nexus-7-server" });

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create(AppModule, { cors: true });
  await app.listen(config.NEXUS_PORT);
  logger.info({ port: config.NEXUS_PORT }, "NEXUS-7 server online");
}

bootstrap().catch((error) => {
  logger.error(error, "NEXUS-7 server failed to start");
  process.exit(1);
});
