// Unit tests for classes/Yamls.js — every public (non-_) static method:
//   getConfig, getYamlValue, findTextLine, replaceTextLine, loadYamlWithDeps,
//   loadAndParseYaml, extractFirstNumber, update, fillYamlWithInfo,
//   getPrepayMonth, replaceYaml, mergeYamlsInFolder, setConfig.
//
// Strategy: js-yaml, dot-prop and the real `fs` run for real against throwaway
// temp dirs (the genuine parse / replace / merge logic is what we want to
// exercise). Only the native/heavy or globalThis-driven sibling boundaries are
// mocked: Files (project-root + helpers), Word/Didox/MySoliq (winax + network),
// and Dialogs (UI). Dates stays real (pure dayjs). getConfig/setConfig resolve
// config.yml via Files.currentDir(), so the Files mock points it at our temp
// project dir — mirroring tests/Claude.test.js.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { makeTmpDir, cleanupAllTmpDirs, writeTree, read } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';
import { Dates } from '../classes/Dates.js';

// --- mocked boundary ---------------------------------------------------------
const state = { projectDir: '' };

// A faithful-enough Files stand-in: real fs helpers, currentDir() pinned to the
// temp project, and the few helpers Yamls actually calls.
const FilesMock = {
  currentDir: () => state.projectDir,
  isEmpty: (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (v instanceof Map || v instanceof Set) return v.size === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  },
  incrementFileName: (filePath) => {
    if (!fs.existsSync(filePath)) return filePath;
    const parsed = path.parse(filePath);
    let baseName = parsed.name;
    let counter = 1;
    const m = baseName.match(/^(.*?)\s+(\d+)$/);
    if (m) {
      baseName = m[1];
      counter = parseInt(m[2], 10);
    }
    let np = filePath;
    while (fs.existsSync(np)) {
      np = path.join(parsed.dir, `${baseName} ${counter}${parsed.ext}`);
      counter++;
    }
    return np;
  },
  findRecursiveFull: (dir, condition, ignoreFolderCondition = null) => {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreFolderCondition && ignoreFolderCondition(entry.name, fullPath)) continue;
        results = results.concat(
          FilesMock.findRecursiveFull(fullPath, condition, ignoreFolderCondition)
        );
      } else if (condition(entry.name)) {
        results.push(fullPath);
      }
    }
    return results;
  },
  // helpers some heavy methods reach for (kept as jest.fn so calls are observable)
  exists: jest.fn((p) => fs.existsSync(p)),
  backupFile: jest.fn(),
  backupFolder: jest.fn(),
  saveInfoToFile: jest.fn(),
  deleteInfo: jest.fn(),
  deleteDateMarkers: jest.fn(),
  writeJson: jest.fn(),
  getTINFromTXT: jest.fn(),
  getPINFLFromTXT: jest.fn(),
  getDateFromTXT: jest.fn(),
};

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const WordMock = {
  initFolders: jest.fn(() => true),
  extractDate: jest.fn(() => ({ day: '01', month: '01', year: '2024' })),
  cleanCompanyName: jest.fn((s) => s),
  contractNumFromFormat: jest.fn(() => 'RC-1'),
};
const DidoxMock = {
  infoByTinPinfl: jest.fn(),
  bankByCode: jest.fn(),
  regionsByCode: jest.fn(),
  districtsByCode: jest.fn(),
};
const MySoliqMock = {
  companyInfo: jest.fn(),
  entrepreneurInfo: jest.fn(),
};

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Word.js'), () => ({ Word: WordMock }));
jest.unstable_mockModule(utilsModule('didox.js'), () => ({ Didox: DidoxMock }));
jest.unstable_mockModule(utilsModule('MySoliq.js'), () => ({ MySoliq: MySoliqMock }));

const { Yamls } = await import('../classes/Yamls.js');

let projectDir;
let workDir;

