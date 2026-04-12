import { createContentService } from "../../apps/api/src/lib/service";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

describe("content workflow", () => {
  beforeEach(() => {
    resetMemoryStores();
  });

  it("rebuilds topics and weekly digests from analyzed articles", async () => {
    const service = createContentService({ AUTH_MODE: "test" });
    await service.seedFixtures();

    const topics = await service.rebuildAllTopics();
    const digest = await service.generateWeeklyDigest(new Date("2026-04-06T00:00:00.000Z"));

    expect(topics.length).toBeGreaterThan(0);
    expect(digest.topSignals.length).toBeGreaterThan(0);
    expect(digest.trendPredictions.length).toBeGreaterThan(0);
  });
});
