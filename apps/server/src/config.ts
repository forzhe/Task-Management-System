import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z.string().optional(),
);
const providerSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
  z
    .enum(["auto", "deterministic", "anthropic", "openai", "gemini", "deepseek", "kimi", "ollama"])
    .default("auto"),
);

const envSchema = z.object({
  NEXUS_PORT: z.coerce.number().int().positive().default(3737),
  NEXUS_DB_PATH: z.string().default("./nexus-7.db"),
  NEXUS_USER_ID: z.string().default("local-host"),
  NEXUS_VAULT_PATH: z.string().default("./NEXUS-7"),
  NEXUS_LLM_PROVIDER: providerSchema,
  // Model tier overrides (applies to whichever provider is active)
  NEXUS_LLM_MODEL_HAIKU: optionalNonEmptyString,
  NEXUS_LLM_MODEL_SONNET: optionalNonEmptyString,
  NEXUS_LLM_MODEL_OPUS: optionalNonEmptyString,
  // Anthropic
  ANTHROPIC_API_KEY: optionalNonEmptyString,
  ANTHROPIC_AUTH_TOKEN: optionalNonEmptyString,
  ANTHROPIC_BASE_URL: optionalNonEmptyString,
  ANTHROPIC_MODEL_HAIKU: optionalNonEmptyString,
  ANTHROPIC_MODEL_SONNET: optionalNonEmptyString,
  ANTHROPIC_MODEL_OPUS: optionalNonEmptyString,
  // OpenAI
  OPENAI_API_KEY: optionalNonEmptyString,
  // Gemini
  GEMINI_API_KEY: optionalNonEmptyString,
  // DeepSeek
  DEEPSEEK_API_KEY: optionalNonEmptyString,
  // Kimi (Moonshot)
  KIMI_API_KEY: optionalNonEmptyString,
  // ── 混合推理（本地 Ollama）P4-3 ──
  NEXUS_LOCAL_LLM_MODEL: optionalNonEmptyString,
  NEXUS_LOCAL_LLM_BASE_URL: optionalNonEmptyString,
  NEXUS_LOCAL_LLM_TIERS: optionalNonEmptyString,
  NEXUS_AW_URL: z.string().default("http://localhost:5600"),
});

export type NexusConfig = z.infer<typeof envSchema>;

export function loadConfig(): NexusConfig {
  return envSchema.parse(process.env);
}
