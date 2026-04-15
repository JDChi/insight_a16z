import { generateText, Output } from "ai";
import {
  articleAnalysisSchema,
  articleOutlookSchema,
  type ArticleOutlook,
  digestAnalysisSchema,
  topicAnalysisSchema,
  type ArticleAnalysis,
  type DigestAnalysis,
  type TopicAnalysis
} from "@insight-a16z/core";
import { createMinimax, createMinimaxOpenAI } from "vercel-minimax-ai-provider";

import type { Env } from "./env";
import type { StoredArticle } from "./types";
import { slugify, unique } from "./utils";

interface AiProviderConfig {
  apiKey: string;
  baseURL?: string;
  modelName: string;
  compatMode: "anthropic" | "openai";
}

interface PromptConfig {
  objectPrompt: string;
  jsonPrompt: string;
}

interface ArticleGenerationInput {
  sourceTitle: string;
  contentType: string;
  publishedAt: string;
  plainText: string;
}

export interface ArticleFactExtractionResult {
  summary: string;
  keyPoints: string[];
  candidateTopics: string[];
  evidenceLinks: ArticleAnalysis["evidenceLinks"];
}

export interface ArticleJudgementResult {
  keyJudgements: string[];
  coreShift: string;
}

export interface ArticleTitleGenerationResult {
  zhTitle: string;
}

type ArticleAnalysisPipelineStages = {
  extractFacts: (article: ArticleGenerationInput) => Promise<ArticleFactExtractionResult>;
  deriveJudgements: (
    article: ArticleGenerationInput,
    facts: ArticleFactExtractionResult
  ) => Promise<ArticleJudgementResult>;
  generateTitle: (
    article: ArticleGenerationInput,
    facts: ArticleFactExtractionResult,
    judgements: ArticleJudgementResult
  ) => Promise<string>;
  generateOutlook: (
    article: ArticleGenerationInput,
    facts: ArticleFactExtractionResult,
    judgements: ArticleJudgementResult
  ) => Promise<ArticleOutlook>;
};

export class AnalysisOutputRejectedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnalysisOutputRejectedError";
  }
}

const MAX_ARTICLE_PROMPT_CHARS = 12000;
const MODEL_TIMEOUT_MS = 120000;
const titleStopWords = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "with", "by"]);

function containsChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function titleCaseTopic(topic: string): string {
  return topic
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function topicSlugToChineseName(topic: string): string {
  if (topic === "enterprise-ai") return "企业 AI";
  if (topic === "consumer-ai") return "消费级 AI";
  if (topic === "generative-media") return "生成式媒体";
  if (topic === "ai-infra") return "AI 基础设施";
  if (topic === "agent-workflows") return "Agent 工作流";
  if (topic === "ai-interface") return "AI 界面";
  if (topic === "general-ai") return "通用 AI";
  return titleCaseTopic(topic);
}

export function deriveInsightTitle(input: {
  sourceTitle: string;
  summary: string;
  keyJudgements: string[];
  candidateTopics: string[];
}): string {
  const source = input.sourceTitle.toLowerCase();
  const summary = input.summary.toLowerCase();
  const firstJudgement = input.keyJudgements[0] ?? "";
  const topic = input.candidateTopics[0];

  if (source.includes("retention")) {
    return "AI 产品竞争开始从增长转向留存";
  }

  if (source.includes("enterprise") && (source.includes("cios") || source.includes("buying"))) {
    return "企业 GenAI 采购正在从试点走向体系化";
  }

  if (source.includes("modelbusters")) {
    return "AI 正在放大头部模型与应用格局的分化";
  }

  if (source.includes("agent") || summary.includes("agent")) {
    return "Agent 正在从演示能力转向真正可执行的工作流";
  }

  if (source.includes("consumer") || source.includes("companion")) {
    return "消费级 AI 的胜负手正在变成留存与关系设计";
  }

  if (source.includes("infra") || source.includes("model stack")) {
    return "AI 基础设施竞争正在向平台化能力集中";
  }

  if (topic) {
    return `${titleCaseTopic(topic)} 赛道正在出现新的产品与市场信号`;
  }

  return firstJudgement.length > 0 ? firstJudgement : input.sourceTitle;
}

function shouldUseGeneratedInsightTitle(title: string, sourceTitle: string): boolean {
  const normalizedTitle = title.trim();
  const normalizedSource = sourceTitle.trim();

  if (normalizedTitle.length === 0) {
    return false;
  }

  if (!containsChinese(normalizedTitle)) {
    return false;
  }

  if (normalizedTitle.toLowerCase() === normalizedSource.toLowerCase()) {
    return false;
  }

  return true;
}

function extractSourceAwareTitleHint(sourceTitle: string, sourceUrl: string): string {
  const normalizedTitle = sourceTitle
    .replace(/\s*\|\s*(a16z|Andreessen Horowitz)\s*$/i, "")
    .replace(/[—–:|]+/g, " ")
    .replace(/[^\p{L}\p{N}\s$&+-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const investingMatch = normalizedTitle.match(/^investing in\s+(.+)$/i);
  if (investingMatch?.[1]) {
    return investingMatch[1].trim();
  }

  const words = normalizedTitle
    .split(" ")
    .filter((word) => word.length > 0)
    .filter((word, index) => index === 0 || !titleStopWords.has(word.toLowerCase()));
  const compact = words.slice(0, 6).join(" ").trim();
  if (compact.length > 0) {
    return compact;
  }

  const slugHint = sourceUrl
    .split("/")
    .filter(Boolean)
    .pop()
    ?.replace(/-/g, " ")
    .trim();

  return slugHint && slugHint.length > 0 ? slugHint : "来源文章";
}

export function ensureUniqueInsightTitle(
  baseTitle: string,
  input: { sourceTitle: string; sourceUrl: string; existingTitles: string[] }
): string {
  const normalizedExisting = new Set(input.existingTitles.map((title) => title.trim()).filter(Boolean));
  const normalizedBase = baseTitle.trim();

  if (!normalizedExisting.has(normalizedBase)) {
    return normalizedBase;
  }

  const hint = extractSourceAwareTitleHint(input.sourceTitle, input.sourceUrl);
  const withHint = `${normalizedBase} · ${hint}`.trim();
  if (!normalizedExisting.has(withHint)) {
    return withHint;
  }

  let suffix = 2;
  while (normalizedExisting.has(`${withHint} ${suffix}`)) {
    suffix += 1;
  }

  return `${withHint} ${suffix}`;
}

function buildChineseFallbackAnalysis(input: {
  sourceTitle: string;
  contentType: string;
  candidateTopics: string[];
  plainText: string;
}) {
  const source = input.sourceTitle.toLowerCase();
  const normalizedText = `${input.sourceTitle}\n${input.plainText}`.toLowerCase();
  const leadTopic = input.candidateTopics[0] ?? "general-ai";
  const topicName = topicSlugToChineseName(leadTopic);
  const contentTypeLabel = input.contentType === "Investment News" ? "投资动态" : "文章";

  if (source.includes("retention")) {
    return {
      summary: "文章认为，AI 产品的竞争重心正在从新增与模型炫技转向留存、复访和长期使用行为。",
      keyPoints: [
        "留存和重复使用正在成为衡量 AI 产品质量的核心指标。",
        "单纯依赖新奇功能和高速增长，难以形成稳定的产品优势。",
        "产品团队开始把习惯形成和长期价值放到更靠前的位置。"
      ],
      keyJudgements: [
        "AI 产品的胜负手正在从增长效率转向留存质量。",
        "真正的产品壁垒会更多体现在持续使用和用户习惯上。"
      ]
    };
  }

  if (source.includes("enterprise") && (source.includes("cios") || source.includes("buying"))) {
    return {
      summary: "文章指出，企业对 GenAI 的采购正从试点尝鲜转向预算、部署和治理都更完整的体系化阶段。",
      keyPoints: [
        "企业买方开始更系统地评估模型、工具链和交付能力。",
        "采购决策越来越看重落地速度、治理能力和长期可维护性。",
        "从单点实验走向组织级部署，正在成为企业 AI 的主线。"
      ],
      keyJudgements: [
        "企业 GenAI 市场已经从试点阶段进入体系化建设阶段。",
        "能够同时满足效果、治理和采购协同的产品更容易胜出。"
      ]
    };
  }

  if (source.includes("modelbusters")) {
    return {
      summary: "文章强调，AI 正在放大头部模型、应用分发和商业化执行之间的分层，行业格局会继续拉开差距。",
      keyPoints: [
        "模型能力之外，分发和商业化执行正在变得更重要。",
        "头部玩家会因为资源、渠道和产品速度进一步扩大优势。",
        "应用层与模型层之间的分工会继续细化。"
      ],
      keyJudgements: [
        "AI 行业的分化会随着模型能力扩散而进一步加深。",
        "未来竞争不会只看模型性能，还会看产品化和市场进入能力。"
      ]
    };
  }

  if (normalizedText.includes("agent")) {
    return {
      summary: `${contentTypeLabel}围绕 ${topicName} 展开，重点不再是演示效果，而是任务闭环、可控性和真正落地。`,
      keyPoints: [
        "Agent 的价值开始从对话体验转向执行具体任务。",
        "审批、回滚和可观测性会影响这类产品能否进入真实工作流。",
        "企业采用速度取决于系统是否能稳定接入现有流程。"
      ],
      keyJudgements: [
        "Agent 正在从演示能力转向真正可执行的工作流。",
        "可控性和流程整合会决定 Agent 产品的落地深度。"
      ]
    };
  }

  if (normalizedText.includes("consumer") || normalizedText.includes("companion")) {
    return {
      summary: `${contentTypeLabel}聚焦 ${topicName}，强调消费级 AI 的竞争正在从新奇体验转向关系、留存和分发。`,
      keyPoints: [
        "消费级 AI 产品越来越依赖持续使用而不是一次性体验。",
        "角色设定、反馈循环和产品氛围会影响长期留存。",
        "分发能力会继续左右消费产品的放大速度。"
      ],
      keyJudgements: [
        "消费级 AI 的胜负手正在变成留存与关系设计。",
        "分发和产品体验会比单纯模型能力更能拉开差距。"
      ]
    };
  }

  if (normalizedText.includes("infra") || normalizedText.includes("model")) {
    return {
      summary: `${contentTypeLabel}讨论了 ${topicName} 的新变化，重点落在平台能力、成本结构和生态位演进。`,
      keyPoints: [
        "基础设施层的竞争正在从单点能力转向平台组合能力。",
        "成本、稳定性和工程效率会继续影响基础设施采用。",
        "模型层与应用层之间会形成更明确的分工。"
      ],
      keyJudgements: [
        "AI 基础设施竞争正在向平台化能力集中。",
        "工程效率和成本控制会成为基础设施产品的重要门槛。"
      ]
    };
  }

  return {
    summary: `${contentTypeLabel}聚焦 ${topicName} 的最新变化，文章强调这个方向正在出现更清晰的产品与市场信号。`,
    keyPoints: [
      `${topicName} 相关产品正在从概念验证走向更清晰的产品化路径。`,
      "市场讨论的重点正在从单一能力转向系统化落地。",
      "随着案例增加，行业对商业化节奏的判断也在变得更明确。"
    ],
    keyJudgements: [
      `${topicName} 赛道正在出现新的产品与市场信号。`,
      "未来竞争会更多围绕产品化执行和商业化效率展开。"
    ]
  };
}

function buildArticleOutlook(input: {
  sourceTitle: string;
  summary: string;
  keyJudgements: string[];
  candidateTopics: string[];
  plainText: string;
}): ArticleOutlook {
  const source = input.sourceTitle.toLowerCase();
  const normalizedText = `${input.sourceTitle}\n${input.summary}\n${input.keyJudgements.join("\n")}\n${input.plainText}`.toLowerCase();
  const topic = input.candidateTopics[0] ?? "general-ai";
  const topicName = topicSlugToChineseName(topic);

  if (source.includes("retention")) {
    return {
      statement: "未来 6-12 个月，AI 产品团队会更系统地把留存和复访当成产品优化的主战场。",
      timeHorizon: "未来 6-12 个月",
      whyNow: "文章已经把竞争焦点从新增和新奇功能转向长期使用行为与留存质量。",
      signalsToWatch: ["产品指标是否更强调复访和留存", "更多案例是否开始围绕习惯形成展开"],
      confidence: "high"
    };
  }

  if (source.includes("enterprise") || normalizedText.includes("cio") || normalizedText.includes("procurement")) {
    return {
      statement: "未来 6-12 个月，企业 AI 采购会更快从试点预算转向平台化和治理导向的正式采购。",
      timeHorizon: "未来 6-12 个月",
      whyNow: "文中已经出现采购、治理、交付和预算协同成熟的信号，说明企业买方正在进入更系统化阶段。",
      signalsToWatch: ["是否出现统一采购平台", "是否更强调治理和可维护性", "试点项目是否转成组织级部署"],
      confidence: "medium"
    };
  }

  if (source.includes("agent") || normalizedText.includes("agent")) {
    return {
      statement: "未来 3-9 个月，Agent 产品会更快从能力展示转向审批明确、可回滚、可观测的执行流程。",
      timeHorizon: "未来 3-9 个月",
      whyNow: "文章对价值判断已经不再停留在对话体验，而是落在流程接入、执行闭环和控制能力上。",
      signalsToWatch: ["产品是否增加审批节点", "案例是否从演示转向生产流程", "用户是否更重视可观测性"],
      confidence: "high"
    };
  }

  if (source.includes("consumer") || source.includes("companion") || normalizedText.includes("consumer")) {
    return {
      statement: "未来 6-12 个月，消费级 AI 应用会更快从功能炫技转向高频留存、付费结构和分发效率的竞争。",
      timeHorizon: "未来 6-12 个月",
      whyNow: "文章已经把产品价值落在持续互动、用户关系和长期使用，而不是一次性的新奇体验。",
      signalsToWatch: ["是否出现更清晰的订阅或高价付费结构", "产品是否更强调人格、记忆或关系维护机制", "竞争叙事是否从模型能力转向留存与分发"],
      confidence: "medium"
    };
  }

  if (source.includes("modelbusters") || normalizedText.includes("model")) {
    return {
      statement: "未来 6-12 个月，AI 行业会继续拉大模型层、应用层和分发层之间的分工与头部优势。",
      timeHorizon: "未来 6-12 个月",
      whyNow: "文章已经指出竞争不再只看模型能力，而会同时放大商业化执行和渠道差距。",
      signalsToWatch: ["头部厂商优势是否继续扩大", "应用层是否更依赖渠道和分发", "模型能力差距是否被产品能力放大"],
      confidence: "medium"
    };
  }

  return {
    statement: `未来 6-12 个月，围绕${topicName}的产品会从单点能力展示转向更具体的产品机制、商业化路径或组织采用方式。`,
    timeHorizon: "未来 6-12 个月",
    whyNow: "文章的重点已经不只是描述概念，而是开始落到产品机制、买方逻辑或竞争结构这些更具体的变化上。",
    signalsToWatch: [
      "讨论重点是否从模型能力转向产品机制或业务流程",
      "是否出现更清晰的付费、采购或部署模式",
      "案例是否从概念验证转向可复用的落地路径"
    ],
    confidence: "low"
  };
}

function isWeakOutlook(outlook: ArticleOutlook): boolean {
  const statement = outlook.statement.trim();
  const whyNow = outlook.whyNow.trim();
  const signals = outlook.signalsToWatch.map((item) => item.trim());
  const genericFragments = [
    "从观点讨论进一步转向产品化落地与商业化验证",
    "文章已经给出明确判断",
    "是否出现更多真实落地案例",
    "投资动态是否继续印证该方向"
  ];

  if (genericFragments.some((fragment) => statement.includes(fragment) || whyNow.includes(fragment))) {
    return true;
  }

  if (outlook.timeHorizon.trim() === "未来 3-12 个月") {
    return true;
  }

  if (signals.some((signal) => genericFragments.some((fragment) => signal.includes(fragment)))) {
    return true;
  }

  return false;
}

export function extractJsonObject(text: string): string {
  const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fencedMatch?.[1] ?? text;
  const start = source.indexOf("{");

  if (start < 0) {
    throw new Error("No JSON object found in model output");
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < source.length; index += 1) {
    const char = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1).trim();
      }
    }
  }

  throw new Error("Incomplete JSON object in model output");
}

