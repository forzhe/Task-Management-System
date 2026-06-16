import Anthropic, { type ClientOptions } from "@anthropic-ai/sdk";
import type { AgentId, ModelTier } from "@nexus/shared";
import OpenAI from "openai";

export type LlmProvider =
  | "deterministic"
  | "anthropic"
  | "openai"
  | "gemini"
  | "deepseek"
  | "kimi"
  | "ollama";
export type LlmProviderMode = "auto" | LlmProvider;

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmRequest {
  agentId: AgentId;
  modelTier: ModelTier;
  messages: LlmMessage[];
  maxTokens?: number;
}

export interface LlmResponse {
  content: string;
  model: string;
  offline: boolean;
  provider: LlmProvider;
  usage?: LlmUsage;
  stopReason?: string | null;
  latencyMs?: number;
}

export interface LlmUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheCreationInputTokens?: number;
  cacheReadInputTokens?: number;
}

export interface LlmClient {
  readonly provider: LlmProvider;
  complete(request: LlmRequest): Promise<LlmResponse>;
}

// Shared model-tier map used by all providers
export interface ModelMap {
  haiku: string;
  sonnet: string;
  opus: string;
}

/** @deprecated Use ModelMap */
export type AnthropicModelMap = ModelMap;

// ─── Deterministic (offline) ──────────────────────────────────────────────────

export class DeterministicLlmClient implements LlmClient {
  readonly provider = "deterministic" as const;

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const lastMessage = request.messages.at(-1)?.content ?? "";
    return {
      content: this.reply(request.agentId, lastMessage),
      model: `offline-${request.modelTier}`,
      offline: true,
      provider: this.provider,
      stopReason: "offline",
      latencyMs: Date.now() - startedAt,
    };
  }

  private reply(agentId: AgentId, content: string): string {
    switch (agentId) {
      case "dialogue":
        if (content.includes("累") || content.includes("跑步")) {
          return "已记录低能量信号：不要羞辱，这是校准材料。可继续校准今天的最小行动。";
        }
        return `已记录：${content.slice(0, 160)}`;
      case "planning":
        return JSON.stringify({
          schemaVersion: 1,
          agentId: "planning",
          summary: "生成今日执行协议。",
          data: {
            planTitle: "今日执行协议",
            rationale:
              "基于当前目标与最近事件，先追问或明确化模糊目标，再选择少量可验收任务；包含最小行动与验收标准。",
            tasks: [
              {
                title: "完成一个 45 分钟深度推进块",
                description: "选择最能推进长期愿景的一件事，做出可描述的产出。",
                energyRequired: "medium",
                estimatedMinutes: 45,
                acceptanceCriteria: "有明确产出，可以用文字说明完成结果。",
                proofMethod: "日终校准时提交文字说明或截图描述。",
                rewardPoints: 15,
              },
              {
                title: "完成一个低能量维护任务",
                description: "在状态一般时也能推进，避免全天归零。",
                energyRequired: "low",
                estimatedMinutes: 20,
                acceptanceCriteria: "完成一个小但真实的整理、记录或复习动作。",
                proofMethod: "记录完成内容。",
                rewardPoints: 8,
              },
            ],
            risks: ["不要把计划扩张成愿望清单。"],
          },
          warnings: [],
          fallbackUsed: false,
        });
      case "review":
        return JSON.stringify({
          schemaVersion: 1,
          agentId: "review",
          summary: "生成日终校准。",
          data: {
            summary: "今天的校准重点是区分真实推进与理想叙述。",
            honestDelta: "偏离需要被记录：如果任务没有完成，需要记录阻力而不是只记录结果。",
            risks: ["复盘太晚会降低细节准确度。"],
            tomorrowAdjustment: "明天调整：保留一个不可取消的 20 分钟推进块。",
            emotionTags: ["calibration"],
          },
          warnings: [],
          fallbackUsed: false,
        });
      case "profile":
        return "我会把这次输入作为宿主档案的弱信号，等待更多事件验证后再建议更新档案。";
      case "companion":
        return JSON.stringify({
          schemaVersion: 1,
          agentId: "companion",
          summary: "生成小人反馈。",
          data: {
            state: "idle",
            dialogue: "协议已记录。我会看你接下来有没有把它变成行动。",
          },
          warnings: [],
          fallbackUsed: false,
        });
      case "safety":
        return "safe";
      default:
        return `已记录：${content.slice(0, 160)}`;
    }
  }
}

