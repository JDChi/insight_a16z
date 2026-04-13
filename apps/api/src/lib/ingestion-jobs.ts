import type { IngestionJob } from "@insight-a16z/core";

import type { Env } from "./env";
import { createContentService } from "./service";

const ACTIVE_INGESTION_JOB_WINDOW_MS = 2 * 60 * 60 * 1000;

type IngestionStatus = {
  running: boolean;
  activeJobId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

function isIngestionJob(job: IngestionJob) {
  return job.jobType.includes("ingestion");
}

function findLatestIngestionFailure(jobs: IngestionJob[]): IngestionJob | null {
  return jobs.find((job) => isIngestionJob(job) && job.status === "failed") ?? null;
}

export function findActiveIngestionJob(jobs: IngestionJob[], referenceDate = new Date()): IngestionJob | null {
  const now = referenceDate.getTime();

  return (
    jobs.find((job) => {
      if (!isIngestionJob(job) || job.status !== "running") return false;
      const startedAt = new Date(job.startedAt).getTime();
      if (Number.isNaN(startedAt)) return false;
      return now - startedAt <= ACTIVE_INGESTION_JOB_WINDOW_MS;
    }) ?? null
  );
}

export function findStaleIngestionJobs(jobs: IngestionJob[], referenceDate = new Date()): IngestionJob[] {
  const now = referenceDate.getTime();

  return jobs.filter((job) => {
    if (!isIngestionJob(job) || job.status !== "running") return false;
    const startedAt = new Date(job.startedAt).getTime();
    if (Number.isNaN(startedAt)) return false;
    return now - startedAt > ACTIVE_INGESTION_JOB_WINDOW_MS;
  });
}

export async function getIngestionStatus(env: Env): Promise<IngestionStatus> {
  const service = createContentService(env);
  const jobs = await service.getJobs();
  const active = findActiveIngestionJob(jobs);
  const lastFailure = findLatestIngestionFailure(jobs);

  return {
    running: Boolean(active),
    activeJobId: active?.id ?? null,
    startedAt: active?.startedAt ?? null,
    finishedAt: active?.endedAt ?? null,
    lastError: active?.errorMessage ?? lastFailure?.errorMessage ?? null
  };
}
