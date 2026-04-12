import { expect, test } from "@playwright/test";

test("homepage renders the key sections", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "最新文章" })).toBeVisible();
  await expect(page.locator("h1").filter({ hasText: /a16z AI 周报/i })).toBeVisible();
});

test("article and topic pages render structured content", async ({ page }) => {
  await page.goto("/articles/ai-companions-and-the-next-interface");
  await expect(page.getByRole("heading", { name: /AI 伴侣与下一代交互界面/ })).toBeVisible();
  await expect(page.getByText("证据链")).toBeVisible();

  await page.goto("/topics/agent-workflows");
  await expect(page.getByRole("heading", { name: "Agent 工作流" })).toBeVisible();
  await expect(page.getByText("趋势推演")).toBeVisible();
});
