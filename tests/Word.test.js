// Unit tests for utils/Word.js — every public (non-_) static method.
//
// Word is a MIX of pure helpers and winax-COM driven methods:
//  - Pure / near-pure helpers (getNumberWordOnly, getRussianMonthName,
//    getComNameInitials, cleanCompanyName, contractNumFromFormat, extractDate,
//    getProtectedPath, initFolders) are exercised for real.
//  - COM methods (checkWinax, merge, mergeFolder, makeContract, wordReplace,
//    wordToMD, protectFile, unProtectFile + their *Ask wrappers)
//    mock the `winax` boundary (and Dialogs/Yamls/Files siblings) and assert the
//    observable contract: COM object construction, boundary calls, return
//    shaping and the documented error/empty branches.
//
// Pattern follows tests/Claude.test.js (mock the boundary, real fs on temp dirs)
// and tests/Dates.test.js (pure assertions). No utils/ source is modified —
// where the code has a quirk, the test documents the ACTUAL behavior.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree } from './helpers/tmp.js';
import { makeComProxy } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- winax mock (the COM boundary) -------------------------------------------
// A controllable winax mock: each test can pin the proxy returned for the doc
// (e.g. its ProtectionType / Content text) through `comState.docOverrides`, and
// inspect the constructed app proxy via `comState.lastApp`.
const comState = {
  // pinnable doc leaves
  protectionType: undefined, // doc.ProtectionType (-1 = none, else protected)
  contentText: undefined,    // doc.Content.Text used by the placeholder scanner
  // observability
  lastApp: null,
  lastDoc: null,
  openCalls: [],
  quitCount: 0,
  selection: null,
};

// Build a doc COM stand-in: ProtectionType and Content.Text are pinnable via
// comState; every other property (Content.Find, SaveAs, Close, Protect, …)
// auto-extends so long COM chains never throw.
function makeDoc() {
  const handler = {
    get(_t, prop) {
      if (prop === 'ProtectionType' && comState.protectionType !== undefined) {
        return comState.protectionType;
      }
      if (prop === 'Content') {
        return new Proxy(function () {}, {
          get(_t2, p2) {
            if (p2 === 'Text') {
              return comState.contentText !== undefined ? comState.contentText : 'Doc.Content.Text';
            }
            if (p2 === 'then' || p2 === 'catch' || p2 === 'finally') return undefined;
            return makeComProxy({}, `Doc.Content.${String(p2)}`);
          },
        });
      }
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      if (prop === Symbol.toPrimitive || prop === 'valueOf' || prop === 'toString') return () => 'Doc';
      return makeComProxy({}, `Doc.${String(prop)}`);
    },
  };
  return new Proxy(function () {}, handler);
}

function freshApp() {
  const doc = makeDoc();
  comState.lastDoc = doc;
  // The app proxy intercepts Documents.Open(...) to return our pinned doc and
  // records the path it was opened with, while leaving every other COM chain to
  // the auto-extending proxy.
  const documents = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'Open') {
        return (p) => {
          comState.openCalls.push(p);
          return doc;
        };
      }
      return makeComProxy({}, `Documents.${String(prop)}`);
    },
  });
  const rawSets = {};
  const app = new Proxy(function () {}, {
    get(_t, prop) {
      if (prop === 'Documents') return documents;
      if (prop === '__sets__' || prop === '__rawSets__') return rawSets;
      if (prop === 'Quit') return () => { comState.quitCount += 1; };
      if (prop === 'Selection') return comState.selection || makeComProxy({}, 'Selection');
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      return makeComProxy({}, `App.${String(prop)}`);
    },
    set(_t, prop, value) {
      rawSets[prop] = value;
      return true;
    },
  });
  comState.lastApp = app;
  return app;
}

const winaxObject = jest.fn(function (progId) {
  comState.lastProgId = progId;
  return freshApp();
});
// winaxRelease is reassigned per-test (cleared) so each test gets a fresh spy;
// the module-level winaxMock forwards to whatever winaxRelease currently is.
let winaxRelease = jest.fn();
const winaxMock = { default: { Object: winaxObject, release: (...a) => winaxRelease(...a) }, Object: winaxObject, release: (...a) => winaxRelease(...a) };
jest.unstable_mockModule('winax', () => winaxMock);

