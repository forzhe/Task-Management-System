import { z } from "zod";

const envSchema = z.object({
  NEXUS_PORT: z.coerce.number().int().positive().default(3737),
  NEXUS_DB_PATH: z.string().default("./nexus-7.db"),
  NEXUS_USER_ID: z.string().default("local-host"),
  NEXUS_VAULT_PATH: z.string().default("./NEXUS-7"),
  ANTHROPIC_API_KEY: z.string().optional(),
});

export type NexusConfig = z.infer<typeof envSchema>;

export function loadConfig(): NexusConfig {
  return envSchema.parse(process.env);
}
