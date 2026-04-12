import { Hono } from "hono";

import type { Env } from "./lib/env";
import { createContentService } from "./lib/service";
import { internalRoutes } from "./routes/internal";
import { publicRoutes } from "./routes/public";

export function createApp() {
  const app = new Hono<{ Bindings: Env }>();

  app.use("*", async (c, next) => {
    const service = createContentService(c.env);
    if (c.env.SEED_FIXTURES !== "false") {
      await service.seedFixtures();
    }
    await next();
  });

  app.get("/", (c) =>
    c.json({
      name: "insight-a16z-api",
      status: "ok"
    })
  );

  app.get("/health", async (c) => {
    const service = createContentService(c.env);
    if (c.env.SEED_FIXTURES !== "false") {
      await service.seedFixtures();
    }
    return c.json({ status: "ok" });
  });

  app.route("/api", publicRoutes);
  app.route("/internal", internalRoutes);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    const service = createContentService(env);
    await service.runWeeklyIngestion();
    await service.rebuildAllTopics();
    await service.generateWeeklyDigest();
  }
};
