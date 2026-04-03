// utils.js
import fs, { existsSync } from 'fs';
import path from 'path';
let winax;
try {
  winax = (await import('winax')).default;
} catch (e) {
  // winax not available (likely binary not built)
}
import { execSync } from 'child_process';
import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';
import { Dates } from './Dates.js';
import { Word } from './Word.js';


export class Excels {
  constructor(parameters) {
    // Constructor left empty as all methods are static
  }

  // === START EXCEL ===
  static openExcel(filePath) {
    try {
      const excel = new winax.Object('Excel.Application');
      excel.Visible = false;
      const workbook = excel.Workbooks.Open(filePath);
      return { excel, workbook };
    } catch (error) {
      throw new Error(`Failed to open Excel file: ${error.message}`);
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
    const absInput  = path.resolve(inputPath);
    const absOutput = path.resolve(outputPath);

    if (!fs.existsSync(absInput))
      throw new Error(`convertXltxToXlsx: Input file not found: ${absInput}`);

    console.log(`📂 Opening template: ${absInput}`);

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible        = false;
    excelApp.DisplayAlerts  = false;

    try {
      // Open the .xltx — Excel opens it as a new unsaved workbook based on the template
      const workbook = excelApp.Workbooks.Open(absInput);

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
    const absInput  = path.resolve(inputPath);
    const dir       = path.dirname(absInput);
    const base      = path.basename(absInput, path.extname(absInput));
    const absOutput = path.join(dir, `${base}.xlsx`);
    return this.convertXltxToXlsx(absInput, absOutput);
  }



  // === SCAN SUBFOLDERS OR TXT FILES ===
  static scanSubFolder(folderPath) {


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


    // Check if folder exists and is a directory
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      return []; // return empty array silently
    }

    return fs.readdirSync(folderPath)
      .filter(f => f.endsWith('.txt'))
      .map(f => path.join(folderPath, f));
  }

  static processPricing(yamlData) {
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
      globalThis.excelWorkbook = globalThis.excelApp.Workbooks.Open(fileName);
      globalThis.excelSheet = globalThis.excelWorkbook.Sheets('App');
    } catch (err) {

      if (globalThis.excelWorkbook) globalThis.excelWorkbook.Close(false);
      globalThis.excelApp.Quit();
      Dialogs.warningBox('Excel open failed for column detection.', 'Excel Error', 16);
    }

  }

  static fileSave() {

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


  static replaceFormula(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`replaceFormula_ByFormulaCells: File not found: ${absPath}`);
  }

  const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
  console.log(`🚫 Excluded sheets: ${exclusions.join(', ')}`);

  const excelApp = new winax.Object('Excel.Application');
  excelApp.Visible = false;
  excelApp.DisplayAlerts = false;
  excelApp.ScreenUpdating = false;
  excelApp.EnableEvents = false;

  try {
    const workbook = excelApp.Workbooks.Open(absPath);
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

    for (let i = 1; i <= sheetCount; i++) {
      const sheet = workbook.Sheets(i);
      const sheetName = sheet.Name;

      if (sheetFilter && sheetName !== sheetFilter) {
        continue;
      } else if (!sheetFilter && exclusions.includes(sheetName)) {
        continue;
      }

      console.log(`\n🔍 [${i}/${sheetCount}] Processing sheet: "${sheetName}"`);

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
        const formula = cell.Formula;

        if (typeof formula === 'string' && formula.includes(searchStr)) {
          const newFormula = formula.split(searchStr).join(replaceStr);
          if (newFormula !== formula) {
            cell.Formula = newFormula;
            changedInSheet++;
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


  static replaceStandart(filePath, searchStr = '@', replaceStr = '', recalc = true, sheetFilter = '') {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    throw new Error(`replaceStandart: File not found: ${absPath}`);
  }

  const exclusions = Yamls.getConfig('Excel.ExcludedSheets', 'array', []);
  console.log(`🚫 Excluded sheets: ${exclusions.join(', ')}`);

  const excelApp = new winax.Object('Excel.Application');
  excelApp.Visible = false;
  excelApp.DisplayAlerts = false;
  excelApp.ScreenUpdating = false;
  excelApp.EnableEvents = false;

  try {
    const workbook = excelApp.Workbooks.Open(absPath);
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

    for (let i = 1; i <= sheetCount; i++) {
      const sheet = workbook.Sheets(i);
      const sheetName = sheet.Name;

      if (sheetFilter && sheetName !== sheetFilter) {
        continue;
      } else if (!sheetFilter && exclusions.includes(sheetName)) {
        continue;
      }

      console.log(`\n🔍 [${i}/${sheetCount}] Processing sheet: "${sheetName}"`);

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

  static recalculate(filePath, sheetFilter = '') {
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`recalculate: File not found: ${absPath}`);
    }

    if (!winax) {
      throw new Error('recalculate: winax binary not found/unbuilt. Ensure OLE/COM components are installed and built.');
    }

    const excelApp = new winax.Object('Excel.Application');
    excelApp.Visible = false;
    excelApp.DisplayAlerts = false;
    excelApp.ScreenUpdating = false;
    excelApp.EnableEvents = false;

    try {
      console.log(`📂 Opening workbook for Recalc: ${absPath}`);
      const workbook = excelApp.Workbooks.Open(absPath);

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


  static generate(ymlFile) {

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
}