function normalizeStringArray(input: unknown, minimum: number, maximum: number, fallback: string[]): string[] {
  const values = Array.isArray(input) ? input.filter((item): item is string => typeof item === "string") : [];
  const normalized = unique([...values, ...fallback].map((item) => item.trim()).filter(Boolean)).slice(0, maximum);

  if (normalized.length >= minimum) return normalized;
  return unique([...normalized, ...fallback].map((item) => item.trim()).filter(Boolean)).slice(0, Math.max(minimum, maximum));
}

function normalizeEvidenceLinks(
  input: unknown,
  keyPoints: string[],
  keyJudgements: string[]
): ArticleAnalysis["evidenceLinks"] {
  const values = Array.isArray(input)
    ? input
        .map((item) => {
          if (!item || typeof item !== "object") return null;
          const record = item as Record<string, unknown>;
          const claim = typeof record.claim === "string" ? record.claim : null;
          const evidenceText = typeof record.evidenceText === "string" ? record.evidenceText : null;
          const sourceLocator = typeof record.sourceLocator === "string" ? record.sourceLocator : null;
          if (!claim || !evidenceText || !sourceLocator) return null;
          return { claim, evidenceText, sourceLocator };
        })
        .filter(Boolean)
    : [];

  if (values.length >= 2) {
    return values.slice(0, 4) as ArticleAnalysis["evidenceLinks"];
  }

  return keyPoints.slice(0, 2).map((point, index) => ({
    claim: keyJudgements[index] ?? point,
    evidenceText: point,
    sourceLocator: `paragraph:${index + 1}`
  }));
}

