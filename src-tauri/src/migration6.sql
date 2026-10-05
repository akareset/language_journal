CREATE TABLE ai_period_insights (
 id TEXT PRIMARY KEY NOT NULL,
 language TEXT NOT NULL,
 start_date TEXT NOT NULL,
 end_date TEXT NOT NULL,
 record TEXT NOT NULL CHECK(json_valid(record)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ai_period_insights_period ON ai_period_insights(language,start_date,end_date,created_at DESC);
PRAGMA user_version=6;
