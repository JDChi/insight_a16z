import { createApp } from "../../apps/api/src/index";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

describe("public API", () => {
  beforeEach(() => {
    resetMemoryStores();
  });

  it("returns published articles only", async () => {
    const app = createApp();
    const response = await app.request("/api/articles", {}, { AUTH_MODE: "test" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.every((item: { reviewState: string }) => item.reviewState === "published")).toBe(true);
  });

  it("returns a published article detail", async () => {
    const app = createApp();
    const response = await app.request("/api/articles/ai-companions-and-the-next-interface", {}, { AUTH_MODE: "test" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.zhTitle).toContain("AI 伴侣");
    expect(json.evidenceLinks.length).toBeGreaterThan(0);
  });

  it("does not seed fixture content when explicitly disabled", async () => {
    const app = createApp();
    const response = await app.request("/api/articles", {}, { AUTH_MODE: "test", SEED_FIXTURES: "false" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual([]);
  });
});
