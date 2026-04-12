import { createApp } from "../../apps/api/src/index";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

const adminEnv = {
  AUTH_MODE: "cloudflare-access" as const,
  ADMIN_EMAILS: "admin@local.test"
};

describe("admin API", () => {
  beforeEach(() => {
    resetMemoryStores();
  });

  it("blocks internal routes without admin identity", async () => {
    const app = createApp();
    const response = await app.request("/internal/articles", {}, adminEnv);

    expect(response.status).toBe(401);
  });

  it("publishes article immediately after analysis completes", async () => {
    const app = createApp();
    const headers = {
      "cf-access-authenticated-user-email": "admin@local.test"
    };

    const listBefore = await app.request("/internal/articles", { headers }, adminEnv);
    const articles = await listBefore.json();
    const target = articles.find((item: { reviewState: string }) => item.reviewState === "published");

    expect(target).toBeTruthy();

    const rejectResponse = await app.request(`/internal/review/article/${target.id}/reject`, { method: "POST", headers }, adminEnv);
    expect(rejectResponse.status).toBe(200);

    const analysisResponse = await app.request(`/internal/analysis/articles/${target.id}`, { method: "POST", headers }, adminEnv);
    expect(analysisResponse.status).toBe(200);

    const listAfter = await app.request("/internal/articles", { headers }, adminEnv);
    const updatedArticles = await listAfter.json();
    const updated = updatedArticles.find((item: { id: string }) => item.id === target.id);

    expect(updated.reviewState).toBe("published");
  });
});
