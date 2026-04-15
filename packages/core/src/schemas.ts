import { z } from "zod";

import {
  confidenceLevels,
  contentTypes,
  entityTypes,
  reviewStates
} from "./content-types";

export const evidenceLinkSchema = z.object({
  claim: z.string().min(1),
  evidenceText: z.string().min(1),
  sourceLocator: z.string().min(1)
});

export const trendPredictionSchema = z.object({
  statement: z.string().min(1),
  triggerConditions: z.array(z.string().min(1)).min(1).max(4),
  timeWindow: z.string().min(1),
  confidence: z.enum(confidenceLevels),
  supportingEvidence: z.array(evidenceLinkSchema).min(1)
});

export const articleOutlookSchema = z.object({
  statement: z.string().min(1),
  timeHorizon: z.string().min(1),
  whyNow: z.string().min(1),
  signalsToWatch: z.array(z.string().min(1)).min(1).max(4),
  confidence: z.enum(confidenceLevels)
});

export const articleAnalysisSchema = z.object({
  zhTitle: z.string().min(1),
  summary: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(3).max(5),
  keyJudgements: z.array(z.string().min(1)).min(2).max(5),
  outlook: articleOutlookSchema,
  candidateTopics: z.array(z.string().min(1)).min(1).max(4),
  evidenceLinks: z.array(evidenceLinkSchema).min(2)
});

export const topicAnalysisSchema = z.object({
  topicName: z.string().min(1),
  intro: z.string().min(1),
  currentConsensus: z.array(z.string().min(1)).min(2).max(5),
  disagreements: z.array(z.string().min(1)).max(4),
  trendPredictions: z.array(trendPredictionSchema).min(2).max(4),
  supportingArticleIds: z.array(z.string().min(1)).min(1)
});

export const digestAnalysisSchema = z.object({
  title: z.string().min(1),
  topSignals: z.array(z.string().min(1)).min(3).max(5),
  topicMovements: z.array(z.string().min(1)).min(2).max(5),
  trendPredictions: z.array(trendPredictionSchema).min(2).max(4)
});

export const articleSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  sourceUrl: z.string().url(),
  sourceTitle: z.string().min(1),
  zhTitle: z.string().min(1),
  publishedAt: z.string().min(1),
  contentType: z.enum(contentTypes),
  summary: z.string().min(1),
  reviewState: z.enum(reviewStates),
  topics: z.array(z.string()).default([])
});

export const articleDetailSchema = articleSummarySchema.extend({
  keyPoints: z.array(z.string().min(1)),
  keyJudgements: z.array(z.string().min(1)),
  outlook: articleOutlookSchema,
  evidenceLinks: z.array(evidenceLinkSchema),
  relatedTopics: z.array(
    z.object({
      slug: z.string().min(1),
      name: z.string().min(1)
    })
  )
});

export const topicSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  name: z.string().min(1),
  intro: z.string().min(1),
  articleCount: z.number().int().nonnegative(),
  updatedAt: z.string().min(1),
  reviewState: z.enum(reviewStates)
});

export const topicDetailSchema = topicSummarySchema.extend({
  currentConsensus: z.array(z.string().min(1)),
  disagreements: z.array(z.string().min(1)),
  trendPredictions: z.array(trendPredictionSchema),
  evidenceLinks: z.array(evidenceLinkSchema),
  timeline: z.array(
    z.object({
      articleId: z.string().min(1),
      slug: z.string().min(1),
      title: z.string().min(1),
      publishedAt: z.string().min(1)
    })
  )
});

export const digestSummarySchema = z.object({
  id: z.string().min(1),
  slug: z.string().min(1),
  title: z.string().min(1),
  weekStart: z.string().min(1),
  weekEnd: z.string().min(1),
  reviewState: z.enum(reviewStates),
  publishedAt: z.string().nullable()
});

export const digestDetailSchema = digestSummarySchema.extend({
  topSignals: z.array(z.string().min(1)),
  topicMovements: z.array(z.string().min(1)),
  trendPredictions: z.array(trendPredictionSchema),
  evidenceLinks: z.array(evidenceLinkSchema)
});

export const reviewRecordSchema = z.object({
  id: z.string().min(1),
  entityType: z.enum(entityTypes),
  entityId: z.string().min(1),
  state: z.enum(reviewStates),
  reviewer: z.string().nullable(),
  reviewNote: z.string().nullable(),
  updatedAt: z.string().min(1)
});

export const ingestionJobSchema = z.object({
  id: z.string().min(1),
  jobType: z.string().min(1),
  status: z.enum(["pending", "running", "succeeded", "failed"]),
  startedAt: z.string().min(1),
  endedAt: z.string().nullable(),
  errorMessage: z.string().nullable(),
  stats: z.record(z.string(), z.number()).default({})
});

export type EvidenceLink = z.infer<typeof evidenceLinkSchema>;
export type TrendPrediction = z.infer<typeof trendPredictionSchema>;
export type ArticleOutlook = z.infer<typeof articleOutlookSchema>;
export type ArticleAnalysis = z.infer<typeof articleAnalysisSchema>;
export type TopicAnalysis = z.infer<typeof topicAnalysisSchema>;
export type DigestAnalysis = z.infer<typeof digestAnalysisSchema>;
export type ArticleSummary = z.infer<typeof articleSummarySchema>;
export type ArticleDetail = z.infer<typeof articleDetailSchema>;
export type TopicSummary = z.infer<typeof topicSummarySchema>;
export type TopicDetail = z.infer<typeof topicDetailSchema>;
export type DigestSummary = z.infer<typeof digestSummarySchema>;
export type DigestDetail = z.infer<typeof digestDetailSchema>;
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
export type IngestionJob = z.infer<typeof ingestionJobSchema>;