// ─── Anthropic ────────────────────────────────────────────────────────────────

export interface AnthropicMessagesApi {
  create(request: AnthropicCreateRequest): Promise<AnthropicCreateResponse>;
}

export interface AnthropicCreateRequest {
  model: string;
  max_tokens: number;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
}

export interface AnthropicCreateResponse {
  content: Array<{ type: string; text?: string }>;
  model?: string;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface AnthropicClientLike {
  messages: AnthropicMessagesApi;
}

export interface AnthropicCredentials {
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
}

export type AnthropicClientFactory = (options: ClientOptions) => AnthropicClientLike;

const defaultAnthropicModels: ModelMap = {
  haiku: "claude-haiku-4-5-20251001",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-8",
};

const createAnthropicClient: AnthropicClientFactory = (options) =>
  new Anthropic(options) as unknown as AnthropicClientLike;

export class AnthropicLlmClient implements LlmClient {
  readonly provider = "anthropic" as const;
  private readonly anthropic: AnthropicClientLike;
  private readonly models: ModelMap;
  private readonly secrets: string[];

  constructor(
    credentials: string | AnthropicCredentials,
    models: Partial<ModelMap> = {},
    anthropic?: AnthropicClientLike,
    clientFactory: AnthropicClientFactory = createAnthropicClient,
  ) {
    const normalizedCredentials =
      typeof credentials === "string"
        ? normalizeAnthropicCredentials({ apiKey: credentials })
        : normalizeAnthropicCredentials(credentials);
    if (!hasAnthropicCredential(normalizedCredentials)) {
      throw new Error("Anthropic provider requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY.");
    }
    this.secrets = [normalizedCredentials.authToken, normalizedCredentials.apiKey].filter(
      (secret): secret is string => Boolean(secret),
    );
    this.anthropic = anthropic ?? clientFactory(toAnthropicClientOptions(normalizedCredentials));
    this.models = { ...defaultAnthropicModels, ...filterDefined(models) };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
    const model = this.models[request.modelTier];
    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: request.maxTokens ?? 1200,
        system,
        messages,
      });
      const content = response.content
        .map((block) => (block.type === "text" ? (block.text ?? "") : ""))
        .filter(Boolean)
        .join("\n");
      return {
        content,
        model: response.model ?? model,
        offline: false,
        provider: this.provider,
        usage: normalizeAnthropicUsage(response.usage),
        stopReason: response.stop_reason ?? null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw new Error(`Anthropic request failed: ${sanitizeErrorMessage(error, this.secrets)}`);
    }
  }
}

// ─── OpenAI-compatible (OpenAI / Gemini / DeepSeek / Kimi) ───────────────────

type OpenAICompatibleProvider = Exclude<LlmProvider, "deterministic" | "anthropic">;

interface ProviderDefaults {
  baseURL: string;
  models: ModelMap;
}

const PROVIDER_DEFAULTS: Record<OpenAICompatibleProvider, ProviderDefaults> = {
  openai: {
    baseURL: "https://api.openai.com/v1",
    models: { haiku: "gpt-4o-mini", sonnet: "gpt-4o", opus: "o1" },
  },
  gemini: {
    // Google's OpenAI-compatible endpoint
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: { haiku: "gemini-2.0-flash", sonnet: "gemini-2.0-flash", opus: "gemini-2.5-pro" },
  },
  deepseek: {
    baseURL: "https://api.deepseek.com/v1",
    models: { haiku: "deepseek-v4-pro", sonnet: "deepseek-v4-pro", opus: "deepseek-v4-pro" },
  },
  kimi: {
    baseURL: "https://api.moonshot.cn/v1",
    models: { haiku: "moonshot-v1-8k", sonnet: "moonshot-v1-32k", opus: "moonshot-v1-128k" },
  },
  ollama: {
    // 本地 Ollama 的 OpenAI 兼容端点；三档默认同一本地模型，由 models 覆盖
    baseURL: "http://localhost:11434/v1",
    models: { haiku: "qwen2.5:7b", sonnet: "qwen2.5:7b", opus: "qwen2.5:7b" },
  },
};

export class OpenAICompatibleLlmClient implements LlmClient {
  readonly provider: OpenAICompatibleProvider;
  private readonly client: OpenAI;
  private readonly models: ModelMap;
  private readonly secrets: string[];

