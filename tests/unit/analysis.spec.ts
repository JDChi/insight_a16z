import {
  HeuristicAnalysisClient,
  ensureUniqueInsightTitle,
  prepareArticlePlainTextForModel,
  repairArticleAnalysisText,
  withTimeout
} from "../../apps/api/src/lib/analysis";

describe("heuristic analysis client", () => {
  it("keeps article-facing analysis in Chinese", async () => {
    const client = new HeuristicAnalysisClient();

    const result = await client.analyzeArticle({
      sourceTitle: "Retention Is All You Need",
      contentType: "Article",
      publishedAt: "2025-09-10",
      plainText:
        "The best AI products are winning on retention, not just rapid user growth. Teams are learning that habit formation and repeat usage now matter more than novelty."
    });

    expect(result.zhTitle).toBe("AI 产品竞争开始从增长转向留存");
    expect(result.summary).toMatch(/[一-龥]/);
    expect(result.keyPoints.every((item) => /[一-龥]/.test(item))).toBe(true);
    expect(result.keyJudgements.every((item) => /[一-龥]/.test(item))).toBe(true);
  });

  it("falls back to Chinese article analysis when model JSON is incomplete", () => {
    const result = repairArticleAnalysisText('{"summary":"只返回了一半"', {
      sourceTitle: "Retention Is All You Need",
      contentType: "Article",
      publishedAt: "2025-09-10",
      plainText:
        "The best AI products are winning on retention, not just rapid user growth. Teams are learning that habit formation and repeat usage now matter more than novelty."
    });

    expect(result.zhTitle).toMatch(/[一-龥]/);
    expect(result.summary).toMatch(/[一-龥]/);
    expect(result.keyPoints).toHaveLength(3);
    expect(result.keyJudgements.length).toBeGreaterThanOrEqual(2);
  });

  it("truncates very long article bodies before sending them to the model", () => {
    const longText = "段落".repeat(7000);
    const prepared = prepareArticlePlainTextForModel(longText);

    expect(prepared.length).toBeLessThan(longText.length);
    expect(prepared.length).toBeLessThanOrEqual(12100);
    expect(prepared).toContain("以下内容为节选");
  });

  it("times out slow operations so analysis can fall back", async () => {
    await expect(withTimeout(new Promise(() => undefined), 10, "slow-model")).rejects.toThrow(
      "slow-model timed out"
    );
  });

  it("disambiguates duplicated fallback titles with source-aware suffixes", () => {
    const first = ensureUniqueInsightTitle("Agent 正在从演示能力转向真正可执行的工作流", {
      sourceTitle: "Where Enterprises are Actually Adopting AI",
      sourceUrl: "https://a16z.com/where-enterprises-are-actually-adopting-ai/",
      existingTitles: []
    });

    const second = ensureUniqueInsightTitle("Agent 正在从演示能力转向真正可执行的工作流", {
      sourceTitle: "The Top 100 Gen AI Consumer Apps — 6th Edition",
      sourceUrl: "https://a16z.com/100-gen-ai-apps-6/",
      existingTitles: [first]
    });

    expect(first).toBe("Agent 正在从演示能力转向真正可执行的工作流");
    expect(second).not.toBe(first);
    expect(second).toContain("Gen AI");
  });
});
