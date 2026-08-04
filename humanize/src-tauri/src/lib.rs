pub mod com_automation;
pub mod homoglyph;

use std::path::PathBuf;

/// The 21 PERFECT_STEALTH characters, in order — the frontend renders one
/// checkbox per entry, defaulting to all-checked.
#[tauri::command]
fn list_homoglyph_chars() -> Vec<String> {
  homoglyph::PERFECT_STEALTH.iter().map(|(latin, _)| latin.to_string()).collect()
}

/// Runs the homoglyph replace on a real Word document, via direct Rust COM
/// automation (no Node.js/sidecar involved). `chars` is the user's checked
/// subset from the frontend modal, joined into one string (e.g. "ACE").
#[tauri::command]
fn run_homoglyph(file_path: String, chars: String) -> Result<String, String> {
  let path = PathBuf::from(&file_path);
  let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase();

  let chars_opt = if chars.is_empty() { None } else { Some(chars.as_str()) };

  match ext.as_str() {
    "docx" => homoglyph::apply_word(&path, chars_opt)
      .map(|p| p.to_string_lossy().to_string())
      .map_err(|e| e.to_string()),
    other => Err(format!("Unsupported file extension: .{other} (only .docx is wired so far)")),
  }
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
    .invoke_handler(tauri::generate_handler![list_homoglyph_chars, run_homoglyph])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
