// Rust port of classes/Homoglyph.js's _applyText — plain Markdown/text
// homoglyph replace. No COM automation at all: a straight read → string
// replace → write, since .md/.txt have no application object model to
// drive.

use crate::homoglyph::{build_map, resolve_output_path, ReplaceProgress};
use std::io;
use std::path::{Path, PathBuf};

/// Replaces Latin characters in a plain-text (.md/.txt) file with Cyrillic
/// homoglyphs. Reads the source directly (never modified), writes the
/// result to the resolved "<name> L<count>.ext" output path.
pub fn apply_text(
    source: &Path,
    chars: Option<&str>,
    mut on_progress: impl FnMut(ReplaceProgress),
) -> io::Result<PathBuf> {
    let map = build_map(chars);
    let output_path = resolve_output_path(source, map.len());

    let mut content = std::fs::read_to_string(source)?;
    let total = map.len();

    for (index, (latin, cyrillic)) in map.iter().enumerate() {
        let found = content.contains(*latin);
        if found {
            content = content.replace(*latin, &cyrillic.to_string());
        }
        on_progress(ReplaceProgress {
            index: index + 1,
            total,
            latin: latin.to_string(),
            cyrillic: cyrillic.to_string(),
            found,
        });
    }

    std::fs::write(&output_path, content)?;
    Ok(output_path)
}
