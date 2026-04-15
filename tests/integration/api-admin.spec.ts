import { createApp } from "../../apps/api/src/index";
import { ContentService } from "../../apps/api/src/lib/service";
import { resetArticleQueueState } from "../../apps/api/src/lib/article-queue";
import { resetMemoryStores } from "../../apps/api/src/lib/db";
import * as ingestionJobs from "../../apps/api/src/lib/ingestion-jobs";

describe("internal bootstrap API", () => {
  beforeEach(() => {
    resetMemoryStores();
    resetArticleQueueState();
  });

  it("accepts bootstrap requests with the configured admin token", async () => {
    const ingestionSpy = vi
      .spyOn(ContentService.prototype, "runWeeklyIngestion")
      .mockResolvedValue({ jobId: "ingestion-job", ingested: 1, analyzed: 0, published: 0 });

    const app = createApp();
    const response = await app.request(
      "/internal/bootstrap",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "secret-token"
        },
        body: JSON.stringify({ ingestionLimit: 5 })
      },
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ingestion: { ingested: 1 }
    });
    expect(ingestionSpy).toHaveBeenCalledWith({
      limit: 5,
      rebuildTopics: false,
      rebuildDigest: false,
      resetBeforeImport: false
    });

    ingestionSpy.mockRestore();
  });

  it("runs bootstrap ingestion asynchronously when an execution context is present", async () => {
    const ingestionSpy = vi
      .spyOn(ContentService.prototype, "runWeeklyIngestion")
      .mockResolvedValue({ jobId: "ingestion-job", ingested: 12, analyzed: 0, published: 0 });

    const app = createApp();
    const waitUntil = vi.fn();
    const response = await app.fetch(
      new Request("https://example.com/internal/bootstrap", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "secret-token"
        },
        body: JSON.stringify({ ingestionLimit: 50 })
      }),
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      },
      { waitUntil } as unknown as ExecutionContext
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      accepted: true,
      mode: "async",
      ingestionLimit: 50
    });
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(ingestionSpy).toHaveBeenCalledWith({
      limit: 50,
      rebuildTopics: false,
      rebuildDigest: false,
      resetBeforeImport: false
    });

    ingestionSpy.mockRestore();
  });

  it("rejects bootstrap requests without a token", async () => {
    const app = createApp();
    const response = await app.request(
      "/internal/bootstrap",
      {
        method: "POST"
      },
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects bootstrap requests with the wrong token", async () => {
    const app = createApp();
    const response = await app.request(
      "/internal/bootstrap",
      {
        method: "POST",
        headers: {
          "x-admin-token": "wrong-token"
        }
      },
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not allow email-based headers to bypass bootstrap token auth", async () => {
    const app = createApp();
    const response = await app.request(
      "/internal/bootstrap",
      {
        method: "POST",
        headers: {
          "cf-access-authenticated-user-email": "admin@local.test",
          "x-test-admin-email": "admin@local.test"
        }
      },
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      }
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("skips bootstrap when an ingestion job is already active", async () => {
    const activeSpy = vi.spyOn(ingestionJobs, "getIngestionStatus").mockResolvedValue({
      running: true,
      activeJobId: "active-ingestion",
      startedAt: "2026-04-13T08:05:00.000Z",
      finishedAt: null,
      lastError: null
    });
    const ingestionSpy = vi.spyOn(ContentService.prototype, "runWeeklyIngestion");

    const app = createApp();
    const response = await app.request(
      "/internal/bootstrap",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-admin-token": "secret-token"
        },
        body: JSON.stringify({ ingestionLimit: 5 })
      },
      {
        ADMIN_TRIGGER_TOKEN: "secret-token"
      }
    );

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      accepted: false,
      reason: "ingestion-already-running",
      activeJobId: "active-ingestion"
    });
    expect(ingestionSpy).not.toHaveBeenCalled();

    activeSpy.mockRestore();
    ingestionSpy.mockRestore();
  });

  it("returns 404 for removed internal admin routes", async () => {
    const app = createApp();
    const env = {
      ADMIN_TRIGGER_TOKEN: "secret-token"
    };

    const [articlesResponse, processResponse, stateResponse] = await Promise.all([
      app.request("/internal/articles", {}, env),
      app.request("/internal/analysis/articles/process", { method: "POST" }, env),
      app.request("/internal/state/article/x/ingested", { method: "POST" }, env)
    ]);

    expect(articlesResponse.status).toBe(404);
    expect(processResponse.status).toBe(404);
    expect(stateResponse.status).toBe(404);
  });
});
