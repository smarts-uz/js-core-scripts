// Rust port of classes/Homoglyph.js's _applyExcel — no Node.js/winax
// involved; drives Excel.Application directly via com_automation's
// late-bound IDispatch helper. Same PERFECT_STEALTH map and on_progress
// event shape as homoglyph.rs (Word), reused here for a consistent
// frontend experience across every supported file type.

use crate::com_automation::{
    create_com_object, get_item, get_property, invoke_method, put_property, variant_from_bool,
    variant_from_i32, variant_from_str, variant_to_dispatch, variant_to_i32, variant_to_string,
};
use crate::homoglyph::{build_map, resolve_output_path, ReplaceProgress};
use std::path::{Path, PathBuf};
use windows::core::Result;

/// Replaces Latin characters in an Excel workbook with Cyrillic homoglyphs.
/// Copies the source to the resolved output path first, opens the copy,
/// walks every non-excluded sheet's UsedRange, rewrites string cells
/// containing any mapped character, saves, and closes — mirroring
/// classes/Homoglyph.js's `_applyExcel` exactly (excluded-sheet list is a
/// fixed parameter here rather than read from config.yml, since this app
/// has no equivalent config file of its own).
pub fn apply_excel(
    source: &Path,
    chars: Option<&str>,
    excluded_sheets: &[&str],
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

    let excel_app = create_com_object("Excel.Application")?;
    put_property(&excel_app, "Visible", variant_from_bool(false))?;
    put_property(&excel_app, "DisplayAlerts", variant_from_bool(false))?;
    put_property(&excel_app, "ScreenUpdating", variant_from_bool(false))?;
    put_property(&excel_app, "EnableEvents", variant_from_bool(false))?;

    let total = map.len();
    let result = (|| -> Result<()> {
        let output_str = output_path.to_string_lossy().to_string();
        let workbooks = get_property(&excel_app, "Workbooks")?;
        let workbooks_dispatch = variant_to_dispatch(&workbooks.0)?;
        // Open(Filename, UpdateLinks, ReadOnly)
        let mut open_args =
            [variant_from_str(&output_str), variant_from_i32(0), variant_from_bool(false)];
        let workbook_variant = invoke_method(&workbooks_dispatch, "Open", &mut open_args)?;
        let workbook = variant_to_dispatch(&workbook_variant.0)?;

        let sheets = get_property(&workbook, "Sheets")?;
        let sheets_dispatch = variant_to_dispatch(&sheets.0)?;
        let sheet_count_variant = get_property(&sheets_dispatch, "Count")?;
        let sheet_count = variant_to_i32(&sheet_count_variant.0)?;

        // Progress is reported per CHARACTER PAIR (matching Word/PowerPoint's
        // shape) rather than per sheet — each pair's "found" flag is true if
        // it was replaced in AT LEAST ONE sheet.
        let mut pair_found = vec![false; map.len()];

        for si in 1..=sheet_count {
            let sheet_variant = get_item(&sheets_dispatch, &mut [variant_from_i32(si)])?;
            let sheet = variant_to_dispatch(&sheet_variant.0)?;

            let name_variant = get_property(&sheet, "Name")?;
            let sheet_name = variant_to_string(&name_variant.0).unwrap_or_default();

            if excluded_sheets.contains(&sheet_name.as_str()) {
                continue;
            }

            let used_range_variant = match get_property(&sheet, "UsedRange") {
                Ok(v) => v,
                Err(_) => continue, // an empty sheet has no UsedRange
            };
            let used_range = variant_to_dispatch(&used_range_variant.0)?;

            let rows = get_property(&used_range, "Rows")?;
            let rows_dispatch = variant_to_dispatch(&rows.0)?;
            let row_count = variant_to_i32(&get_property(&rows_dispatch, "Count")?.0)?;

            let cols = get_property(&used_range, "Columns")?;
            let cols_dispatch = variant_to_dispatch(&cols.0)?;
            let col_count = variant_to_i32(&get_property(&cols_dispatch, "Count")?.0)?;

            for r in 1..=row_count {
                for c in 1..=col_count {
                    let cell_variant =
                        get_item(&used_range, &mut [variant_from_i32(r), variant_from_i32(c)])?;
                    let cell = variant_to_dispatch(&cell_variant.0)?;

                    let value_variant = match get_property(&cell, "Value") {
                        Ok(v) => v,
                        Err(_) => continue,
                    };
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
                        put_property(&cell, "Value", variant_from_str(&new_value))?;
                    }
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

        invoke_method(&workbook, "Save", &mut [])?;
        let mut close_args = [variant_from_bool(false)];
        invoke_method(&workbook, "Close", &mut close_args)?;
        Ok(())
    })();

    let _ = invoke_method(&excel_app, "Quit", &mut []);
    unsafe {
        windows::Win32::System::Com::CoUninitialize();
    }

    result?;
    Ok(output_path)
}
