pub mod auth;
pub mod com_automation;
pub mod fingerprint;
pub mod homoglyph;

use std::path::PathBuf;
use std::process::Command;
use tauri::{AppHandle, Emitter};

/// The 21 PERFECT_STEALTH characters, in order — the frontend renders one
/// checkbox per entry, defaulting to all-checked.
#[tauri::command]
fn list_homoglyph_chars() -> Vec<String> {
  homoglyph::PERFECT_STEALTH.iter().map(|(latin, _)| latin.to_string()).collect()
}

/// Runs the homoglyph replace on a real Word document, via direct Rust COM
/// automation (no Node.js/sidecar involved). `chars` is the user's checked
/// subset from the frontend modal, joined into one string (e.g. "ACE").
///
/// Runs on Tauri's async runtime via spawn_blocking (COM automation is
/// synchronous/blocking) so "homoglyph-progress" events reach the frontend
/// live, one per character pair, instead of all arriving after the command
/// itself already returned.
#[tauri::command]
async fn run_homoglyph(app: AppHandle, file_path: String, chars: String) -> Result<String, String> {
  let path = PathBuf::from(&file_path);
  let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase().to_string();
  let chars_opt = if chars.is_empty() { None } else { Some(chars.clone()) };

  tauri::async_runtime::spawn_blocking(move || match ext.as_str() {
    "docx" => homoglyph::apply_word(&path, chars_opt.as_deref(), |progress| {
      let _ = app.emit("homoglyph-progress", &progress);
    })
    .map(|p| p.to_string_lossy().to_string())
    .map_err(|e| e.to_string()),
    other => Err(format!("Unsupported file extension: .{other} (only .docx is wired so far)")),
  })
  .await
  .map_err(|e| format!("task join error: {e}"))?
}

/// Attempts a login against Supabase, gated by this machine's device
/// fingerprint (see fingerprint.rs / auth.rs). On success the session is
/// persisted to Windows Credential Manager; on failure, returns a
/// STRUCTURED error (auth::LoginError) — either InvalidCredentials (bad
/// password / network issue) or WrongDevice (correct password, but this
/// machine isn't the one the account is bound to, naming the bound
/// machine when known) — so the frontend can render a specific warning
/// card instead of a generic error string.
#[tauri::command]
async fn login(email: String, password: String) -> Result<(), auth::LoginError> {
  auth::login(&email, &password).await
}

/// True if a previously stored session exists on this machine — lets the
/// frontend skip the login screen on a repeat launch.
#[tauri::command]
fn has_stored_session() -> bool {
  auth::has_stored_session()
}

/// Clears the stored session (logout), forcing the login screen next launch.
#[tauri::command]
fn logout() -> Result<(), String> {
  auth::clear_session()
}

/// Opens Windows Explorer with the given file pre-selected/highlighted —
/// the standard "Open in Explorer" / "Show in Folder" action.
#[tauri::command]
fn reveal_in_explorer(file_path: String) -> Result<(), String> {
  Command::new("explorer.exe")
    .arg("/select,")
    .arg(&file_path)
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

/// Opens the given file with its registered default application (the same
/// effect as double-clicking it in Explorer) — via explorer.exe, which
/// resolves the shell file association without needing a separate crate.
#[tauri::command]
fn open_in_default_app(file_path: String) -> Result<(), String> {
  Command::new("explorer.exe")
    .arg(&file_path)
    .spawn()
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .plugin(tauri_plugin_dialog::init())
    .invoke_handler(tauri::generate_handler![
      login,
      has_stored_session,
      logout,
      list_homoglyph_chars,
      run_homoglyph,
      reveal_in_explorer,
      open_in_default_app
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
