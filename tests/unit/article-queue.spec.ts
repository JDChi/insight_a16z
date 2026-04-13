import { beforeEach, describe, expect, it, vi } from "vitest";

const processPendingArticles = vi.fn();
const rebuildAllTopics = vi.fn();
const generateWeeklyDigest = vi.fn();

vi.mock("../../apps/api/src/lib/service", () => ({
  createContentService: () => ({
    processPendingArticles,
    rebuildAllTopics,
    generateWeeklyDigest
  })
}));

describe("article queue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetArticleQueueState } = await import("../../apps/api/src/lib/article-queue");
    resetArticleQueueState();
  });

  it("uses a multi-article batch by default so one deferred article does not stall the queue", async () => {
    processPendingArticles.mockResolvedValueOnce({
      jobId: "job-1",
      processed: 1,
      published: 1,
      failed: 0,
      deferred: 1
    });
    processPendingArticles.mockResolvedValueOnce({
      jobId: "job-2",
      processed: 0,
      published: 0,
      failed: 0,
      deferred: 1
    });

    const { startArticleQueue } = await import("../../apps/api/src/lib/article-queue");
    const queue = startArticleQueue({ AUTH_MODE: "test" } as never);
    await queue.promise;

    expect(processPendingArticles).toHaveBeenCalled();
    expect(processPendingArticles.mock.calls[0]?.[0]).toMatchObject({
      limit: 3,
      includeFailed: false
    });
  });
});
