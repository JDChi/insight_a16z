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

  it("allows admin review and publish flow", async () => {
    const app = createApp();
    const headers = {
      "cf-access-authenticated-user-email": "admin@local.test"
    };

    const listBefore = await app.request("/internal/articles", { headers }, adminEnv);
    const articles = await listBefore.json();
    const target = articles.find((item: { reviewState: string }) => item.reviewState !== "published");

    expect(target).toBeTruthy();

    const approveResponse = await app.request(`/internal/review/article/${target.id}/approve`, { method: "POST", headers }, adminEnv);
    expect(approveResponse.status).toBe(200);

    const publishResponse = await app.request(`/internal/publish/article/${target.id}`, { method: "POST", headers }, adminEnv);
    expect(publishResponse.status).toBe(200);

    const listAfter = await app.request("/internal/articles", { headers }, adminEnv);
    const updatedArticles = await listAfter.json();
    const updated = updatedArticles.find((item: { id: string }) => item.id === target.id);

    expect(updated.reviewState).toBe("published");
  });
});
