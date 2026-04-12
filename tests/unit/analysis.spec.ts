import { HeuristicAnalysisClient } from "../../apps/api/src/lib/analysis";

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
});
