import {
  toChineseConfidence,
  toChineseContentType,
  toChineseJobType,
  toChineseReviewState,
  toChineseTopicName
} from "../../apps/web/src/lib/display";

describe("display helpers", () => {
  it("maps user-facing enums to Chinese labels", () => {
    expect(toChineseContentType("Article")).toBe("文章");
    expect(toChineseContentType("Investment News")).toBe("投资动态");
    expect(toChineseTopicName("enterprise-ai")).toBe("企业 AI");
    expect(toChineseTopicName("Enterprise Ai")).toBe("企业 AI");
    expect(toChineseReviewState("published")).toBe("已发布");
    expect(toChineseReviewState("ingested")).toBe("待分析");
    expect(toChineseReviewState("processing")).toBe("分析中");
    expect(toChineseJobType("weekly-ingestion")).toBe("定时采集");
    expect(toChineseJobType("article-processing")).toBe("文章处理");
    expect(toChineseJobType("article-processing-cron")).toBe("定时处理");
    expect(toChineseJobType("article-processing-bootstrap")).toBe("手动初始化");
    expect(toChineseJobType("topic-rebuild")).toBe("专题重建");
    expect(toChineseConfidence("high")).toBe("高置信度");
    expect(toChineseConfidence("medium")).toBe("中置信度");
  });

  it("leaves removed review-only states unmapped", () => {
    expect(toChineseReviewState("reviewing")).toBe("reviewing");
    expect(toChineseReviewState("approved")).toBe("approved");
    expect(toChineseReviewState("rejected")).toBe("rejected");
  });
});
