import {
  sampleArticles,
  sampleDigests,
  sampleJobs,
  sampleTopics,
  type ArticleAnalysis,
  type ArticleDetail,
  type ArticleSummary,
  type DigestAnalysis,
  type DigestDetail,
  type DigestSummary,
  type EvidenceLink,
  type IngestionJob,
  type ReviewRecord,
  type TopicAnalysis,
  type TopicDetail,
  type TopicSummary
} from "@insight-a16z/core";

import type { Env } from "./env";
import type {
  AnalysisRunRecord,
  ContentRepository,
  ListFilters,
  ObjectStore,
  ParsedArticle,
  ReviewActionInput,
  StoredArticle,
  StoredDigest,
  StoredTopic
} from "./types";
import { nowIso, parseJson, stringifyJson } from "./utils";

type StoredArticleRecord = StoredArticle;
type StoredTopicRecord = StoredTopic;
type StoredDigestRecord = StoredDigest;

function summarizeArticle(article: StoredArticleRecord): ArticleSummary {
  return {
    id: article.id,
    slug: article.slug,
    sourceUrl: article.sourceUrl,
    sourceTitle: article.sourceTitle,
    zhTitle: article.zhTitle,
    publishedAt: article.publishedAt,
    contentType: article.contentType,
    summary: article.summary,
    reviewState: article.reviewState,
    topics: article.relatedTopics.map((topic) => topic.slug)
  };
}

function summarizeTopic(topic: StoredTopicRecord): TopicSummary {
  return {
    id: topic.id,
    slug: topic.slug,
    name: topic.name,
    intro: topic.intro,
    articleCount: topic.articleCount,
    updatedAt: topic.updatedAt,
    reviewState: topic.reviewState
  };
}

function summarizeDigest(digest: StoredDigestRecord): DigestSummary {
  return {
    id: digest.id,
    slug: digest.slug,
    title: digest.title,
    weekStart: digest.weekStart,
    weekEnd: digest.weekEnd,
    reviewState: digest.reviewState,
    publishedAt: digest.publishedAt
  };
}

export class MemoryObjectStore implements ObjectStore {
  private objects = new Map<string, string>();

  async put(key: string, value: string): Promise<void> {
    this.objects.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return this.objects.get(key) ?? null;
  }

  clear(): void {
    this.objects.clear();
  }
}

let sharedMemoryRepository: MemoryRepository | null = null;
let sharedMemoryObjectStore: MemoryObjectStore | null = null;

class R2ObjectStore implements ObjectStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(key: string, value: string): Promise<void> {
    await this.bucket.put(key, value);
  }

  async get(key: string): Promise<string | null> {
    const object = await this.bucket.get(key);
    return object ? await object.text() : null;
  }
}

export class MemoryRepository implements ContentRepository {
  private articles = new Map<string, StoredArticleRecord>();
  private topics = new Map<string, StoredTopicRecord>();
  private digests = new Map<string, StoredDigestRecord>();
  private reviewStates = new Map<string, ReviewRecord>();
  private analysisRuns = new Map<string, AnalysisRunRecord>();
  private jobs = new Map<string, IngestionJob>();

  async seedFixtures(): Promise<void> {
    if (this.articles.size > 0) return;

    for (const article of sampleArticles) {
      const stored: StoredArticleRecord = {
        ...article,
        canonicalUrl: article.sourceUrl,
        rawR2Key: `raw/${article.id}.html`,
        cleanedR2Key: `cleaned/${article.id}.json`,
        publishedOn: article.reviewState === "published" ? article.publishedAt : null
      };
      this.articles.set(article.id, stored);
      this.reviewStates.set(`article:${article.id}`, {
        id: crypto.randomUUID(),
        entityType: "article",
        entityId: article.id,
        state: article.reviewState,
        reviewer: article.reviewState === "published" ? "fixtures@local.test" : null,
        reviewNote: null,
        updatedAt: nowIso()
      });
    }

    for (const topic of sampleTopics) {
      this.topics.set(topic.id, {
        ...topic,
        supportingArticleIds: topic.timeline.map((entry) => entry.articleId)
      });
      this.reviewStates.set(`topic:${topic.id}`, {
        id: crypto.randomUUID(),
        entityType: "topic",
        entityId: topic.id,
        state: topic.reviewState,
        reviewer: topic.reviewState === "published" ? "fixtures@local.test" : null,
        reviewNote: null,
        updatedAt: nowIso()
      });
    }

    for (const digest of sampleDigests) {
      this.digests.set(digest.id, digest);
      this.reviewStates.set(`digest:${digest.id}`, {
        id: crypto.randomUUID(),
        entityType: "digest",
        entityId: digest.id,
        state: digest.reviewState,
        reviewer: digest.reviewState === "published" ? "fixtures@local.test" : null,
        reviewNote: null,
        updatedAt: nowIso()
      });
    }

    for (const job of sampleJobs) {
      this.jobs.set(job.id, job);
    }
  }

