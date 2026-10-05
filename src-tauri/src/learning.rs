use crate::{settings,storage};
use rusqlite::{params,Connection,OptionalExtension,TransactionBehavior};
use serde::{Deserialize,Serialize};

#[derive(Clone,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct CardDraft {
    pub language:String, pub word:String, pub definition:String, pub example:String,
    pub answer:String, pub date_key:String, pub source_kind:String,
}
#[derive(Serialize,Deserialize)]
#[serde(rename_all="camelCase")]
pub struct Card {
    pub id:String,pub language:String,pub word:String,pub definition:String,pub example:String,
    pub answer:String,pub source_date:String,pub source_kind:String,pub due_at:i64,
    pub interval_seconds:i64,pub reviews:i64,
}
#[derive(Serialize)]
pub struct Added { pub card:Card,pub created:bool }
const COLUMNS:&str="id,language,word,definition,example,answer,source_date,source_kind,due_at,interval_seconds,reviews";
fn error(e:impl std::fmt::Display)->String {e.to_string()}
fn row(r:&rusqlite::Row<'_>)->rusqlite::Result<Card> {
    Ok(Card{id:r.get(0)?,language:r.get(1)?,word:r.get(2)?,definition:r.get(3)?,example:r.get(4)?,answer:r.get(5)?,source_date:r.get(6)?,source_kind:r.get(7)?,due_at:r.get(8)?,interval_seconds:r.get(9)?,reviews:r.get(10)?})
}
fn validate(d:&CardDraft)->Result<(),String> {
    settings::validate(&d.language)?;storage::validate_date(&d.date_key)?;
    for (value,max) in [(&d.word,240),(&d.definition,4000),(&d.example,6000),(&d.answer,240)] {
        if value.trim().is_empty() || value.len()>max {return Err("Fill in the word, definition, example and answer within their length limits".into());}
    }
    if !d.example.to_lowercase().contains(&d.answer.trim().to_lowercase()) {return Err("The answer must appear in the example".into());}
    if !matches!(d.source_kind.as_str(),"note"|"suggestion") {return Err("Invalid learning source".into());}
    Ok(())
}
pub fn add(db:&mut Connection,d:CardDraft)->Result<Added,String> {
    validate(&d)?;
    let tx=db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
    let note_id:String=tx.query_row("SELECT id FROM notes WHERE date_key=?1 AND language=?2",params![d.date_key,d.language],|r|r.get(0)).map_err(|_|"Save the source note before adding a learning card")?;
    let word=d.word.trim();let key=word.to_lowercase();
    let created=tx.execute("INSERT INTO learning_cards(language,word,word_key,definition,example,answer,source_date,source_kind,note_id) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(language,word_key) DO NOTHING",
        params![d.language,word,key,d.definition.trim(),d.example,d.answer.trim(),d.date_key,d.source_kind,note_id]).map_err(error)?==1;
    let card=tx.query_row(&format!("SELECT {COLUMNS} FROM learning_cards WHERE language=?1 AND word_key=?2"),params![d.language,key],row).map_err(error)?;
    tx.commit().map_err(error)?;Ok(Added{card,created})
}
fn list(db:&Connection,language:&str)->Result<Vec<Card>,String> {
    settings::validate(language)?;
    let mut query=db.prepare(&format!("SELECT {COLUMNS} FROM learning_cards WHERE language=?1 ORDER BY due_at,created_at,id")).map_err(error)?;
    let cards=query.query_map([language],row).map_err(error)?.collect::<rusqlite::Result<Vec<_>>>().map_err(error)?;Ok(cards)
}
fn interval(previous:i64,rating:&str)->Result<i64,String> {
    let day=86400;
    Ok(match rating {
        "again"=>60,
        "hard"=>(previous.saturating_mul(12)/10).max(day/4),
        "good"=>previous.saturating_mul(2).max(day),
        "easy"=>previous.saturating_mul(3).max(4*day),
        _=>return Err("Choose Again, Hard, Good or Easy".into()),
    }.min(365*day))
}
fn review(db:&mut Connection,id:&str,rating:&str,expected_reviews:i64,review_id:&str,now:i64)->Result<Card,String> {
    let tx=db.transaction_with_behavior(TransactionBehavior::Immediate).map_err(error)?;
    let card=tx.query_row(&format!("SELECT {COLUMNS} FROM learning_cards WHERE id=?1"),[id],row).map_err(error)?;
    let prior:Option<(String,String)>=tx.query_row("SELECT card_id,rating FROM learning_reviews WHERE id=?1",[review_id],|r|Ok((r.get(0)?,r.get(1)?))).optional().map_err(error)?;
    if let Some((old_id,old_rating))=prior {
        if old_id!=id || old_rating!=rating {return Err("Review ID conflict".into());}
        return Ok(card);
    }
    if card.reviews!=expected_reviews {return Err("This card was already reviewed. Reload the learning set.".into());}
    if card.due_at>now {return Err("This card is not due yet".into());}
    if review_id.is_empty() || review_id.len()>100 {return Err("Invalid review ID".into());}
    let next=interval(card.interval_seconds,rating)?;
    tx.execute("INSERT INTO learning_reviews(id,card_id,rating,reviewed_at,previous_interval,next_interval,review_number) VALUES(?1,?2,?3,?4,?5,?6,?7)",params![review_id,id,rating,now,card.interval_seconds,next,card.reviews+1]).map_err(error)?;
    tx.execute("UPDATE learning_cards SET due_at=?1,interval_seconds=?2,reviews=reviews+1 WHERE id=?3",params![now+next,next,id]).map_err(error)?;
    let result=tx.query_row(&format!("SELECT {COLUMNS} FROM learning_cards WHERE id=?1"),[id],row).map_err(error)?;
    tx.commit().map_err(error)?;Ok(result)
}
#[tauri::command]
pub async fn learning_add(draft:CardDraft)->Result<Added,String> {
    tauri::async_runtime::spawn_blocking(move||add(&mut storage::open_database()?,draft)).await.map_err(error)?
}
#[tauri::command]
pub async fn learning_list(language:String)->Result<Vec<Card>,String> {
    tauri::async_runtime::spawn_blocking(move||list(&storage::open_database()?,&language)).await.map_err(error)?
}
#[tauri::command]
pub async fn learning_review(card_id:String,rating:String,expected_reviews:i64,review_id:String)->Result<Card,String> {
    tauri::async_runtime::spawn_blocking(move||{
        let mut db=storage::open_database()?;
        let now:i64=db.query_row("SELECT unixepoch()",[],|r|r.get(0)).map_err(error)?;
        review(&mut db,&card_id,&rating,expected_reviews,&review_id,now)
    }).await.map_err(error)?
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn recall_ratings_have_distinct_bounded_intervals() {
        assert_eq!(interval(0,"again").unwrap(),60);
        assert_eq!(interval(0,"hard").unwrap(),21600);
        assert_eq!(interval(0,"good").unwrap(),86400);
        assert_eq!(interval(0,"easy").unwrap(),345600);
        assert_eq!(interval(i64::MAX,"easy").unwrap(),365*86400);
        assert!(interval(0,"unknown").is_err());
    }
    fn setup()->(Connection,CardDraft) {
        let mut db=Connection::open_in_memory().unwrap();storage::migrate(&mut db).unwrap();
        db.execute("INSERT INTO notes(date_key,language,document,plain_text,tags) VALUES('2026-10-01','de','{\"type\":\"doc\"}','Ich freue mich.','[]')",[]).unwrap();
        let d=CardDraft{language:"de".into(),word:"sich freuen".into(),definition:"Freude empfinden".into(),example:"Ich freue mich.".into(),answer:"freue".into(),date_key:"2026-10-01".into(),source_kind:"note".into()};(db,d)
    }
    #[test] fn cards_survive_note_edits_and_duplicates_keep_schedule() {
        let (mut db,d)=setup();let first=add(&mut db,d.clone()).unwrap();assert!(first.created);
        let reviewed=review(&mut db,&first.card.id,"good",0,"r1",first.card.due_at).unwrap();
        db.execute("UPDATE notes SET plain_text='Changed'",[]).unwrap();
        let duplicate=add(&mut db,d).unwrap();assert!(!duplicate.created);assert_eq!(duplicate.card.reviews,1);assert_eq!(duplicate.card.due_at,reviewed.due_at);assert_eq!(duplicate.card.example,"Ich freue mich.");assert!(list(&db,"en").unwrap().is_empty());
    }
    #[test] fn ratings_are_atomic_idempotent_and_reject_stale_or_early_reviews() {
        let (mut db,d)=setup();let c=add(&mut db,d).unwrap().card;
        db.execute_batch("CREATE TRIGGER deny_review BEFORE UPDATE ON learning_cards BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
        assert!(review(&mut db,&c.id,"again",0,"r1",c.due_at).is_err());
        assert_eq!(db.query_row("SELECT count(*) FROM learning_reviews",[],|r|r.get::<_,i64>(0)).unwrap(),0);
        db.execute_batch("DROP TRIGGER deny_review").unwrap();
        let next=review(&mut db,&c.id,"again",0,"r1",c.due_at).unwrap();assert_eq!(next.due_at,c.due_at+60);
        assert_eq!(review(&mut db,&c.id,"again",0,"r1",c.due_at).unwrap().reviews,1);
        assert!(review(&mut db,&c.id,"good",0,"r2",next.due_at).is_err());
        assert!(review(&mut db,&c.id,"good",1,"r2",next.due_at-1).is_err());
        assert_eq!(review(&mut db,&c.id,"easy",1,"r2",next.due_at).unwrap().interval_seconds,4*86400);
    }
}
