export const contentTypes = ["Article", "Investment News"] as const;

export type ContentType = (typeof contentTypes)[number];

export const reviewStates = [
  "draft",
  "ingested",
  "processing",
  "reviewing",
  "approved",
  "rejected",
  "published",
  "failed"
] as const;

export type ReviewState = (typeof reviewStates)[number];

export const confidenceLevels = ["high", "medium", "low"] as const;

export type ConfidenceLevel = (typeof confidenceLevels)[number];

export const entityTypes = ["article", "topic", "digest"] as const;

export type EntityType = (typeof entityTypes)[number];
