import type { APIRoute } from "astro";
import { getAdminEmail } from "../../../lib/admin-auth";

export const GET: APIRoute = async ({ request }) => {
  return new Response(
    JSON.stringify({
      email: getAdminEmail(request.headers)
    }),
    {
      headers: {
        "content-type": "application/json"
      }
    }
  );
};
