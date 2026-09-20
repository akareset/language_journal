use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{path::Path, time::Duration};

// Centralized production location; never fall back to another drive.
pub const DATABASE_PATH: &str = r"D:\GermanNotesData\notes.db";

#[derive(Debug, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Draft {
    pub date_key: String,
    pub language: String,
    pub title: Option<String>,
    pub document: Value,
    pub plain_text: String,
    pub tags: Vec<String>,
    #[serde(default)]
    pub writing_seconds: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Note {
    pub id: String,
    pub date_key: String,
    pub language: String,
    pub title: Option<String>,
    pub document: Value,
    pub plain_text: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub writing_seconds: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteSummary {
    pub id: String,
    pub date_key: String,
    pub language: String,
    pub title: Option<String>,
    pub tags: Vec<String>,
}

pub fn list_notes(db: &Connection) -> Result<Vec<NoteSummary>, String> {
    // A title-only or tagged note is intentional work; a fully cleared draft
    // is not. Keep this same set for both the calendar and its activity counts.
    // Document JSON and plain text never cross IPC for the calendar.
    let mut query = db.prepare(
        "SELECT id,date_key,title,tags,language FROM notes
         WHERE language=(SELECT language FROM app_settings WHERE id=1) AND (trim(plain_text, char(9)||char(10)||char(13)||char(32)||char(160)) <> ''
            OR trim(coalesce(title,'')) <> '' OR json_array_length(tags) > 0)
         ORDER BY date_key DESC, id ASC",
    ).map_err(|e| format!("Could not list notes: {e}"))?;
    let rows = query.query_map([], |row| {
        let tags: String = row.get(3)?;
        Ok(NoteSummary {
            language: row.get(4)?, id: row.get(0)?, date_key: row.get(1)?, title: row.get(2)?,
            tags: serde_json::from_str(&tags).map_err(|e| {
                rusqlite::Error::FromSqlConversionFailure(3, rusqlite::types::Type::Text, Box::new(e))
            })?,
        })
    }).map_err(|e| format!("Could not list notes: {e}"))?;
    rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| format!("Could not read note summaries: {e}"))
}

pub fn open_database() -> Result<Connection, String> {
    open_at(Path::new(DATABASE_PATH)).map_err(|e| format!("Could not open {DATABASE_PATH}: {e}. Check that D: is available and the folder is writable."))
}

fn open_at(path: &Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let mut db = Connection::open(path).map_err(|e| e.to_string())?;
    db.pragma_update(None, "foreign_keys", true).map_err(|e| e.to_string())?;
    db.busy_timeout(Duration::from_secs(5)).map_err(|e| e.to_string())?;
    migrate(&mut db)?;
    Ok(db)
}

pub(crate) fn migrate(db: &mut Connection) -> Result<(), String> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    let version: i64 = tx.pragma_query_value(None, "user_version", |row| row.get(0)).map_err(|e| e.to_string())?;
    if version > 4 { return Err(format!("Database version {version} is newer than this app supports")); }
    if version == 0 {
        tx.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
                date_key TEXT NOT NULL UNIQUE,
                document TEXT NOT NULL CHECK(json_valid(document)),
                plain_text TEXT NOT NULL,
                tags TEXT NOT NULL CHECK(json_valid(tags)),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            ); PRAGMA user_version = 1;",
        ).map_err(|e| format!("Database migration failed: {e}"))?;
    }
    if version < 2 {
        // NULL uses the German date heading. Dates and content stay untouched.
        tx.execute_batch("ALTER TABLE notes ADD COLUMN title TEXT; PRAGMA user_version = 2;")
            .map_err(|e| format!("Title migration failed: {e}"))?;
    }
    if version < 3 {
        tx.execute_batch(
            "ALTER TABLE notes ADD COLUMN writing_seconds INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE notes ADD COLUMN body_revision INTEGER NOT NULL DEFAULT 1;
             ALTER TABLE notes ADD COLUMN word_count INTEGER NOT NULL DEFAULT 0;
             ALTER TABLE notes ADD COLUMN unique_words INTEGER NOT NULL DEFAULT 0;
             CREATE TABLE note_analysis (
                note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
                body_revision INTEGER NOT NULL, pipeline_version TEXT NOT NULL,
                model_version TEXT NOT NULL
             );
             CREATE TABLE lemmas (
                id INTEGER PRIMARY KEY AUTOINCREMENT, lemma_key TEXT NOT NULL UNIQUE,
                lemma TEXT NOT NULL
             );
             CREATE TABLE note_lemmas (
                note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
                lemma_id INTEGER NOT NULL REFERENCES lemmas(id), pos TEXT NOT NULL,
                count INTEGER NOT NULL CHECK(count > 0), first_position INTEGER NOT NULL,
                forms TEXT NOT NULL CHECK(json_valid(forms)),
                PRIMARY KEY(note_id, lemma_id, pos)
             );
             CREATE INDEX note_lemmas_lemma ON note_lemmas(lemma_id);
             PRAGMA user_version = 3;",
        ).map_err(|e| format!("Vocabulary migration failed: {e}"))?;
        let rows = {
            let mut query = tx.prepare("SELECT id,plain_text FROM notes").map_err(|e| e.to_string())?;
            let rows = query.query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))).map_err(|e| e.to_string())?;
            rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
        };
        for (id, text) in rows {
            let (total, unique) = word_counts(&text);
            tx.execute("UPDATE notes SET word_count=?1,unique_words=?2 WHERE id=?3", params![total, unique, id]).map_err(|e| e.to_string())?;
        }
    }
    if version < 4 { tx.execute_batch(include_str!("migration4.sql")).map_err(|e| format!("Language migration failed: {e}"))?; }
    tx.commit().map_err(|e| e.to_string())
}

