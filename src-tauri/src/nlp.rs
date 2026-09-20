use crate::{storage, vocabulary};
use serde::Serialize;
use std::{io::{BufRead, BufReader, Write}, process::{Child, ChildStdin, Command, Stdio}, sync::{mpsc, Arc, Mutex}, time::Duration};

pub const PYTHON_PATH: &str = r"D:\Dev\deutsch-journal-nlp\Scripts\python.exe";
#[derive(Debug, Default, Clone, Serialize)]
pub struct WorkerStatus { pub running: bool, pub error: Option<String> }

pub struct NlpService { sender: mpsc::SyncSender<()>, status: Arc<Mutex<WorkerStatus>> }
impl NlpService {
    pub fn start() -> Self {
        let (sender, receiver) = mpsc::sync_channel(1);
        let status = Arc::new(Mutex::new(WorkerStatus::default()));
        let state = status.clone();
        std::thread::spawn(move || {
            let mut python: Option<PythonWorker> = None;
            while receiver.recv().is_ok() {
                *state.lock().unwrap() = WorkerStatus { running: true, error: None };
                let result = (|| -> Result<(),String> {
                    loop {
                        let pending = { let db = storage::open_database()?; vocabulary::next_pending(&db)? };
                        let Some(note) = pending else { break };
                        let analysis = if note.words == 0 {
                            vocabulary::Analysis { lemmas: vec![], model_version: "No text to analyze".into() }
                        } else {
                            if python.is_none() { python = Some(PythonWorker::start()?); }
                            python.as_mut().unwrap().analyze(&note.text, &note.language)?
                        };
                        let mut db = storage::open_database()?;
                        vocabulary::commit_analysis(&mut db, &note, &analysis)?;
                    }
                    Ok(())
                })();
                let error = result.err();
                if error.is_some() { python = None; }
                *state.lock().unwrap() = WorkerStatus { running:false,error };
            }
        });
        let service = Self { sender, status };
        service.request();
        service
    }
    pub fn request(&self) {
        // Expose a retry immediately, before the background thread is scheduled.
        // Otherwise the frontend could observe the previous error and stop polling.
        *self.status.lock().unwrap() = WorkerStatus { running: true, error: None };
        let _ = self.sender.try_send(());
    }
    pub fn status(&self) -> WorkerStatus { self.status.lock().unwrap().clone() }
}

struct PythonWorker { child: Child, input: ChildStdin, output: mpsc::Receiver<Result<String,String>> }
impl PythonWorker {
    fn start() -> Result<Self,String> {
        let mut command = Command::new(PYTHON_PATH);
        command.args(["-u", "-c", include_str!("../../nlp/analyze.py")])
            .env("PYTHONDONTWRITEBYTECODE", "1").env("PYTHONUTF8", "1")
            .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)] {
            use std::os::windows::process::CommandExt;
            command.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }
        let mut child = command.spawn().map_err(|e| format!("Local language analysis is unavailable at {PYTHON_PATH}: {e}. Run scripts/setup-nlp.ps1, then retry analysis. Your notes are still saved."))?;
        let input = child.stdin.take().ok_or("Could not open analyzer input")?;
        let output = child.stdout.take().ok_or("Could not open analyzer output")?;
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                if sender.send(line.map_err(|e| e.to_string())).is_err() { break; }
            }
        });
        Ok(Self { child,input,output:receiver })
    }
    fn analyze(&mut self, text: &str, language: &str) -> Result<vocabulary::Analysis,String> {
        let request = serde_json::json!({"text":text,"language":language}).to_string();
        writeln!(self.input, "{request}").and_then(|_| self.input.flush()).map_err(|e| format!("Could not send text to the local analyzer: {e}"))?;
        let line = self.output.recv_timeout(Duration::from_secs(60)).map_err(|e| format!("The local analyzer did not respond within 60 seconds: {e}. Retry analysis; notes remain saved."))??;
        let value: serde_json::Value = serde_json::from_str(&line).map_err(|e| format!("Invalid analyzer response: {e}"))?;
        if let Some(error) = value.get("error").and_then(|v|v.as_str()) { return Err(error.into()); }
        serde_json::from_value(value).map_err(|e| format!("Invalid vocabulary data: {e}"))
    }
}
impl Drop for PythonWorker {
    fn drop(&mut self) { let _ = self.child.kill(); let _ = self.child.wait(); }
}
