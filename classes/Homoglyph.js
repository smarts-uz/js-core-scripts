import fs from 'fs';
import path from 'path';

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';
import { Com } from './Com.js';

let winax;
try {
  winax = (await import('winax')).default;
} catch (e) {
  // winax not available (likely binary not built)
}

/**
 * Centralized homoglyph engine.
 *
 * Replaces Latin characters with visually identical Cyrillic homoglyphs across
 * every supported document format. The four public methods — markdown / word /
 * excel / powerpoint (plus their *Ask interactive variants) — share a single
 * PERFECT_STEALTH map and a common pipeline (validate file → build map →
 * resolve output path → apply → save). Format-specific replacement logic lives
 * in the per-format _apply* drivers; everything universal lives in _ helpers.
 */
export class Homoglyph {
  /**
   * Shared Latin→Cyrillic homoglyph map (PERFECT_STEALTH). The single source of
   * truth for every format. Returns the full map when chars is null, or a
   * filtered subset when chars is a string (each character is a lookup key).
   * Characters not present in the map are skipped with a warning.
   *
   * @param {string|null} chars
   * @returns {Record<string,string>}
   */
  static _buildMap(chars = null) {
    console.info(`[Homoglyph._buildMap] 🟢 Starting...`);
    const PERFECT_STEALTH = {
      A: 'А',
      a: 'а',

      C: 'С',
      c: 'с',

      E: 'Е',
      e: 'е',

      H: 'Н',

      I: 'І',
      i: 'і',

      J: 'Ј',

      K: 'К',

      M: 'М',

      O: 'О',
      o: 'о',

      P: 'Р',
      p: 'р',

      S: 'Ѕ',

      T: 'Т',

      X: 'Х',
      x: 'х',

      y: 'у',
    };

    if (chars === null) {
      return { ...PERFECT_STEALTH };
    }

    const replaceMap = {};
    for (const ch of chars.split('')) {
      if (ch in PERFECT_STEALTH) {
        replaceMap[ch] = PERFECT_STEALTH[ch];
      } else {
        console.warn(`⚠️ Homoglyph._buildMap: '${ch}' not in PERFECT_STEALTH — skipped`);
      }
    }
    return replaceMap;
  }

  /**
   * Guards COM-driven formats (Word / Excel / PowerPoint). Markdown is plain
   * text and never calls this.
   *
   * @param {string} methodName
   */
  static _checkWinax(methodName) {
    console.info(`[Homoglyph._checkWinax] 🟢 Starting...`);
    if (!winax) {
      console.error(`[Homoglyph._checkWinax] ❌ Native automation (winax) is not available.`);
      throw new Error(
        `${methodName}: Native automation (winax) is not available. This is often due to a Node.js version mismatch or missing build tools.`
      );
    }
    console.info(`[Homoglyph._checkWinax] ✅ winax is available.`);
  }

  /**
   * Resolves the source file to an absolute path, asserting it exists.
   * Returns null (after a warning box) when the file is missing.
   *
   * @param {string} fileName
   * @param {string} label - e.g. 'Homoglyph.word' for log context.
   * @returns {string|null}
   */
  static _resolveSource(fileName, label) {
    console.info(`[Homoglyph._resolveSource] 🟢 Starting...`);
    const absPath = fileName ? path.resolve(fileName) : '';
    console.log(`[Homoglyph._resolveSource] ${label}: absPath = ${absPath}`);

    if (!absPath || !fs.existsSync(absPath)) {
      Dialogs.warningBox(`File not found: ${absPath}`, 'Error');
      return null;
    }
    return absPath;
  }

  /**
   * Returns true (after a warning) when the replacement map is empty, meaning
   * none of the requested characters are mappable and there is nothing to do.
   *
   * @param {Record<string,string>} replaceMap
   * @param {string} label
   * @returns {boolean}
   */
  static _isEmptyMap(replaceMap, label) {
    console.info(`[Homoglyph._isEmptyMap] 🟢 Starting...`);
    const empty = Object.keys(replaceMap).length === 0;
    if (empty) {
      console.warn(`⚠️ ${label}: No valid replacement characters found. Nothing to do.`);
    }
    return empty;
  }

