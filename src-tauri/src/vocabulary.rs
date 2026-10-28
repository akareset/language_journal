use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

pub const PIPELINE_VERSION: &str = "multilingual-content-v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Form {
    pub form: String,
    pub morph: String,
    pub count: i64,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalyzedLemma {
    pub key: String,
    pub lemma: String,
    pub pos: String,
    pub count: i64,
    pub first_position: i64,
    pub forms: Vec<Form>,
}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Analysis {
    pub lemmas: Vec<AnalyzedLemma>,
    pub model_version: String,
}
#[derive(Debug)]
pub struct PendingNote {
    pub id: String,
    pub language: String,
    pub revision: i64,
    pub text: String,
    pub words: i64,
}

pub fn next_pending(db: &Connection) -> Result<Option<PendingNote>, String> {
    db.query_row(
        "SELECT n.id,n.body_revision,n.plain_text,n.word_count,n.language FROM notes n
         LEFT JOIN note_analysis a ON a.note_id=n.id
         WHERE a.note_id IS NULL OR a.body_revision<>n.body_revision OR a.pipeline_version<>?1
         ORDER BY n.updated_at,n.date_key LIMIT 1", [PIPELINE_VERSION],
        |r| Ok(PendingNote { language:r.get(4)?, id: r.get(0)?, revision: r.get(1)?, text: r.get(2)?, words: r.get(3)? }),
    ).optional().map_err(|e| e.to_string())
}

