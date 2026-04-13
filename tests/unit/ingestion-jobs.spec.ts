import type { IngestionJob } from "@insight-a16z/core";

import { describe, expect, it } from "vitest";

import { findActiveIngestionJob } from "../../apps/api/src/lib/ingestion-jobs";

describe("ingestion jobs", () => {
  it("detects only fresh running ingestion jobs as active", () => {
    const referenceDate = new Date("2026-04-13T08:10:00.000Z");
    const jobs: IngestionJob[] = [
      {
        id: "old-ingestion",
        jobType: "weekly-ingestion",
        status: "running",
        startedAt: "2026-04-13T04:00:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      },
      {
        id: "fresh-ingestion",
        jobType: "weekly-ingestion",
        status: "running",
        startedAt: "2026-04-13T07:55:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      },
      {
        id: "queue-job",
        jobType: "article-processing-cron",
        status: "running",
        startedAt: "2026-04-13T08:05:00.000Z",
        endedAt: null,
        errorMessage: null,
        stats: {}
      }
    ];

    const active = findActiveIngestionJob(jobs, referenceDate);

    expect(active?.id).toBe("fresh-ingestion");
  });
});
