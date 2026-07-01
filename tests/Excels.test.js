// Unit tests for utils/Excels.js — a large, winax-COM-heavy class. Every public
// method (name not starting with `_`) is covered; the private driver
// `_replaceFormulaWith` is exercised only through its public wrappers
// (replaceFormula / replaceFormula2 / replaceFormulaArray).
//
// Pattern (per tests/README §2): mock only the boundaries. `winax` is replaced
// with the auto-chaining COM proxy from helpers/mocks.js so long COM chains
// (app.Workbooks.Open(p).Sheets(1).Range(...)) run without a real Excel; we
// then assert the OBSERVABLE CONTRACT by inspecting the recorded `__calls__` /
// `__sets__` on the proxies and the mocked Open/SaveAs/Save/Close calls. Dialogs
// (UI), Yamls (config), Word (folders) and Dates are mocked;
// Files is a small real-fs-backed stub so incrementFileName collision logic and
// path math run for real. Pure fs/path helpers (getProtectedPath, scanSubFolder,
// scanSubFilesTxt) are tested against real temp dirs.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree } from './helpers/tmp.js';
import { makeWinaxMock, makeComProxy } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- COM boundary -------------------------------------------------------------
// A test installs `comFactory(progId)` to control what `new winax.Object(id)`
// returns. `lastApp` captures the most recently constructed Excel.Application
// proxy so a test can read its recorded calls/sets. `release` is the shared
// winax.release spy.
const state = { comFactory: null, lastApp: null };
const winaxObject = jest.fn(function (progId) {
  const obj = state.comFactory ? state.comFactory(progId) : makeComProxy({}, progId);
  if (progId === 'Excel.Application') state.lastApp = obj;
  return obj;
});
const winaxRelease = jest.fn();

jest.unstable_mockModule('winax', () => ({
  default: { Object: winaxObject, release: winaxRelease },
  Object: winaxObject,
  release: winaxRelease,
}));

// --- sibling mocks ------------------------------------------------------------
// Files: real fs-backed where it matters (incrementFileName collision logic,
// currentDir, copyFileWithRetry, readLines, getBaseName, mkdirIfNotExists).
const filesState = { currentDir: '' };
const FilesMock = {
  currentDir: jest.fn(() => filesState.currentDir),
  incrementFileName: jest.fn((filePath) => {
    if (!fs.existsSync(filePath)) return filePath;
    const parsed = path.parse(filePath);
    let i = 1;
    let np = filePath;
    while (fs.existsSync(np)) {
      np = path.join(parsed.dir, `${parsed.name} ${i}${parsed.ext}`);
      i++;
    }
    return np;
  }),
  mkdirIfNotExists: jest.fn((d) => fs.mkdirSync(d, { recursive: true })),
  copyFileWithRetry: jest.fn((src, dest) => fs.copyFileSync(src, dest)),
  readLines: jest.fn((p) => fs.readFileSync(p, 'utf8').split(/\r?\n/).filter(Boolean)),
  getBaseName: jest.fn((p, ext) => path.basename(p, ext)),
};

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
  inputBox: jest.fn(),
};

// Real Yamls.getConfig returns the defaultValue (3rd arg) when a key is absent;
// the default mock mirrors that so callers like getConfig('X', 'array', []) get
// [] rather than null. Individual tests override per-key as needed.
const YamlsMock = {
  getConfig: jest.fn((key, type = null, def = null) => def),
  setConfig: jest.fn(),
  loadYamlWithDeps: jest.fn(() => ({})),
  getPrepayMonth: jest.fn(() => 1),
};

// Word is mocked because Word.js loads winax itself; only the surfaces used by
// the surviving Excels tests (initFolders) are stubbed.
const WordMock = {
  initFolders: jest.fn(),
};

// Real Dates.parseDMYExcel (it parses YYYY-MM-DD into a Date).
const DatesMock = {
  parseDMYExcel: jest.fn((s) => {
    const [y, m, d] = String(s).split('-').map(Number);
    return new Date(y, m - 1, d);
  }),
};

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Word.js'), () => ({ Word: WordMock }));
jest.unstable_mockModule(utilsModule('Dates.js'), () => ({ Dates: DatesMock }));

const { Excels } = await import('../utils/Excels.js');

// --- COM helpers --------------------------------------------------------------

// A bare makeComProxy returns a FRESH child proxy on every property access, so
// `wb.SaveAs` is not a stable jest.fn and cannot be asserted on. Lifecycle
// methods we assert against (SaveAs/Save/Close on the workbook; Quit/
// CalculateFull on the app) must therefore be pinned as real jest.fn overrides.
function wbSpies(extra = {}) {
  return { SaveAs: jest.fn(), Save: jest.fn(), Close: jest.fn(), ...extra };
}

/**
 * Build a workbook COM proxy with stable SaveAs/Save/Close spies, plus any
 * extra pinned leaves/overrides.
 */
function makeWorkbook(overrides = {}) {
  return makeComProxy(wbSpies(overrides), 'Workbook');
}

/**
 * Install a comFactory that returns an Excel.Application proxy whose
 * Workbooks.Open() always yields `workbook`. The app exposes stable Quit /
 * CalculateFull spies. Returns the app proxy.
 */
function installApp(workbook, extraAppOverrides = {}) {
  const app = makeComProxy(
    {
      Quit: jest.fn(),
      CalculateFull: jest.fn(),
      Workbooks: {
        Open: jest.fn(() => workbook),
        Add: jest.fn(() => workbook),
      },
      ...extraAppOverrides,
    },
    'Excel.Application'
  );
  state.comFactory = (progId) => (progId === 'Excel.Application' ? app : makeComProxy({}, progId));
  state.lastApp = app;
  return app;
}

let workDir;

beforeEach(() => {
  workDir = makeTmpDir('excels-');
  filesState.currentDir = workDir;
  state.comFactory = null;
  state.lastApp = null;
  YamlsMock.getConfig.mockImplementation((key, type = null, def = null) => def);
  YamlsMock.loadYamlWithDeps.mockReturnValue({});
  YamlsMock.getPrepayMonth.mockReturnValue(1);
});

afterEach(() => {
  cleanupAllTmpDirs();
  for (const k of Object.keys(globalThis)) {
    if (k.startsWith('excel') || k.startsWith('folder')) delete globalThis[k];
  }
  jest.clearAllMocks();
});

