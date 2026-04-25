import type {
  ArticleSummary,
  DigestSummary,
  IngestionJob,
  TopicSummary
} from "@insight-a16z/core";

import {
  AnalysisOutputRejectedError,
  createAnalysisClient,
  ensureUniqueInsightTitle,
  slugFromTopicName
} from "./analysis";
import { findStaleQueueJobs } from "./article-queue";
import { clearMemoryObjectStore, createObjectStore, createRepository } from "./db";
import type { Env } from "./env";
import {
  collectArticleCandidates,
  collectSitemapAiCandidates,
  dedupeCandidatesByUrl,
  fetchText,
  filterTargetContentType,
  isLikelyEditorialArticle,
  isPublishedWithinPastYear,
  parseArticleDocument
} from "./ingestion";
import { findStaleIngestionJobs } from "./ingestion-jobs";
import type { ContentRepository, ObjectStore, ParsedArticle, StoredArticle } from "./types";
import { endOfWeek, nowIso, startOfWeek, stringifyJson, unique } from "./utils";

const DEFAULT_INGESTION_CONCURRENCY = 4;
const STALE_PROCESSING_ARTICLE_WINDOW_MS = 30 * 60 * 1000;
const ARTICLE_ANALYSIS_PROMPT_VERSION = "article-analysis-v2";

type IngestionDiscoverySource = {
  url: string;
  kind: "listing" | "sitemap";
};

function buildDiscoverySources(): IngestionDiscoverySource[] {
  return [
    { url: "https://a16z.com/sitemap/", kind: "sitemap" },
    { url: "https://a16z.com/ai/", kind: "listing" },
    ...Array.from({ length: 12 }, (_, index) => ({
      url: index === 0 ? "https://a16z.com/category/ai/" : `https://a16z.com/category/ai/page/${index + 1}/`,
      kind: "listing" as const
    }))
  ];
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        await worker(items[currentIndex] as T, currentIndex);
      }
    })
  );
}

