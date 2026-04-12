export interface Env {
  DB?: D1Database;
  CONTENT_BUCKET?: R2Bucket;
  AI_API_KEY?: string;
  AI_BASE_URL?: string;
  AI_MODEL?: string;
  AI_COMPAT_MODE?: "anthropic" | "openai";
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
  SEED_FIXTURES?: string;
  AUTO_PUBLISH_IMPORTED?: string;
  ADMIN_EMAILS?: string;
  AUTH_MODE?: "cloudflare-access" | "test";
  TEST_ADMIN_EMAIL?: string;
  PUBLIC_SITE_URL?: string;
}