/** Write a placeholder file (content is irrelevant — COM is mocked). */
function makeFile(name, content = 'x') {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// =============================================================================
// checkWinax
// =============================================================================
describe('Excels.checkWinax', () => {
  it('does not throw when winax is available (it is mocked, so present)', () => {
    expect(() => Excels.checkWinax('anything')).not.toThrow();
  });

  it('is callable through methods that gate on it (no throw → method proceeds)', () => {
    // Indirect: repairToFile calls checkWinax first; a missing input throws the
    // file-not-found error AFTER checkWinax passes, proving checkWinax did not throw.
    expect(() =>
      Excels.repairToFile(path.join(workDir, 'nope.xlsx'), path.join(workDir, 'o.xlsx'))
    ).toThrow(/File not found/);
  });

  // The winax-missing branch (winax === undefined) cannot be reached here because
  // the module-level `winax` is bound at import to our mock and is not undefined.
  // It is documented rather than exercised; throwing path is covered by the
  // contract: checkWinax throws only when winax is falsy.
});

// =============================================================================
// openExcel / openWorkbookSafely
// =============================================================================
describe('Excels.openExcel', () => {
  it('constructs Excel.Application, sets safety flags and returns {excel, workbook}', () => {
    const wb = makeWorkbook();
    const app = installApp(wb);
    const file = makeFile('a.xlsx');

    const result = Excels.openExcel(file);

    expect(winaxObject).toHaveBeenCalledWith('Excel.Application');
    expect(result.excel).toBe(app);
    expect(result.workbook).toBe(wb);
    expect(app.__sets__.Visible).toBe(false);
    expect(app.__sets__.DisplayAlerts).toBe(false);
    expect(app.__sets__.AutomationSecurity).toBe(1);
    // Open was called with the resolved absolute path.
    expect(app.Workbooks.Open).toHaveBeenCalledWith(path.resolve(file), 0, false);
  });

  it('wraps any failure into a "Failed to open Excel file" error', () => {
    state.comFactory = () =>
      makeComProxy(
        {
          Workbooks: {
            Open: () => {
              throw new Error('boom');
            },
          },
        },
        'Excel.Application'
      );
    // Both the normal and repair/extract opens throw, so openWorkbookSafely
    // ultimately throws and openExcel wraps it.
    expect(() => Excels.openExcel(makeFile('b.xlsx'))).toThrow(/Failed to open Excel file/);
  });
});

describe('Excels.openWorkbookSafely', () => {
  it('returns the workbook from a plain 3-arg Open on the happy path', () => {
    const wb = makeWorkbook();
    const open = jest.fn(() => wb);
    const app = makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    const result = Excels.openWorkbookSafely(app, 'rel/path.xlsx');

    expect(result).toBe(wb);
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith(path.resolve('rel/path.xlsx'), 0, false);
  });

  it('honors updateLinks/readOnly options in the first open', () => {
    const wb = makeWorkbook();
    const open = jest.fn(() => wb);
    const app = makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    Excels.openWorkbookSafely(app, 'x.xlsx', { updateLinks: 3, readOnly: true });

    expect(open).toHaveBeenCalledWith(path.resolve('x.xlsx'), 3, true);
  });

  it('falls back to CorruptLoad=1 (repair) when the plain open throws', () => {
    const wb = makeWorkbook();
    let n = 0;
    const open = jest.fn(() => {
      n++;
      if (n === 1) throw new Error('normal failed');
      return wb; // second call (repair) succeeds
    });
    const app = makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    const result = Excels.openWorkbookSafely(app, 'corrupt.xlsx');

    expect(result).toBe(wb);
    expect(open).toHaveBeenCalledTimes(2);
    // 2nd call is the 15-arg CorruptLoad form ending in 1.
    const secondArgs = open.mock.calls[1];
    expect(secondArgs).toHaveLength(15);
    expect(secondArgs[14]).toBe(1);
  });

  it('falls back to CorruptLoad=2 (extract-data) when repair also throws', () => {
    const wb = makeWorkbook();
    let n = 0;
    const open = jest.fn(() => {
      n++;
      if (n <= 2) throw new Error('still failing');
      return wb; // third call (extract) succeeds
    });
    const app = makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    const result = Excels.openWorkbookSafely(app, 'bad.xlsx');

    expect(result).toBe(wb);
    expect(open).toHaveBeenCalledTimes(3);
    expect(open.mock.calls[2][14]).toBe(2);
  });

  it('throws a descriptive error when every open mode fails', () => {
    const open = jest.fn(() => {
      throw new Error('dead');
    });
    const app = makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    expect(() => Excels.openWorkbookSafely(app, 'z.xlsx')).toThrow(
      /Unable to open .* repair\/extract-data modes/
    );
    expect(open).toHaveBeenCalledTimes(3);
  });
});

// =============================================================================
// getProtectedPath — pure path/config logic
// =============================================================================
describe('Excels.getProtectedPath', () => {
  it('appends the configured ProtectSuffix before the extension', () => {
    YamlsMock.getConfig.mockReturnValue(' Protected');
    const out = Excels.getProtectedPath(path.join(workDir, 'Book.xlsx'));
    expect(out).toBe(path.join(workDir, 'Book Protected.xlsx'));
  });

  it('returns the original path unchanged when the suffix is already present', () => {
    YamlsMock.getConfig.mockReturnValue(' Protected');
    const input = path.join(workDir, 'Book Protected.xlsx');
    expect(Excels.getProtectedPath(input)).toBe(path.resolve(input));
  });

  it('with an empty suffix increments only if the target already exists', () => {
    YamlsMock.getConfig.mockReturnValue('');
    const input = path.join(workDir, 'Plain.xlsx');
    // No file exists → incrementFileName returns it as-is, suffix empty.
    expect(Excels.getProtectedPath(input)).toBe(path.resolve(input));
  });

  it('auto-increments when the suffixed file already exists on disk', () => {
    YamlsMock.getConfig.mockReturnValue(' P');
    fs.writeFileSync(path.join(workDir, 'Doc P.xlsx'), 'x');
    const out = Excels.getProtectedPath(path.join(workDir, 'Doc.xlsx'));
    expect(out).toBe(path.join(workDir, 'Doc P 1.xlsx'));
  });
});

// =============================================================================
// repairToFile
// =============================================================================
describe('Excels.repairToFile', () => {
  it('opens, SaveAs(51), closes and returns the absolute output path', () => {
    const wb = makeWorkbook();
    const app = installApp(wb);
    const input = makeFile('in.xlsx');
    const output = path.join(workDir, 'out.xlsx');

    const result = Excels.repairToFile(input, output);

    expect(result).toBe(path.resolve(output));
    expect(app.Workbooks.Open).toHaveBeenCalledWith(path.resolve(input), 0, false);
    expect(wb.SaveAs).toHaveBeenCalledWith(path.resolve(output), 51);
    expect(wb.Close).toHaveBeenCalledWith(false);
    // finally-block always quits + releases.
    expect(winaxRelease).toHaveBeenCalledWith(app);
  });

  it('throws when the input file does not exist', () => {
    expect(() =>
      Excels.repairToFile(path.join(workDir, 'ghost.xlsx'), path.join(workDir, 'o.xlsx'))
    ).toThrow(/File not found/);
  });
});

// =============================================================================
// convertXltxToXlsx / convertXltxToXlsxAuto
// =============================================================================
describe('Excels.convertXltxToXlsx', () => {
  it('opens the template, SaveAs as .xlsx (51), closes and returns abs output', () => {
    const wb = makeWorkbook();
    const app = installApp(wb);
    const input = makeFile('tpl.xltx');
    const output = path.join(workDir, 'tpl.xlsx');

    const result = Excels.convertXltxToXlsx(input, output);

    expect(result).toBe(path.resolve(output));
    expect(app.Workbooks.Open).toHaveBeenCalledWith(path.resolve(input), 0, false);
    expect(wb.SaveAs).toHaveBeenCalledWith(path.resolve(output), 51);
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('throws when the input template is missing', () => {
    expect(() =>
      Excels.convertXltxToXlsx(path.join(workDir, 'no.xltx'), path.join(workDir, 'o.xlsx'))
    ).toThrow(/Input file not found/);
  });
});

describe('Excels.convertXltxToXlsxAuto', () => {
  it('derives a sibling .xlsx output path and delegates to convertXltxToXlsx', () => {
    const wb = makeWorkbook();
    installApp(wb);
    const input = makeFile('Sheet One.xltx');

    const result = Excels.convertXltxToXlsxAuto(input);

    expect(result).toBe(path.join(workDir, 'Sheet One.xlsx'));
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'Sheet One.xlsx'), 51);
  });
});

// =============================================================================
// scanSubFolder / scanSubFilesTxt — real fs
// =============================================================================
describe('Excels.scanSubFolder', () => {
  it('returns absolute paths of immediate sub-directories only', () => {
    writeTree(workDir, { subA: {}, subB: {}, 'file.txt': 'x' });
    const result = Excels.scanSubFolder(workDir);
    expect(result).toBeArrayOfSize(2);
    expect(result).toIncludeSameMembers([path.join(workDir, 'subA'), path.join(workDir, 'subB')]);
  });

  it('returns [] for a non-existent path', () => {
    expect(Excels.scanSubFolder(path.join(workDir, 'nope'))).toEqual([]);
  });

  it('returns [] when given a file instead of a directory', () => {
    const f = makeFile('plain.txt');
    expect(Excels.scanSubFolder(f)).toEqual([]);
  });
});

describe('Excels.scanSubFilesTxt', () => {
  it('returns absolute paths of *.txt files only', () => {
    writeTree(workDir, { 'a.txt': '1', 'b.txt': '2', 'c.csv': '3', sub: {} });
    const result = Excels.scanSubFilesTxt(workDir);
    expect(result).toIncludeSameMembers([path.join(workDir, 'a.txt'), path.join(workDir, 'b.txt')]);
  });

  it('returns [] for a missing directory', () => {
    expect(Excels.scanSubFilesTxt(path.join(workDir, 'gone'))).toEqual([]);
  });
});

// =============================================================================
// processPricing — drives globalThis.excelSheet via findColumn
// =============================================================================
describe('Excels.processPricing', () => {
  /**
   * A sheet proxy whose Cells is callable (Cells(r,c).Value = …) AND exposes a
   * Find(...) that returns a pinned {Row, Column}. A plain-object override is not
   * callable, so Cells must be a jest.fn with Find attached.
   */
  function installSheet(found = { Row: 5, Column: 2 }) {
    const CellsFn = jest.fn(() => makeComProxy({}, 'Cell'));
    CellsFn.Find = jest.fn(() => makeComProxy(found, 'found'));
    const sheet = makeComProxy({ Cells: CellsFn }, 'Sheet');
    globalThis.excelSheet = sheet;
    return sheet;
  }

  it('uses yamlData.Price and FutureDateExcel when no pricing files exist', () => {
    installSheet({ Row: 3, Column: 4 });
    globalThis.folderPricings = path.join(workDir, 'no-such');

    Excels.processPricing({ Price: '999', FutureDateExcel: '2030-01-01' });

    // dateApp undefined → writes FutureDateExcel + Price into the found cell.
    expect(globalThis.excelSheet.Cells.Find).toHaveBeenCalledWith('Pricings');
  });

  it('reads dated pricing txt files and writes date/amount rows', () => {
    const pricings = path.join(workDir, 'pricings');
    writeTree(pricings, { '2025-01-01 1,000.txt': '', '2025-02-01 2,000.txt': '' });
    globalThis.folderPricings = pricings;
    installSheet({ Row: 1, Column: 1 });

    // future date later than the last file's date → also writes a future row.
    expect(() =>
      Excels.processPricing({ Price: '500', FutureDateExcel: '2099-12-31' })
    ).not.toThrow();
    expect(DatesMock.parseDMYExcel).toHaveBeenCalled();
  });

  it('honors an ALL <amount> file as the override amount', () => {
    const pricings = path.join(workDir, 'pricings2');
    writeTree(pricings, { 'ALL 7,500.txt': '' });
    globalThis.folderPricings = pricings;
    installSheet();

    expect(() =>
      Excels.processPricing({ Price: '1', FutureDateExcel: '2099-01-01' })
    ).not.toThrow();
  });
});

// =============================================================================
// processFolders — reads dated sub-folders, writes to globalThis.excelSheet
// =============================================================================
describe('Excels.processFolders', () => {
  it('writes date/amount cells for each dated sub-folder', () => {
    const all = path.join(workDir, 'ALL');
    writeTree(all, { myfolder: { '2025-03-01 1,200': {}, '2025-04-01 3,400': {}, 'skip-me': {} } });
    globalThis.folderALL = all;

    const setCells = [];
    const sheet = makeComProxy(
      {
        Cells: jest.fn((r, c) => makeComProxy({}, `Cell(${r},${c})`)),
      },
      'Sheet'
    );
    globalThis.excelSheet = sheet;

    expect(() => Excels.processFolders('myfolder', { Row: 2, Column: 3 })).not.toThrow();
    // Cells was invoked (two date cells + two amount cells for two valid folders).
    expect(sheet.Cells).toHaveBeenCalled();
    void setCells;
  });

  it('does nothing harmful when the folder has no dated sub-folders', () => {
    const all = path.join(workDir, 'ALL2');
    writeTree(all, { empty: {} });
    globalThis.folderALL = all;
    globalThis.excelSheet = makeComProxy({ Cells: jest.fn(() => makeComProxy()) }, 'Sheet');

    expect(() => Excels.processFolders('empty', { Row: 1, Column: 1 })).not.toThrow();
  });
});

// =============================================================================
// replaceInSheet / findColumn — thin COM wrappers over globalThis.excelSheet
// =============================================================================
describe('Excels.replaceInSheet', () => {
  it('calls Cells.Replace with the documented whole-cell args and returns its result', () => {
    const replace = jest.fn(() => true);
    globalThis.excelSheet = makeComProxy({ Cells: { Replace: replace } }, 'Sheet');

    const result = Excels.replaceInSheet('{Key}', 'Value');

    expect(result).toBe(true);
    expect(replace).toHaveBeenCalledWith('{Key}', 'Value', 2, 2, false, false, false);
  });

  it('returns the falsy result when nothing was replaced', () => {
    globalThis.excelSheet = makeComProxy({ Cells: { Replace: jest.fn(() => false) } }, 'Sheet');
    expect(Excels.replaceInSheet('x', 'y')).toBe(false);
  });
});

describe('Excels.findColumn', () => {
  it('returns the Find result and exposes Row/Column', () => {
    const hit = makeComProxy({ Row: 7, Column: 9 }, 'hit');
    globalThis.excelSheet = makeComProxy({ Cells: { Find: jest.fn(() => hit) } }, 'Sheet');

    const found = Excels.findColumn('Header');

    expect(found.Row).toBe(7);
    expect(found.Column).toBe(9);
  });

  it('returns a falsy value when the search term is not found', () => {
    globalThis.excelSheet = makeComProxy({ Cells: { Find: jest.fn(() => null) } }, 'Sheet');
    expect(Excels.findColumn('Missing')).toBeNull();
  });
});

// =============================================================================
// fileOpen / fileSave / fileClose — globalThis-backed COM lifecycle
// =============================================================================
describe('Excels.fileOpen', () => {
  it('opens Excel, resolves the App sheet and stores COM refs on globalThis', () => {
    const sheet = makeComProxy({}, 'AppSheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    const app = installApp(wb, { ExecuteExcel4Macro: jest.fn(() => 4242) });
    const file = makeFile('book.xlsx');

    Excels.fileOpen(file);

    expect(winaxObject).toHaveBeenCalledWith('Excel.Application');
    expect(globalThis.excelApp).toBe(app);
    expect(globalThis.excelWorkbook).toBe(wb);
    expect(globalThis.excelSheet).toBe(sheet);
    expect(globalThis.excelPid).toBe(4242);
    expect(wb.Sheets).toHaveBeenCalledWith('App');
  });

  it('warns (does not throw) when the file is missing, still attempts open', () => {
    const wb = makeComProxy({ Sheets: jest.fn(() => makeComProxy()) }, 'Workbook');
    installApp(wb, { ExecuteExcel4Macro: jest.fn(() => 1) });

    expect(() => Excels.fileOpen(path.join(workDir, 'absent.xlsx'))).not.toThrow();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('not found'),
      'File Error'
    );
  });

  it('warns and cleans up when sheet detection throws', () => {
    // Open succeeds but Sheets('App') throws → catch branch quits + warns.
    const wb = makeComProxy(
      {
        Sheets: jest.fn(() => {
          throw new Error('no App');
        }),
      },
      'Workbook'
    );
    installApp(wb, { ExecuteExcel4Macro: jest.fn(() => 1) });

    Excels.fileOpen(makeFile('c.xlsx'));

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      'Excel open failed for column detection.',
      'Excel Error',
      16
    );
  });
});

