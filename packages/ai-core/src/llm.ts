import Anthropic from "@anthropic-ai/sdk";
import type { AgentId, ModelTier } from "@nexus/shared";

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
}

export interface LlmClient {
  complete(request: LlmRequest): Promise<LlmResponse>;
}

export class DeterministicLlmClient implements LlmClient {
  async complete(request: LlmRequest): Promise<LlmResponse> {
    const lastMessage = request.messages.at(-1)?.content ?? "";
    return {
      content: this.reply(request.agentId, lastMessage),
      model: `offline-${request.modelTier}`,
      offline: true,
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

export interface AnthropicModelMap {
  haiku: string;
  sonnet: string;
  opus: string;
}

const defaultModelMap: AnthropicModelMap = {
  haiku: "claude-3-5-haiku-latest",
  sonnet: "claude-sonnet-4-5",
  opus: "claude-opus-4-1",
};

export class AnthropicLlmClient implements LlmClient {
  private readonly anthropic: Anthropic;
  private readonly models: AnthropicModelMap;

  constructor(apiKey: string, models: Partial<AnthropicModelMap> = {}) {
    this.anthropic = new Anthropic({ apiKey });
    this.models = { ...defaultModelMap, ...models };
  }

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const system = request.messages
      .filter((message) => message.role === "system")
      .map((message) => message.content)
      .join("\n\n");
    const messages = request.messages
      .filter((message) => message.role !== "system")
      .map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
    const model = this.models[request.modelTier];
    const response = await this.anthropic.messages.create({
      model,
      max_tokens: request.maxTokens ?? 1200,
      system,
      messages,
    });
    const content = response.content
      .map((block) => (block.type === "text" ? block.text : ""))
      .filter(Boolean)
      .join("\n");
    return { content, model, offline: false };
  }
}

export function createLlmClient(apiKey?: string): LlmClient {
  return apiKey ? new AnthropicLlmClient(apiKey) : new DeterministicLlmClient();
}
