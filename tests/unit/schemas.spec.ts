import { articleAnalysisSchema, trendPredictionSchema } from "@insight-a16z/core";

describe("analysis schemas", () => {
  it("accepts valid article analysis payloads", () => {
    const result = articleAnalysisSchema.safeParse({
      zhTitle: "测试标题",
      summary: "测试摘要",
      keyPoints: ["a", "b", "c"],
      keyJudgements: ["d", "e"],
      candidateTopics: ["agent-workflows"],
      evidenceLinks: [
        {
          claim: "claim",
          evidenceText: "evidence",
          sourceLocator: "p1"
        },
        {
          claim: "claim2",
          evidenceText: "evidence2",
          sourceLocator: "p2"
        }
      ]
    });

    expect(result.success).toBe(true);
  });

  it("rejects trend predictions without evidence", () => {
    const result = trendPredictionSchema.safeParse({
      statement: "trend",
      triggerConditions: ["cond"],
      timeWindow: "未来 1-2 年",
      confidence: "high",
      supportingEvidence: []
    });

    expect(result.success).toBe(false);
  });
});
