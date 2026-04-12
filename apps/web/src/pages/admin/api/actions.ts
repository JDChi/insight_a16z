import type { APIRoute } from "astro";

import { buildAdminHeaders } from "../../../lib/content-source";

const apiBase = import.meta.env.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";
const mode = import.meta.env.PUBLIC_DATA_MODE ?? "fixtures";

export const POST: APIRoute = async ({ request, redirect }) => {
  const data = await request.formData();
  const kind = String(data.get("kind") ?? "");
  const entityType = String(data.get("entityType") ?? "");
  const entityId = String(data.get("entityId") ?? "");

  if (mode === "api") {
    let path = "";
    let method: "POST" = "POST";
    let body: string | undefined;

    if (kind === "approve") {
      path = `/internal/review/${entityType}/${entityId}/approve`;
    } else if (kind === "publish") {
      path = `/internal/publish/${entityType}/${entityId}`;
    } else if (kind === "ingest-live") {
      path = "/internal/ingestion/run";
      body = JSON.stringify({
        limit: 6,
        autoPublish: true,
        rebuildTopics: true,
        rebuildDigest: true,
        resetBeforeImport: true
      });
    } else if (kind === "rebuild-topics") {
      path = "/internal/analysis/topics";
    } else if (kind === "rebuild-digest") {
      path = "/internal/analysis/digests/run";
    }

    if (path) {
      await fetch(`${apiBase}${path}`, {
        method,
        headers: {
          ...buildAdminHeaders(),
          ...(body ? { "content-type": "application/json" } : {})
        },
        body
      });
    }
  }

  return redirect(request.headers.get("referer") ?? "/admin", 303);
};
