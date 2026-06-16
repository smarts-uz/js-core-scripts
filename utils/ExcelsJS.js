import path from 'path';
import os from 'os';
import fs from 'fs';
import XLSX from 'xlsx';

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Excels } from './Excels.js';


export class ExcelsJS {

  /**
   * Read a workbook, silently falling back through progressively more
   * tolerant strategies when the file has problematic content:
   *
   *   1. Normal SheetJS read with the requested options.
   *   2. Lenient SheetJS read (WTF=true, no styles, no type coercion).
   *   3. Repair via Excel COM (if winax is available): open with
   *      CorruptLoad=xlRepairFile, SaveAs a temp .xlsx, then read that.
   */
  static readWorkbookSafely(filePath, opts = {}) {
    console.info(`[ExcelsJS.readWorkbookSafely] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    try {
      return XLSX.readFile(absPath, opts);
    } catch (err) {
      console.warn(`↩️  SheetJS normal read failed: ${err.message}. Retrying in lenient mode…`);
    }

    try {
      return XLSX.readFile(absPath, { ...opts, WTF: true, cellStyles: false, sheetStubs: false });
    } catch (err) {
      console.warn(`↩️  SheetJS lenient read failed: ${err.message}. Falling back to Excel repair…`);
    }

    let repairedPath;
    try {
      const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'xlsx-repair-'));
      const tmpFile = path.join(tmpDir, `${path.basename(absPath, path.extname(absPath))}.repaired.xlsx`);
      Excels.repairToFile(absPath, tmpFile);
      repairedPath = tmpFile;
      console.warn(`⚠️  Using Excel-repaired copy: ${repairedPath}`);
      return XLSX.readFile(repairedPath, opts);
    } catch (err) {
      throw new Error(`ExcelsJS.readWorkbookSafely: Unable to read "${absPath}" even after Excel repair. Last error: ${err.message}`);
    } finally {
      if (repairedPath) {
        try { fs.unlinkSync(repairedPath); } catch (_) {}
        try { fs.rmdirSync(path.dirname(repairedPath)); } catch (_) {}
      }
    }
  }

  static replaceFormula(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
    console.info(`[ExcelsJS.replaceFormula] 🟢 Starting...`);
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`ExcelsJS.replaceFormula: File not found: ${absPath}`);
    }

    console.log(`📂 Reading Workbook (XLSX): ${absPath}`);
    const workbook = this.readWorkbookSafely(absPath, { cellFormula: true });
    const sheetNames = workbook.SheetNames;
    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);

    const sheetCount = sheetNames.length;
    console.log(`📄 Total sheets (XLSX): ${sheetCount}`);

    const toProcess = [];
    const toSkip = [];

    for (const name of sheetNames) {
      if (sheetFilter && name !== sheetFilter) toSkip.push(name);
      else if (!sheetFilter && exclusions.includes(name)) toSkip.push(name);
      else toProcess.push(name);
    }

    console.log(`✅ Will process (${toProcess.length}): ${toProcess.join(', ')}`);
    console.log(`⏭️  Will skip    (${toSkip.length}): ${toSkip.join(', ')}`);

    let totalUpdated = 0;

    for (let i = 0; i < sheetCount; i++) {
        const sheetName = sheetNames[i];
        if (!toProcess.includes(sheetName)) continue;

        console.log(`\n🔍 [${i+1}/${sheetCount}] Processing sheet (XLSX): "${sheetName}"`);
        const ws = workbook.Sheets[sheetName];
        let sheetUpdated = 0;

        for (const cellAddr in ws) {
            if (cellAddr.startsWith('!')) continue;
            const cell = ws[cellAddr];
            if (cell && cell.f) {
                const oldFormula = cell.f;
                cell.f = cell.f.replace(searchStr, replaceStr);
                if (oldFormula !== cell.f) {
                    sheetUpdated++;
                }
            }
        }
        totalUpdated += sheetUpdated;
        if (sheetUpdated > 0) {
            console.log(`📑 Updated ${sheetUpdated} formulas in "${sheetName}"`);
        }
    }

    if (recalc) {
      console.log(`📑 Setting FullCalcOnLoad flag for SheetJS recalc...`);
      if (!workbook.Workbook) workbook.Workbook = {};
      if (!workbook.Workbook.CalculationProperties) workbook.Workbook.CalculationProperties = {};
      workbook.Workbook.CalculationProperties.fullCalcOnLoad = true;
    }

    const newPath = Files.incrementFileName(absPath);
    XLSX.writeFile(workbook, newPath);
    console.log(`\n💾 Workbook saved as (XLSX): ${newPath}`);

    return newPath;
  }
}
