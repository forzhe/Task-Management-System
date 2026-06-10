import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const originalEnv = { ...process.env };

describe("loadConfig", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("defaults to auto provider and treats an empty key as unset", () => {
    process.env = {
      ...originalEnv,
      NEXUS_LLM_PROVIDER: "",
      ANTHROPIC_API_KEY: "",
      ANTHROPIC_AUTH_TOKEN: "",
      ANTHROPIC_BASE_URL: "",
    };

    const config = loadConfig();

    expect(config.NEXUS_LLM_PROVIDER).toBe("auto");
    expect(config.ANTHROPIC_API_KEY).toBeUndefined();
    expect(config.ANTHROPIC_AUTH_TOKEN).toBeUndefined();
    expect(config.ANTHROPIC_BASE_URL).toBeUndefined();
  });

  it("parses deterministic provider", () => {
    process.env = {
      ...originalEnv,
      NEXUS_LLM_PROVIDER: "deterministic",
    };

    expect(loadConfig().NEXUS_LLM_PROVIDER).toBe("deterministic");
  });

  it("parses anthropic provider and model overrides", () => {
    process.env = {
      ...originalEnv,
      NEXUS_LLM_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "sk-ant-test",
      ANTHROPIC_AUTH_TOKEN: "gateway-token",
      ANTHROPIC_BASE_URL: "https://gateway.example.test",
      ANTHROPIC_MODEL_HAIKU: "haiku-test",
      ANTHROPIC_MODEL_SONNET: "sonnet-test",
      ANTHROPIC_MODEL_OPUS: "opus-test",
    };

    const config = loadConfig();

    expect(config.NEXUS_LLM_PROVIDER).toBe("anthropic");
    expect(config.ANTHROPIC_API_KEY).toBe("sk-ant-test");
    expect(config.ANTHROPIC_AUTH_TOKEN).toBe("gateway-token");
    expect(config.ANTHROPIC_BASE_URL).toBe("https://gateway.example.test");
    expect(config.ANTHROPIC_MODEL_HAIKU).toBe("haiku-test");
    expect(config.ANTHROPIC_MODEL_SONNET).toBe("sonnet-test");
    expect(config.ANTHROPIC_MODEL_OPUS).toBe("opus-test");
  });
});
