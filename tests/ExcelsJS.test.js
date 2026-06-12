// Unit tests for utils/ExcelsJS.js — public static methods readWorkbookSafely
// and replaceFormula.
//
// ExcelsJS drives SheetJS ('xlsx'). We mock 'xlsx' BEFORE importing the class so
// no real file is parsed, and we control exactly which workbook object is
// returned. Sibling deps Files (incrementFileName), Yamls (config) and Excels
// (COM repair) are also mocked to isolate the unit. fs is real where it matters
// (existence checks) but we point at real temp files via helpers/tmp.js.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- xlsx (SheetJS) mock -----------------------------------------------------
const XLSX = {
  readFile: jest.fn(),
  writeFile: jest.fn(),
  read: jest.fn(),
  utils: {},
};
jest.unstable_mockModule('xlsx', () => ({ default: XLSX, ...XLSX }));

// --- sibling deps ------------------------------------------------------------
// incrementFileName: append " 1" before the extension (deterministic for tests).
const FilesMock = {
  incrementFileName: jest.fn((p) => {
    const parsed = path.parse(p);
    return path.join(parsed.dir, `${parsed.name} 1${parsed.ext}`);
  }),
};
const YamlsMock = { getConfig: jest.fn((_key, _type, def) => def) };
const ExcelsMock = { repairToFile: jest.fn() };

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Excels.js'), () => ({ Excels: ExcelsMock }));

const { ExcelsJS } = await import('../utils/ExcelsJS.js');

let work;

