import {
  sampleArticleSummaries,
  sampleArticles,
  sampleDigestSummaries,
  sampleDigests,
  sampleJobs,
  sampleOverview,
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
  const [articles, topics, digests] = await Promise.all([
    getArticles(),
    getTopics(),
    getDigests()
  ]);

  return {
    leadDigest: digests[0] ?? null,
    articles: articles.slice(0, 6),
    investmentNews: articles.filter((article) => article.contentType === "Investment News").slice(0, 3),
    topics: topics.slice(0, 4)
  };
}

export async function getArticles() {
  if (mode === "api") {
    return fetchJson<typeof sampleArticleSummaries>("/api/articles");
  }
  return sampleArticleSummaries;
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

export async function getAdminOverview() {
  if (mode === "api") {
    return fetchJson<typeof sampleOverview>("/internal/overview", {
      headers: buildAdminHeaders()
    });
  }
  return sampleOverview;
}

export async function getJobs() {
  if (mode === "api") {
    return fetchJson<typeof sampleJobs>("/internal/jobs", {
      headers: buildAdminHeaders()
    });
  }
  return sampleJobs;
}

export async function getAdminArticles() {
  if (mode === "api") {
    return fetchJson<typeof sampleArticleSummaries>("/internal/articles", {
      headers: buildAdminHeaders()
    });
  }
  return sampleArticleSummaries;
}

export async function getAdminTopics() {
  if (mode === "api") {
    return fetchJson<typeof sampleTopicSummaries>("/internal/topics", {
      headers: buildAdminHeaders()
    });
  }
  return sampleTopicSummaries;
}

export function buildAdminHeaders(): HeadersInit {
  return {
    "x-test-admin-email": import.meta.env.TEST_ADMIN_EMAIL ?? "admin@local.test"
  };
}
