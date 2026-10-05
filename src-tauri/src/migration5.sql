CREATE TABLE ai_settings (
 id INTEGER PRIMARY KEY CHECK(id=1),
 config TEXT NOT NULL CHECK(json_valid(config))
);
CREATE TABLE ai_analyses (
 id TEXT PRIMARY KEY NOT NULL,
 note_id TEXT NOT NULL REFERENCES notes(id),
 record TEXT NOT NULL CHECK(json_valid(record)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX ai_analyses_note ON ai_analyses(note_id,created_at DESC);
CREATE TABLE ai_decisions (
 id TEXT PRIMARY KEY NOT NULL,
 analysis_id TEXT NOT NULL REFERENCES ai_analyses(id),
 finding_id TEXT NOT NULL,
 action TEXT NOT NULL CHECK(action IN ('accepted','dismissed')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
PRAGMA user_version=5;