pub fn commit_analysis(db: &mut Connection, note: &PendingNote, analysis: &Analysis) -> Result<bool, String> {
    let tx = db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(|e| e.to_string())?;
    let revision: Option<i64> = tx.query_row("SELECT body_revision FROM notes WHERE id=?1", [&note.id], |r| r.get(0)).optional().map_err(|e| e.to_string())?;
    if revision != Some(note.revision) { return Ok(false); }
    tx.execute("DELETE FROM note_lemmas WHERE note_id=?1", [&note.id]).map_err(|e| e.to_string())?;
    for lemma in &analysis.lemmas {
        if !matches!(lemma.pos.as_str(), "NOUN" | "PROPN" | "VERB" | "ADJ" | "ADV" | "INTJ") || lemma.count <= 0 || lemma.key.is_empty() || lemma.first_position < 0 || lemma.forms.iter().any(|f| f.count <= 0) {
            return Err("The local analyzer returned invalid vocabulary data".into());
        }
        tx.execute("INSERT INTO lemmas(lemma_key,lemma,language) VALUES(?1,?2,?3) ON CONFLICT(language,lemma_key) DO NOTHING", params![lemma.key,lemma.lemma,note.language]).map_err(|e| e.to_string())?;
        let id: i64 = tx.query_row("SELECT id FROM lemmas WHERE lemma_key=?1 AND language=?2", params![lemma.key,note.language], |r| r.get(0)).map_err(|e| e.to_string())?;
        tx.execute("INSERT INTO note_lemmas(note_id,lemma_id,pos,count,first_position,forms) VALUES(?1,?2,?3,?4,?5,?6)",
            params![note.id,id,lemma.pos,lemma.count,lemma.first_position,serde_json::to_string(&lemma.forms).map_err(|e| e.to_string())?]).map_err(|e| e.to_string())?;
    }
    tx.execute("INSERT INTO note_analysis(note_id,body_revision,pipeline_version,model_version) VALUES(?1,?2,?3,?4)
        ON CONFLICT(note_id) DO UPDATE SET body_revision=excluded.body_revision,pipeline_version=excluded.pipeline_version,model_version=excluded.model_version",
        params![note.id,note.revision,PIPELINE_VERSION,analysis.model_version]).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM lemmas WHERE NOT EXISTS (SELECT 1 FROM note_lemmas WHERE lemma_id=lemmas.id)", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())?;
    Ok(true)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NoteMetric {
    pub date_key: String,
    pub word_count: i64,
    pub unique_words: i64,
    pub writing_seconds: i64,
    pub analyzed: bool,
    pub new_lemmas: i64,
}
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VocabularyWord {
    pub id: i64,
    pub lemma: String,
    pub pos: String,
    pub count: i64,
    pub note_count: usize,
    pub first_seen: String,
    pub last_seen: String,
    pub forms: Vec<Form>,
}
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GrowthDay { pub date_key: String, pub new_lemmas: i64 }
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JournalStats {
    pub notes: Vec<NoteMetric>,
    pub total_lemmas: usize,
    pub total_occurrences: i64,
    pub pos_counts: BTreeMap<String, i64>,
    pub top_words: Vec<VocabularyWord>,
    pub recent_words: Vec<VocabularyWord>,
    pub category_words: BTreeMap<String,Vec<VocabularyWord>>,
    pub growth: Vec<GrowthDay>,
    pub pending_notes: usize,
    pub analysis: crate::nlp::WorkerStatus,
}
struct Accumulator {
    word: VocabularyWord,
    notes: BTreeSet<String>,
    pos: BTreeMap<String,i64>,
    forms: BTreeMap<(String,String),i64>,
}

pub fn snapshot(db: &mut Connection, status: crate::nlp::WorkerStatus) -> Result<JournalStats, String> {
    // All aggregate reads see the same SQLite snapshot, even during a save.
    let tx = db.transaction().map_err(|e| e.to_string())?;
    let mut notes = {
        let mut query = tx.prepare("SELECT n.date_key,n.word_count,n.unique_words,n.writing_seconds,
            coalesce(a.body_revision=n.body_revision AND a.pipeline_version=?1,0)
            FROM notes n LEFT JOIN note_analysis a ON a.note_id=n.id WHERE n.language=(SELECT language FROM app_settings WHERE id=1) ORDER BY n.date_key").map_err(|e| e.to_string())?;
        let rows = query.query_map([PIPELINE_VERSION], |r| Ok(NoteMetric {
            date_key: r.get(0)?, word_count:r.get(1)?, unique_words:r.get(2)?, writing_seconds:r.get(3)?, analyzed:r.get(4)?, new_lemmas:0,
        })).map_err(|e| e.to_string())?;
        rows.collect::<rusqlite::Result<Vec<_>>>().map_err(|e| e.to_string())?
    };
    let mut grouped: BTreeMap<i64, Accumulator> = BTreeMap::new();
    {
        let mut query = tx.prepare("SELECT l.id,l.lemma,u.pos,u.count,u.forms,n.id,n.date_key
            FROM note_lemmas u JOIN lemmas l ON l.id=u.lemma_id JOIN notes n ON n.id=u.note_id
            JOIN note_analysis a ON a.note_id=n.id
            WHERE n.language=(SELECT language FROM app_settings WHERE id=1) AND a.body_revision=n.body_revision AND a.pipeline_version=?1 ORDER BY l.id,n.date_key,u.pos").map_err(|e| e.to_string())?;
        let mut rows = query.query([PIPELINE_VERSION]).map_err(|e| e.to_string())?;
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let id: i64 = row.get(0).map_err(|e| e.to_string())?;
            let lemma: String = row.get(1).map_err(|e| e.to_string())?;
            let pos: String = row.get(2).map_err(|e| e.to_string())?;
            let count: i64 = row.get(3).map_err(|e| e.to_string())?;
            let forms: String = row.get(4).map_err(|e| e.to_string())?;
            let note_id: String = row.get(5).map_err(|e| e.to_string())?;
            let date: String = row.get(6).map_err(|e| e.to_string())?;
            let item = grouped.entry(id).or_insert_with(|| Accumulator {
                word: VocabularyWord { id,lemma,pos:pos.clone(),count:0,note_count:0,first_seen:date.clone(),last_seen:date.clone(),forms:vec![] },
                notes:BTreeSet::new(),pos:BTreeMap::new(),forms:BTreeMap::new(),
            });
            item.word.count += count;
            item.notes.insert(note_id);
            item.word.first_seen = item.word.first_seen.clone().min(date.clone());
            item.word.last_seen = item.word.last_seen.clone().max(date);
            *item.pos.entry(pos).or_default() += count;
            for form in serde_json::from_str::<Vec<Form>>(&forms).map_err(|e| e.to_string())? {
                *item.forms.entry((form.form,form.morph)).or_default() += form.count;
            }
        }
    }
    let mut words = Vec::new();
    let mut growth: BTreeMap<String,i64> = BTreeMap::new();
    let mut pos_counts: BTreeMap<String,i64> = ["Nouns","Verbs","Adjectives","Adverbs","Other"].into_iter().map(|s|(s.into(),0)).collect();
    for (_, mut item) in grouped {
        item.word.note_count = item.notes.len();
        item.word.pos = item.pos.into_iter().max_by(|a,b| a.1.cmp(&b.1).then_with(|| b.0.cmp(&a.0))).map(|v|v.0).unwrap_or_default();
        item.word.forms = item.forms.into_iter().map(|((form,morph),count)| Form {form,morph,count}).collect();
        let category = match item.word.pos.as_str() { "NOUN"=>"Nouns", "VERB"=>"Verbs", "ADJ"=>"Adjectives", "ADV"=>"Adverbs", _=>"Other" };
        *pos_counts.entry(category.into()).or_default() += 1;
        *growth.entry(item.word.first_seen.clone()).or_default() += 1;
        words.push(item.word);
    }
    for note in &mut notes { note.new_lemmas = *growth.get(&note.date_key).unwrap_or(&0); }
    let pending_notes = notes.iter().filter(|n| !n.analyzed).count();
    let total_lemmas = words.len();
    let total_occurrences = words.iter().map(|w| w.count).sum();
    words.sort_by(|a,b| b.count.cmp(&a.count).then_with(|| a.lemma.cmp(&b.lemma)));
    let top_words = words.iter().take(10).cloned().collect();
    // Build category rankings before truncating the overall list.
    let mut category_words: BTreeMap<String,Vec<VocabularyWord>> = ["Nouns","Verbs","Adjectives","Adverbs","Other"].into_iter().map(|s|(s.into(),vec![])).collect();
    for word in &words {
        let category = match word.pos.as_str() { "NOUN"=>"Nouns", "VERB"=>"Verbs", "ADJ"=>"Adjectives", "ADV"=>"Adverbs", _=>"Other" };
        let ranking=category_words.get_mut(category).unwrap();
        if ranking.len()<10 {ranking.push(word.clone());}
    }
    words.sort_by(|a,b| b.first_seen.cmp(&a.first_seen).then_with(|| b.id.cmp(&a.id)));
    let recent_words = words.into_iter().take(5).collect();
    Ok(JournalStats { notes,total_lemmas,total_occurrences,pos_counts,top_words,recent_words,category_words,
        growth:growth.into_iter().map(|(date_key,new_lemmas)|GrowthDay{date_key,new_lemmas}).collect(), pending_notes,analysis:status })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{storage, nlp::WorkerStatus};
    fn memory() -> Connection { let mut db=Connection::open_in_memory().unwrap(); storage::migrate(&mut db).unwrap(); db }
    fn draft(day: &str, text: &str) -> storage::Draft {
        storage::Draft { ai_decisions:vec![], language:"de".into(), date_key: day.into(), title: None, document: serde_json::json!({"type":"doc"}), plain_text:text.into(), tags:vec![], writing_seconds:0 }
    }
    fn result(count: i64) -> Analysis {
        Analysis { model_version:"test".into(), lemmas: vec![AnalyzedLemma {
            key:"gehen".into(),lemma:"gehen".into(),pos:"VERB".into(),count,first_position:0,
            forms:vec![Form {form:"ging".into(),morph:"Tense=Past".into(),count}],
        }] }
    }
    #[test]
    fn category_rankings_include_words_outside_global_top_ten() {
        let mut db=memory();storage::save(&mut db,&draft("2026-10-05","Test words")).unwrap();
        let pending=next_pending(&db).unwrap().unwrap();
        let mut analysis=result(1);analysis.lemmas.clear();
        for i in 0..12 {
            analysis.lemmas.push(AnalyzedLemma{key:format!("verb{i:02}"),lemma:format!("verb{i:02}"),pos:"VERB".into(),count:20-i,first_position:i,forms:vec![]});
        }
        for (key,pos) in [("Haus","NOUN"),("gut","ADJ"),("gern","ADV"),("Berlin","PROPN")] {
            analysis.lemmas.push(AnalyzedLemma{key:key.into(),lemma:key.into(),pos:pos.into(),count:1,first_position:0,forms:vec![]});
        }
        commit_analysis(&mut db,&pending,&analysis).unwrap();
        let stats=snapshot(&mut db,WorkerStatus::default()).unwrap();
        assert_eq!(stats.top_words.len(),10);assert!(stats.top_words.iter().all(|w|w.pos=="VERB"));
        assert_eq!(stats.category_words["Verbs"].len(),10);assert_eq!(stats.pos_counts["Verbs"],12);
        assert_eq!(stats.category_words["Verbs"][0].count,20);assert_eq!(stats.category_words["Verbs"][9].count,11);
        assert_eq!(stats.category_words["Nouns"][0].lemma,"Haus");assert_eq!(stats.category_words["Other"][0].lemma,"Berlin");
        assert_eq!(stats.category_words["Adjectives"][0].lemma,"gut");assert_eq!(stats.category_words["Adverbs"][0].lemma,"gern");
        db.execute("UPDATE app_settings SET language='en'",[]).unwrap();
        assert!(snapshot(&mut db,WorkerStatus::default()).unwrap().category_words.values().all(|words|words.is_empty()));
    }
    #[test]
    fn merges_notes_and_reanalysis_does_not_inflate_counts() {
        let mut db=memory();
        storage::save(&mut db,&draft("2026-09-15","ging ging")).unwrap();
        let pending=next_pending(&db).unwrap().unwrap();
        commit_analysis(&mut db,&pending,&result(2)).unwrap();
        commit_analysis(&mut db,&pending,&result(2)).unwrap();
        storage::save(&mut db,&draft("2026-09-16","geht")).unwrap();
        let pending=next_pending(&db).unwrap().unwrap();
        commit_analysis(&mut db,&pending,&result(1)).unwrap();
        let stats=snapshot(&mut db,WorkerStatus::default()).unwrap();
        assert_eq!(stats.total_lemmas,1); assert_eq!(stats.total_occurrences,3);
        assert_eq!(stats.top_words[0].note_count,2); assert_eq!(stats.pos_counts["Verbs"],1);
        assert_eq!(stats.notes[0].new_lemmas,1); assert_eq!(stats.notes[1].new_lemmas,0);
        storage::save(&mut db,&draft("2026-09-15","")).unwrap();
        let stats=snapshot(&mut db,WorkerStatus::default()).unwrap();
        assert_eq!(stats.top_words[0].first_seen,"2026-09-16"); assert_eq!(stats.total_occurrences,1);
        storage::save(&mut db,&draft("2026-09-16","")).unwrap();
        assert_eq!(snapshot(&mut db,WorkerStatus::default()).unwrap().total_lemmas,0);
    }
    #[test]
    fn stale_analysis_cannot_overwrite_newer_body_and_metadata_does_not_invalidate() {
        let mut db=memory(); let mut data=draft("2026-09-16","ging");
        storage::save(&mut db,&data).unwrap(); let stale=next_pending(&db).unwrap().unwrap();
        data.plain_text="geht".into(); storage::save(&mut db,&data).unwrap();
        assert!(!commit_analysis(&mut db,&stale,&result(9)).unwrap());
        let pending=next_pending(&db).unwrap().unwrap(); commit_analysis(&mut db,&pending,&result(1)).unwrap();
        data.title=Some("Renamed".into()); data.writing_seconds=30; storage::save(&mut db,&data).unwrap();
        assert!(next_pending(&db).unwrap().is_none());
        data.writing_seconds=2; assert_eq!(storage::save(&mut db,&data).unwrap().writing_seconds,30);
        assert_eq!(snapshot(&mut db,WorkerStatus::default()).unwrap().total_occurrences,1);
    }
    #[test]
    fn failed_analysis_is_atomic_and_retryable() {
        let mut db=memory(); storage::save(&mut db,&draft("2026-09-16","ging")).unwrap();
        let pending=next_pending(&db).unwrap().unwrap();
        let mut invalid=result(1); invalid.lemmas[0].pos="DET".into();
        assert!(commit_analysis(&mut db,&pending,&invalid).is_err());
        assert!(next_pending(&db).unwrap().is_some());
        let stats=snapshot(&mut db,WorkerStatus::default()).unwrap();
        assert_eq!(stats.total_lemmas,0); assert_eq!(stats.notes[0].unique_words,1);
        commit_analysis(&mut db,&pending,&result(1)).unwrap();
        assert!(next_pending(&db).unwrap().is_none());
    }
}
