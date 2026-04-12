import type {
  AdminOverview,
  ArticleDetail,
  ArticleSummary,
  DigestDetail,
  DigestSummary,
  IngestionJob,
  TopicDetail,
  TopicSummary
} from "./schemas";

export const sampleArticles: ArticleDetail[] = [
  {
    id: "article-1",
    slug: "ai-companions-and-the-next-interface",
    sourceUrl: "https://a16z.com/ai-companions-and-the-next-interface/",
    sourceTitle: "AI Companions and the Next Interface",
    zhTitle: "AI 伴侣与下一代交互界面",
    publishedAt: "2026-03-28",
    contentType: "Article",
    summary:
      "文章认为 AI 伴侣类产品正在从单次工具调用转向持续关系界面，竞争焦点会从模型能力转移到留存、人格设计与分发。",
    reviewState: "published",
    topics: ["consumer-ai", "ai-interface"],
    keyPoints: [
      "持续对话关系比单轮任务更容易形成差异化留存。",
      "产品护城河不只来自模型，还来自角色设定和反馈回路。",
      "分发渠道和病毒传播将决定这类产品的爆发速度。"
    ],
    keyJudgements: [
      "AI 消费产品会越来越像关系型产品而不是工具型产品。",
      "人格和记忆管理会成为下一阶段的重要产品能力。"
    ],
    evidenceLinks: [
      {
        claim: "关系型留存是关键",
        evidenceText: "Users return for continuity, not just task completion.",
        sourceLocator: "section:relationship-retention"
      },
      {
        claim: "人格与反馈会形成差异化",
        evidenceText: "Character design and response loops drive preference.",
        sourceLocator: "section:character-design"
      }
    ],
    relatedTopics: [
      {
        slug: "consumer-ai",
        name: "消费级 AI"
      },
      {
        slug: "ai-interface",
        name: "AI 界面"
      }
    ]
  },
  {
    id: "article-2",
    slug: "why-we-invested-in-agentic-workflows",
    sourceUrl: "https://a16z.com/why-we-invested-in-agentic-workflows/",
    sourceTitle: "Why We Invested in Agentic Workflows",
    zhTitle: "为什么我们押注 Agent 工作流",
    publishedAt: "2026-03-17",
    contentType: "Investment News",
    summary:
      "文章通过投资案例说明，企业正在把 AI 从问答助手升级为可执行任务的工作流系统，关键在于任务边界、审批与可观测性。",
    reviewState: "reviewing",
    topics: ["agent-workflows", "enterprise-ai"],
    keyPoints: [
      "企业采用的重点是任务闭环，而不是单点自动化。",
      "审批机制与人工接管能力会直接决定可用性。",
      "可观测性是规模化部署的先决条件。"
    ],
    keyJudgements: [
      "企业 Agent 的真正价值在于接入流程，而不是对话体验。",
      "具备审计能力的工作流产品更可能在大客户场景中胜出。"
    ],
    evidenceLinks: [
      {
        claim: "任务闭环是关键",
        evidenceText: "Customers adopt systems that can complete bounded workflows.",
        sourceLocator: "section:workflow-completion"
      },
      {
        claim: "可观测性不可缺",
        evidenceText: "Observability determines whether teams trust automation.",
        sourceLocator: "section:observability"
      }
    ],
    relatedTopics: [
      {
        slug: "agent-workflows",
        name: "Agent 工作流"
      }
    ]
  }
];

export const sampleTopics: TopicDetail[] = [
  {
    id: "topic-1",
    slug: "agent-workflows",
    name: "Agent 工作流",
    intro: "从 Copilot 到可执行工作流，a16z 正在密集关注企业 Agent 的落地路径。",
    articleCount: 6,
    updatedAt: "2026-04-10",
    reviewState: "published",
    currentConsensus: [
      "企业 Agent 的落地重心已经从演示能力转向工作流整合。",
      "审批、日志与权限控制是进入生产环境的硬门槛。"
    ],
    disagreements: [
      "不同团队对通用 Agent 与垂直 Agent 的优先级仍有分歧。"
    ],
    trendPredictions: [
      {
        statement: "未来 12-24 个月内，企业 Agent 产品会更强调流程编排而不是单轮助手。",
        triggerConditions: ["企业预算继续流向自动化系统", "厂商提供更稳定的审批和回滚机制"],
        timeWindow: "未来 1-2 年",
        confidence: "high",
        supportingEvidence: [
          {
            claim: "工作流比聊天界面更重要",
            evidenceText: "Customers adopt systems that can complete bounded workflows.",
            sourceLocator: "article-2#workflow-completion"
          }
        ]
      },
      {
        statement: "可观测性与审计能力会成为企业采购清单里的默认项。",
        triggerConditions: ["更多流程迁移到生产环境", "安全与合规要求继续提高"],
        timeWindow: "未来 1-2 年",
        confidence: "medium",
        supportingEvidence: [
          {
            claim: "可观测性决定信任",
            evidenceText: "Observability determines whether teams trust automation.",
            sourceLocator: "article-2#observability"
          }
        ]
      }
    ],
    evidenceLinks: [
      {
        claim: "Agent 落地依赖工作流整合",
        evidenceText: "Enterprise buyers care about bounded workflows, not demos.",
        sourceLocator: "article-2#workflow-completion"
      }
    ],
    timeline: [
      {
        articleId: "article-2",
        slug: "why-we-invested-in-agentic-workflows",
        title: "为什么我们押注 Agent 工作流",
        publishedAt: "2026-03-17"
      }
    ]
  },
  {
    id: "topic-2",
    slug: "consumer-ai",
    name: "消费级 AI",
    intro: "围绕 AI 原生消费产品的分发、留存与产品形态变化。",
    articleCount: 4,
    updatedAt: "2026-04-07",
    reviewState: "approved",
    currentConsensus: [
      "消费级 AI 的竞争重点正在从功能新奇感转向长期留存。",
      "角色设定和持续交互会影响产品差异化。"
    ],
    disagreements: [],
    trendPredictions: [
      {
        statement: "AI 消费产品会逐步向持续关系型产品演进。",
        triggerConditions: ["模型成本继续下降", "移动端分发改善"],
        timeWindow: "未来 1-2 年",
        confidence: "medium",
        supportingEvidence: [
          {
            claim: "持续对话关系更能驱动留存",
            evidenceText: "Users return for continuity, not just task completion.",
            sourceLocator: "article-1#relationship-retention"
          }
        ]
      },
      {
        statement: "人格设计会成为新的产品层竞争点。",
        triggerConditions: ["竞争者功能趋同", "用户对角色陪伴诉求增强"],
        timeWindow: "未来 1-2 年",
        confidence: "medium",
        supportingEvidence: [
          {
            claim: "角色设计驱动偏好",
            evidenceText: "Character design and response loops drive preference.",
            sourceLocator: "article-1#character-design"
          }
        ]
      }
    ],
    evidenceLinks: [
      {
        claim: "留存来自连续关系",
        evidenceText: "Users return for continuity, not just task completion.",
        sourceLocator: "article-1#relationship-retention"
      }
    ],
    timeline: [
      {
        articleId: "article-1",
        slug: "ai-companions-and-the-next-interface",
        title: "AI 伴侣与下一代交互界面",
        publishedAt: "2026-03-28"
      }
    ]
  }
];

