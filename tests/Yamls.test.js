// Unit tests for utils/Yamls.js — every public (non-_) static method:
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

const { Yamls } = await import('../utils/Yamls.js');

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
    // dependency files resolve under <project>/bank and <project>/cost
    writeTree(projectDir, {
      bank: { 'AAB.yaml': yaml.dump({ BankName: 'Asia Alliance', WhoAmI: 'AAB' }) },
      cost: { 'T1.yaml': yaml.dump({ TariffPrice: 100, Tariff: 'T1' }) },
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
      bank: { 'AAB.yaml': yaml.dump({ BankName: 'Asia Alliance' }) },
      cost: { 'T1.yaml': yaml.dump({ TariffPrice: 100 }) },
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
    const merged = yaml.load(fs.readFileSync(path.join(appDir, files[0]), 'utf8'));
    // loadAndParseYaml's preprocessor quotes bare digit values, so numbers
    // round-trip as strings ("1"/"2") — this asserts that real behavior.
    expect(merged.Alpha).toBe('1');
    expect(merged.Beta).toBe('2');
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
});

describe('Yamls.replaceYaml', () => {
  it('warns and returns when yamlData or companyInfo is missing', () => {
    Yamls.replaceYaml('file.yml', null, null);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('yamlData or companyInfo is not defined!');
  });
});