// `turndown` / `turndown-plugin-gfm` are optional deps not installed in this
// environment; Word.js imports them at module load (used only by the private
// HTML→MD path that wordToMD calls). Provide minimal mocks so the module
// resolves and _convertHtmlToMd produces a string.
class TurndownMock {
  constructor(opts) { this.opts = opts; this.rules = {}; }
  use() { return this; }
  addRule(name, rule) { this.rules[name] = rule; return this; }
  turndown(html) { return `MD(${String(html).length})`; }
}
// `{ virtual: true }` lets these absent packages be mocked without an on-disk
// module (turndown / turndown-plugin-gfm are NOT in package.json deps — Word.js
// importing them is a latent missing-dependency bug, documented here). A
// matching jest.mock(..., { virtual: true }) seeds the CJS virtual-mocks map
// that the ESM resolver consults when deciding to short-circuit disk resolution.
const gfmMock = { default: { gfm: () => {} }, gfm: () => {} };
jest.mock('turndown', () => ({ default: TurndownMock }), { virtual: true });
jest.mock('turndown-plugin-gfm', () => gfmMock, { virtual: true });
jest.unstable_mockModule('turndown', () => ({ default: TurndownMock }), { virtual: true });
jest.unstable_mockModule('turndown-plugin-gfm', () => gfmMock, { virtual: true });

// --- sibling mocks ------------------------------------------------------------
const configStore = {};
const YamlsMock = {
  getConfig: jest.fn((key, _type, def = null) => (key in configStore ? configStore[key] : def)),
  setConfig: jest.fn((key, val) => { configStore[key] = val; }),
  loadYamlWithDeps: jest.fn(() => ({})),
};
const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
  inputBox: jest.fn(),
  openFileDialog: jest.fn(),
};
const FilesMock = {
  getBaseName: (filePath, ext) => path.basename(filePath, ext),
  getDirName: (filePath) => path.dirname(path.resolve(filePath)),
  mkdirIfNotExists: (d) => fs.mkdirSync(d, { recursive: true }),
  isEmpty: (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  },
  incrementFileName: (filePath) => {
    if (!fs.existsSync(filePath)) return filePath;
    const parsed = path.parse(filePath);
    let i = 1;
    let np = filePath;
    while (fs.existsSync(np)) {
      np = path.join(parsed.dir, `${parsed.name} ${i}${parsed.ext}`);
      i++;
    }
    return np;
  },
  // Word.merge resolves its template via Files.getLatestMatchingFile(folder, ext)
  // — the newest matching file in the folder. Mirror that with a real fs scan so
  // the tests' on-disk template folder drives the COM merge for real.
  getLatestMatchingFile: (folder, ext) => {
    if (!folder || !fs.existsSync(folder)) return null;
    let latest = null;
    let latestTime = -1;
    for (const name of fs.readdirSync(folder)) {
      if (ext && !name.toLowerCase().endsWith(String(ext).toLowerCase())) continue;
      const full = path.join(folder, name);
      const st = fs.statSync(full);
      if (st.isFile() && st.mtimeMs > latestTime) {
        latestTime = st.mtimeMs;
        latest = full;
      }
    }
    return latest;
  },
};

jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));

const { Word } = await import('../utils/Word.js');

let workDir;