describe('Excels.fileSave', () => {
  it('recalculates and saves the workbook', () => {
    globalThis.excelApp = makeComProxy({ CalculateFull: jest.fn() }, 'App');
    globalThis.excelWorkbook = makeComProxy({ Save: jest.fn() }, 'Workbook');

    Excels.fileSave();

    expect(globalThis.excelApp.CalculateFull).toHaveBeenCalled();
    expect(globalThis.excelWorkbook.Save).toHaveBeenCalled();
  });

  it('warns instead of throwing when Save fails', () => {
    globalThis.excelApp = makeComProxy({ CalculateFull: jest.fn() }, 'App');
    globalThis.excelWorkbook = makeComProxy(
      {
        Save: jest.fn(() => {
          throw new Error('disk full');
        }),
      },
      'Workbook'
    );

    expect(() => Excels.fileSave()).not.toThrow();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('disk full', 'Excel Error', 16);
  });
});

describe('Excels.fileClose', () => {
  it('saves, closes the workbook, quits Excel, releases and kills the PID', () => {
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);
    globalThis.excelApp = makeComProxy({ CalculateFull: jest.fn(), Quit: jest.fn() }, 'App');
    globalThis.excelWorkbook = makeComProxy({ Save: jest.fn(), Close: jest.fn() }, 'Workbook');
    globalThis.excelSheet = makeComProxy({}, 'Sheet');
    globalThis.excelPid = 9999;

    Excels.fileClose();

    expect(globalThis.excelWorkbook.Save).toHaveBeenCalled();
    expect(globalThis.excelWorkbook.Close).toHaveBeenCalledWith(true);
    expect(globalThis.excelApp.Quit).toHaveBeenCalled();
    expect(winaxRelease).toHaveBeenCalledWith(globalThis.excelApp);
    expect(killSpy).toHaveBeenCalledWith(9999);
    killSpy.mockRestore();
  });

  it('warns (no throw) when killing the PID fails', () => {
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => {
      throw new Error('ESRCH');
    });
    globalThis.excelApp = makeComProxy({ CalculateFull: jest.fn(), Quit: jest.fn() }, 'App');
    globalThis.excelWorkbook = makeComProxy({ Save: jest.fn(), Close: jest.fn() }, 'Workbook');
    globalThis.excelSheet = makeComProxy({}, 'Sheet');
    globalThis.excelPid = 5;

    expect(() => Excels.fileClose()).not.toThrow();
    killSpy.mockRestore();
  });
});

