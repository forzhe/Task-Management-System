import { access, readdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const e2eVault = join(process.cwd(), ".tmp", "e2e", "NEXUS-7");

test("execution console completes the daily loop", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "今日执行中枢" })).toBeVisible();
  await expect(page.getByText("离线模拟")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("�");
  await expect(page.locator("body")).not.toContainText("涓");

  await page.getByRole("button", { name: /晨间规划/ }).click();

  const taskPanel = page.locator(".task-panel");
  const firstTask = page.locator(".task-row").first();
  await expect(
    firstTask.getByRole("heading", { name: "完成一个 45 分钟深度推进块" }),
  ).toBeVisible();
  await expect(firstTask).toContainText("中能量");
  await expect(firstTask).toContainText("45 分钟");
  await expect(firstTask).toContainText("验收");
  await expect(firstTask).toContainText("证明");
  await expect(firstTask).toContainText("+15");
  await expect(taskPanel).toContainText("完成一个低能量维护任务");

  await firstTask.getByTitle("开始").click();
  await expect(firstTask.locator(".status-badge")).toContainText("进行中");
  await expect(page.locator(".companion-core")).toHaveClass(/lean-in/);

  await firstTask.getByTitle("完成").click();
  await expect(page.getByText("完成或失败任务前，请先写一条证据备注。")).toBeVisible();

  await firstTask.getByPlaceholder("证据备注：完成了什么，或为什么失败").fill("E2E 完成证据");
  await firstTask.getByPlaceholder("实际分钟").fill("17");
  await firstTask.getByPlaceholder("证明链接").fill("https://example.test/e2e-proof");
  await firstTask.getByTitle("完成").click();

  await expect(firstTask.locator(".status-badge")).toContainText("已完成");
  await expect(page.locator(".companion-core")).toHaveClass(/celebrate/);

  const statusEvent = page.locator(".event-row").filter({ hasText: "task_status_changed" }).first();
  await expect(statusEvent).toBeVisible();
  await statusEvent.getByText("结构化数据").click();
  await expect(statusEvent).toContainText("actualMinutes");
  await expect(statusEvent).toContainText("17");

  await page.getByPlaceholder("今天真实发生了什么？").fill("E2E 完成任务并提交证据。");
  await page.getByRole("button", { name: /日终校准/ }).click();

  const reviewPanel = page.locator(".review-panel");
  await expect(reviewPanel).toContainText("今天的校准重点");
  await expect(reviewPanel).toContainText("真实偏差");
  await expect(reviewPanel).toContainText("明日调整");
  await expect(reviewPanel).toContainText("calibration");

  await expect.poll(() => fileExists(join(e2eVault, "02_任务", "今日.md"))).toBeTruthy();
  await expect.poll(() => hasMarkdownFile(join(e2eVault, "03_复盘", "每日"))).toBeTruthy();
  await expect
    .poll(() => fileExists(join(e2eVault, "05_系统日志", "事件流", "latest.md")))
    .toBeTruthy();
});

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function hasMarkdownFile(path: string): Promise<boolean> {
  try {
    const files = await readdir(path);
    return files.some((file) => file.endsWith(".md"));
  } catch {
    return false;
  }
}
