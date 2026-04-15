import {
  sampleArticleSummaries,
  sampleArticles,
  sampleDigestSummaries,
  sampleDigests,
  sampleTopicSummaries,
  sampleTopics
} from "@insight-a16z/core";

const apiBase = import.meta.env.PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8787";
const mode = import.meta.env.PUBLIC_DATA_MODE ?? "fixtures";

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, init);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function getHomeData() {
  const articles = await getArticles();
  const articleInsights = articles.filter((article) => article.contentType === "Article");
  const investmentNews = articles.filter((article) => article.contentType === "Investment News");

  return {
    articles: articleInsights.slice(0, 4),
    investmentNews: investmentNews.slice(0, 3)
  };
}

export async function getArticles() {
  if (mode === "api") {
    return fetchJson<typeof sampleArticleSummaries>("/api/articles");
  }
  return sampleArticleSummaries;
}

export async function getArticleInsights() {
  return (await getArticles()).filter((article) => article.contentType === "Article");
}

export async function getInvestmentNews() {
  return (await getArticles()).filter((article) => article.contentType === "Investment News");
}

export async function getArticleBySlug(slug: string) {
  if (mode === "api") {
    return fetchJson<(typeof sampleArticles)[number]>(`/api/articles/${slug}`);
  }
  return sampleArticles.find((article) => article.slug === slug) ?? null;
}

export async function getTopics() {
  if (mode === "api") {
    return fetchJson<typeof sampleTopicSummaries>("/api/topics");
  }
  return sampleTopicSummaries;
}

export async function getTopicBySlug(slug: string) {
  if (mode === "api") {
    return fetchJson<(typeof sampleTopics)[number]>(`/api/topics/${slug}`);
  }
  return sampleTopics.find((topic) => topic.slug === slug) ?? null;
}

export async function getDigests() {
  if (mode === "api") {
    return fetchJson<typeof sampleDigestSummaries>("/api/digests");
  }
  return sampleDigestSummaries;
}

export async function getDigestBySlug(slug: string) {
  if (mode === "api") {
    return fetchJson<(typeof sampleDigests)[number]>(`/api/digests/${slug}`);
  }
  return sampleDigests.find((digest) => digest.slug === slug) ?? null;
}
