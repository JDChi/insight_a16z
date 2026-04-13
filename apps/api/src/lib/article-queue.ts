import type { IngestionJob } from "@insight-a16z/core";

import type { Env } from "./env";
import { createContentService } from "./service";

const ACTIVE_QUEUE_JOB_WINDOW_MS = 15 * 60 * 1000;

type QueueCycleOptions = {
  batchSize?: number;
  rebuildTopics?: boolean;
  rebuildDigest?: boolean;
  jobType?: string;
};

type QueueStatus = {
  running: boolean;
  activeJobId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

function isQueueJob(job: IngestionJob) {
  return job.jobType.startsWith("article-processing");
}

export function findActiveQueueJob(jobs: IngestionJob[], referenceDate = new Date()): IngestionJob | null {
  const now = referenceDate.getTime();

  return (
    jobs.find((job) => {
      if (!isQueueJob(job) || job.status !== "running") return false;
      const startedAt = new Date(job.startedAt).getTime();
      if (Number.isNaN(startedAt)) return false;
      return now - startedAt <= ACTIVE_QUEUE_JOB_WINDOW_MS;
    }) ?? null
  );
}

export function findStaleQueueJobs(jobs: IngestionJob[], referenceDate = new Date()): IngestionJob[] {
  const now = referenceDate.getTime();

  return jobs.filter((job) => {
    if (!isQueueJob(job) || job.status !== "running") return false;
    const startedAt = new Date(job.startedAt).getTime();
    if (Number.isNaN(startedAt)) return false;
    return now - startedAt > ACTIVE_QUEUE_JOB_WINDOW_MS;
  });
}

function findLatestQueueFailure(jobs: IngestionJob[]): IngestionJob | null {
  return jobs.find((job) => isQueueJob(job) && job.status === "failed") ?? null;
}

export async function getArticleQueueStatus(env: Env): Promise<QueueStatus> {
  const service = createContentService(env);
  const jobs = await service.getJobs();
  const active = findActiveQueueJob(jobs);
  const lastFailure = findLatestQueueFailure(jobs);

  return {
    running: Boolean(active),
    activeJobId: active?.id ?? null,
    startedAt: active?.startedAt ?? null,
    finishedAt: active?.endedAt ?? null,
    lastError: active?.errorMessage ?? lastFailure?.errorMessage ?? null
  };
}

export function resetArticleQueueState() {
  // No-op now that queue coordination is persisted via ingestion_jobs.
}

export async function runRecoverableQueueCycle(env: Env, options?: QueueCycleOptions) {
  const service = createContentService(env);
  const jobs = await service.getJobs();
  const active = findActiveQueueJob(jobs);

  if (active) {
    return {
      started: false,
      running: true,
      activeJobId: active.id,
      result: null
    };
  }

  const result = await service.processPendingArticles({
    limit: Math.max(1, options?.batchSize ?? 3),
    rebuildTopics: options?.rebuildTopics ?? true,
    rebuildDigest: options?.rebuildDigest ?? true,
    includeFailed: false,
    jobType: options?.jobType ?? "article-processing-cron"
  });

  return {
    started: true,
    running: false,
    activeJobId: null,
    result
  };
}
