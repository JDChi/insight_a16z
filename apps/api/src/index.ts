import { Hono } from "hono";

import { runRecoverableQueueCycle } from "./lib/article-queue";
import type { Env } from "./lib/env";
import { getIngestionStatus } from "./lib/ingestion-jobs";
import { createContentService } from "./lib/service";
import { internalRoutes } from "./routes/internal";
import { publicRoutes } from "./routes/public";

const INGESTION_CRON = "0 */8 * * *";
const PROCESSING_CRON = "*/10 * * * *";

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
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    if (event.cron === INGESTION_CRON) {
      const ingestionStatus = await getIngestionStatus(env);
      if (!ingestionStatus.running) {
        const service = createContentService(env);
        await service.runWeeklyIngestion();
      }
    }

    await runRecoverableQueueCycle(env, {
      batchSize: 3,
      rebuildTopics: true,
      rebuildDigest: true,
      jobType: event.cron === INGESTION_CRON ? "article-processing-scheduled-ingestion" : "article-processing-cron"
    });
  }
};