beforeEach(() => {
  projectDir = makeTmpDir('yamls-proj-');
  workDir = makeTmpDir('yamls-work-');
  state.projectDir = projectDir;
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

/** Write a config.yml into the (mocked) project dir. */
function writeConfig(obj) {
  fs.writeFileSync(path.join(projectDir, 'config.yml'), yaml.dump(obj), 'utf8');
}

// ---------------------------------------------------------------------------
describe('Yamls.getYamlValue', () => {
  it('resolves a nested dot-path from a real YAML file', () => {
    const f = path.join(workDir, 'a.yml');
    fs.writeFileSync(f, yaml.dump({ Contract: { Format: 'RC-{N}', AddDays: 30 } }), 'utf8');
    expect(Yamls.getYamlValue(f, 'Contract.Format')).toBe('RC-{N}');
    expect(Yamls.getYamlValue(f, 'Contract.AddDays')).toBe(30);
  });

  it('returns the default for a missing key', () => {
    const f = path.join(workDir, 'a.yml');
    fs.writeFileSync(f, yaml.dump({ A: 1 }), 'utf8');
    expect(Yamls.getYamlValue(f, 'Nope.Here', 'fallback')).toBe('fallback');
  });

  it('returns the default (??) for a null value', () => {
    const f = path.join(workDir, 'a.yml');
    fs.writeFileSync(f, 'A:\n', 'utf8'); // A === null
    expect(Yamls.getYamlValue(f, 'A', 'def')).toBe('def');
  });

  it('returns undefined default when key missing and no default given', () => {
    const f = path.join(workDir, 'a.yml');
    fs.writeFileSync(f, yaml.dump({ A: 1 }), 'utf8');
    expect(Yamls.getYamlValue(f, 'B')).toBeUndefined();
  });

  it('throws when the YAML file does not exist', () => {
    expect(() => Yamls.getYamlValue(path.join(workDir, 'none.yml'), 'A')).toThrow(/not found/);
  });
});

describe('Yamls.getConfig', () => {
  it('reads a value from <project>/config.yml by dot-path', () => {
    writeConfig({ Contract: { DefaultBank: 'AAB', AddDays: 30 } });
    expect(Yamls.getConfig('Contract.DefaultBank')).toBe('AAB');
  });

  it('coerces with the type argument', () => {
    writeConfig({ Num: '42', Flag: 'yes', Str: 123, Single: 'x' });
    expect(Yamls.getConfig('Num', 'number')).toBe(42);
    expect(Yamls.getConfig('Flag', 'boolean')).toBe(true);
    expect(Yamls.getConfig('Str', 'string')).toBe('123');
    expect(Yamls.getConfig('Single', 'array')).toEqual(['x']);
  });

  it('wraps a scalar as an object-default for type=object', () => {
    writeConfig({ Scalar: 5, Obj: { a: 1 } });
    expect(Yamls.getConfig('Scalar', 'object')).toEqual({});
    expect(Yamls.getConfig('Obj', 'object')).toEqual({ a: 1 });
  });

  it('returns the defaultValue and warns when the key is empty/missing', () => {
    writeConfig({ A: 1 });
    expect(Yamls.getConfig('Missing.Key', null, 'theDefault')).toBe('theDefault');
  });

  it('throws when config.yml is absent', () => {
    expect(() => Yamls.getConfig('Any.Key')).toThrow(/Config file not found/);
  });

  it('throws when keyPath is falsy', () => {
    writeConfig({ A: 1 });
    expect(() => Yamls.getConfig('')).toThrow(/Key path is required/);
  });
});

describe('Yamls.setConfig', () => {
  it('writes a nested value while preserving siblings', () => {
    writeConfig({ ChoosedChars: { Word: 'old' }, Other: 'keep' });
    Yamls.setConfig('ChoosedChars.Word', 'ABCabc');

    const doc = yaml.load(read(projectDir, 'config.yml'));
    expect(doc.ChoosedChars.Word).toBe('ABCabc');
    expect(doc.Other).toBe('keep');
  });

  it('auto-creates intermediate objects for a new deep path', () => {
    writeConfig({ A: 1 });
    Yamls.setConfig('New.Deep.Key', 7);
    const doc = yaml.load(read(projectDir, 'config.yml'));
    expect(doc.New.Deep.Key).toBe(7);
    expect(doc.A).toBe(1);
  });

  it('round-trips with getConfig', () => {
    writeConfig({});
    Yamls.setConfig('Round.Trip', 'value');
    expect(Yamls.getConfig('Round.Trip')).toBe('value');
  });

  it('throws when config.yml is absent', () => {
    expect(() => Yamls.setConfig('A.B', 1)).toThrow(/Config file not found/);
  });
});

describe('Yamls.findTextLine', () => {
  it('returns the first line containing the text', () => {
    const f = path.join(workDir, 't.txt');
    fs.writeFileSync(f, 'alpha\nbeta value\ngamma\n', 'utf8');
    expect(Yamls.findTextLine(f, 'beta')).toBe('beta value');
  });

  it('returns null when no line matches', () => {
    const f = path.join(workDir, 't.txt');
    fs.writeFileSync(f, 'alpha\nbeta\n', 'utf8');
    expect(Yamls.findTextLine(f, 'zeta')).toBeNull();
  });
});

describe('Yamls.replaceTextLine', () => {
  it('replaces a "key: value" line keyed from the start of the line', () => {
    const f = path.join(workDir, 't.yml');
    fs.writeFileSync(f, 'Name: old\nAge: 1\n', 'utf8');
    Yamls.replaceTextLine(f, 'Name', 'new');
    expect(read(workDir, 't.yml')).toBe('Name: new\nAge: 1\n');
  });

  it('wraps values containing braces in double quotes', () => {
    const f = path.join(workDir, 't.yml');
    fs.writeFileSync(f, 'Format: x\n', 'utf8');
    Yamls.replaceTextLine(f, 'Format', 'RC-{N}/2024');
    expect(read(workDir, 't.yml')).toBe('Format: "RC-{N}/2024"\n');
  });

  it('writes an empty value when the value is empty (Files.isEmpty)', () => {
    const f = path.join(workDir, 't.yml');
    fs.writeFileSync(f, 'Key: something\n', 'utf8');
    Yamls.replaceTextLine(f, 'Key', null);
    expect(read(workDir, 't.yml')).toBe('Key: \n');
  });

  it('does nothing (no write) when the key is not present', () => {
    const f = path.join(workDir, 't.yml');
    const before = 'A: 1\nB: 2\n';
    fs.writeFileSync(f, before, 'utf8');
    Yamls.replaceTextLine(f, 'Missing', 'x');
    expect(read(workDir, 't.yml')).toBe(before);
  });
});

describe('Yamls.writeScalarSection', () => {
  it('updates an existing "Key:" line IN PLACE at its own position', () => {
    const f = path.join(workDir, 'scalar.contract');
    fs.writeFileSync(f, 'ContractDateEnd:\nLoaners: 100,000\nComBase: x\n', 'utf8');
    Yamls.writeScalarSection(f, 'Loaners', '250,000', 'ContractDateEnd');
    expect(read(workDir, 'scalar.contract')).toBe('ContractDateEnd:\nLoaners: 250,000\nComBase: x\n');
  });

  it('inserts a genuinely new key directly after afterKey, with one blank line on each side', () => {
    const f = path.join(workDir, 'scalar2.contract');
    fs.writeFileSync(f, 'ContractDateEnd:\n\nComBase: x\n', 'utf8');
    Yamls.writeScalarSection(f, 'Loaners', '893,342', 'ContractDateEnd');
    expect(read(workDir, 'scalar2.contract')).toBe('ContractDateEnd:\n\nLoaners: 893,342\n\nComBase: x\n');
  });

  it('appends at end of file with a warning when afterKey is missing', () => {
    const f = path.join(workDir, 'scalar3.contract');
    fs.writeFileSync(f, 'Foo: bar\n', 'utf8');
    Yamls.writeScalarSection(f, 'Loaners', '893,342', 'MissingAnchor');
    const content = read(workDir, 'scalar3.contract');
    expect(content).toContain('Foo: bar');
    expect(content).toContain('Loaners: 893,342');
  });
});

describe('Yamls.deleteScalarLine', () => {
  it('removes an existing "Key:" line and collapses the resulting doubled blank line to one', () => {
    const f = path.join(workDir, 'del.contract');
    fs.writeFileSync(f, 'PeriodEnd: 2026-08-31\n\nPeriodEndApp: 2026-08-31\n\nComINN: 312731745\n', 'utf8');
    Yamls.deleteScalarLine(f, 'PeriodEndApp');
    expect(read(workDir, 'del.contract')).toBe('PeriodEnd: 2026-08-31\n\nComINN: 312731745\n');
  });

  it('is a no-op when the key does not exist', () => {
    const f = path.join(workDir, 'del2.contract');
    const before = 'Foo: bar\n';
    fs.writeFileSync(f, before, 'utf8');
    Yamls.deleteScalarLine(f, 'PeriodEndApp');
    expect(read(workDir, 'del2.contract')).toBe(before);
  });
});

describe('Yamls.writeLoaners', () => {
  it('writes a plain scalar line, not an array block', () => {
    const f = path.join(workDir, 'loaners.contract');
    fs.writeFileSync(f, 'History:\n  - 2026-01-01: 0\n\nAccount:\n  - 2026-01-01: 0\n', 'utf8');
    Yamls.writeLoaners(f, '893,342');
    const content = read(workDir, 'loaners.contract');
    expect(content).toContain('Loaners: 893,342');
    expect(content).not.toContain('Loaners:\n  -');
  });
});

describe('Yamls.writeAccrual', () => {
  it('inserts the Accrual array directly after the ComBase: line, separated by exactly one blank line', () => {
    const f = path.join(workDir, 't.contract');
    fs.writeFileSync(
      f,
      'ActDateStart: 09.07.2025\nActDateEnd: \nComBase: Устава\nPrepayMonth: \n',
      'utf8'
    );

    Yamls.writeAccrual(f, [{ '2026-03-01': '450,000' }]);

    const lines = read(workDir, 't.contract').split('\n');
    const comBaseIdx = lines.findIndex((l) => l.startsWith('ComBase:'));
    expect(lines[comBaseIdx + 1]).toBe('');
    expect(lines[comBaseIdx + 2]).toBe('Accrual:');
    expect(lines[comBaseIdx + 3]).toBe('  - 2026-03-01: 450,000');
  });

  it('replaces an existing Accrual block instead of duplicating it', () => {
    const f = path.join(workDir, 't2.contract');
    fs.writeFileSync(f, 'ComBase: Устава\nPrepayMonth: \n', 'utf8');

    Yamls.writeAccrual(f, [{ '2026-01-01': '100,000' }]);
    Yamls.writeAccrual(f, [{ '2026-01-01': '200,000' }]);

    const content = read(workDir, 't2.contract');
    expect(content.match(/^Accrual:/gm)).toHaveLength(1);
    expect(content).toContain('2026-01-01: 200,000');
    expect(content).not.toContain('2026-01-01: 100,000');
    expect(content).toContain('PrepayMonth:');
  });

  it('strips a legacy Pricings:/PriceHistory: block (the old key names) when writing Accrual:', () => {
    const f = path.join(workDir, 't2b.contract');
    fs.writeFileSync(
      f,
      'ComBase: Устава\nPriceHistory:\n  - July 2025: 390,000\n  - August 2025: 390,000\n\nPrepayMonth: \n',
      'utf8'
    );

    Yamls.writeAccrual(f, [{ '2025-07-09': '390,000' }]);

    const content = read(workDir, 't2b.contract');
    expect(content).not.toContain('PriceHistory:');
    expect(content).not.toContain('July 2025');
    expect(content.match(/^Accrual:/gm)).toHaveLength(1);
    expect(content).toContain('2025-07-09: 390,000');
    expect(content).toContain('PrepayMonth:');
  });

  it('supports multiple history entries, written in order', () => {
    const f = path.join(workDir, 't3.contract');
    fs.writeFileSync(f, 'ComBase: Устава\n', 'utf8');

    Yamls.writeAccrual(f, [{ '2026-01-01': '450,000' }, { '2026-02-01': '450,000' }]);

    const lines = read(workDir, 't3.contract').split('\n');
    expect(lines.slice(1, 5)).toEqual([
      '',
      'Accrual:',
      '  - 2026-01-01: 450,000',
      '  - 2026-02-01: 450,000',
    ]);
  });

  it('warns and does nothing when accrual is empty', () => {
    const f = path.join(workDir, 't4.contract');
    const before = 'ComBase: Устава\n';
    fs.writeFileSync(f, before, 'utf8');
    Yamls.writeAccrual(f, []);
    expect(read(workDir, 't4.contract')).toBe(before);
  });

  it('appends at end of file with a warning when ComBase: is missing', () => {
    const f = path.join(workDir, 't5.contract');
    fs.writeFileSync(f, 'Foo: bar\n', 'utf8');
    Yamls.writeAccrual(f, [{ '2026-01-01': '1' }]);
    const content = read(workDir, 't5.contract');
    expect(content).toContain('Foo: bar');
    expect(content).toContain('Accrual:');
  });

  it('chaining writeAccrual/writeHistory/writePayment/writeAccount/writeLoaners/writeFaktura/writePenaltyDays/writePenalty/writePriceApp/writePriceMaxApp/writePriceDay/writePriceMaxDay/writeReturns inserts every NEW block with exactly one blank line before/after it, never touching unrelated file content', () => {
    const f = path.join(workDir, 'chain.contract');
    fs.writeFileSync(f, 'ActDateEnd:\n\nComBase: x\n', 'utf8');

    Yamls.writeAccrual(f, [{ '2026-01-01': '450,000' }]);
    Yamls.writeHistory(f, [{ '2026-01-01': '450,000' }]);
    Yamls.writePayment(f, [{ '2026-01-01': '450,000' }]);
    /*
     * Account/Loaners/Payment all share the same fixed History fallback anchor — whichever runs LAST lands closest to History:, so #writeChain's real order (writeAccount, then writeLoaners) yields History -> Loaners -> Account -> Payment on a brand-new file.
     * PenaltyDays' own fallback anchor is Faktura (not Loaners, which is a scalar now — see writeLoaners), keeping the Account/Payment/Faktura group intact.
     */
    Yamls.writeAccount(f, [{ '2026-01-01': '0' }]);
    Yamls.writeLoaners(f, '893,342');
    Yamls.writeFaktura(f, [{ '2026-01-01': '0' }]);
    Yamls.writePenaltyDays(f, [{ '2026-01-01': 0 }]);
    Yamls.writePenalty(f, [{ '2026-01-01': '0' }]);
    Yamls.writePriceApp(f, [{ '2026-01': '450,000' }]);
    Yamls.writePriceMaxApp(f, [{ '2026-01': '450,000' }]);
    Yamls.writePriceDay(f, [{ '2026-01': '14,516' }]);
    Yamls.writePriceMaxDay(f, [{ '2026-01': '14,516' }]);
    Yamls.writeReturns(f, [{ '2026-01-05': '10,000' }]);

    expect(read(workDir, 'chain.contract')).toBe(
      [
        'ActDateEnd:',
        '',
        'ComBase: x',
        '',
        'Accrual:',
        '  - 2026-01-01: 450,000',
        '',
        'History:',
        '  - 2026-01-01: 450,000',
        '',
        'Loaners: 893,342',
        '',
        'Account:',
        '  - 2026-01-01: 0',
        '',
        'Payment:',
        '  - 2026-01-01: 450,000',
        '',
        'Faktura:',
        '  - 2026-01-01: 0',
        '',
        'PenaltyDays:',
        '  - 2026-01-01: 0',
        '',
        'Penalty:',
        '  - 2026-01-01: 0',
        '',
        // Returns' fallback anchor fixed at Penalty — lands ahead of PriceApp/PriceMaxApp/PriceDay/PriceMaxDay despite #writeChain call order.
        'Returns:',
        '  - 2026-01-05: 10,000',
        '',
        'PriceApp:',
        '  - 2026-01: 450,000',
        '',
        'PriceMaxApp:',
        '  - 2026-01: 450,000',
        '',
        'PriceDay:',
        '  - 2026-01: 14,516',
        '',
        'PriceMaxDay:',
        '  - 2026-01: 14,516',
        '', // real trailing newline at end of file
      ].join('\n')
    );
  });

  it('re-running writeAccrual against an already-written Accrual: block updates it STRICTLY IN PLACE — same position, every other line (including unrelated blank-line runs) byte-identical', () => {
    // Real incident this guards: the prior writer always deleted a key's
    // block from wherever it sat and reinserted it after a hardcoded fixed
    // anchor, silently reordering the whole chain and stranding freestanding
    // "#####" comment separators at the positions their neighbors used to
    // occupy. An existing key's block must now update at its OWN real line
    // position, leaving every unrelated line (including a stray multi-blank
    // run elsewhere, and a comment sitting right after the block) untouched.
    const f = path.join(workDir, 'inplace.contract');
    fs.writeFileSync(
      f,
      [
        'ActDateEnd:',
        '',
        '',
        '',
        'ComBase: x',
        '',
        'Accrual:',
        '  - 2026-01-01: 100,000',
        '',
        '#########################################',
        '',
        'Penalty:',
        '  - 2026-01-01: 0',
      ].join('\n'),
      'utf8'
    );

    Yamls.writeAccrual(f, [{ '2026-01-01': '450,000' }]);

    expect(read(workDir, 'inplace.contract')).toBe(
      [
        'ActDateEnd:',
        '',
        '',
        '',
        'ComBase: x',
        '',
        'Accrual:',
        '  - 2026-01-01: 450,000',
        '',
        '#########################################',
        '',
        'Penalty:',
        '  - 2026-01-01: 0',
      ].join('\n')
    );
  });
});

describe('Yamls.actualPayments', () => {
  it('concatenates Bank-OT, Trans-OT, Card-OT, and BaaR-OT only', () => {
    const yamlData = {
      'Bank-OT': [{ '2025-07-11': '2340000' }],
      'Card-OT': [{ '2026-02-03': '2340000' }],
      'BaaR-OT': [{ '2026-03-05': '500000' }],
      'Bank-IN': [{ '2025-08-01': '100000' }],
      'EHF-IN': [{ '2025-09-10': '2340000' }],
    };
    expect(Yamls.actualPayments(yamlData)).toEqual([
      { '2025-07-11': '2340000' },
      { '2026-02-03': '2340000' },
      { '2026-03-05': '500000' },
    ]);
  });

  it('returns [] when none of Bank-OT/Trans-OT/Card-OT/BaaR-OT is an array', () => {
    expect(Yamls.actualPayments({})).toEqual([]);
  });
});

describe('Yamls.mergeDateKeyedArrays', () => {
  it('merges several date-keyed arrays into one, summing same-date entries across sources', () => {
    const bankOT = [{ '2026-04-21': '1,000,000' }];
    const cardOT = [{ '2026-04-21': '600,000' }, { '2026-05-01': '200,000' }];
    expect(Yamls.mergeDateKeyedArrays(bankOT, cardOT)).toEqual([
      { '2026-04-21': '1,600,000' },
      { '2026-05-01': '200,000' },
    ]);
  });

  it('sorts the merged result by date', () => {
    const a = [{ '2026-06-01': '1' }];
    const b = [{ '2026-01-01': '2' }];
    expect(Yamls.mergeDateKeyedArrays(a, b)).toEqual([
      { '2026-01-01': '2' },
      { '2026-06-01': '1' },
    ]);
  });

  it('ignores non-array inputs and returns [] when nothing is passed', () => {
    expect(Yamls.mergeDateKeyedArrays(null, undefined, [])).toEqual([]);
    expect(Yamls.mergeDateKeyedArrays()).toEqual([]);
  });
});

describe('Yamls.computeHistory', () => {
  it('carries a Payment amount as-is', () => {
    const payment = [{ '2026-04-21': '1,600,000' }];
    expect(Yamls.computeHistory(payment, [])).toEqual([{ '2026-04-21': '1,600,000' }]);
  });

  it('negates a Returns amount', () => {
    const returns = [{ '2026-04-25': '10,000' }];
    expect(Yamls.computeHistory([], returns)).toEqual([{ '2026-04-25': '-10,000' }]);
  });

  it('sums Payment and Returns on the same date, Returns already negative', () => {
    const payment = [{ '2026-04-21': '1,600,000' }];
    const returns = [{ '2026-04-21': '600,000' }];
    expect(Yamls.computeHistory(payment, returns)).toEqual([{ '2026-04-21': '1,000,000' }]);
  });

  it('sorts the merged result by date', () => {
    const payment = [{ '2026-06-01': '1' }];
    const returns = [{ '2026-01-01': '2' }];
    expect(Yamls.computeHistory(payment, returns)).toEqual([
      { '2026-01-01': '-2' },
      { '2026-06-01': '1' },
    ]);
  });

  it('ignores non-array inputs and returns [] when nothing is passed', () => {
    expect(Yamls.computeHistory(null, undefined)).toEqual([]);
    expect(Yamls.computeHistory()).toEqual([]);
  });
});

describe('Yamls.computeDailyBalance', () => {
  it('debits daily pro-rated Accrual, credits Payment, debits Returns on their own dates', () => {
    const accrual = [{ '2026-01-01': '200,000' }, { ALL: '200,000' }];
    const payment = [{ '2026-01-01': '100,000' }];
    const returns = [{ '2026-01-02': '10,000' }];

    const ledger = Yamls.computeDailyBalance('2026-01-01', '2026-01-02', accrual, payment, returns);

    expect(ledger).toHaveLength(2);
    // Accrual bucketed by month (2026-01), dailyAccrual = monthAccrual /
    // daysInMonth(Jan 2026) = 200000/31.
    const dailyAccrual = 200000 / 31;
    expect(ledger[0].date).toBe('2026-01-01');
    expect(ledger[0].balance).toBeCloseTo(100000 - dailyAccrual);
    expect(ledger[1].date).toBe('2026-01-02');
    expect(ledger[1].balance).toBeCloseTo(100000 - dailyAccrual - dailyAccrual - 10000);
  });

  it('returns [] entries safely when accrual has no matching month (treated as 0 accrual)', () => {
    const ledger = Yamls.computeDailyBalance('2026-02-01', '2026-02-01', [], [], []);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].balance).toBe(0);
  });
});