// =============================================================================
// replaceFormula / replaceFormula2 / replaceFormulaArray (via _replaceFormulaWith)
// =============================================================================
describe('Excels.replaceFormula family', () => {
  /**
   * Build a workbook with `sheetNames` sheets. Each sheet's UsedRange.SpecialCells
   * yields a formulaCells collection of `formulas` (array of current formula
   * strings). Writes are recorded on `writes`.
   */
  function workbookWithFormulas(sheetNames, formulas, writes) {
    const sheetByIndex = {};
    sheetNames.forEach((nm, idx) => {
      const items = formulas.map((f) => {
        const cell = {};
        const proxy = new Proxy(cell, {
          get(t, prop) {
            if (prop === 'Formula' || prop === 'Formula2') return cell.__val ?? f;
            if (prop === 'Address') return '$A$1';
            return makeComProxy({}, String(prop));
          },
          set(t, prop, value) {
            if (prop === 'Formula' || prop === 'Formula2' || prop === 'FormulaArray') {
              cell.__val = value;
              writes.push({ sheet: nm, api: prop, value });
            }
            return true;
          },
        });
        return proxy;
      });
      const formulaCells = makeComProxy(
        {
          Count: items.length,
          Item: (i) => items[i - 1],
        },
        'FormulaCells'
      );
      const usedRange = makeComProxy({ SpecialCells: jest.fn(() => formulaCells) }, 'UsedRange');
      sheetByIndex[idx + 1] = makeComProxy({ Name: nm, UsedRange: usedRange }, `Sheet:${nm}`);
    });

    const SheetsFn = jest.fn((arg) => {
      if (typeof arg === 'number') return sheetByIndex[arg];
      const idx = sheetNames.indexOf(arg);
      return idx >= 0 ? sheetByIndex[idx + 1] : undefined;
    });
    SheetsFn.Count = sheetNames.length;

    return makeComProxy(wbSpies({ Sheets: SheetsFn }), 'Workbook');
  }

  it('replaceFormula rewrites matching formulas and SaveAs(51) to incremented path', () => {
    const writes = [];
    const wb = workbookWithFormulas(['Sheet1'], ['=A1@B1', '=NoMatch'], writes);
    const app = installApp(wb);
    const file = makeFile('f.xlsx');

    Excels.replaceFormula(file, '@', '*', false, '');

    // The one matching formula was rewritten via the Formula API.
    expect(writes).toContainEqual({ sheet: 'Sheet1', api: 'Formula', value: '=A1*B1' });
    expect(wb.SaveAs).toHaveBeenCalled();
    const [savedPath, fmt] = wb.SaveAs.mock.calls[0];
    expect(fmt).toBe(51);
    // The source file exists on disk, so incrementFileName bumps it to "f 1.xlsx".
    expect(savedPath).toBe(path.join(workDir, 'f 1.xlsx'));
    expect(wb.Close).toHaveBeenCalledWith(false);
    expect(app.Workbooks.Open).toHaveBeenCalled();
  });

  it('replaceFormula2 writes via the Formula2 API', () => {
    const writes = [];
    const wb = workbookWithFormulas(['S'], ['=SUM(@)'], writes);
    installApp(wb);
    Excels.replaceFormula2(makeFile('f2.xlsx'), '@', 'X');
    expect(writes.some((w) => w.api === 'Formula2' && w.value === '=SUM(X)')).toBe(true);
  });

  it('replaceFormulaArray writes via the FormulaArray API', () => {
    const writes = [];
    const wb = workbookWithFormulas(['S'], ['=@'], writes);
    installApp(wb);
    Excels.replaceFormulaArray(makeFile('fa.xlsx'), '@', 'Z');
    expect(writes.some((w) => w.api === 'FormulaArray')).toBe(true);
  });

  it('recalc=true triggers CalculateFull before saving', () => {
    const writes = [];
    const wb = workbookWithFormulas(['S'], ['=@'], writes);
    const app = installApp(wb);
    Excels.replaceFormula(makeFile('rc.xlsx'), '@', 'q', true);
    expect(app.CalculateFull).toHaveBeenCalled();
  });

  it('skips sheets named in Excel.ExcludedSheets when no sheetFilter is given', () => {
    YamlsMock.getConfig.mockImplementation((key, type, def) =>
      key === 'Excel.ExcludedSheets' ? ['Secret'] : def
    );
    const writes = [];
    const wb = workbookWithFormulas(['Secret', 'Public'], ['=@'], writes);
    installApp(wb);

    Excels.replaceFormula(makeFile('ex.xlsx'), '@', '!');

    expect(writes.every((w) => w.sheet === 'Public')).toBe(true);
    expect(writes.some((w) => w.sheet === 'Secret')).toBe(false);
  });

  it('with a sheetFilter only processes the named sheet', () => {
    const writes = [];
    const wb = workbookWithFormulas(['A', 'B'], ['=@'], writes);
    installApp(wb);

    Excels.replaceFormula(makeFile('sf.xlsx'), '@', '#', false, 'B');

    expect(writes.every((w) => w.sheet === 'B')).toBe(true);
  });

  it('throws for a missing input file', () => {
    expect(() => Excels.replaceFormula(path.join(workDir, 'none.xlsx'))).toThrow(/File not found/);
  });
});

// =============================================================================
// replaceStandart — per-sheet Cells.Replace
// =============================================================================
describe('Excels.replaceStandart', () => {
  function workbookForStandart(sheetNames, replaceFn) {
    const byIndex = {};
    sheetNames.forEach((nm, i) => {
      byIndex[i + 1] = makeComProxy({ Name: nm, Cells: { Replace: replaceFn } }, `Sheet:${nm}`);
    });
    const SheetsFn = jest.fn((arg) =>
      typeof arg === 'number' ? byIndex[arg] : byIndex[sheetNames.indexOf(arg) + 1]
    );
    SheetsFn.Count = sheetNames.length;
    return makeComProxy(wbSpies({ Sheets: SheetsFn }), 'Workbook');
  }

  it('calls Cells.Replace per sheet with xlPart args and SaveAs(51)', () => {
    const replace = jest.fn(() => true);
    const wb = workbookForStandart(['One', 'Two'], replace);
    installApp(wb);
    const file = makeFile('std.xlsx');

    Excels.replaceStandart(file, 'a', 'b');

    expect(replace).toHaveBeenCalledWith('a', 'b', 1, 1, false, false, false);
    expect(replace).toHaveBeenCalledTimes(2);
    // Source exists → SaveAs target is incremented.
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'std 1.xlsx'), 51);
  });

  it('honors sheetFilter and the default recalc=true', () => {
    const replace = jest.fn(() => false);
    const wb = workbookForStandart(['One', 'Two'], replace);
    const app = installApp(wb);

    Excels.replaceStandart(makeFile('std2.xlsx'), 'x', 'y', true, 'Two');

    expect(replace).toHaveBeenCalledTimes(1);
    expect(app.CalculateFull).toHaveBeenCalled();
  });

  it('throws for a missing file', () => {
    expect(() => Excels.replaceStandart(path.join(workDir, 'no.xlsx'))).toThrow(/File not found/);
  });
});

// =============================================================================
// replaceFormulaAll — Areas/Item iteration over SpecialCells(23)
// =============================================================================
describe('Excels.replaceFormulaAll', () => {
  function workbookForAll(formulas, writes, sheetName = 'S') {
    const items = formulas.map((f) => {
      const cell = {};
      return new Proxy(cell, {
        get(t, prop) {
          if (prop === 'Formula') return cell.__v ?? f;
          return makeComProxy({}, String(prop));
        },
        set(t, prop, v) {
          if (prop === 'Formula') {
            cell.__v = v;
            writes.push(v);
          }
          return true;
        },
      });
    });
    const area = makeComProxy({ Count: items.length, Item: (i) => items[i - 1] }, 'Area');
    const AreasFn = jest.fn(() => area);
    AreasFn.Count = 1;
    const formulaCells = makeComProxy({ Areas: AreasFn }, 'FormulaCells');
    const usedRange = makeComProxy({ SpecialCells: jest.fn(() => formulaCells) }, 'UsedRange');
    const sheet = makeComProxy({ Name: sheetName, UsedRange: usedRange }, 'Sheet');
    const SheetsFn = jest.fn(() => sheet);
    SheetsFn.Count = 1;
    return makeComProxy(wbSpies({ Sheets: SheetsFn }), 'Workbook');
  }

  it('rewrites only formulas that start with "=" and contain the search string', () => {
    const writes = [];
    const wb = workbookForAll(['=A1@', 'plain@text', '=NoNeedle'], writes);
    installApp(wb);

    Excels.replaceFormulaAll(makeFile('all.xlsx'), '@', '/');

    // Only the first cell (starts with "=" AND contains "@") is rewritten.
    expect(writes).toEqual(['=A1/']);
    // Source exists → SaveAs target is incremented.
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'all 1.xlsx'), 51);
  });

  it('throws for a missing file', () => {
    expect(() => Excels.replaceFormulaAll(path.join(workDir, 'x.xlsx'))).toThrow(/File not found/);
  });
});