  async clearAll(): Promise<void> {
    this.articles.clear();
    this.topics.clear();
    this.digests.clear();
    this.reviewStates.clear();
    this.analysisRuns.clear();
    this.jobs.clear();
  }

  async listArticles(filters: ListFilters = {}): Promise<ArticleSummary[]> {
    const items = [...this.articles.values()]
      .filter((article) => {
        if (filters.q) {
          const q = filters.q.toLowerCase();
          const haystack = `${article.zhTitle} ${article.summary} ${article.sourceTitle}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        if (filters.contentType && article.contentType !== filters.contentType) return false;
        if (filters.reviewState && article.reviewState !== filters.reviewState) return false;
        if (filters.topic && !article.relatedTopics.some((topic) => topic.slug === filters.topic)) return false;
        return true;
      })
      .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt))
      .map(summarizeArticle);

    return items;
  }

  async getArticleBySlug(slug: string): Promise<StoredArticle | null> {
    return [...this.articles.values()].find((article) => article.slug === slug) ?? null;
  }

  async getArticleById(id: string): Promise<StoredArticle | null> {
    return this.articles.get(id) ?? null;
  }

  async upsertArticleBase(article: ParsedArticle, keys: { rawR2Key: string; cleanedR2Key: string }): Promise<StoredArticle> {
    const existing = [...this.articles.values()].find((item) => item.sourceUrl === article.sourceUrl);
    const id = existing?.id ?? crypto.randomUUID();
    const stored: StoredArticleRecord = {
      id,
      slug: existing?.slug ?? article.sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""),
      sourceUrl: article.sourceUrl,
      canonicalUrl: article.canonicalUrl,
      sourceTitle: article.sourceTitle,
      zhTitle: existing?.zhTitle ?? article.sourceTitle,
      publishedAt: article.publishedAt,
      contentType: article.contentType,
      summary: existing?.summary ?? "",
      reviewState: existing?.reviewState ?? "ingested",
      topics: existing?.topics ?? [],
      keyPoints: existing?.keyPoints ?? [],
      keyJudgements: existing?.keyJudgements ?? [],
      outlook:
        existing?.outlook ?? {
          statement: "",
          timeHorizon: "",
          whyNow: "",
          signalsToWatch: [],
          confidence: "low"
        },
      evidenceLinks: existing?.evidenceLinks ?? [],
      relatedTopics: existing?.relatedTopics ?? [],
      rawR2Key: keys.rawR2Key,
      cleanedR2Key: keys.cleanedR2Key,
      publishedOn: existing?.publishedOn ?? null
    };
    this.articles.set(id, stored);
    this.reviewStates.set(`article:${id}`, {
      id: crypto.randomUUID(),
      entityType: "article",
      entityId: id,
      state: stored.reviewState,
      reviewer: null,
      reviewNote: null,
      updatedAt: nowIso()
    });
    return stored;
  }

  async updateArticleAnalysis(articleId: string, analysis: ArticleAnalysis): Promise<StoredArticle> {
    const existing = this.articles.get(articleId);
    if (!existing) throw new Error(`Article ${articleId} not found`);

    const relatedTopics = analysis.candidateTopics.map((topic) => ({
      slug: topic,
      name: topic
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ")
    }));
    const updated: StoredArticleRecord = {
      ...existing,
      zhTitle: analysis.zhTitle,
      summary: analysis.summary,
      keyPoints: analysis.keyPoints,
      keyJudgements: analysis.keyJudgements,
      outlook: analysis.outlook,
      evidenceLinks: analysis.evidenceLinks,
      topics: analysis.candidateTopics,
      relatedTopics,
      reviewState: existing.reviewState
    };
    this.articles.set(articleId, updated);
    this.reviewStates.set(`article:${articleId}`, {
      id: crypto.randomUUID(),
      entityType: "article",
      entityId: articleId,
      state: updated.reviewState,
      reviewer: null,
      reviewNote: null,
      updatedAt: nowIso()
    });
    return updated;
  }

  async listTopics(): Promise<TopicSummary[]> {
    return [...this.topics.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).map(summarizeTopic);
  }

  async getTopicBySlug(slug: string): Promise<StoredTopic | null> {
    return [...this.topics.values()].find((topic) => topic.slug === slug) ?? null;
  }

  async upsertTopicAnalysis(input: {
    slug: string;
    topicId?: string;
    analysis: TopicAnalysis;
    supportingArticles: StoredArticle[];
  }): Promise<StoredTopic> {
    const existing = [...this.topics.values()].find((topic) => topic.slug === input.slug);
    const id = existing?.id ?? input.topicId ?? crypto.randomUUID();
    const timeline = input.supportingArticles
      .sort((a, b) => a.publishedAt.localeCompare(b.publishedAt))
      .map((article) => ({
        articleId: article.id,
        slug: article.slug,
        title: article.zhTitle,
        publishedAt: article.publishedAt
      }));

    const evidenceLinks = input.supportingArticles.flatMap((article) => article.evidenceLinks).slice(0, 5);
    const topic: StoredTopicRecord = {
      id,
      slug: input.slug,
      name: input.analysis.topicName,
      intro: input.analysis.intro,
      articleCount: input.supportingArticles.length,
      updatedAt: nowIso(),
      reviewState: "reviewing",
      currentConsensus: input.analysis.currentConsensus,
      disagreements: input.analysis.disagreements,
      trendPredictions: input.analysis.trendPredictions,
      evidenceLinks,
      timeline,
      supportingArticleIds: input.supportingArticles.map((article) => article.id)
    };
    this.topics.set(id, topic);
    this.reviewStates.set(`topic:${id}`, {
      id: crypto.randomUUID(),
      entityType: "topic",
      entityId: id,
      state: "reviewing",
      reviewer: null,
      reviewNote: null,
      updatedAt: nowIso()
    });
    return topic;
  }

  async listDigests(): Promise<DigestSummary[]> {
    return [...this.digests.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart)).map(summarizeDigest);
  }

  async getDigestBySlug(slug: string): Promise<StoredDigest | null> {
    return [...this.digests.values()].find((digest) => digest.slug === slug) ?? null;
  }

  async upsertDigestAnalysis(input: {
    id?: string;
    slug: string;
    weekStart: string;
    weekEnd: string;
    analysis: DigestAnalysis;
  }): Promise<StoredDigest> {
    const existing = [...this.digests.values()].find((digest) => digest.slug === input.slug);
    const digest: StoredDigestRecord = {
      id: existing?.id ?? input.id ?? crypto.randomUUID(),
      slug: input.slug,
      title: input.analysis.title,
      weekStart: input.weekStart,
      weekEnd: input.weekEnd,
      reviewState: "reviewing",
      publishedAt: existing?.publishedAt ?? null,
      topSignals: input.analysis.topSignals,
      topicMovements: input.analysis.topicMovements,
      trendPredictions: input.analysis.trendPredictions,
      evidenceLinks: input.analysis.trendPredictions.flatMap((trend) => trend.supportingEvidence)
    };
    this.digests.set(digest.id, digest);
    this.reviewStates.set(`digest:${digest.id}`, {
      id: crypto.randomUUID(),
      entityType: "digest",
      entityId: digest.id,
      state: "reviewing",
      reviewer: null,
      reviewNote: null,
      updatedAt: nowIso()
    });
    return digest;
  }

  async setReviewState(input: ReviewActionInput): Promise<ReviewRecord> {
    const key = `${input.entityType}:${input.entityId}`;
    const updatedAt = nowIso();
    const record: ReviewRecord = {
      id: crypto.randomUUID(),
      entityType: input.entityType,
      entityId: input.entityId,
      state: input.state,
      reviewer: input.reviewer,
      reviewNote: input.note ?? null,
      updatedAt
    };
    this.reviewStates.set(key, record);

    if (input.entityType === "article") {
      const current = this.articles.get(input.entityId);
      if (current) {
        current.reviewState = input.state;
        current.publishedOn = input.state === "published" ? updatedAt : current.publishedOn;
        this.articles.set(current.id, current);
      }
    } else if (input.entityType === "topic") {
      const current = this.topics.get(input.entityId);
      if (current) {
        current.reviewState = input.state;
        this.topics.set(current.id, current);
      }
    } else {
      const current = this.digests.get(input.entityId);
      if (current) {
        current.reviewState = input.state;
        current.publishedAt = input.state === "published" ? updatedAt : current.publishedAt;
        this.digests.set(current.id, current);
      }
    }

    return record;
  }

  async listReviewStates(): Promise<ReviewRecord[]> {
    return [...this.reviewStates.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async createAnalysisRun(input: {
    runType: string;
    entityType: AnalysisRunRecord["entityType"];
    entityId: string;
    model?: string | null;
    promptVersion: string;
    inputR2Key?: string | null;
    outputR2Key?: string | null;
  }): Promise<AnalysisRunRecord> {
    const createdAt = nowIso();
    const run: AnalysisRunRecord = {
      id: crypto.randomUUID(),
      runType: input.runType,
      entityType: input.entityType,
      entityId: input.entityId,
      status: "running",
      model: input.model ?? null,
      promptVersion: input.promptVersion,
      inputR2Key: input.inputR2Key ?? null,
      outputR2Key: input.outputR2Key ?? null,
      errorMessage: null,
      createdAt,
      updatedAt: createdAt,
      durationMs: null
    };
    this.analysisRuns.set(run.id, run);
    return run;
  }

  async completeAnalysisRun(
    runId: string,
    status: AnalysisRunRecord["status"],
    input?: {
      outputR2Key?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<AnalysisRunRecord> {
    const current = this.analysisRuns.get(runId);
    if (!current) {
      throw new Error(`Analysis run ${runId} not found`);
    }

    const updatedAt = nowIso();
    const durationMs = Math.max(0, Date.parse(updatedAt) - Date.parse(current.createdAt));
    const updated: AnalysisRunRecord = {
      ...current,
      status,
      outputR2Key: input?.outputR2Key ?? current.outputR2Key,
      errorMessage: input?.errorMessage ?? null,
      updatedAt,
      durationMs
    };
    this.analysisRuns.set(runId, updated);
    return updated;
  }

  async listAnalysisRuns(filters?: {
    entityType?: AnalysisRunRecord["entityType"];
    entityId?: string;
  }): Promise<AnalysisRunRecord[]> {
    return [...this.analysisRuns.values()]
      .filter((run) => {
        if (filters?.entityType && run.entityType !== filters.entityType) return false;
        if (filters?.entityId && run.entityId !== filters.entityId) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createJob(jobType: string): Promise<IngestionJob> {
    const job: IngestionJob = {
      id: crypto.randomUUID(),
      jobType,
      status: "running",
      startedAt: nowIso(),
      endedAt: null,
      errorMessage: null,
      stats: {}
    };
    this.jobs.set(job.id, job);
    return job;
  }

  async completeJob(
    jobId: string,
    status: "succeeded" | "failed",
    stats: Record<string, number> = {},
    errorMessage?: string
  ): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) return;
    this.jobs.set(jobId, {
      ...job,
      status,
      endedAt: nowIso(),
      errorMessage: errorMessage ?? null,
      stats
    });
  }

  async listJobs(): Promise<IngestionJob[]> {
    return [...this.jobs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }
}

class D1Repository implements ContentRepository {
  constructor(private readonly db: D1Database) {}

  async seedFixtures(): Promise<void> {
    const count = await this.db.prepare("SELECT COUNT(*) as count FROM articles").first<{ count: number }>();
    if ((count?.count ?? 0) > 0) return;

    for (const article of sampleArticles) {
      await this.db
        .prepare(
          `INSERT INTO articles (
            id, source_url, canonical_url, slug, content_type, source_title, zh_title, published_at,
            summary, key_points_json, key_judgements_json, outlook_json, candidate_topics_json, raw_r2_key, cleaned_r2_key,
            review_state, published_on, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          article.id,
          article.sourceUrl,
          article.sourceUrl,
          article.slug,
          article.contentType,
          article.sourceTitle,
          article.zhTitle,
          article.publishedAt,
          article.summary,
          stringifyJson(article.keyPoints),
          stringifyJson(article.keyJudgements),
          stringifyJson(article.outlook),
          stringifyJson(article.relatedTopics.map((topic) => topic.slug)),
          `raw/${article.id}.html`,
          `cleaned/${article.id}.json`,
          article.reviewState,
          article.reviewState === "published" ? article.publishedAt : null,
          nowIso(),
          nowIso()
        )
        .run();
    }

    for (const topic of sampleTopics) {
      await this.db
        .prepare(
          `INSERT INTO topics (
            id, slug, name, intro, current_consensus_json, disagreements_json,
            trend_predictions_json, review_state, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          topic.id,
          topic.slug,
          topic.name,
          topic.intro,
          stringifyJson(topic.currentConsensus),
          stringifyJson(topic.disagreements),
          stringifyJson(topic.trendPredictions),
          topic.reviewState,
          topic.updatedAt
        )
        .run();
    }

    for (const digest of sampleDigests) {
      await this.db
        .prepare(
          `INSERT INTO weekly_digests (
            id, slug, title, week_start, week_end, top_signals_json,
            topic_movements_json, trend_predictions_json, review_state, published_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          digest.id,
          digest.slug,
          digest.title,
          digest.weekStart,
          digest.weekEnd,
          stringifyJson(digest.topSignals),
          stringifyJson(digest.topicMovements),
          stringifyJson(digest.trendPredictions),
          digest.reviewState,
          digest.publishedAt,
          nowIso(),
          nowIso()
        )
        .run();
    }
  }

  async clearAll(): Promise<void> {
    const statements = [
      "DELETE FROM article_topic_relations",
      "DELETE FROM evidence_blocks",
      "DELETE FROM trend_predictions",
      "DELETE FROM review_states",
      "DELETE FROM analysis_runs",
      "DELETE FROM ingestion_jobs",
      "DELETE FROM weekly_digests",
      "DELETE FROM topics",
      "DELETE FROM articles"
    ];

    for (const statement of statements) {
      await this.db.prepare(statement).run();
    }
  }

  async listArticles(filters: ListFilters = {}): Promise<ArticleSummary[]> {
    const rows = await this.db.prepare("SELECT * FROM articles ORDER BY published_at DESC").all<Record<string, string>>();
    return (rows.results ?? [])
      .map((row) => this.rowToArticle(row))
      .filter((article) => {
        if (filters.reviewState && article.reviewState !== filters.reviewState) return false;
        if (filters.contentType && article.contentType !== filters.contentType) return false;
        if (filters.q) {
          const q = filters.q.toLowerCase();
          return `${article.zhTitle} ${article.summary} ${article.sourceTitle}`.toLowerCase().includes(q);
        }
        return true;
      })
      .map(summarizeArticle);
  }

  async getArticleBySlug(slug: string): Promise<StoredArticle | null> {
    const row = await this.db.prepare("SELECT * FROM articles WHERE slug = ?").bind(slug).first<Record<string, string>>();
    return row ? this.rowToArticle(row) : null;
  }

  async getArticleById(id: string): Promise<StoredArticle | null> {
    const row = await this.db.prepare("SELECT * FROM articles WHERE id = ?").bind(id).first<Record<string, string>>();
    return row ? this.rowToArticle(row) : null;
  }

  async upsertArticleBase(article: ParsedArticle, keys: { rawR2Key: string; cleanedR2Key: string }): Promise<StoredArticle> {
    const existing = await this.db
      .prepare(
        `SELECT id, slug, zh_title, summary, key_points_json, key_judgements_json, candidate_topics_json,
                review_state, published_on, created_at
         FROM articles WHERE source_url = ?`
      )
      .bind(article.sourceUrl)
      .first<Record<string, string>>();

    const id = existing?.id ?? crypto.randomUUID();
    const slug = existing?.slug ?? article.sourceTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const timestamp = nowIso();

    if (existing) {
      await this.db
        .prepare(
          `UPDATE articles
           SET canonical_url = ?, slug = ?, content_type = ?, source_title = ?, published_at = ?,
               raw_r2_key = ?, cleaned_r2_key = ?, updated_at = ?
           WHERE id = ?`
        )
        .bind(
          article.canonicalUrl,
          slug,
          article.contentType,
          article.sourceTitle,
          article.publishedAt,
          keys.rawR2Key,
          keys.cleanedR2Key,
          timestamp,
          id
        )
        .run();
    } else {
      await this.db
        .prepare(
          `INSERT INTO articles (
            id, source_url, canonical_url, slug, content_type, source_title, zh_title, published_at, summary,
            key_points_json, key_judgements_json, candidate_topics_json, raw_r2_key, cleaned_r2_key, review_state,
            published_on, created_at, updated_at, outlook_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          article.sourceUrl,
          article.canonicalUrl,
          slug,
          article.contentType,
          article.sourceTitle,
          article.sourceTitle,
          article.publishedAt,
          "",
          "[]",
          "[]",
          "[]",
          keys.rawR2Key,
          keys.cleanedR2Key,
          "ingested",
          null,
          timestamp,
          timestamp,
          "{}"
        )
        .run();
    }

    const stored = await this.getArticleById(id);
    if (!stored) throw new Error("Failed to store article");
    return stored;
  }

  async updateArticleAnalysis(articleId: string, analysis: ArticleAnalysis): Promise<StoredArticle> {
    await this.db
      .prepare(
        `UPDATE articles
         SET zh_title = ?, summary = ?, key_points_json = ?, key_judgements_json = ?, candidate_topics_json = ?, updated_at = ?
         , outlook_json = ?
         WHERE id = ?`
      )
      .bind(
        analysis.zhTitle,
        analysis.summary,
        stringifyJson(analysis.keyPoints),
        stringifyJson(analysis.keyJudgements),
        stringifyJson(analysis.candidateTopics),
        nowIso(),
        stringifyJson(analysis.outlook),
        articleId
      )
      .run();

    await this.db.prepare("DELETE FROM evidence_blocks WHERE entity_type = 'article' AND entity_id = ?").bind(articleId).run();

    for (const evidence of analysis.evidenceLinks) {
      await this.db
        .prepare(
          `INSERT INTO evidence_blocks (
            id, entity_type, entity_id, source_article_id, purpose, claim, evidence_text, source_locator, created_at
          ) VALUES (?, 'article', ?, ?, 'article', ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          articleId,
          articleId,
          evidence.claim,
          evidence.evidenceText,
          evidence.sourceLocator,
          nowIso()
        )
        .run();
    }

    const stored = await this.getArticleById(articleId);
    if (!stored) throw new Error("Failed to update article analysis");
    return stored;
  }

  async listTopics(): Promise<TopicSummary[]> {
    const rows = await this.db.prepare("SELECT * FROM topics ORDER BY updated_at DESC").all<Record<string, string>>();
    return (rows.results ?? []).map((row) => summarizeTopic(this.rowToTopic(row)));
  }

  async getTopicBySlug(slug: string): Promise<StoredTopic | null> {
    const row = await this.db.prepare("SELECT * FROM topics WHERE slug = ?").bind(slug).first<Record<string, string>>();
    return row ? this.rowToTopic(row) : null;
  }

  async upsertTopicAnalysis(input: {
    slug: string;
    topicId?: string;
    analysis: TopicAnalysis;
    supportingArticles: StoredArticle[];
  }): Promise<StoredTopic> {
    const existing = await this.db.prepare("SELECT id FROM topics WHERE slug = ?").bind(input.slug).first<{ id: string }>();
    const topicId = existing?.id ?? input.topicId ?? crypto.randomUUID();

    await this.db
      .prepare(
        `INSERT OR REPLACE INTO topics (
          id, slug, name, intro, current_consensus_json, disagreements_json, trend_predictions_json, review_state, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'reviewing', ?)`
      )
      .bind(
        topicId,
        input.slug,
        input.analysis.topicName,
        input.analysis.intro,
        stringifyJson(input.analysis.currentConsensus),
        stringifyJson(input.analysis.disagreements),
        stringifyJson(input.analysis.trendPredictions),
        nowIso()
      )
      .run();

    await this.db.prepare("DELETE FROM article_topic_relations WHERE topic_id = ?").bind(topicId).run();
    for (const article of input.supportingArticles) {
      await this.db
        .prepare(
          "INSERT OR REPLACE INTO article_topic_relations (article_id, topic_id, relation_score, match_reason) VALUES (?, ?, ?, ?)"
        )
        .bind(article.id, topicId, 1, "ai-topic-clustering")
        .run();
    }

    await this.db.prepare("DELETE FROM trend_predictions WHERE topic_id = ?").bind(topicId).run();
    for (const trend of input.analysis.trendPredictions) {
      await this.db
        .prepare(
          `INSERT INTO trend_predictions (
            id, topic_id, statement, trigger_conditions_json, time_window, confidence, supporting_evidence_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          crypto.randomUUID(),
          topicId,
          trend.statement,
          stringifyJson(trend.triggerConditions),
          trend.timeWindow,
          trend.confidence,
          stringifyJson(trend.supportingEvidence),
          nowIso()
        )
        .run();
    }

    const stored = await this.getTopicBySlug(input.slug);
    if (!stored) throw new Error("Failed to update topic analysis");
    return stored;
  }

  async listDigests(): Promise<DigestSummary[]> {
    const rows = await this.db.prepare("SELECT * FROM weekly_digests ORDER BY week_start DESC").all<Record<string, string>>();
    return (rows.results ?? []).map((row) => summarizeDigest(this.rowToDigest(row)));
  }

  async getDigestBySlug(slug: string): Promise<StoredDigest | null> {
    const row = await this.db
      .prepare("SELECT * FROM weekly_digests WHERE slug = ?")
      .bind(slug)
      .first<Record<string, string>>();
    return row ? this.rowToDigest(row) : null;
  }

  async upsertDigestAnalysis(input: {
    id?: string;
    slug: string;
    weekStart: string;
    weekEnd: string;
    analysis: DigestAnalysis;
  }): Promise<StoredDigest> {
    const existing = await this.db.prepare("SELECT id FROM weekly_digests WHERE slug = ?").bind(input.slug).first<{ id: string }>();
    const id = existing?.id ?? input.id ?? crypto.randomUUID();
    await this.db
      .prepare(
        `INSERT OR REPLACE INTO weekly_digests (
          id, slug, title, week_start, week_end, top_signals_json, topic_movements_json, trend_predictions_json,
          review_state, published_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'reviewing', COALESCE((SELECT published_at FROM weekly_digests WHERE id = ?), NULL),
          COALESCE((SELECT created_at FROM weekly_digests WHERE id = ?), ?), ?)`
      )
      .bind(
        id,
        input.slug,
        input.analysis.title,
        input.weekStart,
        input.weekEnd,
        stringifyJson(input.analysis.topSignals),
        stringifyJson(input.analysis.topicMovements),
        stringifyJson(input.analysis.trendPredictions),
        id,
        id,
        nowIso(),
        nowIso()
      )
      .run();
    const stored = await this.getDigestBySlug(input.slug);
    if (!stored) throw new Error("Failed to update digest analysis");
    return stored;
  }

  async setReviewState(input: ReviewActionInput): Promise<ReviewRecord> {
    const record: ReviewRecord = {
      id: crypto.randomUUID(),
      entityType: input.entityType,
      entityId: input.entityId,
      state: input.state,
      reviewer: input.reviewer,
      reviewNote: input.note ?? null,
      updatedAt: nowIso()
    };
    await this.db
      .prepare(
        `INSERT INTO review_states (id, entity_type, entity_id, state, reviewer, review_note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(record.id, record.entityType, record.entityId, record.state, record.reviewer, record.reviewNote, record.updatedAt)
      .run();

    if (input.entityType === "article") {
      await this.db
        .prepare("UPDATE articles SET review_state = ?, published_on = CASE WHEN ? = 'published' THEN ? ELSE published_on END WHERE id = ?")
        .bind(input.state, input.state, record.updatedAt, input.entityId)
        .run();
    }

    if (input.entityType === "topic") {
      await this.db.prepare("UPDATE topics SET review_state = ? WHERE id = ?").bind(input.state, input.entityId).run();
    }

    if (input.entityType === "digest") {
      await this.db
        .prepare("UPDATE weekly_digests SET review_state = ?, published_at = CASE WHEN ? = 'published' THEN ? ELSE published_at END WHERE id = ?")
        .bind(input.state, input.state, record.updatedAt, input.entityId)
        .run();
    }

    return record;
  }

  async listReviewStates(): Promise<ReviewRecord[]> {
    const rows = await this.db.prepare("SELECT * FROM review_states ORDER BY updated_at DESC").all<Record<string, string>>();
    return (rows.results ?? []).map((row) => ({
      id: row.id,
      entityType: row.entity_type as ReviewRecord["entityType"],
      entityId: row.entity_id,
      state: row.state as ReviewRecord["state"],
      reviewer: row.reviewer ?? null,
      reviewNote: row.review_note ?? null,
      updatedAt: row.updated_at
    }));
  }

  async createAnalysisRun(input: {
    runType: string;
    entityType: AnalysisRunRecord["entityType"];
    entityId: string;
    model?: string | null;
    promptVersion: string;
    inputR2Key?: string | null;
    outputR2Key?: string | null;
  }): Promise<AnalysisRunRecord> {
    const run: AnalysisRunRecord = {
      id: crypto.randomUUID(),
      runType: input.runType,
      entityType: input.entityType,
      entityId: input.entityId,
      status: "running",
      model: input.model ?? null,
      promptVersion: input.promptVersion,
      inputR2Key: input.inputR2Key ?? null,
      outputR2Key: input.outputR2Key ?? null,
      errorMessage: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      durationMs: null
    };

    await this.db
      .prepare(
        `INSERT INTO analysis_runs (
          id, run_type, entity_type, entity_id, status, model, prompt_version, input_r2_key, output_r2_key,
          error_message, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        run.id,
        run.runType,
        run.entityType,
        run.entityId,
        run.status,
        run.model,
        run.promptVersion,
        run.inputR2Key,
        run.outputR2Key,
        run.errorMessage,
        run.createdAt,
        run.updatedAt
      )
      .run();

    return run;
  }

  async completeAnalysisRun(
    runId: string,
    status: AnalysisRunRecord["status"],
    input?: {
      outputR2Key?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<AnalysisRunRecord> {
    const updatedAt = nowIso();
    await this.db
      .prepare(
        `UPDATE analysis_runs
         SET status = ?, output_r2_key = COALESCE(?, output_r2_key), error_message = ?, updated_at = ?
         WHERE id = ?`
      )
      .bind(status, input?.outputR2Key ?? null, input?.errorMessage ?? null, updatedAt, runId)
      .run();

    const row = await this.db.prepare("SELECT * FROM analysis_runs WHERE id = ?").bind(runId).first<Record<string, string>>();
    if (!row) {
      throw new Error(`Analysis run ${runId} not found`);
    }
    return this.rowToAnalysisRun(row);
  }

  async listAnalysisRuns(filters?: {
    entityType?: AnalysisRunRecord["entityType"];
    entityId?: string;
  }): Promise<AnalysisRunRecord[]> {
    const clauses: string[] = [];
    const bindings: string[] = [];
    if (filters?.entityType) {
      clauses.push("entity_type = ?");
      bindings.push(filters.entityType);
    }
    if (filters?.entityId) {
      clauses.push("entity_id = ?");
      bindings.push(filters.entityId);
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const rows = await this.db
      .prepare(`SELECT * FROM analysis_runs ${whereClause} ORDER BY created_at DESC`)
      .bind(...bindings)
      .all<Record<string, string>>();
    return (rows.results ?? []).map((row) => this.rowToAnalysisRun(row));
  }

  async createJob(jobType: string): Promise<IngestionJob> {
    const job: IngestionJob = {
      id: crypto.randomUUID(),
      jobType,
      status: "running",
      startedAt: nowIso(),
      endedAt: null,
      errorMessage: null,
      stats: {}
    };
    await this.db
      .prepare(
        "INSERT INTO ingestion_jobs (id, job_type, status, started_at, ended_at, error_message, stats_json) VALUES (?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(job.id, job.jobType, job.status, job.startedAt, null, null, stringifyJson(job.stats))
      .run();
    return job;
  }

  async completeJob(
    jobId: string,
    status: "succeeded" | "failed",
    stats: Record<string, number> = {},
    errorMessage?: string
  ): Promise<void> {
    await this.db
      .prepare("UPDATE ingestion_jobs SET status = ?, ended_at = ?, error_message = ?, stats_json = ? WHERE id = ?")
      .bind(status, nowIso(), errorMessage ?? null, stringifyJson(stats), jobId)
      .run();
  }

  async listJobs(): Promise<IngestionJob[]> {
    const rows = await this.db.prepare("SELECT * FROM ingestion_jobs ORDER BY started_at DESC").all<Record<string, string>>();
    return (rows.results ?? []).map((row) => ({
      id: row.id,
      jobType: row.job_type,
      status: row.status as IngestionJob["status"],
      startedAt: row.started_at,
      endedAt: row.ended_at ?? null,
      errorMessage: row.error_message ?? null,
      stats: parseJson<Record<string, number>>(row.stats_json, {})
    }));
  }

  private rowToArticle(row: Record<string, string>): StoredArticleRecord {
    return {
      id: row.id,
      slug: row.slug,
      sourceUrl: row.source_url,
      canonicalUrl: row.canonical_url ?? row.source_url,
      sourceTitle: row.source_title,
      zhTitle: row.zh_title ?? row.source_title,
      publishedAt: row.published_at,
      contentType: row.content_type as ArticleDetail["contentType"],
      summary: row.summary ?? "",
      reviewState: row.review_state as ArticleDetail["reviewState"],
      topics: parseJson<string[]>(row.candidate_topics_json, []),
      keyPoints: parseJson<string[]>(row.key_points_json, []),
      keyJudgements: parseJson<string[]>(row.key_judgements_json, []),
      outlook: parseJson<ArticleDetail["outlook"]>(row.outlook_json, {
        statement: "",
        timeHorizon: "",
        whyNow: "",
        signalsToWatch: [],
        confidence: "low"
      }),
      evidenceLinks: [],
      relatedTopics: parseJson<string[]>(row.candidate_topics_json, []).map((slug) => ({
        slug,
        name: slug.replace(/-/g, " ")
      })),
      rawR2Key: row.raw_r2_key ?? null,
      cleanedR2Key: row.cleaned_r2_key ?? null,
      publishedOn: row.published_on ?? null
    };
  }

  private rowToAnalysisRun(row: Record<string, string>): AnalysisRunRecord {
    const createdAt = row.created_at;
    const updatedAt = row.updated_at;
    const durationMs =
      row.status === "running" ? null : Math.max(0, Date.parse(updatedAt) - Date.parse(createdAt));

    return {
      id: row.id,
      runType: row.run_type,
      entityType: row.entity_type as AnalysisRunRecord["entityType"],
      entityId: row.entity_id,
      status: row.status as AnalysisRunRecord["status"],
      model: row.model ?? null,
      promptVersion: row.prompt_version,
      inputR2Key: row.input_r2_key ?? null,
      outputR2Key: row.output_r2_key ?? null,
      errorMessage: row.error_message ?? null,
      createdAt,
      updatedAt,
      durationMs
    };
  }

  private rowToTopic(row: Record<string, string>): StoredTopicRecord {
    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      intro: row.intro ?? "",
      articleCount: 0,
      updatedAt: row.updated_at,
      reviewState: row.review_state as TopicDetail["reviewState"],
      currentConsensus: parseJson<string[]>(row.current_consensus_json, []),
      disagreements: parseJson<string[]>(row.disagreements_json, []),
      trendPredictions: parseJson<TopicDetail["trendPredictions"]>(row.trend_predictions_json, []),
      evidenceLinks: [],
      timeline: [],
      supportingArticleIds: []
    };
  }

  private rowToDigest(row: Record<string, string>): StoredDigestRecord {
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      weekStart: row.week_start,
      weekEnd: row.week_end,
      reviewState: row.review_state as DigestDetail["reviewState"],
      publishedAt: row.published_at ?? null,
      topSignals: parseJson<string[]>(row.top_signals_json, []),
      topicMovements: parseJson<string[]>(row.topic_movements_json, []),
      trendPredictions: parseJson<DigestDetail["trendPredictions"]>(row.trend_predictions_json, []),
      evidenceLinks: []
    };
  }
}

export function createRepository(env: Env): ContentRepository {
  if (env.DB) {
    return new D1Repository(env.DB);
  }

  if (!sharedMemoryRepository) {
    sharedMemoryRepository = new MemoryRepository();
  }

  return sharedMemoryRepository;
}

export function createObjectStore(env: Env): ObjectStore {
  if (env.CONTENT_BUCKET) {
    return new R2ObjectStore(env.CONTENT_BUCKET);
  }

  if (!sharedMemoryObjectStore) {
    sharedMemoryObjectStore = new MemoryObjectStore();
  }

  return sharedMemoryObjectStore;
}

export function resetMemoryStores(): void {
  sharedMemoryRepository = null;
  sharedMemoryObjectStore = null;
}

export function clearMemoryObjectStore(): void {
  sharedMemoryObjectStore?.clear();
}
