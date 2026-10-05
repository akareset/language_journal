mod settings;
mod ai;
mod storage;
mod nlp;
mod vocabulary;
mod learning;

#[tauri::command]
async fn journal_stats(service: tauri::State<'_, nlp::NlpService>) -> Result<vocabulary::JournalStats, String> {
    let status = service.status();
    tauri::async_runtime::spawn_blocking(move || {
        storage::open_database().and_then(|mut db| vocabulary::snapshot(&mut db, status))
    }).await.map_err(|e| format!("Statistics task failed: {e}"))?
}

#[tauri::command]
fn retry_analysis(service: tauri::State<'_, nlp::NlpService>) { service.request(); }

#[tauri::command]
async fn list_notes() -> Result<Vec<storage::NoteSummary>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::open_database().and_then(|db| storage::list_notes(&db))
    }).await.map_err(|e| format!("Storage task failed: {e}"))?
}

#[tauri::command]
async fn load_daily_note(date_key: String) -> Result<Option<storage::Note>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        storage::open_database().and_then(|db| storage::load(&db, &date_key))
    }).await.map_err(|e| format!("Storage task failed: {e}"))?
}

#[tauri::command]
async fn save_daily_note(draft: storage::Draft, service: tauri::State<'_, nlp::NlpService>) -> Result<storage::Note, String> {
    let note = tauri::async_runtime::spawn_blocking(move || {
        storage::open_database().and_then(|mut db| storage::save(&mut db, &draft))
    }).await.map_err(|e| format!("Storage task failed: {e}"))??;
    service.request();
    Ok(note)
}

#[tauri::command]
async fn load_settings() -> Result<settings::Settings,String> {
 tauri::async_runtime::spawn_blocking(|| storage::open_database().and_then(|db| settings::load(&db))).await.map_err(|e|e.to_string())?
}
#[tauri::command]
async fn save_settings(settings: settings::Settings, service: tauri::State<'_,nlp::NlpService>) -> Result<(),String> {
 tauri::async_runtime::spawn_blocking(move || storage::open_database().and_then(|db| crate::settings::save(&db,&settings))).await.map_err(|e|e.to_string())??; service.request(); Ok(())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(nlp::NlpService::start())
        .invoke_handler(tauri::generate_handler![load_daily_note, save_daily_note, list_notes, journal_stats, retry_analysis, load_settings, save_settings, ai::ai_preferences, ai::ai_save_preferences, ai::ai_set_key, ai::ai_add_api, ai::ai_analyze, ai::ai_dismiss, ai::ai_history, ai::ai_period_insight, ai::ai_period_insight_history, ai::ai_learning_definition, learning::learning_add, learning::learning_list, learning::learning_review])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
