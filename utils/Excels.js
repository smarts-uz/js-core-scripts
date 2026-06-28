// utils.js
import fs, { existsSync } from 'fs';
import path from 'path';
let winax;
try {
  winax = (await import('winax')).default;
} catch (e) {
  // winax not available (likely binary not built)
}
import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';
import { Dates } from './Dates.js';
import { Word } from './Word.js';
import { Com } from './Com.js';

export class Excels {

  static checkWinax(methodName) {
    console.info(`[Excels.checkWinax] 🟢 Starting...`);
    if (!winax) {
      throw new Error(`${methodName}: Native automation (winax) is not available. This is often due to a Node.js version mismatch (Node 24 vs 22) or missing build tools.`);
    }
  }

  constructor(parameters) {
    // Constructor left empty as all methods are static
  }

  // === START EXCEL ===
  static openExcel(filePath) {
    console.info(`[Excels.openExcel] 🟢 Starting...`);
    try {
      const excel = new winax.Object('Excel.Application');
      excel.Visible = false;
      excel.DisplayAlerts = false;
      excel.AutomationSecurity = 1;
      const workbook = this.openWorkbookSafely(excel, filePath);
      return { excel, workbook };
    } catch (error) {
      throw new Error(`Failed to open Excel file: ${error.message}`);
    }
  }

  /**
   * Open a workbook, silently falling back to Excel's repair/extract-data
   * recovery modes when the file has problematic content (the same modes
   * Excel's "We found a problem… recover?" dialog offers).
   *
   * CorruptLoad: 0 = xlNormalLoad, 1 = xlRepairFile, 2 = xlExtractData.
   */
  static openWorkbookSafely(excelApp, filePath, opts = {}) {
    console.info(`[Excels.openWorkbookSafely] 🟢 Starting...`);
    // Delegates to the shared Com helper (repair/extract-data CorruptLoad fallback).
    return Com.openWorkbook(excelApp, filePath, opts);
  }

  static getProtectedPath(filename) {
    console.info(`[Excels.getProtectedPath] 🟢 Starting...`);
    const absPath = path.resolve(filename);
    const ext = path.extname(absPath);
    const stem = path.basename(absPath, ext);
    const protectSuffix = Yamls.getConfig('Excel.ProtectSuffix') || '';
    
    if (protectSuffix && stem.includes(protectSuffix)) {
      return absPath;
    }
    
    let newPath = path.join(path.dirname(absPath), `${stem}${protectSuffix}${ext}`);
    return Files.incrementFileName(newPath);
  }

  /**
   * Open a problem-content workbook via Excel COM in repair mode and
   * SaveAs a clean .xlsx to outputPath. Used as a fallback when other
   * parsers (e.g. SheetJS) can't read the original file.
   */
  static repairToFile(inputPath, outputPath) {
    console.info(`[Excels.repairToFile] 🟢 Starting...`);
    this.checkWinax('repairToFile');
    const absInput  = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    if (!fs.existsSync(absInput)) {
      throw new Error(`repairToFile: File not found: ${absInput}`);
    }

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      const workbook = this.openWorkbookSafely(excelApp, absInput);
      workbook.SaveAs(absOutput, 51); // xlOpenXMLWorkbook
      workbook.Close(false);
      console.log(`💾 Repaired copy saved: ${absOutput}`);
      return absOutput;
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }



  // === CONVERT .XLTX TO .XLSX ===
  /**
   * Convert a .xltx template file to a .xlsx workbook.
   * @param {string} inputPath  - Full path to the source .xltx file
   * @param {string} outputPath - Full path for the output .xlsx file
   * @returns {string} The resolved output path
   */
  static convertXltxToXlsx(inputPath, outputPath) {
    console.info(`[Excels.convertXltxToXlsx] 🟢 Starting...`);
    const absInput  = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    if (!fs.existsSync(absInput))
      throw new Error(`convertXltxToXlsx: Input file not found: ${absInput}`);

    console.log(`📂 Opening template: ${absInput}`);

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible        = false;
    excelApp.DisplayAlerts  = false;
    excelApp.AutomationSecurity = 1;

    try {
      // Open the .xltx — Excel opens it as a new unsaved workbook based on the template
      const workbook = this.openWorkbookSafely(excelApp, absInput);

      // xlOpenXMLWorkbook = 51  (.xlsx)
      workbook.SaveAs(absOutput, 51);
      console.log(`✅ Saved .xlsx to: ${absOutput}`);

      workbook.Close(false);
    } finally {
      excelApp.Quit();
      try { winax.release(excelApp); } catch (_) {}
    }

    return absOutput;
  }

  /**
   * Convert a .xltx template to .xlsx, placing the output beside the input
   * with the same base name but .xlsx extension.
   * @param {string} inputPath - Full path to the source .xltx file
   * @returns {string} The resolved output path
   */
  static convertXltxToXlsxAuto(inputPath) {
    console.info(`[Excels.convertXltxToXlsxAuto] 🟢 Starting...`);
    const absInput  = path.resolve(inputPath);
    const dir       = path.dirname(absInput);
    const base      = path.basename(absInput, path.extname(absInput));
    const absOutput = path.join(dir, `${base}.xlsx`);
    return this.convertXltxToXlsx(absInput, absOutput);
  }



  // === SCAN SUBFOLDERS OR TXT FILES ===
  static scanSubFolder(folderPath) {
    console.info(`[Excels.scanSubFolder] 🟢 Starting...`);


    // Check if folder exists and is a directory
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return []; // return empty array silently
    }