  /**
   * Builds the suffixed, auto-incremented output path: "<basename><suffix><ext>".
   * The suffix is read from config (e.g. 'Word.HomoglyphSuffix'), defaulting to
   * ' Norm'.
   *
   * @param {string} absPath   - Absolute source path.
   * @param {string} suffixKey - Config key holding the suffix (e.g. 'Word.HomoglyphSuffix').
   * @returns {string}
   */
  static _resolveOutputPath(absPath, suffixKey) {
    console.info(`[Homoglyph._resolveOutputPath] 🟢 Starting...`);
    const ext = path.extname(absPath);
    const baseName = Files.getBaseName(absPath, ext);
    const dir = path.dirname(absPath);
    const suffix = Yamls.getConfig(suffixKey, null, ' Norm') || ' Norm';
    const baseOutputPath = path.join(dir, `${baseName}${suffix}${ext}`);
    const outputPath = Files.incrementFileName(baseOutputPath);
    console.log(`[Homoglyph._resolveOutputPath] ${suffixKey} → ${outputPath}`);
    return outputPath;
  }

  /**
   * The shared interactive flow for every *Ask method: show the input box
   * pre-filled with the persisted/default chars, filter out non-mappable
   * characters (adding new symbols is prohibited), persist the choice, then run
   * the supplied apply callback. Returns undefined when the user cancels.
   *
   * @param {string} configKey - e.g. 'ChoosedChars.Word'.
   * @param {(validChars: string) => any} applyFn - Runs the actual substitution.
   * @returns {any|undefined}
   */
  static _ask(configKey, applyFn) {
    console.info(`[Homoglyph._ask] 🟢 Starting...`);
    const allChars = Object.keys(this._buildMap()).join('');
    const defaultChars = Yamls.getConfig(configKey, null, allChars) || allChars;
    console.log(`[Homoglyph._ask] configKey = ${configKey}, defaultChars = ${defaultChars}`);

    const selectedChars = Dialogs.inputBox(
      'Leave only the characters you want to replace (adding new symbols is prohibited):',
      'Select Homoglyph Characters',
      defaultChars
    );

    if (selectedChars === null) {
      console.log('[Homoglyph._ask] Cancelled by user.');
      return;
    }

    // Filter out any characters not in PERFECT_STEALTH (adding new symbols is prohibited)
    const validChars = selectedChars
      .split('')
      .filter((ch) => allChars.includes(ch))
      .join('');
    console.log(`[Homoglyph._ask] validChars = ${validChars}`);

    // Persist the user's choice for next time
    Yamls.setConfig(configKey, validChars);

    return applyFn(validChars);
  }

  // ───────────────────────────── Public API ─────────────────────────────

  /**
   * Replaces Latin characters in a Markdown file with Cyrillic homoglyphs.
   * Plain UTF-8 text — no COM/winax required.
   *
   * @param {string} fileName - Path to the source .md file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   * @returns {string|undefined} Path to the saved output file.
   */
  static markdown(fileName, chars = null) {
    console.info(`[Homoglyph.markdown] 🟢 Starting...`);
    const absPath = this._resolveSource(fileName, 'Homoglyph.markdown');
    if (!absPath) return;

    const replaceMap = this._buildMap(chars);
    if (this._isEmptyMap(replaceMap, 'Homoglyph.markdown')) return;

    const outputPath = this._resolveOutputPath(absPath, 'Markdown.HomoglyphSuffix');
    const result = this._applyText(absPath, outputPath, replaceMap);
    console.log(`✅ Markdown homoglyph saved: ${result}`);
    return result;
  }

  /**
   * Interactive Markdown homoglyph: prompts for characters, persists the choice.
   * @param {string} fileName
   * @returns {string|undefined}
   */
  static markdownAsk(fileName) {
    console.info(`[Homoglyph.markdownAsk] 🟢 Starting...`);
    return this._ask('ChoosedChars.Markdown', (validChars) => this.markdown(fileName, validChars));
  }