describe('Yamls.computePenaltyDays', () => {
  it('never counts the FIRST consecutive deficit day (1-day grace period)', () => {
    const account = [
      { '2026-01-01': '-100' },
      { '2026-01-02': '-100' },
      { '2026-01-03': '-100' },
    ];
    const result = Yamls.computePenaltyDays(account);
    expect(result).toEqual([{ '2026-01': 2 }, { ALL: 2 }]);
  });

  it('resets the grace period once balance recovers to >= 0', () => {
    const account = [
      { '2026-01-01': '-100' },
      { '2026-01-02': '-100' },
      { '2026-01-03': '0' },
      { '2026-01-04': '-50' },
    ];
    const result = Yamls.computePenaltyDays(account);
    expect(result).toEqual([{ '2026-01': 1 }, { ALL: 1 }]);
  });

  it('counts 0 penalty days when balance never goes negative', () => {
    const account = [{ '2026-01-01': '100' }, { '2026-01-02': '50' }];
    expect(Yamls.computePenaltyDays(account)).toEqual([{ '2026-01': 0 }, { ALL: 0 }]);
  });

  it('attributes penalty days to the calendar month the deficit day itself falls in, streak carries across the month boundary', () => {
    const account = [
      { '2026-01-30': '-100' }, // grace day, Jan
      { '2026-01-31': '-100' }, // 1st penalty day, Jan
      { '2026-02-01': '-100' }, // 2nd consecutive, Feb — streak itself is unbroken, but this day belongs to Feb
    ];
    const result = Yamls.computePenaltyDays(account);
    expect(result).toEqual([{ '2026-01': 1 }, { '2026-02': 1 }, { ALL: 2 }]);
  });

  it('handles a comma-formatted negative balance string ("-1,234") the same as a plain negative number', () => {
    const account = [{ '2026-01-01': '-1,234' }, { '2026-01-02': '-1,234' }];
    expect(Yamls.computePenaltyDays(account)).toEqual([{ '2026-01': 1 }, { ALL: 1 }]);
  });

  it('returns [] entries safely for an empty or non-array account', () => {
    expect(Yamls.computePenaltyDays([])).toEqual([{ ALL: 0 }]);
    expect(Yamls.computePenaltyDays(null)).toEqual([{ ALL: 0 }]);
  });

  it("PeriodStart's own day 1 never counts toward penalty, even if its own Account balance is negative", () => {
    // Account's real day 1 is never debited (buildAccountEntries), so it can only go negative via a same-day History entry — but even then, day 1 is always the FIRST day of any streak it starts, so the grace-period rule alone already exempts it.
    const account = [
      { '2026-01-19': '-500' }, // PeriodStart itself, somehow already negative
      { '2026-01-20': '-1,000' },
    ];
    const result = Yamls.computePenaltyDays(account);
    expect(result).toEqual([{ '2026-01': 1 }, { ALL: 1 }]);
  });
});

describe('Yamls.computePenalty (PenaltyDays * PenaltyForDay, capped at PriceMaxApp / 2)', () => {
  it("multiplies each month's day count by the fixed daily rate when under the cap", () => {
    const penaltyDays = [{ '2026-01': 3 }, { '2026-02': 0 }, { ALL: 3 }];
    const priceMaxApp = [{ '2026-01': '1,620,000' }, { '2026-02': '1,620,000' }];
    // Cap is 1,620,000 / 2 = 810,000 — 3 * 50,000 = 150,000 stays well under it.
    expect(Yamls.computePenalty(penaltyDays, 50000, priceMaxApp)).toEqual([
      { '2026-01': '150,000' },
      { '2026-02': '0' },
      { ALL: '150,000' },
    ]);
  });

  it('clamps a month whose raw PenaltyDays * PenaltyForDay exceeds half its own PriceMaxApp', () => {
    const penaltyDays = [{ '2026-01': 20 }, { ALL: 20 }];
    const priceMaxApp = [{ '2026-01': '1,620,000' }];
    // Raw: 20 * 50,000 = 1,000,000.
    // Cap: 1,620,000 / 2 = 810,000.
    // Clamped to 810,000.
    expect(Yamls.computePenalty(penaltyDays, 50000, priceMaxApp)).toEqual([
      { '2026-01': '810,000' },
      { ALL: '810,000' },
    ]);
  });

  it('treats a month with no matching PriceMaxApp entry as a 0 cap (0 penalty)', () => {
    const penaltyDays = [{ '2026-03': 5 }, { ALL: 5 }];
    const priceMaxApp = [{ '2026-01': '1,620,000' }];
    expect(Yamls.computePenalty(penaltyDays, 50000, priceMaxApp)).toEqual([
      { '2026-03': '0' },
      { ALL: '0' },
    ]);
  });
});

describe('Yamls.scanCellFolder', () => {
  it('returns [] when the key folder does not exist', () => {
    expect(Yamls.scanCellFolder(workDir, 'Bank-OT')).toEqual([]);
  });

  it('reads dated subfolders, sorted, amount formatted with a thousands comma', () => {
    writeTree(path.join(workDir, 'Bank-OT'), {
      '2025-08-01 4,200,000': {},
      '2025-07-09 4,200,000': {},
      'not-a-date': {},
    });

    expect(Yamls.scanCellFolder(workDir, 'Bank-OT')).toEqual([
      { '2025-07-09': '4,200,000' },
      { '2025-08-01': '4,200,000' },
    ]);
  });

  it('accepts single-space, double-space, comma, and no-comma folder-name variants alike, always formatting the output', () => {
    writeTree(path.join(workDir, 'Bank-OT'), {
      '2025-07-11 2,340,000': {}, // single space, comma
    });
    expect(Yamls.scanCellFolder(workDir, 'Bank-OT')).toEqual([{ '2025-07-11': '2,340,000' }]);

    fs.rmSync(path.join(workDir, 'Bank-OT'), { recursive: true, force: true });
    writeTree(path.join(workDir, 'Bank-OT'), {
      '2025-07-11  2340000': {}, // double space, no comma
    });
    expect(Yamls.scanCellFolder(workDir, 'Bank-OT')).toEqual([{ '2025-07-11': '2,340,000' }]);
  });

  it('deduplicates two differently-formatted folders that resolve to the SAME date+amount (never double-counted)', () => {
    // A real incident: an already-existing "2025-07-11  2,340,000" (double
    // space) folder plus a mistakenly-created "2025-07-11 2,340,000" (single
    // space) sibling both matched the regex and were counted as two separate
    // payments — silently doubling the recorded rent payment.
    writeTree(path.join(workDir, 'Bank-OT'), {
      '2025-07-11 2,340,000': {},
      '2025-07-11  2,340,000': {},
    });

    expect(Yamls.scanCellFolder(workDir, 'Bank-OT')).toEqual([{ '2025-07-11': '2,340,000' }]);
  });
});

describe('Yamls.writeCellArrays', () => {
  it('writes every Excel.CellNames key as its own array, empty when its folder is absent', () => {
    writeConfig({ Excel: { CellNames: ['Bank-OT', 'Bonuses'] } });

    const f = path.join(workDir, 't.contract');
    fs.writeFileSync(f, 'ActDateEnd: \nAccrual:\n  - 2026-01-01: 390,000\nPrepayMonth: \n', 'utf8');

    writeTree(path.join(workDir, 'Bank-OT'), { '2025-07-09 4,200,000': {} });
    // No Bonuses/ folder on disk — must still be written, as an empty array.

    Yamls.writeCellArrays(f, workDir);

    const content = read(workDir, 't.contract');
    expect(content).toContain('Bank-OT:');
    expect(content).toContain('2025-07-09: 4,200,000');
    expect(content).toContain('Bonuses: []');
    expect(content).toContain('PrepayMonth:');
  });

  it('inserts each key chained after the previous one (Bank-OT after Accrual, Bonuses after Bank-OT)', () => {
    writeConfig({ Excel: { CellNames: ['Bank-OT', 'Bonuses'] } });

    const f = path.join(workDir, 't2.contract');
    fs.writeFileSync(f, 'ActDateEnd: \nAccrual:\n  - 2026-01-01: 390,000\n', 'utf8');

    Yamls.writeCellArrays(f, workDir);

    const lines = read(workDir, 't2.contract').split('\n');
    const accrualIdx = lines.findIndex((l) => l.startsWith('Accrual:'));
    const bankIdx = lines.findIndex((l) => l.startsWith('Bank-OT:'));
    const bonusIdx = lines.findIndex((l) => l.startsWith('Bonuses:'));
    expect(bankIdx).toBeGreaterThan(accrualIdx);
    expect(bonusIdx).toBeGreaterThan(bankIdx);
  });
});