fn validate_date(key: &str) -> Result<(), String> {
    let bytes = key.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-'
        || !bytes.iter().enumerate().all(|(i, b)| i == 4 || i == 7 || b.is_ascii_digit()) {
        return Err("Date must be YYYY-MM-DD".into());
    }
    let year: u32 = key[..4].parse().unwrap();
    let month: u32 = key[5..7].parse().unwrap();
    let day: u32 = key[8..].parse().unwrap();
    let leap = year.is_multiple_of(4) && (!year.is_multiple_of(100) || year.is_multiple_of(400));
    let days = match month { 4 | 6 | 9 | 11 => 30, 2 => if leap { 29 } else { 28 }, 1..=12 => 31, _ => 0 };
    if year == 0 || day == 0 || day > days { return Err("Invalid calendar date".into()); }
    Ok(())
}

pub fn load(db: &Connection, date_key: &str) -> Result<Option<Note>, String> {
    load_language(db, date_key, &crate::settings::load(db)?.language)
}
pub fn load_language(db: &Connection, date_key: &str, language: &str) -> Result<Option<Note>, String> {
    crate::settings::validate(language)?;
    validate_date(date_key)?;
    db.query_row(
        "SELECT id,date_key,document,plain_text,tags,created_at,updated_at,title,writing_seconds,language FROM notes WHERE date_key=?1 AND language=?2",
        params![date_key,language],
        |row| {
            let document: String = row.get(2)?;
            let tags: String = row.get(4)?;
            let json_error = |e| rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(e));
            Ok(Note {
                id: row.get(0)?, date_key: row.get(1)?,
                title: row.get(7)?,
                document: serde_json::from_str(&document).map_err(json_error)?,
                plain_text: row.get(3)?, tags: serde_json::from_str(&tags).map_err(json_error)?,
                created_at: row.get(5)?, updated_at: row.get(6)?,
                writing_seconds: row.get(8)?, language: row.get(9)?,
            })
        },
    ).optional().map_err(|e| format!("Could not load note: {e}"))
}

