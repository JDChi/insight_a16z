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
    const service = createContentService({ AUTH_MODE: "test" });
    await service.seedFixtures();

    const articles = await service.listAllArticles();
    const target = articles[0];
    await service.setEntityState("article", target.id, "ingested", "admin@local.test");

    const updated = await service.analyzeArticle(target.id);

    expect(updated.reviewState).toBe("published");
  });

  it("processes queued ingested articles and republishes them", async () => {
    const service = createContentService({ AUTH_MODE: "test" });
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
    const service = createContentService({ AUTH_MODE: "test" });
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
});