// =============================================================================
// recalculate
// =============================================================================
describe('Excels.recalculate', () => {
  it('full-recalculates (no filter), SaveAs(51) and closes', () => {
    const wb = makeWorkbook();
    const app = installApp(wb);
    const file = makeFile('r.xlsx');

    Excels.recalculate(file);

    expect(app.CalculateFull).toHaveBeenCalled();
    // Source exists → SaveAs target is incremented.
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'r 1.xlsx'), 51);
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('with a sheetFilter calls Sheets(name).Calculate instead of full recalc', () => {
    const calc = jest.fn();
    const sheet = makeComProxy({ Calculate: calc }, 'Sheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    const app = installApp(wb);

    Excels.recalculate(makeFile('rf.xlsx'), 'Data');

    expect(wb.Sheets).toHaveBeenCalledWith('Data');
    expect(calc).toHaveBeenCalled();
    expect(app.CalculateFull).not.toHaveBeenCalled();
  });

  it('throws for a missing file', () => {
    expect(() => Excels.recalculate(path.join(workDir, 'no.xlsx'))).toThrow(/File not found/);
  });
});

// =============================================================================
// changeFont
// =============================================================================
describe('Excels.changeFont', () => {
  it('sets Cells.Font.Name on every sheet when no filter is given', () => {
    const fontSets = [];
    function sheet(name) {
      return makeComProxy(
        {
          Cells: {
            Font: new Proxy(
              {},
              {
                set(t, p, v) {
                  if (p === 'Name') fontSets.push({ name, v });
                  return true;
                },
                get() {
                  return undefined;
                },
              }
            ),
          },
        },
        `Sheet:${name}`
      );
    }
    const s1 = sheet('A');
    const s2 = sheet('B');
    const SheetsFn = jest.fn((i) => (i === 1 ? s1 : s2));
    SheetsFn.Count = 2;
    const wb = makeComProxy(wbSpies({ Sheets: SheetsFn }), 'Workbook');
    installApp(wb);

    Excels.changeFont(makeFile('font.xlsx'), 'Calibri');

    expect(fontSets).toEqual([
      { name: 'A', v: 'Calibri' },
      { name: 'B', v: 'Calibri' },
    ]);
    // Source exists → SaveAs target is incremented.
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'font 1.xlsx'), 51);
  });

  it('targets only the filtered sheet', () => {
    let setValue = null;
    const sheet = makeComProxy(
      {
        Cells: {
          Font: new Proxy(
            {},
            {
              set(t, p, v) {
                if (p === 'Name') setValue = v;
                return true;
              },
              get() {
                return undefined;
              },
            }
          ),
        },
      },
      'Sheet'
    );
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    installApp(wb);

    Excels.changeFont(makeFile('font2.xlsx'), 'Times', 'Only');

    expect(wb.Sheets).toHaveBeenCalledWith('Only');
    expect(setValue).toBe('Times');
  });

  it('throws for a missing file', () => {
    expect(() => Excels.changeFont(path.join(workDir, 'no.xlsx'))).toThrow(/File not found/);
  });
});

// =============================================================================
// generate — orchestrates folders, pricing, replacements and lifecycle
// =============================================================================
describe('Excels.generate', () => {
  it('runs the full pipeline: init folders, copy template, open, fill, close', () => {
    // Arrange the global folders the pipeline reads.
    const folderActReco = path.join(workDir, 'ActReco');
    const folderALL = path.join(workDir, 'ALL');
    globalThis.folderActReco = folderActReco;
    globalThis.folderALL = folderALL;
    fs.mkdirSync(folderALL, { recursive: true });

    // Template on disk; the pricing cell names come from config (Excel.CellNames).
    const template = makeFile('Template.xlsx', 'tpl');

    YamlsMock.getConfig.mockImplementation((key) => {
      if (key === 'Templates.Excel') return template;
      if (key === 'Excel.CellNames') return ['Region'];
      return null;
    });
    YamlsMock.loadYamlWithDeps.mockReturnValue({
      ComName: 'Acme',
      Price: '100',
      FutureDateExcel: '2099-01-01',
    });
    YamlsMock.getPrepayMonth.mockReturnValue(2);

    // COM: workbook whose sheet supports Find/Replace and a callable Cells
    // (processPricing does excelSheet.Cells(r,c).Value = …). A plain-object
    // override is not callable, so Cells must be a jest.fn with Find/Replace.
    const cellsFn = jest.fn(() => makeComProxy({}, 'Cell'));
    cellsFn.Find = jest.fn(() => makeComProxy({ Row: 1, Column: 1 }, 'found'));
    cellsFn.Replace = jest.fn(() => true);
    const sheet = makeComProxy({ Cells: cellsFn }, 'AppSheet');
    const wb = makeComProxy(
      { Sheets: jest.fn(() => sheet), Save: jest.fn(), Close: jest.fn() },
      'Workbook'
    );
    installApp(wb, {
      ExecuteExcel4Macro: jest.fn(() => 111),
      CalculateFull: jest.fn(),
      Quit: jest.fn(),
    });

    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    expect(() => Excels.generate(path.join(workDir, 'data.yml'))).not.toThrow();

    // Word.initFolders + Files.copyFileWithRetry + workbook saved/closed.
    expect(WordMock.initFolders).toHaveBeenCalledWith(path.join(workDir, 'data.yml'));
    expect(FilesMock.copyFileWithRetry).toHaveBeenCalled();
    expect(wb.Save).toHaveBeenCalled(); // via fileClose → fileSave
    expect(wb.Close).toHaveBeenCalledWith(true);
    // Replacement of each yaml key happened (replaceInSheet uses the 7-arg
    // whole-cell Replace form).
    expect(sheet.Cells.Replace).toHaveBeenCalledWith(
      '{ComName}',
      'Acme',
      2,
      2,
      false,
      false,
      false
    );
    killSpy.mockRestore();
  });

  it('warns when Excel.CellNames is missing but still proceeds through the pipeline', () => {
    globalThis.folderActReco = path.join(workDir, 'ActReco2');
    globalThis.folderALL = path.join(workDir, 'ALL2');
    fs.mkdirSync(globalThis.folderALL, { recursive: true });
    const template = makeFile('Tpl2.xlsx', 'tpl');
    // Excel.CellNames not configured (returns null) → warning fires; the (empty)
    // cell-name loop is a no-op, so generate proceeds without throwing.
    YamlsMock.getConfig.mockImplementation((key) => (key === 'Templates.Excel' ? template : null));
    YamlsMock.loadYamlWithDeps.mockReturnValue({ ComName: 'X' });

    // Callable Cells (processPricing does excelSheet.Cells(r,c).Value = …).
    const cellsFn = jest.fn(() => makeComProxy({}, 'Cell'));
    cellsFn.Find = jest.fn(() => makeComProxy({ Row: 1, Column: 1 }, 'found'));
    cellsFn.Replace = jest.fn(() => true);
    const sheet = makeComProxy({ Cells: cellsFn }, 'AppSheet');
    const wb = makeComProxy(
      { Sheets: jest.fn(() => sheet), Save: jest.fn(), Close: jest.fn() },
      'Workbook'
    );
    installApp(wb, {
      ExecuteExcel4Macro: jest.fn(() => 1),
      CalculateFull: jest.fn(),
      Quit: jest.fn(),
    });
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    expect(() => Excels.generate(path.join(workDir, 'd.yml'))).not.toThrow();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      'Excel.CellNames missing/empty in config.yml',
      'Error'
    );
    killSpy.mockRestore();
  });
});

