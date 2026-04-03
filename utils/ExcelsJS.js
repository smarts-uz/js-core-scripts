import path from 'path';
import fs from 'fs';
import XLSX from 'xlsx';

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';


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
