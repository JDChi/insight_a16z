import { expect, test } from "@playwright/test";

test("admin pages block anonymous access", async ({ page }) => {
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "后台访问受限" })).toBeVisible();
});

test("admin pages allow access with test admin header", async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: {
      "x-test-admin-email": "admin@local.test"
    }
  });
  const page = await context.newPage();

  await page.goto("/admin/articles");
  await expect(page.getByRole("heading", { name: "文章队列" })).toBeVisible();
  await expect(page.getByText("为什么我们押注 Agent 工作流")).toBeVisible();

  await context.close();
});
