import type { APIRoute } from "astro";
import { getJobs } from "../../../lib/content-source";

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify(await getJobs()), {
    headers: {
      "content-type": "application/json"
    }
  });
};
