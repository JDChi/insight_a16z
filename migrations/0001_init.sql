CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  source_url TEXT NOT NULL UNIQUE,
  canonical_url TEXT,
  slug TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  source_title TEXT NOT NULL,
  zh_title TEXT,
  published_at TEXT NOT NULL,
  summary TEXT,
  key_points_json TEXT DEFAULT '[]',
  key_judgements_json TEXT DEFAULT '[]',
  candidate_topics_json TEXT DEFAULT '[]',
  raw_r2_key TEXT,
  cleaned_r2_key TEXT,
  review_state TEXT NOT NULL DEFAULT 'draft',
  published_on TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  intro TEXT,
  current_consensus_json TEXT DEFAULT '[]',
  disagreements_json TEXT DEFAULT '[]',
  trend_predictions_json TEXT DEFAULT '[]',
  review_state TEXT NOT NULL DEFAULT 'draft',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS article_topic_relations (
  article_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  relation_score REAL DEFAULT 1,
  match_reason TEXT,
  PRIMARY KEY (article_id, topic_id),
  FOREIGN KEY (article_id) REFERENCES articles(id),
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE TABLE IF NOT EXISTS evidence_blocks (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  source_article_id TEXT NOT NULL,
  purpose TEXT NOT NULL,
  claim TEXT NOT NULL,
  evidence_text TEXT NOT NULL,
  source_locator TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS trend_predictions (
  id TEXT PRIMARY KEY,
  topic_id TEXT NOT NULL,
  statement TEXT NOT NULL,
  trigger_conditions_json TEXT NOT NULL,
  time_window TEXT NOT NULL,
  confidence TEXT NOT NULL,
  supporting_evidence_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (topic_id) REFERENCES topics(id)
);

CREATE TABLE IF NOT EXISTS weekly_digests (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  top_signals_json TEXT DEFAULT '[]',
  topic_movements_json TEXT DEFAULT '[]',
  trend_predictions_json TEXT DEFAULT '[]',
  review_state TEXT NOT NULL DEFAULT 'draft',
  published_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingestion_jobs (
  id TEXT PRIMARY KEY,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  error_message TEXT,
  stats_json TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS analysis_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  status TEXT NOT NULL,
  model TEXT,
  prompt_version TEXT NOT NULL,
  input_r2_key TEXT,
  output_r2_key TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS review_states (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  state TEXT NOT NULL,
  reviewer TEXT,
  review_note TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_review_state ON articles (review_state);
CREATE INDEX IF NOT EXISTS idx_topics_review_state ON topics (review_state);
CREATE INDEX IF NOT EXISTS idx_weekly_digests_review_state ON weekly_digests (review_state);
CREATE INDEX IF NOT EXISTS idx_review_states_lookup ON review_states (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_jobs_status ON ingestion_jobs (status);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_entity ON analysis_runs (entity_type, entity_id);
