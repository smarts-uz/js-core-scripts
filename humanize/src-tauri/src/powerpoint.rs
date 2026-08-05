// Rust port of classes/Homoglyph.js's _applyPowerPoint — no Node.js/winax
// involved; drives PowerPoint.Application directly via com_automation's
// late-bound IDispatch helper.

use crate::com_automation::{
    create_com_object, get_item, get_property, invoke_method, put_property, variant_from_i32,
    variant_from_str, variant_to_dispatch, variant_to_i32, variant_to_string,
};
use crate::homoglyph::{build_map, resolve_output_path, ReplaceProgress};
use std::path::{Path, PathBuf};
use windows::core::Result;

/// Replaces Latin characters in a PowerPoint presentation with Cyrillic
/// homoglyphs. Copies the source to the resolved output path first, opens
/// the copy, walks every slide/shape with a text frame, rewrites text
/// containing any mapped character, saves, and closes — mirroring
/// classes/Homoglyph.js's `_applyPowerPoint` exactly.
pub fn apply_powerpoint(
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

    let ppt_app = create_com_object("PowerPoint.Application")?;

    let total = map.len();
    let result = (|| -> Result<()> {
        let output_str = output_path.to_string_lossy().to_string();
        let presentations = get_property(&ppt_app, "Presentations")?;
        let presentations_dispatch = variant_to_dispatch(&presentations.0)?;
        // Open(FileName, ReadOnly, Untitled, WithWindow) — msoFalse = 0 for
        // WithWindow, matching classes/Homoglyph.js's _applyPowerPoint.
        let mut open_args = [
            variant_from_str(&output_str),
            variant_from_i32(0),
            variant_from_i32(0),
            variant_from_i32(0),
        ];
        let presentation_variant = invoke_method(&presentations_dispatch, "Open", &mut open_args)?;
        let presentation = variant_to_dispatch(&presentation_variant.0)?;

        let slides = get_property(&presentation, "Slides")?;
        let slides_dispatch = variant_to_dispatch(&slides.0)?;
        let slide_count = variant_to_i32(&get_property(&slides_dispatch, "Count")?.0)?;

        let mut pair_found = vec![false; map.len()];

        for si in 1..=slide_count {
            let slide_variant = get_item(&slides_dispatch, &mut [variant_from_i32(si)])?;
            let slide = variant_to_dispatch(&slide_variant.0)?;

            let shapes = get_property(&slide, "Shapes")?;
            let shapes_dispatch = variant_to_dispatch(&shapes.0)?;
            let shape_count = variant_to_i32(&get_property(&shapes_dispatch, "Count")?.0)?;

            for sh in 1..=shape_count {
                let shape_variant = get_item(&shapes_dispatch, &mut [variant_from_i32(sh)])?;
                let shape = variant_to_dispatch(&shape_variant.0)?;

                let has_text_frame_variant = match get_property(&shape, "HasTextFrame") {
                    Ok(v) => v,
                    Err(_) => continue,
                };
                if !crate::com_automation::variant_to_bool(&has_text_frame_variant.0) {
                    continue;
                }

                let text_frame_variant = get_property(&shape, "TextFrame")?;
                let text_frame = variant_to_dispatch(&text_frame_variant.0)?;

                let has_text_variant = get_property(&text_frame, "HasText")?;
                if !crate::com_automation::variant_to_bool(&has_text_variant.0) {
                    continue;
                }

                let text_range_variant = get_property(&text_frame, "TextRange")?;
                let text_range = variant_to_dispatch(&text_range_variant.0)?;

                let value_variant = get_property(&text_range, "Text")?;
                let value = match variant_to_string(&value_variant.0) {
                    Ok(s) if !s.is_empty() => s,
                    _ => continue,
                };

                let mut new_value = value.clone();
                for (idx, (latin, cyrillic)) in map.iter().enumerate() {
                    if new_value.contains(*latin) {
                        new_value = new_value.replace(*latin, &cyrillic.to_string());
                        pair_found[idx] = true;
                    }
                }

                if new_value != value {
                    put_property(&text_range, "Text", variant_from_str(&new_value))?;
                }
            }
        }

        for (idx, (latin, cyrillic)) in map.iter().enumerate() {
            on_progress(ReplaceProgress {
                index: idx + 1,
                total,
                latin: latin.to_string(),
                cyrillic: cyrillic.to_string(),
                found: pair_found[idx],
            });
        }

        invoke_method(&presentation, "Save", &mut [])?;
        invoke_method(&presentation, "Close", &mut [])?;
        Ok(())
    })();

    let _ = invoke_method(&ppt_app, "Quit", &mut []);
    unsafe {
        windows::Win32::System::Com::CoUninitialize();
    }

    result?;
    Ok(output_path)
}
