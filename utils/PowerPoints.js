import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Dialogs } from './Dialogs.js';
import { Files } from './Files.js';
import { Yamls } from './Yamls.js';

let winax;
try {
  winax = (await import('winax')).default;
} catch (e) {
  // winax not available
}

export class PowerPoints {
  static checkWinax(methodName) {
    console.info(`[PowerPoints.checkWinax] 🟢 Starting...`);
    if (!winax) {
      throw new Error(`${methodName}: Native automation (winax) is not available. This is often due to a Node.js version mismatch or missing build tools.`);
    }
  }

  /**
   * Returns the set of currently-running PIDs for a given image name
   * (e.g. "POWERPNT.EXE"). Reads `tasklist` CSV — empty set when none run or
   * on any error. Used to detect COM processes a winax error leaves orphaned.
   *
   * @param {string} imageName
   * @returns {Set<number>}
   */
  static _pidsOf(imageName) {
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
   * Kills any POWERPNT.EXE process whose PID is NOT in `before` — i.e. a
   * PowerPoint instance this run spawned that `Quit()`/`winax.release()` failed
   * to close (the orphaned-process case after a COM error). PIDs present before
   * the run are left untouched so a user's own open PowerPoint is never killed.
   *
   * @param {Set<number>} before PIDs captured before the COM object was created.
   */
  static _killOrphans(before) {
    const after = this._pidsOf('POWERPNT.EXE');
    for (const pid of after) {
      if (before.has(pid)) continue;
      try {
        process.kill(pid);
        console.warn(`[PowerPoints._killOrphans] 🪓 Killed orphaned POWERPNT.EXE PID ${pid}`);
      } catch (err) {
        console.warn(`[PowerPoints._killOrphans] ⚠️ Could not kill PID ${pid}: ${err.message}`);
      }
    }
  }

  /**
   * Opens a presentation with a window-less COM open, falling back to a
   * read-only open when a plain open fails (the closest PowerPoint analogue to
   * Excel's repair-mode safe-open — PowerPoint has no CorruptLoad flag).
   *
   * @param {object} pptApp   A PowerPoint.Application COM object.
   * @param {string} filePath Path to the .pptx.
   * @param {{readOnly?: boolean}} [opts]
   * @returns {object} The opened Presentation.
   */
  static _safeOpen(pptApp, filePath, { readOnly = false } = {}) {
    const absPath = path.resolve(filePath);
    // Open(FileName, ReadOnly, Untitled, WithWindow) — msoTrue=-1, msoFalse=0.
    const ro = readOnly ? -1 : 0;
    try {
      return pptApp.Presentations.Open(absPath, ro, 0, 0);
    } catch (err) {
      console.warn(`[PowerPoints._safeOpen] ↩️ Normal open failed: ${err.message}. Trying read-only…`);
    }
    try {
      const pres = pptApp.Presentations.Open(absPath, -1, 0, 0);
      console.warn(`[PowerPoints._safeOpen] ⚠️ Opened "${absPath}" read-only.`);
      return pres;
    } catch (err) {
      throw new Error(`_safeOpen: Unable to open "${absPath}". Last error: ${err.message}`);
    }
  }

  /**
   * Returns a suffixed, auto-incremented path for the protected output file.
   * Reads 'PowerPoint.ProtectSuffix' from config.yml (falls back to ' Protected').
   * If the stem already contains the suffix the original path is returned as-is.
   *
   * @param {string} filename
   * @returns {string}
   */
  static getProtectedPath(filename) {
    console.info(`[PowerPoints.getProtectedPath] 🟢 Starting...`);
    const absPath = path.resolve(filename);
    const ext = path.extname(absPath);
    const stem = path.basename(absPath, ext);
    const protectSuffix = Yamls.getConfig('PowerPoint.ProtectSuffix', null, ' Protected') || ' Protected';

    if (stem.includes(protectSuffix)) return absPath;

    const newPath = path.join(path.dirname(absPath), `${stem}${protectSuffix}${ext}`);
    return Files.incrementFileName(newPath);
  }

  /**
   * Protects a PowerPoint presentation with an open-password and/or a write-password.
   * Saves the result to a new suffixed file via getProtectedPath (original untouched).
   *
   * @param {string} filename            - Path to the source .pptx file.
   * @param {string} password            - Password required to open the file.
   * @param {string} [writePassword=''] - Password required to edit/save the file.
   * @returns {string} Path to the saved protected file.
   */
  static protectFile(filename, password, writePassword = '') {
    console.info(`[PowerPoints.protectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`protectFile: File not found: ${absPath}`);
    }

    this.checkWinax('PowerPoints.protectFile');
    const before = this._pidsOf('POWERPNT.EXE');
    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening presentation for protection: ${absPath}`);
      const presentation = this._safeOpen(pptApp, absPath);

      if (presentation.Password && presentation.Password !== '') {
        console.warn(`⚠️ Presentation already has an open-password: ${absPath}. Skipping.`);
        presentation.Close();
        return absPath;
      }

      console.log(`🔒 Setting open-password${writePassword ? ' and write-password' : ''}...`);
      presentation.Password = password;
      if (writePassword) presentation.WritePassword = writePassword;

      const newPath = this.getProtectedPath(absPath);
      presentation.SaveAs(newPath);
      console.log(`💾 Protected presentation saved as: ${newPath}`);
      presentation.Close();

      return newPath;
    } catch (error) {
      throw new Error(`PowerPoints.protectFile failed: ${error.message}`);
    } finally {
      try { pptApp.Quit(); } catch (_) {}
      try { winax.release(pptApp); } catch (_) {}
      this._killOrphans(before);
    }
  }

