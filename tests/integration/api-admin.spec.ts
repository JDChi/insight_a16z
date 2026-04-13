import { createApp } from "../../apps/api/src/index";
import * as articleQueue from "../../apps/api/src/lib/article-queue";
import { ContentService } from "../../apps/api/src/lib/service";
import { resetArticleQueueState } from "../../apps/api/src/lib/article-queue";
import { resetMemoryStores } from "../../apps/api/src/lib/db";

const adminEnv = {
  AUTH_MODE: "cloudflare-access" as const,
  ADMIN_EMAILS: "admin@local.test"
};

describe("admin API", () => {
  beforeEach(() => {
    resetMemoryStores();
    resetArticleQueueState();
  });

  it("blocks internal routes without admin identity", async () => {
    const app = createApp();
    const response = await app.request("/internal/articles", {}, adminEnv);

    expect(response.status).toBe(401);
  });

  it("publishes article immediately after analysis completes", async () => {
    const app = createApp();
    const headers = {
      "cf-access-authenticated-user-email": "admin@local.test"
    };

    const listBefore = await app.request("/internal/articles", { headers }, adminEnv);
    const articles = await listBefore.json();
    const target = articles.find((item: { reviewState: string }) => item.reviewState === "published");

    expect(target).toBeTruthy();

    const rejectResponse = await app.request(`/internal/review/article/${target.id}/reject`, { method: "POST", headers }, adminEnv);
    expect(rejectResponse.status).toBe(200);

    const analysisResponse = await app.request(`/internal/analysis/articles/${target.id}`, { method: "POST", headers }, adminEnv);
    expect(analysisResponse.status).toBe(200);

    const listAfter = await app.request("/internal/articles", { headers }, adminEnv);
    const updatedArticles = await listAfter.json();
    const updated = updatedArticles.find((item: { id: string }) => item.id === target.id);

    expect(updated.reviewState).toBe("published");
  });

  it("processes queued articles from the admin API", async () => {
    const app = createApp();
    const headers = {
      "cf-access-authenticated-user-email": "admin@local.test"
    };

    const articlesResponse = await app.request("/internal/articles", { headers }, adminEnv);
    const articles = await articlesResponse.json();
    const target = articles[0];

    const stateResponse = await app.request(`/internal/state/article/${target.id}/ingested`, { method: "POST", headers }, adminEnv);
    expect(stateResponse.status).toBe(200);

    const processResponse = await app.request("/internal/analysis/articles/process", { method: "POST", headers }, adminEnv);
    expect(processResponse.status).toBe(200);
    expect(await processResponse.json()).toMatchObject({
      started: true,
      running: false,
      result: { processed: 1, published: 1 }
    });

    const updatedArticlesResponse = await app.request("/internal/articles", { headers }, adminEnv);
    const updatedArticles = await updatedArticlesResponse.json();
    const updated = updatedArticles.find((item: { id: string }) => item.id === target.id) ?? null;

    expect(updated?.reviewState).toBe("published");
  });

  it("runs bootstrap ingestion and one processing batch from the admin API", async () => {
    const ingestionSpy = vi
      .spyOn(ContentService.prototype, "runWeeklyIngestion")
      .mockResolvedValue({ jobId: "ingestion-job", ingested: 12, analyzed: 0, published: 0 });
    const queueSpy = vi.spyOn(articleQueue, "runRecoverableQueueCycle").mockResolvedValue({
      started: true,
      running: false,
      result: {
        jobId: "queue-job",
        processed: 3,
        published: 2,
        failed: 0,
        deferred: 1
      }
    });

    const app = createApp();
    const headers = {
      "cf-access-authenticated-user-email": "admin@local.test"
    };

    const response = await app.request("/internal/bootstrap", {
      method: "POST",
      headers,
      body: JSON.stringify({ ingestionLimit: 50, processLimit: 2 })
    }, adminEnv);

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ingestion: { ingested: 12 },
      queue: { started: true, result: { processed: 3, published: 2 } }
    });
    expect(ingestionSpy).toHaveBeenCalledWith({
      limit: 50,
      rebuildTopics: false,
      rebuildDigest: false,
      resetBeforeImport: false
    });
    expect(queueSpy).toHaveBeenCalledWith(adminEnv, {
      batchSize: 2,
      rebuildTopics: true,
      rebuildDigest: true,
      jobType: "article-processing-bootstrap"
    });

    ingestionSpy.mockRestore();
    queueSpy.mockRestore();
  });
});
