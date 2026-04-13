export function toChineseContentType(type: string): string {
  if (type === "Investment News") return "投资动态";
  if (type === "Article") return "文章";
  return type;
}

export function toChineseTopicName(value: string): string {
  const lower = value.toLowerCase().replace(/\s+/g, "-");

  if (lower === "enterprise-ai") return "企业 AI";
  if (lower === "consumer-ai") return "消费级 AI";
  if (lower === "generative-media") return "生成式媒体";
  if (lower === "ai-infra") return "AI 基础设施";
  if (lower === "agent-workflows") return "Agent 工作流";
  if (lower === "ai-interface") return "AI 界面";
  if (lower === "general-ai") return "通用 AI";

  return value;
}

export function toChineseReviewState(state: string): string {
  if (state === "draft") return "草稿";
  if (state === "ingested") return "待分析";
  if (state === "processing") return "分析中";
  if (state === "reviewing") return "待审核";
  if (state === "approved") return "已通过";
  if (state === "published") return "已发布";
  if (state === "rejected") return "已驳回";
  if (state === "pending") return "待处理";
  if (state === "running") return "运行中";
  if (state === "succeeded") return "成功";
  if (state === "failed") return "失败";
  return state;
}

export function toChineseJobType(jobType: string): string {
  if (jobType === "weekly-ingestion") return "定时采集";
  if (jobType === "article-processing") return "文章处理";
  if (jobType === "article-processing-cron") return "定时处理";
  if (jobType === "article-processing-bootstrap") return "手动初始化";
  if (jobType === "article-processing-scheduled-ingestion") return "采集后处理";
  if (jobType === "topic-rebuild") return "专题重建";
  if (jobType === "digest-generation") return "周报生成";
  return jobType;
}

export function toChineseConfidence(confidence: string): string {
  if (confidence === "high") return "高置信度";
  if (confidence === "medium") return "中置信度";
  if (confidence === "low") return "低置信度";
  return confidence;
}
