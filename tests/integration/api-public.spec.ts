import apiEntry, { createApp } from "../../apps/api/src/index";
import { resetArticleQueueState } from "../../apps/api/src/lib/article-queue";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

describe("public API", () => {
  beforeEach(() => {
    resetMemoryStores();
    resetArticleQueueState();
  });

  it("returns published articles only", async () => {
    const app = createApp();
    const response = await app.request("/api/articles", {}, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.every((item: { reviewState: string }) => item.reviewState === "published")).toBe(true);
  });

  it("returns a published article detail", async () => {
    const app = createApp();
    const response = await app.request("/api/articles/ai-companions-and-the-next-interface", {}, {});
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.zhTitle).toContain("AI 伴侣");
    expect(json.evidenceLinks.length).toBeGreaterThan(0);
  });

  it("does not seed fixture content when explicitly disabled", async () => {
    const app = createApp();
    const response = await app.request("/api/articles", {}, { SEED_FIXTURES: "false" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual([]);
  });

  it("does not bootstrap ingestion from public GET requests", async () => {
    const waitUntil = vi.fn();

    const response = await apiEntry.fetch(
      new Request("https://example.com/"),
      { SEED_FIXTURES: "false" },
      { waitUntil } as unknown as ExecutionContext
    );

    expect(response.status).toBe(200);
    expect(waitUntil).not.toHaveBeenCalled();
  });
});