describe('Yamls.buildAccrualEntries', () => {
  it("rounds a partial first period to the nearest whole so'm only, never up to the nearest 1,000", () => {
    // Day 9 through end of a 31-day month = 23 days: 23/31 * 390,000 = 289,354.83... -> 289,355 (never 290,000).
    const entries = Yamls.buildAccrualEntries('2026-01-09', '2026-01-31', '390,000');
    expect(entries).toEqual([{ '2026-01-09': '289,355' }]);
  });

  it('leaves a full-month period exactly at Price, never touched by rounding', () => {
    const entries = Yamls.buildAccrualEntries('2026-01-01', '2026-02-28', '390,000');
    expect(entries).toEqual([{ '2026-01-01': '390,000' }, { '2026-02-01': '390,000' }]);
  });
});

describe('Yamls.buildPriceAppEntries', () => {
  const accrual = [
    { '2026-01-09': '289,355' },
    { '2026-02-01': '390,000' },
    { '2026-03-01': '390,000' },
    { ALL: '1,069,355' },
  ];

  it('uses the flat, never-prorated Price for a month with no debt, even a partial first month', () => {
    const loaners = [{ '2026-01-09': '0' }, { '2026-02-01': '0' }, { '2026-03-01': '0' }, { ALL: '0' }];
    const entries = Yamls.buildPriceAppEntries(accrual, loaners, '390,000', '450,000');
    expect(entries).toEqual([
      { '2026-01': '390,000' },
      { '2026-02': '390,000' },
      { '2026-03': '390,000' },
    ]);
  });

  it('switches a month with Loaners > 0 to PriceMax, leaving every other month at Price', () => {
    const loaners = [{ '2026-01-09': '0' }, { '2026-02-01': '0' }, { '2026-03-01': '390,000' }, { ALL: '390,000' }];
    const entries = Yamls.buildPriceAppEntries(accrual, loaners, '390,000', '450,000');
    expect(entries).toEqual([
      { '2026-01': '390,000' },
      { '2026-02': '390,000' },
      { '2026-03': '450,000' },
    ]);
  });

  it('ignores the trailing ALL entry on both accrual and loaners', () => {
    const loaners = [{ '2026-01-09': '0' }, { '2026-02-01': '0' }, { '2026-03-01': '0' }, { ALL: '0' }];
    const entries = Yamls.buildPriceAppEntries(accrual, loaners, '390,000', '450,000');
    expect(entries).toHaveLength(3);
  });
});

describe('Yamls.buildPriceMaxAppEntries', () => {
  const accrual = [
    { '2026-01-09': '289,355' },
    { '2026-02-01': '390,000' },
    { '2026-03-01': '390,000' },
    { ALL: '1,069,355' },
  ];

  it('uses PriceMax for every month, regardless of debt — no Price-vs-PriceMax switch', () => {
    const entries = Yamls.buildPriceMaxAppEntries(accrual, '450,000');
    expect(entries).toEqual([
      { '2026-01': '450,000' },
      { '2026-02': '450,000' },
      { '2026-03': '450,000' },
    ]);
  });

  it('ignores the trailing ALL entry on accrual', () => {
    const entries = Yamls.buildPriceMaxAppEntries(accrual, '450,000');
    expect(entries).toHaveLength(3);
  });
});

describe('Yamls.buildPriceDayEntries', () => {
  it("divides each month's PriceApp by that month's own real day count, rounded to the nearest whole so'm", () => {
    // Jan 2026 = 31 days: 1,620,000 / 31 = 52,258.06... -> 52,258. Feb 2026 = 28 days: 1,620,000 / 28 = 57,857.14... -> 57,857.
    const priceApp = [{ '2026-01': '1,620,000' }, { '2026-02': '1,620,000' }];
    const entries = Yamls.buildPriceDayEntries(priceApp);
    expect(entries).toEqual([{ '2026-01': '52,258' }, { '2026-02': '57,857' }]);
  });

  it('ignores a trailing ALL entry on priceApp', () => {
    const priceApp = [{ '2026-01': '1,620,000' }, { ALL: '1,620,000' }];
    const entries = Yamls.buildPriceDayEntries(priceApp);
    expect(entries).toHaveLength(1);
  });
});

