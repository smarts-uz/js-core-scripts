// utils.js
import fs from 'fs';
import path from 'path';
let winax;
try {
  winax = (await import('#winax')).default;
} catch (e) {
  // winax not available (likely binary not built)
}
import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';
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

    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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

    const before = Com.pidsOf('EXCEL.EXE');
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
      try { excelApp.Quit(); } catch (_) {}
      try { winax.release(excelApp); } catch (_) {}
      Com.killOrphans('EXCEL.EXE', before);
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

  /**
   * Reads yamlData.Accrual — a bare-date "start": amount array Yamls.recomputeChain/writeAccrual already writes into the .contract yaml.
   * Writes one row per entry (date, amount) starting at the {Accrual} placeholder's cell — a 2-column block (Дата/Сумма), same shape as every other block on this template now that Начало/Конец columns are gone everywhere.
   * Trailing { ALL: sum } entry is never written to Excel — ALL is a .contract-yaml-only concept.
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processAccrual(yamlData) {
    console.info(`[Excels.processAccrual] 🟢 Starting...`);
    const found = this.findColumn('Accrual');
    if (!found) {
      console.warn('⚠️ processAccrual: {Accrual} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const accrual = Array.isArray(yamlData.Accrual) ? yamlData.Accrual : [];
    console.log(`processAccrual: ${accrual.length} Accrual entr(y/ies)`, accrual);

    for (const entry of accrual) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.Penalty — a bare-date "start": amount per-month late-payment penalty array (пеня/неустойка, §21.1 — PenaltyDays[i] * Penalty.PerDay, a fixed daily rate, no CapRatio) Yamls.replaceYaml already writes into the .contract yaml.
   * Writes one row per entry (date, penalty amount) starting at the {Penalty} placeholder's cell — a 2-column block (Дата/Сумма), same shape as every other block on this template now that Начало/Конец columns are gone everywhere.
   * Trailing { ALL: sum } entry is never written to Excel — ALL is a .contract-yaml-only concept.
   * Always runs (no ON/OFF flag) — mirrors processPayment's own unconditional shape.
   * Warns and skips (never crashes) when the template has no {Penalty} placeholder cell.
   * @param {object} yamlData
   */
  static processPenalty(yamlData) {
    console.info(`[Excels.processPenalty] 🟢 Starting...`);

    const found = this.findColumn('Penalty');
    if (!found) {
      console.warn('⚠️ processPenalty: {Penalty} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const penalty = Array.isArray(yamlData.Penalty) ? yamlData.Penalty : [];
    console.log(`processPenalty: ${penalty.length} Penalty entr(y/ies)`, penalty);

    for (const entry of penalty) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  // Reads yamlData.Payment — a FLAT, date-keyed array
  // (Yamls.mergeDateKeyedArrays' output: Bank-OT + Card-OT + BaaR-OT +
  // Trans-OT merged, same-date entries summed — e.g. { '2026-04-21':
  // '1,600,000' }, NOT a "start#end" interval) Yamls.writePayment writes
  // into the .contract yaml — and writes one row per entry (date, paid
  // amount) starting at the {Payment} placeholder's cell. No trailing
  // { ALL } entry to skip (mergeDateKeyedArrays doesn't append one). Always
  // runs (no ON/OFF flag, unlike Penalty) — mirrors processAccrual's own
  // unconditional shape.
  static processPayment(yamlData) {
    console.info(`[Excels.processPayment] 🟢 Starting...`);

    const found = this.findColumn('Payment');
    if (!found) {
      console.warn('⚠️ processPayment: {Payment} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const payment = Array.isArray(yamlData.Payment) ? yamlData.Payment : [];
    console.log(`processPayment: ${payment.length} Payment entr(y/ies)`, payment);

    for (const entry of payment) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 2).Value = amount;

      row++;
    }
  }

  // Reads yamlData.Returns — a FLAT, date-keyed array
  // (Yamls.mergeDateKeyedArrays' output: Bank-IN + Card-IN + BaaR-IN merged,
  // same-date entries summed) Yamls.writeReturns writes into the .contract
  // yaml — and writes one row per entry (date, refunded amount) starting at
  // the {Returns} placeholder's cell. Same shape/handling as processPayment.
  // Always runs (no ON/OFF flag). Warns and skips when the template has no
  // {Returns} placeholder cell (an older Excel template predating this
  // feature).
  static processReturns(yamlData) {
    console.info(`[Excels.processReturns] 🟢 Starting...`);

    const found = this.findColumn('Returns');
    if (!found) {
      console.warn('⚠️ processReturns: {Returns} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const returns = Array.isArray(yamlData.Returns) ? yamlData.Returns : [];
    console.log(`processReturns: ${returns.length} Returns entr(y/ies)`, returns);

    for (const entry of returns) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.History — a flat, date-keyed array (Yamls.computeHistory: Payment as-is, Returns negated, same-date entries summed), written into the .contract yaml by Yamls.writeHistory.
   * Writes one row per entry (date, net amount) starting at the {History} placeholder's cell — a 2-column block (Дата/Сумма), same shape as {Returns}/{Account}.
   * No trailing { ALL } entry to skip.
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processHistory(yamlData) {
    console.info(`[Excels.processHistory] 🟢 Starting...`);

    const found = this.findColumn('History');
    if (!found) {
      console.warn('⚠️ processHistory: {History} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const history = Array.isArray(yamlData.History) ? yamlData.History : [];
    console.log(`processHistory: ${history.length} History entr(y/ies)`, history);

    for (const entry of history) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.PenaltyDays — a bare-date "start": dayCount per-period late-payment day-count array Yamls.writePenaltyDays writes into the .contract yaml (Penalty[i] = PenaltyDays[i] * Penalty.PerDay).
   * Writes one row per entry (date, day count) starting at the {PenaltyDays} placeholder's cell — a 2-column block (Дата/Количество), same shape as every other block on this template now that Начало/Конец columns are gone everywhere.
   * Trailing { ALL: sum } entry is never written to Excel — ALL is a .contract-yaml-only concept.
   * Always runs (no ON/OFF flag), same as processPenalty.
   * @param {object} yamlData
   */
  static processPenaltyDays(yamlData) {
    console.info(`[Excels.processPenaltyDays] 🟢 Starting...`);

    const found = this.findColumn('PenaltyDays');
    if (!found) {
      console.warn('⚠️ processPenaltyDays: {PenaltyDays} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const penaltyDays = Array.isArray(yamlData.PenaltyDays) ? yamlData.PenaltyDays : [];
    console.log(`processPenaltyDays: ${penaltyDays.length} PenaltyDays entr(y/ies)`, penaltyDays);

    for (const entry of penaltyDays) {
      const [date, days] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = days;

      row++;
    }
  }

  /**
   * Reads yamlData.Faktura — a bare-date "end" (period's own last day, NOT Accrual's start-date key) key: amount per-period real EHF-IN invoice sum distributed across Accrual's periods (Yamls.computeFaktura/writeFaktura).
   * Writes one row per entry (date, amount) starting at the {Faktura} placeholder's cell — a 2-column block (Дата/Сумма), same shape as every other block on this template now that Начало/Конец columns are gone everywhere.
   * Trailing { ALL: sum } entry is never written to Excel — ALL is a .contract-yaml-only concept.
   * Always runs (no ON/OFF flag) — mirrors processAccrual/processLoaners' own unconditional, bare-date-keyed shape.
   * @param {object} yamlData
   */
  static processFaktura(yamlData) {
    console.info(`[Excels.processFaktura] 🟢 Starting...`);

    const found = this.findColumn('Faktura');
    if (!found) {
      console.warn('⚠️ processFaktura: {Faktura} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const faktura = Array.isArray(yamlData.Faktura) ? yamlData.Faktura : [];
    console.log(`processFaktura: ${faktura.length} Faktura entr(y/ies)`, faktura);

    for (const entry of faktura) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.FakturaSend — bare-date "end" key (same Dates.monthEnd remap as Faktura), per-period amount NOT YET invoiced (Yamls.computeFakturaSend: Accrual[period] minus Faktura[period]), written into the .contract yaml by Yamls.writeFakturaSend.
   * Writes one row per entry (date, amount) starting at the {FakturaSend} placeholder's cell — a 2-column block (Дата/Сумма), same shape as {Faktura}.
   * Trailing { ALL: sum } entry is never written to Excel — ALL is a .contract-yaml-only concept.
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processFakturaSend(yamlData) {
    console.info(`[Excels.processFakturaSend] 🟢 Starting...`);

    const found = this.findColumn('FakturaSend');
    if (!found) {
      console.warn('⚠️ processFakturaSend: {FakturaSend} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const fakturaSend = Array.isArray(yamlData.FakturaSend) ? yamlData.FakturaSend : [];
    console.log(`processFakturaSend: ${fakturaSend.length} FakturaSend entr(y/ies)`, fakturaSend);

    for (const entry of fakturaSend) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Loaners: is now a plain scalar (the absolute value of Account's own last entry — see Yamls.writeLoaners), not an array.
   * This method's array-shaped {Loaners} row loop is a no-op for every real contract — kept as standalone dead-shape handling rather than deleted, per the "don't remove public API surface without being asked" rule.
   * Any real {Loaners} placeholder cell is now filled by generate()'s own generic scalar-replace pass instead.
   * @param {object} yamlData
   */
  static processLoaners(yamlData) {
    console.info(`[Excels.processLoaners] 🟢 Starting...`);

    const found = this.findColumn('Loaners');
    if (!found) {
      console.warn('⚠️ processLoaners: {Loaners} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const loaners = Array.isArray(yamlData.Loaners) ? yamlData.Loaners : [];
    console.log(`processLoaners: ${loaners.length} Loaners entr(y/ies)`, loaners);

    for (const entry of loaners) {
      const [intervalKey, amount] = Object.entries(entry)[0];
      if (intervalKey === 'ALL') continue;
      const [start, end] = intervalKey.split('#');

      globalThis.excelSheet.Cells(row, found.Column).Value = start;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = end ?? start;
      globalThis.excelSheet.Cells(row, found.Column + 2).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.Account — a flat "YYYY-MM-DD": balance array (Yamls.buildAccountEntries/writeAccount), no trailing { ALL } entry.
   * Writes one row per entry (date, balance) starting at {Account} placeholder's cell — a 2-column block (Дата/Сумма), same shape as {Returns}.
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processAccount(yamlData) {
    console.info(`[Excels.processAccount] 🟢 Starting...`);

    const found = this.findColumn('Account');
    if (!found) {
      console.warn('⚠️ processAccount: {Account} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const account = Array.isArray(yamlData.Account) ? yamlData.Account : [];
    console.log(`processAccount: ${account.length} Account entr(y/ies)`, account);

    for (const entry of account) {
      const [date, balance] = Object.entries(entry)[0];

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = balance;

      row++;
    }
  }

  /**
   * Reads yamlData.PriceMon — a bare "YYYY-MM": amount array (Yamls.buildPriceMonEntries/writePriceMon), no trailing { ALL } entry.
   * Writes one row per entry (month, amount) starting at {PriceMon} placeholder's cell — a 2-column block (Месяц/Сумма).
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processPriceMon(yamlData) {
    console.info(`[Excels.processPriceMon] 🟢 Starting...`);

    const found = this.findColumn('PriceMon');
    if (!found) {
      console.warn('⚠️ processPriceMon: {PriceMon} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const priceMon = Array.isArray(yamlData.PriceMon) ? yamlData.PriceMon : [];
    console.log(`processPriceMon: ${priceMon.length} PriceMon entr(y/ies)`, priceMon);

    for (const entry of priceMon) {
      const [month, amount] = Object.entries(entry)[0];
      if (month === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = month;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.PriceMaxMon — same bare "YYYY-MM": amount shape as PriceMon (Yamls.buildPriceMaxMonEntries/writePriceMaxMon).
   * Writes one row per entry (month, amount) starting at {PriceMaxMon} placeholder's cell — a 2-column block (Месяц/Сумма).
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processPriceMaxMon(yamlData) {
    console.info(`[Excels.processPriceMaxMon] 🟢 Starting...`);

    const found = this.findColumn('PriceMaxMon');
    if (!found) {
      console.warn('⚠️ processPriceMaxMon: {PriceMaxMon} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const priceMaxMon = Array.isArray(yamlData.PriceMaxMon) ? yamlData.PriceMaxMon : [];
    console.log(`processPriceMaxMon: ${priceMaxMon.length} PriceMaxMon entr(y/ies)`, priceMaxMon);

    for (const entry of priceMaxMon) {
      const [month, amount] = Object.entries(entry)[0];
      if (month === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = month;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.PriceDay — same bare "YYYY-MM": amount shape as PriceMon (Yamls.buildPriceDayEntries/writePriceDay).
   * Writes one row per entry (month, amount) starting at {PriceDay} placeholder's cell — a 2-column block (Месяц/Сумма).
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processPriceDay(yamlData) {
    console.info(`[Excels.processPriceDay] 🟢 Starting...`);

    const found = this.findColumn('PriceDay');
    if (!found) {
      console.warn('⚠️ processPriceDay: {PriceDay} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const priceDay = Array.isArray(yamlData.PriceDay) ? yamlData.PriceDay : [];
    console.log(`processPriceDay: ${priceDay.length} PriceDay entr(y/ies)`, priceDay);

    for (const entry of priceDay) {
      const [month, amount] = Object.entries(entry)[0];
      if (month === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = month;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  /**
   * Reads yamlData.PriceMaxDay — same bare "YYYY-MM": amount shape as PriceMon (Yamls.buildPriceDayEntries/writePriceMaxDay).
   * Writes one row per entry (month, amount) starting at {PriceMaxDay} placeholder's cell — a 2-column block (Месяц/Сумма).
   * Always runs (no ON/OFF flag).
   * @param {object} yamlData
   */
  static processPriceMaxDay(yamlData) {
    console.info(`[Excels.processPriceMaxDay] 🟢 Starting...`);

    const found = this.findColumn('PriceMaxDay');
    if (!found) {
      console.warn('⚠️ processPriceMaxDay: {PriceMaxDay} placeholder not found in Excel template; skipping.');
      return;
    }

    let row = found.Row;

    const priceMaxDay = Array.isArray(yamlData.PriceMaxDay) ? yamlData.PriceMaxDay : [];
    console.log(`processPriceMaxDay: ${priceMaxDay.length} PriceMaxDay entr(y/ies)`, priceMaxDay);

    for (const entry of priceMaxDay) {
      const [month, amount] = Object.entries(entry)[0];
      if (month === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = month;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }

  // Writes one row per {date: amount} entry from yamlData[cellName] — the
  // array Yamls.writeCellArrays already wrote into the .contract yaml for
  // this Excel.CellNames key (Bank-OT, EHF-IN, …). No folder scan: the
  // .contract yaml is the single source of truth for this data now.
  static processFolders(entries, found) {
    console.info(`[Excels.processFolders] 🟢 Starting...`);
    let row = found.Row;

    for (const entry of entries) {
      const [date, amount] = Object.entries(entry)[0];
      if (date === 'ALL') continue;

      globalThis.excelSheet.Cells(row, found.Column).Value = date;
      globalThis.excelSheet.Cells(row, found.Column + 1).Value = amount;

      row++;
    }
  }


  // VBA's Cells.Replace has a hard 255-character limit on its Replacement
  // argument (Office VBA "Replacements too long (Error 746)") — surfacing
  // here as a winax "DispInvoke: Replace: DISP_E_TYPEMISMATCH" instead of
  // that VBA error text, since winax can't marshal a >255-char BSTR through
  // that specific COM parameter. This is universal to ANY long yamlData
  // value (ComOKEDName's activityTypeName text today, but equally any other
  // long field on any contract, YaTT or not) — never specific to one key.
  // Fix: Cells.Replace only for a short replacement; for a long one, locate
  // the placeholder cell via Cells.Find (search string is always short —
  // "{KEY}" — so Find is unaffected) and set the cell's .Value directly,
  // which has no such length limit.
  static replaceInSheet(search, replace) {
    console.info(`[Excels.replaceInSheet] 🟢 Starting...`);

    if (String(replace).length > 255) {
      console.warn(`⚠️ "${search}" replacement is ${String(replace).length} chars (>255) — Cells.Replace would throw DISP_E_TYPEMISMATCH; writing via Cells.Find + .Value instead.`);
      const cell = globalThis.excelSheet.Cells.Find(search);

      if (cell) {
        cell.Value = replace;
        console.log(`✅ Replaced  "${search}" with "${replace}" in Excel sheet "App" (long-value path)`);
        return true;
      }

      console.warn(`⚠️ "${search}" not found in Excel sheet "App"`);
      return false;
    }

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


  /**
   * Finds the real {search} placeholder cell — never a bare, unbracketed occurrence of the same text elsewhere on the sheet.
   * A real template can carry a bare copy of a key name (e.g. a stray "Accrual" label in a row above the real {Accrual} placeholder) — Cells.Find on the bare search term would match that stray text first and resolve to the wrong cell.
   * @param {string} search - the bare key name, e.g. 'Accrual' (braces added here, never passed in by the caller).
   * @returns {object|null}
   */
  static findColumn(search) {
      console.info(`[failed.findColumn] 🟢 Starting...`);
    const bracketed = `{${search}}`;
    console.log(`🔍 Searching for "${bracketed}" in Excel...`);

    const found = globalThis.excelSheet.Cells.Find(bracketed);

    if (found) {
      console.log(`✅ Found "${bracketed}". Row: ${found.Row}, Column: ${found.Column}`);
      console.log(`🔍 Columns: Column: ${found.Column}, Row: ${found.Row}`);
    } else {
      console.warn(`⚠️ "${bracketed}" not found in Excel sheet "App"`);

    }

    return found;

  }





  static fileOpen(fileName) {
    console.info(`[Excels.fileOpen] 🟢 Starting...`);

    if (!fs.existsSync(fileName)) {
      Dialogs.warningBox(`File "${fileName}" not found.`, 'File Error');
    }

    // Snapshot EXCEL.EXE PIDs before spawning — the finally-block backstop in
    // fileClose() (called from generate()'s own try/finally, see below) uses
    // this to kill ONLY the instance this run orphaned, never a PID that was
    // already running before this call.
    globalThis.excelPidsBefore = Com.pidsOf('EXCEL.EXE');

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


  // Called from generate()'s finally block (see below) so this always runs —
  // on the success path AND when generate() throws mid-way (e.g. a COM error
  // from replaceInSheet). fileSave()/Close()/Quit() are each best-effort
  // (wrapped so one failing step doesn't skip the PID kill after it), and the
  // final Com.killOrphans call is the hard backstop: even if Quit()/release()
  // silently no-op on a wedged COM object, the orphaned EXCEL.EXE PID this
  // run spawned is still terminated by PID (never by image name — a PID
  // present in excelPidsBefore, i.e. a user's own already-open Excel, is
  // never touched).
  static fileClose() {
    console.info(`[Excels.fileClose] 🟢 Starting...`);

    try { this.fileSave(); } catch (err) { console.warn('⚠️ fileClose: fileSave failed:', err.message); }

    try {
      // ✅ Close workbook (without saving)
      if (globalThis.excelWorkbook) globalThis.excelWorkbook.Close(true);
    } catch (err) { console.warn('⚠️ fileClose: workbook Close failed:', err.message); }

    try {
      // ✅ Quit Excel
      if (globalThis.excelApp) globalThis.excelApp.Quit();
    } catch (err) { console.warn('⚠️ fileClose: excelApp Quit failed:', err.message); }

    try {
      // ✅ Release COM objects to prevent Excel.exe from staying in memory
      if (globalThis.excelWorkbook && globalThis.excelWorkbook.ReleaseComObject) globalThis.excelWorkbook.ReleaseComObject();
      if (globalThis.excelSheet && globalThis.excelSheet.ReleaseComObject) globalThis.excelSheet.ReleaseComObject();
      if (globalThis.excelApp && globalThis.excelApp.ReleaseComObject) globalThis.excelApp.ReleaseComObject();

      // ✅ Or just use `winax.release()` (if you have a lot of COM refs)
      if (globalThis.excelApp) winax.release(globalThis.excelApp);
    } catch (err) { console.warn('⚠️ fileClose: COM release failed:', err.message); }

    // kill any orphaned EXCEL.EXE this run spawned, by PID diff — the hard
    // backstop for when Quit()/release() above silently failed to close it.
    const killed = Com.killOrphans('EXCEL.EXE', globalThis.excelPidsBefore || new Set());
    console.log(`Excel fileClose: ${killed} orphaned EXCEL.EXE process(es) killed.`);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
    }
  }

  static recalculate(filePath, sheetFilter = '') {
    console.info(`[Excels.recalculate] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`recalculate: File not found: ${absPath}`);
    }

    this.checkWinax('recalculate');
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
    }
  }

  static changeFont(filePath, fontName = 'Arial', sheetFilter = '') {
    console.info(`[Excels.changeFont] 🟢 Starting...`);
    const absPath = path.resolve(filePath);

    if (!fs.existsSync(absPath)) {
      throw new Error(`changeFont: File not found: ${absPath}`);
    }

    this.checkWinax('changeFont');
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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

    const templateFolder = Yamls.getConfig('Templates.Excel');
    const templatePath = Files.getLatestMatchingFile(templateFolder, '.xlsx');
    if (!templatePath) {
        Dialogs.warningBox(`No "Basename N".xlsx template found in: ${templateFolder}`, 'Error');
        return;
    }
    const templateFileName = Files.getBaseName(templatePath, '.xlsx');
    const dateString = `${new Intl.DateTimeFormat('en-CA').format(new Date())}`;

    const actRecoFile = `ActReco, ${yamlData.ComName}, ${templateFileName}, ${dateString}, PrePay-${prepayMonth}.xlsx`;
    console.log(`New file name: ${actRecoFile}`);

    const newFilePath = path.join(globalThis.folderActReco, actRecoFile);
    console.log(`New file path: ${newFilePath}`);

    // Attempt to copy the file
    Files.copyFileWithRetry(templatePath, newFilePath);

    // 1. Read the ordered pricing cell/column names from config.yml (Excel.CellNames).
    const configuredCells = Yamls.getConfig('Excel.CellNames');
    if (!Array.isArray(configuredCells) || configuredCells.length === 0)
      Dialogs.warningBox('Excel.CellNames missing/empty in config.yml', 'Error');
    const cellNames = Array.isArray(configuredCells) ? configuredCells : [];
    console.log('Cell names:', cellNames.join(', '), 'cellNames');

    this.fileOpen(newFilePath);

    // Everything from here on drives live Excel COM (replaceInSheet,
    // processAccrual, …) — any of it can throw (a COM error, a malformed
    // yamlData value). Without this try/finally, a mid-loop exception skips
    // fileClose() entirely, leaving the just-opened EXCEL.EXE process (and
    // its lock on newFilePath) orphaned — confirmed live: a DISP_E_TYPEMISMATCH
    // from replaceInSheet left an EXCEL.EXE PID running, and the next
    // generate() run failed with EBUSY trying to overwrite the locked file.
    // fileClose() now always runs, and it always terminates this run's own
    // EXCEL.EXE PID as a hard backstop even when Quit()/release() no-op on a
    // wedged COM object.
    try {
      this.processAccrual(yamlData);
      this.processPayment(yamlData);
      this.processFaktura(yamlData);
      this.processFakturaSend(yamlData);
      this.processReturns(yamlData);
      this.processHistory(yamlData);
      this.processLoaners(yamlData);
      this.processPenaltyDays(yamlData);
      this.processPenalty(yamlData);
      this.processAccount(yamlData);
      this.processPriceMon(yamlData);
      this.processPriceMaxMon(yamlData);
      this.processPriceDay(yamlData);
      this.processPriceMaxDay(yamlData);

      for (const cellName of cellNames) {
        const found = this.findColumn(cellName);

        const entries = Array.isArray(yamlData[cellName]) ? yamlData[cellName] : [];
        if (entries.length > 0) {
          this.processFolders(entries, found);

        } else {
          console.warn(`🚫 No ${cellName} entries in yamlData`);
          this.replaceInSheet(`{${cellName}}`, '');
        }

      }



      // Replace {KEY} placeholders — skip array-valued keys (Accrual, Payment,
      // Loaners, Penalty, every Excel.CellNames key: Bank-OT, EHF-IN, …).
      // These are never rendered as a {key} placeholder; they are written
      // cell-by-cell by processAccrual/processPayment/processLoaners/
      // processPenalty/processFolders above. Passing an
      // array/object straight to Excel COM's Cells.Replace crashes
      // ("DispInvoke: Replace The remote procedure call failed.") since it
      // only accepts a string/primitive.
      for (const key of Object.keys(yamlData)) {

        const value = yamlData[key];

        if (Array.isArray(value)) continue;

        const placeholder = `{${key}}`;

        this.replaceInSheet(placeholder, value);
      }
    } finally {
      this.fileClose();
    }

  }

  static protectFile(filename, password) {
    console.info(`[Excels.protectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`protectFile: File not found: ${absPath}`);
    }

    this.checkWinax('protectFile');
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
    }
  }

  static unProtectFile(filename, password) {
    console.info(`[Excels.unProtectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectFile: File not found: ${absPath}`);
    }

    this.checkWinax('unProtectFile');
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
    }
  }

  static unProtectSheet(filename, password) {
    console.info(`[Excels.unProtectSheet] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectSheet: File not found: ${absPath}`);
    }

    this.checkWinax('unProtectSheet');
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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

    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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
    const before = Com.pidsOf('EXCEL.EXE');
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
      Com.killOrphans('EXCEL.EXE', before);
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