function parseFactExtractionOutput(raw: unknown): ArticleFactExtractionResult {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const keyPoints = normalizeStringArray(record.keyPoints, 3, 5, []);
  const candidateTopics = normalizeStringArray(record.candidateTopics, 1, 4, []);
  const evidenceLinks = normalizeEvidenceLinks(record.evidenceLinks, keyPoints, keyPoints);

  if (!summary || keyPoints.length < 3 || candidateTopics.length < 1 || evidenceLinks.length < 2) {
    throw new Error("Invalid fact extraction output");
  }

  return {
    summary,
    keyPoints,
    candidateTopics,
    evidenceLinks
  };
}

function parseJudgementOutput(raw: unknown): ArticleJudgementResult {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const keyJudgements = normalizeStringArray(record.keyJudgements, 2, 5, []);
  const coreShift = typeof record.coreShift === "string" ? record.coreShift.trim() : "";

  if (keyJudgements.length < 2 || !coreShift) {
    throw new Error("Invalid judgement output");
  }

  return {
    keyJudgements,
    coreShift
  };
}

function parseTitleOutput(raw: unknown): ArticleTitleGenerationResult {
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const zhTitle = typeof record.zhTitle === "string" ? record.zhTitle.trim() : "";

  if (!zhTitle) {
    throw new Error("Invalid title output");
  }

  return {
    zhTitle
  };
}

function parseJsonStageOutput<T>(text: string, parse: (raw: unknown) => T): T {
  return parse(JSON.parse(extractJsonObject(text)));
}

