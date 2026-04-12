import type { Env } from "../../apps/api/src/lib/env";
import { resolveAiProviderConfig } from "../../apps/api/src/lib/analysis";

describe("resolveAiProviderConfig", () => {
  it("prefers generic AI_* env values for OpenAI-compatible providers", () => {
    const config = resolveAiProviderConfig({
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://example.com/v1",
      AI_MODEL: "custom-model",
      OPENAI_API_KEY: "legacy-key",
      OPENAI_MODEL: "legacy-model"
    } satisfies Partial<Env> as Env);

    expect(config).toEqual({
      apiKey: "test-key",
      baseURL: "https://example.com/v1",
      modelName: "custom-model",
      compatMode: "openai"
    });
  });

  it("falls back to legacy OPENAI_* env values", () => {
    const config = resolveAiProviderConfig({
      OPENAI_API_KEY: "legacy-key",
      OPENAI_MODEL: "legacy-model"
    } satisfies Partial<Env> as Env);

    expect(config).toEqual({
      apiKey: "legacy-key",
      baseURL: undefined,
      modelName: "legacy-model",
      compatMode: "anthropic"
    });
  });

  it("detects anthropic compatibility mode from base URL", () => {
    const config = resolveAiProviderConfig({
      AI_API_KEY: "test-key",
      AI_BASE_URL: "https://api.minimax.io/anthropic/v1",
      AI_MODEL: "custom-model"
    } satisfies Partial<Env> as Env);

    expect(config).toEqual({
      apiKey: "test-key",
      baseURL: "https://api.minimax.io/anthropic/v1",
      modelName: "custom-model",
      compatMode: "anthropic"
    });
  });

  it("returns null when no model credentials are configured", () => {
    expect(resolveAiProviderConfig({} as Env)).toBeNull();
  });
});
