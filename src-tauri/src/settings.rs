use rusqlite::{Connection, params};
use serde::{Serialize, Deserialize};
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {pub language: String, pub spellcheck: bool}
pub fn validate(language: &str) -> Result<(),String> {
 if matches!(language,"de"|"en") {Ok(())} else {Err("Unsupported language".into())}
}
pub fn load(db: &Connection) -> Result<Settings,String> {
 db.query_row("SELECT language,spellcheck FROM app_settings WHERE id=1",[],|r|Ok(Settings {language:r.get(0)?,spellcheck:r.get(1)?})).map_err(|e|e.to_string())
}
pub fn save(db:&Connection,settings:&Settings)->Result<(),String> {
 validate(&settings.language)?;
 let changed=db.execute("UPDATE app_settings SET language=?1,spellcheck=?2 WHERE id=1",params![settings.language,settings.spellcheck]).map_err(|e|e.to_string())?;
 if changed != 1 {return Err("Settings record is missing".into());} Ok(())
}

#[cfg(test)]
mod tests {
 use super::*;
 use crate::{storage,vocabulary,nlp};
 #[test]
 fn language_journals_and_settings_are_isolated() {
  let mut db=Connection::open_in_memory().unwrap();storage::migrate(&mut db).unwrap();
  assert_eq!(load(&db).unwrap().language,"de");assert!(!load(&db).unwrap().spellcheck);
  let mut data=storage::Draft {ai_decisions:vec![],language:"de".into(),date_key:"2026-09-19".into(),title:Some("Mein Titel".into()),document:serde_json::json!({"type":"doc"}),plain_text:"ging".into(),tags:vec!["lernen".into()],writing_seconds:30};
  let german=storage::save(&mut db,&data).unwrap();
  let analysis=|name:&str|vocabulary::Analysis {model_version:"test".into(),lemmas:vec![vocabulary::AnalyzedLemma {key:name.into(),lemma:name.into(),pos:"VERB".into(),count:1,first_position:0,forms:vec![]}]};
  let pending=vocabulary::next_pending(&db).unwrap().unwrap();vocabulary::commit_analysis(&mut db,&pending,&analysis("test")).unwrap();
  save(&db,&Settings{language:"en".into(),spellcheck:true}).unwrap();
  assert!(storage::load(&db,&data.date_key).unwrap().is_none());assert!(storage::list_notes(&db).unwrap().is_empty());
  assert_eq!(vocabulary::snapshot(&mut db,nlp::WorkerStatus::default()).unwrap().total_lemmas,0);
  data.language="en".into();data.plain_text="went".into();data.title=None;
  let english=storage::save(&mut db,&data).unwrap();assert_ne!(german.id,english.id);
  let pending=vocabulary::next_pending(&db).unwrap().unwrap();assert_eq!(pending.language,"en");vocabulary::commit_analysis(&mut db,&pending,&analysis("test")).unwrap();
  assert_eq!(db.query_row("SELECT count(*) FROM lemmas",[],|r|r.get::<_,i64>(0)).unwrap(),2);
  assert_eq!(vocabulary::snapshot(&mut db,nlp::WorkerStatus::default()).unwrap().notes.len(),1);
  save(&db,&Settings{language:"de".into(),spellcheck:false}).unwrap();
  let restored=storage::load(&db,&data.date_key).unwrap().unwrap();assert_eq!(restored.id,german.id);assert_eq!(restored.plain_text,"ging");assert_eq!(restored.writing_seconds,30);
  assert_eq!(storage::list_notes(&db).unwrap().len(),1);
  assert!(save(&db,&Settings{language:"xx".into(),spellcheck:false}).is_err());assert_eq!(load(&db).unwrap().language,"de");
 }
}

#[cfg(test)]
mod migration_tests {
 use super::*;
 #[test]
 fn version_three_migration_preserves_notes_with_foreign_keys_enabled() {
  let mut db=Connection::open_in_memory().unwrap();db.pragma_update(None,"foreign_keys",true).unwrap();
  db.execute_batch("CREATE TABLE notes(id TEXT PRIMARY KEY,date_key TEXT UNIQUE,document TEXT,plain_text TEXT,tags TEXT,created_at TEXT,updated_at TEXT,title TEXT,writing_seconds INTEGER,body_revision INTEGER,word_count INTEGER,unique_words INTEGER);
   CREATE TABLE lemmas(id INTEGER PRIMARY KEY,lemma_key TEXT UNIQUE,lemma TEXT);
   CREATE TABLE note_analysis(note_id TEXT PRIMARY KEY REFERENCES notes(id),body_revision INTEGER,pipeline_version TEXT,model_version TEXT);
   CREATE TABLE note_lemmas(note_id TEXT REFERENCES notes(id),lemma_id INTEGER REFERENCES lemmas(id),pos TEXT,count INTEGER,first_position INTEGER,forms TEXT);
   INSERT INTO notes VALUES('stable-id','2026-09-17','{\"type\":\"doc\"}','Grüße','[\"lernen\"]','created','updated','Mein Titel',90,2,1,1);
   INSERT INTO lemmas VALUES(1,'gruß','Gruß');
   INSERT INTO note_analysis VALUES('stable-id',2,'old','old');
   INSERT INTO note_lemmas VALUES('stable-id',1,'NOUN',1,0,'[]'); PRAGMA user_version=3;").unwrap();
  crate::storage::migrate(&mut db).unwrap();
  let note=crate::storage::load(&db,"2026-09-17").unwrap().unwrap();
  assert_eq!(note.id,"stable-id");assert_eq!(note.language,"de");assert_eq!(note.plain_text,"Grüße");assert_eq!(note.tags,vec!["lernen"]);assert_eq!(note.writing_seconds,90);assert_eq!(note.created_at,"created");assert_eq!(note.updated_at,"updated");assert_eq!(note.title.as_deref(),Some("Mein Titel"));
  assert!(crate::vocabulary::next_pending(&db).unwrap().is_some());
  assert_eq!(db.query_row("SELECT count(*) FROM pragma_foreign_key_check",[],|r|r.get::<_,i64>(0)).unwrap(),0);
  crate::storage::migrate(&mut db).unwrap();assert_eq!(crate::storage::list_notes(&db).unwrap().len(),1);
 }
 #[test]
 fn failed_settings_write_never_changes_preferences() {
  let mut db=Connection::open_in_memory().unwrap();crate::storage::migrate(&mut db).unwrap();
  db.execute_batch("CREATE TRIGGER deny_settings BEFORE UPDATE ON app_settings BEGIN SELECT RAISE(ABORT,'simulated failure'); END;").unwrap();
  assert!(save(&db,&Settings{language:"en".into(),spellcheck:true}).is_err());assert_eq!(load(&db).unwrap().language,"de");assert!(!load(&db).unwrap().spellcheck);
 }
}
