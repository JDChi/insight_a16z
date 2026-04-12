import { generateObject } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import {
  articleAnalysisSchema,
  digestAnalysisSchema,
  topicAnalysisSchema,
  type ArticleAnalysis,
  type DigestAnalysis,
  type TopicAnalysis
} from "@insight-a16z/core";

import type { Env } from "./env";
import type { StoredArticle } from "./types";
import { slugify, unique } from "./utils";

export interface AnalysisClient {
  analyzeArticle(article: {
    sourceTitle: string;
    contentType: string;
    publishedAt: string;
    plainText: string;
  }): Promise<ArticleAnalysis>;
  analyzeTopic(topicSlug: string, articles: StoredArticle[]): Promise<TopicAnalysis>;
  analyzeDigest(input: { weekStart: string; weekEnd: string; articles: StoredArticle[] }): Promise<DigestAnalysis>;
}

function inferTopicsFromText(text: string): string[] {
  const normalized = text.toLowerCase();
  const topics: string[] = [];

  if (normalized.includes("agent")) topics.push("agent-workflows");
  if (normalized.includes("enterprise")) topics.push("enterprise-ai");
  if (normalized.includes("consumer") || normalized.includes("companions")) topics.push("consumer-ai");
  if (normalized.includes("voice") || normalized.includes("video")) topics.push("generative-media");
  if (normalized.includes("infra") || normalized.includes("model")) topics.push("ai-infra");

  return unique(topics.length > 0 ? topics : ["general-ai"]);
}

export class HeuristicAnalysisClient implements AnalysisClient {
  async analyzeArticle(article: {
    sourceTitle: string;
    contentType: string;
    publishedAt: string;
    plainText: string;
  }): Promise<ArticleAnalysis> {
    const sentences = article.plainText
      .split(/(?<=[.!?。！？])\s+/)
      .map((item) => item.trim())
      .filter(Boolean);
    const keyPoints = unique(sentences.slice(0, 5)).slice(0, 5);
    const keyJudgements = unique(sentences.slice(1, 4)).slice(0, 3);
    const candidateTopics = inferTopicsFromText(`${article.sourceTitle}\n${article.plainText}`);

    return {
      zhTitle: article.sourceTitle,
      summary: sentences.slice(0, 2).join(" ") || article.sourceTitle,
      keyPoints: keyPoints.length >= 3 ? keyPoints.slice(0, 3) : [article.sourceTitle, ...keyPoints].slice(0, 3),
      keyJudgements:
        keyJudgements.length >= 2 ? keyJudgements.slice(0, 2) : ["文章强调 AI 赛道的结构性变化。", ...keyJudgements].slice(0, 2),
      candidateTopics,
      evidenceLinks: keyPoints.slice(0, 2).map((point, index) => ({
        claim: keyJudgements[index] ?? point,
        evidenceText: point,
        sourceLocator: `paragraph:${index + 1}`
      }))
    };
  }

  async analyzeTopic(topicSlug: string, articles: StoredArticle[]): Promise<TopicAnalysis> {
    const articleIds = articles.map((article) => article.id);
    const sentences = unique(articles.flatMap((article) => article.keyJudgements)).slice(0, 5);
    return {
      topicName: topicSlug
        .split("-")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" "),
      intro: `${topicSlug} 专题汇总了最近相关文章中反复出现的判断。`,
      currentConsensus: sentences.slice(0, 3).length > 0 ? sentences.slice(0, 3) : ["近期文章在同一主题上持续强化。"],
      disagreements: sentences.slice(3, 4),
      trendPredictions: [
        {
          statement: `${topicSlug} 相关产品会继续朝更成熟的产品化与商业化形态演进。`,
          triggerConditions: ["文章讨论持续增加", "相关投资动态继续出现"],
          timeWindow: "未来 1-2 年",
          confidence: "medium",
          supportingEvidence: articles.flatMap((article) => article.evidenceLinks).slice(0, 2)
        },
        {
          statement: `${topicSlug} 的竞争重点会从模型能力延伸到分发、工作流和用户体验。`,
          triggerConditions: ["赛道参与者增多", "产品功能趋于同质化"],
          timeWindow: "未来 1-2 年",
          confidence: "medium",
          supportingEvidence: articles.flatMap((article) => article.evidenceLinks).slice(0, 2)
        }
      ],
      supportingArticleIds: articleIds
    };
  }

  async analyzeDigest(input: { weekStart: string; weekEnd: string; articles: StoredArticle[] }): Promise<DigestAnalysis> {
    const topSignals = unique(input.articles.flatMap((article) => article.keyJudgements)).slice(0, 3);
    return {
      title: `a16z AI 周报 ${input.weekStart} - ${input.weekEnd}`,
      topSignals: topSignals.length > 0 ? topSignals : ["本周文章继续强化 AI 结构性机会。"],
      topicMovements: unique(input.articles.flatMap((article) => article.topics)).slice(0, 4),
      trendPredictions: [
        {
          statement: "a16z 关注主题会继续从模型能力外溢到产品与商业化执行。",
          triggerConditions: ["Investment News 持续与主题文章形成印证", "专题内文章数量上升"],
          timeWindow: "未来 1-2 年",
          confidence: "medium",
          supportingEvidence: input.articles.flatMap((article) => article.evidenceLinks).slice(0, 2)
        },
        {
          statement: "专题之间的界限会变弱，更多洞察将围绕复合型产品展开。",
          triggerConditions: ["同一文章同时覆盖多个主题", "跨领域产品案例增加"],
          timeWindow: "未来 1-2 年",
          confidence: "low",
          supportingEvidence: input.articles.flatMap((article) => article.evidenceLinks).slice(0, 2)
        }
      ]
    };
  }
}

