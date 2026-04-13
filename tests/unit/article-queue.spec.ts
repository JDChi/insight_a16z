import type { IngestionJob } from "@insight-a16z/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const processPendingArticles = vi.fn();
const getJobs = vi.fn();

vi.mock("../../apps/api/src/lib/service", () => ({
  createContentService: () => ({
    getJobs,
    processPendingArticles
  })
}));

describe("article queue", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { resetArticleQueueState } = await import("../../apps/api/src/lib/article-queue");
    resetArticleQueueState();
  });

  it("detects only fresh running queue jobs as active", async () => {
    const { findActiveQueueJob } = await import("../../apps/api/src/lib/article-queue");
    const referenceDate = new Date("2026-04-13T08:10:00.000Z");
    const jobs: IngestionJob[] = [
      {
        id: "old-job",
        jobType: "article-processing-cron",
        status: "running",
        startedAt: "2026-04-13T07:40:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      },
      {
        id: "fresh-job",
        jobType: "article-processing-cron",
        status: "running",
        startedAt: "2026-04-13T08:05:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      }
    ];

    const active = findActiveQueueJob(jobs, referenceDate);

    expect(active?.id).toBe("fresh-job");
  });

  it("treats old running queue jobs as stale", async () => {
    const { findStaleQueueJobs } = await import("../../apps/api/src/lib/article-queue");
    const referenceDate = new Date("2026-04-13T08:10:00.000Z");
    const jobs: IngestionJob[] = [
      {
        id: "old-job",
        jobType: "article-processing-cron",
        status: "running",
        startedAt: "2026-04-13T07:40:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      },
      {
        id: "fresh-job",
        jobType: "article-processing-cron",
        status: "running",
        startedAt: "2026-04-13T08:05:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      }
    ];

    expect(findStaleQueueJobs(jobs, referenceDate).map((job) => job.id)).toEqual(["old-job"]);
  });

  it("runs one recoverable batch with the cron defaults", async () => {
    getJobs.mockResolvedValue([]);
    processPendingArticles.mockResolvedValue({
      jobId: "job-1",
      processed: 2,
      published: 1,
      failed: 0,
      deferred: 1
    });

    const { runRecoverableQueueCycle } = await import("../../apps/api/src/lib/article-queue");
    const result = await runRecoverableQueueCycle({ AUTH_MODE: "test" } as never);

    expect(result).toMatchObject({
      started: true,
      running: false,
      result: { processed: 2, published: 1, deferred: 1 }
    });
    expect(processPendingArticles).toHaveBeenCalledWith({
      limit: 3,
      rebuildTopics: true,
      rebuildDigest: true,
      includeFailed: false,
      jobType: "article-processing-cron"
    });
  });
});
