import * as cheerio from "cheerio";

import type { IngestionCandidate, ParsedArticle } from "./types";

function normalizeContentType(raw: string | undefined): "Article" | "Investment News" | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.includes("investment")) return "Investment News";
  if (value.includes("article")) return "Article";
  return null;
}

export function collectArticleCandidates(html: string, baseUrl = "https://a16z.com"): IngestionCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, IngestionCandidate>();

  $("article, .post-card, .archive-item, li").each((_, element) => {
    const root = $(element);
    const link = root.find("a[href]").first();
    const href = link.attr("href");
    if (!href) return;

    const url = new URL(href, baseUrl).toString();
    const title = root.find("h1,h2,h3").first().text().trim() || link.text().trim();
    const typeText = root.text();
    const publishedAt =
      root.find("time").attr("datetime") ??
      root.find("time").text().trim() ??
      undefined;
    const contentType = normalizeContentType(typeText);

    if (!title || !contentType) return;
    candidates.set(url, {
      url,
      title,
      publishedAt,
      contentType
    });
  });

  return [...candidates.values()].filter((candidate) => Boolean(candidate.contentType));
}

export function filterTargetContentType(candidates: IngestionCandidate[]): IngestionCandidate[] {
  return candidates.filter(
    (candidate) => candidate.contentType === "Article" || candidate.contentType === "Investment News"
  );
}

export function parseArticleDocument(html: string, sourceUrl: string): ParsedArticle {
  const $ = cheerio.load(html);
  const sourceTitle =
    $("meta[property='og:title']").attr("content")?.trim() ??
    $("h1").first().text().trim() ??
    $("title").text().trim();

  const canonicalUrl = $("link[rel='canonical']").attr("href") ?? sourceUrl;
  const publishedAt =
    $("meta[property='article:published_time']").attr("content") ??
    $("time").first().attr("datetime") ??
    $("time").first().text().trim() ??
    new Date().toISOString().slice(0, 10);

  const contentType = normalizeContentType($("body").text()) ?? "Article";

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