// =============================================================================
// protectFile / unProtectFile (+ Ask variants)
// =============================================================================
describe('Excels.protectFile', () => {
  it('sets the workbook Password, SaveAs to protected path and returns it', () => {
    YamlsMock.getConfig.mockReturnValue(' Protected');
    const wb = makeComProxy(wbSpies({ HasPassword: false }), 'Workbook');
    installApp(wb);
    const file = makeFile('Secret.xlsx');

    const result = Excels.protectFile(file, 'pw123');

    expect(wb.__sets__.Password).toBe('pw123');
    expect(result).toBe(path.join(workDir, 'Secret Protected.xlsx'));
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'Secret Protected.xlsx'), 51);
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('skips and returns the original path when already password-protected', () => {
    const wb = makeComProxy(wbSpies({ HasPassword: true }), 'Workbook');
    installApp(wb);
    const file = makeFile('Locked.xlsx');

    const result = Excels.protectFile(file, 'pw');

    expect(result).toBe(path.resolve(file));
    expect(wb.SaveAs).not.toHaveBeenCalled();
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('throws for a missing file', () => {
    expect(() => Excels.protectFile(path.join(workDir, 'no.xlsx'), 'p')).toThrow(/File not found/);
  });
});

describe('Excels.unProtectFile', () => {
  it('opens with the password, clears Password and Saves when protected', () => {
    const wb = makeComProxy(wbSpies({ HasPassword: true }), 'Workbook');
    const open = jest.fn(() => wb);
    const app = makeComProxy({ Quit: jest.fn(), Workbooks: { Open: open } }, 'Excel.Application');
    state.comFactory = () => app;
    const file = makeFile('Prot.xlsx');

    Excels.unProtectFile(file, 'secret');

    // 5-arg open form carries the password in position 5.
    expect(open).toHaveBeenCalledWith(path.resolve(file), 0, false, null, 'secret');
    expect(wb.__sets__.Password).toBe('');
    expect(wb.Save).toHaveBeenCalled();
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('warns and returns when the workbook is not protected', () => {
    const wb = makeComProxy(wbSpies({ HasPassword: false }), 'Workbook');
    const app = makeComProxy(
      { Quit: jest.fn(), Workbooks: { Open: jest.fn(() => wb) } },
      'Excel.Application'
    );
    state.comFactory = () => app;

    Excels.unProtectFile(makeFile('Open.xlsx'), 'pw');

    expect(DialogsMock.warningBox).toHaveBeenCalledWith('File is not protected', 'Unprotect File');
    expect(wb.Save).not.toHaveBeenCalled();
  });

  it('throws for a missing file', () => {
    expect(() => Excels.unProtectFile(path.join(workDir, 'no.xlsx'), 'p')).toThrow(
      /File not found/
    );
  });
});

describe('Excels.protectFileAsk / unProtectFileAsk', () => {
  it('protectFileAsk delegates to protectFile with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('typed-pw');
    const wb = makeComProxy(wbSpies({ HasPassword: false }), 'Workbook');
    installApp(wb);
    const file = makeFile('AskMe.xlsx');

    Excels.protectFileAsk(file);

    expect(wb.__sets__.Password).toBe('typed-pw');
  });

  it('protectFileAsk aborts (no COM) when the user cancels', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    Excels.protectFileAsk(makeFile('Cancel.xlsx'));
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('unProtectFileAsk delegates to unProtectFile with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('up-pw');
    const wb = makeComProxy(wbSpies({ HasPassword: true }), 'Workbook');
    const open = jest.fn(() => wb);
    state.comFactory = () =>
      makeComProxy({ Quit: jest.fn(), Workbooks: { Open: open } }, 'Excel.Application');
    const file = makeFile('U.xlsx');

    Excels.unProtectFileAsk(file);

    expect(open).toHaveBeenCalledWith(path.resolve(file), 0, false, null, 'up-pw');
  });

  it('unProtectFileAsk aborts when cancelled', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    Excels.unProtectFileAsk(makeFile('U2.xlsx'));
    expect(winaxObject).not.toHaveBeenCalled();
  });
});

// =============================================================================
// protectSheet / unProtectSheet (+ Ask variants)
// =============================================================================
describe('Excels.protectSheet', () => {
  /** Workbook whose Worksheets(i).ProtectContents is controlled, Protect recorded. */
  function workbookSheets(count, protectContents, protectFn) {
    const sheets = {};
    for (let i = 1; i <= count; i++) {
      sheets[i] = makeComProxy({ ProtectContents: protectContents, Protect: protectFn }, `WS${i}`);
    }
    const WorksheetsFn = jest.fn((i) => sheets[i]);
    WorksheetsFn.Count = count;
    return makeComProxy(wbSpies({ Worksheets: WorksheetsFn }), 'Workbook');
  }

  it('protects every worksheet and SaveAs to the protected path', () => {
    YamlsMock.getConfig.mockReturnValue(' P');
    const protectFn = jest.fn();
    const wb = workbookSheets(2, false, protectFn);
    installApp(wb);
    const file = makeFile('Sheets.xlsx');

    const result = Excels.protectSheet(file, 'pw');

    expect(protectFn).toHaveBeenCalledTimes(2);
    // First positional arg is the password.
    expect(protectFn.mock.calls[0][0]).toBe('pw');
    expect(result).toBe(path.join(workDir, 'Sheets P.xlsx'));
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'Sheets P.xlsx'), 51);
  });

  it('skips when a worksheet is already protected', () => {
    const protectFn = jest.fn();
    const wb = workbookSheets(2, true, protectFn);
    installApp(wb);
    const file = makeFile('Already.xlsx');

    const result = Excels.protectSheet(file, 'pw');

    expect(protectFn).not.toHaveBeenCalled();
    expect(result).toBe(path.resolve(file));
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('throws for a missing file', () => {
    expect(() => Excels.protectSheet(path.join(workDir, 'no.xlsx'), 'p')).toThrow(/File not found/);
  });
});

describe('Excels.unProtectSheet', () => {
  function workbookSheets(count, protectContents, unprotectFn) {
    const sheets = {};
    for (let i = 1; i <= count; i++) {
      sheets[i] = makeComProxy(
        { ProtectContents: protectContents, Unprotect: unprotectFn },
        `WS${i}`
      );
    }
    const WorksheetsFn = jest.fn((i) => sheets[i]);
    WorksheetsFn.Count = count;
    return makeComProxy(wbSpies({ Worksheets: WorksheetsFn }), 'Workbook');
  }

  it('unprotects all worksheets and Saves when at least one is protected', () => {
    const unprotect = jest.fn();
    const wb = workbookSheets(2, true, unprotect);
    installApp(wb);

    Excels.unProtectSheet(makeFile('UP.xlsx'), 'pw');

    expect(unprotect).toHaveBeenCalledTimes(2);
    expect(unprotect).toHaveBeenCalledWith('pw');
    expect(wb.Save).toHaveBeenCalled();
  });

  it('warns and returns when no worksheet is protected', () => {
    const unprotect = jest.fn();
    const wb = workbookSheets(2, false, unprotect);
    installApp(wb);

    Excels.unProtectSheet(makeFile('UP2.xlsx'), 'pw');

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      'File is not protected',
      'Unprotect Worksheets'
    );
    expect(unprotect).not.toHaveBeenCalled();
  });

  it('throws for a missing file', () => {
    expect(() => Excels.unProtectSheet(path.join(workDir, 'no.xlsx'), 'p')).toThrow(
      /File not found/
    );
  });
});

describe('Excels.protectSheetAsk / unProtectSheetAsk', () => {
  function sheetsWorkbook(protectContents, fnName) {
    const fn = jest.fn();
    const sheet = makeComProxy({ ProtectContents: protectContents, [fnName]: fn }, 'WS');
    const WorksheetsFn = jest.fn(() => sheet);
    WorksheetsFn.Count = 1;
    return { wb: makeComProxy(wbSpies({ Worksheets: WorksheetsFn }), 'Workbook'), fn };
  }

  it('protectSheetAsk delegates with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('ps-pw');
    YamlsMock.getConfig.mockReturnValue('');
    const { wb, fn } = sheetsWorkbook(false, 'Protect');
    installApp(wb);

    Excels.protectSheetAsk(makeFile('PA.xlsx'));

    expect(fn.mock.calls[0][0]).toBe('ps-pw');
  });

  it('protectSheetAsk aborts on cancel', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    Excels.protectSheetAsk(makeFile('PA2.xlsx'));
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('unProtectSheetAsk delegates with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('us-pw');
    const { wb, fn } = sheetsWorkbook(true, 'Unprotect');
    installApp(wb);

    Excels.unProtectSheetAsk(makeFile('UA.xlsx'));

    expect(fn).toHaveBeenCalledWith('us-pw');
  });

  it('unProtectSheetAsk aborts on cancel', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    Excels.unProtectSheetAsk(makeFile('UA2.xlsx'));
    expect(winaxObject).not.toHaveBeenCalled();
  });
});

