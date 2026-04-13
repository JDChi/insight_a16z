import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  collectArticleCandidates,
  collectSitemapAiCandidates,
  dedupeCandidatesByUrl,
  filterTargetContentType,
  isLikelyEditorialArticle,
  isPublishedWithinPastYear,
  parseArticleDocument
} from "../../apps/api/src/lib/ingestion";

const fixturesDir = join(process.cwd(), "tests/fixtures");

describe("ingestion", () => {
  it("collects only supported content types from the listing page", async () => {
    const html = await readFile(join(fixturesDir, "listing.html"), "utf8");
    const candidates = filterTargetContentType(collectArticleCandidates(html));

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.contentType)).toEqual(["Article", "Investment News"]);
  });

  it("parses an article document into normalized content", async () => {
    const html = await readFile(join(fixturesDir, "article.html"), "utf8");
    const parsed = parseArticleDocument(html, "https://a16z.com/alpha-agent-systems/");

    expect(parsed.sourceTitle).toBe("Alpha Agent Systems");
    expect(parsed.publishedAt).toBe("2026-04-01");
    expect(parsed.authors).toContain("Jane Doe");
    expect(parsed.plainText).toContain("repeatable workflows");
  });

  it("normalizes source titles that include the a16z suffix", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Where Enterprises Are Actually Adopting AI | Andreessen Horowitz" />
          <meta property="article:published_time" content="2026-04-08T12:00:00.000Z" />
          <meta name="author" content="Jane Doe" />
        </head>
        <body>
          <main>
            <p>${"Enterprise AI adoption is moving from pilots into production. ".repeat(10)}</p>
          </main>
        </body>
      </html>
    `;

    const parsed = parseArticleDocument(html, "https://a16z.com/where-enterprises-are-actually-adopting-ai/");

    expect(parsed.sourceTitle).toBe("Where Enterprises Are Actually Adopting AI");
    expect(isLikelyEditorialArticle(parsed)).toBe(true);
  });

  it("skips section landing pages when collecting candidates", () => {
    const html = `
      <html>
        <body>
          <section>
            <a href="/enterprise/">Enterprise</a>
          </section>
          <article>
            <time datetime="2026-04-08T12:00:00.000Z"></time>
            <span>Article</span>
            <a href="/where-enterprises-are-actually-adopting-ai/">Where Enterprises Are Actually Adopting AI</a>
          </article>
          <article>
            <span>Video</span>
            <a href="/some-video/">Some Video Episode</a>
          </article>
        </body>
      </html>
    `;

    const candidates = filterTargetContentType(collectArticleCandidates(html));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toBe("https://a16z.com/where-enterprises-are-actually-adopting-ai/");
  });

  it("keeps feed items even when the card omits explicit article labels", () => {
    const html = `
      <html>
        <body>
          <div data-feed-item>
            <div class="pt-4">
              <span>Enterprise</span>
              <h4>
                <a href="https://a16z.com/where-enterprises-are-actually-adopting-ai/">
                  Where Enterprises are Actually Adopting AI
                </a>
              </h4>
              <div>Kimberly Tan</div>
            </div>
          </div>
          <div>
            <a href="/enterprise/">Enterprise</a>
          </div>
        </body>
      </html>
    `;

    const candidates = filterTargetContentType(collectArticleCandidates(html));

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.url).toBe("https://a16z.com/where-enterprises-are-actually-adopting-ai/");
  });

  it("collects AI sitemap links from the dedicated sitemap section", () => {
    const html = `
      <html>
        <body>
          <main>
            <h2>Posts by Category</h2>
            <h3>AI</h3>
            <ul>
              <li><a href="https://a16z.com/retention-is-all-you-need/">Retention Is All You Need</a></li>
              <li><a href="https://a16z.com/ai-will-supercharge-modelbusters/">AI Will Supercharge Modelbusters</a></li>
              <li><a href="https://a16z.com/podcast/some-show/">Podcast Episode</a></li>
            </ul>
            <h3>All Posts</h3>
            <ul>
              <li><a href="https://a16z.com/some-other-post/">Some Other Post</a></li>
            </ul>
          </main>
        </body>
      </html>
    `;

    const candidates = collectSitemapAiCandidates(html);

    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.url)).toEqual([
      "https://a16z.com/retention-is-all-you-need/",
      "https://a16z.com/ai-will-supercharge-modelbusters/"
    ]);
  });

  it("dedupes candidates by canonicalized url while keeping the first source", () => {
    const deduped = dedupeCandidatesByUrl([
      {
        url: "https://a16z.com/retention-is-all-you-need/",
        title: "Retention Is All You Need",
        contentType: "Article"
      },
      {
        url: "https://a16z.com/retention-is-all-you-need/",
        title: "Retention Is All You Need Duplicate",
        contentType: "Article"
      },
      {
        url: "https://a16z.com/announcement/investing-in-gitbutler/",
        title: "Investing in GitButler",
        contentType: "Investment News"
      }
    ]);

    expect(deduped).toHaveLength(2);
    expect(deduped[0]?.title).toBe("Retention Is All You Need");
    expect(deduped[1]?.url).toBe("https://a16z.com/announcement/investing-in-gitbutler/");
  });

  it("extracts publish dates from structured data when meta tags are missing", () => {
    const html = `
      <html>
        <head>
          <meta property="og:title" content="Investing in OpenRouter | Andreessen Horowitz" />
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "NewsArticle",
                  "headline": "Investing in OpenRouter",
                  "datePublished": "2025-06-26T19:47:07+00:00"
                }
              ]
            }
          </script>
        </head>
        <body>
          <main>
            <p>${"OpenRouter provides routing and failover across LLM APIs. ".repeat(10)}</p>
          </main>
        </body>
      </html>
    `;

    const parsed = parseArticleDocument(html, "https://a16z.com/announcement/investing-in-openrouter/");

    expect(parsed.publishedAt).toBe("2025-06-26T19:47:07+00:00");
    expect(isLikelyEditorialArticle(parsed)).toBe(true);
  });

  it("detects whether an article falls within the last year", () => {
    const referenceDate = new Date("2026-04-12T00:00:00.000Z");

    expect(isPublishedWithinPastYear("2025-09-10T15:00:46+00:00", referenceDate)).toBe(true);
    expect(isPublishedWithinPastYear("2024-03-01T00:00:00.000Z", referenceDate)).toBe(false);
  });
});