function normalizeArticleAnalysisOutput(raw: unknown, article: ArticleGenerationInput): ArticleAnalysis {
  const candidateTopics = inferTopicsFromText(`${article.sourceTitle}\n${article.plainText}`);
  const fallback = buildChineseFallbackAnalysis({
    sourceTitle: article.sourceTitle,
    contentType: article.contentType,
    candidateTopics,
    plainText: article.plainText
  });
  const record = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};

  const summary = typeof record.summary === "string" && record.summary.trim().length > 0 ? record.summary.trim() : fallback.summary;
  const keyPoints = normalizeStringArray(record.keyPoints, 3, 5, fallback.keyPoints);
  const keyJudgements = normalizeStringArray(record.keyJudgements, 2, 5, fallback.keyJudgements);
  const normalizedTopics = normalizeStringArray(record.candidateTopics, 1, 4, candidateTopics);
  const evidenceLinks = normalizeEvidenceLinks(record.evidenceLinks, keyPoints, keyJudgements);
  const fallbackOutlook = buildArticleOutlook({
    sourceTitle: article.sourceTitle,
    summary,
    keyJudgements,
    candidateTopics: normalizedTopics,
    plainText: article.plainText
  });
  const rawOutlook = record.outlook && typeof record.outlook === "object" ? (record.outlook as Record<string, unknown>) : {};
  const generatedTitle = typeof record.zhTitle === "string" ? record.zhTitle.trim() : "";
  const zhTitle = shouldUseGeneratedInsightTitle(generatedTitle, article.sourceTitle)
    ? generatedTitle
    : deriveInsightTitle({
        sourceTitle: article.sourceTitle,
        summary,
        keyJudgements,
        candidateTopics: normalizedTopics
      });

  return articleAnalysisSchema.parse({
    zhTitle,
    summary,
    keyPoints,
    keyJudgements,
    outlook: {
      statement:
        typeof rawOutlook.statement === "string" && rawOutlook.statement.trim().length > 0
          ? rawOutlook.statement.trim()
          : fallbackOutlook.statement,
      timeHorizon:
        typeof rawOutlook.timeHorizon === "string" && rawOutlook.timeHorizon.trim().length > 0
          ? rawOutlook.timeHorizon.trim()
          : fallbackOutlook.timeHorizon,
      whyNow:
        typeof rawOutlook.whyNow === "string" && rawOutlook.whyNow.trim().length > 0
          ? rawOutlook.whyNow.trim()
          : fallbackOutlook.whyNow,
      signalsToWatch: normalizeStringArray(rawOutlook.signalsToWatch, 1, 4, fallbackOutlook.signalsToWatch),
      confidence:
        rawOutlook.confidence === "high" || rawOutlook.confidence === "medium" || rawOutlook.confidence === "low"
          ? rawOutlook.confidence
          : fallbackOutlook.confidence
    },
    candidateTopics: normalizedTopics,
    evidenceLinks
  });
}

export function repairArticleAnalysisText(text: string, article: ArticleGenerationInput): ArticleAnalysis {
  try {
    return normalizeArticleAnalysisOutput(JSON.parse(extractJsonObject(text)), article);
  } catch {
    return normalizeArticleAnalysisOutput({}, article);
  }
}

export function parseArticleAnalysisTextStrict(text: string, article: ArticleGenerationInput): ArticleAnalysis {
  return normalizeArticleAnalysisOutput(JSON.parse(extractJsonObject(text)), article);
}

export function prepareArticlePlainTextForModel(plainText: string): string {
  const trimmed = plainText.trim();
  if (trimmed.length <= MAX_ARTICLE_PROMPT_CHARS) {
    return trimmed;
  }

  return `${trimmed.slice(0, MAX_ARTICLE_PROMPT_CHARS)}\n\n[以下内容为节选，已按长度截断以保证分析稳定性]`;
}

export async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

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

export function buildArticlePromptConfig(article: ArticleGenerationInput): PromptConfig {
  return buildArticleFactPromptConfig(article);
}

export function buildArticleFactPromptConfig(article: ArticleGenerationInput): PromptConfig {
  const modelPlainText = prepareArticlePlainTextForModel(article.plainText);
  const sharedPrompt = [
    "你是一个严谨的中文科技内容分析助手。",
    "请先只做事实抽取，不要生成标题、趋势推演或泛泛评论。",
    "输出高信息密度的摘要、要点、候选专题和证据链，保持克制，不要营销化。",
    "summary、keyPoints、evidenceLinks.claim 和 evidenceLinks.evidenceText 必须使用中文。",
    "候选专题 slug 使用英文 kebab-case，例如 agent-workflows、consumer-ai。",
    "candidateTopics 继续使用英文 kebab-case。",
    "sourceLocator 保持原文定位格式，例如 paragraph:1、section:pricing。",
    `标题: ${article.sourceTitle}`,
    `类型: ${article.contentType}`,
    `发布日期: ${article.publishedAt}`,
    "正文:",
    modelPlainText
  ].join("\n");

  return {
    objectPrompt: sharedPrompt,
    jsonPrompt: [
      sharedPrompt,
      "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释、标题或代码块。",
      '输出格式必须是 {"summary":"...","keyPoints":["..."],"candidateTopics":["..."],"evidenceLinks":[{"claim":"...","evidenceText":"...","sourceLocator":"..."}]}'
    ].join("\n")
  };
}

export function buildArticleJudgementPromptConfig(
  article: ArticleGenerationInput,
  facts: ArticleFactExtractionResult
): PromptConfig {
  const context = [
    `原文标题: ${article.sourceTitle}`,
    `摘要: ${facts.summary}`,
    `要点: ${facts.keyPoints.join(" | ")}`,
    `证据: ${facts.evidenceLinks.map((item) => `${item.claim} => ${item.evidenceText}`).join(" | ")}`,
    `候选专题: ${facts.candidateTopics.join(", ")}`
  ].join("\n");

  const sharedPrompt = [
    "你是一个严谨的中文科技研究编辑。",
    "请只基于给定事实，归纳这篇文章的关键判断。",
    "同时给出一条 coreShift，表示这篇文章最核心的变化、转向或结构性判断。",
    "keyJudgements 和 coreShift 必须使用中文。",
    "不要生成标题，不要做未来推演。",
    context
  ].join("\n");

  return {
    objectPrompt: sharedPrompt,
    jsonPrompt: [
      sharedPrompt,
      "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释或代码块。",
      '输出格式必须是 {"keyJudgements":["..."],"coreShift":"..."}'
    ].join("\n")
  };
}