  /**
   * Removes open-password and write-password from a PowerPoint presentation, saving in-place.
   *
   * @param {string} filename - Path to the protected .pptx file.
   * @param {string} password - Open password set on the presentation.
   */
  static unProtectFile(filename, password) {
    console.info(`[PowerPoints.unProtectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectFile: File not found: ${absPath}`);
    }

    this.checkWinax('PowerPoints.unProtectFile');
    const before = this._pidsOf('POWERPNT.EXE');
    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening protected presentation: ${absPath}`);
      // WithWindow=0 (hidden); pass open-password as 4th arg
      const presentation = this._safeOpen(pptApp, absPath);

      if (!presentation.Password || presentation.Password === '') {
        console.warn(`⚠️ Presentation is not password-protected: ${absPath}.`);
        Dialogs.warningBox('File is not protected', 'Unprotect Presentation');
        presentation.Close();
        return;
      }

      console.log(`🔓 Removing presentation passwords...`);
      presentation.Password = '';
      presentation.WritePassword = '';

      presentation.Save();
      console.log(`💾 Unprotected presentation saved: ${absPath}`);
      presentation.Close();
    } catch (error) {
      throw new Error(`PowerPoints.unProtectFile failed: ${error.message}`);
    } finally {
      try { pptApp.Quit(); } catch (_) {}
      try { winax.release(pptApp); } catch (_) {}
      this._killOrphans(before);
    }
  }

  /**
   * Prompt the user for a password then protect the presentation.
   * @param {string} filename - Path to the .pptx file.
   */
  static protectFileAsk(filename) {
    console.info(`[PowerPoints.protectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter open-password to protect the presentation:', 'Protect Presentation');
    if (password === null) {
      console.log('protectFileAsk: cancelled by user.');
      return;
    }
    return this.protectFile(filename, password);
  }