pub fn save(db: &mut Connection, draft: &Draft) -> Result<Note, String> {
    validate_date(&draft.date_key)?;
    crate::settings::validate(&draft.language)?;
    if draft.writing_seconds < 0 { return Err("Writing time cannot be negative".into()); }
    // Also covers closing while an emptied title field still has focus.
    let title = draft.title.as_deref().filter(|value| !value.trim().is_empty());
    if draft.document.get("type").and_then(Value::as_str) != Some("doc") {
        return Err("Editor document must be a Tiptap doc".into());
    }
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| format!("Could not start save: {e}"))?;
    let old_text: Option<String> = tx.query_row("SELECT plain_text FROM notes WHERE date_key=?1 AND language=?2", params![draft.date_key,draft.language], |row| row.get(0)).optional().map_err(|e| e.to_string())?;
    let (words, unique) = word_counts(&draft.plain_text);
    tx.execute(
        "INSERT INTO notes (date_key,document,plain_text,tags,title,writing_seconds,word_count,unique_words,language) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(date_key,language) DO UPDATE SET document=excluded.document,
         plain_text=excluded.plain_text,tags=excluded.tags,title=excluded.title,
         writing_seconds=max(notes.writing_seconds,excluded.writing_seconds),
         word_count=excluded.word_count,unique_words=excluded.unique_words,
         body_revision=notes.body_revision + CASE WHEN notes.plain_text<>excluded.plain_text THEN 1 ELSE 0 END,
         updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')",
        params![draft.date_key, draft.document.to_string(), draft.plain_text, serde_json::to_string(&draft.tags).map_err(|e| e.to_string())?, title, draft.writing_seconds, words, unique,draft.language],
    ).map_err(|e| format!("Could not save note: {e}"))?;
    let note = load_language(&tx, &draft.date_key, &draft.language)?.ok_or("Saved note could not be read")?;
    if old_text.as_deref() != Some(&draft.plain_text) {
        tx.execute("DELETE FROM note_lemmas WHERE note_id=?1", [&note.id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM note_analysis WHERE note_id=?1", [&note.id]).map_err(|e| e.to_string())?;
        tx.execute("DELETE FROM lemmas WHERE NOT EXISTS (SELECT 1 FROM note_lemmas WHERE lemma_id=lemmas.id)", []).map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| format!("Could not commit note: {e}"))?;
    Ok(note)
}

pub fn word_counts(text: &str) -> (i64, i64) {
    let words: Vec<String> = text.split(|c: char| !c.is_alphabetic() && !matches!(c, '-' | '\'' | '’'))
        .map(|word| word.trim_matches(|c: char| !c.is_alphabetic()).to_lowercase())
        .filter(|word| !word.is_empty()).collect();
    let unique = words.iter().collect::<std::collections::BTreeSet<_>>().len();
    (words.len() as i64, unique as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn draft() -> Draft {
        Draft { language:"de".into(), writing_seconds: 0, date_key: "2026-09-16".into(), title: None, document: serde_json::json!({"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Grüße, Straße!","marks":[{"type":"bold"}]}]}]}), plain_text: "Grüße, Straße!".into(), tags: vec!["Universität".into(), "daily".into()] }
    }
    fn memory() -> Connection {
        let mut db = Connection::open_in_memory().unwrap(); migrate(&mut db).unwrap(); db
    }
    #[test]
    fn version_one_migration_preserves_note_and_title_changes_preserve_date() {
        let mut db = Connection::open_in_memory().unwrap();
        db.execute_batch(
            "CREATE TABLE notes (
                id TEXT PRIMARY KEY NOT NULL DEFAULT (lower(hex(randomblob(16)))),
                date_key TEXT NOT NULL UNIQUE,
                document TEXT NOT NULL CHECK(json_valid(document)),
                plain_text TEXT NOT NULL,
                tags TEXT NOT NULL CHECK(json_valid(tags)),
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
                updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
            );
            INSERT INTO notes VALUES ('existing-id', '2026-09-16',
                '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}',
                'Existing text', '[\"daily\"]', 'created', 'updated');
            PRAGMA user_version = 1;",
        ).unwrap();
        migrate(&mut db).unwrap();
        migrate(&mut db).unwrap();
        let note = load(&db, "2026-09-16").unwrap().unwrap();
        assert_eq!(note.id, "existing-id");
        assert_eq!(note.plain_text, "Existing text");
        assert_eq!(note.tags, vec!["daily"]);
        assert_eq!(note.created_at, "created");
        assert_eq!(note.updated_at, "updated");
        assert_eq!(note.title, None);
        assert_eq!(db.pragma_query_value(None, "user_version", |row| row.get::<_, i64>(0)).unwrap(), 4);

        let mut data = Draft { language:"de".into(),
            writing_seconds: 0, date_key: note.date_key.clone(), title: Some("Mein schöner Tag".into()),
            document: note.document.clone(), plain_text: note.plain_text.clone(), tags: note.tags.clone(),
        };
        let original = note;
        let renamed = save(&mut db, &data).unwrap();
        assert_eq!(renamed.title, data.title);
        assert_eq!(renamed.id, original.id);
        assert_eq!(renamed.date_key, original.date_key);
        assert_eq!(renamed.document, original.document);
        assert_eq!(renamed.created_at, original.created_at);
        data.title = None;
        assert_eq!(save(&mut db, &data).unwrap().title, None);
        data.title = Some("  ".into());
        assert_eq!(save(&mut db, &data).unwrap().title, None);
    }
    #[test]
    fn calendar_summaries_exclude_cleared_notes_and_never_include_bodies() {
        let mut db = memory();
        assert!(list_notes(&db).unwrap().is_empty());
        let mut data = draft();
        save(&mut db, &data).unwrap();
        data.date_key = "2026-09-14".into();
        data.plain_text = " \n\t\r\u{a0}".into();
        data.tags.clear();
        save(&mut db, &data).unwrap();
        data.date_key = "2026-09-17".into();
        data.title = Some("A title-only note".into());
        save(&mut db, &data).unwrap();
        data.date_key = "2026-09-15".into();
        data.title = None;
        data.tags = vec!["lernen".into()];
        let tagged = save(&mut db, &data).unwrap();
        let summaries = list_notes(&db).unwrap();
        assert_eq!(summaries.iter().map(|n| n.date_key.as_str()).collect::<Vec<_>>(),
            vec!["2026-09-17", "2026-09-16", "2026-09-15"]);
        assert_eq!(summaries[0].title.as_deref(), Some("A title-only note"));
        assert_eq!(summaries[2].id, tagged.id);
        assert_eq!(summaries[2].tags, vec!["lernen"]);
        let json = serde_json::to_value(&summaries[0]).unwrap();
        assert!(json.get("document").is_none());
        assert!(json.get("plainText").is_none());

        data.tags.clear();
        save(&mut db, &data).unwrap();
        assert_eq!(list_notes(&db).unwrap().len(), 2);
    }
    #[test]
    fn listing_failure_is_an_error_not_an_empty_calendar() {
        let db = memory();
        db.execute_batch("DROP TABLE notes").unwrap();
        assert!(list_notes(&db).unwrap_err().contains("Could not list notes"));
    }
    #[test]
    fn empty_launch_and_repeat_migrations_do_not_create_notes() {
        let mut db = memory(); migrate(&mut db).unwrap();
        assert!(load(&db, "2026-09-16").unwrap().is_none());
    }
    #[test]
    fn roundtrip_updates_same_id_and_all_fields() {
        let mut db = memory(); let mut data = draft();
        let first = save(&mut db, &data).unwrap();
        assert_eq!(first.document, data.document); assert_eq!(first.tags, data.tags);
        data.plain_text = "Neu".into(); data.document = serde_json::json!({"type":"doc"}); data.tags.clear();
        for _ in 0..20 { save(&mut db, &data).unwrap(); }
        let last = load(&db, &data.date_key).unwrap().unwrap();
        assert_eq!(last.id, first.id); assert_eq!(last.created_at, first.created_at);
        assert_eq!(last.plain_text, "Neu"); assert_eq!(last.document, data.document); assert!(last.tags.is_empty());
        assert_eq!(db.query_row("SELECT count(*) FROM notes", [], |r| r.get::<_, i64>(0)).unwrap(), 1);
    }
    #[test]
    fn failure_preserves_previous_note() {
        let mut db = memory(); let mut data = draft(); save(&mut db, &data).unwrap();
        db.execute_batch("CREATE TRIGGER fail_save BEFORE UPDATE ON notes BEGIN SELECT RAISE(ABORT, 'test failure'); END;").unwrap();
        data.plain_text = "Must not commit".into();
        assert!(save(&mut db, &data).unwrap_err().contains("test failure"));
        assert_eq!(load(&db, &data.date_key).unwrap().unwrap().plain_text, "Grüße, Straße!");
    }
    #[test]
    fn disk_reopen_preserves_content_and_creates_parent() {
        let folder = std::env::temp_dir().join(format!("deutsch-journal-test-{}-{}", std::process::id(), std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()));
        let path = folder.join("nested/notes.db");
        let expected = {
            let mut db = open_at(&path).unwrap();
            let mut data = draft();
            data.title = Some("Ein Tag in Köln".into());
            save(&mut db, &data).unwrap()
        };
        let db = open_at(&path).unwrap(); let actual = load(&db, &expected.date_key).unwrap().unwrap();
        assert_eq!(actual.id, expected.id); assert_eq!(actual.document, expected.document); assert_eq!(actual.tags, expected.tags);
        assert_eq!(actual.title, expected.title);
        drop(db); std::fs::remove_file(&path).unwrap(); std::fs::remove_dir(folder.join("nested")).unwrap(); std::fs::remove_dir(folder).unwrap();
    }
    #[test]
    fn rejects_invalid_dates_future_schema_and_bad_location() {
        let mut db = memory();
        for key in ["2026-02-29", "2026-13-01", "2026-00-00", "../../oops", "0000-01-01"] { assert!(load(&db, key).is_err()); }
        assert!(load(&db, "2024-02-29").is_ok());
        db.pragma_update(None, "user_version", 5).unwrap(); assert!(migrate(&mut db).is_err());
        assert!(open_at(Path::new(file!()).join("notes.db").as_path()).is_err());
    }
}