export function buildArticleTitlePromptConfig(
  article: ArticleGenerationInput,
  facts: ArticleFactExtractionResult,
  judgements: ArticleJudgementResult
): PromptConfig {
  const sharedPrompt = [
    "你是一个严谨的中文科技内容编辑。",
    "请只为这篇文章生成一个中文洞察标题。",
    "标题必须体现这篇文章最独特的判断或变化，不要只写赛道层面的共识。",
    "标题必须是中文，优先抓住价格变化、采用阶段、竞争结构、采购逻辑、产品机制等具体切口。",
    "避免使用过于泛化的标题，例如“某赛道正在出现新的产品与市场信号”“消费级 AI 的胜负手”“Agent 正在从……”。",
    `原文标题: ${article.sourceTitle}`,
    `摘要: ${facts.summary}`,
    `关键判断: ${judgements.keyJudgements.join(" | ")}`,
    `核心变化: ${judgements.coreShift}`
  ].join("\n");

  return {
    objectPrompt: sharedPrompt,
    jsonPrompt: [
      sharedPrompt,
      "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释或代码块。",
      '输出格式必须是 {"zhTitle":"..."}'
    ].join("\n")
  };
}

export function buildArticleOutlookPromptConfig(
  article: ArticleGenerationInput,
  facts: ArticleFactExtractionResult,
  judgements: ArticleJudgementResult
): PromptConfig {
  const sharedPrompt = [
    "你是一个严谨的中文科技研究编辑。",
    "请只基于给定事实和判断，生成一条未来推演。",
    "推演必须是结构化短块，但每一项都要具体，不要写成空泛赛道套话。",
    "statement、timeHorizon、whyNow 和 signalsToWatch 必须使用中文，confidence 继续使用 high|medium|low。",
    "statement 必须写清楚最可能发生的具体变化，最好体现从 A 走向 B，而不是只说某赛道会继续发展。",
    "timeHorizon 应尽量收窄，优先使用“未来 3-6 个月”“未来 6-12 个月”“未来 12-18 个月”等更具体表达，避免笼统写“未来 3-12 个月”。",
    "whyNow 必须说明变化发生的具体驱动，例如供给变化、需求变化、成本变化、分发变化、采购流程变化、产品机制变化，不能只说“文章已经指出”或“文章已经给出判断”。",
    "signalsToWatch 必须是可以观察的具体现象，不能写成“是否出现更多案例”“投资动态是否继续印证”这种任何赛道都适用的空话。",
    "不要复述摘要，不要生成标题，不要写成宏观行业报告。",
    `原文标题: ${article.sourceTitle}`,
    `摘要: ${facts.summary}`,
    `关键判断: ${judgements.keyJudgements.join(" | ")}`,
    `核心变化: ${judgements.coreShift}`,
    `证据: ${facts.evidenceLinks.map((item) => `${item.claim} => ${item.evidenceText}`).join(" | ")}`
  ].join("\n");

  return {
    objectPrompt: sharedPrompt,
    jsonPrompt: [
      sharedPrompt,
      "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释或代码块。",
      '输出格式必须是 {"statement":"...","timeHorizon":"未来 6-12 个月","whyNow":"...","signalsToWatch":["..."],"confidence":"high|medium|low"}'
    ].join("\n")
  };
}

export async function runArticleAnalysisPipeline(
  article: ArticleGenerationInput,
  stages: ArticleAnalysisPipelineStages
): Promise<ArticleAnalysis> {
  let facts: ArticleFactExtractionResult;
  try {
    facts = parseFactExtractionOutput(await stages.extractFacts(article));
  } catch (error) {
    throw new AnalysisOutputRejectedError(
      error instanceof Error ? `Fact extraction failed: ${error.message}` : "Fact extraction failed"
    );
  }

  let judgements: ArticleJudgementResult;
  try {
    judgements = parseJudgementOutput(await stages.deriveJudgements(article, facts));
  } catch (error) {
    throw new AnalysisOutputRejectedError(
      error instanceof Error ? `Judgement derivation failed: ${error.message}` : "Judgement derivation failed"
    );
  }

  let zhTitle: string;
  try {
    const title = await stages.generateTitle(article, facts, judgements);
    zhTitle = shouldUseGeneratedInsightTitle(title, article.sourceTitle)
      ? title.trim()
      : deriveInsightTitle({
          sourceTitle: article.sourceTitle,
          summary: facts.summary,
          keyJudgements: judgements.keyJudgements,
          candidateTopics: facts.candidateTopics
        });
  } catch {
    zhTitle = deriveInsightTitle({
      sourceTitle: article.sourceTitle,
      summary: facts.summary,
      keyJudgements: judgements.keyJudgements,
      candidateTopics: facts.candidateTopics
    });
  }

  let outlook: ArticleOutlook;
  try {
    const generatedOutlook = articleOutlookSchema.parse(await stages.generateOutlook(article, facts, judgements));
    outlook = isWeakOutlook(generatedOutlook)
      ? buildArticleOutlook({
          sourceTitle: article.sourceTitle,
          summary: facts.summary,
          keyJudgements: judgements.keyJudgements,
          candidateTopics: facts.candidateTopics,
          plainText: article.plainText
        })
      : generatedOutlook;
  } catch {
    outlook = buildArticleOutlook({
      sourceTitle: article.sourceTitle,
      summary: facts.summary,
      keyJudgements: judgements.keyJudgements,
      candidateTopics: facts.candidateTopics,
      plainText: article.plainText
    });
  }

  return articleAnalysisSchema.parse({
    zhTitle,
    summary: facts.summary,
    keyPoints: facts.keyPoints,
    keyJudgements: judgements.keyJudgements,
    outlook,
    candidateTopics: facts.candidateTopics,
    evidenceLinks: facts.evidenceLinks
  });
}

