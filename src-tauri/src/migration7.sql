CREATE TABLE learning_cards (
 id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
 language TEXT NOT NULL CHECK(language IN ('de','en')),
 word TEXT NOT NULL,
 word_key TEXT NOT NULL,
 definition TEXT NOT NULL,
 example TEXT NOT NULL,
 answer TEXT NOT NULL,
 source_date TEXT NOT NULL,
 source_kind TEXT NOT NULL CHECK(source_kind IN ('note','suggestion')),
 note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
 due_at INTEGER NOT NULL DEFAULT (unixepoch()),
 interval_seconds INTEGER NOT NULL DEFAULT 0,
 reviews INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(language,word_key)
);
CREATE TABLE learning_reviews (
 id TEXT PRIMARY KEY NOT NULL,
 card_id TEXT NOT NULL REFERENCES learning_cards(id) ON DELETE CASCADE,
 rating TEXT NOT NULL CHECK(rating IN ('again','hard','good','easy')),
 reviewed_at INTEGER NOT NULL,
 previous_interval INTEGER NOT NULL,
 next_interval INTEGER NOT NULL,
 review_number INTEGER NOT NULL,
 UNIQUE(card_id,review_number)
);
CREATE INDEX learning_cards_due ON learning_cards(language,due_at);
PRAGMA user_version=7;
