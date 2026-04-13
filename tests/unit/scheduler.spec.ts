import { beforeEach, describe, expect, it, vi } from "vitest";

const getJobs = vi.fn();
const runWeeklyIngestion = vi.fn();
const runRecoverableQueueCycle = vi.fn();

vi.mock("../../apps/api/src/lib/service", () => ({
  createContentService: () => ({
    getJobs,
    runWeeklyIngestion
  })
}));

vi.mock("../../apps/api/src/lib/article-queue", () => ({
  runRecoverableQueueCycle
}));

describe("worker scheduler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getJobs.mockResolvedValue([]);
  });

  it("runs ingestion and queue processing on the 8-hour cron", async () => {
    const entry = (await import("../../apps/api/src/index")).default;

    await entry.scheduled({ cron: "0 */8 * * *" } as ScheduledEvent, { AUTH_MODE: "test" } as never, {} as ExecutionContext);

    expect(runWeeklyIngestion).toHaveBeenCalledTimes(1);
    expect(runRecoverableQueueCycle).toHaveBeenCalledWith(
      { AUTH_MODE: "test" },
      expect.objectContaining({
        jobType: "article-processing-scheduled-ingestion"
      })
    );
  });

  it("runs only queue processing on the 10-minute cron", async () => {
    const entry = (await import("../../apps/api/src/index")).default;

    await entry.scheduled({ cron: "*/10 * * * *" } as ScheduledEvent, { AUTH_MODE: "test" } as never, {} as ExecutionContext);

    expect(runWeeklyIngestion).not.toHaveBeenCalled();
    expect(runRecoverableQueueCycle).toHaveBeenCalledWith(
      { AUTH_MODE: "test" },
      expect.objectContaining({
        jobType: "article-processing-cron"
      })
    );
  });
});
