import fs from 'fs';
import path from 'path';
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
    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening presentation for protection: ${absPath}`);
      const presentation = pptApp.Presentations.Open(absPath, 0, 0, 0);

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
    const pptApp = new winax.Object('PowerPoint.Application');

    try {
      console.log(`📂 Opening protected presentation: ${absPath}`);
      // WithWindow=0 (hidden); pass open-password as 4th arg
      const presentation = pptApp.Presentations.Open(absPath, 0, 0, 0);

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
}