  constructor(
    provider: OpenAICompatibleProvider,
    apiKey: string,
    models: Partial<ModelMap> = {},
    baseURL?: string,
  ) {
    this.provider = provider;
    const defaults = PROVIDER_DEFAULTS[provider];
    this.secrets = [apiKey];
    this.models = { ...defaults.models, ...filterDefined(models) };
    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL ?? defaults.baseURL,
    });
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const startedAt = Date.now();
    const model = this.models[request.modelTier];
    try {
      const response = await this.client.chat.completions.create({
        model,
        max_tokens: request.maxTokens ?? 1200,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      });
      const content =
        response.choices
          .map((choice) => choice.message?.content ?? "")
          .filter(Boolean)
          .join("\n") ?? "";
      return {
        content,
        model: response.model ?? model,
        offline: false,
        provider: this.provider,
        usage: response.usage
          ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens }
          : undefined,
        stopReason: response.choices[0]?.finish_reason ?? null,
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      throw new Error(
        `${this.provider} request failed: ${sanitizeErrorMessage(error, this.secrets)}`,
      );
    }
  }
}

// ─── Hybrid (本地 + 云端混合推理，§6.4 P4-3) ─────────────────────────────────

/**
 * 混合推理客户端：把指定档位（默认 haiku 廉价高频）路由到本地模型，
 * 其余走主云端模型。本地不可达时**优雅降级**回主模型——没装本地模型也不会坏。
 * 服务 P4-3 混合推理 + P4-5 成本目标。
 */
