import { resetArticleQueueState } from "../../apps/api/src/lib/article-queue";
import { MemoryObjectStore, MemoryRepository, resetMemoryStores } from "../../apps/api/src/lib/db";
import { AnalysisOutputRejectedError } from "../../apps/api/src/lib/analysis";
import { ContentService, createContentService } from "../../apps/api/src/lib/service";

describe("content workflow", () => {
  beforeEach(() => {
    resetMemoryStores();
    resetArticleQueueState();
  });

  it("publishes articles immediately after analysis", async () => {
    const service = createContentService({});
    await service.seedFixtures();

    const articles = await service.listAllArticles();
    const target = articles[0];
    await service.setEntityState("article", target.id, "ingested", "admin@local.test");

    const updated = await service.analyzeArticle(target.id);

    expect(updated.reviewState).toBe("published");
  });

  it("records a completed analysis run with duration for a published article", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const [target] = await repo.listArticles();
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "ingested",
      reviewer: "admin@local.test"
    });

    const service = new ContentService(repo, objectStore, {
      async analyzeArticle() {
        return {
          zhTitle: "带有耗时记录的洞察标题",
          summary: "这是一段有效的中文摘要。",
          keyPoints: ["要点一", "要点二", "要点三"],
          keyJudgements: ["判断一", "判断二"],
          outlook: {
            statement: "未来 6-12 个月，这一赛道会继续深化产品化落地。",
            timeHorizon: "未来 6-12 个月",
            whyNow: "文章已经出现明确的商业化和采用信号。",
            signalsToWatch: ["更多预算转向正式采购"],
            confidence: "medium"
          },
          candidateTopics: ["agent-workflows"],
          evidenceLinks: [
            { claim: "判断一", evidenceText: "要点一", sourceLocator: "paragraph:1" },
            { claim: "判断二", evidenceText: "要点二", sourceLocator: "paragraph:2" }
          ]
        };
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    });

    await service.analyzeArticle(target.id);
    const runs = await repo.listAnalysisRuns({ entityType: "article", entityId: target.id });

    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({
      runType: "article-analysis",
      status: "succeeded",
      entityId: target.id
    });
    expect(runs[0]?.durationMs).not.toBeNull();
  });

  it("processes queued ingested articles and republishes them", async () => {
    const service = createContentService({});
    await service.seedFixtures();

    const articles = await service.listAllArticles();
    const target = articles[0];
    await service.setEntityState("article", target.id, "ingested", "admin@local.test");

    const result = await service.processPendingArticles({ limit: 1 });
    const updated = await service.getArticle(target.slug);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(updated?.reviewState).toBe("published");
  });

  it("rebuilds topics and weekly digests from analyzed articles", async () => {
    const service = createContentService({});
    await service.seedFixtures();

    const topics = await service.rebuildAllTopics();
    const digest = await service.generateWeeklyDigest(new Date("2026-04-06T00:00:00.000Z"));

    expect(topics.length).toBeGreaterThan(0);
    expect(topics.every((topic) => topic.reviewState === "published")).toBe(true);
    expect(digest.topSignals.length).toBeGreaterThan(0);
    expect(digest.trendPredictions.length).toBeGreaterThan(0);
    expect(digest.reviewState).toBe("published");
  });

  it("returns unreasonable outputs to ingested and continues with later articles", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const articles = await repo.listArticles();
    const firstTarget = articles[0];
    const secondTarget = articles[1];

    await repo.setReviewState({
      entityType: "article",
      entityId: firstTarget.id,
      state: "ingested",
      reviewer: "admin@local.test"
    });
    await repo.setReviewState({
      entityType: "article",
      entityId: secondTarget.id,
      state: "ingested",
      reviewer: "admin@local.test"
    });

    let calls = 0;
    const fakeClient = {
      async analyzeArticle() {
        calls += 1;
        if (calls === 1) {
          throw new AnalysisOutputRejectedError("duplicate insight title");
        }

        return {
          zhTitle: "第二篇新的洞察标题",
          summary: "这是一段有效的中文摘要。",
          keyPoints: ["要点一", "要点二", "要点三"],
          keyJudgements: ["判断一", "判断二"],
          outlook: {
            statement: "未来 6-12 个月，相关产品会进入更强的流程化落地阶段。",
            timeHorizon: "未来 6-12 个月",
            whyNow: "文章已经显示企业采用正在从试点转向流程整合。",
            signalsToWatch: ["更多预算从试点转向正式采购"],
            confidence: "medium"
          },
          candidateTopics: ["agent-workflows"],
          evidenceLinks: [
            { claim: "判断一", evidenceText: "要点一", sourceLocator: "paragraph:1" },
            { claim: "判断二", evidenceText: "要点二", sourceLocator: "paragraph:2" }
          ]
        };
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    };

    const service = new ContentService(repo, objectStore, fakeClient);
    const result = await service.processPendingArticles({ limit: 2, rebuildTopics: false, rebuildDigest: false });

    const firstUpdated = await repo.getArticleById(firstTarget.id);
    const secondUpdated = await repo.getArticleById(secondTarget.id);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.deferred).toBe(1);
    expect(firstUpdated?.reviewState).toBe("ingested");
    expect(secondUpdated?.reviewState).toBe("published");
  });

  it("creates a new analysis run for each retry of the same article", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const [target] = await repo.listArticles();
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "ingested",
      reviewer: "admin@local.test"
    });

    let attempts = 0;
    const service = new ContentService(repo, objectStore, {
      async analyzeArticle() {
        attempts += 1;
        if (attempts === 1) {
          throw new AnalysisOutputRejectedError("duplicate insight title");
        }

        return {
          zhTitle: "第二次才成功的洞察标题",
          summary: "这是一段有效的中文摘要。",
          keyPoints: ["要点一", "要点二", "要点三"],
          keyJudgements: ["判断一", "判断二"],
          outlook: {
            statement: "未来 6-12 个月，这一方向会继续扩张。",
            timeHorizon: "未来 6-12 个月",
            whyNow: "市场和供给两端都在同步成熟。",
            signalsToWatch: ["更多正式产品推出"],
            confidence: "medium"
          },
          candidateTopics: ["agent-workflows"],
          evidenceLinks: [
            { claim: "判断一", evidenceText: "要点一", sourceLocator: "paragraph:1" },
            { claim: "判断二", evidenceText: "要点二", sourceLocator: "paragraph:2" }
          ]
        };
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    });

    await expect(service.analyzeArticle(target.id)).rejects.toThrow("duplicate insight title");
    await service.analyzeArticle(target.id);

    const runs = await repo.listAnalysisRuns({ entityType: "article", entityId: target.id });

    expect(runs).toHaveLength(2);
    expect(runs.map((run) => run.status).sort()).toEqual(["rejected", "succeeded"]);
    expect(runs.every((run) => run.durationMs !== null)).toBe(true);
  });

  it("disambiguates a duplicate insight title and still publishes the article", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const articles = await repo.listArticles();
    const target = articles[0];
    const existing = articles[1];

    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "ingested",
      reviewer: "admin@local.test"
    });

    const service = new ContentService(repo, objectStore, {
      async analyzeArticle() {
        return {
          zhTitle: existing.zhTitle,
          summary: "这是一段有效的中文摘要。",
          keyPoints: ["要点一", "要点二", "要点三"],
          keyJudgements: ["判断一", "判断二"],
          outlook: {
            statement: "未来 6-12 个月，这一方向会继续扩张。",
            timeHorizon: "未来 6-12 个月",
            whyNow: "市场和供给两端都在同步成熟。",
            signalsToWatch: ["更多正式产品推出"],
            confidence: "medium"
          },
          candidateTopics: ["consumer-ai"],
          evidenceLinks: [
            { claim: "判断一", evidenceText: "要点一", sourceLocator: "paragraph:1" },
            { claim: "判断二", evidenceText: "要点二", sourceLocator: "paragraph:2" }
          ]
        };
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    });

    const updated = await service.analyzeArticle(target.id);

    expect(updated.reviewState).toBe("published");
    expect(updated.zhTitle).not.toBe(existing.zhTitle);
    expect(updated.zhTitle.startsWith(`${existing.zhTitle} ·`)).toBe(true);
  });

  it("reclaims stale processing articles back into the queue", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const [target] = await repo.listArticles();
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "processing",
      reviewer: "system@analysis"
    });

    vi.spyOn(repo, "listReviewStates").mockResolvedValue([
      {
        id: crypto.randomUUID(),
        entityType: "article",
        entityId: target.id,
        state: "processing",
        reviewer: "system@analysis",
        reviewNote: null,
        updatedAt: "2026-04-13T00:00:00.000Z"
      }
    ]);

    const fakeClient = {
      async analyzeArticle() {
        return {
          zhTitle: "恢复后的洞察标题",
          summary: "这是一段恢复后的中文摘要。",
          keyPoints: ["要点一", "要点二", "要点三"],
          keyJudgements: ["判断一", "判断二"],
          outlook: {
            statement: "未来 6-12 个月，这个方向会继续强化产品化整合。",
            timeHorizon: "未来 6-12 个月",
            whyNow: "文章已经显示需求和产品能力正在同步成熟。",
            signalsToWatch: ["更多成熟产品推出正式商业化版本"],
            confidence: "medium"
          },
          candidateTopics: ["agent-workflows"],
          evidenceLinks: [
            { claim: "判断一", evidenceText: "要点一", sourceLocator: "paragraph:1" },
            { claim: "判断二", evidenceText: "要点二", sourceLocator: "paragraph:2" }
          ]
        };
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    };

    const service = new ContentService(repo, objectStore, fakeClient);
    const result = await service.processPendingArticles({ limit: 1, rebuildTopics: false, rebuildDigest: false });
    const updated = await repo.getArticleById(target.id);

    expect(result.processed).toBe(1);
    expect(result.published).toBe(1);
    expect(updated?.reviewState).toBe("published");
  });

  it("does not reset already-published articles when they have old processing history", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    await repo.seedFixtures();

    const [target] = await repo.listArticles();
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "processing",
      reviewer: "system@analysis"
    });
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "published",
      reviewer: "system@analysis"
    });

    vi.spyOn(repo, "listReviewStates").mockResolvedValue([
      {
        id: crypto.randomUUID(),
        entityType: "article",
        entityId: target.id,
        state: "processing",
        reviewer: "system@analysis",
        reviewNote: null,
        updatedAt: "2026-04-13T00:00:00.000Z"
      },
      {
        id: crypto.randomUUID(),
        entityType: "article",
        entityId: target.id,
        state: "published",
        reviewer: "system@analysis",
        reviewNote: null,
        updatedAt: "2026-04-13T00:10:00.000Z"
      }
    ]);

    const service = new ContentService(repo, objectStore, {
      async analyzeArticle() {
        throw new Error("not used");
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    });

    await service.processPendingArticles({ limit: 1, rebuildTopics: false, rebuildDigest: false });
    const updated = await repo.getArticleById(target.id);

    expect(updated?.reviewState).toBe("published");
  });

  it("marks stale running jobs as failed when listing jobs", async () => {
    const repo = new MemoryRepository();
    const objectStore = new MemoryObjectStore();
    const service = new ContentService(repo, objectStore, {
      async analyzeArticle() {
        throw new Error("not used");
      },
      async analyzeTopic() {
        throw new Error("not used");
      },
      async analyzeDigest() {
        throw new Error("not used");
      }
    });

    const oldQueueJob = await repo.createJob("article-processing-cron");
    const oldIngestionJob = await repo.createJob("weekly-ingestion");
    (repo as any).jobs.get(oldQueueJob.id).startedAt = "2026-04-13T07:40:00.000Z";
    (repo as any).jobs.get(oldIngestionJob.id).startedAt = "2026-04-13T04:00:00.000Z";

    const jobs = await service.getJobs();
    const refreshedQueueJob = jobs.find((job) => job.id === oldQueueJob.id);
    const refreshedIngestionJob = jobs.find((job) => job.id === oldIngestionJob.id);

    expect(refreshedQueueJob?.status).toBe("failed");
    expect(refreshedQueueJob?.errorMessage).toBe("Timed out while running");
    expect(refreshedIngestionJob?.status).toBe("failed");
    expect(refreshedIngestionJob?.errorMessage).toBe("Timed out while running");
  });

  it("keeps a published article published when the same source is re-ingested", async () => {
    const repo = new MemoryRepository();
    await repo.seedFixtures();

    const [target] = await repo.listArticles();
    await repo.setReviewState({
      entityType: "article",
      entityId: target.id,
      state: "published",
      reviewer: "admin@local.test"
    });

    await repo.upsertArticleBase(
      {
        sourceUrl: target.sourceUrl,
        canonicalUrl: target.sourceUrl,
        sourceTitle: `${target.sourceTitle} updated`,
        publishedAt: target.publishedAt,
        contentType: target.contentType,
        authors: [],
        plainText: "updated body",
        sections: []
      },
      {
        rawR2Key: "raw/test",
        cleanedR2Key: "clean/test"
      }
    );

    const updated = await repo.getArticleById(target.id);
    expect(updated?.reviewState).toBe("published");
  });
});