describe('Yamls.buildAccountEntries', () => {
  it('day 1 (PeriodStart) also debits its own month PriceDay (previous balance 0 is >= 0), then adds History', () => {
    // Day 1's previous balance is 0, so PriceDay applies.
    // 0 - 50,000 + 1,600,000 = 1,550,000.
    const history = [{ '2026-01-19': '1,600,000' }];
    const priceDay = [{ '2026-01': '50,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-19', '2026-01-19', history, priceDay, priceMaxDay);
    expect(entries).toEqual([{ '2026-01-19': '1,550,000' }]);
  });

  it('day 1 goes negative when unpaid, same as any other day', () => {
    const priceDay = [{ '2026-01': '50,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-19', '2026-01-19', [], priceDay, priceMaxDay);
    expect(entries).toEqual([{ '2026-01-19': '-50,000' }]);
  });

  it("stays on PriceDay once balance recovers, credits History as a plain add", () => {
    // Day 1: 0 - 50,000 = -50,000 (no History, uses PriceDay since previous balance 0 is >= 0).
    // Day 2's own debit uses PriceMaxDay (80,000), since day 1's balance was already negative: -50,000 - 80,000 = -130,000.
    // That same day a 1,000,000 payment lands: -130,000 + 1,000,000 = 870,000.
    // Day 3: day 2's balance (870,000) is >= 0, so PriceDay applies: 870,000 - 50,000 = 820,000.
    // Day 4: day 3's balance is still >= 0, PriceDay again: 820,000 - 50,000 = 770,000.
    const history = [{ '2026-01-02': '1,000,000' }];
    const priceDay = [{ '2026-01': '50,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-01', '2026-01-04', history, priceDay, priceMaxDay);
    expect(entries).toEqual([
      { '2026-01-01': '-50,000' },
      { '2026-01-02': '870,000' },
      { '2026-01-03': '820,000' },
      { '2026-01-04': '770,000' },
    ]);
  });

  it('switches to PriceMaxDay (the full rate, no prepay discount) once the previous day goes negative, and back to PriceDay once it recovers', () => {
    // Day 1: 0 - 50,000 = -50,000 (previous balance 0 is >= 0, PriceDay applies).
    // Day 2: previous balance -50,000 is negative, so PriceMaxDay (80,000) applies: -50,000 - 80,000 = -130,000.
    // Day 3: previous balance still negative, PriceMaxDay again: -130,000 - 80,000 = -210,000.
    const priceDay = [{ '2026-01': '50,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-01', '2026-01-03', [], priceDay, priceMaxDay);
    expect(entries).toEqual([
      { '2026-01-01': '-50,000' },
      { '2026-01-02': '-130,000' },
      { '2026-01-03': '-210,000' },
    ]);
  });

  it('a Returns entry in History (already negative) reduces the balance on its own date', () => {
    const history = [{ '2026-01-02': '-200,000' }];
    const priceDay = [{ '2026-01': '50,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-01', '2026-01-02', history, priceDay, priceMaxDay);
    expect(entries).toEqual([{ '2026-01-01': '-50,000' }, { '2026-01-02': '-330,000' }]);
  });

  it('looks up PriceDay/PriceMaxDay by the CURRENT day\'s own calendar month, not the start month', () => {
    // Jan (50,000/day) day 1: 0 - 50,000 = -50,000 (PriceDay, previous balance 0 is >= 0).
    // Feb 1: previous balance (Jan 31's) is negative, so PriceMaxDay applies — February's own rate (90,000): -50,000 - 90,000 = -140,000.
    const priceDay = [{ '2026-01': '50,000' }, { '2026-02': '60,000' }];
    const priceMaxDay = [{ '2026-01': '80,000' }, { '2026-02': '90,000' }];
    const entries = Yamls.buildAccountEntries('2026-01-31', '2026-02-02', [], priceDay, priceMaxDay);
    expect(entries).toEqual([
      { '2026-01-31': '-50,000' },
      { '2026-02-01': '-140,000' },
      { '2026-02-02': '-230,000' },
    ]);
  });

  it('returns [] for an invalid or empty startDate/futureDate', () => {
    expect(Yamls.buildAccountEntries('', '2026-01-01', [], [], [])).toEqual([]);
    expect(Yamls.buildAccountEntries('2026-01-05', '2026-01-01', [], [], [])).toEqual([]);
    expect(Yamls.buildAccountEntries('Invalid Date', '2026-01-01', [], [], [])).toEqual([]);
  });
});

describe('Yamls.computeFaktura', () => {
  const accrual = [
    { '2026-01-01': '390,000' },
    { '2026-02-01': '390,000' },
    { '2026-03-01': '390,000' },
    { ALL: '1,170,000' }, // trailing ALL entry must be ignored, like Loaners/Penalty do
  ];

  it("keys each entry by its period's own END date (month-end), not Accrual's start-date key", () => {
    const ehfIn = [{ '2025-09-10': '500000' }];
    const result = Yamls.computeFaktura(accrual, ehfIn);
    expect(result).toEqual([
      { '2026-01-31': '390,000' },
      { '2026-02-28': '110,000' },
      { '2026-03-31': '0' },
      { ALL: '500,000' },
    ]);
  });

  it('writes 0 for every period once the whole EHF-IN sum is exhausted', () => {
    const ehfIn = [{ '2025-09-10': '390000' }];
    const result = Yamls.computeFaktura(accrual, ehfIn);
    expect(result).toEqual([
      { '2026-01-31': '390,000' },
      { '2026-02-28': '0' },
      { '2026-03-31': '0' },
      { ALL: '390,000' },
    ]);
  });

  it('never over-distributes beyond the real Accrual owed for a period', () => {
    // EHF-IN total (2,000,000) far exceeds the 3-month Accrual (1,170,000) —
    // each period still only ever gets its own Accrual amount, never more.
    const ehfIn = [{ '2025-09-10': '2000000' }];
    const result = Yamls.computeFaktura(accrual, ehfIn);
    expect(result).toEqual([
      { '2026-01-31': '390,000' },
      { '2026-02-28': '390,000' },
      { '2026-03-31': '390,000' },
      { ALL: '1,170,000' },
    ]);
  });

  it('returns 0 for every period and ALL: 0 when there is no EHF-IN at all', () => {
    const result = Yamls.computeFaktura(accrual, []);
    expect(result).toEqual([
      { '2026-01-31': '0' },
      { '2026-02-28': '0' },
      { '2026-03-31': '0' },
      { ALL: '0' },
    ]);
  });
});

describe('Yamls.writeFaktura', () => {
  it('inserts the Faktura array directly after the Payment: block', () => {
    const f = path.join(workDir, 't.contract');
    fs.writeFileSync(
      f,
      'ActDateEnd: \nAccrual:\n  - 2026-01-01: 390,000\nPayment:\n  - 2026-01-01: 390,000\nPrepayMonth: \n',
      'utf8'
    );

    Yamls.writeFaktura(f, [{ '2026-01-31': '390,000' }, { ALL: '390,000' }]);

    const lines = read(workDir, 't.contract').split('\n');
    const paymentIdx = lines.findIndex((l) => l.startsWith('Payment:'));
    const fakturaIdx = lines.findIndex((l) => l.startsWith('Faktura:'));
    expect(fakturaIdx).toBeGreaterThan(paymentIdx);
    expect(lines[fakturaIdx + 1]).toBe('  - 2026-01-31: 390,000');
    expect(read(workDir, 't.contract')).toContain('PrepayMonth:');
  });

  it('writes an empty Faktura: [] block (allowEmpty=true) when faktura is empty', () => {
    const f = path.join(workDir, 't2.contract');
    fs.writeFileSync(f, 'Payment:\n  - 2026-01-01: 390,000\n', 'utf8');

    Yamls.writeFaktura(f, []);

    expect(read(workDir, 't2.contract')).toContain('Faktura: []');
  });
});

describe('Yamls.computeFakturaSend', () => {
  const accrual = [
    { '2026-01-01': '390,000' },
    { '2026-02-01': '390,000' },
    { '2026-03-01': '390,000' },
    { ALL: '1,170,000' },
  ];

  it("is Accrual minus that period's own Faktura amount, same end-date key as Faktura", () => {
    const ehfIn = [{ '2025-09-10': '500000' }];
    const faktura = Yamls.computeFaktura(accrual, ehfIn);
    const fakturaSend = Yamls.computeFakturaSend(accrual, ehfIn);

    expect(fakturaSend).toEqual([
      { '2026-01-31': '0' }, // 390,000 - 390,000 (fully invoiced)
      { '2026-02-28': '280,000' }, // 390,000 - 110,000
      { '2026-03-31': '390,000' }, // 390,000 - 0 (nothing invoiced yet)
      { ALL: '670,000' },
    ]);

    // Cross-check: Faktura[i] + FakturaSend[i] === Accrual[i] for every period.
    const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;
    for (let i = 0; i < 3; i++) {
      const accrualAmt = toAmount(Object.values(accrual[i])[0]);
      const fakturaAmt = toAmount(Object.values(faktura[i])[0]);
      const sendAmt = toAmount(Object.values(fakturaSend[i])[0]);
      expect(fakturaAmt + sendAmt).toBe(accrualAmt);
    }
  });

  it('is all-zero when EHF-IN already covers every period in full', () => {
    const ehfIn = [{ '2025-09-10': '2000000' }]; // exceeds the 1,170,000 total
    const result = Yamls.computeFakturaSend(accrual, ehfIn);
    expect(result).toEqual([
      { '2026-01-31': '0' },
      { '2026-02-28': '0' },
      { '2026-03-31': '0' },
      { ALL: '0' },
    ]);
  });

  it('equals the full Accrual amount for every period when there is no EHF-IN at all', () => {
    const result = Yamls.computeFakturaSend(accrual, []);
    expect(result).toEqual([
      { '2026-01-31': '390,000' },
      { '2026-02-28': '390,000' },
      { '2026-03-31': '390,000' },
      { ALL: '1,170,000' },
    ]);
  });
});

describe('Yamls.writeFakturaSend', () => {
  it('inserts the FakturaSend array directly after the Faktura: block', () => {
    const f = path.join(workDir, 'fs.contract');
    fs.writeFileSync(
      f,
      'ActDateEnd: \nAccrual:\n  - 2026-01-01: 390,000\nFaktura:\n  - 2026-01-31: 390,000\nPrepayMonth: \n',
      'utf8'
    );

    Yamls.writeFakturaSend(f, [{ '2026-01-31': '0' }, { ALL: '0' }]);

    const lines = read(workDir, 'fs.contract').split('\n');
    const fakturaIdx = lines.findIndex((l) => l.startsWith('Faktura:'));
    const sendIdx = lines.findIndex((l) => l.startsWith('FakturaSend:'));
    expect(sendIdx).toBeGreaterThan(fakturaIdx);
    expect(lines[sendIdx + 1]).toBe('  - 2026-01-31: 0');
    expect(read(workDir, 'fs.contract')).toContain('PrepayMonth:');
  });

  it('writes an empty FakturaSend: [] block (allowEmpty=true) when fakturaSend is empty', () => {
    const f = path.join(workDir, 'fs2.contract');
    fs.writeFileSync(f, 'Faktura:\n  - 2026-01-31: 390,000\n', 'utf8');

    Yamls.writeFakturaSend(f, []);

    expect(read(workDir, 'fs2.contract')).toContain('FakturaSend: []');
  });
});

describe('Yamls.extractFirstNumber', () => {
  it('returns the leading run of digits as a string', () => {
    expect(Yamls.extractFirstNumber('123abc')).toBe('123');
    expect(Yamls.extractFirstNumber('42')).toBe('42');
  });

  it('returns null when the string does not start with a digit', () => {
    expect(Yamls.extractFirstNumber('abc123')).toBeNull();
    expect(Yamls.extractFirstNumber('')).toBeNull();
  });
});

describe('Yamls.loadAndParseYaml', () => {
  it('parses a plain YAML file and trims string values', () => {
    const f = path.join(workDir, 'c.yml');
    fs.writeFileSync(f, 'Name:   Acme  \nAge: 5\n', 'utf8');
    const data = Yamls.loadAndParseYaml(f);
    expect(data.Name).toBe('Acme');
    // bare digit values are quoted by the preprocessor -> stay strings
    expect(data.Age).toBe('5');
  });

  it('comments out a duplicate root-level key block (keeps the first)', () => {
    const f = path.join(workDir, 'dup.yml');
    fs.writeFileSync(f, 'Key: first\nKey: second\nOther: keep\n', 'utf8');
    const data = Yamls.loadAndParseYaml(f);
    expect(data.Key).toBe('first');
    expect(data.Other).toBe('keep');
  });

  it('quotes values containing commas so they stay a single scalar', () => {
    const f = path.join(workDir, 'comma.yml');
    fs.writeFileSync(f, 'Price: 1,000,000\n', 'utf8');
    const data = Yamls.loadAndParseYaml(f);
    expect(data.Price).toBe('1,000,000');
  });

  it('preserves null / true / false literals', () => {
    const f = path.join(workDir, 'lit.yml');
    fs.writeFileSync(f, 'A: null\nB: true\nC: false\n', 'utf8');
    const data = Yamls.loadAndParseYaml(f);
    expect(data.A).toBeNull();
    expect(data.B).toBe(true);
    expect(data.C).toBe(false);
  });
});

describe('Yamls.getPrepayMonth', () => {
  it('reads PrepayMonth from yamlData when present', () => {
    expect(Yamls.getPrepayMonth({ PrepayMonth: 3 })).toBe(3);
  });

  it('falls back to config Contract.PrepayMonth when empty', () => {
    writeConfig({ Contract: { PrepayMonth: 6 } });
    expect(Yamls.getPrepayMonth({})).toBe(6);
    expect(Yamls.getPrepayMonth({ PrepayMonth: '' })).toBe(6);
  });
});

describe('Yamls.loadYamlWithDeps', () => {
  it('merges the main yaml with bank/ and cost/ dependency files', () => {
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1' } });
    // dependency files resolve under <project>/conf/bank and <project>/conf/cost
    writeTree(projectDir, {
      conf: {
        bank: { 'AAB.yaml': yaml.dump({ BankName: 'Asia Alliance', WhoAmI: 'AAB' }) },
        cost: { 'T1.yaml': yaml.dump({ TariffPrice: 100, Tariff: 'T1' }) },
      },
    });
    const main = path.join(workDir, 'main.yaml');
    fs.writeFileSync(main, yaml.dump({ WhoAmI: 'AAB', Tariff: 'T1', Area: '50' }), 'utf8');

    const data = Yamls.loadYamlWithDeps(main);

    // main wins on conflicts; deps contribute their own keys
    expect(data.WhoAmI).toBe('AAB');
    expect(data.Tariff).toBe('T1');
    expect(data.BankName).toBe('Asia Alliance');
    expect(data.TariffPrice).toBe('100');
    expect(data.Area).toBe('50');
  });

  it('falls back to config DefaultBank / DefaultTariff when missing', () => {
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1' } });
    writeTree(projectDir, {
      conf: {
        bank: { 'AAB.yaml': yaml.dump({ BankName: 'Asia Alliance' }) },
        cost: { 'T1.yaml': yaml.dump({ TariffPrice: 100 }) },
      },
    });
    const main = path.join(workDir, 'main.yaml');
    fs.writeFileSync(main, yaml.dump({ Area: '50' }), 'utf8'); // no WhoAmI/Tariff

    const data = Yamls.loadYamlWithDeps(main);
    expect(data.WhoAmI).toBe('AAB');
    expect(data.Tariff).toBe('T1');
    expect(data.BankName).toBe('Asia Alliance');
  });

  it('warns via Dialogs when a dependency file is missing', () => {
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1' } });
    // create only the main file; bank/cost files absent → loadAndParseYaml throws
    const main = path.join(workDir, 'main.yaml');
    fs.writeFileSync(main, yaml.dump({ WhoAmI: 'GONE', Tariff: 'NOPE' }), 'utf8');

    // missing bank/cost dirs → readFileSync inside loadAndParseYaml throws ENOENT
    expect(() => Yamls.loadYamlWithDeps(main)).toThrow();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });
});

describe('Yamls.mergeYamlsInFolder', () => {
  it('merges multiple object yaml files into App/<folder>.yml, skipping duplicate keys', () => {
    writeTree(workDir, {
      'a.yml': yaml.dump({ Alpha: 1, Shared: 'first' }),
      'b.yaml': yaml.dump({ Beta: 2, Shared: 'second' }),
    });
    Yamls.mergeYamlsInFolder(workDir);

    const appDir = path.join(workDir, 'App');
    const files = fs.readdirSync(appDir).filter((n) => n.endsWith('.yml'));
    expect(files).toHaveLength(1);
    const merged = yaml.load(fs.readFileSync(path.join(appDir, files[0]), 'utf8'), {
      schema: yaml.JSON_SCHEMA,
    });
    // A bare digit value has no space, so it is written unquoted (never
    // quoted just to force string type) and round-trips as a number.
    expect(merged.Alpha).toBe(1);
    expect(merged.Beta).toBe(2);
    // first occurrence wins; duplicate key skipped (order depends on findRecursiveFull)
    expect(merged.Shared).toBeOneOf(['first', 'second']);
  });

  it('excludes @/_ prefixed FOLDERS but not @/_ prefixed FILES', () => {
    // mergeYamlsInFolder passes its @/_ predicate to Files.findRecursiveFull as
    // the *ignoreFolderCondition*, which only filters directories. Files named
    // @x.yml / _x.yaml still match the file `condition` and are merged in — this
    // documents that actual (arguably surprising) behavior.
    writeTree(workDir, {
      'real.yml': yaml.dump({ Keep: 'yes' }),
      '@skip.yml': yaml.dump({ AtFile: 'merged-anyway' }),
      '_skip.yaml': yaml.dump({ UnderFile: 'merged-anyway' }),
      '@SkipDir': { 'inside.yml': yaml.dump({ FromDir: 'excluded' }) },
    });
    Yamls.mergeYamlsInFolder(workDir);
    const appDir = path.join(workDir, 'App');
    const out = fs.readdirSync(appDir).filter((n) => n.endsWith('.yml'))[0];
    const merged = yaml.load(fs.readFileSync(path.join(appDir, out), 'utf8'));
    expect(merged.Keep).toBe('yes');
    // files are NOT excluded by the @/_ rule
    expect(merged).toContainKey('AtFile');
    expect(merged).toContainKey('UnderFile');
    // the @-prefixed *directory* is excluded, so its contents are not merged
    expect(merged).not.toContainKey('FromDir');
  });

  it('warns and returns early for a non-existent folder', () => {
    const r = Yamls.mergeYamlsInFolder(path.join(workDir, 'nope'));
    expect(r).toBeUndefined();
  });

  it('does nothing when there are no yaml files', () => {
    writeTree(workDir, { 'note.txt': 'hi' });
    Yamls.mergeYamlsInFolder(workDir);
    // App dir is created but no output file written
    const appDir = path.join(workDir, 'App');
    expect(fs.existsSync(appDir)).toBe(true);
    expect(fs.readdirSync(appDir).filter((n) => n.endsWith('.yml'))).toHaveLength(0);
  });
});

// --- heavy orchestration methods: exercise reachable (early-return) branches --
describe('Yamls.update', () => {
  it('warns and returns when the template file does not exist', async () => {
    writeConfig({ Templates: { Yaml: path.join(workDir, 'no-template.yaml') } });
    FilesMock.exists.mockReturnValue(false);

    const r = await Yamls.update(path.join(workDir, 'x.yaml'));
    expect(r).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  // Regression for the missing-`await` bug: Files.exists() is async, so the
  // guard must `await` it. Before the fix, `if (!Files.exists(template))`
  // tested a *Promise* (always truthy → guard never fired), so a MISSING
  // template still fell through to the destructive backup/delete steps. Here
  // exists() resolves to `false` asynchronously and we assert the guard fires
  // AND none of the destructive operations run.
  it('awaits the async template check and skips ALL destructive steps when the template is missing', async () => {
    writeConfig({ Templates: { Yaml: path.join(workDir, 'no-template.yaml') } });
    FilesMock.exists.mockResolvedValue(false); // async false — the real Files.exists is async

    const r = await Yamls.update(path.join(workDir, 'x.yaml'));

    expect(r).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    // The guard must short-circuit BEFORE any destructive backup/delete work.
    expect(WordMock.initFolders).not.toHaveBeenCalled();
    expect(FilesMock.backupFile).not.toHaveBeenCalled();
    expect(FilesMock.backupFolder).not.toHaveBeenCalled();
  });

  it('proceeds past the guard when the async template check resolves true', async () => {
    const template = path.join(workDir, 'tpl.yaml');
    fs.writeFileSync(template, yaml.dump({ A: 1 }), 'utf8');
    writeConfig({ Templates: { Yaml: template } });
    FilesMock.exists.mockResolvedValue(true); // async true → guard passes
    WordMock.initFolders.mockReturnValue(false); // stop right after the guard

    const r = await Yamls.update(path.join(workDir, 'x.yaml'));

    // guard did NOT fire (no warning), and execution advanced to Word.initFolders
    expect(DialogsMock.warningBox).not.toHaveBeenCalled();
    expect(WordMock.initFolders).toHaveBeenCalled();
    expect(r).toBe(false);
  });

  it('returns false when Word.initFolders fails', async () => {
    const template = path.join(workDir, 'tpl.yaml');
    fs.writeFileSync(template, yaml.dump({ A: 1 }), 'utf8');
    writeConfig({ Templates: { Yaml: template } });
    FilesMock.exists.mockReturnValue(true);
    WordMock.initFolders.mockReturnValue(false);

    const r = await Yamls.update(path.join(workDir, 'x.yaml'));
    expect(r).toBe(false);
  });
});

describe('Yamls.fillYamlWithInfo', () => {
  it('warns and returns when ymlFile is empty', async () => {
    const r = await Yamls.fillYamlWithInfo('');
    expect(r).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns null when Word.initFolders fails', async () => {
    WordMock.initFolders.mockReturnValue(false);
    const r = await Yamls.fillYamlWithInfo(path.join(workDir, 'x.yaml'));
    expect(r).toBeNull();
  });

  // Regression: a Compan folder can carry BOTH a 9-digit TIN marker and a
  // 14-digit PINFL marker (a sole proprietor/YaTT registered under their own
  // personal ID). Didox's TIN-based lookup for such an entity returns an
  // empty directorPinfl/director (there is no separate director — the
  // entrepreneur IS the company), which used to leave DirName/SurName/etc.
  // blank. The PINFL marker must take priority when resolving comTIN, and
  // isYatt is now derived from the ComType starting-Variables field (filled
  // by smarts-firm-docums from the company's real registration documents),
  // never from an automatic PINFL-vs-TIN-length inference.
  it('prefers the PINFL marker over the TIN marker when both exist', async () => {
    WordMock.initFolders.mockReturnValue(true);
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1', AddDays: 30 } });
    fs.mkdirSync(path.join(projectDir, 'conf', 'bank'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'conf', 'cost'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'conf', 'bank', 'AAB.yaml'), yaml.dump({}), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'conf', 'cost', 'T1.yaml'), yaml.dump({}), 'utf8');

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ WhoAmI: 'AAB', Tariff: 'T1', ComType: 'YaTT' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderDirector = path.join(workDir, 'Director');
    globalThis.folderRestAPI = path.join(workDir, 'RestAPI');
    globalThis.folderALL = workDir;

    FilesMock.getTINFromTXT.mockReturnValue('491842367');
    FilesMock.getPINFLFromTXT.mockReturnValue('31311816590022');
    DidoxMock.infoByTinPinfl.mockImplementation(async (tin) =>
      tin === '31311816590022'
        ? { directorPinfl: '', personalNum: '31311816590022', name: 'LI ZHENGBIN' }
        : null
    );
    MySoliqMock.entrepreneurInfo.mockResolvedValue(null);

    // replaceYaml formats a full contract (pricing, dates, addresses, …) that
    // is out of scope for this regression — stub it so the test stays focused
    // on the TIN-vs-PINFL selection this fix targets.
    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockImplementation(() => {});

    await Yamls.fillYamlWithInfo(ymlFile, null, true, true);

    expect(FilesMock.getPINFLFromTXT).toHaveBeenCalledWith(globalThis.folderCompan);
    expect(DidoxMock.infoByTinPinfl).toHaveBeenCalledWith('31311816590022');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderALL, '#YaTT');

    const [, yamlDataArg, companyInfoArg] = replaceYamlSpy.mock.calls[0];
    expect(yamlDataArg.ComType).toBe('YaTT');
    expect(companyInfoArg.directorPinfl).toBe('31311816590022');
    expect(companyInfoArg.ceo?.name).toBe('LI ZHENGBIN');

    replaceYamlSpy.mockRestore();
  });

  // Regression: isYatt must be derived from the ComType starting-Variables
  // field, never from comTIN.length === 14. A company can have a genuine
  // 14-digit PINFL marker (e.g. a YaTT's director doubling as its own comTIN
  // source) while ComType correctly identifies it as a non-YaTT entity (MChJ,
  // XK, …) — the old length-based inference would have wrongly flagged this
  // as isYatt=true; ComType is now the sole source of truth.
  it('derives isYatt from ComType, not from PINFL/TIN length', async () => {
    WordMock.initFolders.mockReturnValue(true);
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1', AddDays: 30 } });
    fs.mkdirSync(path.join(projectDir, 'conf', 'bank'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'conf', 'cost'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'conf', 'bank', 'AAB.yaml'), yaml.dump({}), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'conf', 'cost', 'T1.yaml'), yaml.dump({}), 'utf8');

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ WhoAmI: 'AAB', Tariff: 'T1', ComType: 'MChJ' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderDirector = path.join(workDir, 'Director');
    globalThis.folderRestAPI = path.join(workDir, 'RestAPI');
    globalThis.folderALL = workDir;

    // A 14-digit PINFL marker is present (same shape that used to force
    // isYatt=true via comTIN.length === 14), but ComType says MChJ — so
    // comTIN must resolve from the TIN marker, never the PINFL one.
    FilesMock.getTINFromTXT.mockReturnValue('491842367');
    FilesMock.getPINFLFromTXT.mockReturnValue('31311816590022');
    DidoxMock.infoByTinPinfl.mockImplementation(async (tin) =>
      tin === '491842367'
        ? { directorPinfl: '77712345', personalNum: '491842367', name: 'ASHALIFE-LIKE MCHJ' }
        : null
    );
    MySoliqMock.companyInfo.mockResolvedValue(null);

    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockImplementation(() => {});

    await Yamls.fillYamlWithInfo(ymlFile, null, true, true);

    expect(FilesMock.getTINFromTXT).toHaveBeenCalledWith(globalThis.folderCompan);
    expect(FilesMock.getPINFLFromTXT).not.toHaveBeenCalled();
    expect(DidoxMock.infoByTinPinfl).toHaveBeenCalledWith('491842367');
    expect(FilesMock.saveInfoToFile).not.toHaveBeenCalledWith(globalThis.folderALL, '#YaTT');

    const [, yamlDataArg, companyInfoArg] = replaceYamlSpy.mock.calls[0];
    expect(yamlDataArg.ComType).toBe('MChJ');
    // directorPinfl is NOT force-set from comTIN when isYatt is false —
    // it stays whatever Didox's own lookup returned.
    expect(companyInfoArg.directorPinfl).toBe('77712345');

    replaceYamlSpy.mockRestore();
  });

  // Regression: a stray/incidental PINFL marker (e.g. the director's own ID,
  // present in Compan/ for an ordinary reason unrelated to the company's
  // legal identity) must NEVER be selected over the TIN for a non-YaTT
  // company — even though a PINFL marker exists on disk, ComType alone
  // decides which marker file is even LOOKED AT, so getPINFLFromTXT is never
  // called at all for a non-YaTT company.
  it('never even reads the PINFL marker for a non-YaTT company, regardless of what exists on disk', async () => {
    WordMock.initFolders.mockReturnValue(true);
    writeConfig({ Contract: { DefaultBank: 'AAB', DefaultTariff: 'T1', AddDays: 30 } });
    fs.mkdirSync(path.join(projectDir, 'conf', 'bank'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'conf', 'cost'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'conf', 'bank', 'AAB.yaml'), yaml.dump({}), 'utf8');
    fs.writeFileSync(path.join(projectDir, 'conf', 'cost', 'T1.yaml'), yaml.dump({}), 'utf8');

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ WhoAmI: 'AAB', Tariff: 'T1', ComType: 'MChJ' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderDirector = path.join(workDir, 'Director');
    globalThis.folderRestAPI = path.join(workDir, 'RestAPI');
    globalThis.folderALL = workDir;

    FilesMock.getTINFromTXT.mockReturnValue('312267167');
    FilesMock.getPINFLFromTXT.mockReturnValue('31910826590039'); // director's own PINFL, incidentally present
    DidoxMock.infoByTinPinfl.mockImplementation(async (tin) =>
      tin === '312267167'
        ? { directorPinfl: '31910826590039', personalNum: '312267167', name: 'ASHALIFE PHARMA' }
        : { directorPinfl: '', personalNum: tin, name: 'LIU HUAN XXX' }
    );
    MySoliqMock.companyInfo.mockResolvedValue(null);

    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockImplementation(() => {});

    await Yamls.fillYamlWithInfo(ymlFile, null, true, true);

    expect(FilesMock.getPINFLFromTXT).not.toHaveBeenCalled();
    expect(DidoxMock.infoByTinPinfl).toHaveBeenCalledWith('312267167');

    replaceYamlSpy.mockRestore();
  });

  // Regression: the SurPINFL/surety derivation used to live ONLY inside the
  // API-only branch (rewrite=true / no cache). A company processed via the
  // cache path (rewrite=false, RestAPI/ALL.json already present) skipped that
  // block entirely, so yamlData.SurPINFL was never filled in even though the
  // cached companyInfo.directorPinfl already had the correct value — the
  // empty SurPINFL was then faithfully "confirmed" back into the .contract
  // file by replaceYaml's replaceTextLine pass. This must now fill SurPINFL
  // from the cache too.
  it('fills yamlData.SurPINFL from a cached companyInfo.directorPinfl (rewrite=false)', async () => {
    WordMock.initFolders.mockReturnValue(true);

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ ComType: 'MChJ', SurPINFL: '' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderDirector = path.join(workDir, 'Director');
    globalThis.folderRestAPI = path.join(workDir, 'RestAPI');
    globalThis.folderALL = workDir;

    fs.mkdirSync(globalThis.folderRestAPI, { recursive: true });
    fs.writeFileSync(
      path.join(globalThis.folderRestAPI, 'ALL.json'),
      JSON.stringify({
        tin: '312808323',
        directorTin: '572120844',
        directorPinfl: '32706996600039',
        ceo: { name: 'ZIYAVIDDINOV ODILJON OBIDJONOVICH', personalNum: '32706996600039' },
      }),
      'utf8'
    );

    const yamlData = { ComType: 'MChJ', SurPINFL: '' };
    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockImplementation(() => {});

    await Yamls.fillYamlWithInfo(ymlFile, yamlData, true, false);

    // API must never be called in cache mode.
    expect(DidoxMock.infoByTinPinfl).not.toHaveBeenCalled();

    expect(yamlData.SurPINFL).toBe('32706996600039');

    const [, yamlDataArg, companyInfoArg] = replaceYamlSpy.mock.calls[0];
    expect(yamlDataArg.SurPINFL).toBe('32706996600039');
    expect(companyInfoArg.surety?.name).toBe('ZIYAVIDDINOV ODILJON OBIDJONOVICH');

    replaceYamlSpy.mockRestore();
  });

  it('writes the resolved ContractDate into Compan/ as a DD.MM.YYYY marker when replaceYaml succeeds', async () => {
    WordMock.initFolders.mockReturnValue(true);

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ ComType: 'MChJ' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderALL = workDir;

    const yamlData = { ComType: 'MChJ' };
    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockImplementation((f, data) => {
      data.ContractDate = '2026-08-15';
      return true;
    });

    await Yamls.fillYamlWithInfo(ymlFile, yamlData, true, false);

    expect(FilesMock.deleteDateMarkers).toHaveBeenCalledWith(globalThis.folderCompan);
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderCompan, '15.08.2026');

    replaceYamlSpy.mockRestore();
  });

  it('never writes a Compan/ date marker when replaceYaml aborts', async () => {
    WordMock.initFolders.mockReturnValue(true);

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, yaml.dump({ ComType: 'MChJ' }), 'utf8');

    globalThis.ymlFile = ymlFile;
    globalThis.folderCompan = path.join(workDir, 'Compan');
    globalThis.folderALL = workDir;

    const yamlData = { ComType: 'MChJ' };
    const replaceYamlSpy = jest.spyOn(Yamls, 'replaceYaml').mockReturnValue(false);

    FilesMock.saveInfoToFile.mockClear();
    FilesMock.deleteDateMarkers.mockClear();

    await Yamls.fillYamlWithInfo(ymlFile, yamlData, true, false);

    expect(FilesMock.deleteDateMarkers).not.toHaveBeenCalledWith(globalThis.folderCompan);
    expect(FilesMock.saveInfoToFile).not.toHaveBeenCalledWith(
      globalThis.folderCompan,
      expect.stringMatching(/^\d{2}\.\d{2}\.\d{4}$/)
    );

    replaceYamlSpy.mockRestore();
  });
});

describe('Yamls.replaceYaml', () => {
  it('warns and returns when yamlData or companyInfo is missing', () => {
    Yamls.replaceYaml('file.yml', null, null);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('yamlData or companyInfo is not defined!');
  });

  it('warns and returns BEFORE writing anything when Price is missing', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    // Price is read much later via String(Price).replaceAll(...); guarding it up
    // front keeps a missing Price from throwing after markers are already on disk.
    expect(() =>
      Yamls.replaceYaml('file.yml', { ContractDate: '2024-11-05' }, { regDate: null })
    ).not.toThrow();

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('Price is missing')
    );
    expect(FilesMock.saveInfoToFile).not.toHaveBeenCalled();
  });

  it('warns and returns when PrepayMonth cannot resolve AND ActDateEnd is blank', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    // No Contract.PrepayMonth configured, none in yamlData, no ActDateEnd to fall back on.
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    expect(() =>
      Yamls.replaceYaml(
        'file.yml',
        { ContractDate: '2024-11-05', ActDateEnd: '', Price: '1,200,000' },
        { regDate: null }
      )
    ).not.toThrow();

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('PrepayMonth is missing')
    );
  });

  it('does NOT require PrepayMonth when ActDateEnd is filled', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = {
      ContractDate: '2024-11-05',
      ActDateEnd: '2025-03-31',
      Price: '1,200,000',
    };
    try {
      Yamls.replaceYaml('file.yml', yamlData, { regDate: null });
    } catch {
      /* unrelated downstream field population, not under test */
    }

    expect(DialogsMock.warningBox).not.toHaveBeenCalledWith(
      expect.stringContaining('PrepayMonth is missing')
    );
    // ActDateEnd is a real, explicit end date — PeriodEnd uses it as-is, no -1-month shift (that shift only applies to the PrepayMonth-derived exclusive-bound path).
    expect(yamlData.PeriodEnd).toBe('2025-03-31');
  });

  it('auto-fills a blank ContractDate from today when MySoliq streetName is not Adolat MFY', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ComType: 'MChJ', ContractDate: '', Price: '1,200,000' };
    expect(() =>
      Yamls.replaceYaml('file.yml', yamlData, {
        soliq: { company: { streetName: 'Chilonzor MFY', registrationDate: '10.08.2023' } },
      })
    ).not.toThrow();

    expect(yamlData.ContractDate).toBe(Dates.today());
    expect(DialogsMock.warningBox).not.toHaveBeenCalledWith(
      expect.stringContaining('ContractDate is missing or invalid')
    );
  });

  it('auto-fills a blank ContractDate from the registry registrationDate when MySoliq streetName contains Adolat MFY', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ComType: 'MChJ', ContractDate: '', Price: '1,200,000' };
    expect(() =>
      Yamls.replaceYaml('file.yml', yamlData, {
        soliq: { company: { streetName: 'Adolat MFY, Tashkent', registrationDate: '10.08.2023' } },
      })
    ).not.toThrow();

    expect(yamlData.ContractDate).toBe('2023-08-10');
    expect(DialogsMock.warningBox).not.toHaveBeenCalledWith(
      expect.stringContaining('ContractDate is missing or invalid')
    );
  });

  it('auto-fills a blank ContractDate from the registry registrationDate when MySoliq streetName contains the Cyrillic "Адолат МФЙ" spelling', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ComType: 'MChJ', ContractDate: '', Price: '1,200,000' };
    expect(() =>
      Yamls.replaceYaml('file.yml', yamlData, {
        soliq: {
          company: {
            streetName: 'Адолат МФЙ, 4 мавзеси, 28/1в-уй',
            registrationDate: '10.08.2023',
          },
        },
      })
    ).not.toThrow();

    expect(yamlData.ContractDate).toBe('2023-08-10');
  });

  it('auto-fills a blank ContractDate from soliqYatt.registrationDate for a YaTT with an Adolat MFY entrepreneurshipAddress', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ComType: 'YaTT', ContractDate: '', Price: '1,200,000' };
    expect(() =>
      Yamls.replaceYaml('file.yml', yamlData, {
        soliqYatt: {
          registrationDate: '05.03.2022',
          entrepreneurshipAddress: { address: 'Adolat MFY, Tashkent' },
        },
      })
    ).not.toThrow();

    expect(yamlData.ContractDate).toBe('2022-03-05');
  });

  it('never overwrites an already-filled ContractDate', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ComType: 'MChJ', ContractDate: '2024-11-05', Price: '1,200,000' };
    try {
      Yamls.replaceYaml('file.yml', yamlData, {
        soliq: { company: { streetName: 'Adolat MFY, Tashkent', registrationDate: '10.08.2023' } },
      });
    } catch {
      /* unrelated downstream field population, not under test */
    }

    expect(yamlData.ContractDate).toBe('2024-11-05');
  });

  it('computes ContractDateEnd from ContractDate + Contract.AddDays when left blank', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = { ContractDate: '2024-11-05', ContractDateEnd: '', Price: '1,200,000' };
    try {
      Yamls.replaceYaml('file.yml', yamlData, { regDate: null });
    } catch {
      /* unrelated downstream field population, not under test */
    }

    // Stays YYYY-MM-DD — Dates.addDays is format-preserving.
    expect(yamlData.ContractDateEnd).toBe('2024-12-05');
    expect(yamlData.Day).toBe('05');
    expect(yamlData.Month).toBe('11');
    expect(yamlData.Year).toBe('2024');
  });

  it('keeps a user-set ContractDateEnd from ALL.contract instead of recomputing it', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const yamlData = {
      ContractDate: '2024-11-05',
      ContractDateEnd: '2030-01-31',
      Price: '1,200,000',
    };
    try {
      Yamls.replaceYaml('file.yml', yamlData, { regDate: null });
    } catch {
      /* unrelated downstream field population, not under test */
    }

    expect(yamlData.ContractDateEnd).toBe('2030-01-31');
    expect(yamlData.DayEnd).toBe('31');
    expect(yamlData.MonthEnd).toBe('01');
    expect(yamlData.YearEnd).toBe('2030');
  });

  it('warns and returns instead of throwing when ContractDateEnd cannot be resolved to a valid date', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    // ContractDate itself is valid, but the user-set ContractDateEnd is not a real date.
    expect(() =>
      Yamls.replaceYaml(
        'file.yml',
        { ContractDate: '2024-11-05', ContractDateEnd: 'not-a-date', Price: '1,200,000' },
        { regDate: null }
      )
    ).not.toThrow();

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('ContractDateEnd is missing or invalid')
    );
  });

  it('warns and returns instead of throwing when IjaraDateEnd cannot be resolved to a valid date', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    // No Contract.IjaraDateEnd configured, and yamlData carries none either.
    writeConfig({ Contract: { AddDays: 30 } });

    // ContractDate and its derived ContractDateEnd both resolve fine — only the empty
    // IjaraDateEnd should fail to split.
    expect(() =>
      Yamls.replaceYaml(
        'file.yml',
        { ContractDate: '2024-11-05', IjaraDateEnd: '', Price: '1,200,000' },
        { regDate: null }
      )
    ).not.toThrow();

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('IjaraDateEnd is missing or invalid')
    );
  });

  it('always writes one Accrual entry per month across the contract period', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const ymlFile = path.join(workDir, 'ALL.contract');
    // Mirrors the real template shape: bare-named YYYY-MM-DD date lines, filled
    // by replaceTextLine. ComBase: is the real anchor writeAccrual inserts after
    // (see the confirmed-correct real file layout) — without it, writeAccrual
    // falls back to appending at end of file instead.
    fs.writeFileSync(
      ymlFile,
      'ContractDateEnd: \nComDate: \nActDate: \nActDateEnd: \nComBase: Устава\n',
      'utf8'
    );

    FilesMock.getDateFromTXT.mockReturnValue('01.01.2026');
    WordMock.extractDate.mockReturnValue({ day: '01', month: '01', year: '2026' });
    DidoxMock.bankByCode.mockReturnValue({ name: 'Bank' });
    DidoxMock.regionsByCode.mockReturnValue({ name: 'Region' });
    DidoxMock.districtsByCode.mockReturnValue({ name: 'District' });

    // ActDateStart/ActDateEnd are read from the yamlData ARGUMENT, never from
    // the file (replaceYaml never reads them back off disk) — PeriodStart/
    // PeriodEnd are derived straight from these two. ActDateEnd set
    // explicitly (not blank) so PeriodEnd resolves deterministically —
    // leaving it blank/absent falls back to
    // Dates.futureDateByMonth(prepayMonth, false), which is today-relative
    // (non-deterministic across test runs) and, with no PrepayMonth
    // configured, resolves to dayjs's "Invalid Date" string, silently
    // emptying every downstream Accrual/Payment/Loaners/Penalty computation.
    Yamls.replaceYaml(
      ymlFile,
      {
        ComType: 'MChJ',
        ContractDate: '2026-01-01',
        ActDateStart: '2026-01-01',
        ActDateEnd: '2026-01-31',
        Price: '4,200,000',
        // PriceMax === Price: no real payment exists in this test (no
        // Bank-OT/Card-OT/etc. folders), so recomputeChain's fixed-point
        // loop re-prices every month at PriceMax (a month with Loaners > 0
        // is charged PriceMax instead of Price) — setting them equal keeps
        // the asserted Accrual amount correct regardless of that re-pricing.
        PriceMax: '4,200,000',
        SurEnable: false,
        RepEnable: false,
      },
      {
        soliq: {
          company: {
            okedDetail: { name_uz_latn: '' },
            businessStructureDetail: { name_uz_latn: '' },
            statusDetail: { name_uz_latn: '', group: '' },
          },
          companyBillingAddress: {},
        },
      }
    );

    const content = fs.readFileSync(ymlFile, 'utf8');
    expect(content).toContain('Accrual:');
    // ActDateStart 2026-01-01 -> ActDateEnd 2026-01-31: a single full-month range, keyed by its own start (due) date.
    expect(content).toContain('2026-01-01: 4,200,000');
    // PriceApp: bare "YYYY-MM" key, flat full-month Price (PriceMax === Price here, so the debt-vs-no-debt branch is unobservable in this fixture).
    expect(content).toContain('PriceApp:');
    expect(content).toContain('2026-01: 4,200,000');
    // PriceDay: 4,200,000 / 31 days in January = 135,483.87... -> 135,484.
    expect(content).toContain('PriceDay:');
    expect(content).toContain('2026-01: 135,484');
    // PriceMaxApp/PriceMaxDay: same flat full-month shape, always PriceMax (4,200,000 here, same as Price in this fixture).
    expect(content).toContain('PriceMaxApp:');
    expect(content).toContain('PriceMaxDay:');
    // Account: day 1 (PeriodStart) already debits January's own 135,484 rate (no History in this fixture); day 2 debits the same rate again off day 1's balance (PriceDay === PriceMaxDay here, since Price === PriceMax in this fixture).
    expect(content).toContain('Account:');
    expect(content).toContain("2026-01-01: '-135,484'");
    expect(content).toContain("2026-01-02: '-270,968'");
    // Loaners: a plain scalar now — the absolute value of Account's own last (2026-01-31) entry, never an array.
    expect(content).toMatch(/^Loaners: '?[\d,]+'?$/m);
    expect(content).not.toMatch(/Loaners:\n\s+-/);
    // PrepayMon: the resolved PrepayMonth value the code actually used — blank here, since ActDateEnd was filled so PrepayMonth was never read.
    expect(content).toContain('PrepayMon:');
  });

  it('never stomps an array-valued yamlData key with no dedicated writer into a broken "[object Object]" scalar line', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({ Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 } });

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(
      ymlFile,
      'ContractDateEnd: \nComDate: \nActDate: \nActDateEnd: \nComBase: Устава\n\nStrayNote:\n  - 2026-01-19: 1,600,000\n',
      'utf8'
    );

    FilesMock.getDateFromTXT.mockReturnValue('01.01.2026');
    WordMock.extractDate.mockReturnValue({ day: '01', month: '01', year: '2026' });
    DidoxMock.bankByCode.mockReturnValue({ name: 'Bank' });
    DidoxMock.regionsByCode.mockReturnValue({ name: 'Region' });
    DidoxMock.districtsByCode.mockReturnValue({ name: 'District' });

    /*
     * Array-valued yamlData key with no dedicated writer (StrayNote — a stand-in for any future ad-hoc array block, same shape as the real Account: incident before Account got its own writer).
     * Mirrors real incident: an array key loaded off disk got stringified into "StrayNote: [object Object],[object Object]" by the generic replaceTextLine loop.
     * js-yaml could no longer re-parse it.
     */
    Yamls.replaceYaml(
      ymlFile,
      {
        ComType: 'MChJ',
        ContractDate: '2026-01-01',
        ActDateStart: '2026-01-01',
        ActDateEnd: '2026-01-31',
        Price: '4,200,000',
        PriceMax: '4,200,000',
        SurEnable: false,
        RepEnable: false,
        StrayNote: [{ '2026-01-19': '1,600,000' }],
      },
      {
        soliq: {
          company: {
            okedDetail: { name_uz_latn: '' },
            businessStructureDetail: { name_uz_latn: '' },
            statusDetail: { name_uz_latn: '', group: '' },
          },
          companyBillingAddress: {},
        },
      }
    );

    const content = fs.readFileSync(ymlFile, 'utf8');
    expect(content).not.toContain('[object Object]');
    // The pre-existing StrayNote: block on disk (never targeted by any writer) stays exactly as it was loaded.
    expect(content).toContain('StrayNote:');
    expect(content).toContain('2026-01-19: 1,600,000');
  });

  it('always writes one PenaltyDays/Penalty entry per month, computed from a real Bank-OT folder via the daily-balance model', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({
      Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 },
      Penalty: { PerDay: 50000 },
      Excel: { CellNames: [] },
    });

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, 'ContractDateEnd: \nComDate: \nActDate: \nActDateEnd: \n', 'utf8');

    // Rent (4,200,000) is paid on 2026-02-05, well after the 2026-01-01
    // period start — the daily-balance simulation debits Jan's prorated
    // share every day starting 2026-01-01, so the balance goes negative
    // almost immediately and stays negative (past the 1-day grace period)
    // until the 2026-02-05 payment credits it. PeriodEnd extends into
    // February so the payment date falls inside the simulated ledger.
    writeTree(path.join(workDir, 'Bank-OT'), { '2026-02-05 4,200,000': {} });

    FilesMock.getDateFromTXT.mockReturnValue('01.01.2026');
    WordMock.extractDate.mockReturnValue({ day: '01', month: '01', year: '2026' });
    DidoxMock.bankByCode.mockReturnValue({ name: 'Bank' });
    DidoxMock.regionsByCode.mockReturnValue({ name: 'Region' });
    DidoxMock.districtsByCode.mockReturnValue({ name: 'District' });

    Yamls.replaceYaml(
      ymlFile,
      {
        ComType: 'MChJ',
        ContractDate: '2026-01-01',
        ActDateStart: '2026-01-01',
        ActDateEnd: '2026-02-28',
        Price: '4,200,000',
        PriceMax: '4,200,000',
        SurEnable: false,
        RepEnable: false,
      },
      {
        soliq: {
          company: {
            okedDetail: { name_uz_latn: '' },
            businessStructureDetail: { name_uz_latn: '' },
            statusDetail: { name_uz_latn: '', group: '' },
          },
          companyBillingAddress: {},
        },
      }
    );

    const content = fs.readFileSync(ymlFile, 'utf8');
    expect(content).toContain('PenaltyDays:');
    expect(content).toContain('Penalty:');
    // January's own period shows real penalty days (grace period on day 1,
    // deficit every day after until the 2026-02-05 payment lands) — the
    // exact count is the daily-balance model's own business, this test only
    // asserts the mechanism actually ran (non-zero for January) and that
    // Penalty = PenaltyDays * 50,000 for that same period. Extracted from the
    // PenaltyDays: block specifically (not Accrual/Faktura/Loaners, which
    // repeat the same bare "2026-01-01" key with different values).
    const penaltyDaysBlock = content.match(/PenaltyDays:\n((?:.|\n)*?)\n\nPenalty:/)[1];
    const janPenaltyDaysMatch = penaltyDaysBlock.match(/2026-01: (\d+)/);
    expect(janPenaltyDaysMatch).not.toBeNull();
    const janPenaltyDays = Number(janPenaltyDaysMatch[1]);
    expect(janPenaltyDays).toBeGreaterThan(0);

    const penaltyBlock = content.match(/\nPenalty:\n((?:.|\n)*?)\n\nReturns:/)[1];
    // Capped at half PriceMax (4,200,000 / 2 = 2,100,000) same as computePenalty's own rule.
    const expectedJanPenalty = Math.min(janPenaltyDays * 50000, 4200000 / 2);
    expect(penaltyBlock).toContain(`2026-01: ${expectedJanPenalty.toLocaleString('en-US')}`);

    const lines = content.split('\n');
    const accrualIdx = lines.findIndex((l) => l.startsWith('Accrual:'));
    const penaltyDaysIdx = lines.findIndex((l) => l.startsWith('PenaltyDays:'));
    const penaltyIdx = lines.findIndex((l) => l.startsWith('Penalty:'));
    expect(penaltyDaysIdx).toBeGreaterThan(accrualIdx);
    expect(penaltyIdx).toBeGreaterThan(penaltyDaysIdx);
  });

  it('uses yamlData.PenaltyPerDay as the per-contract override instead of config.yml Penalty.PerDay when non-empty', () => {
    globalThis.folderCompan = path.join(workDir, 'Compan');
    fs.mkdirSync(globalThis.folderCompan, { recursive: true });
    globalThis.folderALL = workDir;
    writeConfig({
      Contract: { IjaraDateEnd: '2024-01-01', AddDays: 30 },
      Penalty: { PerDay: 50000 },
      Excel: { CellNames: [] },
    });

    const ymlFile = path.join(workDir, 'ALL.contract');
    fs.writeFileSync(ymlFile, 'ContractDateEnd: \nComDate: \nActDate: \nActDateEnd: \n', 'utf8');

    writeTree(path.join(workDir, 'Bank-OT'), { '2026-02-05 4,200,000': {} });

    FilesMock.getDateFromTXT.mockReturnValue('01.01.2026');
    WordMock.extractDate.mockReturnValue({ day: '01', month: '01', year: '2026' });
    DidoxMock.bankByCode.mockReturnValue({ name: 'Bank' });
    DidoxMock.regionsByCode.mockReturnValue({ name: 'Region' });
    DidoxMock.districtsByCode.mockReturnValue({ name: 'District' });

    Yamls.replaceYaml(
      ymlFile,
      {
        ComType: 'MChJ',
        ContractDate: '2026-01-01',
        ActDateStart: '2026-01-01',
        ActDateEnd: '2026-02-28',
        Price: '4,200,000',
        PriceMax: '4,200,000',
        SurEnable: false,
        RepEnable: false,
        // Per-contract override: 75,000/day instead of config.yml's global
        // 50,000/day — blank-vs-filled precedence shape identical to
        // ContractNumber.
        PenaltyPerDay: '75,000',
      },
      {
        soliq: {
          company: {
            okedDetail: { name_uz_latn: '' },
            businessStructureDetail: { name_uz_latn: '' },
            statusDetail: { name_uz_latn: '', group: '' },
          },
          companyBillingAddress: {},
        },
      }
    );

    const content = fs.readFileSync(ymlFile, 'utf8');
    const penaltyDaysBlock = content.match(/PenaltyDays:\n((?:.|\n)*?)\n\nPenalty:/)[1];
    const janPenaltyDaysMatch = penaltyDaysBlock.match(/2026-01: (\d+)/);
    const janPenaltyDays = Number(janPenaltyDaysMatch[1]);
    expect(janPenaltyDays).toBeGreaterThan(0);

    const penaltyBlock = content.match(/\nPenalty:\n((?:.|\n)*?)\n\nReturns:/)[1];
    // 75,000/day (the override), never 50,000/day (the config default) — capped at half PriceMax (4,200,000 / 2 = 2,100,000) same as computePenalty's own rule.
    const cap = 4200000 / 2;
    const expected75 = Math.min(janPenaltyDays * 75000, cap);
    const expected50 = Math.min(janPenaltyDays * 50000, cap);
    expect(penaltyBlock).toContain(`2026-01: ${expected75.toLocaleString('en-US')}`);
    expect(penaltyBlock).not.toContain(`2026-01: ${expected50.toLocaleString('en-US')}`);
  });
});
