import path from 'path';
import { execSync } from 'child_process';

/**
 * Shared Windows-COM robustness helpers for the winax-driven Office classes
 * (Word / Excels / PowerPoints / Homoglyph). Centralizes the two patterns every
 * COM driver needs so the logic lives in exactly one place:
 *
 *   1. Orphaned-process cleanup — snapshot the running PIDs of an Office image
 *      before creating the COM object, then in `finally` kill ONLY the PID(s)
 *      this run newly spawned (a crash-orphaned instance), never one the user
 *      already had open. See {@link Com.pidsOf} + {@link Com.killOrphans}.
 *   2. Safe-open with repair fallback — try a plain open first, then a
 *      per-application repair mode (Word OpenAndRepair / Excel CorruptLoad /
 *      PowerPoint read-only). See {@link Com.openWord}/{@link Com.openWorkbook}/
 *      {@link Com.openPresentation}.
 *
 * Pure JS — no winax import. The COM objects are passed in by the caller, so
 * this module stays trivially unit-testable with a fake app object.
 */
export class Com {
  /**
   * Returns the set of currently-running PIDs for a given image name
   * (e.g. "WINWORD.EXE"). Reads `tasklist` CSV — empty set when none run or on
   * any error (non-Windows, tasklist absent, …).
   *
   * @param {string} imageName Process image name, e.g. "WINWORD.EXE".
   * @returns {Set<number>} The PIDs currently running that image.
   */
  static pidsOf(imageName) {
    try {
      const out = execSync(
        `tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`,
        { encoding: 'utf8', windowsHide: true }
      );
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^"[^"]*","(\d+)"/);
        if (m) pids.add(Number(m[1]));
      }
      return pids;
    } catch (_) {
      return new Set();
    }
  }

  /**
   * Kills any process of `imageName` whose PID is NOT in `before` — i.e. an
   * instance this run spawned that `Quit()`/`winax.release()` failed to close
   * (the orphaned-process case after a COM error). PIDs present before the run
   * are left untouched so a user's own open Office app is never killed.
   *
   * @param {string} imageName Process image name, e.g. "WINWORD.EXE".
   * @param {Set<number>} before PIDs captured before the COM object was created.
   * @returns {number} How many orphaned processes were killed.
   */
  static killOrphans(imageName, before) {
    const after = this.pidsOf(imageName);
    let killed = 0;
    for (const pid of after) {
      if (before.has(pid)) continue;
      try {
        process.kill(pid);
        killed++;
        console.warn(`[Com.killOrphans] 🪓 Killed orphaned ${imageName} PID ${pid}`);
      } catch (err) {
        console.warn(`[Com.killOrphans] ⚠️ Could not kill PID ${pid}: ${err.message}`);
      }
    }
    return killed;
  }

  /**
   * Opens a Word document via a passed-in Word.Application COM object, falling
   * back to OpenAndRepair when a plain open fails on a mildly damaged file.
   *
   * @param {object} wordApp  A Word.Application COM object.
   * @param {string} filePath Path to the .docx.
   * @param {{readOnly?: boolean}} [opts]
   * @returns {object} The opened Document.
   */
  static openWord(wordApp, filePath, { readOnly = false } = {}) {
    const absPath = path.resolve(filePath);

    // Mode 1 — plain open (the form the codebase already uses successfully).
    try {
      return wordApp.Documents.Open(absPath, false, readOnly);
    } catch (err) {
      console.warn(`[Com.openWord] ↩️ Normal open failed: ${err.message}. Trying repair mode…`);
    }

    // Mode 2 — Open with OpenAndRepair=true. Pass null (VT_NULL) for skipped
    // optional params winax accepts.
    //   Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles,
    //        PasswordDocument, PasswordTemplate, Revert, WritePasswordDocument,
    //        WritePasswordTemplate, Format, Encoding, Visible, OpenConflictDocument,
    //        OpenAndRepair, …)
    try {
      const doc = wordApp.Documents.Open(
        absPath,
        false,    // ConfirmConversions
        readOnly, // ReadOnly
        false,    // AddToRecentFiles
        null,     // PasswordDocument
        null,     // PasswordTemplate
        false,    // Revert
        null,     // WritePasswordDocument
        null,     // WritePasswordTemplate
        null,     // Format
        null,     // Encoding
        false,    // Visible
        null,     // OpenConflictDocument
        null,     // OpenAndConvert / placeholder
        true      // OpenAndRepair
      );
      console.warn(`[Com.openWord] ⚠️ Opened "${absPath}" in repair mode (OpenAndRepair=true).`);
      return doc;
    } catch (err) {
      throw new Error(`Com.openWord: Unable to open "${absPath}" even in repair mode. Last error: ${err.message}`);
    }
  }

  /**
   * Opens a presentation via a passed-in PowerPoint.Application COM object,
   * falling back to a read-only open when a plain open fails (the closest
   * PowerPoint analogue to repair mode — PowerPoint has no CorruptLoad flag).
   *
   * @param {object} pptApp   A PowerPoint.Application COM object.
   * @param {string} filePath Path to the .pptx.
   * @param {{readOnly?: boolean}} [opts]
   * @returns {object} The opened Presentation.
   */
  static openPresentation(pptApp, filePath, { readOnly = false } = {}) {
    const absPath = path.resolve(filePath);
    // Open(FileName, ReadOnly, Untitled, WithWindow) — msoTrue=-1, msoFalse=0.
    const ro = readOnly ? -1 : 0;
    try {
      return pptApp.Presentations.Open(absPath, ro, 0, 0);
    } catch (err) {
      console.warn(`[Com.openPresentation] ↩️ Normal open failed: ${err.message}. Trying read-only…`);
    }
    try {
      const pres = pptApp.Presentations.Open(absPath, -1, 0, 0);
      console.warn(`[Com.openPresentation] ⚠️ Opened "${absPath}" read-only.`);
      return pres;
    } catch (err) {
      throw new Error(`Com.openPresentation: Unable to open "${absPath}". Last error: ${err.message}`);
    }
  }

  /**
   * Opens an Excel workbook via a passed-in Excel.Application COM object,
   * silently falling back to Excel's repair/extract-data recovery modes when
   * the file has problematic content (the modes Excel's "We found a problem…
   * recover?" dialog offers).
   *
   *   CorruptLoad: 0 = xlNormalLoad, 1 = xlRepairFile, 2 = xlExtractData.
   *
   * @param {object} excelApp A Excel.Application COM object.
   * @param {string} filePath Path to the .xlsx.
   * @param {{updateLinks?: number, readOnly?: boolean}} [opts]
   * @returns {object} The opened Workbook.
   */
  static openWorkbook(excelApp, filePath, { updateLinks = 0, readOnly = false } = {}) {
    const absPath = path.resolve(filePath);

    // Mode 1 — plain open. winax/OLE does not always accept `undefined` in the
    // middle of a positional argument list, so keep this form short.
    try {
      return excelApp.Workbooks.Open(absPath, updateLinks, readOnly);
    } catch (err) {
      console.warn(`[Com.openWorkbook] ↩️ Normal open failed: ${err.message}. Trying repair mode…`);
    }

    // Modes 2 & 3 — CorruptLoad fallback. Pass `null` (VT_NULL) for the optional
    // params; `undefined` tends to surface as "Open method ... failed".
    const callWithCorruptLoad = (corruptLoad) =>
      excelApp.Workbooks.Open(
        absPath,
        updateLinks, // UpdateLinks
        readOnly,    // ReadOnly
        null,        // Format
        null,        // Password
        null,        // WriteResPassword
        true,        // IgnoreReadOnlyRecommended
        null,        // Origin
        null,        // Delimiter
        null,        // Editable
        false,       // Notify
        null,        // Converter
        false,       // AddToMru
        null,        // Local
        corruptLoad  // CorruptLoad
      );

    try {
      const wb = callWithCorruptLoad(1);
      console.warn(`[Com.openWorkbook] ⚠️ Opened "${absPath}" in repair mode (CorruptLoad=1).`);
      return wb;
    } catch (err) {
      console.warn(`[Com.openWorkbook] ↩️ Repair-mode open failed: ${err.message}. Trying extract-data mode…`);
    }

    try {
      const wb = callWithCorruptLoad(2);
      console.warn(`[Com.openWorkbook] ⚠️ Opened "${absPath}" in extract-data mode (CorruptLoad=2).`);
      return wb;
    } catch (err) {
      throw new Error(`Com.openWorkbook: Unable to open "${absPath}" even with repair/extract-data modes. Last error: ${err.message}`);
    }
  }
}
