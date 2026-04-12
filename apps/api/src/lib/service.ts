import type {
  AdminOverview,
  ArticleSummary,
  DigestSummary,
  IngestionJob,
  ReviewRecord,
  TopicSummary
} from "@insight-a16z/core";

import { createAnalysisClient, slugFromTopicName } from "./analysis";
import { createObjectStore, createRepository } from "./db";
import type { Env } from "./env";
import { collectArticleCandidates, fetchText, filterTargetContentType, parseArticleDocument } from "./ingestion";
import type { ContentRepository, ObjectStore, ParsedArticle, StoredArticle } from "./types";
import { endOfWeek, nowIso, startOfWeek, stringifyJson, unique } from "./utils";

export class ContentService {
  constructor(
    private readonly repo: ContentRepository,
    private readonly objectStore: ObjectStore,
    private readonly analysisClient = createAnalysisClient({} as Env)
  ) {}

  async seedFixtures(): Promise<void> {
    await this.repo.seedFixtures();
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
    return this.repo.listJobs();
  }

  async getReviewStates(): Promise<ReviewRecord[]> {
    return this.repo.listReviewStates();
  }

  async getAdminOverview(): Promise<AdminOverview> {
    return this.repo.getAdminOverview();
  }

  async runWeeklyIngestion(): Promise<{ jobId: string; ingested: number; analyzed: number }> {
    const job = await this.repo.createJob("weekly-ingestion");

    try {
      const listingUrls = [
        "https://a16z.com/category/ai/",
        "https://a16z.com/category/ai/page/2/"
      ];

      let discovered = 0;
      let ingested = 0;
      let analyzed = 0;

      for (const listingUrl of listingUrls) {
        const html = await fetchText(listingUrl);
        const candidates = filterTargetContentType(collectArticleCandidates(html));
        discovered += candidates.length;

        for (const candidate of candidates.slice(0, 10)) {
          const articleHtml = await fetchText(candidate.url);
          const parsed = parseArticleDocument(articleHtml, candidate.url);
          const article = await this.persistParsedArticle(parsed, articleHtml);
          ingested += 1;

          if (!article.summary) {
            await this.analyzeArticle(article.id);
            analyzed += 1;
          }
        }
      }

      await this.repo.completeJob(job.id, "succeeded", {
        discovered,
        ingested,
        analyzed
      });

      return { jobId: job.id, ingested, analyzed };
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

    const cleanedPayload = article.cleanedR2Key ? await this.objectStore.get(article.cleanedR2Key) : null;
    const plainText =
      cleanedPayload && cleanedPayload.length > 0
        ? (JSON.parse(cleanedPayload) as ParsedArticle).plainText
        : `${article.sourceTitle}\n${article.summary}\n${article.keyPoints.join("\n")}`;

    const analysis = await this.analysisClient.analyzeArticle({
      sourceTitle: article.sourceTitle,
      contentType: article.contentType,
      publishedAt: article.publishedAt,
      plainText
    });

    return this.repo.updateArticleAnalysis(articleId, analysis);
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
    return this.repo.upsertTopicAnalysis({
      slug: topicSlug,
      analysis,
      supportingArticles
    });
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
      topics.push(stored);
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

    return this.repo.upsertDigestAnalysis({
      slug: `${weekStart}`,
      weekStart,
      weekEnd,
      analysis
    });
  }

  async approve(entityType: "article" | "topic" | "digest", entityId: string, reviewer: string | null, note?: string) {
    return this.repo.setReviewState({
      entityType,
      entityId,
      state: "approved",
      reviewer,
      note
    });
  }

  async reject(entityType: "article" | "topic" | "digest", entityId: string, reviewer: string | null, note?: string) {
    return this.repo.setReviewState({
      entityType,
      entityId,
      state: "rejected",
      reviewer,
      note
    });
  }

  async publish(entityType: "article" | "topic" | "digest", entityId: string, reviewer: string | null, note?: string) {
    return this.repo.setReviewState({
      entityType,
      entityId,
      state: "published",
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