  /**
   * Replaces Latin characters in a Word document with Cyrillic homoglyphs (COM).
   *
   * @param {string} fileName - Path to the source .docx file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   * @returns {string|undefined} Path to the saved output file.
   */
  static word(fileName, chars = null) {
    console.info(`[Homoglyph.word] 🟢 Starting...`);
    this._checkWinax('Homoglyph.word');

    const absPath = this._resolveSource(fileName, 'Homoglyph.word');
    if (!absPath) return;

    const replaceMap = this._buildMap(chars);
    if (this._isEmptyMap(replaceMap, 'Homoglyph.word')) return;

    const outputPath = this._resolveOutputPath(absPath, 'Word.HomoglyphSuffix');
    return this._applyWord(absPath, outputPath, replaceMap);
  }

  /**
   * Interactive Word homoglyph: prompts for characters, persists the choice.
   * @param {string} fileName
   * @returns {string|undefined}
   */
  static wordAsk(fileName) {
    console.info(`[Homoglyph.wordAsk] 🟢 Starting...`);
    return this._ask('ChoosedChars.Word', (validChars) => this.word(fileName, validChars));
  }

  /**
   * Replaces Latin characters in every text cell of an Excel workbook with
   * Cyrillic homoglyphs (COM). Excluded sheets are skipped.
   *
   * @param {string} fileName - Path to the source .xlsx file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   * @returns {string|undefined} Path to the saved output file.
   */
  static excel(fileName, chars = null) {
    console.info(`[Homoglyph.excel] 🟢 Starting...`);
    this._checkWinax('Homoglyph.excel');

    const absPath = this._resolveSource(fileName, 'Homoglyph.excel');
    if (!absPath) return;

    const replaceMap = this._buildMap(chars);
    if (this._isEmptyMap(replaceMap, 'Homoglyph.excel')) return;

    const outputPath = this._resolveOutputPath(absPath, 'Excel.HomoglyphSuffix');
    return this._applyExcel(absPath, outputPath, replaceMap);
  }

  /**
   * Interactive Excel homoglyph: prompts for characters, persists the choice.
   * @param {string} fileName
   * @returns {string|undefined}
   */
  static excelAsk(fileName) {
    console.info(`[Homoglyph.excelAsk] 🟢 Starting...`);
    return this._ask('ChoosedChars.Excel', (validChars) => this.excel(fileName, validChars));
  }

  /**
   * Replaces Latin characters in every text shape of a PowerPoint presentation
   * with Cyrillic homoglyphs (COM).
   *
   * @param {string} fileName - Path to the source .pptx file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   * @returns {string|undefined} Path to the saved output file.
   */
  static powerpoint(fileName, chars = null) {
    console.info(`[Homoglyph.powerpoint] 🟢 Starting...`);
    this._checkWinax('Homoglyph.powerpoint');

    const absPath = this._resolveSource(fileName, 'Homoglyph.powerpoint');
    if (!absPath) return;

    const replaceMap = this._buildMap(chars);
    if (this._isEmptyMap(replaceMap, 'Homoglyph.powerpoint')) return;

    const outputPath = this._resolveOutputPath(absPath, 'PowerPoint.HomoglyphSuffix');
    return this._applyPowerPoint(absPath, outputPath, replaceMap);
  }

  /**
   * Interactive PowerPoint homoglyph: prompts for characters, persists the choice.
   * @param {string} fileName
   * @returns {string|undefined}
   */
  static powerpointAsk(fileName) {
    console.info(`[Homoglyph.powerpointAsk] 🟢 Starting...`);
    return this._ask('ChoosedChars.PowerPoint', (validChars) =>
      this.powerpoint(fileName, validChars)
    );
  }

  // ─────────────────────────── Format drivers ───────────────────────────

  /**
   * Plain-text replacement driver (Markdown). Reads the source, applies every
   * mapping with a global regex, writes the output. No COM.
   *
   * @param {string} absPath
   * @param {string} outputPath
   * @param {Record<string,string>} replaceMap
   * @returns {string} outputPath
   */
  static _applyText(absPath, outputPath, replaceMap) {
    console.info(`[Homoglyph._applyText] 🟢 Starting...`);
    let content = fs.readFileSync(absPath, 'utf8');
    for (const [latin, cyrillic] of Object.entries(replaceMap)) {
      const escaped = latin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      content = content.replace(new RegExp(escaped, 'g'), cyrillic);
      console.log(`🔄 '${latin}' → '${cyrillic}'`);
    }
    fs.writeFileSync(outputPath, content, 'utf8');
    return outputPath;
  }

