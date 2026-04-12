import type {
  AdminOverview,
  ArticleSummary,
  DigestSummary,
  IngestionJob,
  ReviewRecord,
  TopicSummary
} from "@insight-a16z/core";

import { createAnalysisClient, slugFromTopicName } from "./analysis";
import { clearMemoryObjectStore, createObjectStore, createRepository } from "./db";
import type { Env } from "./env";
import {
  collectArticleCandidates,
  fetchText,
  filterTargetContentType,
  isLikelyEditorialArticle,
  parseArticleDocument
} from "./ingestion";
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
    return this.repo.listJobs();
  }

  async getReviewStates(): Promise<ReviewRecord[]> {
    return this.repo.listReviewStates();
  }

  async getAdminOverview(): Promise<AdminOverview> {
    return this.repo.getAdminOverview();
  }

  async runWeeklyIngestion(options?: {
    limit?: number;
    autoPublish?: boolean;
    rebuildTopics?: boolean;
    rebuildDigest?: boolean;
    resetBeforeImport?: boolean;
  }): Promise<{ jobId: string; ingested: number; analyzed: number; published: number }> {
    const job = await this.repo.createJob("weekly-ingestion");

    try {
      if (options?.resetBeforeImport) {
        await this.clearAllContent();
      }

      const listingUrls = [
        "https://a16z.com/ai/",
        "https://a16z.com/category/ai/",
        "https://a16z.com/category/ai/page/2/"
      ];

      let discovered = 0;
      let ingested = 0;
      let analyzed = 0;
      let published = 0;
      const limit = options?.limit ?? 8;
      const seen = new Set<string>();

      for (const listingUrl of listingUrls) {
        let html = "";
        try {
          html = await fetchText(listingUrl);
        } catch {
          continue;
        }
        const candidates = filterTargetContentType(collectArticleCandidates(html));
        discovered += candidates.length;

        for (const candidate of candidates) {
          if (seen.has(candidate.url)) continue;
          seen.add(candidate.url);
          if (ingested >= limit) break;

          let articleHtml = "";
          try {
            articleHtml = await fetchText(candidate.url);
          } catch {
            continue;
          }

          const parsed = parseArticleDocument(articleHtml, candidate.url);
          if (!isLikelyEditorialArticle(parsed)) {
            continue;
          }
          const article = await this.persistParsedArticle(parsed, articleHtml);
          ingested += 1;

          if (!article.summary) {
            await this.analyzeArticle(article.id);
            analyzed += 1;
            published += 1;
          } else if (article.reviewState !== "published") {
            await this.publish("article", article.id, "system@analysis");
            published += 1;
          }
        }

        if (ingested >= limit) {
          break;
        }
      }

      if (options?.rebuildTopics) {
        await this.rebuildAllTopics();
      }

      if (options?.rebuildDigest) {
        await this.generateWeeklyDigest();
      }

      await this.repo.completeJob(job.id, "succeeded", {
        discovered,
        ingested,
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

    await this.repo.updateArticleAnalysis(articleId, analysis);
    await this.publish("article", articleId, "system@analysis");

    const updated = await this.repo.getArticleById(articleId);
    if (!updated) {
      throw new Error(`Article ${articleId} not found after analysis`);
    }
    return updated;
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
    await this.publish("topic", stored.id, "system@analysis");
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
      await this.publish("topic", stored.id, "system@analysis");
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
    await this.publish("digest", digest.id, "system@analysis");
    const updated = await this.repo.getDigestBySlug(`${weekStart}`);
    if (!updated) {
      throw new Error(`Digest ${weekStart} not found after analysis`);
    }
    return updated;
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