  /**
   * Prompt the user for a password then unprotect the presentation.
   * @param {string} filename - Path to the .pptx file.
   */
  static unProtectFileAsk(filename) {
    console.info(`[PowerPoints.unProtectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter open-password to unprotect the presentation:', 'Unprotect Presentation');
    if (password === null) {
      console.log('unProtectFileAsk: cancelled by user.');
      return;
    }
    this.unProtectFile(filename, password);
  }

  /**
   * Merges several .pptx presentations into one, appending every slide from each
   * source (in order) onto a fresh copy of the first file. Uses COM
   * `Slides.InsertFromFile`, which carries each source slide's own design/layout
   * across — the merged deck keeps each part's formatting. The output is written
   * beside the first file, named after that folder, auto-incremented on collision
   * (mirrors Word.merge / Excels.mergeFiles).
   *
   * @param {string[]} filePaths - Two or more .pptx paths (the first is the base).
   * @param {string} [mergedName] - Optional output name/path; default = "<folder>.pptx".
   * @returns {string} The resolved path to the saved merged presentation.
   */
  static merge(filePaths, mergedName = '') {
    console.info(`[PowerPoints.merge] 🟢 Starting...`);
    if (!filePaths || filePaths.length === 0) {
      throw new Error('PowerPoints.merge: No files provided to merge.');
    }

    this.checkWinax('PowerPoints.merge');

    const firstFile = path.resolve(filePaths[0]);
    if (!fs.existsSync(firstFile)) {
      throw new Error(`PowerPoints.merge: First file not found: ${firstFile}`);
    }
    const firstFileDir = path.dirname(firstFile);

    // Resolve the merged output path.
    let finalMergedPath;
    if (mergedName) {
      finalMergedPath = path.isAbsolute(mergedName)
        ? (mergedName.endsWith('.pptx') ? mergedName : mergedName + '.pptx')
        : path.join(firstFileDir, mergedName.endsWith('.pptx') ? mergedName : mergedName + '.pptx');
    } else {
      const parentFolderName = path.basename(firstFileDir);
      finalMergedPath = path.join(firstFileDir, parentFolderName + '.pptx');
    }
    finalMergedPath = Files.incrementFileName(finalMergedPath);

    // Start from a copy of the first file so its slides/design are the base.
    console.log(`📑 Copying base presentation to: ${finalMergedPath}`);
    fs.copyFileSync(firstFile, finalMergedPath);

    const before = this._pidsOf('POWERPNT.EXE');
    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening merged base: ${finalMergedPath}`);
      const target = this._safeOpen(pptApp, finalMergedPath);

      for (let i = 1; i < filePaths.length; i++) {
        const sourceFile = path.resolve(filePaths[i]);
        if (!fs.existsSync(sourceFile)) {
          console.warn(`⚠️ PowerPoints.merge: source not found, skipping: ${sourceFile}`);
          continue;
        }

        const sourcePpt = this._safeOpen(pptApp, sourceFile, { readOnly: true });
        const sourceCount = sourcePpt.Slides.Count;
        sourcePpt.Close();

        if (sourceCount === 0) {
          console.warn(`⚠️ PowerPoints.merge: "${sourceFile}" has no slides, skipping.`);
          continue;
        }

        const insertAt = target.Slides.Count;
        console.log(`📌 Inserting ${sourceCount} slide(s) from ${i + 1}/${filePaths.length}: ${sourceFile}`);
        // InsertFromFile(FileName, Index, SlideStart, SlideEnd) — Index is the
        // slide AFTER which the source slides are inserted (0 = at start).
        target.Slides.InsertFromFile(sourceFile, insertAt, 1, sourceCount);
      }

      console.log(`💾 Saving merged presentation...`);
      target.Save();
      target.Close();
      console.log(`✅ Merged successfully into: ${finalMergedPath}`);
      return finalMergedPath;
    } finally {
      try { pptApp.Quit(); } catch (_) {}
      try { winax.release(pptApp); } catch (_) {}
      this._killOrphans(before);
    }
  }

  /**
   * Merges presentations folder-by-folder: from each given folder it picks the
   * latest .pptx by modification time (skipping ~$ temp files), then merges that
   * set via PowerPoints.merge. No template — the first folder's latest file is
   * the base (mirrors Word.mergeFolder).
   *
   * @param {string[]} folderPaths - One or more folders, each contributing its newest .pptx.
   * @returns {string} The resolved path to the saved merged presentation.
   */
  static mergeFolder(folderPaths) {
    console.info(`[PowerPoints.mergeFolder] 🟢 Starting...`);
    if (!folderPaths || folderPaths.length === 0) {
      throw new Error('PowerPoints.mergeFolder: No folders provided.');
    }

    const latestFiles = [];

    for (const folder of folderPaths) {
      const resolvedFolder = path.resolve(folder);
      if (!fs.existsSync(resolvedFolder)) {
        console.warn(`⚠️ Folder not found, skipping: ${resolvedFolder}`);
        continue;
      }

      const files = fs.readdirSync(resolvedFolder);
      let latestFile = null;
      let latestTime = 0;

      for (const file of files) {
        if (!file.toLowerCase().endsWith('.pptx') || file.startsWith('~$')) {
          continue;
        }
        const filePath = path.join(resolvedFolder, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile() && stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestFile = filePath;
        }
      }

      if (latestFile) {
        latestFiles.push(latestFile);
      } else {
        console.warn(`⚠️ No valid .pptx files found in: ${resolvedFolder}`);
      }
    }

    if (latestFiles.length === 0) {
      throw new Error('PowerPoints.mergeFolder: No .pptx files found across the provided folders.');
    }

    console.log(`📑 Found ${latestFiles.length} latest file(s) to merge:\n${latestFiles.join('\n')}`);
    return this.merge(latestFiles);
  }
}
