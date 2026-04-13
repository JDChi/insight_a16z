import { Hono } from "hono";

import { getArticleQueueStatus, runRecoverableQueueCycle } from "../lib/article-queue";
import type { Env } from "../lib/env";
import { getAdminIdentity, requireAdmin, requireBootstrapAccess } from "../lib/auth";
import { getIngestionStatus } from "../lib/ingestion-jobs";
import { createContentService } from "../lib/service";

export const internalRoutes = new Hono<{ Bindings: Env }>();

internalRoutes.post("/bootstrap", requireBootstrapAccess(), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const ingestionStatus = await getIngestionStatus(c.env);
  if (ingestionStatus.running) {
    return c.json(
      {
        accepted: false,
        reason: "ingestion-already-running",
        activeJobId: ingestionStatus.activeJobId
      },
      202
    );
  }

  const task = (async () => {
    const service = createContentService(c.env);
    return service.runWeeklyIngestion({
      limit: typeof body.ingestionLimit === "number" ? body.ingestionLimit : undefined,
      rebuildTopics: false,
      rebuildDigest: false,
      resetBeforeImport: false
    });
  })();

  let executionCtx: ExecutionContext | null = null;
  try {
    executionCtx = c.executionCtx;
  } catch {
    executionCtx = null;
  }

  if (executionCtx) {
    executionCtx.waitUntil(task);
    return c.json(
      {
        accepted: true,
        mode: "async",
        ingestionLimit: typeof body.ingestionLimit === "number" ? body.ingestionLimit : 300
      },
      202
    );
  }

  return c.json({ ingestion: await task }, 200);
});

internalRoutes.use("*", requireAdmin());

internalRoutes.get("/auth/me", async (c) => {
  return c.json({
    identity: getAdminIdentity(c)
  });
});

internalRoutes.get("/overview", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.getAdminOverview());
});

internalRoutes.get("/jobs", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.getJobs());
});

internalRoutes.get("/articles", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.listAllArticles());
});

internalRoutes.get("/topics", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.listTopics());
});

internalRoutes.get("/digests", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.listDigests());
});

internalRoutes.get("/review-states", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.getReviewStates());
});

internalRoutes.get("/analysis/articles/status", async (c) => {
  return c.json(await getArticleQueueStatus(c.env));
});

internalRoutes.post("/ingestion/run", async (c) => {
  const ingestionStatus = await getIngestionStatus(c.env);
  if (ingestionStatus.running) {
    return c.json(
      {
        accepted: false,
        reason: "ingestion-already-running",
        activeJobId: ingestionStatus.activeJobId
      },
      202
    );
  }

  const service = createContentService(c.env);
  const body = await c.req.json().catch(() => ({}));
  const ingestion = await service.runWeeklyIngestion({
    limit: typeof body.limit === "number" ? body.limit : undefined,
    rebuildTopics: false,
    rebuildDigest: false,
    resetBeforeImport: body.resetBeforeImport === true
  });
  return c.json(ingestion);
});

internalRoutes.post("/reset", async (c) => {
  const service = createContentService(c.env);
  await service.clearAllContent();
  return c.json({ ok: true });
});

internalRoutes.post("/analysis/articles/process", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const queue = await runRecoverableQueueCycle(c.env, {
    batchSize: typeof body.limit === "number" ? body.limit : undefined,
    rebuildTopics: body.rebuildTopics !== false,
    rebuildDigest: body.rebuildDigest !== false
  });
  return c.json(queue, queue.started ? 200 : 202);
});

internalRoutes.post("/analysis/articles/:id", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.analyzeArticle(c.req.param("id")));
});

internalRoutes.post("/analysis/topics/:id", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.rebuildTopic(c.req.param("id")));
});

internalRoutes.post("/analysis/topics", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.rebuildAllTopics());
});

internalRoutes.post("/analysis/digests/run", async (c) => {
  const service = createContentService(c.env);
  return c.json(await service.generateWeeklyDigest());
});

internalRoutes.post("/review/:entityType/:id/approve", async (c) => {
  const service = createContentService(c.env);
  const identity = getAdminIdentity(c);
  return c.json(await service.approve(c.req.param("entityType") as "article" | "topic" | "digest", c.req.param("id"), identity?.email ?? null));
});

internalRoutes.post("/review/:entityType/:id/reject", async (c) => {
  const service = createContentService(c.env);
  const identity = getAdminIdentity(c);
  return c.json(await service.reject(c.req.param("entityType") as "article" | "topic" | "digest", c.req.param("id"), identity?.email ?? null));
});

internalRoutes.post("/publish/:entityType/:id", async (c) => {
  const service = createContentService(c.env);
  const identity = getAdminIdentity(c);
  return c.json(await service.publish(c.req.param("entityType") as "article" | "topic" | "digest", c.req.param("id"), identity?.email ?? null));
});

internalRoutes.post("/state/:entityType/:id/:state", async (c) => {
  const service = createContentService(c.env);
  const identity = getAdminIdentity(c);
  return c.json(
    await service.setEntityState(
      c.req.param("entityType") as "article" | "topic" | "digest",
      c.req.param("id"),
      c.req.param("state") as "ingested" | "processing" | "published" | "failed",
      identity?.email ?? null
    )
  );
});