export class HeuristicAnalysisClient implements AnalysisClient {
  async analyzeArticle(article: {
    sourceTitle: string;
    contentType: string;
    publishedAt: string;
    plainText: string;
  }): Promise<ArticleAnalysis> {
    const candidateTopics = inferTopicsFromText(`${article.sourceTitle}\n${article.plainText}`);
    const fallback = buildChineseFallbackAnalysis({
      sourceTitle: article.sourceTitle,
      contentType: article.contentType,
      candidateTopics,
      plainText: article.plainText
    });
    const summary = fallback.summary;
    const normalizedKeyPoints = fallback.keyPoints.slice(0, 3);
    const normalizedJudgements = fallback.keyJudgements.slice(0, 2);

    return {
      zhTitle: deriveInsightTitle({
        sourceTitle: article.sourceTitle,
        summary,
        keyJudgements: normalizedJudgements,
        candidateTopics
      }),
      summary,
      keyPoints: normalizedKeyPoints,
      keyJudgements: normalizedJudgements,
      outlook: buildArticleOutlook({
        sourceTitle: article.sourceTitle,
        summary,
        keyJudgements: normalizedJudgements,
        candidateTopics,
        plainText: article.plainText
      }),
      candidateTopics,
      evidenceLinks: normalizedKeyPoints.slice(0, 2).map((point, index) => ({
        claim: normalizedJudgements[index] ?? point,
        evidenceText: point,
        sourceLocator: `paragraph:${index + 1}`
      }))
    };
  }

