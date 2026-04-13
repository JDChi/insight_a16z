import { expect, test } from "@playwright/test";

test("homepage renders the key sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "最新文章" })).toBeVisible();
  await expect(page.locator("h1").filter({ hasText: /a16z AI 周报/i })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("Weekly Signals");
  await expect(page.locator("body")).not.toContainText("Investment News");
  await expect(page.getByText("本周最重要洞察")).toBeVisible();
  await expect(page.getByText("最新投资动态")).toBeVisible();
});

test("article and topic pages render structured content", async ({ page }) => {
  await page.goto("/articles/ai-companions-and-the-next-interface");
  await expect(page.getByRole("heading", { name: /AI 伴侣与下一代交互界面/ })).toBeVisible();
  await expect(page.getByText("证据链")).toBeVisible();
  await expect(page.getByText("未来推演")).toBeVisible();

  await page.goto("/topics/agent-workflows");
  await expect(page.getByRole("heading", { name: "Agent 工作流" })).toBeVisible();
  await expect(page.getByText("趋势推演")).toBeVisible();
});

test("admin list no longer shows manual approve actions", async ({ page }) => {
  await page.goto("/admin/articles");

  await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
});