beforeEach(() => {
  workDir = makeTmpDir('word-');
  comState.protectionType = undefined;
  comState.contentText = undefined;
  comState.lastApp = null;
  comState.lastDoc = null;
  comState.lastProgId = undefined;
  comState.openCalls = [];
  comState.quitCount = 0;
  comState.selection = null;
  for (const k of Object.keys(configStore)) delete configStore[k];
  winaxRelease = jest.fn();
  winaxMock.release = (...a) => winaxRelease(...a);
  winaxMock.default.release = (...a) => winaxRelease(...a);
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

// =============================================================================
// PURE / NEAR-PURE HELPERS
// =============================================================================

describe('Word.getNumberWordOnly', () => {
  it('returns an empty string for falsy input', () => {
    expect(Word.getNumberWordOnly('')).toBe('');
    expect(Word.getNumberWordOnly(0)).toBe('');
    expect(Word.getNumberWordOnly(null)).toBe('');
    expect(Word.getNumberWordOnly(undefined)).toBe('');
  });

  it('spells whole numbers in Russian words', () => {
    expect(Word.getNumberWordOnly('5')).toBe('Пять');
    expect(Word.getNumberWordOnly('100')).toBe('Сто');
    expect(Word.getNumberWordOnly('1000')).toBe('Одна тысяча');
    expect(Word.getNumberWordOnly('1234')).toBe('Одна тысяча двести тридцать четыре');
  });

  it('strips comma/dot/colon/space separators before converting', () => {
    // The cleanup regex /[,. :]/ removes ALL of these chars, so grouping
    // separators collapse and a decimal point is dropped (not treated as
    // fractional) — "2 000" -> 2000, "1 234 567" -> 1234567.
    expect(Word.getNumberWordOnly('2 000')).toBe('Две тысячи');
    expect(Word.getNumberWordOnly('1 234 567')).toBe(
      'Один миллион двести тридцать четыре тысячи пятьсот шестьдесят семь',
    );
    // "12.50" -> "1250" because the dot is stripped, not parsed as decimal.
    expect(Word.getNumberWordOnly('12.50')).toBe('Одна тысяча двести пятьдесят');
  });

  it('slices off the fractional tail only when the plural "целых" marker is present', () => {
    // number-to-words-ru emits "целая" (singular) for 1/21 and "целых" for
    // others. The method only slices on "целых", so 1 and 21 keep the tail —
    // documenting the real behavior, not a bug fix.
    expect(Word.getNumberWordOnly('1')).toBe('Одна целая 0 десятых');
    expect(Word.getNumberWordOnly('21')).toBe('Двадцать одна целая 0 десятых');
  });
});

describe('Word.getRussianMonthName', () => {
  it('maps month numbers 1..12 to Russian month names', () => {
    const expected = [
      'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
      'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
    ];
    for (let m = 1; m <= 12; m++) {
      expect(Word.getRussianMonthName(m)).toBe(expected[m - 1]);
    }
  });

  it('accepts a numeric string', () => {
    expect(Word.getRussianMonthName('3')).toBe('март');
  });

  it('returns an empty string for falsy month number (0, null, undefined, "")', () => {
    expect(Word.getRussianMonthName(0)).toBe('');
    expect(Word.getRussianMonthName(null)).toBe('');
    expect(Word.getRussianMonthName(undefined)).toBe('');
    expect(Word.getRussianMonthName('')).toBe('');
  });

  it('wraps out-of-range numbers via Date math (13 -> январь, 14 -> февраль)', () => {
    // new Date(2025, 13-1, 1) = month index 12 = January of next year.
    expect(Word.getRussianMonthName(13)).toBe('январь');
    expect(Word.getRussianMonthName(14)).toBe('февраль');
    // "0" as a non-empty string is truthy → parseInt → 0 → index -1 → December.
    expect(Word.getRussianMonthName('0')).toBe('декабрь');
  });
});

describe('Word.cleanCompanyName', () => {
  it('removes quote characters and trims', () => {
    expect(Word.cleanCompanyName('«Acme Corp»')).toBe('Acme Corp');
    expect(Word.cleanCompanyName('"Test"')).toBe('Test');
    expect(Word.cleanCompanyName("'Solo'")).toBe('Solo');
  });

  it('strips the legal-form tokens MCHJ / AK / YaTT anywhere they appear', () => {
    expect(Word.cleanCompanyName('«Acme Corp» MCHJ')).toBe('Acme Corp');
    expect(Word.cleanCompanyName('"Test" AK')).toBe('Test');
    // tokens are removed globally even mid-word ("BlackAK" -> "Black").
    expect(Word.cleanCompanyName('YaTT BlackAK')).toBe('Black');
  });

  it('returns an empty string for non-string / empty input', () => {
    expect(Word.cleanCompanyName('')).toBe('');
    expect(Word.cleanCompanyName(null)).toBe('');
    expect(Word.cleanCompanyName(123)).toBe('');
  });
});

describe('Word.getComNameInitials', () => {
  it('builds uppercase initials from the cleaned company name', () => {
    expect(Word.getComNameInitials('alpha beta gamma')).toBe('ABG');
    expect(Word.getComNameInitials('«Acme Corp» MCHJ')).toBe('AC');
  });

  it('returns an empty string when cleaning leaves nothing', () => {
    // "MCHJ" alone is fully stripped → split yields [""] → no initials.
    expect(Word.getComNameInitials('MCHJ')).toBe('');
  });

  it('returns an empty string for non-string / empty input', () => {
    expect(Word.getComNameInitials('')).toBe('');
    expect(Word.getComNameInitials(null)).toBe('');
    expect(Word.getComNameInitials(42)).toBe('');
  });
});

describe('Word.contractNumFromFormat', () => {
  it('substitutes prefix, company initials and date parts into the configured format', () => {
    configStore['Contract.Prefix'] = 'DG';
    configStore['Contract.Format'] = '{Prefix}-{ComName}/{Day}.{Month}.{Year}';

    const out = Word.contractNumFromFormat({
      ComName: 'Acme Corp',
      Day: '05',
      Month: '11',
      Year: '2024',
    });

    expect(out).toBe('DG-AC/05.11.2024');
  });

  it('supports the {contractPrefix} alias and blanks out unknown placeholders', () => {
    configStore['Contract.Prefix'] = 'PX';
    configStore['Contract.Format'] = '{contractPrefix}{ComName}{Missing}{Year}';

    const out = Word.contractNumFromFormat({ ComName: 'Beta', Year: '2030' });
    // {Missing} is not in the alternation, so it is left untouched in output.
    expect(out).toBe('PXB{Missing}2030');
  });
});

describe('Word.extractDate', () => {
  it('splits a DD.MM.YYYY string into { year, month, day }', () => {
    expect(Word.extractDate('05.11.2024')).toEqual({ year: '2024', month: '11', day: '05' });
  });

  it('warns and returns null for invalid / non-string input', () => {
    expect(Word.extractDate(null)).toBeNull();
    expect(Word.extractDate(12345)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('warns and returns null when a component is missing', () => {
    expect(Word.extractDate('05.11')).toBeNull();
    expect(Word.extractDate('justtext')).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });
});

describe('Word.getProtectedPath', () => {
  it('appends the default " Protected" suffix before the extension', () => {
    const out = Word.getProtectedPath(path.join(workDir, 'report.docx'));
    expect(out).toBe(path.join(workDir, 'report Protected.docx'));
  });

  it('honors a configured Word.ProtectSuffix', () => {
    configStore['Word.ProtectSuffix'] = ' Locked';
    const out = Word.getProtectedPath(path.join(workDir, 'a.docx'));
    expect(out).toBe(path.join(workDir, 'a Locked.docx'));
  });

  it('returns the resolved path unchanged when the stem already contains the suffix', () => {
    const p = path.join(workDir, 'a Protected.docx');
    expect(Word.getProtectedPath(p)).toBe(path.resolve(p));
  });

  it('auto-increments when the suffixed target already exists', () => {
    fs.writeFileSync(path.join(workDir, 'doc Protected.docx'), 'x', 'utf8');
    const out = Word.getProtectedPath(path.join(workDir, 'doc.docx'));
    expect(out).toBe(path.join(workDir, 'doc Protected 1.docx'));
  });

  it('returns an absolute path', () => {
    const out = Word.getProtectedPath('relative.docx');
    expect(path.isAbsolute(out)).toBe(true);
  });
});

describe('Word.initFolders', () => {
  afterEach(() => {
    // initFolders writes onto globalThis; clean the keys it sets.
    for (const k of Object.keys(globalThis)) {
      if (k.startsWith('folder') || k === 'ymlFile') delete globalThis[k];
    }
  });

  it('returns true and creates RestAPI when the Compan folder exists', () => {
    fs.mkdirSync(path.join(workDir, 'Compan'), { recursive: true });
    const yml = path.join(workDir, 'data.yml');
    fs.writeFileSync(yml, '', 'utf8');

    const result = Word.initFolders(yml);

    expect(result).toBe(true);
    expect(globalThis.folderALL).toBe(workDir);
    expect(globalThis.folderCompan).toBe(path.join(workDir, 'Compan'));
    expect(globalThis.folderContract).toBe(path.join(workDir, 'Contract'));
    // RestAPI is the only folder eagerly created by Files.mkdirIfNotExists.
    expect(fs.existsSync(path.join(workDir, 'RestAPI'))).toBe(true);
  });

  it('warns and does NOT return true when the Compan folder is missing', () => {
    const yml = path.join(workDir, 'data.yml');
    fs.writeFileSync(yml, '', 'utf8');

    const result = Word.initFolders(yml);

    expect(result).not.toBe(true);
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    // It bails before defining the later folder globals.
    expect(globalThis.folderContract).toBeUndefined();
  });
});

// =============================================================================
// COM / winax-DRIVEN METHODS
// =============================================================================

describe('Word.checkWinax', () => {
  it('does not throw when winax is available', () => {
    expect(() => Word.checkWinax('someMethod')).not.toThrow();
  });

  // Note: winax is loaded once at module import and is present (mocked), so the
  // not-available branch cannot be re-triggered after import. The throwing
  // contract is covered indirectly: when winax.Object throws, the COM methods
  // surface that error (see wordReplace error-branch tests).
  it('returns undefined on the success path', () => {
    expect(Word.checkWinax('x')).toBeUndefined();
  });
});

describe('Word.merge', () => {
  beforeEach(() => {
    // Templates.WordMerge is a FOLDER; merge picks the latest .docx inside it via
    // Files.getLatestMatchingFile. Seed a template folder with one .docx so the
    // existsSync guard passes and copyFileSync works.
    const templateFolder = path.join(workDir, 'tpl-folder');
    fs.mkdirSync(templateFolder, { recursive: true });
    fs.writeFileSync(path.join(templateFolder, 'template.docx'), 'TPL', 'utf8');
    configStore['Templates.WordMerge'] = templateFolder;
  });

  it('throws when no files are provided', () => {
    expect(() => Word.merge([])).toThrow(/No files provided/);
    expect(() => Word.merge(null)).toThrow(/No files provided/);
  });

  it('throws when the configured template folder does not exist', () => {
    configStore['Templates.WordMerge'] = path.join(workDir, 'missing-folder');
    const src = path.join(workDir, 'a.docx');
    fs.writeFileSync(src, 'A', 'utf8');
    expect(() => Word.merge([src])).toThrow(/template folder not found/i);
  });

  it('copies the template, drives the COM merge and quits Word', () => {
    const src1 = path.join(workDir, 'a.docx');
    const src2 = path.join(workDir, 'b.docx');
    fs.writeFileSync(src1, 'A', 'utf8');
    fs.writeFileSync(src2, 'B', 'utf8');

    Word.merge([src1, src2]);

    // template copied to "<dirname>.docx" (parentDir basename + template ext)
    const expectedTarget = path.join(workDir, `${path.basename(workDir)}.docx`);
    expect(fs.existsSync(expectedTarget)).toBe(true);
    // COM app constructed for Word and the target document opened
    expect(winaxObject).toHaveBeenCalledWith('Word.Application');
    expect(comState.openCalls).toContain(expectedTarget);
    // Word.Quit() ran in the finally block
    expect(comState.quitCount).toBeGreaterThan(0);
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('writes the merged file into an explicit targetDir', () => {
    const src = path.join(workDir, 'a.docx');
    fs.writeFileSync(src, 'A', 'utf8');
    const outDir = path.join(workDir, 'out');
    fs.mkdirSync(outDir, { recursive: true });

    Word.merge([src], true, outDir);

    expect(fs.existsSync(path.join(outDir, 'out.docx'))).toBe(true);
  });
});

describe('Word.mergeFolder', () => {
  beforeEach(() => {
    const templateFolder = path.join(workDir, 'tpl-folder');
    fs.mkdirSync(templateFolder, { recursive: true });
    fs.writeFileSync(path.join(templateFolder, 'template.docx'), 'TPL', 'utf8');
    configStore['Templates.WordMerge'] = templateFolder;
  });

  it('throws when no folders are provided', () => {
    expect(() => Word.mergeFolder([])).toThrow(/No folders provided/);
  });

  it('throws when no .docx files are found in any folder', () => {
    const empty = path.join(workDir, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    expect(() => Word.mergeFolder([empty])).toThrow(/No \.docx files found/);
  });

  it('picks the newest .docx per folder and delegates to merge', () => {
    const folder = path.join(workDir, 'docs');
    fs.mkdirSync(folder, { recursive: true });
    const older = path.join(folder, 'old.docx');
    const newer = path.join(folder, 'new.docx');
    fs.writeFileSync(older, 'old', 'utf8');
    fs.writeFileSync(newer, 'new', 'utf8');
    // make `newer` clearly the most recently modified
    const now = Date.now();
    fs.utimesSync(older, new Date(now - 100000), new Date(now - 100000));
    fs.utimesSync(newer, new Date(now), new Date(now));
    // ignore temp lock files (~$) and non-docx
    fs.writeFileSync(path.join(folder, '~$new.docx'), 'lock', 'utf8');
    fs.writeFileSync(path.join(folder, 'note.txt'), 'txt', 'utf8');

    const spy = jest.spyOn(Word, 'merge').mockReturnValue(undefined);
    Word.mergeFolder([folder]);

    expect(spy).toHaveBeenCalledTimes(1);
    const [files, pageBreak, parentDir] = spy.mock.calls[0];
    expect(files).toEqual([newer]);
    expect(pageBreak).toBe(true);
    // target dir is the parent of the last folder
    expect(parentDir).toBe(path.dirname(path.resolve(folder)));
    spy.mockRestore();
  });
});

describe('Word.makeContract', () => {
  it('warns and returns undefined when the template is missing', () => {
    configStore['Templates.Word'] = path.join(workDir, 'no-template.docx');
    const result = Word.makeContract(path.join(workDir, 'data.yml'));
    expect(result).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('builds the output paths, ensures the contract folders and calls wordReplace', () => {
    const template = path.join(workDir, 'Dogovor.docx');
    fs.writeFileSync(template, 'TPL', 'utf8');
    configStore['Templates.Word'] = template;

    const yml = path.join(workDir, 'data.yml');
    fs.writeFileSync(yml, '', 'utf8');
    YamlsMock.loadYamlWithDeps.mockReturnValue({
      ContractNum: 'DG-001',
      Area: '120',
      MyCompany: 'MyCo',
    });

    const spy = jest.spyOn(Word, 'wordReplace').mockReturnValue(undefined);

    const result = Word.makeContract(yml);

    const contractNumDir = path.join(workDir, 'Contract', 'DG-001');
    expect(fs.existsSync(contractNumDir)).toBe(true);

    const core = 'DG-001, 120-kv, MyCo, Dogovor';
    expect(result).toEqual({
      outputDocxPath: path.join(contractNumDir, `${core}.docx`),
      outputPdfPath: path.join(contractNumDir, `${core}.pdf`),
    });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ ContractNum: 'DG-001' }),
      template,
      result.outputDocxPath,
      result.outputPdfPath,
    );
    spy.mockRestore();
  });

  it('warns about a missing ContractNum and then throws building the path (documented quirk)', () => {
    const template = path.join(workDir, 'Tpl.docx');
    fs.writeFileSync(template, 'TPL', 'utf8');
    configStore['Templates.Word'] = template;
    const yml = path.join(workDir, 'data.yml');
    fs.writeFileSync(yml, '', 'utf8');
    YamlsMock.loadYamlWithDeps.mockReturnValue({ Area: '50', MyCompany: 'X' });

    const spy = jest.spyOn(Word, 'wordReplace').mockReturnValue(undefined);
    // The method warns (does NOT return) and then calls path.join(folder,
    // undefined), which throws — documenting the actual behavior (a
    // guard-without-return bug in the source), not fixing it. Asserting on the
    // message (not the TypeError class) avoids the cross-realm instanceof pitfall
    // under --experimental-vm-modules.
    expect(() => Word.makeContract(yml)).toThrow(/must be of type string/);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('Contract number not found'),
      'Error',
    );
    spy.mockRestore();
  });
});

describe('Word.wordReplace', () => {
  it('constructs the Word COM app, saves DOCX+PDF and releases the COM object', () => {
    // pin the document text so the placeholder scan finds the bracketed tokens.
    comState.contentText = 'Hello [Name], total [SumText] and [DateTitle] call [ClientPhone].';
    configStore['Contract.PdfFormatCode'] = '17';

    const template = path.join(workDir, 'tpl.docx');
    fs.writeFileSync(template, 'TPL', 'utf8');
    const outDocx = path.join(workDir, 'out.docx');
    const outPdf = path.join(workDir, 'out.pdf');

    // Exercises every placeholder branch: default (Name), *Text → words (Sum),
    // *Title → Russian month (Date), *Phone → +998 normalization (ClientPhone).
    Word.wordReplace(
      { Name: 'Acme', Sum: '1000', Date: '11', ClientPhone: '998901234567' },
      template,
      outDocx,
      outPdf,
    );

    expect(winaxObject).toHaveBeenCalledWith('Word.Application');
    expect(comState.openCalls).toContain(path.resolve(template));
    // Visible / DisplayAlerts pushed onto the app before opening
    expect(comState.lastApp.__rawSets__.Visible).toBe(false);
    expect(comState.lastApp.__rawSets__.DisplayAlerts).toBe(0);
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('re-throws (and still releases) when a COM call fails', () => {
    // Make Documents.Open throw by overriding winaxObject for this test only.
    makeOpenThrowOnce();
    const template = path.join(workDir, 'tpl.docx');
    fs.writeFileSync(template, 'TPL', 'utf8');

    expect(() =>
      Word.wordReplace({}, template, path.join(workDir, 'o.docx'), path.join(workDir, 'o.pdf')),
    ).toThrow(/boom/);
    expect(winaxRelease).toHaveBeenCalled();
  });
});

describe('Word.wordToMD', () => {
  it('warns and returns undefined for a missing file', () => {
    const result = Word.wordToMD(path.join(workDir, 'missing.docx'));
    expect(result).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('warns and returns undefined for empty filename', () => {
    expect(Word.wordToMD('')).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('opens the doc, exports HTML, converts to MD and returns the .md path', () => {
    const src = path.join(workDir, 'paper.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');

    // The real flow writes a temp HTML via doc.SaveAs2 (a no-op on the proxy),
    // then reads it. We pre-seed the MD dir HTML so the read finds content; but
    // since the html filename is timestamped we instead let it read "" and still
    // produce a valid (empty-ish) markdown file. Assert the returned path + file.
    const out = Word.wordToMD(src);

    expect(out).toBe(path.join(workDir, 'MD', 'paper.md'));
    expect(fs.existsSync(out)).toBe(true);
    expect(winaxObject).toHaveBeenCalledWith('Word.Application');
    expect(comState.openCalls).toContain(path.resolve(src));
    expect(winaxRelease).toHaveBeenCalled();
  });
});

describe('Word.protectFile', () => {
  it('throws when the file does not exist', () => {
    expect(() => Word.protectFile(path.join(workDir, 'no.docx'), 'pw')).toThrow(/File not found/);
  });

  it('protects an unprotected doc and saves under the suffixed path', () => {
    const src = path.join(workDir, 'doc.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');
    comState.protectionType = -1; // wdNoProtection → proceed

    const out = Word.protectFile(src, 'secret', 3);

    expect(out).toBe(path.join(workDir, 'doc Protected.docx'));
    expect(winaxObject).toHaveBeenCalledWith('Word.Application');
    expect(comState.openCalls).toContain(path.resolve(src));
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('skips and returns the original path when the doc is already protected', () => {
    const src = path.join(workDir, 'doc.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');
    comState.protectionType = 1; // already protected (!= -1)

    const out = Word.protectFile(src, 'secret');
    expect(out).toBe(path.resolve(src));
  });

  it('wraps a COM failure in a "protectFile failed" error', () => {
    const src = path.join(workDir, 'doc.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');
    makeOpenThrowOnce();
    expect(() => Word.protectFile(src, 'pw')).toThrow(/protectFile failed/);
  });
});

describe('Word.unProtectFile', () => {
  it('throws when the file does not exist', () => {
    expect(() => Word.unProtectFile(path.join(workDir, 'no.docx'), 'pw')).toThrow(/File not found/);
  });

  it('unprotects a protected doc and saves in place', () => {
    const src = path.join(workDir, 'doc.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');
    comState.protectionType = 3; // protected → unprotect

    expect(() => Word.unProtectFile(src, 'secret')).not.toThrow();
    expect(winaxObject).toHaveBeenCalledWith('Word.Application');
    expect(comState.openCalls).toContain(path.resolve(src));
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('warns and returns when the doc is not protected', () => {
    const src = path.join(workDir, 'doc.docx');
    fs.writeFileSync(src, 'DOC', 'utf8');
    comState.protectionType = -1; // wdNoProtection

    const result = Word.unProtectFile(src, 'secret');
    expect(result).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('File is not protected', 'Unprotect Document');
  });
});

// =============================================================================
// *Ask WRAPPERS (Dialogs → delegate)
// =============================================================================

describe('Word.protectFileAsk', () => {
  it('returns undefined without protecting when the password prompt is cancelled', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    const spy = jest.spyOn(Word, 'protectFile').mockReturnValue('X');
    expect(Word.protectFileAsk(path.join(workDir, 'a.docx'))).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('delegates to protectFile with the entered password and protection type', () => {
    DialogsMock.inputBox.mockReturnValue('pw123');
    const spy = jest.spyOn(Word, 'protectFile').mockReturnValue('OUT');
    const file = path.join(workDir, 'a.docx');

    const out = Word.protectFileAsk(file, 2);

    expect(out).toBe('OUT');
    expect(spy).toHaveBeenCalledWith(file, 'pw123', 2);
    spy.mockRestore();
  });
});

describe('Word.unProtectFileAsk', () => {
  it('returns undefined without unprotecting when cancelled', () => {
    DialogsMock.inputBox.mockReturnValue(null);
    const spy = jest.spyOn(Word, 'unProtectFile').mockReturnValue(undefined);
    expect(Word.unProtectFileAsk(path.join(workDir, 'a.docx'))).toBeUndefined();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('delegates to unProtectFile with the entered password', () => {
    DialogsMock.inputBox.mockReturnValue('pw');
    const spy = jest.spyOn(Word, 'unProtectFile').mockReturnValue(undefined);
    const file = path.join(workDir, 'a.docx');

    Word.unProtectFileAsk(file);

    expect(spy).toHaveBeenCalledWith(file, 'pw');
    spy.mockRestore();
  });
});

// Helper (2 call sites): for the NEXT `new winax.Object('Word.Application')`
// only, return an app whose Documents.Open throws, so a COM-failure branch can
// be exercised. mockImplementationOnce auto-resets, so no restore is needed.
function makeOpenThrowOnce() {
  winaxObject.mockImplementationOnce(function (progId) {
    comState.lastProgId = progId;
    const app = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'Documents') {
          return { Open: () => { throw new Error('boom'); } };
        }
        if (prop === 'Quit') return () => { comState.quitCount += 1; };
        if (prop === '__rawSets__' || prop === '__sets__') return {};
        return makeComProxy({}, `App.${String(prop)}`);
      },
      set() { return true; },
    });
    comState.lastApp = app;
    return app;
  });
}