  async analyzeTopic(topicSlug: string, articles: StoredArticle[]): Promise<TopicAnalysis> {
    const articleIds = articles.map((article) => article.id);
    const sentences = unique(articles.flatMap((article) => article.keyJudgements)).slice(0, 5);
    return {
      topicName: topicSlugToChineseName(topicSlug),
      intro: `${topicSlugToChineseName(topicSlug)}专题汇总了最近相关文章中反复出现的判断。`,
      currentConsensus: sentences.slice(0, 3).length > 0 ? sentences.slice(0, 3) : ["近期文章在同一主题上持续强化。"],
      disagreements: sentences.slice(3, 4),
      trendPredictions: [
        {
          statement: `${topicSlugToChineseName(topicSlug)}相关产品会继续朝更成熟的产品化与商业化形态演进。`,
          triggerConditions: ["文章讨论持续增加", "相关投资动态继续出现"],
          timeWindow: "未来 1-2 年",
          confidence: "medium",
          supportingEvidence: articles.flatMap((article) => article.evidenceLinks).slice(0, 2)
        },
        {
          statement: `${topicSlugToChineseName(topicSlug)}的竞争重点会从模型能力延伸到分发、工作流和用户体验。`,
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
      topicMovements: unique(input.articles.flatMap((article) => article.topics))
        .slice(0, 4)
        .map((topic) => `${topicSlugToChineseName(topic)} 的讨论热度正在上升。`),
      trendPredictions: [
        {
          statement: "a16z 关注主题会继续从模型能力外溢到产品与商业化执行。",
          triggerConditions: ["投资动态持续与主题文章形成印证", "专题内文章数量上升"],
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
  private readonly modelFactory;
  private readonly modelName: string;

  constructor(env: Env) {
    const config = resolveAiProviderConfig(env);

    if (!config) {
      throw new Error("AI_API_KEY or OPENAI_API_KEY is required for VercelAiAnalysisClient");
    }

    this.modelFactory =
      config.compatMode === "openai"
        ? createMinimaxOpenAI({
            apiKey: config.apiKey,
            baseURL: config.baseURL
          })
        : createMinimax({
            apiKey: config.apiKey,
            baseURL: config.baseURL
          });
    this.modelName = config.modelName;
  }

  private getModel() {
    return this.modelFactory(this.modelName) as never;
  }

  private async generateStructured<T>(
    schema: { parse(input: unknown): T },
    prompt: PromptConfig,
    repair?: (text: string) => T
  ): Promise<T> {
    try {
      const result = await withTimeout(
        generateText({
          model: this.getModel(),
          output: Output.object({
            schema: schema as never
          }),
          prompt: prompt.objectPrompt
        }),
        MODEL_TIMEOUT_MS,
        "structured-object-generation"
      );

      return schema.parse(result.output);
    } catch (error) {
      const result = await withTimeout(
        generateText({
          model: this.getModel(),
          prompt: prompt.jsonPrompt
        }),
        MODEL_TIMEOUT_MS,
        "structured-json-generation"
      );

      if (repair) {
        return repair(result.text);
      }

      const json = extractJsonObject(result.text);
      return schema.parse(JSON.parse(json));
    }
  }

  private async generateJsonStage<T>(
    prompt: PromptConfig,
    parse: (raw: unknown) => T,
    label: string
  ): Promise<T> {
    const result = await withTimeout(
      generateText({
        model: this.getModel(),
        prompt: prompt.jsonPrompt
      }),
      MODEL_TIMEOUT_MS,
      label
    );

    return parseJsonStageOutput(result.text, parse);
  }

  async analyzeArticle(article: ArticleGenerationInput): Promise<ArticleAnalysis> {
    try {
      return await runArticleAnalysisPipeline(article, {
        extractFacts: async (input) =>
          this.generateJsonStage(buildArticleFactPromptConfig(input), parseFactExtractionOutput, "article-fact-extraction"),
        deriveJudgements: async (input, facts) =>
          this.generateJsonStage(
            buildArticleJudgementPromptConfig(input, facts),
            parseJudgementOutput,
            "article-judgement-generation"
          ),
        generateTitle: async (input, facts, judgements) =>
          (
            await this.generateJsonStage(
              buildArticleTitlePromptConfig(input, facts, judgements),
              parseTitleOutput,
              "article-title-generation"
            )
          ).zhTitle,
        generateOutlook: async (input, facts, judgements) =>
          this.generateJsonStage(
            buildArticleOutlookPromptConfig(input, facts, judgements),
            (raw) => articleOutlookSchema.parse(raw),
            "article-outlook-generation"
          )
      });
    } catch (error) {
      throw new AnalysisOutputRejectedError(
        error instanceof Error ? error.message : "Article analysis output was rejected"
      );
    }
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

    try {
      return await this.generateStructured(topicAnalysisSchema, {
        objectPrompt: [
          "你是一个严谨的中文 AI 研究编辑。",
          "请基于多篇 a16z 文章生成专题分析，输出必须可验证，趋势推演需要克制且带条件。",
          `专题 slug: ${topicSlug}`,
          context
        ].join("\n"),
        jsonPrompt: [
          "你是一个严谨的中文 AI 研究编辑。",
          "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释或代码块。",
          `专题 slug: ${topicSlug}`,
          context,
          '输出格式必须是 {"topicName":"...","intro":"...","currentConsensus":["..."],"disagreements":["..."],"trendPredictions":[{"statement":"...","triggerConditions":["..."],"timeWindow":"未来 1-2 年","confidence":"high|medium|low","supportingEvidence":[{"claim":"...","evidenceText":"...","sourceLocator":"..."}]}],"supportingArticleIds":["..."]}'
        ].join("\n")
      });
    } catch (error) {
      return new HeuristicAnalysisClient().analyzeTopic(topicSlug, articles);
    }
  }

  async analyzeDigest(input: { weekStart: string; weekEnd: string; articles: StoredArticle[] }): Promise<DigestAnalysis> {
    const context = input.articles
      .map((article) => `${article.zhTitle}\n${article.summary}\n${article.keyJudgements.join(" | ")}`)
      .join("\n\n");

    try {
      return await this.generateStructured(digestAnalysisSchema, {
        objectPrompt: [
          "你是一个严谨的中文科技周报编辑。",
          "请基于本周收录的 a16z AI 文章生成结构化周报，突出最重要的信号与趋势变化。",
          `周报周期: ${input.weekStart} 至 ${input.weekEnd}`,
          context
        ].join("\n"),
        jsonPrompt: [
          "你是一个严谨的中文科技周报编辑。",
          "请只输出一个 JSON 对象，不要输出 Markdown、表格、解释或代码块。",
          `周报周期: ${input.weekStart} 至 ${input.weekEnd}`,
          context,
          '输出格式必须是 {"title":"...","topSignals":["..."],"topicMovements":["..."],"trendPredictions":[{"statement":"...","triggerConditions":["..."],"timeWindow":"未来 1-2 年","confidence":"high|medium|low","supportingEvidence":[{"claim":"...","evidenceText":"...","sourceLocator":"..."}]}]}'
        ].join("\n")
      });
    } catch (error) {
      return new HeuristicAnalysisClient().analyzeDigest(input);
    }
  }
}

export function resolveAiProviderConfig(env: Env): AiProviderConfig | null {
  const apiKey = env.AI_API_KEY ?? env.OPENAI_API_KEY;
  if (!apiKey) return null;
  const baseURL = env.AI_BASE_URL;
  const compatMode =
    env.AI_COMPAT_MODE ?? (baseURL && !baseURL.includes("/anthropic/") ? "openai" : "anthropic");

  return {
    apiKey,
    baseURL,
    modelName: env.AI_MODEL ?? env.OPENAI_MODEL ?? "gpt-4.1-mini",
    compatMode
  };
}

export function createAnalysisClient(env: Env): AnalysisClient {
  if (resolveAiProviderConfig(env)) {
    return new VercelAiAnalysisClient(env);
  }

  return new HeuristicAnalysisClient();
}

export function slugFromTopicName(name: string): string {
  return slugify(name);
}
