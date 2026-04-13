import type { Context, MiddlewareHandler } from "hono";

import type { Env } from "./env";

export interface AdminIdentity {
  email: string;
  name: string | null;
  groups: string[];
}

function parseAllowlist(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function getAdminIdentity(c: Context<{ Bindings: Env }>): AdminIdentity | null {
  const authMode = c.env.AUTH_MODE ?? "test";

  if (authMode === "test") {
    return {
      email: c.req.header("x-test-admin-email") ?? c.env.TEST_ADMIN_EMAIL ?? "admin@local.test",
      name: "Local Admin",
      groups: ["admins"]
    };
  }

  const email = c.req.header("cf-access-authenticated-user-email");
  if (!email) return null;

  return {
    email,
    name: c.req.header("cf-access-authenticated-user-name") ?? null,
    groups:
      c.req
        .header("cf-access-authenticated-user-groups")
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? []
  };
}

export function requireAdmin(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const identity = getAdminIdentity(c);
    if (!identity) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const allowedEmails = parseAllowlist(c.env.ADMIN_EMAILS);
    if (allowedEmails.length > 0 && !allowedEmails.includes(identity.email)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}

export function requireBootstrapAccess(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const token = c.req.header("x-admin-token");
    if (token && c.env.ADMIN_TRIGGER_TOKEN && token === c.env.ADMIN_TRIGGER_TOKEN) {
      await next();
      return;
    }

    const identity = getAdminIdentity(c);
    if (!identity) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const allowedEmails = parseAllowlist(c.env.ADMIN_EMAILS);
    if (allowedEmails.length > 0 && !allowedEmails.includes(identity.email)) {
      return c.json({ error: "Forbidden" }, 403);
    }

    await next();
  };
}