    return fs.readdirSync(folderPath)
      .map(f => path.join(folderPath, f))
      .filter(f => fs.statSync(f).isDirectory());
  }

  // === SCAN SUBFOLDERS OR TXT FILES ===
  static scanSubFilesTxt(folderPath) {
    console.info(`[Excels.scanSubFilesTxt] 🟢 Starting...`);


    // Check if folder exists and is a directory
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return []; // return empty array silently
    }

    return fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.txt'))
      .map(f => path.join(folderPath, f));
  }

  static processPricing(yamlData) {
    console.info(`[Excels.processPricing] 🟢 Starting...`);
    const found = this.findColumn('Pricings');
    let row = found.Row;

    let dateApp, amountApp

    if (existsSync(globalThis.folderPricings)) {

      const items = this.scanSubFilesTxt(globalThis.folderPricings);

      // Sort dateFiles
      items.sort((a, b) =>
        path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
      );

      // Process date files
      items.forEach(filePath => {
        const fileName = path.basename(filePath, '.txt');
        const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\s+([\d,]+)$/);
        if (!match) return;

        const date = match[1];
        dateApp = date
        let amount = match[2];
        // amount replace , and space
        amount = amount.replace(/,/g, '').replace(/\s/g, '');

        globalThis.excelSheet.Cells(row, found.Column).Value = date;
        globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

        row++;
      });

      // Process date files
      items.forEach(filePath => {
        const fileName = path.basename(filePath, '.txt');
        const match = fileName.match(/^ALL\s+([\d,]+)$/);
        if (!match) return;

        amountApp = match[1];
        // amount replace , and space
        amountApp = amountApp.replace(/,/g, '').replace(/\s/g, '');
      })

    }

    // consoler log amountApp, dateapp
    console.info(`amountApp: ${amountApp}`);
    console.info(`dateApp: ${dateApp}`);


    if (!amountApp)
      amountApp = yamlData.Price;

    console.info(`amountApp Last: ${amountApp}`);


    // Check if dateApp is defined

    if (dateApp) {
      console.info(`dateApp: ${dateApp}`);

      const lastDate = Dates.parseDMYExcel(dateApp);
      const futureDate = Dates.parseDMYExcel(yamlData.FutureDateExcel);

      if (lastDate < futureDate) {
        console.log(`lastDate < futureDate`);
        globalThis.excelSheet.Cells(row, found.Column).Value = yamlData.FutureDateExcel;
        globalThis.excelSheet.Cells(row, found.Column + 1).Value = amountApp;

      }

    } else {
      console.log(`dateApp not defined`);

      globalThis.excelSheet.Cells(row, found.Column).Value = yamlData.FutureDateExcel;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amountApp;

    }

  }

  // === PROCESS FOLDERS AND WRITE DATA ===
  static processFolders(folder, found) {
    console.info(`[Excels.processFolders] 🟢 Starting...`);
    let row = found.Row;

    const folderPath = path.join(globalThis.folderALL, folder);
    const dateFiles = this.scanSubFolder(folderPath);

    // Sort dateFiles
    dateFiles.sort((a, b) =>
      path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
    );

    // Process date files
    dateFiles.forEach(filePath => {
      const fileName = path.basename(filePath);
      const match = fileName.match(/^(\d{4}-\d{2}-\d{2})\s+([\d,]+)$/);
      if (!match) return;

      const date = match[1];
      let amount = match[2];
      // amount replace , and space
      amount = amount.replace(/,/g, '').replace(/\s/g, '');

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    });




  }


  static replaceInSheet(search, replace) {
    console.info(`[Excels.replaceInSheet] 🟢 Starting...`);
    let found = globalThis.excelSheet.Cells.Replace(
      search,          // What to find
      replace,                   // Replacement text
      2,                    // LookAt: 1=part, 2=whole
      2,                    // SearchOrder: 1=byRows, 2=byColumns
      false,                // MatchCase
      false,                // MatchByte
      false                 // SearchFormat
    );

    if (found) {
      console.log(`✅ Replaced  "${search}" with "${replace}" in Excel sheet "App"`);
    } else {
      console.warn(`⚠️ "${search}" not found in Excel sheet "App"`);
    }

    return found;
  }


  static findColumn(search) {
      console.info(`[failed.findColumn] 🟢 Starting...`);
    console.log(`🔍 Searching for "${search}" in Excel...`);

    const found = globalThis.excelSheet.Cells.Find(search);

    if (found) {
      console.log(`✅ Found "${search}". Row: ${found.Row}, Column: ${found.Column}`);
      console.log(`🔍 Columns: Column: ${found.Column}, Row: ${found.Row}`);
    } else {
      console.warn(`⚠️ "${search}" not found in Excel sheet "App"`);

    }

    return found;

  }





  static fileOpen(fileName) {
    console.info(`[Excels.fileOpen] 🟢 Starting...`);

    if (!fs.existsSync(fileName)) {
      Dialogs.warningBox(`File "${fileName}" not found.`, 'File Error');
    }

    // 3. Open Excel
    globalThis.excelApp = new winax.Object('Excel.Application');
    globalThis.excelApp.Visible = false;
    globalThis.excelApp.DisplayAlerts = false;

    globalThis.excelPid = globalThis.excelApp.ExecuteExcel4Macro('CALL("kernel32","GetCurrentProcessId","J")');
    console.log('Excel PID:', globalThis.excelPid);

    try {
      globalThis.excelWorkbook = Excels.openWorkbookSafely(globalThis.excelApp, fileName);
      globalThis.excelSheet = globalThis.excelWorkbook.Sheets('App');
    } catch (err) {

      if (globalThis.excelWorkbook) globalThis.excelWorkbook.Close(false);
      globalThis.excelApp.Quit();
      Dialogs.warningBox('Excel open failed for column detection.', 'Excel Error', 16);
    }

  }

  static fileSave() {
    console.info(`[Excels.fileSave] 🟢 Starting...`);

    globalThis.excelApp.CalculateFull();

    // Save and close
    try {
      globalThis.excelWorkbook.Save();
    } catch (err) {
      console.error('❌ Failed to save workbook:', err.message);
      Dialogs.warningBox(err.message, 'Excel Error', 16);
    }
  }


  static fileClose() {
    console.info(`[Excels.fileClose] 🟢 Starting...`);

    this.fileSave();

    // ✅ Close workbook (without saving)
    globalThis.excelWorkbook.Close(true);

    // ✅ Quit Excel
    globalThis.excelApp.Quit();

    // ✅ Release COM objects to prevent Excel.exe from staying in memory
    if (globalThis.excelWorkbook && globalThis.excelWorkbook.ReleaseComObject) globalThis.excelWorkbook.ReleaseComObject();
    if (globalThis.excelSheet && globalThis.excelSheet.ReleaseComObject) globalThis.excelSheet.ReleaseComObject();
    if (globalThis.excelApp && globalThis.excelApp.ReleaseComObject) globalThis.excelApp.ReleaseComObject();

    // ✅ Or just use `winax.release()` (if you have a lot of COM refs)
    winax.release(globalThis.excelApp);

    // kill excel process by pid
    try {
      process.kill(globalThis.excelPid);
      console.log(`Excel process with PID ${globalThis.excelPid} killed.`);
    } catch (err) {
      console.warn(`Failed to kill Excel PID ${globalThis.excelPid}:`, err.message);
    }
  }


  // Shared driver: walks all formula cells and reads/writes via the requested
  // Excel API (`apiName` = "Formula" | "Formula2" | "FormulaArray").
  static _replaceFormulaWith(apiName, filePath, searchStr, replaceStr, recalc, sheetFilter) {
    console.info(`[Excels._replaceFormulaWith] 🟢 Starting...`);
    const absPath = path.resolve(filePath);
    const label = `replace${apiName}`;

    if (!fs.existsSync(absPath)) {
      throw new Error(`${label}: File not found: ${absPath}`);
    }

    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
    console.log(`🚫 Excluded sheets: ${exclusions.join(', ')}`);

    this.checkWinax(label);
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1;

    // FormulaArray's getter doesn't expose the raw "@"; read via Formula2 for detection.
    const readApi = apiName === 'FormulaArray' ? 'Formula2' : apiName;

    try {
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });
      const sheetCount = workbook.Sheets.Count;

      console.log(`📄 Total sheets: ${sheetCount}`);

      const toProcess = [];
      const toSkip = [];

      for (let i = 1; i <= sheetCount; i++) {
        const name = workbook.Sheets(i).Name;
        if (sheetFilter && name !== sheetFilter) toSkip.push(name);
        else if (!sheetFilter && exclusions.includes(name)) toSkip.push(name);
        else toProcess.push(name);
      }

      console.log(`✅ Will process (${toProcess.length}): ${toProcess.join(', ')}`);
      console.log(`⏭️  Will skip    (${toSkip.length}): ${toSkip.join(', ')}`);

      let totalChanged = 0;
      let processedIdx = 0;

      for (let i = 1; i <= sheetCount; i++) {
        const sheet = workbook.Sheets(i);
        const sheetName = sheet.Name;

        if (sheetFilter && sheetName !== sheetFilter) continue;
        else if (!sheetFilter && exclusions.includes(sheetName)) continue;

        processedIdx++;
        console.log(`\n🔍 [${processedIdx}/${toProcess.length}] Processing sheet: "${sheetName}" via ${apiName}`);

        let formulaCells;
        try {
          formulaCells = sheet.UsedRange.SpecialCells(-4123); // xlCellTypeFormulas
        } catch (_) {
          console.log(`ℹ️  No formula cells in sheet "${sheetName}"`);
          continue;
        }

        const count = formulaCells.Count;
        let changedInSheet = 0;

        for (let c = 1; c <= count; c++) {
          if (c % 10 === 0 || c === count) {
            process.stdout.write(`\r      ⏳ Evaluating cells: ${c}/${count} (${Math.round((c / count) * 100)}%)`);
          }

          const cell = formulaCells.Item(c);

          let formula = '';
          try { formula = cell[readApi]; }
          catch (_) { try { formula = cell.Formula; } catch (__) {} }

          if (typeof formula === 'string' && formula.includes(searchStr)) {
            const newFormula = formula.split(searchStr).join(replaceStr);
            if (newFormula !== formula) {
              try {
                cell[apiName] = newFormula;
                changedInSheet++;
              } catch (e) {
                console.warn(`\n⚠️  ${apiName} write failed at ${sheetName}!${cell.Address}: ${e.message}`);
              }
            }
          }
        }

        if (count > 0) process.stdout.write('\n');

        totalChanged += changedInSheet;

        if (changedInSheet > 0) {
          console.log(`✅ Updated ${changedInSheet} formula cell(s) in "${sheetName}"`);
        } else {
          console.log(`ℹ️  No "${searchStr}" found in formulas on "${sheetName}"`);
        }
      }

      if (recalc) excelApp.CalculateFull();
      const newPath = Files.incrementFileName(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`\n💾 Workbook saved as: ${newPath}`);
      workbook.Close(false);
      console.log(`📊 Total updated formula cells: ${totalChanged}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  // Legacy single-cell formula API. Excel auto-inserts "@" (implicit intersection)
  // when a range reference appears in scalar context.
  static replaceFormula(filePath, searchStr = '@', replaceStr = '', recalc = false, sheetFilter = '') {
    console.info(`[Excels.replaceFormula] 🟢 Starting...`);
    return this._replaceFormulaWith('Formula', filePath, searchStr, replaceStr, recalc, sheetFilter);
  }

  // Dynamic-array-aware API. Preserves "@" you write literally, but Excel may still
  // re-render "@" at recalc/display time for non-array cells in scalar context.
  static replaceFormula2(filePath, searchStr = '@', replaceStr = '', recalc = false, sheetFilter = '') {
    console.info(`[Excels.replaceFormula2] 🟢 Starting...`);
    return this._replaceFormulaWith('Formula2', filePath, searchStr, replaceStr, recalc, sheetFilter);
  }

  // Writes as a true CSE/array formula (<f t="array" ref="..."/>). Use when you
  // need to strip "@" and have the cell evaluate in array context.
  static replaceFormulaArray(filePath, searchStr = '@', replaceStr = '', recalc = false, sheetFilter = '') {
    console.info(`[Excels.replaceFormulaArray] 🟢 Starting...`);
    return this._replaceFormulaWith('FormulaArray', filePath, searchStr, replaceStr, recalc, sheetFilter);
  }

    static replaceStandart(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
    console.info(`[Excels.replaceStandart] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`replaceStandart: File not found: ${absPath}`);
    }

    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
    console.log(`🚫 Excluded sheets: ${exclusions.join(', ')}`);

    this.checkWinax('replaceStandart');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1; // msoAutomationSecurityLow — bypass Protected View

    try {
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });
      const sheetCount = workbook.Sheets.Count;

      console.log(`📄 Total sheets: ${sheetCount}`);

      const toProcess = [];
      const toSkip = [];

      for (let i = 1; i <= sheetCount; i++) {
        const name = workbook.Sheets(i).Name;
        if (sheetFilter && name !== sheetFilter) toSkip.push(name);
        else if (!sheetFilter && exclusions.includes(name)) toSkip.push(name);
        else toProcess.push(name);
      }

      console.log(`✅ Will process (${toProcess.length}): ${toProcess.join(', ')}`);
      console.log(`⏭️  Will skip    (${toSkip.length}): ${toSkip.join(', ')}`);

      let processedIdx = 0;

      for (let i = 1; i <= sheetCount; i++) {
        const sheet = workbook.Sheets(i);
        const sheetName = sheet.Name;

        if (sheetFilter && sheetName !== sheetFilter) {
          continue;
        } else if (!sheetFilter && exclusions.includes(sheetName)) {
          continue;
        }

        processedIdx++;
        console.log(`\n🔍 [${processedIdx}/${toProcess.length}] Processing sheet: "${sheetName}"`);

        const replaced = sheet.Cells.Replace(
          searchStr,   // What
          replaceStr,    // Replacement
          1,     // LookAt: xlPart
          1,     // SearchOrder: xlByRows
          false, // MatchCase
          false, // MatchByte
          false  // SearchFormat
        );

        if (replaced) {
          console.log(`✅ Replace completed in "${sheetName}"`);
        } else {
          console.log(`ℹ️  No "${searchStr}" found in "${sheetName}"`);
        }
      }

      if (recalc) excelApp.CalculateFull();
      const newPath = Files.incrementFileName(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`\n💾 Workbook saved as: ${newPath}`);
      workbook.Close(false);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
    }

  static replaceFormulaAll(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
    console.info(`[Excels.replaceFormulaAll] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`replaceFormulaAll: File not found: ${absPath}`);
    }

    const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
    console.log(`🚫 Excluded sheets: ${exclusions.join(', ')}`);

    this.checkWinax('replaceFormulaAll');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1; // msoAutomationSecurityLow — bypass Protected View

    try {
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });
      const sheetCount = workbook.Sheets.Count;

      console.log(`📄 Total sheets: ${sheetCount}`);

      const toProcess = [];
      const toSkip = [];

      for (let i = 1; i <= sheetCount; i++) {
        const name = workbook.Sheets(i).Name;
        if (sheetFilter && name !== sheetFilter) toSkip.push(name);
        else if (!sheetFilter && exclusions.includes(name)) toSkip.push(name);
        else toProcess.push(name);
      }

      console.log(`✅ Will process (${toProcess.length}): ${toProcess.join(', ')}`);
      console.log(`⏭️  Will skip    (${toSkip.length}): ${toSkip.join(', ')}`);

      let totalChanged = 0;
      let processedIdx = 0;

      for (let i = 1; i <= sheetCount; i++) {
        const sheet = workbook.Sheets(i);
        const sheetName = sheet.Name;

        if (sheetFilter && sheetName !== sheetFilter) continue;
        else if (!sheetFilter && exclusions.includes(sheetName)) continue;

        processedIdx++;
        console.log(`\n🔍 [${processedIdx}/${toProcess.length}] Processing sheet: "${sheetName}"`);

        let changedInSheet = 0;

        let formulaCells;
        try {
          formulaCells = sheet.UsedRange.SpecialCells(23); // xlCellTypeFormulas = 23
        } catch (_) {
          formulaCells = null; // no formula cells on this sheet
        }

        if (formulaCells) {
          const areas = formulaCells.Areas;
          const areaCount = areas.Count;
          for (let a = 1; a <= areaCount; a++) {
            const area = areas(a);
            const cellCount = area.Count;
            for (let ci = 1; ci <= cellCount; ci++) {
              const cell = area.Item(ci);
              const formula = cell.Formula ? String(cell.Formula) : '';
              if (formula.startsWith('=') && formula.includes(searchStr)) {
                const newFormula = formula.split(searchStr).join(replaceStr);
                if (newFormula !== formula) {
                  cell.Formula = newFormula;
                  changedInSheet++;
                }
              }
            }
          }
        }

        totalChanged += changedInSheet;

        if (changedInSheet > 0) {
          console.log(`✅ Updated ${changedInSheet} formula cell(s) in "${sheetName}"`);
        } else {
          console.log(`ℹ️  No "${searchStr}" found in formulas on "${sheetName}"`);
        }
      }

      if (recalc) excelApp.CalculateFull();
      const newPath = Files.incrementFileName(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`\n💾 Workbook saved as: ${newPath}`);
      workbook.Close(false);
      console.log(`📊 Total updated formula cells: ${totalChanged}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  static recalculate(filePath, sheetFilter = '') {
    console.info(`[Excels.recalculate] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`recalculate: File not found: ${absPath}`);
    }

    this.checkWinax('recalculate');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1; // msoAutomationSecurityLow — bypass Protected View

    try {
      console.log(`📂 Opening workbook for Recalc: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      if (sheetFilter) {
        console.log(`🔄 Recalculating Sheet: "${sheetFilter}"...`);
        workbook.Sheets(sheetFilter).Calculate();
      } else {
        console.log(`🔄 Recalculating Full...`);
        excelApp.CalculateFull();
      }

      const newPath = Files.incrementFileName(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`\n💾 Workbook saved as: ${newPath}`);
      workbook.Close(false);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  static changeFont(filePath, fontName = 'Arial', sheetFilter = '') {
    console.info(`[Excels.changeFont] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`changeFont: File not found: ${absPath}`);
    }

    this.checkWinax('changeFont');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1; // msoAutomationSecurityLow — bypass Protected View

    try {
      console.log(`📂 Opening workbook for changing font: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      if (sheetFilter) {
        console.log(`🔄 Changing font to "${fontName}" in Sheet: "${sheetFilter}"...`);
        workbook.Sheets(sheetFilter).Cells.Font.Name = fontName;
      } else {
        console.log(`🔄 Changing font to "${fontName}" in all sheets...`);
        const sheetCount = workbook.Sheets.Count;
        for (let i = 1; i <= sheetCount; i++) {
          workbook.Sheets(i).Cells.Font.Name = fontName;
        }
      }

      const newPath = Files.incrementFileName(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`\n💾 Workbook saved as: ${newPath}`);
      workbook.Close(false);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  static generate(ymlFile) {
    console.info(`[Excels.generate] 🟢 Starting...`);

    Word.initFolders(ymlFile)

    Files.mkdirIfNotExists(globalThis.folderActReco);

    // Load YAML data
    let yamlData = Yamls.loadYamlWithDeps(ymlFile);
    console.log(yamlData, 'yamlData');

    const prepayMonth = Yamls.getPrepayMonth(yamlData);

    const templateFileName = Files.getBaseName(Yamls.getConfig('Templates.Excel'), '.xlsx');
    const dateString = `${new Intl.DateTimeFormat('en-CA').format(new Date())}`;

    const actRecoFile = `ActReco, ${yamlData.ComName}, ${templateFileName}, ${dateString}, PrePay-${prepayMonth}.xlsx`;
    console.log(`New file name: ${actRecoFile}`);

    const newFilePath = path.join(globalThis.folderActReco, actRecoFile);
    console.log(`New file path: ${newFilePath}`);

    // Attempt to copy the file
    Files.copyFileWithRetry(Yamls.getConfig('Templates.Excel'), newFilePath);

    // 1. Read the list from Excel.txt
    const cellsFilePath = path.join(Files.currentDir(), 'Excel.txt');
    if (!fs.existsSync(cellsFilePath))
      Dialogs.warningBox('Excel.txt not found', 'Error');


    // Example usage:
    const cellNames = Files.readLines(cellsFilePath);
    console.log('Cell names:', cellNames.join(', '), 'cellNames');

    this.fileOpen(newFilePath);

    this.processPricing(yamlData);

    for (const folderName of cellNames) {
      const found = this.findColumn(folderName);

      const folderPath = path.join(globalThis.folderALL, folderName)
      if (fs.existsSync(folderPath)) {
        this.processFolders(folderName, found);

      } else {
        console.warn(`🚫 Folder "${folderPath}" not found`);
        this.replaceInSheet(`{${folderName}}`, '');
      }

    }



    // Replace {KEY} placeholders
    for (const key of Object.keys(yamlData)) {

      const value = yamlData[key];

      const placeholder = `{${key}}`;

      this.replaceInSheet(placeholder, value);
    }

    this.fileClose();

  }

  static protectFile(filename, password) {
    console.info(`[Excels.protectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`protectFile: File not found: ${absPath}`);
    }

    this.checkWinax('protectFile');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening workbook for protection: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      if (workbook.HasPassword) {
        console.warn(`⚠️ Workbook is already protected: ${absPath}. Skipping.`);
        workbook.Close(false);
        return absPath;
      }

      console.log(`🔒 Protecting workbook with password...`);
      workbook.Password = password;

      const newPath = this.getProtectedPath(absPath);
      workbook.SaveAs(newPath, 51); // 51 = xlOpenXMLWorkbook (.xlsx)
      console.log(`💾 Protected workbook saved as: ${newPath}`);
      workbook.Close(false);

      return newPath;
    } catch (error) {
      throw new Error(`protectFile failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  static unProtectFile(filename, password) {
    console.info(`[Excels.unProtectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectFile: File not found: ${absPath}`);
    }

    this.checkWinax('unProtectFile');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening protected workbook: ${absPath}`);
      // 5th argument of Workbooks.Open is the password
      const workbook = excelApp.Workbooks.Open(absPath, 0, false, null, password);

      if (!workbook.HasPassword) {
        console.warn(`⚠️ Workbook is not protected: ${absPath}.`);
        Dialogs.warningBox('File is not protected', 'Unprotect File');
        workbook.Close(false);
        return;
      }

      console.log(`🔓 Unprotecting workbook...`);
      // Clearing the password unprotects the workbook
      workbook.Password = '';

      workbook.Save();
      console.log(`💾 Unprotected workbook saved: ${absPath}`);
      workbook.Close(false);
    } catch (error) {
      throw new Error(`unProtectFile failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Prompt the user for a password then protect the workbook.
   * @param {string} filename - Path to the .xlsx file.
   */
  static protectFileAsk(filename) {
    console.info(`[Excels.protectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to protect the workbook:', 'Protect Workbook');
    if (password === null) {
      console.log('protectFileAsk: cancelled by user.');
      return;
    }
    this.protectFile(filename, password);
  }

  /**
   * Prompt the user for a password then unprotect the workbook.
   * @param {string} filename - Path to the .xlsx file.
   */
  static unProtectFileAsk(filename) {
    console.info(`[Excels.unProtectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to unprotect the workbook:', 'Unprotect Workbook');
    if (password === null) {
      console.log('unProtectFileAsk: cancelled by user.');
      return;
    }
    this.unProtectFile(filename, password);
  }

  static protectSheet(filename, password) {
    console.info(`[Excels.protectSheet] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`protectSheet: File not found: ${absPath}`);
    }

    this.checkWinax('protectSheet');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening workbook for sheet protection: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      let alreadyProtected = false;
      const sheetCount = workbook.Worksheets.Count;
      for (let i = 1; i <= sheetCount; i++) {
        if (workbook.Worksheets(i).ProtectContents) {
          alreadyProtected = true;
          break;
        }
      }

      if (alreadyProtected) {
        console.warn(`⚠️ Worksheet is already protected: ${absPath}. Skipping.`);
        workbook.Close(false);
        return absPath;
      }

      console.log(`🔒 Protecting all worksheets with password...`);
      for (let i = 1; i <= sheetCount; i++) {
        const sheet = workbook.Worksheets(i);
        // Protect(Password, DrawingObjects, Contents, Scenarios, UserInterfaceOnly, 
        //         AllowFormattingCells, AllowFormattingColumns, AllowFormattingRows, 
        //         AllowInsertingColumns, AllowInsertingRows, AllowInsertingHyperlinks, 
        //         AllowDeletingColumns, AllowDeletingRows, AllowSorting, AllowFiltering, 
        //         AllowUsingPivotTables)
        sheet.Protect(
          password, // Password
          true,     // DrawingObjects
          true,     // Contents
          true,     // Scenarios
          false,    // UserInterfaceOnly
          false,    // AllowFormattingCells
          false,    // AllowFormattingColumns
          false,    // AllowFormattingRows
          false,    // AllowInsertingColumns
          false,    // AllowInsertingRows
          false,    // AllowInsertingHyperlinks
          false,    // AllowDeletingColumns
          false,    // AllowDeletingRows
          true,     // AllowSorting
          true,     // AllowFiltering
          true      // AllowUsingPivotTables
        );
      }

      const newPath = this.getProtectedPath(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`💾 Protected worksheets saved as: ${newPath}`);
      workbook.Close(false);

      return newPath;
    } catch (error) {
      throw new Error(`protectSheet failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  static unProtectSheet(filename, password) {
    console.info(`[Excels.unProtectSheet] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectSheet: File not found: ${absPath}`);
    }

    this.checkWinax('unProtectSheet');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    // Worksheets.Unprotect does not take password via Workbooks.Open since the workbook isn't necessarily protected.
    // We open it normally, then unprotect sheets
    try {
      console.log(`📂 Opening workbook to unprotect sheets: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      let anyProtected = false;
      const sheetCount = workbook.Worksheets.Count;
      for (let i = 1; i <= sheetCount; i++) {
        if (workbook.Worksheets(i).ProtectContents) {
          anyProtected = true;
          break;
        }
      }

      if (!anyProtected) {
        console.warn(`⚠️ Worksheets are not protected: ${absPath}.`);
        Dialogs.warningBox('File is not protected', 'Unprotect Worksheets');
        workbook.Close(false);
        return;
      }

      console.log(`🔓 Unprotecting all worksheets...`);
      for (let i = 1; i <= sheetCount; i++) {
        const sheet = workbook.Worksheets(i);
        sheet.Unprotect(password);
      }

      workbook.Save();
      console.log(`💾 Unprotected worksheets saved: ${absPath}`);
      workbook.Close(false);
    } catch (error) {
      throw new Error(`unProtectSheet failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Prompt the user for a password then protect all worksheets.
   * @param {string} filename - Path to the .xlsx file.
   */
  static protectSheetAsk(filename) {
    console.info(`[Excels.protectSheetAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to protect all worksheets:', 'Protect Worksheets');
    if (password === null) {
      console.log('protectSheetAsk: cancelled by user.');
      return;
    }
    this.protectSheet(filename, password);
  }

  /**
   * Prompt the user for a password then unprotect all worksheets.
   * @param {string} filename - Path to the .xlsx file.
   */
  static unProtectSheetAsk(filename) {
    console.info(`[Excels.unProtectSheetAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to unprotect all worksheets:', 'Unprotect Worksheets');
    if (password === null) {
      console.log('unProtectSheetAsk: cancelled by user.');
      return;
    }
    this.unProtectSheet(filename, password);
  }

  static mergeFiles(files, mergedName) {
    console.info(`[Excels.mergeFiles] 🟢 Starting...`);
    if (!files || files.length === 0) {
      throw new Error(`mergeFiles: No input files provided.`);
    }

    this.checkWinax('mergeFiles');

    // 1. Determine target file name
    const firstFileDir = path.dirname(path.resolve(files[0]));
    let finalMergedPath;

    if (mergedName) {
       if (path.isAbsolute(mergedName)) {
           finalMergedPath = mergedName;
       } else {
           finalMergedPath = path.join(firstFileDir, mergedName.endsWith('.xlsx') ? mergedName : mergedName + '.xlsx');
       }
    } else {
       const parentFolderName = path.basename(firstFileDir);
       finalMergedPath = path.join(firstFileDir, parentFolderName + '.xlsx');
    }

    finalMergedPath = Files.incrementFileName(finalMergedPath);

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Creating merged file: ${finalMergedPath}`);
      const targetWb = excelApp.Workbooks.Add();
      const initialSheetCount = targetWb.Sheets.Count;

      const existingSheetNames = new Set();
      // Record initial sheets to prevent conflict, we will delete them later
      for (let i = 1; i <= initialSheetCount; i++) {
         existingSheetNames.add(targetWb.Sheets(i).Name);
      }

      for (let i = 0; i < files.length; i++) {
        const file = path.resolve(files[i]);
        if (!fs.existsSync(file)) {
            console.warn(`⚠️ mergeFiles: File not found, skipping: ${file}`);
            continue;
        }

        console.log(`📄 Merging ${i + 1}/${files.length}: ${file}`);
        const sourceWb = this.openWorkbookSafely(excelApp, file, { updateLinks: 0, readOnly: true });

        try {
          const sheetCount = sourceWb.Sheets.Count;
          for (let s = 1; s <= sheetCount; s++) {
             const sheet = sourceWb.Sheets(s);
             let baseName = sheet.Name;
             let finalName = baseName;
             let suffix = 1;

             while (existingSheetNames.has(finalName)) {
               const suffixStr = `_${suffix}`;
               const allowedBaseLen = 31 - suffixStr.length;
               finalName = baseName.substring(0, allowedBaseLen) + suffixStr;
               suffix++;
             }

             existingSheetNames.add(finalName);
             
             // Copy after the last sheet in targetWb
             sheet.Copy(null, targetWb.Sheets(targetWb.Sheets.Count));
             
             const newlyCopiedSheet = targetWb.Sheets(targetWb.Sheets.Count);
             newlyCopiedSheet.Name = finalName;
          }
        } catch (err) {
          console.warn(`❌ Error copying sheets from ${file}: ${err.message}`);
        } finally {
          sourceWb.Close(false);
        }
      }

      // Delete initial blank sheets
      for (let i = 1; i <= initialSheetCount; i++) {
         targetWb.Sheets(1).Delete();
      }

      targetWb.SaveAs(finalMergedPath, 51);
      console.log(`\n✅ Merged workbook saved successfully as: ${finalMergedPath}`);
      targetWb.Close(false);

      return finalMergedPath;
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Merges workbooks folder-by-folder: from each given folder it picks the
   * latest .xlsx by modification time (skipping ~$ temp files), then merges that
   * set via Excels.mergeFiles (every sheet copied, name collisions suffixed).
   * Mirrors Word.mergeFolder / PowerPoints.mergeFolder.
   *
   * @param {string[]} folderPaths - One or more folders, each contributing its newest .xlsx.
   * @param {string} [mergedName] - Optional output name/path passed through to mergeFiles.
   * @returns {string} The resolved path to the saved merged workbook.
   */
  static mergeFolder(folderPaths, mergedName = '') {
    console.info(`[Excels.mergeFolder] 🟢 Starting...`);
    if (!folderPaths || folderPaths.length === 0) {
      throw new Error('mergeFolder: No folders provided.');
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
        if (!file.toLowerCase().endsWith('.xlsx') || file.startsWith('~$')) {
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
        console.warn(`⚠️ No valid .xlsx files found in: ${resolvedFolder}`);
      }
    }

    if (latestFiles.length === 0) {
      throw new Error('mergeFolder: No .xlsx files found across the provided folders.');
    }

    console.log(`📑 Found ${latestFiles.length} latest file(s) to merge:\n${latestFiles.join('\n')}`);
    return this.mergeFiles(latestFiles, mergedName);
  }

  // Excel Visible constants:
  //   -1 = xlSheetVisible
  //    0 = xlSheetHidden      (hidden, but user can show via right-click)
  //    2 = xlSheetVeryHidden  (hidden, cannot be shown via UI — only programmatically)

  /**
   * Hide a worksheet in the given workbook file.
   * @param {string} filename    - Path to the .xlsx file.
   * @param {string} sheetName   - Name of the sheet to hide.
   * @param {boolean} veryHidden - true → xlSheetVeryHidden (2), false → xlSheetHidden (0).
   */
  static hide(filename, sheetName = ['ALL'], veryHidden = true) {
    console.info(`[Excels.hide] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`hide: File not found: ${absPath}`);
    }

    this.checkWinax('hide');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening workbook for hide: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      const sheetsToHide = Array.isArray(sheetName) ? sheetName : [sheetName];

      for (const name of sheetsToHide) {
        const sheet = workbook.Sheets(name);
        if (!sheet) {
          console.warn(`⚠️ hide: Sheet "${name}" not found in ${absPath}. Skipping.`);
          continue;
        }

        // xlSheetVeryHidden = 2, xlSheetHidden = 0
        const visibleValue = veryHidden ? 2 : 0;
        sheet.Visible = visibleValue;

        const label = veryHidden ? 'xlSheetVeryHidden' : 'xlSheetHidden';
        console.log(`🙈 Sheet "${name}" hidden as ${label}`);
      }

      const newPath = this.getProtectedPath(absPath);
      workbook.SaveAs(newPath, 51);
      console.log(`💾 Saved: ${newPath}`);
      workbook.Close(false);
      return newPath;
    } catch (error) {
      throw new Error(`hide failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Unhide (make visible) a worksheet in the given workbook file.
   * @param {string} filename  - Path to the .xlsx file.
   * @param {string} sheetName - Name of the sheet to unhide.
   */
  static unhide(filename, sheetName = ['ALL']) {
    console.info(`[Excels.unhide] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unhide: File not found: ${absPath}`);
    }

    this.checkWinax('unhide');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening workbook for unhide: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: false });

      const sheetsToUnhide = Array.isArray(sheetName) ? sheetName : [sheetName];

      for (const name of sheetsToUnhide) {
        const sheet = workbook.Sheets(name);
        if (!sheet) {
          console.warn(`⚠️ unhide: Sheet "${name}" not found in ${absPath}. Skipping.`);
          continue;
        }

        // xlSheetVisible = -1
        sheet.Visible = -1;
        console.log(`👁️  Sheet "${name}" is now visible`);
      }

      workbook.Save();
      console.log(`💾 Saved: ${absPath}`);
      workbook.Close(false);
    } catch (error) {
      throw new Error(`unhide failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Check whether a worksheet is hidden (or very-hidden).
   * @param {string} filename  - Path to the .xlsx file.
   * @param {string} sheetName - Name of the sheet to inspect.
   * @returns {'visible'|'hidden'|'veryHidden'} Visibility state.
   */
  static isHidden(filename, sheetName) {
    console.info(`[Excels.isHidden] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`isHidden: File not found: ${absPath}`);
    }

    this.checkWinax('isHidden');
    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.AutomationSecurity = 1;

    try {
      console.log(`📂 Opening workbook for isHidden: ${absPath}`);
      const workbook = this.openWorkbookSafely(excelApp, absPath, { updateLinks: 0, readOnly: true });

      const sheet = workbook.Sheets(sheetName);
      if (!sheet) {
        throw new Error(`isHidden: Sheet "${sheetName}" not found in ${absPath}`);
      }

      const visibleValue = sheet.Visible;
      workbook.Close(false);

      // -1 = xlSheetVisible, 0 = xlSheetHidden, 2 = xlSheetVeryHidden
      if (visibleValue === -1) {
        console.log(`👁️  Sheet "${sheetName}" → visible`);
        return 'visible';
      } else if (visibleValue === 2) {
        console.log(`🙈 Sheet "${sheetName}" → veryHidden`);
        return 'veryHidden';
      } else {
        console.log(`🙈 Sheet "${sheetName}" → hidden`);
        return 'hidden';
      }
    } catch (error) {
      throw new Error(`isHidden failed: ${error.message}`);
    } finally {
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
    }
  }

  /**
   * Hide a worksheet and then protect all worksheets.
   * @param {string} filename    - Path to the .xlsx file.
   * @param {string} password    - Password to protect the worksheets.
   * @param {string|string[]} sheetName   - Name(s) of the sheet(s) to hide.
   * @param {boolean} veryHidden - true → xlSheetVeryHidden (2), false → xlSheetHidden (0).
   * @returns {string} The path to the protected file.
   */
  static hideProtectSheet(filename, password, sheetName = ['ALL'], veryHidden = true) {
    console.info(`[Excels.hideProtectSheet] 🟢 Starting...`);
    const hiddenFile = this.hide(filename, sheetName, veryHidden);
    return this.protectSheet(hiddenFile, password);
  }

  /**
   * Prompt the user for password, then hide and protect.
   * @param {string} filename - Path to the .xlsx file.
   * @param {string|string[]} sheetName - Name(s) of the sheet(s) to hide.
   */
  static hideProtectSheetAsk(filename, sheetName = ['ALL']) {
    console.info(`[Excels.hideProtectSheetAsk] 🟢 Starting...`);
    const sheetsStr = Array.isArray(sheetName) ? sheetName.join(', ') : sheetName;
    const password = Dialogs.inputBox(`Enter password to protect all worksheets (hiding "${sheetsStr}"):`, 'Protect Worksheets');
    if (password === null) {
      console.log('hideProtectSheetAsk: cancelled by user (password).');
      return;
    }
    return this.hideProtectSheet(filename, password, sheetName);
  }

  /**
   * Unprotect all worksheets and then unhide a worksheet.
   * @param {string} filename  - Path to the .xlsx file.
   * @param {string} password  - Password to unprotect the worksheets.
   * @param {string|string[]} sheetName - Name(s) of the sheet(s) to unhide.
   */
  static unHideUnProtectSheet(filename, password, sheetName = ['ALL']) {
    console.info(`[Excels.unHideUnProtectSheet] 🟢 Starting...`);
    this.unhide(filename, sheetName);
    this.unProtectSheet(filename, password);
  }

  /**
   * Prompt the user for password, then unprotect and unhide.
   * @param {string} filename - Path to the .xlsx file.
   * @param {string|string[]} sheetName - Name(s) of the sheet(s) to unhide.
   */
  static unHideUnProtectSheetAsk(filename, sheetName = ['ALL']) {
    console.info(`[Excels.unHideUnProtectSheetAsk] 🟢 Starting...`);
    const sheetsStr = Array.isArray(sheetName) ? sheetName.join(', ') : sheetName;
    const password = Dialogs.inputBox(`Enter password to unprotect all worksheets (unhiding "${sheetsStr}"):`, 'Unprotect & Unhide');
    if (password === null) {
      console.log('unHideUnProtectSheetAsk: cancelled by user (password).');
      return;
    }
    this.unHideUnProtectSheet(filename, password, sheetName);
  }

}