  /**
   * Word COM driver. Copies source→output, then Find/Replace each mapping with
   * MatchCase so the case-specific homoglyph mapping stays correct.
   *
   * @param {string} absPath
   * @param {string} outputPath
   * @param {Record<string,string>} replaceMap
   * @returns {string|undefined} outputPath, or undefined on error.
   */
  static _applyWord(absPath, outputPath, replaceMap) {
    console.info(`[Homoglyph._applyWord] 🟢 Starting...`);

    fs.copyFileSync(absPath, outputPath);
    console.log(`📋 Copied to: ${outputPath}`);

    const wordApp = new winax.Object('Word.Application');
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0;

    try {
      console.log(`📂 Opening: ${outputPath}`);
      const doc = wordApp.Documents.Open(outputPath);
      const find = doc.Content.Find;

      for (const [latin, cyrillic] of Object.entries(replaceMap)) {
        find.ClearFormatting();
        find.Replacement.ClearFormatting();
        find.Text = latin;
        find.Replacement.Text = cyrillic;
        find.Execute(
          find.Text,
          true, // MatchCase — keep case sensitivity for correct mapping
          false,
          false,
          false,
          false,
          true,
          1,
          false,
          find.Replacement.Text,
          2 // wdReplaceAll
        );
        console.log(`🔄 '${latin}' → '${cyrillic}'`);
      }

      doc.Save();
      doc.Close(false);
      console.log(`✅ Word homoglyph saved: ${outputPath}`);
      return outputPath;
    } catch (e) {
      console.error(e);
      Dialogs.warningBox(`Error in Homoglyph.word: ${e.message}`, 'Error');
    } finally {
      try {
        wordApp.Quit();
      } catch (_) {}
      try {
        winax.release(wordApp);
      } catch (_) {}
    }
  }

  /**
   * Opens an Excel workbook with graceful fallbacks: a plain 3-arg open first,
   * then CorruptLoad repair (xlRepairFile) and extract-data (xlExtractData)
   * modes. Mirrors Excels.openWorkbookSafely so the homoglyph engine is robust
   * to mildly damaged files without depending on the Excels class.
   *
   * @param {object} excelApp
   * @param {string} filePath
   * @param {{updateLinks?: number, readOnly?: boolean}} [opts]
   * @returns {object} The opened Workbook.
   */
  static _openWorkbookSafely(excelApp, filePath, opts = {}) {
    console.info(`[Homoglyph._openWorkbookSafely] 🟢 Starting...`);
    // Delegates to the shared Com helper (repair/extract-data CorruptLoad fallback).
    return Com.openWorkbook(excelApp, filePath, opts);
  }