export const sampleDigests: DigestDetail[] = [
  {
    id: "digest-1",
    slug: "2026-w14",
    title: "a16z AI 周报 2026 第 14 周",
    weekStart: "2026-03-30",
    weekEnd: "2026-04-05",
    reviewState: "published",
    publishedAt: "2026-04-06",
    topSignals: [
      "企业 Agent 的讨论继续从原型转向生产工作流。",
      "消费级 AI 的留存逻辑越来越像关系型产品。",
      "Investment News 正在为主题演化提供直接投资印证。"
    ],
    topicMovements: [
      "Agent 工作流专题的证据强度继续上升。",
      "消费级 AI 专题从聊天体验转向长期关系构建。"
    ],
    trendPredictions: [
      {
        statement: "企业会优先采购具备审计与审批的 Agent 平台。",
        triggerConditions: ["采购周期进入规模部署", "安全团队参与选型"],
        timeWindow: "未来 1-2 年",
        confidence: "high",
        supportingEvidence: [
          {
            claim: "可观测性决定采用",
            evidenceText: "Observability determines whether teams trust automation.",
            sourceLocator: "article-2#observability"
          }
        ]
      },
      {
        statement: "消费级 AI 产品会加速分化为工具型与关系型两类。",
        triggerConditions: ["用户使用场景继续分层", "模型能力进一步商品化"],
        timeWindow: "未来 1-2 年",
        confidence: "medium",
        supportingEvidence: [
          {
            claim: "连续关系带来留存",
            evidenceText: "Users return for continuity, not just task completion.",
            sourceLocator: "article-1#relationship-retention"
          }
        ]
      }
    ],
    evidenceLinks: [
      {
        claim: "企业 Agent 正在走向生产化",
        evidenceText: "Customers adopt systems that can complete bounded workflows.",
        sourceLocator: "article-2#workflow-completion"
      }
    ]
  }
];

export const sampleJobs: IngestionJob[] = [
  {
    id: "job-1",
    jobType: "weekly-ingestion",
    status: "succeeded",
    startedAt: "2026-04-06T01:00:00.000Z",
    endedAt: "2026-04-06T01:08:00.000Z",
    errorMessage: null,
    stats: {
      discovered: 12,
      ingested: 8,
      filtered: 4
    }
  },
  {
    id: "job-2",
    jobType: "topic-rebuild",
    status: "failed",
    startedAt: "2026-04-06T01:10:00.000Z",
    endedAt: "2026-04-06T01:13:00.000Z",
    errorMessage: "LLM output schema validation failed",
    stats: {
      topicsAttempted: 3
    }
  }
];

export const sampleOverview: AdminOverview = {
  draftArticles: 2,
  reviewingArticles: 4,
  publishedArticles: 18,
  topicsInReview: 2,
  pendingJobs: 1,
  failedJobs: 1
};

export const sampleArticleSummaries: ArticleSummary[] = sampleArticles.map(
  ({
    id,
    slug,
    sourceUrl,
    sourceTitle,
    zhTitle,
    publishedAt,
    contentType,
    summary,
    reviewState,
    topics
  }) => ({
    id,
    slug,
    sourceUrl,
    sourceTitle,
    zhTitle,
    publishedAt,
    contentType,
    summary,
    reviewState,
    topics
  })
);

export const sampleTopicSummaries: TopicSummary[] = sampleTopics.map(
  ({ id, slug, name, intro, articleCount, updatedAt, reviewState }) => ({
    id,
    slug,
    name,
    intro,
    articleCount,
    updatedAt,
    reviewState
  })
);

export const sampleDigestSummaries: DigestSummary[] = sampleDigests.map(
  ({ id, slug, title, weekStart, weekEnd, reviewState, publishedAt }) => ({
    id,
    slug,
    title,
    weekStart,
    weekEnd,
    reviewState,
    publishedAt
  })
);
