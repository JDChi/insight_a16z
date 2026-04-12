import type { Env } from "./env";
import { createContentService } from "./service";

type QueueOptions = {
  batchSize?: number;
  rebuildTopics?: boolean;
  rebuildDigest?: boolean;
  maxBatches?: number;
};

type QueueState = {
  running: boolean;
  startedAt: string | null;
  finishedAt: string | null;
  lastError: string | null;
};

const queueState: QueueState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastError: null
};

let activeRun: Promise<void> | null = null;

export function getArticleQueueState(): QueueState {
  return { ...queueState };
}

export function resetArticleQueueState() {
  queueState.running = false;
  queueState.startedAt = null;
  queueState.finishedAt = null;
  queueState.lastError = null;
  activeRun = null;
}

export function startArticleQueue(env: Env, options?: QueueOptions) {
  if (activeRun) {
    return {
      started: false,
      running: true,
      state: getArticleQueueState(),
      promise: activeRun
    };
  }

  queueState.running = true;
  queueState.startedAt = new Date().toISOString();
  queueState.finishedAt = null;
  queueState.lastError = null;

  activeRun = (async () => {
    const service = createContentService(env);
    const batchSize = Math.max(1, options?.batchSize ?? 1);
    const maxBatches = Math.max(1, options?.maxBatches ?? 100);
    let batches = 0;
    let published = 0;

    while (batches < maxBatches) {
      const result = await service.processPendingArticles({
        limit: batchSize,
        rebuildTopics: false,
        rebuildDigest: false,
        includeFailed: false
      });
      batches += 1;
      published += result.published;

      if (result.processed === 0) {
        break;
      }
    }

    if ((options?.rebuildTopics ?? true) && published > 0) {
      await service.rebuildAllTopics();
    }

    if ((options?.rebuildDigest ?? true) && published > 0) {
      await service.generateWeeklyDigest();
    }
  })()
    .catch((error) => {
      queueState.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    })
    .finally(() => {
      queueState.running = false;
      queueState.finishedAt = new Date().toISOString();
      activeRun = null;
    });

  return {
    started: true,
    running: true,
    state: getArticleQueueState(),
    promise: activeRun
  };
}
