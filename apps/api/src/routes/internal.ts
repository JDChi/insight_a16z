import { Hono } from "hono";

import type { Env } from "../lib/env";
import { requireBootstrapAccess } from "../lib/auth";
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