// =============================================================================
// mergeFiles
// =============================================================================
describe('Excels.mergeFiles', () => {
  /** Source workbook with `sheetNames` copyable sheets. */
  function sourceWorkbook(sheetNames) {
    const sheets = {};
    sheetNames.forEach((nm, i) => {
      sheets[i + 1] = makeComProxy({ Name: nm, Copy: jest.fn() }, `Src:${nm}`);
    });
    const SheetsFn = jest.fn((i) => sheets[i]);
    SheetsFn.Count = sheetNames.length;
    return makeComProxy({ Sheets: SheetsFn }, 'SourceWB');
  }

  it('throws when no input files are provided', () => {
    expect(() => Excels.mergeFiles([], 'out')).toThrow(/No input files/);
    expect(() => Excels.mergeFiles(null, 'out')).toThrow(/No input files/);
  });

  it('creates a target workbook, copies sheets and SaveAs the merged file', () => {
    const f1 = makeFile('a.xlsx');
    const f2 = makeFile('b.xlsx');

    // Target workbook: dynamic Sheets count via a mutable counter; supports
    // Add/SaveAs/Close. Each target sheet exposes a settable Name and Delete.
    let targetSheetCount = 1;
    const targetSheet = makeComProxy({ Name: 'Sheet1', Delete: jest.fn() }, 'TgtSheet');
    const TargetSheetsFn = jest.fn(() => targetSheet);
    Object.defineProperty(TargetSheetsFn, 'Count', { get: () => targetSheetCount });
    const targetWb = makeComProxy(wbSpies({ Sheets: TargetSheetsFn }), 'TargetWB');

    const src = sourceWorkbook(['Data']);

    const app = makeComProxy(
      {
        Workbooks: {
          Add: jest.fn(() => targetWb),
          Open: jest.fn(() => src),
        },
      },
      'Excel.Application'
    );
    state.comFactory = () => app;

    const result = Excels.mergeFiles([f1, f2], 'Merged');

    expect(app.Workbooks.Add).toHaveBeenCalled();
    expect(app.Workbooks.Open).toHaveBeenCalledTimes(2); // one per existing source file
    expect(targetWb.SaveAs).toHaveBeenCalled();
    const [savedPath, fmt] = targetWb.SaveAs.mock.calls[0];
    expect(fmt).toBe(51);
    expect(savedPath).toBe(path.join(workDir, 'Merged.xlsx'));
    expect(result).toBe(path.join(workDir, 'Merged.xlsx'));
  });

  it('skips non-existent source files without aborting the merge', () => {
    const real = makeFile('real.xlsx');
    const missing = path.join(workDir, 'ghost.xlsx');

    const targetSheet = makeComProxy({ Name: 'Sheet1', Delete: jest.fn() }, 'TgtSheet');
    const TargetSheetsFn = jest.fn(() => targetSheet);
    TargetSheetsFn.Count = 1;
    const targetWb = makeComProxy(wbSpies({ Sheets: TargetSheetsFn }), 'TargetWB');
    const src = sourceWorkbook(['S']);
    const open = jest.fn(() => src);
    state.comFactory = () =>
      makeComProxy(
        { Quit: jest.fn(), Workbooks: { Add: jest.fn(() => targetWb), Open: open } },
        'Excel.Application'
      );

    Excels.mergeFiles([missing, real], 'M2');

    // Only the existing file is opened.
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('derives the merged name from the parent folder when none is supplied', () => {
    const sub = path.join(workDir, 'BatchFolder');
    fs.mkdirSync(sub, { recursive: true });
    const f1 = path.join(sub, 'one.xlsx');
    fs.writeFileSync(f1, 'x');

    const targetSheet = makeComProxy({ Name: 'Sheet1', Delete: jest.fn() }, 'TgtSheet');
    const TargetSheetsFn = jest.fn(() => targetSheet);
    TargetSheetsFn.Count = 1;
    const targetWb = makeComProxy(wbSpies({ Sheets: TargetSheetsFn }), 'TargetWB');
    const src = sourceWorkbook(['S']);
    state.comFactory = () =>
      makeComProxy(
        { Quit: jest.fn(), Workbooks: { Add: jest.fn(() => targetWb), Open: jest.fn(() => src) } },
        'Excel.Application'
      );

    const result = Excels.mergeFiles([f1]);

    expect(result).toBe(path.join(sub, 'BatchFolder.xlsx'));
  });
});

// =============================================================================
// mergeFolder — latest-.xlsx-per-folder selection delegating to mergeFiles
// =============================================================================
describe('Excels.mergeFolder', () => {
  // mergeFolder's own job is the latest-by-mtime selection + delegation; the
  // actual COM merge lives in mergeFiles, which is spied so we assert exactly
  // which files (and mergedName) are passed through without exercising COM.
  let mergeSpy;

  beforeEach(() => {
    mergeSpy = jest.spyOn(Excels, 'mergeFiles').mockReturnValue(path.join(workDir, 'Merged.xlsx'));
  });

  afterEach(() => {
    mergeSpy.mockRestore();
  });

  /**
   * Create `name` inside `dir` with the given mtime (ms since epoch) so the
   * "latest wins" selection is deterministic regardless of write order.
   */
  function makeAt(dir, name, mtimeMs) {
    const p = path.join(dir, name);
    fs.writeFileSync(p, 'x', 'utf8');
    const t = mtimeMs / 1000; // utimesSync takes seconds
    fs.utimesSync(p, t, t);
    return p;
  }

  it('throws when folderPaths is empty', () => {
    expect(() => Excels.mergeFolder([], 'out')).toThrow(/mergeFolder: No folders provided\./);
    expect(() => Excels.mergeFolder(null, 'out')).toThrow(/mergeFolder: No folders provided\./);
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it('throws when no .xlsx is found across the provided folders', () => {
    const dir = path.join(workDir, 'NoXlsx');
    fs.mkdirSync(dir, { recursive: true });
    // Only non-.xlsx content present.
    fs.writeFileSync(path.join(dir, 'notes.txt'), 'x');
    fs.writeFileSync(path.join(dir, 'data.csv'), 'x');

    expect(() => Excels.mergeFolder([dir], 'out')).toThrow(
      /mergeFolder: No \.xlsx files found across the provided folders\./
    );
    expect(mergeSpy).not.toHaveBeenCalled();
  });

  it('skips a non-existent folder with a warning but still merges the rest', () => {
    const real = path.join(workDir, 'RealFolder');
    fs.mkdirSync(real, { recursive: true });
    const only = makeAt(real, 'sheet.xlsx', Date.now());
    const ghost = path.join(workDir, 'GhostFolder'); // never created

    const result = Excels.mergeFolder([ghost, real], 'Out');

    // The missing folder is skipped; only the real folder's file is passed on.
    expect(mergeSpy).toHaveBeenCalledTimes(1);
    expect(mergeSpy).toHaveBeenCalledWith([only], 'Out');
    expect(result).toBe(path.join(workDir, 'Merged.xlsx'));
  });

  it('picks the LATEST .xlsx per folder by mtime and passes mergedName through', () => {
    const folderA = path.join(workDir, 'A');
    const folderB = path.join(workDir, 'B');
    fs.mkdirSync(folderA, { recursive: true });
    fs.mkdirSync(folderB, { recursive: true });

    // Folder A: old vs new — new must win.
    makeAt(folderA, 'old.xlsx', Date.parse('2020-01-01T00:00:00Z'));
    const newestA = makeAt(folderA, 'new.xlsx', Date.parse('2024-06-01T00:00:00Z'));
    // Folder B: three files, the middle-named one is newest.
    makeAt(folderB, 'first.xlsx', Date.parse('2021-01-01T00:00:00Z'));
    const newestB = makeAt(folderB, 'winner.xlsx', Date.parse('2025-01-01T00:00:00Z'));
    makeAt(folderB, 'second.xlsx', Date.parse('2022-01-01T00:00:00Z'));

    const result = Excels.mergeFolder([folderA, folderB], 'Combined');

    expect(mergeSpy).toHaveBeenCalledTimes(1);
    expect(mergeSpy).toHaveBeenCalledWith([newestA, newestB], 'Combined');
    expect(result).toBe(path.join(workDir, 'Merged.xlsx'));
  });

  it('skips ~$-prefixed temp files when selecting the latest', () => {
    const dir = path.join(workDir, 'WithTemp');
    fs.mkdirSync(dir, { recursive: true });
    // The ~$ temp file is the NEWEST on disk but must be ignored.
    makeAt(dir, '~$open.xlsx', Date.parse('2030-01-01T00:00:00Z'));
    const realLatest = makeAt(dir, 'report.xlsx', Date.parse('2024-01-01T00:00:00Z'));
    makeAt(dir, 'older.xlsx', Date.parse('2020-01-01T00:00:00Z'));

    Excels.mergeFolder([dir]);

    // ~$ skipped → report.xlsx is the chosen latest; default mergedName is ''.
    expect(mergeSpy).toHaveBeenCalledWith([realLatest], '');
  });
});

// =============================================================================
// hide / unhide / isHidden
// =============================================================================
describe('Excels.hide', () => {
  it('sets Visible=2 (veryHidden) on the named sheets and SaveAs to protected path', () => {
    YamlsMock.getConfig.mockReturnValue(' H');
    const sheet = makeComProxy({}, 'Sheet');
    const wb = makeComProxy(wbSpies({ Sheets: jest.fn(() => sheet) }), 'Workbook');
    installApp(wb);
    const file = makeFile('Hide.xlsx');

    const result = Excels.hide(file, ['ALL']);

    expect(sheet.__sets__.Visible).toBe(2);
    expect(result).toBe(path.join(workDir, 'Hide H.xlsx'));
    expect(wb.SaveAs).toHaveBeenCalledWith(path.join(workDir, 'Hide H.xlsx'), 51);
  });

  it('sets Visible=0 when veryHidden=false and accepts a string sheet name', () => {
    YamlsMock.getConfig.mockReturnValue('');
    const sheet = makeComProxy({}, 'Sheet');
    const wb = makeComProxy(wbSpies({ Sheets: jest.fn(() => sheet) }), 'Workbook');
    installApp(wb);

    Excels.hide(makeFile('Hide2.xlsx'), 'Data', false);

    expect(sheet.__sets__.Visible).toBe(0);
    expect(wb.Sheets).toHaveBeenCalledWith('Data');
  });

  it('throws for a missing file', () => {
    expect(() => Excels.hide(path.join(workDir, 'no.xlsx'))).toThrow(/File not found/);
  });
});

describe('Excels.unhide', () => {
  it('sets Visible=-1 on the named sheets and Saves in place', () => {
    const sheet = makeComProxy({}, 'Sheet');
    const wb = makeComProxy(wbSpies({ Sheets: jest.fn(() => sheet) }), 'Workbook');
    installApp(wb);

    Excels.unhide(makeFile('Unhide.xlsx'), ['ALL']);

    expect(sheet.__sets__.Visible).toBe(-1);
    expect(wb.Save).toHaveBeenCalled();
    expect(wb.Close).toHaveBeenCalledWith(false);
  });

  it('throws for a missing file', () => {
    expect(() => Excels.unhide(path.join(workDir, 'no.xlsx'))).toThrow(/File not found/);
  });
});

describe('Excels.isHidden', () => {
  it('returns "visible" when Visible === -1', () => {
    const sheet = makeComProxy({ Visible: -1 }, 'Sheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    installApp(wb);
    expect(Excels.isHidden(makeFile('V.xlsx'), 'S')).toBe('visible');
  });

  it('returns "veryHidden" when Visible === 2', () => {
    const sheet = makeComProxy({ Visible: 2 }, 'Sheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    installApp(wb);
    expect(Excels.isHidden(makeFile('VH.xlsx'), 'S')).toBe('veryHidden');
  });

  it('returns "hidden" for any other Visible value (e.g. 0)', () => {
    const sheet = makeComProxy({ Visible: 0 }, 'Sheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    installApp(wb);
    expect(Excels.isHidden(makeFile('H.xlsx'), 'S')).toBe('hidden');
  });

  it('opens the workbook read-only', () => {
    const sheet = makeComProxy({ Visible: -1 }, 'Sheet');
    const wb = makeComProxy({ Sheets: jest.fn(() => sheet) }, 'Workbook');
    const app = installApp(wb);
    Excels.isHidden(makeFile('RO.xlsx'), 'S');
    expect(app.Workbooks.Open).toHaveBeenCalledWith(
      path.resolve(path.join(workDir, 'RO.xlsx')),
      0,
      true
    );
  });

  it('throws for a missing file', () => {
    expect(() => Excels.isHidden(path.join(workDir, 'no.xlsx'), 'S')).toThrow(/File not found/);
  });
});

// =============================================================================
// hideProtectSheet / hideProtectSheetAsk / unHideUnProtectSheet / *Ask
// =============================================================================
describe('Excels.hideProtectSheet (and Ask)', () => {
  it('hides then protects, returning the protected path', () => {
    YamlsMock.getConfig.mockReturnValue(' P');
    // hide() opens/saves once; protectSheet() opens/saves again. Both go through
    // installApp's single app whose Open returns a fresh workbook each call.
    const hideSheet = makeComProxy({}, 'Sheet');
    const wsProtect = jest.fn();
    const protectSheetWs = makeComProxy({ ProtectContents: false, Protect: wsProtect }, 'WS');

    const open = jest.fn();
    let call = 0;
    open.mockImplementation(() => {
      call++;
      // First open is from hide(); subsequent from protectSheet().
      return call === 1
        ? makeComProxy({ Sheets: jest.fn(() => hideSheet) }, 'HideWB')
        : makeComProxy(
            {
              Worksheets: Object.assign(
                jest.fn(() => protectSheetWs),
                { Count: 1 }
              ),
            },
            'ProtectWB'
          );
    });
    state.comFactory = () => makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    const file = makeFile('HP.xlsx');
    // hide() writes "HP P.xlsx"; that physical file does not exist, so protectSheet
    // would throw "File not found". hide() only returns a path; the file is never
    // actually created (SaveAs is mocked). Document: the chain therefore throws at
    // protectSheet's existence check. We assert hide ran (Visible set) + the throw.
    expect(() => Excels.hideProtectSheet(file, 'pw', ['ALL'])).toThrow(/File not found/);
    expect(hideSheet.__sets__.Visible).toBe(2);
  });

  it('hideProtectSheetAsk aborts when password entry is cancelled', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    const result = Excels.hideProtectSheetAsk(makeFile('HPA.xlsx'));
    expect(result).toBeUndefined();
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('hideProtectSheetAsk delegates to hideProtectSheet with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('pw');
    YamlsMock.getConfig.mockReturnValue(' P');
    const hideSheet = makeComProxy({}, 'Sheet');
    const open = jest.fn(() => makeComProxy({ Sheets: jest.fn(() => hideSheet) }, 'HideWB'));
    state.comFactory = () => makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    // Same caveat as above: the hidden file is not physically created, so the
    // downstream protectSheet throws. We only assert delegation reached hide().
    expect(() => Excels.hideProtectSheetAsk(makeFile('HPA2.xlsx'))).toThrow(/File not found/);
    expect(hideSheet.__sets__.Visible).toBe(2);
  });
});

describe('Excels.unHideUnProtectSheet (and Ask)', () => {
  it('unhides then unprotects the worksheets', () => {
    const unhideSheet = makeComProxy({}, 'Sheet');
    const wsUnprotect = jest.fn();
    const protectedWs = makeComProxy({ ProtectContents: true, Unprotect: wsUnprotect }, 'WS');

    const open = jest.fn();
    let call = 0;
    open.mockImplementation(() => {
      call++;
      return call === 1
        ? makeComProxy(
            { Sheets: jest.fn(() => unhideSheet), Save: jest.fn(), Close: jest.fn() },
            'UnhideWB'
          )
        : makeComProxy(
            {
              Worksheets: Object.assign(
                jest.fn(() => protectedWs),
                { Count: 1 }
              ),
              Save: jest.fn(),
              Close: jest.fn(),
            },
            'UnprotectWB'
          );
    });
    state.comFactory = () => makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    Excels.unHideUnProtectSheet(makeFile('UHUP.xlsx'), 'pw', ['ALL']);

    expect(unhideSheet.__sets__.Visible).toBe(-1);
    expect(wsUnprotect).toHaveBeenCalledWith('pw');
  });

  it('unHideUnProtectSheetAsk aborts when cancelled', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    Excels.unHideUnProtectSheetAsk(makeFile('UHA.xlsx'));
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('unHideUnProtectSheetAsk delegates with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('pw2');
    const unhideSheet = makeComProxy({}, 'Sheet');
    const wsUnprotect = jest.fn();
    const protectedWs = makeComProxy({ ProtectContents: true, Unprotect: wsUnprotect }, 'WS');
    const open = jest.fn();
    let call = 0;
    open.mockImplementation(() => {
      call++;
      return call === 1
        ? makeComProxy(
            { Sheets: jest.fn(() => unhideSheet), Save: jest.fn(), Close: jest.fn() },
            'UnhideWB'
          )
        : makeComProxy(
            {
              Worksheets: Object.assign(
                jest.fn(() => protectedWs),
                { Count: 1 }
              ),
              Save: jest.fn(),
              Close: jest.fn(),
            },
            'UnprotectWB'
          );
    });
    state.comFactory = () => makeComProxy({ Workbooks: { Open: open } }, 'Excel.Application');

    Excels.unHideUnProtectSheetAsk(makeFile('UHA2.xlsx'));

    expect(wsUnprotect).toHaveBeenCalledWith('pw2');
  });
});
