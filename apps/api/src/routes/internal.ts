import { Hono } from "hono";

import type { Env } from "../lib/env";
import { getAdminIdentity, requireAdmin } from "../lib/auth";
import { createContentService } from "../lib/service";

export const internalRoutes = new Hono<{ Bindings: Env }>();

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

internalRoutes.post("/ingestion/run", async (c) => {
  const service = createContentService(c.env);
  const body = await c.req.json().catch(() => ({}));
  return c.json(
    await service.runWeeklyIngestion({
      limit: typeof body.limit === "number" ? body.limit : undefined,
      autoPublish: body.autoPublish === true,
      rebuildTopics: body.rebuildTopics === true,
      rebuildDigest: body.rebuildDigest === true,
      resetBeforeImport: body.resetBeforeImport === true
    })
  );
});

internalRoutes.post("/reset", async (c) => {
  const service = createContentService(c.env);
  await service.clearAllContent();
  return c.json({ ok: true });
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