export class ContentService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly objectStore: ObjectStore,
    private readonly analysisClient = createAnalysisClient({} as Env)
  ) {}

  async seedFixtures(): Promise<void> {
    await this.repo.seedFixtures();
  }

  async clearAllContent(): Promise<void> {
    await this.repo.clearAll();
    clearMemoryObjectStore();
  }

  async listPublishedArticles(): Promise<ArticleSummary[]> {
    return this.repo.listArticles({ reviewState: "published" });
  }

  async listAllArticles(): Promise<ArticleSummary[]> {
    return this.repo.listArticles();
  }

  async getArticle(slug: string) {
    return this.repo.getArticleBySlug(slug);
  }

  async listTopics(): Promise<TopicSummary[]> {
    return this.repo.listTopics();
  }

  async getTopic(slug: string) {
    return this.repo.getTopicBySlug(slug);
  }

  async listDigests(): Promise<DigestSummary[]> {
    return this.repo.listDigests();
  }

  async getDigest(slug: string) {
    return this.repo.getDigestBySlug(slug);
  }

  async getJobs(): Promise<IngestionJob[]> {
    await this.reconcileStaleJobs();
    return this.repo.listJobs();
  }

  async runWeeklyIngestion(options?: {
    limit?: number;
    rebuildTopics?: boolean;
    rebuildDigest?: boolean;
    resetBeforeImport?: boolean;
  }): Promise<{ jobId: string; ingested: number; analyzed: number; published: number }> {
    const job = await this.repo.createJob("weekly-ingestion");

    try {
      if (options?.resetBeforeImport) {
        await this.clearAllContent();
      }

      let discovered = 0;
      let deduped = 0;
      let eligible = 0;
      let ingested = 0;
      let analyzed = 0;
      let published = 0;
      let alreadyKnown = 0;
      let fetchFailed = 0;
      let parseFailed = 0;
      let invalidCandidates = 0;
      const limit = options?.limit ?? 300;
      const discoveryCandidates = [];

      for (const source of buildDiscoverySources()) {
        let html = "";
        try {
          html = await fetchText(source.url);
        } catch {
          continue;
        }
        const candidates =
          source.kind === "sitemap"
            ? collectSitemapAiCandidates(html)
            : filterTargetContentType(collectArticleCandidates(html));
        discovered += candidates.length;
        discoveryCandidates.push(...candidates);
      }

      const uniqueCandidates = dedupeCandidatesByUrl(discoveryCandidates);
      deduped = uniqueCandidates.length;
      const existingUrls = new Set((await this.repo.listArticles()).map((article) => article.sourceUrl));
      const candidatesToFetch = uniqueCandidates.filter((candidate) => {
        if (existingUrls.has(candidate.url)) {
          alreadyKnown += 1;
          return false;
        }
        return true;
      });
      eligible = candidatesToFetch.length;

      await runWithConcurrency(candidatesToFetch, DEFAULT_INGESTION_CONCURRENCY, async (candidate) => {
        if (ingested >= limit) {
          return;
        }

        let articleHtml = "";
        try {
          articleHtml = await fetchText(candidate.url);
        } catch {
          fetchFailed += 1;
          return;
        }

        let parsed: ParsedArticle;
        try {
          parsed = parseArticleDocument(articleHtml, candidate.url);
        } catch {
          parseFailed += 1;
          return;
        }

        if (!isLikelyEditorialArticle(parsed) || !isPublishedWithinPastYear(parsed.publishedAt)) {
          invalidCandidates += 1;
          return;
        }

        await this.persistParsedArticle(parsed, articleHtml);
        ingested += 1;
      });

      if (options?.rebuildTopics) {
        await this.rebuildAllTopics();
      }

      if (options?.rebuildDigest) {
        await this.generateWeeklyDigest();
      }

      await this.repo.completeJob(job.id, "succeeded", {
        discovered,
        deduped,
        eligible,
        ingested,
        alreadyKnown,
        fetchFailed,
        parseFailed,
        invalidCandidates,
        analyzed,
        published
      });

      return { jobId: job.id, ingested, analyzed, published };
    } catch (error) {
      await this.repo.completeJob(job.id, "failed", {}, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  async analyzeArticle(articleId: string) {
    const article = await this.repo.getArticleById(articleId);
    if (!article) {
      throw new Error(`Article ${articleId} not found`);
    }

    const analysisRun = await this.repo.createAnalysisRun({
      runType: "article-analysis",
      entityType: "article",
      entityId: articleId,
      promptVersion: ARTICLE_ANALYSIS_PROMPT_VERSION,
      inputR2Key: article.cleanedR2Key
    });

    await this.setEntityState("article", articleId, "processing", "system@analysis");

    const cleanedPayload = article.cleanedR2Key ? await this.objectStore.get(article.cleanedR2Key) : null;
    const plainText =
      cleanedPayload && cleanedPayload.length > 0
        ? (JSON.parse(cleanedPayload) as ParsedArticle).plainText
        : `${article.sourceTitle}\n${article.summary}\n${article.keyPoints.join("\n")}`;

    try {
      const analysis = await this.analysisClient.analyzeArticle({
        sourceTitle: article.sourceTitle,
        contentType: article.contentType,
        publishedAt: article.publishedAt,
        plainText
      });

      const existingTitles = new Set(
        (await this.repo.listArticles())
          .filter((item) => item.id !== articleId)
          .map((item) => item.zhTitle.trim())
          .filter(Boolean)
      );
      const normalizedTitle = ensureUniqueInsightTitle(analysis.zhTitle, {
        sourceTitle: article.sourceTitle,
        sourceUrl: article.sourceUrl,
        existingTitles: Array.from(existingTitles)
      }).trim();

      if (existingTitles.has(normalizedTitle)) {
        throw new AnalysisOutputRejectedError(`Duplicate insight title: ${normalizedTitle}`);
      }

      await this.repo.updateArticleAnalysis(articleId, {
        ...analysis,
        zhTitle: normalizedTitle
      });
      await this.setEntityState("article", articleId, "published", "system@analysis");
      await this.repo.completeAnalysisRun(analysisRun.id, "succeeded");
    } catch (error) {
      const rejected = error instanceof AnalysisOutputRejectedError;
      await this.repo.completeAnalysisRun(analysisRun.id, rejected ? "rejected" : "failed", {
        errorMessage: error instanceof Error ? error.message : "Unknown error"
      });
      await this.setEntityState(
        "article",
        articleId,
        rejected ? "ingested" : "failed",
        "system@analysis",
        error instanceof Error ? error.message : undefined
      );
      throw error;
    }

    const updated = await this.repo.getArticleById(articleId);
    if (!updated) {
      throw new Error(`Article ${articleId} not found after analysis`);
    }
    return updated;
  }

  async processPendingArticles(options?: {
    limit?: number;
    rebuildTopics?: boolean;
    rebuildDigest?: boolean;
    includeFailed?: boolean;
    jobType?: string;
  }): Promise<{ jobId: string; processed: number; published: number; failed: number; deferred: number }> {
    const job = await this.repo.createJob(options?.jobType ?? "article-processing");

    try {
      await this.reclaimStaleProcessingArticles();

      const limit = options?.limit ?? 3;
      const includeFailed = options?.includeFailed ?? true;
      const candidates = (await this.repo.listArticles())
        .filter((article) => {
          if (article.reviewState === "ingested") {
            return true;
          }

          return includeFailed && article.reviewState === "failed";
        })
        .slice(0, limit);

      let processed = 0;
      let published = 0;
      let failed = 0;
      let deferred = 0;

      for (const candidate of candidates) {
        try {
          const updated = await this.analyzeArticle(candidate.id);
          processed += 1;
          if (updated.reviewState === "published") {
            published += 1;
          }
        } catch (error) {
          if (error instanceof AnalysisOutputRejectedError) {
            deferred += 1;
            continue;
          }

          failed += 1;
        }
      }

      if ((options?.rebuildTopics ?? true) && published > 0) {
        await this.rebuildAllTopics();
      }

      if ((options?.rebuildDigest ?? true) && published > 0) {
        await this.generateWeeklyDigest();
      }

      await this.repo.completeJob(job.id, "succeeded", { processed, published, failed, deferred });
      return { jobId: job.id, processed, published, failed, deferred };
    } catch (error) {
      await this.repo.completeJob(job.id, "failed", {}, error instanceof Error ? error.message : "Unknown error");
      throw error;
    }
  }

  private async reclaimStaleProcessingArticles(): Promise<void> {
    const cutoff = Date.now() - STALE_PROCESSING_ARTICLE_WINDOW_MS;
    const currentArticles = await this.repo.listArticles();
    const articleById = new Map(currentArticles.map((article) => [article.id, article]));
    const currentProcessingIds = new Set(
      currentArticles.filter((article) => article.reviewState === "processing").map((article) => article.id)
    );
    const reviewStates = await this.repo.listReviewStates();
    const staleReviewStateArticleIds = unique(
      reviewStates
        .filter((record) => {
          if (record.entityType !== "article" || record.state !== "processing") {
            return false;
          }

          if (!currentProcessingIds.has(record.entityId)) {
            return false;
          }

          const updatedAt = Date.parse(record.updatedAt);
          return Number.isFinite(updatedAt) && updatedAt <= cutoff;
        })
        .map((record) => record.entityId)
    );
    const analysisRuns = await this.repo.listAnalysisRuns({ entityType: "article" });
    const staleAnalysisRuns = analysisRuns.filter((run) => {
      if (run.status !== "running") {
        return false;
      }

      const updatedAt = Date.parse(run.updatedAt);
      return Number.isFinite(updatedAt) && updatedAt <= cutoff;
    });

    for (const run of staleAnalysisRuns) {
      await this.repo.completeAnalysisRun(run.id, "failed", {
        errorMessage: "Recovered stale analysis run"
      });
    }

    const staleAnalysisArticleIds = staleAnalysisRuns
      .map((run) => run.entityId)
      .filter((articleId) => articleById.get(articleId)?.reviewState === "processing");
    const staleArticleIds = unique([...staleReviewStateArticleIds, ...staleAnalysisArticleIds]);

    for (const articleId of staleArticleIds) {
      await this.setEntityState(
        "article",
        articleId,
        "ingested",
        "system@queue",
        "Recovered stale processing state"
      );
    }
  }

  private async reconcileStaleJobs(): Promise<void> {
    const jobs = await this.repo.listJobs();
    const staleJobs = unique(
      [...findStaleQueueJobs(jobs), ...findStaleIngestionJobs(jobs)].map((job) => job.id)
    )
      .map((id) => jobs.find((job) => job.id === id))
      .filter(Boolean) as IngestionJob[];

    for (const job of staleJobs) {
      await this.repo.completeJob(job.id, "failed", job.stats, "Timed out while running");
    }
  }

  async rebuildTopic(topicSlugOrId: string) {
    const articles = await this.repo.listArticles();
    const detailedArticles = await Promise.all(
      articles.map((article) => this.repo.getArticleById(article.id))
    );
    const supportingArticles = detailedArticles.filter(Boolean).filter((article) => {
      if (!article) return false;
      return article.topics.includes(topicSlugOrId) || article.relatedTopics.some((topic) => topic.slug === topicSlugOrId);
    }) as StoredArticle[];

    if (supportingArticles.length === 0) {
      throw new Error(`No articles found for topic ${topicSlugOrId}`);
    }

    const topicSlug = slugFromTopicName(topicSlugOrId);
    const analysis = await this.analysisClient.analyzeTopic(topicSlug, supportingArticles);
    const stored = await this.repo.upsertTopicAnalysis({
      slug: topicSlug,
      analysis,
      supportingArticles
    });
    await this.setEntityState("topic", stored.id, "published", "system@analysis");
    const updated = await this.repo.getTopicBySlug(topicSlug);
    if (!updated) {
      throw new Error(`Topic ${topicSlug} not found after analysis`);
    }
    return updated;
  }

  async rebuildAllTopics() {
    const articles = await Promise.all((await this.repo.listArticles()).map((item) => this.repo.getArticleById(item.id)));
    const grouped = new Map<string, StoredArticle[]>();

    for (const article of articles.filter(Boolean) as StoredArticle[]) {
      for (const topic of article.topics) {
        const bucket = grouped.get(topic) ?? [];
        bucket.push(article);
        grouped.set(topic, bucket);
      }
    }

    const topics = [];
    for (const [topicSlug, topicArticles] of grouped.entries()) {
      const analysis = await this.analysisClient.analyzeTopic(topicSlug, topicArticles);
      const stored = await this.repo.upsertTopicAnalysis({
        slug: topicSlug,
        analysis,
        supportingArticles: topicArticles
      });
      await this.setEntityState("topic", stored.id, "published", "system@analysis");
      const updated = await this.repo.getTopicBySlug(topicSlug);
      if (updated) {
        topics.push(updated);
      }
    }

    return topics;
  }

  async generateWeeklyDigest(referenceDate = new Date()) {
    const weekStart = startOfWeek(referenceDate);
    const weekEnd = endOfWeek(referenceDate);
    const articles = await Promise.all((await this.repo.listArticles()).map((item) => this.repo.getArticleById(item.id)));
    const relevant = (articles.filter(Boolean) as StoredArticle[]).filter(
      (article) => article.publishedAt >= weekStart && article.publishedAt <= weekEnd
    );
    const digestArticles = relevant.length > 0 ? relevant : ((articles.filter(Boolean) as StoredArticle[]).slice(0, 5));
    const analysis = await this.analysisClient.analyzeDigest({
      weekStart,
      weekEnd,
      articles: digestArticles
    });

    const digest = await this.repo.upsertDigestAnalysis({
      slug: `${weekStart}`,
      weekStart,
      weekEnd,
      analysis
    });
    await this.setEntityState("digest", digest.id, "published", "system@analysis");
    const updated = await this.repo.getDigestBySlug(`${weekStart}`);
    if (!updated) {
      throw new Error(`Digest ${weekStart} not found after analysis`);
    }
    return updated;
  }

  async setEntityState(
    entityType: "article" | "topic" | "digest",
    entityId: string,
    state: "ingested" | "processing" | "published" | "failed",
    reviewer: string | null,
    note?: string
  ) {
    return this.repo.setReviewState({
      entityType,
      entityId,
      state,
      reviewer,
      note
    });
  }

  private async persistParsedArticle(parsed: ParsedArticle, rawHtml: string) {
    const timestamp = nowIso().replace(/[:.]/g, "-");
    const rawR2Key = `raw/${timestamp}-${crypto.randomUUID()}.html`;
    const cleanedR2Key = `cleaned/${timestamp}-${crypto.randomUUID()}.json`;
    await this.objectStore.put(rawR2Key, rawHtml);
    await this.objectStore.put(cleanedR2Key, stringifyJson(parsed));
    return this.repo.upsertArticleBase(parsed, { rawR2Key, cleanedR2Key });
  }
}

export function createContentService(env: Env): ContentService {
  const repo = createRepository(env);
  const objectStore = createObjectStore(env);
  const analysisClient = createAnalysisClient(env);
  return new ContentService(repo, objectStore, analysisClient);
}
