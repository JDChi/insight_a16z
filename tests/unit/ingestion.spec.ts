import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { collectArticleCandidates, filterTargetContentType, parseArticleDocument } from "../../apps/api/src/lib/ingestion";

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
});
