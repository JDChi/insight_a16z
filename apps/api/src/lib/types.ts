import type {
  AdminOverview,
  ArticleAnalysis,
  ArticleDetail,
  ArticleSummary,
  DigestAnalysis,
  DigestDetail,
  DigestSummary,
  IngestionJob,
  ReviewRecord,
  TopicAnalysis,
  TopicDetail,
  TopicSummary
} from "@insight-a16z/core";

export interface IngestionCandidate {
  url: string;
  title: string;
  publishedAt?: string;
  contentType?: string;
}

export interface ParsedArticle {
  sourceUrl: string;
  canonicalUrl: string;
  sourceTitle: string;
  publishedAt: string;
  contentType: "Article" | "Investment News";
  authors: string[];
  plainText: string;
  sections: Array<{
    heading: string;
    content: string;
  }>;
}

export interface StoredArticle extends ArticleDetail {
  canonicalUrl?: string;
  rawR2Key: string | null;
  cleanedR2Key: string | null;
  publishedOn: string | null;
}

export interface StoredTopic extends TopicDetail {
  supportingArticleIds: string[];
}

export interface StoredDigest extends DigestDetail {}

export interface AnalysisRunRecord {
  id: string;
  runType: string;
  entityType: "article" | "topic" | "digest";
  entityId: string;
  status: "running" | "succeeded" | "failed" | "rejected";
  model: string | null;
  promptVersion: string;
  inputR2Key: string | null;
  outputR2Key: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  durationMs: number | null;
}

export interface ListFilters {
  q?: string;
  contentType?: string;
  topic?: string;
  reviewState?: string;
}

export interface ReviewActionInput {
  entityType: "article" | "topic" | "digest";
  entityId: string;
  state: "ingested" | "processing" | "approved" | "rejected" | "published" | "failed";
  reviewer: string | null;
  note?: string;
}

export interface ContentRepository {
  seedFixtures(): Promise<void>;
  clearAll(): Promise<void>;
  listArticles(filters?: ListFilters): Promise<ArticleSummary[]>;
  getArticleBySlug(slug: string): Promise<StoredArticle | null>;
  getArticleById(id: string): Promise<StoredArticle | null>;
  upsertArticleBase(article: ParsedArticle, keys: { rawR2Key: string; cleanedR2Key: string }): Promise<StoredArticle>;
  updateArticleAnalysis(articleId: string, analysis: ArticleAnalysis): Promise<StoredArticle>;
  listTopics(): Promise<TopicSummary[]>;
  getTopicBySlug(slug: string): Promise<StoredTopic | null>;
  upsertTopicAnalysis(input: {
    slug: string;
    topicId?: string;
    analysis: TopicAnalysis;
    supportingArticles: StoredArticle[];
  }): Promise<StoredTopic>;
  listDigests(): Promise<DigestSummary[]>;
  getDigestBySlug(slug: string): Promise<StoredDigest | null>;
  upsertDigestAnalysis(input: {
    id?: string;
    slug: string;
    weekStart: string;
    weekEnd: string;
    analysis: DigestAnalysis;
  }): Promise<StoredDigest>;
  setReviewState(input: ReviewActionInput): Promise<ReviewRecord>;
  listReviewStates(): Promise<ReviewRecord[]>;
  createAnalysisRun(input: {
    runType: string;
    entityType: AnalysisRunRecord["entityType"];
    entityId: string;
    model?: string | null;
    promptVersion: string;
    inputR2Key?: string | null;
    outputR2Key?: string | null;
  }): Promise<AnalysisRunRecord>;
  completeAnalysisRun(
    runId: string,
    status: AnalysisRunRecord["status"],
    input?: {
      outputR2Key?: string | null;
      errorMessage?: string | null;
    }
  ): Promise<AnalysisRunRecord>;
  listAnalysisRuns(filters?: {
    entityType?: AnalysisRunRecord["entityType"];
    entityId?: string;
  }): Promise<AnalysisRunRecord[]>;
  createJob(jobType: string): Promise<IngestionJob>;
  completeJob(jobId: string, status: "succeeded" | "failed", stats?: Record<string, number>, errorMessage?: string): Promise<void>;
  listJobs(): Promise<IngestionJob[]>;
  getAdminOverview(): Promise<AdminOverview>;
}

export interface ObjectStore {
  put(key: string, value: string): Promise<void>;
  get(key: string): Promise<string | null>;
}
