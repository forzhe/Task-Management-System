import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { NexusEvent, Profile, Review, Task } from "@nexus/shared";

function frontmatter(data: Record<string, unknown>): string {
  const lines = Object.entries(data).map(([key, value]) => `${key}: ${JSON.stringify(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n`;
}

export class VaultWriter {
  constructor(private readonly root: string) {}

  async ensureTemplate(): Promise<void> {
    await Promise.all([
      mkdir(join(this.root, "00_宿主档案"), { recursive: true }),
      mkdir(join(this.root, "02_任务", "历史"), { recursive: true }),
      mkdir(join(this.root, "03_复盘", "每日"), { recursive: true }),
      mkdir(join(this.root, "05_系统日志", "事件流"), { recursive: true }),
    ]);
  }

  async writeProfile(profile: Profile): Promise<void> {
    await this.ensureTemplate();
    const content = [
      frontmatter({ id: profile.userId, type: "profile", version: profile.version }),
      "# 宿主档案",
      "",
      "## 基本信息",
      "```json",
      JSON.stringify(profile.basicInfo, null, 2),
      "```",
      "",
      "## 红线",
      ...profile.redLines.map((line) => `- ${line}`),
      "",
      "## 长期愿景",
      "```json",
      JSON.stringify(profile.longTermVision, null, 2),
      "```",
    ].join("\n");
    await writeFile(join(this.root, "00_宿主档案", "基本信息.md"), content, "utf8");
  }

  async writeTodayTasks(tasks: Task[]): Promise<void> {
    await this.ensureTemplate();
    const content = [
      frontmatter({ type: "today_tasks", generated_at: new Date().toISOString() }),
      "# 今日执行协议",
      "",
      ...tasks.map((task) =>
        [
          `## ${task.status === "completed" ? "[x]" : "[ ]"} ${task.title}`,
          `- id: ${task.id}`,
          `- 状态: ${task.status}`,
          `- 能量: ${task.energyRequired}`,
          `- 验收: ${task.acceptanceCriteria}`,
          `- 证明: ${task.proofMethod}`,
          "",
        ].join("\n"),
      ),
    ].join("\n");
    await writeFile(join(this.root, "02_任务", "今日.md"), content, "utf8");
  }

  async writeDailyReview(review: Review): Promise<void> {
    await this.ensureTemplate();
    const date = review.scopeEnd.slice(0, 10);
    const summary = String(review.aiAnalysis.summary ?? review.aiAnalysis.text ?? "");
    const honestDelta = String(review.aiAnalysis.honestDelta ?? review.credibilityCheck ?? "");
    const risks = Array.isArray(review.aiAnalysis.risks) ? review.aiAnalysis.risks : [];
    const tomorrowAdjustment = String(
      review.aiAnalysis.tomorrowAdjustment ?? review.suggestedAdjustments.tomorrow ?? "",
    );
    const content = [
      frontmatter({ id: review.id, type: "daily_review", scope_end: review.scopeEnd }),
      `# 日终校准 ${date}`,
      "",
      "## 摘要",
      summary,
      "",
      "## 真实偏差",
      honestDelta,
      "",
      "## 风险",
      ...(risks.length > 0 ? risks.map((risk) => `- ${risk}`) : ["- 暂无"]),
      "",
      "## 明日调整",
      tomorrowAdjustment,
    ].join("\n");
    await writeFile(join(this.root, "03_复盘", "每日", `${date}.md`), content, "utf8");
  }

  async appendEventSnapshot(events: NexusEvent[]): Promise<void> {
    await this.ensureTemplate();
    const content = [
      frontmatter({ type: "event_snapshot", generated_at: new Date().toISOString() }),
      "# 事件流快照",
      "",
      "```json",
      JSON.stringify(events, null, 2),
      "```",
    ].join("\n");
    await writeFile(join(this.root, "05_系统日志", "事件流", "latest.md"), content, "utf8");
  }
}