beforeEach(() => {
  work = makeTmpDir('excelsjs-');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

// Build a minimal SheetJS-shaped workbook with formula cells.
function makeWorkbook(sheets) {
  return { SheetNames: Object.keys(sheets), Sheets: sheets };
}

describe('ExcelsJS.readWorkbookSafely', () => {
  it('returns the workbook from a successful normal read', () => {
    const wb = makeWorkbook({ Sheet1: {} });
    XLSX.readFile.mockReturnValueOnce(wb);

    const result = ExcelsJS.readWorkbookSafely('book.xlsx', { cellFormula: true });

    expect(result).toBe(wb);
    // Called once with the resolved absolute path and the passed options.
    expect(XLSX.readFile).toHaveBeenCalledTimes(1);
    expect(XLSX.readFile).toHaveBeenCalledWith(path.resolve('book.xlsx'), { cellFormula: true });
  });

  it('falls back to a lenient read when the normal read throws', () => {
    const wb = makeWorkbook({ S: {} });
    XLSX.readFile
      .mockImplementationOnce(() => { throw new Error('bad zip'); })
      .mockReturnValueOnce(wb);

    const result = ExcelsJS.readWorkbookSafely('book.xlsx');

    expect(result).toBe(wb);
    expect(XLSX.readFile).toHaveBeenCalledTimes(2);
    // Second call carries the lenient flags.
    expect(XLSX.readFile.mock.calls[1][1]).toEqual(
      expect.objectContaining({ WTF: true, cellStyles: false, sheetStubs: false }),
    );
  });

  it('repairs via Excel COM and reads the repaired copy when both reads fail', () => {
    const wb = makeWorkbook({ S: {} });
    XLSX.readFile
      .mockImplementationOnce(() => { throw new Error('fail 1'); })
      .mockImplementationOnce(() => { throw new Error('fail 2'); })
      .mockReturnValueOnce(wb);

    const result = ExcelsJS.readWorkbookSafely('book.xlsx');

    expect(result).toBe(wb);
    expect(ExcelsMock.repairToFile).toHaveBeenCalledTimes(1);
    // repairToFile gets (absPath, tmpRepairedPath)
    const [absArg, tmpArg] = ExcelsMock.repairToFile.mock.calls[0];
    expect(absArg).toBe(path.resolve('book.xlsx'));
    expect(tmpArg).toMatch(/\.repaired\.xlsx$/);
    expect(XLSX.readFile).toHaveBeenCalledTimes(3);
  });

  it('throws a descriptive error when even the repaired read fails', () => {
    XLSX.readFile.mockImplementation(() => { throw new Error('still broken'); });

    expect(() => ExcelsJS.readWorkbookSafely('book.xlsx')).toThrow(
      /Unable to read .* even after Excel repair/,
    );
  });
});

describe('ExcelsJS.replaceFormula', () => {
  it('throws when the file does not exist', () => {
    expect(() => ExcelsJS.replaceFormula(path.join(work, 'missing.xlsx'))).toThrow(/File not found/);
  });

  it('replaces the search string in formula cells and writes a new workbook', () => {
    const file = path.join(work, 'book.xlsx');
    fs.writeFileSync(file, 'stub', 'utf8'); // existence check passes

    const wb = makeWorkbook({
      Sheet1: {
        '!ref': 'A1:B1',           // skipped (starts with '!')
        A1: { f: '@SUM(A1:A2)' },  // has '@' → replaced
        B1: { f: 'PLAIN' },        // no '@' → unchanged
        C1: { v: 5 },              // no formula → untouched
      },
    });
    XLSX.readFile.mockReturnValueOnce(wb);

    const out = ExcelsJS.replaceFormula(file, '@', '', true);

    // Default searchStr '@' removed from A1; B1 left as-is.
    expect(wb.Sheets.Sheet1.A1.f).toBe('SUM(A1:A2)');
    expect(wb.Sheets.Sheet1.B1.f).toBe('PLAIN');
    // recalc=true sets the FullCalcOnLoad flag.
    expect(wb.Workbook.CalculationProperties.fullCalcOnLoad).toBe(true);
    // Writes via incrementFileName-derived path and returns it.
    expect(FilesMock.incrementFileName).toHaveBeenCalledWith(path.resolve(file));
    expect(XLSX.writeFile).toHaveBeenCalledWith(wb, out);
    expect(out).toMatch(/book 1\.xlsx$/);
  });

  it('only replaces the FIRST occurrence per formula (String.replace, not /g)', () => {
    const file = path.join(work, 'multi.xlsx');
    fs.writeFileSync(file, 'stub', 'utf8');

    const wb = makeWorkbook({ S: { A1: { f: '@a@b@c' } } });
    XLSX.readFile.mockReturnValueOnce(wb);

    ExcelsJS.replaceFormula(file, '@', '#', false);

    // Documents real behavior: cell.f.replace(searchStr, ...) replaces once only.
    expect(wb.Sheets.S.A1.f).toBe('#a@b@c');
  });

  it('does not set the recalc flag when recalc=false', () => {
    const file = path.join(work, 'norecalc.xlsx');
    fs.writeFileSync(file, 'stub', 'utf8');

    const wb = makeWorkbook({ S: { A1: { f: '@x' } } });
    XLSX.readFile.mockReturnValueOnce(wb);

    ExcelsJS.replaceFormula(file, '@', '', false);

    expect(wb.Workbook).toBeUndefined();
  });

  it('honors sheetFilter: processes only the named sheet', () => {
    const file = path.join(work, 'filter.xlsx');
    fs.writeFileSync(file, 'stub', 'utf8');

    const wb = makeWorkbook({
      Keep: { A1: { f: '@one' } },
      Other: { A1: { f: '@two' } },
    });
    XLSX.readFile.mockReturnValueOnce(wb);

    ExcelsJS.replaceFormula(file, '@', '', false, 'Keep');

    expect(wb.Sheets.Keep.A1.f).toBe('one');   // processed
    expect(wb.Sheets.Other.A1.f).toBe('@two'); // filtered out, untouched
  });

  it('skips sheets listed in Excel.ExcludedSheets config when no filter is given', () => {
    const file = path.join(work, 'excl.xlsx');
    fs.writeFileSync(file, 'stub', 'utf8');

    YamlsMock.getConfig.mockReturnValueOnce(['Skip']); // Excel.ExcludedSheets

    const wb = makeWorkbook({
      Skip: { A1: { f: '@a' } },
      Run: { A1: { f: '@b' } },
    });
    XLSX.readFile.mockReturnValueOnce(wb);

    ExcelsJS.replaceFormula(file, '@', '', false);

    expect(wb.Sheets.Skip.A1.f).toBe('@a'); // excluded, untouched
    expect(wb.Sheets.Run.A1.f).toBe('b');   // processed
  });
});
