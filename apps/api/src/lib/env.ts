export interface Env {
  DB?: D1Database;
  CONTENT_BUCKET?: R2Bucket;
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  ADMIN_EMAILS?: string;
  AUTH_MODE?: "cloudflare-access" | "test";
  TEST_ADMIN_EMAIL?: string;
  PUBLIC_SITE_URL?: string;
}
