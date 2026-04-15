import type { MiddlewareHandler } from "hono";

import type { Env } from "./env";

export function requireBootstrapAccess(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const token = c.req.header("x-admin-token");
    if (!token || !c.env.ADMIN_TRIGGER_TOKEN || token !== c.env.ADMIN_TRIGGER_TOKEN) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    await next();
  };
}
