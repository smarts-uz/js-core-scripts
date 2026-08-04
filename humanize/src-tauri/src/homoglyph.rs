// Rust port of classes/Homoglyph.js's PERFECT_STEALTH map and Word automation
// path — no Node.js/winax involved; drives Word.Application directly via
// com_automation's late-bound IDispatch helper.

use crate::com_automation::{
    create_com_object, get_property, invoke_method, put_property, variant_from_bool,
    variant_from_i32, variant_from_str,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use windows::core::Result;

/// One step of replace progress, emitted as a Tauri event ("homoglyph-progress")
/// while `apply_word` runs — drives the frontend's progress bar + running diff.
#[derive(Clone, Serialize)]
pub struct ReplaceProgress {
    pub index: usize,
    pub total: usize,
    pub latin: String,
    pub cyrillic: String,
    pub found: bool,
}

/// The shared Latin→Cyrillic homoglyph map — identical to
/// classes/Homoglyph.js's PERFECT_STEALTH, kept as the single source of truth
/// for BOTH the Node.js path (still used by the rest of this project's CLI
/// tools) and this Tauri app's own Rust path.
pub const PERFECT_STEALTH: &[(char, char)] = &[
    ('A', 'А'),
    ('a', 'а'),
    ('C', 'С'),
    ('c', 'с'),
    ('E', 'Е'),
    ('e', 'е'),
    ('H', 'Н'),
    ('I', 'І'),
    ('i', 'і'),
    ('J', 'Ј'),
    ('K', 'К'),
    ('M', 'М'),
    ('O', 'О'),
    ('o', 'о'),
    ('P', 'Р'),
    ('p', 'р'),
    ('S', 'Ѕ'),
    ('T', 'Т'),
    ('X', 'Х'),
    ('x', 'х'),
    ('y', 'у'),
];

/// Filters PERFECT_STEALTH down to the requested characters; `None` = every
/// mapped character (mirrors Homoglyph._buildMap(null)).
pub fn build_map(chars: Option<&str>) -> Vec<(char, char)> {
    match chars {
        None => PERFECT_STEALTH.to_vec(),
        Some(requested) => {
            let requested: std::collections::HashSet<char> = requested.chars().collect();
            PERFECT_STEALTH
                .iter()
                .filter(|(latin, _)| requested.contains(latin))
                .cloned()
                .collect()
        }
    }
}

/// Computes the "<basename> L<count>.ext" output path beside the source,
/// auto-incrementing on collision — matching Homoglyph._resolveOutputPath's
/// exact filename convention.
pub fn resolve_output_path(source: &Path, used_letters_count: usize) -> PathBuf {
    let dir = source.parent().unwrap_or_else(|| Path::new("."));
    let stem = source.file_stem().and_then(|s| s.to_str()).unwrap_or("output");
    let ext = source.extension().and_then(|s| s.to_str()).unwrap_or("");

    let base = format!("{stem} L{used_letters_count}");
    let mut candidate = dir.join(format!("{base}.{ext}"));
    let mut counter = 1;
    while candidate.exists() {
        candidate = dir.join(format!("{base} {counter}.{ext}"));
        counter += 1;
    }
    candidate
}

/// Replaces Latin characters in a Word document with Cyrillic homoglyphs, via
/// real Word.Application COM automation. Copies the source to the resolved
/// output path first (the source is never opened/modified directly), opens
/// the copy, runs one Find/Replace per mapped pair with MatchCase, saves, and
/// closes — mirroring classes/Homoglyph.js's `_applyWord` exactly.
///
/// `on_progress` fires once per character pair, right after that pair's
/// Find.Execute call returns — lets the caller (the Tauri command) emit a
/// live progress/diff event to the frontend while the COM loop is running.
pub fn apply_word(
    source: &Path,
    chars: Option<&str>,
    mut on_progress: impl FnMut(ReplaceProgress),
) -> Result<PathBuf> {
    let map = build_map(chars);
    let output_path = resolve_output_path(source, map.len());

    std::fs::copy(source, &output_path)
        .map_err(|e| windows::core::Error::new(windows::core::HRESULT(-1), format!("copy failed: {e}")))?;

    unsafe {
        windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_APARTMENTTHREADED,
        )
        .ok()?;
    }

    let word_app = create_com_object("Word.Application")?;
    put_property(&word_app, "Visible", variant_from_bool(false))?;
    put_property(&word_app, "DisplayAlerts", variant_from_i32(0))?;

    let result = (|| -> Result<()> {
        let output_str = output_path.to_string_lossy().to_string();
        let documents = get_property(&word_app, "Documents")?;
        let documents_dispatch = variant_to_dispatch(&documents.0)?;
        let mut open_args = [variant_from_str(&output_str)];
        let doc_variant = invoke_method(&documents_dispatch, "Open", &mut open_args)?;
        let doc = variant_to_dispatch(&doc_variant.0)?;

        let content = get_property(&doc, "Content")?;
        let content_dispatch = variant_to_dispatch(&content.0)?;
        let find_variant = get_property(&content_dispatch, "Find")?;
        let find = variant_to_dispatch(&find_variant.0)?;

        let total = map.len();
        for (index, (latin, cyrillic)) in map.iter().enumerate() {
            invoke_method(&find, "ClearFormatting", &mut [])?;
            let replacement = get_property(&find, "Replacement")?;
            let replacement_dispatch = variant_to_dispatch(&replacement.0)?;
            invoke_method(&replacement_dispatch, "ClearFormatting", &mut [])?;

            put_property(&find, "Text", variant_from_str(&latin.to_string()))?;
            put_property(&replacement_dispatch, "Text", variant_from_str(&cyrillic.to_string()))?;

            // Execute(FindText, MatchCase, MatchWholeWord, MatchWildcards,
            //         MatchSoundsLike, MatchAllWordForms, Forward, Wrap,
            //         Format, ReplaceWith, Replace)
            let mut execute_args = [
                variant_from_str(&latin.to_string()),
                variant_from_bool(true), // MatchCase
                variant_from_bool(false),
                variant_from_bool(false),
                variant_from_bool(false),
                variant_from_bool(false),
                variant_from_bool(true), // Forward
                variant_from_i32(1),     // wdFindContinue
                variant_from_bool(false),
                variant_from_str(&cyrillic.to_string()),
                variant_from_i32(2), // wdReplaceAll
            ];
            let found_variant = invoke_method(&find, "Execute", &mut execute_args)?;
            let found = variant_to_bool(&found_variant.0);

            on_progress(ReplaceProgress {
                index: index + 1,
                total,
                latin: latin.to_string(),
                cyrillic: cyrillic.to_string(),
                found,
            });
        }

        invoke_method(&doc, "Save", &mut [])?;
        let mut close_args = [variant_from_bool(false)];
        invoke_method(&doc, "Close", &mut close_args)?;
        Ok(())
    })();

    // Always Quit + release, matching classes/Homoglyph.js's finally block.
    let _ = invoke_method(&word_app, "Quit", &mut []);
    unsafe {
        windows::Win32::System::Com::CoUninitialize();
    }

    result?;
    Ok(output_path)
}

/// Reads a VT_BOOL VARIANT (Find.Execute's return value: -1/true = a match
/// was found and replaced, 0/false = no match) as a plain Rust bool.
fn variant_to_bool(variant: &windows::Win32::System::Variant::VARIANT) -> bool {
    unsafe {
        let v00 = &variant.Anonymous.Anonymous;
        if v00.vt != windows::Win32::System::Variant::VT_BOOL {
            return false;
        }
        v00.Anonymous.boolVal.0 != 0
    }
}

fn variant_to_dispatch(variant: &windows::Win32::System::Variant::VARIANT) -> Result<windows::Win32::System::Com::IDispatch> {
    unsafe {
        let v00 = &variant.Anonymous.Anonymous;
        if v00.vt != windows::Win32::System::Variant::VT_DISPATCH {
            return Err(windows::core::Error::new(
                windows::core::HRESULT(-1),
                "expected VT_DISPATCH".to_string(),
            ));
        }
        v00.Anonymous
            .pdispVal
            .as_ref()
            .cloned()
            .ok_or_else(|| windows::core::Error::new(windows::core::HRESULT(-1), "null IDispatch".to_string()))
    }
}
