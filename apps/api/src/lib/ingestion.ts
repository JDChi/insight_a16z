import * as cheerio from "cheerio";

import type { IngestionCandidate, ParsedArticle } from "./types";

type CheerioNode = {
  type?: string;
  data?: string | null;
  tagName?: string;
  parent?: { tagName?: string } | null;
};

const ignoredTitles = new Set([
  "Portfolio",
  "Team",
  "About",
  "Jobs",
  "Offices",
  "Strategic Partnerships",
  "Newsletters",
  "Podcast Network",
  "Books",
  "AI",
  "AI + a16z",
  "See All Newsletters",
  "Subscribe",
  "Share"
]);

const titleSuffixPattern = /\s*\|\s*(a16z|Andreessen Horowitz)\s*$/i;
const headingTags = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function normalizeContentType(raw: string | undefined): "Article" | "Investment News" | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.includes("investment")) return "Investment News";
  if (value.includes("article")) return "Article";
  return null;
}

function normalizeSourceTitle(raw: string | undefined): string {
  return (raw ?? "").trim().replace(titleSuffixPattern, "").trim();
}

function normalizeCandidateUrl(url: string, baseUrl = "https://a16z.com"): string {
  const normalized = new URL(url, baseUrl);
  normalized.hash = "";
  if (!normalized.pathname.endsWith("/")) {
    normalized.pathname = `${normalized.pathname}/`;
  }
  return normalized.toString();
}

function directText($: cheerio.CheerioAPI, element: CheerioNode): string {
  return $(element as unknown as string)
    .contents()
    .toArray()
    .filter((node) => node.type === "text")
    .map((node) => node.data ?? "")
    .join(" ")
    .trim()
    .replace(/\s+/g, " ");
}

function extractPublishedAtFromStructuredData($: cheerio.CheerioAPI): string | undefined {
  const scripts = $("script[type='application/ld+json']")
    .map((_, element) => $(element).text().trim())
    .get()
    .filter(Boolean);

  const findDate = (value: unknown): string | undefined => {
    if (!value || typeof value !== "object") return undefined;
    if (Array.isArray(value)) {
      for (const item of value) {
        const date = findDate(item);
        if (date) return date;
      }
      return undefined;
    }

    const record = value as Record<string, unknown>;
    const type = record["@type"];
    const matchesArticleType =
      typeof type === "string"
        ? /article$/i.test(type)
        : Array.isArray(type) && type.some((entry) => typeof entry === "string" && /article$/i.test(entry));
    if (matchesArticleType && typeof record.datePublished === "string" && record.datePublished.trim().length > 0) {
      return record.datePublished;
    }

    for (const nested of Object.values(record)) {
      const date = findDate(nested);
      if (date) return date;
    }

    return undefined;
  };

  for (const script of scripts) {
    try {
      const parsed = JSON.parse(script) as unknown;
      const publishedAt = findDate(parsed);
      if (publishedAt) return publishedAt;
    } catch {
      continue;
    }
  }

  return undefined;
}

export function collectArticleCandidates(html: string, baseUrl = "https://a16z.com"): IngestionCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, IngestionCandidate>();

  $("a[href]").each((_, element) => {
    const link = $(element);
    const href = link.attr("href");
    if (!href) return;
    if (href.includes(" ")) return;

    const url = normalizeCandidateUrl(href, baseUrl);
    const pathname = new URL(url).pathname;
    if (pathname.includes("%20")) return;
    if (!pathname.endsWith("/")) return;
    const segments = pathname.split("/").filter(Boolean);
    if (segments.length === 0 || segments.length > 2) return;
    if (segments.length === 2 && segments[0] !== "announcement") return;
    const title =
      link.text().trim() ||
      link.closest("h1,h2,h3,h4").text().trim() ||
      link.parent().text().trim();

    if (!title || ignoredTitles.has(title)) return;
    if (pathname.startsWith("/podcast/")) return;
    if (pathname.startsWith("/category/")) return;
    if (pathname.startsWith("/tag/")) return;
    if (pathname === "/" || pathname === "/ai/") return;
    if (pathname.includes("#")) return;
    if (!/^https:\/\/a16z\.com\//.test(url)) return;
    if (title.length < 8) return;

    const root = link.closest("article, li, div, section");
    const typeText = root.text();
    const normalizedTypeText = typeText.trim().toLowerCase();
    if (normalizedTypeText.includes("podcast") || normalizedTypeText.includes("video")) return;
    const publishedAt = root.find("time").attr("datetime") ?? root.find("time").text().trim() ?? undefined;
    const normalizedType = normalizeContentType(typeText);
    const isFeedItem = root.is("[data-feed-item]") || root.parents("[data-feed-item]").length > 0;
    const hasArticleContext = Boolean(publishedAt) || Boolean(normalizedType) || isFeedItem;
    if (!hasArticleContext && !pathname.startsWith("/announcement/")) return;

    const contentType =
      pathname.startsWith("/announcement/") || /^investing in/i.test(title)
        ? "Investment News"
        : normalizedType ?? "Article";

    candidates.set(url, {
      url,
      title,
      publishedAt,
      contentType
    });
  });

  return [...candidates.values()].filter((candidate) => Boolean(candidate.contentType));
}

