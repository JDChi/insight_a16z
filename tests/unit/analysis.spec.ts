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
    expect(result.outlook.statement).toMatch(/[一-龥]/);
    expect(result.outlook.timeHorizon).toMatch(/未来/);
    expect(result.outlook.whyNow).toMatch(/[一-龥]/);
    expect(result.outlook.signalsToWatch.length).toBeGreaterThan(0);
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
    expect(result.outlook.statement).toMatch(/[一-龥]/);
  });

  it("preserves a model-generated Chinese insight title instead of overwriting it", () => {
    const result = repairArticleAnalysisText(
      JSON.stringify({
        zhTitle: "企业采购正在把 GenAI 从试点推向标准化落地",
        summary: "文章指出，企业采购流程已经开始把 GenAI 当成正式的软件预算项，而不是临时试点。",
        keyPoints: ["企业预算开始正式覆盖 GenAI 项目。", "治理与采购正在一起成熟。", "买方更重视长期可维护性。"],
        keyJudgements: ["企业 GenAI 采购正在进入标准化阶段。", "正式预算和治理会加速平台化整合。"],
        outlook: {
          statement: "未来 6-12 个月，企业会从试点采购转向平台化整合。",
          timeHorizon: "未来 6-12 个月",
          whyNow: "采购、预算和治理三条线正在同步成熟。",
          signalsToWatch: ["统一采购平台增多"],
          confidence: "medium"
        },
        candidateTopics: ["enterprise-ai"],
        evidenceLinks: [
          { claim: "判断一", evidenceText: "证据一", sourceLocator: "paragraph:1" },
          { claim: "判断二", evidenceText: "证据二", sourceLocator: "paragraph:2" }
        ]
      }),
      {
        sourceTitle: "How 100 Enterprise CIOs Are Building and Buying Gen AI in 2025",
        contentType: "Article",
        publishedAt: "2025-09-10",
        plainText: "Enterprise buyers are moving from pilots to formal procurement."
      }
    );

    expect(result.zhTitle).toBe("企业采购正在把 GenAI 从试点推向标准化落地");
  });

  it("re-derives a Chinese insight title when the model only echoes the English source title", () => {
    const result = repairArticleAnalysisText(
      JSON.stringify({
        zhTitle: "Retention Is All You Need",
        summary: "文章认为，AI 产品竞争的重点已经从新增转向留存。",
        keyPoints: ["留存比新增更关键。", "重复使用决定产品质量。", "习惯形成成为壁垒。"],
        keyJudgements: ["AI 产品竞争正在转向留存。", "习惯形成会成为核心壁垒。"],
        outlook: {
          statement: "未来 6-12 个月，更多 AI 产品会围绕留存重做体验。",
          timeHorizon: "未来 6-12 个月",
          whyNow: "增长红利正在减弱，团队开始回到产品基本面。",
          signalsToWatch: ["留存指标被更频繁提及"],
          confidence: "medium"
        },
        candidateTopics: ["consumer-ai"],
        evidenceLinks: [
          { claim: "判断一", evidenceText: "证据一", sourceLocator: "paragraph:1" },
          { claim: "判断二", evidenceText: "证据二", sourceLocator: "paragraph:2" }
        ]
      }),
      {
        sourceTitle: "Retention Is All You Need",
        contentType: "Article",
        publishedAt: "2025-09-10",
        plainText: "Retention matters more than growth."
      }
    );

    expect(result.zhTitle).toBe("AI 产品竞争开始从增长转向留存");
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
