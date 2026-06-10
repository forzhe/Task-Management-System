import { describe, expect, it } from "vitest";
import { type AnthropicClientLike, AnthropicLlmClient, createLlmClient } from "./llm.js";

describe("LLM provider selection", () => {
  it("uses deterministic mode when auto has no key", () => {
    expect(createLlmClient({ provider: "auto" }).provider).toBe("deterministic");
  });

  it("uses Anthropic mode when auto has an API key or auth token", () => {
    expect(createLlmClient({ provider: "auto", apiKey: "sk-ant-test" }).provider).toBe("anthropic");
    expect(createLlmClient({ provider: "auto", authToken: "gateway-token" }).provider).toBe(
      "anthropic",
    );
  });

  it("uses deterministic mode when explicitly requested even with credentials", () => {
    expect(
      createLlmClient({
        provider: "deterministic",
        apiKey: "sk-ant-test",
        authToken: "gateway-token",
      }).provider,
    ).toBe("deterministic");
  });

  it("requires an API key or auth token when Anthropic is explicit", () => {
    expect(() => createLlmClient({ provider: "anthropic" })).toThrow(
      "NEXUS_LLM_PROVIDER=anthropic requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY.",
    );
    expect(createLlmClient({ provider: "anthropic", authToken: "gateway-token" }).provider).toBe(
      "anthropic",
    );
  });
});

describe("AnthropicLlmClient", () => {
  it("maps model routing, messages, usage, stop reason, and latency", async () => {
    const calls: unknown[] = [];
    const anthropic: AnthropicClientLike = {
      messages: {
        async create(request) {
          calls.push(request);
          return {
            model: request.model,
            stop_reason: "end_turn",
            usage: {
              input_tokens: 11,
              output_tokens: 7,
              cache_creation_input_tokens: 3,
              cache_read_input_tokens: 5,
            },
            content: [{ type: "text", text: '{"ok":true}' }],
          };
        },
      },
    };
    const client = new AnthropicLlmClient(
      "sk-ant-test-secret",
      { sonnet: "claude-test-sonnet" },
      anthropic,
    );

    const response = await client.complete({
      agentId: "planning",
      modelTier: "sonnet",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "user prompt" },
      ],
    });

    expect(calls[0]).toMatchObject({
      model: "claude-test-sonnet",
      system: "system prompt",
      messages: [{ role: "user", content: "user prompt" }],
    });
    expect(response).toMatchObject({
      content: '{"ok":true}',
      model: "claude-test-sonnet",
      offline: false,
      provider: "anthropic",
      stopReason: "end_turn",
      usage: {
        inputTokens: 11,
        outputTokens: 7,
        cacheCreationInputTokens: 3,
        cacheReadInputTokens: 5,
      },
    });
    expect(response.latencyMs).toEqual(expect.any(Number));
  });

  it("passes base URL and auth token to the Anthropic SDK constructor", () => {
    const anthropic: AnthropicClientLike = {
      messages: {
        async create() {
          return { content: [] };
        },
      },
    };
    const constructorOptions: unknown[] = [];

    new AnthropicLlmClient(
      {
        apiKey: "sk-ant-ignored-when-token-exists",
        authToken: "gateway-token",
        baseURL: "https://gateway.example.test",
      },
      {},
      undefined,
      (options) => {
        constructorOptions.push(options);
        return anthropic;
      },
    );

    expect(constructorOptions[0]).toMatchObject({
      apiKey: null,
      authToken: "gateway-token",
      baseURL: "https://gateway.example.test",
    });
  });

  it("redacts API keys and auth tokens from Anthropic errors", async () => {
    const anthropic: AnthropicClientLike = {
      messages: {
        async create() {
          throw new Error("bad credentials gateway-secret and sk-ant-test-secret");
        },
      },
    };
    const client = new AnthropicLlmClient(
      { apiKey: "sk-ant-test-secret", authToken: "gateway-secret" },
      {},
      anthropic,
    );

    try {
      await client.complete({
        agentId: "planning",
        modelTier: "sonnet",
        messages: [{ role: "user", content: "hi" }],
      });
      throw new Error("expected Anthropic error");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).toContain("[REDACTED_API_KEY]");
      expect(message).not.toContain("gateway-secret");
      expect(message).not.toContain("sk-ant-test-secret");
    }
  });
});
