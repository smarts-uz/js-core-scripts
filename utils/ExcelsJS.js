import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Excels } from './Excels.js';

export class ExcelsJS {
  static replaceFormula(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
    const absPath = path.resolve(filePath);
    if (!fs.existsSync(absPath)) {
      throw new Error(`ExcelsJS.replaceFormula: File not found: ${absPath}`);
    }

    console.log(`📂 Reading Workbook (XLSX): ${absPath}`);
    const workbook = XLSX.readFile(absPath, { cellFormula: true });
    const sheetNames = workbook.SheetNames;
    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);

    let totalUpdated = 0;

    for (const sheetName of sheetNames) {
      if (sheetFilter && sheetName !== sheetFilter) continue;
      if (!sheetFilter && exclusions.includes(sheetName)) continue;

      console.log(`🔍 Processing sheet (XLSX): "${sheetName}"`);
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
        console.log(`✅ Updated ${sheetUpdated} formulas in "${sheetName}"`);
      }
    }

    const newPath = Files.incrementFileName(absPath);
    XLSX.writeFile(workbook, newPath);
    console.log(`\n💾 Workbook saved as (XLSX): ${newPath}`);
    console.log(`📊 Total updated formulas: ${totalUpdated}`);

    if (recalc) {
      console.log(`🔄 Recalculating...`);
      Excels.recalculate(newPath);
    }

    return newPath;
  }
}
