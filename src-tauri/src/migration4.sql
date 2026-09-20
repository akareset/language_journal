CREATE TABLE app_settings (id INTEGER PRIMARY KEY CHECK(id=1), language TEXT NOT NULL CHECK(language IN ('de','en')), spellcheck INTEGER NOT NULL DEFAULT 0);
INSERT INTO app_settings VALUES(1,'de',0);
DROP TABLE note_lemmas;
DROP TABLE note_analysis;
DROP TABLE lemmas;
CREATE TABLE notes_new (
 id TEXT PRIMARY KEY NOT NULL DEFAULT(lower(hex(randomblob(16)))),
 date_key TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'de' CHECK(language IN ('de','en')),
 document TEXT NOT NULL CHECK(json_valid(document)), plain_text TEXT NOT NULL,
 tags TEXT NOT NULL CHECK(json_valid(tags)),
 created_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 updated_at TEXT NOT NULL DEFAULT(strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 title TEXT, writing_seconds INTEGER NOT NULL DEFAULT 0, body_revision INTEGER NOT NULL DEFAULT 1,
 word_count INTEGER NOT NULL DEFAULT 0, unique_words INTEGER NOT NULL DEFAULT 0,
 UNIQUE(date_key,language)
);
INSERT INTO notes_new(id,date_key,document,plain_text,tags,created_at,updated_at,title,writing_seconds,body_revision,word_count,unique_words)
 SELECT id,date_key,document,plain_text,tags,created_at,updated_at,title,writing_seconds,body_revision,word_count,unique_words FROM notes;
DROP TABLE notes;
ALTER TABLE notes_new RENAME TO notes;
CREATE TABLE note_analysis(note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,body_revision INTEGER NOT NULL,pipeline_version TEXT NOT NULL,model_version TEXT NOT NULL);
CREATE TABLE lemmas(id INTEGER PRIMARY KEY AUTOINCREMENT,language TEXT NOT NULL,lemma_key TEXT NOT NULL,lemma TEXT NOT NULL,UNIQUE(language,lemma_key));
CREATE TABLE note_lemmas(note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,lemma_id INTEGER NOT NULL REFERENCES lemmas(id),pos TEXT NOT NULL,count INTEGER NOT NULL CHECK(count>0),first_position INTEGER NOT NULL,forms TEXT NOT NULL CHECK(json_valid(forms)),PRIMARY KEY(note_id,lemma_id,pos));
CREATE INDEX note_lemmas_lemma ON note_lemmas(lemma_id);
PRAGMA user_version=4;
