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
    const path =
      kind === "approve"
        ? `/internal/review/${entityType}/${entityId}/approve`
        : `/internal/publish/${entityType}/${entityId}`;

    await fetch(`${apiBase}${path}`, {
      method: "POST",
      headers: buildAdminHeaders()
    });
  }

  return redirect(request.headers.get("referer") ?? "/admin", 303);
};