  /**
   * Excel COM driver. Copies source→output, walks every non-excluded sheet's
   * used range, and rewrites string cells containing mapped characters.
   *
   * @param {string} absPath
   * @param {string} outputPath
   * @param {Record<string,string>} replaceMap
   * @returns {string|undefined} outputPath, or undefined on error.
   */
  static _applyExcel(absPath, outputPath, replaceMap) {
    console.info(`[Homoglyph._applyExcel] 🟢 Starting...`);

    const entries = Object.entries(replaceMap);
    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
    console.log(`🚫 Excluded sheets: ${exclusions.join(', ') || '(none)'}`);

    fs.copyFileSync(absPath, outputPath);
    console.log(`📋 Copied to: ${outputPath}`);

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening: ${outputPath}`);
      const workbook = this._openWorkbookSafely(excelApp, outputPath, { updateLinks: 0, readOnly: false });
      const sheetCount = workbook.Sheets.Count;

      let totalChanged = 0;

      for (let si = 1; si <= sheetCount; si++) {
        const sheet = workbook.Sheets(si);
        const sheetName = sheet.Name;

        if (exclusions.includes(sheetName)) {
          console.log(`⏭️  Skipping excluded sheet: "${sheetName}"`);
          continue;
        }

        console.log(`\n🔍 Processing sheet: "${sheetName}"`);
        let changedInSheet = 0;

        let usedRange;
        try {
          usedRange = sheet.UsedRange;
        } catch (_) {
          console.log(`ℹ️  No used range in sheet "${sheetName}"`);
          continue;
        }

        const rowCount = usedRange.Rows.Count;
        const colCount = usedRange.Columns.Count;

        for (let r = 1; r <= rowCount; r++) {
          for (let c = 1; c <= colCount; c++) {
            const cell = usedRange.Cells(r, c);
            let val;
            try {
              val = cell.Value;
            } catch (_) {
              continue;
            }
            if (typeof val !== 'string' || val.length === 0) continue;

            let newVal = val;
            for (const [latin, cyrillic] of entries) {
              if (newVal.includes(latin)) {
                newVal = newVal.split(latin).join(cyrillic);
              }
            }

            if (newVal !== val) {
              cell.Value = newVal;
              changedInSheet++;
            }
          }
        }

        totalChanged += changedInSheet;
        console.log(
          changedInSheet > 0
            ? `✅ Updated ${changedInSheet} cell(s) in "${sheetName}"`
            : `ℹ️  No changes in "${sheetName}"`
        );
      }

      workbook.Save();
      workbook.Close(false);
      console.log(`\n💾 Total cells changed: ${totalChanged}`);
      console.log(`✅ Excel homoglyph saved: ${outputPath}`);
      return outputPath;
    } catch (e) {
      console.error(e);
      Dialogs.warningBox(`Error in Homoglyph.excel: ${e.message}`, 'Error');
    } finally {
      try {
        excelApp.Quit();
      } catch (_) {}
      try {
        winax.release(excelApp);
      } catch (_) {}
    }
  }

  /**
   * PowerPoint COM driver. Copies source→output, walks every slide/shape, and
   * rewrites text frames containing mapped characters.
   *
   * @param {string} absPath
   * @param {string} outputPath
   * @param {Record<string,string>} replaceMap
   * @returns {string|undefined} outputPath, or undefined on error.
   */
  static _applyPowerPoint(absPath, outputPath, replaceMap) {
    console.info(`[Homoglyph._applyPowerPoint] 🟢 Starting...`);

    const entries = Object.entries(replaceMap);

    fs.copyFileSync(absPath, outputPath);
    console.log(`📋 Copied to: ${outputPath}`);

    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening: ${outputPath}`);
      // Parameters: FileName, ReadOnly, Untitled, WithWindow (msoFalse = 0)
      const presentation = pptApp.Presentations.Open(outputPath, 0, 0, 0);

      const slideCount = presentation.Slides.Count;
      let totalChanged = 0;

      for (let si = 1; si <= slideCount; si++) {
        const slide = presentation.Slides(si);
        const shapeCount = slide.Shapes.Count;
        let changedInSlide = 0;

        for (let sh = 1; sh <= shapeCount; sh++) {
          const shape = slide.Shapes(sh);

          // Check if shape has a text frame and it has text
          if (shape.HasTextFrame && shape.TextFrame.HasText) {
            const textRange = shape.TextFrame.TextRange;
            const val = textRange.Text;

            if (typeof val === 'string' && val.length > 0) {
              let newVal = val;
              for (const [latin, cyrillic] of entries) {
                if (newVal.includes(latin)) {
                  newVal = newVal.split(latin).join(cyrillic);
                }
              }

              if (newVal !== val) {
                textRange.Text = newVal;
                changedInSlide++;
              }
            }
          }
        }

        totalChanged += changedInSlide;
        console.log(
          changedInSlide > 0
            ? `✅ Updated ${changedInSlide} shape(s) in Slide ${si}`
            : `ℹ️  No changes in Slide ${si}`
        );
      }

      presentation.Save();
      presentation.Close();
      console.log(`\n💾 Total shapes changed: ${totalChanged}`);
      console.log(`✅ PowerPoint homoglyph saved: ${outputPath}`);
      return outputPath;
    } catch (e) {
      console.error(e);
      Dialogs.warningBox(`Error in Homoglyph.powerpoint: ${e.message}`, 'Error');
    } finally {
      try {
        pptApp.Quit();
      } catch (_) {}
      try {
        winax.release(pptApp);
      } catch (_) {}
    }
  }
}
