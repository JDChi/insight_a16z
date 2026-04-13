import { articleAnalysisSchema, trendPredictionSchema } from "@insight-a16z/core";

describe("analysis schemas", () => {
  it("accepts valid article analysis payloads", () => {
    const result = articleAnalysisSchema.safeParse({
      zhTitle: "测试标题",
      summary: "测试摘要",
      keyPoints: ["a", "b", "c"],
      keyJudgements: ["d", "e"],
      outlook: {
        statement: "未来 6-12 个月会进一步走向产品化。",
        timeHorizon: "未来 6-12 个月",
        whyNow: "文中已经出现更明确的落地信号。",
        signalsToWatch: ["是否出现更多案例"],
        confidence: "medium"
      },
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