export class HybridLlmClient implements LlmClient {
  readonly provider: LlmProvider;
  constructor(
    private readonly primary: LlmClient,
    private readonly local: LlmClient,
    private readonly localTiers: ReadonlySet<ModelTier>,
  ) {
    this.provider = primary.provider;
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    if (this.localTiers.has(request.modelTier)) {
      try {
        return await this.local.complete(request);
      } catch {
        // 本地模型不可达（未运行/超时）→ 回落主模型，绝不让整链崩
        return this.primary.complete(request);
      }
    }
    return this.primary.complete(request);
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export interface CreateLlmClientOptions {
  provider?: LlmProviderMode;
  /** Model overrides — applied to whichever provider is selected */
  models?: Partial<ModelMap>;
  // Anthropic
  apiKey?: string;
  authToken?: string;
  baseURL?: string;
  // OpenAI
  openaiApiKey?: string;
  // Gemini
  geminiApiKey?: string;
  // DeepSeek
  deepseekApiKey?: string;
  // Kimi (Moonshot)
  kimiApiKey?: string;
  // ── 混合推理（本地 Ollama）P4-3 ──
  /** 本地模型名（如 qwen2.5:7b）。配置即启用混合推理，把 localTiers 路由到本地 */
  localModel?: string;
  /** 本地 OpenAI 兼容端点，默认 http://localhost:11434/v1 */
  localBaseURL?: string;
  /** 哪些档位走本地，默认 ["haiku"]（廉价高频）*/
  localTiers?: ModelTier[];
}

export function createLlmClient(apiKey?: string): LlmClient;
export function createLlmClient(options?: CreateLlmClientOptions): LlmClient;
export function createLlmClient(input?: string | CreateLlmClientOptions): LlmClient {
  const options = typeof input === "string" ? { apiKey: input } : (input ?? {});
  const primary = createPrimaryLlmClient(options);
  return maybeWrapHybrid(primary, options);
}

/** 若配置了本地模型，把主客户端包成混合推理（haiku→本地，回落主模型）*/
function maybeWrapHybrid(primary: LlmClient, options: CreateLlmClientOptions): LlmClient {
  if (!options.localModel?.trim()) return primary;
  const local = new OpenAICompatibleLlmClient(
    "ollama",
    "ollama", // Ollama 不需要 key，传占位符
    { haiku: options.localModel, sonnet: options.localModel, opus: options.localModel },
    options.localBaseURL,
  );
  const tiers = new Set<ModelTier>(options.localTiers ?? ["haiku"]);
  return new HybridLlmClient(primary, local, tiers);
}

function createPrimaryLlmClient(options: CreateLlmClientOptions): LlmClient {
  const providerMode = options.provider ?? "auto";
  const models = options.models ?? {};

  if (providerMode === "deterministic") return new DeterministicLlmClient();
  if (providerMode !== "auto") return buildExplicitProvider(providerMode, options, models);

  // Auto-detect: first provider with a credential wins
  const anthropicCreds = normalizeAnthropicCredentials(options);
  if (hasAnthropicCredential(anthropicCreds)) {
    return new AnthropicLlmClient(anthropicCreds, models);
  }
  if (options.openaiApiKey) {
    return new OpenAICompatibleLlmClient("openai", options.openaiApiKey, models);
  }
  if (options.geminiApiKey) {
    return new OpenAICompatibleLlmClient("gemini", options.geminiApiKey, models);
  }
  if (options.deepseekApiKey) {
    return new OpenAICompatibleLlmClient("deepseek", options.deepseekApiKey, models);
  }
  if (options.kimiApiKey) {
    return new OpenAICompatibleLlmClient("kimi", options.kimiApiKey, models);
  }
  return new DeterministicLlmClient();
}

function buildExplicitProvider(
  provider: Exclude<LlmProviderMode, "auto">,
  options: CreateLlmClientOptions,
  models: Partial<ModelMap>,
): LlmClient {
  if (provider === "anthropic") {
    const creds = normalizeAnthropicCredentials(options);
    if (!hasAnthropicCredential(creds)) {
      throw new Error("NEXUS_LLM_PROVIDER=anthropic requires ANTHROPIC_AUTH_TOKEN or ANTHROPIC_API_KEY.");
    }
    return new AnthropicLlmClient(creds, models);
  }
  // Ollama 本地模型不需要 key
  if (provider === "ollama") {
    return new OpenAICompatibleLlmClient("ollama", "ollama", models, options.localBaseURL);
  }
  const keyMap: Record<OpenAICompatibleProvider, string | undefined> = {
    openai: options.openaiApiKey,
    gemini: options.geminiApiKey,
    deepseek: options.deepseekApiKey,
    kimi: options.kimiApiKey,
    ollama: "ollama",
  };
  const apiKey = keyMap[provider as OpenAICompatibleProvider];
  if (!apiKey) {
    const envMap: Record<OpenAICompatibleProvider, string> = {
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      deepseek: "DEEPSEEK_API_KEY",
      kimi: "KIMI_API_KEY",
      ollama: "(none)",
    };
    throw new Error(
      `NEXUS_LLM_PROVIDER=${provider} requires ${envMap[provider as OpenAICompatibleProvider]}.`,
    );
  }
  return new OpenAICompatibleLlmClient(provider as OpenAICompatibleProvider, apiKey, models);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function toLlmTrace(response: LlmResponse, promptVersion?: string): Record<string, unknown> {
  return {
    model: response.model,
    provider: response.provider,
    offline: response.offline,
    promptVersion,
    usage: response.usage ?? null,
    stopReason: response.stopReason ?? null,
    latencyMs: response.latencyMs ?? null,
  };
}

function normalizeAnthropicCredentials(credentials: AnthropicCredentials): AnthropicCredentials {
  return {
    apiKey: normalizeOptionalString(credentials.apiKey),
    authToken: normalizeOptionalString(credentials.authToken),
    baseURL: normalizeOptionalString(credentials.baseURL),
  };
}

function normalizeOptionalString(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function hasAnthropicCredential(credentials: AnthropicCredentials): boolean {
  return Boolean(credentials.authToken ?? credentials.apiKey);
}

export function toAnthropicClientOptions(credentials: AnthropicCredentials): ClientOptions {
  const normalizedCredentials = normalizeAnthropicCredentials(credentials);
  return {
    baseURL: normalizedCredentials.baseURL,
    authToken: normalizedCredentials.authToken ?? null,
    apiKey: normalizedCredentials.authToken ? null : (normalizedCredentials.apiKey ?? null),
  };
}

function normalizeAnthropicUsage(usage: AnthropicCreateResponse["usage"]): LlmUsage | undefined {
  if (!usage) return undefined;
  return {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheCreationInputTokens: usage.cache_creation_input_tokens,
    cacheReadInputTokens: usage.cache_read_input_tokens,
  };
}

function sanitizeErrorMessage(error: unknown, secrets: string[]): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutKnownSecrets = secrets.reduce(
    (message, secret) => message.split(secret).join("[REDACTED_API_KEY]"),
    raw,
  );
  return withoutKnownSecrets.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED_API_KEY]");
}

function filterDefined<T extends object>(obj: Partial<T>): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