export class VercelAiAnalysisClient implements AnalysisClient {
  private readonly openai;
  private readonly modelName: string;

  constructor(env: Env) {
    if (!env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is required for VercelAiAnalysisClient");
    }

    this.openai = createOpenAI({
      apiKey: env.OPENAI_API_KEY
    });
    this.modelName = env.OPENAI_MODEL ?? "gpt-4.1-mini";
  }

  async analyzeArticle(article: {
    sourceTitle: string;
    contentType: string;
    publishedAt: string;
    plainText: string;
  }): Promise<ArticleAnalysis> {
    const result = await generateObject({
      model: this.openai(this.modelName),
      schema: articleAnalysisSchema,
      prompt: [
        "你是一个严谨的中文科技内容分析助手。",
        "请将 a16z 的原文文章分析为结构化中文结果，保持信息密度高，避免营销语气。",
        "候选专题 slug 使用英文 kebab-case，例如 agent-workflows、consumer-ai。",
        `标题: ${article.sourceTitle}`,
        `类型: ${article.contentType}`,
        `发布日期: ${article.publishedAt}`,
        "正文:",
        article.plainText
      ].join("\n")
    });

    return articleAnalysisSchema.parse(result.object);
  }

  async analyzeTopic(topicSlug: string, articles: StoredArticle[]): Promise<TopicAnalysis> {
    const context = articles
      .map(
        (article) =>
          `文章: ${article.zhTitle}\n摘要: ${article.summary}\n判断: ${article.keyJudgements.join(" | ")}\n证据: ${article.evidenceLinks
            .map((item) => item.evidenceText)
            .join(" | ")}`
      )
      .join("\n\n");

    const result = await generateObject({
      model: this.openai(this.modelName),
      schema: topicAnalysisSchema,
      prompt: [
        "你是一个严谨的中文 AI 研究编辑。",
        "请基于多篇 a16z 文章生成专题分析，输出必须可验证，趋势推演需要克制且带条件。",
        `专题 slug: ${topicSlug}`,
        context
      ].join("\n")
    });

    return topicAnalysisSchema.parse(result.object);
  }

  async analyzeDigest(input: { weekStart: string; weekEnd: string; articles: StoredArticle[] }): Promise<DigestAnalysis> {
    const context = input.articles
      .map((article) => `${article.zhTitle}\n${article.summary}\n${article.keyJudgements.join(" | ")}`)
      .join("\n\n");

    const result = await generateObject({
      model: this.openai(this.modelName),
      schema: digestAnalysisSchema,
      prompt: [
        "你是一个严谨的中文科技周报编辑。",
        "请基于本周收录的 a16z AI 文章生成结构化周报，突出最重要的信号与趋势变化。",
        `周报周期: ${input.weekStart} 至 ${input.weekEnd}`,
        context
      ].join("\n")
    });

    return digestAnalysisSchema.parse(result.object);
  }
}

export function createAnalysisClient(env: Env): AnalysisClient {
  if (env.OPENAI_API_KEY) {
    return new VercelAiAnalysisClient(env);
  }

  return new HeuristicAnalysisClient();
}

export function slugFromTopicName(name: string): string {
  return slugify(name);
}
