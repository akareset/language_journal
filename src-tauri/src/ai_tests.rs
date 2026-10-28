use super::*;
#[test]
fn reset_is_atomic_note_scoped_and_preserves_text() {
    let mut db=rusqlite::Connection::open_in_memory().unwrap();storage::migrate(&mut db).unwrap();
    db.execute_batch("PRAGMA foreign_keys=ON;").unwrap();
    for (id,date,language) in [("current","2026-10-09","de"),("previous","2026-10-08","de"),("english","2026-10-09","en")] {
        db.execute("INSERT INTO notes(id,date_key,language,document,plain_text,tags) VALUES(?1,?2,?3,'{\"type\":\"doc\"}','Keep this text','[]')",params![id,date,language]).unwrap();
        db.execute("INSERT INTO ai_analyses(id,note_id,record) VALUES(?1,?1,'{}')",[id]).unwrap();
        db.execute("INSERT INTO ai_decisions(id,analysis_id,finding_id,action) VALUES(?1,?1,'f','accepted')",[id]).unwrap();
    }
    db.execute_batch("CREATE TRIGGER deny_reset BEFORE DELETE ON ai_analyses BEGIN SELECT RAISE(ABORT,'disk failure'); END;").unwrap();
    assert!(reset_note_analyses(&mut db,"2026-10-09","de").is_err());
    assert_eq!(db.query_row("SELECT count(*) FROM ai_decisions",[],|r|r.get::<_,i64>(0)).unwrap(),3);
    db.execute_batch("DROP TRIGGER deny_reset").unwrap();
    reset_note_analyses(&mut db,"2026-10-09","de").unwrap();
    reset_note_analyses(&mut db,"2026-10-09","de").unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM ai_analyses",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    assert_eq!(db.query_row("SELECT count(*) FROM ai_decisions",[],|r|r.get::<_,i64>(0)).unwrap(),2);
    assert_eq!(db.query_row("SELECT plain_text FROM notes WHERE id='current'",[],|r|r.get::<_,String>(0)).unwrap(),"Keep this text");
    assert!(reset_note_analyses(&mut db,"invalid","de").is_err());
}
fn finding() -> Value {json!({"ruleId":"grammar.article","category":"grammar","quote":"Ich sehe der Hund.","replacement":"Ich sehe den Hund.","occurrence":0,"explanation":"Akkusativ: den Hund.","meaningNote":""})}
#[test]
fn partial_validation_preserves_valid_feedback_and_counts_exclusions() {
    let mut invalid=finding();invalid["quote"]=json!("not in note");
    let (valid,excluded)=validate_response(&json!({"findings":[finding(),invalid,{"bad":true}]}).to_string(),"Ich sehe der Hund.",true).unwrap();
    assert_eq!(valid.len(),1);assert_eq!(excluded.len(),2);assert_eq!(excluded[0].reason,"The quoted text no longer matches the analyzed note.");assert_eq!(valid[0].start,0);assert_eq!(valid[0].end,18);
    assert!(validate_response("{\"findings\":[", "test",true).is_err());
    assert!(validate_response("{}", "test",true).is_err());
    assert!(validate_response("{\"findings\":null}", "test",true).is_err());
    let (valid,excluded)=validate_response(&json!({"findings":[{"bad":true}]}).to_string(),"test",true).unwrap();
    assert!(valid.is_empty());assert_eq!(excluded.len(),1);
}
#[test]
fn anchors_use_utf16_and_exact_occurrences() {
    let mut f=finding();f["occurrence"]=json!(1);
    let source="😀 Ich sehe der Hund. Ich sehe der Hund.";
    let (valid,excluded)=validate_response(&json!({"findings":[f]}).to_string(),source,true).unwrap();
    assert_eq!(excluded.len(),0);assert_eq!(valid[0].start,22);
}
#[test]
fn invented_rules_overlap_noops_and_disabled_style_are_excluded() {
    let mut invalid=finding();invalid["ruleId"]=json!("de.case.whatever");
    let mut noop=finding();noop["replacement"]=noop["quote"].clone();
    let mut style=finding();style["category"]=json!("naturalness");style["ruleId"]=json!("style.naturalness");
    let (valid,excluded)=validate_response(&json!({"findings":[invalid,noop,style,finding(),finding()]}).to_string(),"Ich sehe der Hund.",false).unwrap();
    assert_eq!(valid.len(),1);assert_eq!(excluded.len(),4);
}
#[test]
fn provider_refusal_or_truncation_is_failure_not_empty_feedback() {
    assert!(extract_response("openai",&json!({"status":"incomplete","output":[]})).is_err());
    assert!(extract_response("openai",&json!({"status":"completed","output":[{"content":[{"type":"refusal","refusal":"no"}]}]})).is_err());
    assert!(extract_response("gemini",&json!({"candidates":[{"finishReason":"MAX_TOKENS","content":{"parts":[{"text":"{}"}]}}]})).is_err());
    assert!(extract_response("gemini",&json!({"promptFeedback":{"blockReason":"SAFETY"}})).is_err());
    let output="{\"findings\":[]}";
    assert_eq!(extract_response("openai",&json!({"status":"completed","output":[{"content":[{"type":"output_text","text":output}]}]})).unwrap(),output);
    assert_eq!(extract_response("gemini",&json!({"candidates":[{"finishReason":"STOP","content":{"parts":[{"thought":true,"text":"private reasoning"},{"text":output}]}}]})).unwrap(),output);
}
#[test]
fn profiles_are_bounded_and_cannot_inject_endpoint_paths() {
    let mut config=Config::default();config.profiles.push(Profile{id:"profile-1".into(),name:"My Gemini".into(),provider:"gemini".into(),model:"gemini-2.5-flash".into()});config.selected_profile=Some("profile-1".into());config.explanation_language="uk".into();
    assert!(validate_config(&config).is_ok());config.profiles[0].model="../../attacker?key=secret".into();assert!(validate_config(&config).is_err());
    config.profiles[0].model="model".into();config.profiles.push(config.profiles[0].clone());assert!(validate_config(&config).is_err());
}
#[test]
fn old_ai_preferences_gain_an_independent_deep_prompt() {
    let old=json!({"profiles":[],"selectedProfile":null,"explanationLanguage":"de","naturalness":true,"prompt":"Tutor instructions"});
    let mut config:Config=serde_json::from_value(old).unwrap();
    assert_eq!(config.prompt,"Tutor instructions");
    assert_eq!(config.deep_prompt,DEFAULT_DEEP_PROMPT);
    config.deep_prompt="Custom period instructions".into();
    assert!(validate_config(&config).is_ok());
    let system=period_system(&config,"en");
    assert!(system.starts_with("Custom period instructions"));
    assert!(system.contains("Note language: en"));
    assert!(!system.contains(DEFAULT_DEEP_PROMPT.trim()));
    assert_eq!(serde_json::from_value::<Config>(serde_json::to_value(&config).unwrap()).unwrap().deep_prompt,config.deep_prompt);
}
#[test]
fn period_reports_require_complete_evidence_and_next_steps() {
    let valid=PeriodResponse{overview:"A useful overview.".into(),patterns:vec![PeriodPattern{title:"Articles".into(),explanation:"Case endings recur.".into(),evidence:"der Hund → den Hund".into(),next_step:"Write three examples.".into()}],topics:vec![PeriodTopic{topic:"Accusative".into(),reason:"It recurs.".into(),practice:"Practice article endings.".into()}]};
    assert!(validate_period_report(valid).is_ok());
    let incomplete=PeriodResponse{overview:"Overview".into(),patterns:vec![PeriodPattern{title:"Pattern".into(),explanation:"Reason".into(),evidence:"".into(),next_step:"Practice".into()}],topics:vec![]};
    assert!(validate_period_report(incomplete).is_err());
}
#[test]
fn acceptance_is_atomic_idempotent_and_preserved_after_undo() {
    let mut db=Connection::open_in_memory().unwrap();db.pragma_update(None,"foreign_keys",true).unwrap();storage::migrate(&mut db).unwrap();
    assert!(load_config(&db).unwrap().profiles.is_empty());
    let mut draft=storage::Draft{date_key:"2026-09-20".into(),language:"de".into(),title:None,document:json!({"type":"doc"}),plain_text:"Ich sehe der Hund.".into(),tags:vec![],writing_seconds:0,ai_decisions:vec![]};
    let note=storage::save(&mut db,&draft).unwrap();
    let (findings,excluded)=validate_response(&json!({"findings":[finding()]}).to_string(),&note.plain_text,true).unwrap();
    let a=Analysis{id:"a1".into(),note_id:note.id.clone(),date_key:note.date_key,language:note.language,document:note.document,plain_text:note.plain_text,profile:Profile{id:"p1".into(),name:"Test".into(),provider:"openai".into(),model:"test".into()},explanation_language:"uk".into(),prompt:"test prompt".into(),naturalness:true,schema_version:1,findings,excluded:excluded.len(),excluded_feedback:excluded,created_at:"now".into(),decisions:vec![]};
    db.execute("INSERT INTO ai_analyses(id,note_id,record) VALUES(?1,?2,?3)",params![a.id,a.note_id,serde_json::to_string(&a).unwrap()]).unwrap();
    let d=Decision{id:"d1".into(),analysis_id:"a1".into(),finding_id:"f0".into(),action:"accepted".into()};
    assert!(store_decision(&db,&d,None).is_err());
    draft.plain_text="Ich sehe den Hund.".into();draft.ai_decisions=vec![d.clone()];
    db.execute_batch("CREATE TRIGGER deny_decision BEFORE INSERT ON ai_decisions BEGIN SELECT RAISE(ABORT,'simulated disk error'); END;").unwrap();
    assert!(storage::save(&mut db,&draft).is_err());assert_eq!(storage::load(&db,&draft.date_key).unwrap().unwrap().plain_text,"Ich sehe der Hund.");
    db.execute_batch("DROP TRIGGER deny_decision;").unwrap();
    storage::save(&mut db,&draft).unwrap();storage::save(&mut db,&draft).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM ai_decisions",[],|r|r.get::<_,i64>(0)).unwrap(),1);
    // Undo changes the document; the acceptance action remains historical.
    draft.plain_text="Ich sehe der Hund.".into();storage::save(&mut db,&draft).unwrap();
    assert_eq!(db.query_row("SELECT count(*) FROM ai_analyses",[],|r|r.get::<_,i64>(0)).unwrap(),1);
    let mut dismissed=d.clone();dismissed.id="d2".into();dismissed.action="dismissed".into();store_decision(&db,&dismissed,None).unwrap();
    let mut invalid=d;invalid.finding_id="invented".into();assert!(store_decision(&db,&invalid,Some(&note.id)).is_err());
    assert_eq!(db.query_row("SELECT count(*) FROM ai_decisions",[],|r|r.get::<_,i64>(0)).unwrap(),2);
}
