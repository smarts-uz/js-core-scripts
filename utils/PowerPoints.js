import fs from 'fs';
import path from 'path';
import { Dialogs } from './Dialogs.js';
import { Files } from './Files.js';
import { Word } from './Word.js';
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
   * Replaces Latin characters in all text shapes of a PowerPoint presentation with
   * visually identical Cyrillic homoglyphs (PERFECT_STEALTH map from Word).
   * Iterates every slide and every shape, rewriting text containing the mapped characters.
   *
   * @param {string} fileName - Path to the source .pptx file.
   * @param {string|null} chars - If null, all mapped chars are replaced.
   *   If a string (e.g. "STy"), only those chars present in the map are used.
   * @returns {string|undefined} Path to the saved output file.
   */
  static homoglyph(fileName, chars = null) {
    console.info(`[PowerPoints.homoglyph] 🟢 Starting...`);
    this.checkWinax('PowerPoints.homoglyph');

    const absPath = path.resolve(fileName);
    if (!fs.existsSync(absPath)) {
      Dialogs.warningBox(`File not found: ${absPath}`, 'Error');
      return;
    }

    const replaceMap = Word.buildHomoglyphMap(chars);
    if (Object.keys(replaceMap).length === 0) {
      console.warn('⚠️ PowerPoints.homoglyph: No valid replacement characters found. Nothing to do.');
      return;
    }

    const entries = Object.entries(replaceMap);

    // Build output path: "<basename> Norm.pptx", auto-incremented
    const ext = path.extname(absPath);
    const baseName = path.basename(absPath, ext);
    const dir = path.dirname(absPath);
    const homoglyphSuffix = Yamls.getConfig('PowerPoint.HomoglyphSuffix', null, ' Norm') || ' Norm';
    const baseOutputPath = path.join(dir, `${baseName}${homoglyphSuffix}${ext}`);
    const outputPath = Files.incrementFileName(baseOutputPath);

    fs.copyFileSync(absPath, outputPath);
    console.log(`📋 Copied to: ${outputPath}`);

    const pptApp = new winax.Object('PowerPoint.Application');
    // PowerPoint might not allow setting Visible to false in some versions without a presentation open.
    // Generally, it's safer to just open it, and we can try to minimize it.
    // pptApp.Visible = true; // Required by some PPT COM operations
    
    try {
      console.log(`📂 Opening: ${outputPath}`);
      // Parameters: FileName, ReadOnly, Untitled, WithWindow
      const presentation = pptApp.Presentations.Open(outputPath, 0, 0, 0); // WithWindow = msoFalse (0)

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
        console.log(changedInSlide > 0
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
      Dialogs.warningBox(`Error in PowerPoints.homoglyph: ${e.message}`, 'Error');
    } finally {
      try { pptApp.Quit(); } catch (_) {}
      try { winax.release(pptApp); } catch (_) {}
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

  /**
   * Prompts the user with an input box containing all PERFECT_STEALTH keys.
   * The user can remove characters, but adding new ones will be ignored.
   * Calls homoglyph with the selected characters.
   *
   * @param {string} fileName - Path to the source .pptx file.
   * @returns {string|undefined} Path to the saved output file.
   */
  static homoglyphAsk(fileName) {
    console.info(`[PowerPoints.homoglyphAsk] 🟢 Starting...`);
    const allChars = Object.keys(Word.buildHomoglyphMap()).join('');
    const defaultChars = Yamls.getConfig('ChoosedChars.PowerPoint', null, allChars) || allChars;

    const selectedChars = Dialogs.inputBox(
      'Leave only the characters you want to replace (adding new symbols is prohibited):',
      'Select Homoglyph Characters',
      defaultChars
    );

    if (selectedChars === null) {
      console.log('homoglyphAsk: Cancelled by user.');
      return;
    }

    const validChars = selectedChars.split('').filter(ch => allChars.includes(ch)).join('');

    // Persist the user's choice for next time
    Yamls.setConfig('ChoosedChars.PowerPoint', validChars);

    return this.homoglyph(fileName, validChars);
  }
}
