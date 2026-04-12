import * as cheerio from "cheerio";

import type { IngestionCandidate, ParsedArticle } from "./types";

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

function normalizeContentType(raw: string | undefined): "Article" | "Investment News" | null {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.includes("investment")) return "Investment News";
  if (value.includes("article")) return "Article";
  return null;
}

export function collectArticleCandidates(html: string, baseUrl = "https://a16z.com"): IngestionCandidate[] {
  const $ = cheerio.load(html);
  const candidates = new Map<string, IngestionCandidate>();

  $("a[href]").each((_, element) => {
    const link = $(element);
    const href = link.attr("href");
    if (!href) return;
    if (href.includes(" ")) return;

    const url = new URL(href, baseUrl).toString();
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
    const contentType =
      pathname.startsWith("/announcement/") || /^investing in/i.test(title)
        ? "Investment News"
        : normalizeContentType(typeText) ?? "Article";

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
  const pathname = new URL(sourceUrl).pathname;
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
  if (/\|\s*(a16z|Andreessen Horowitz)$/i.test(parsed.sourceTitle)) return false;
  return true;
}