export function collectSitemapAiCandidates(html: string, baseUrl = "https://a16z.com"): IngestionCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, IngestionCandidate>();
  let inPostsByCategory = false;
  let inAiSection = false;

  $("main *").each((_, node) => {
    const element = node as CheerioNode;
    const tagName = element.tagName?.toLowerCase() ?? "";
    const text = directText($, element);

    if (headingTags.has(tagName) && text === "Posts by Category") {
      inPostsByCategory = true;
      return;
    }

    if (!inPostsByCategory) return;

    if (headingTags.has(tagName) && text === "AI") {
      inAiSection = true;
      return;
    }

    if (inAiSection && headingTags.has(tagName) && text === "All Posts") {
      inAiSection = false;
      return false;
    }

    if (!inAiSection || tagName !== "a") return;

    const href = $(element as unknown as string).attr("href");
    const title = $(element as unknown as string).text().trim();
    if (!href || !title) return;

    const url = normalizeCandidateUrl(href, baseUrl);
    if (!/^https:\/\/a16z\.com\//.test(url)) return;
    if (url.includes("/podcast/") || url.includes("/video/")) return;

    const contentType =
      url.includes("/announcement/") || /^investing in/i.test(title) ? "Investment News" : "Article";
    candidates.set(url, {
      url,
      title,
      contentType
    });
  });

  return [...candidates.values()];
}

export function dedupeCandidatesByUrl(candidates: IngestionCandidate[]): IngestionCandidate[] {
  const deduped = new Map<string, IngestionCandidate>();

  for (const candidate of candidates) {
    const normalizedUrl = normalizeCandidateUrl(candidate.url);
    if (!deduped.has(normalizedUrl)) {
      deduped.set(normalizedUrl, {
        ...candidate,
        url: normalizedUrl
      });
    }
  }

  return [...deduped.values()];
}

export function filterTargetContentType(candidates: IngestionCandidate[]): IngestionCandidate[] {
  return candidates.filter(
    (candidate) => candidate.contentType === "Article" || candidate.contentType === "Investment News"
  );
}

export function parseArticleDocument(html: string, sourceUrl: string): ParsedArticle {
  const $ = cheerio.load(html);
  const pathname = new URL(sourceUrl).pathname;
  const sourceTitle = normalizeSourceTitle(
    $("meta[property='og:title']").attr("content")?.trim() ??
      $("h1").first().text().trim() ??
      $("title").text().trim()
  );

  const canonicalUrl = $("link[rel='canonical']").attr("href") ?? sourceUrl;
  const publishedAt =
    $("meta[property='article:published_time']").attr("content") ??
    extractPublishedAtFromStructuredData($) ??
    $("time").first().attr("datetime") ??
    $("time").first().text().trim() ??
    new Date().toISOString().slice(0, 10);

  const contentType =
    pathname.startsWith("/announcement/") || /^investing in/i.test(sourceTitle)
      ? "Investment News"
      : "Article";

  const authors = $("meta[name='author']")
    .map((_, element) => $(element).attr("content")?.trim())
    .get()
    .filter(Boolean) as string[];

  const sections = $("main p, article p, .entry-content p")
    .map((_, element) => ({
      heading: "",
      content: $(element).text().trim()
    }))
    .get()
    .filter((section) => section.content.length > 0);

  const plainText = sections.map((section) => section.content).join("\n\n");

  return {
    sourceUrl,
    canonicalUrl,
    sourceTitle,
    publishedAt,
    contentType,
    authors,
    plainText,
    sections
  };
}

export async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  return response.text();
}

export function isLikelyEditorialArticle(parsed: ParsedArticle): boolean {
  if (!parsed.publishedAt || parsed.publishedAt.trim().length === 0) return false;
  if (parsed.plainText.trim().length < 280) return false;
  return true;
}

export function isPublishedWithinPastYear(publishedAt: string, referenceDate = new Date()): boolean {
  const timestamp = new Date(publishedAt).getTime();
  if (Number.isNaN(timestamp)) return false;

  const cutoff = new Date(referenceDate);
  cutoff.setFullYear(cutoff.getFullYear() - 1);
  return timestamp >= cutoff.getTime();
}
