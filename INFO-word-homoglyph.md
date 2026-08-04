# Word — Homoglyph Replace

Info on how Word documents get Latin→Cyrillic look-alike ("homoglyph") character
replacement in this project.

## Where it lives

- **Engine:** [classes/Homoglyph.js](classes/Homoglyph.js) — one centralized class shared
  by Word/Excel/PowerPoint/Markdown. There is **no** Word-specific homoglyph code inside
  [classes/Word.js](classes/Word.js) — `Word.js` does not touch homoglyphs at all.
- **Runners (CLI entry points):**
    - `node scripts/Homoglyph/word.mjs --file <path.docx> [--chars <subset>]`
    - `node scripts/Homoglyph/wordAsk.mjs --file <path.docx>` (interactive character picker)

## Public API

- **`Homoglyph.word(fileName, chars = null)`** — plain replace. `chars` is an optional
  string of characters to restrict the replacement to (e.g. `"AEO"`); omit/`null` = replace
  every mapped character.
- **`Homoglyph.wordAsk(fileName)`** — interactive variant. Shows an input box
  (`Dialogs.inputBox`) pre-filled with the persisted/default character set, lets the user
  edit it, filters out any character not in the map (adding new symbols is not allowed),
  persists the choice back to config, then calls `Homoglyph.word(fileName, validChars)`.

## The character map (`PERFECT_STEALTH`)

Defined once in `Homoglyph._buildMap()`, shared by every format. 21 Latin→Cyrillic pairs:

| Latin | Cyrillic | Latin | Cyrillic | Latin | Cyrillic |
| ----- | -------- | ----- | -------- | ----- | -------- |
| A     | А        | H     | Н        | S     | Ѕ        |
| a     | а        | I     | І        | T     | Т        |
| C     | С        | i     | і        | X     | Х        |
| c     | с        | J     | Ј        | x     | х        |
| E     | Е        | K     | К        | y     | у        |
| e     | е        | M     | М        |       |          |
|       |          | O     | О        |       |          |
|       |          | o     | о        |       |          |
|       |          | P     | Р        |       |          |
|       |          | p     | р        |       |          |

Only characters in this map are ever replaced — `_buildMap(chars)` silently skips (with a
console warning) any requested character not present in it.

## How the Word replacement actually happens (`_applyWord`)

1. **Copy first, edit the copy.** `fs.copyFileSync(absPath, outputPath)` — the source
   `.docx` is never opened or modified directly; only the new output file is opened.
2. **Open via COM** (`winax`): `new winax.Object('Word.Application')`, `Visible = false`,
   `DisplayAlerts = 0`, then `Documents.Open(outputPath)`.
3. **Find & Replace per pair**, using the document's `Content.Find` object:
    - `find.ClearFormatting()` / `find.Replacement.ClearFormatting()` reset any stale format state.
    - `find.Text = latin`, `find.Replacement.Text = cyrillic`.
    - `find.Execute(..., MatchCase=true, ..., Forward=true, Wrap=1, Format=false, Replace=wdReplaceAll(2))`.
    - **`MatchCase = true` is what keeps `A`→`А` and `a`→`а` distinct** — without it Word's
      Find would treat upper/lower case as interchangeable and could cross-map them.
4. **Save & close:** `doc.Save()`, `doc.Close(false)` (no re-prompt to save).
5. **Cleanup in `finally`:** `wordApp.Quit()` then `winax.release(wordApp)`, both wrapped in
   their own `try/catch` so a failure in one doesn't skip the other.
6. Errors are caught, logged, and surfaced via `Dialogs.warningBox(...)` — the method
   returns `undefined` on failure instead of throwing past the caller.

## Output naming

`_resolveOutputPath(absPath, 'Word.HomoglyphSuffix')`:

- Suffix read from `config.yml` → `Word.HomoglyphSuffix` (currently `" App"`).
- Output = `<dir>/<baseName><suffix><ext>` (e.g. `Contract.docx` → `Contract App.docx`),
  auto-incremented on collision via `Files.incrementFileName`.
- The suffix is config-driven, not hardcoded — changing `Word.HomoglyphSuffix` in
  `config.yml` changes every future run's output name.

## Persisted character selection (`wordAsk` only)

- Config key: `ChoosedChars.Word` (currently `cxACEHIJKMOPSTX` in `config.yml`).
- `wordAsk` pre-fills the input box from this key (falling back to the full map's keys if
  unset), then overwrites it with whatever the user confirms — so the next `wordAsk` run
  remembers the last selection.

## Requirements

- **`winax` must be available** — `Homoglyph._checkWinax('Homoglyph.word')` throws before
  doing anything if the native COM binding failed to load (Node version mismatch / missing
  build tools).
- **Word must be installed** (COM automation drives the real `Word.Application`).
- Source file must exist (`_resolveSource` resolves it to an absolute path and shows a
  warning box + returns `undefined` if missing).
