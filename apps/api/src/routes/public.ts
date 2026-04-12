import { Hono } from "hono";

import type { Env } from "../lib/env";
import { createContentService } from "../lib/service";

export const publicRoutes = new Hono<{ Bindings: Env }>();

publicRoutes.get("/articles", async (c) => {
  const service = createContentService(c.env);
  const items = await service.listPublishedArticles();
  return c.json(items);
});

publicRoutes.get("/articles/:slug", async (c) => {
  const service = createContentService(c.env);
  const article = await service.getArticle(c.req.param("slug"));
  if (!article || article.reviewState !== "published") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(article);
});

publicRoutes.get("/topics", async (c) => {
  const service = createContentService(c.env);
  const items = (await service.listTopics()).filter((topic) => topic.reviewState === "published");
  return c.json(items);
});

publicRoutes.get("/topics/:slug", async (c) => {
  const service = createContentService(c.env);
  const topic = await service.getTopic(c.req.param("slug"));
  if (!topic || topic.reviewState !== "published") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(topic);
});

publicRoutes.get("/digests", async (c) => {
  const service = createContentService(c.env);
  const items = (await service.listDigests()).filter((digest) => digest.reviewState === "published");
  return c.json(items);
});

publicRoutes.get("/digests/:slug", async (c) => {
  const service = createContentService(c.env);
  const digest = await service.getDigest(c.req.param("slug"));
  if (!digest || digest.reviewState !== "published") {
    return c.json({ error: "Not found" }, 404);
  }

  return c.json(digest);
});
