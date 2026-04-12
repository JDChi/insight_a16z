import { resetArticleQueueState } from "../../apps/api/src/lib/article-queue";
import { createContentService } from "../../apps/api/src/lib/service";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

describe("content workflow", () => {
  beforeEach(() => {
    resetMemoryStores();
    resetArticleQueueState();
  });

  it("publishes articles immediately after analysis", async () => {
    const service = createContentService({ AUTH_MODE: "test" });
    await service.seedFixtures();

    const articles = await service.listAllArticles();
    const target = articles[0];
    await service.setEntityState("article", target.id, "ingested", "admin@local.test");

    const updated = await service.analyzeArticle(target.id);

    expect(updated.reviewState).toBe("published");
  });

  it("processes queued ingested articles and republishes them", async () => {
    const service = createContentService({ AUTH_MODE: "test" });
    await service.seedFixtures();

    const articles = await service.listAllArticles();
    const target = articles[0];
    await service.setEntityState("article", target.id, "ingested", "admin@local.test");

    const result = await service.processPendingArticles({ limit: 1 });
    const updated = await service.getArticle(target.slug);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(updated?.reviewState).toBe("published");
  });

  it("rebuilds topics and weekly digests from analyzed articles", async () => {
    const service = createContentService({ AUTH_MODE: "test" });
    await service.seedFixtures();

    const topics = await service.rebuildAllTopics();
    const digest = await service.generateWeeklyDigest(new Date("2026-04-06T00:00:00.000Z"));

    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((topic) => topic.reviewState === "published")).toBe(true);
    expect(digest.topSignals.length).toBeGreaterThan(0);
    expect(digest.trendPredictions.length).toBeGreaterThan(0);
    expect(digest.reviewState).toBe("published");
  });
});
