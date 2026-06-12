// Unit tests for utils/Phone.js — every public (non-_) static method.
//
// Phone splits cleanly into two kinds of methods:
//   * pure string/array helpers (isPhone, isPhoneStatus, isRegion,
//     phoneToFolder(Item), extractUzbekPhones) — tested directly with real
//     inputs and many edge cases.
//   * filesystem orchestration (getPhones/Status/Regions, actualizePhoneFolder,
//     getNoPhones, appMergePhones/itemMergePhones/innerMovePhoneFolder,
//     appCalculateCountOnline/itemCalculateCountOnline/collectRegions/
//     itemRemoveCountOnline) — tested FOR REAL against temp dirs.
//
// Phone imports Files.js and ES.js. Files.js pulls heavy native deps (adm-zip,
// fs-extra, open) and forms a circular import with Phone, while ES.js shells out
// to es.exe. Per the suite convention we mock both siblings at the module
// boundary — but the Files mock is a faithful, REAL-fs-backed stand-in of the
// handful of methods Phone uses, so the genuine Phone logic (path math,
// recursion driving, copy/move/rename decisions) is what gets exercised.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree, exists } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- real-fs-backed Files stand-in (only the methods Phone calls) ------------
const FilesMock = {
  findRecursive(dir, condition) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) results = results.concat(FilesMock.findRecursive(full, condition));
      else if (condition(entry.name)) results.push(entry.name);
    }
    return results;
  },
  findRecursiveFull(dir, condition, ignoreFolderCondition = null) {
    let results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreFolderCondition && ignoreFolderCondition(entry.name, full)) continue;
        results = results.concat(FilesMock.findRecursiveFull(full, condition, ignoreFolderCondition));
      } else if (condition(entry.name)) results.push(full);
    }
    return results;
  },
  mkdirIfNotExists(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
  },
  moveFolder(src, dest) {
    // mirror the real copy-then-remove implementation
    fs.cpSync(src, dest, { recursive: true });
    if (fs.existsSync(dest)) fs.rmSync(src, { recursive: true, force: true });
  },
  writeJson: jest.fn((filePath, data) => {
    const parent = path.dirname(filePath);
    if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }),
  backupFile: jest.fn((filePath) => {
    if (!fs.existsSync(filePath)) return null;
    return filePath;
  }),
  isEmpty(value) {
    if (value === null || value === undefined) return true;
    if (typeof value === 'string') return value.trim() === '';
    if (Array.isArray(value)) return value.length === 0;
    return false;
  },
  saveInfoToFile: jest.fn((folder, filename) => {
    if (FilesMock.isEmpty(filename)) return null;
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
    // sanitize like Files.cleanupFileName: collapse illegal chars / whitespace to ' '
    const clean = String(filename).replace(/[<>:"|?*\\/]+/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 100);
    const filePath = path.join(folder, `${clean}.app`);
    fs.writeFileSync(filePath, 'App', 'utf8');
    return filePath;
  }),
};

// --- ES stand-in -------------------------------------------------------------
const ESMock = { find: jest.fn(() => []), findIn: jest.fn(() => []), execute: jest.fn(() => []) };

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('ES.js'), () => ({ ES: ESMock }));

const { Phone } = await import('../utils/Phone.js');

let root;
beforeEach(() => {
  root = makeTmpDir('phone-');
});
afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
  delete globalThis.saveDir;
  delete globalThis.saveDirApp;
  delete globalThis.mhtmlDirPhoneHasJson;
  delete globalThis.mhtmlDirPhoneHasNotJson;
});

// A canonical 21-char phone file name (length is what isPhone checks).
const PHONE = '+998-20-001-33-14.app';

// =============================================================================
// Pure helpers
// =============================================================================

describe('Phone.isPhone', () => {
  it('accepts a +998 .app name that is exactly 21 chars', () => {
    expect(PHONE.length).toBe(21); // guard the fixture
    expect(Phone.isPhone(PHONE)).toBe(true);
  });

  it('rejects when the +998 marker is missing', () => {
    expect(Phone.isPhone('20-001-33-14xxxxxxxxx.app')).toBe(false);
  });

  it('rejects when the .app suffix is missing', () => {
    expect(Phone.isPhone('+998-20-001-33-14.txt')).toBe(false);
  });

  it('rejects when the length is not exactly 21', () => {
    expect(Phone.isPhone('+998-1.app')).toBe(false);
    expect(Phone.isPhone('+998-20-001-33-14-99.app')).toBe(false);
  });
});

describe('Phone.isPhoneStatus', () => {
  it('matches #PhoneOK and #PhoneError markers', () => {
    expect(Phone.isPhoneStatus('something #PhoneOK.txt')).toBe(true);
    expect(Phone.isPhoneStatus('#PhoneError here')).toBe(true);
  });

  it('does not match unrelated names', () => {
    expect(Phone.isPhoneStatus('#PhoneMaybe')).toBe(false);
    expect(Phone.isPhoneStatus('plain.txt')).toBe(false);
  });
});

describe('Phone.isRegion', () => {
  it('matches names containing the Russian word "район"', () => {
    expect(Phone.isRegion('Юнусабадский район.app')).toBe(true);
  });

  it('does not match names without it', () => {
    expect(Phone.isRegion('Tashkent city.app')).toBe(false);
  });
});

describe('Phone.phoneToFolderItem', () => {
  it('strips the +998- prefix and the .app suffix for a normal number', () => {
    expect(Phone.phoneToFolderItem('+998-20-001-33-14.app')).toBe('20-001-33-14');
  });

  it('keeps the +998- prefix for an 88 number but still drops .app', () => {
    // the guard `!phone.startsWith('+998-88')` keeps the prefix intact
    expect(Phone.phoneToFolderItem('+998-88-001-33-14.app')).toBe('+998-88-001-33-14');
  });

  it('drops .app even when there is no +998- prefix', () => {
    expect(Phone.phoneToFolderItem('20-001-33-14.app')).toBe('20-001-33-14');
  });
});

describe('Phone.phoneToFolder', () => {
  it('cleans each phone and joins them with ", "', () => {
    const out = Phone.phoneToFolder(['+998-20-001-33-14.app', '+998-33-999-96-99.app']);
    expect(out).toBe('20-001-33-14, 33-999-96-99');
  });

  it('preserves 88 numbers and mixes them with normal ones', () => {
    const out = Phone.phoneToFolder(['+998-88-001-33-14.app', '+998-20-001-33-14.app']);
    expect(out).toBe('+998-88-001-33-14, 20-001-33-14');
  });

  it('returns an empty string for an empty array', () => {
    expect(Phone.phoneToFolder([])).toBe('');
  });
});

describe('Phone.extractUzbekPhones', () => {
  it('returns [] for falsy or non-string input', () => {
    expect(Phone.extractUzbekPhones('')).toEqual([]);
    expect(Phone.extractUzbekPhones(null)).toEqual([]);
    expect(Phone.extractUzbekPhones(undefined)).toEqual([]);
    expect(Phone.extractUzbekPhones(12345)).toEqual([]);
  });

  it('extracts a +998 spaced number and a bare 9-digit number', () => {
    const out = Phone.extractUzbekPhones('Call +998 90 123 45 67 or 901234567 today');
    expect(out).toContain('+998 90 123 45 67');
    // the bare-9 alternative is captured with a leading separator char
    expect(out).toContain(' 901234567');
  });

  it('returns a single 9-digit match for a clean bare number', () => {
    expect(Phone.extractUzbekPhones('901234567')).toEqual(['901234567']);
  });

  it('deduplicates identical matches', () => {
    // the space between is consumed by the first match, leaving one unique hit
    expect(Phone.extractUzbekPhones('+998-90-123-45-67 +998-90-123-45-67'))
      .toEqual(['+998-90-123-45-67']);
  });

  it('returns an array (jest-extended)', () => {
    expect(Phone.extractUzbekPhones('+998-90-123-45-67')).toBeArray();
  });
});

// =============================================================================
// Directory scanners
// =============================================================================

describe('Phone.getPhones', () => {
  it('returns only phone files, names by default', () => {
    writeTree(root, { [PHONE]: '', '+998-33-999-96-99.app': '', 'notes.txt': '', 'region район.app': '' });
    const out = Phone.getPhones(root);
    expect(out).toEqual(expect.arrayContaining([PHONE, '+998-33-999-96-99.app']));
    expect(out).toHaveLength(2);
  });

  it('returns full (backslash-joined) paths when fullPath is true', () => {
    writeTree(root, { [PHONE]: '' });
    const out = Phone.getPhones(root, true);
    expect(out).toEqual([`${root}\\${PHONE}`]);
  });

  it('returns an empty array when there are no phone files', () => {
    writeTree(root, { 'a.txt': '' });
    expect(Phone.getPhones(root)).toEqual([]);
  });
});

describe('Phone.getPhoneStatus', () => {
  it('returns only #PhoneOK / #PhoneError files', () => {
    writeTree(root, { '#PhoneOK.txt': '', '#PhoneError.txt': '', 'other.txt': '' });
    const out = Phone.getPhoneStatus(root);
    expect(out).toEqual(expect.arrayContaining(['#PhoneOK.txt', '#PhoneError.txt']));
    expect(out).toHaveLength(2);
  });

  it('honors fullPath', () => {
    writeTree(root, { '#PhoneOK.txt': '' });
    expect(Phone.getPhoneStatus(root, true)).toEqual([`${root}\\#PhoneOK.txt`]);
  });
});

describe('Phone.getRegions', () => {
  it('returns only files containing "район"', () => {
    writeTree(root, { 'Юнусабадский район.app': '', 'plain.app': '' });
    expect(Phone.getRegions(root)).toEqual(['Юнусабадский район.app']);
  });

  it('honors fullPath', () => {
    writeTree(root, { 'Чиланзарский район.app': '' });
    expect(Phone.getRegions(root, true)).toEqual([`${root}\\Чиланзарский район.app`]);
  });
});

// =============================================================================
// actualizePhoneFolder
// =============================================================================

describe('Phone.actualizePhoneFolder', () => {
  it('copies nested phone files up and renames the folder after the phones it found', () => {
    // parent/user/{sub/+998-...app} → folder gets renamed to "20-001-33-14, 33-..."
    const parent = path.join(root, 'parent');
    const user = path.join(parent, 'user');
    writeTree(user, { sub: { [PHONE]: '', '+998-33-999-96-99.app': '' } });

    const result = Phone.actualizePhoneFolder(user);

    const expectedName = '20-001-33-14, 33-999-96-99';
    const expectedPath = path.join(parent, expectedName);
    expect(result).toBe(expectedPath);
    expect(fs.existsSync(expectedPath)).toBe(true);
    expect(fs.existsSync(user)).toBe(false);
    // the nested phone files were copied up to the (renamed) folder root
    expect(exists(expectedPath, PHONE)).toBe(true);
    expect(exists(expectedPath, '+998-33-999-96-99.app')).toBe(true);
  });

  it('does not overwrite a file already present at the destination during copy-up', () => {
    const parent = path.join(root, 'parent');
    const user = path.join(parent, 'user');
    // a copy of the phone already sits at the folder root with custom content
    writeTree(user, { [PHONE]: 'ORIGINAL', sub: { [PHONE]: 'NESTED' } });

    Phone.actualizePhoneFolder(user);

    const dest = path.join(parent, '20-001-33-14');
    expect(fs.readFileSync(path.join(dest, PHONE), 'utf8')).toBe('ORIGINAL');
  });

  it('returns the original path unchanged when the target folder name already exists', () => {
    const parent = path.join(root, 'parent');
    const user = path.join(parent, 'user');
    writeTree(user, { [PHONE]: '' });
    // pre-create the destination folder name so the rename is skipped
    fs.mkdirSync(path.join(parent, '20-001-33-14'), { recursive: true });

    const result = Phone.actualizePhoneFolder(user);
    expect(result).toBe(user);
    expect(fs.existsSync(user)).toBe(true);
  });
});

// =============================================================================
// getNoPhones (globals-driven)
// =============================================================================

describe('Phone.getNoPhones', () => {
  it('partitions folders into has-phone / has-not and returns the has-not paths', () => {
    const save = path.join(root, 'save');
    writeTree(save, {
      withPhone: { [PHONE]: '' },
      withoutPhone: { 'notes.txt': '' },
      '@ excluded': { 'x.txt': '' },   // '@' excluded
      '#excluded': { 'x.txt': '' },    // '#' excluded
      '- Theory': { 'x.txt': '' },     // exact-name excluded
    });
    globalThis.saveDir = save;
    globalThis.mhtmlDirPhoneHasJson = path.join(root, 'has.json');
    globalThis.mhtmlDirPhoneHasNotJson = path.join(root, 'hasnot.json');

    const result = Phone.getNoPhones();

    expect(result).toEqual([path.join(save, 'withoutPhone')]);
    // both result JSONs were written
    expect(fs.existsSync(globalThis.mhtmlDirPhoneHasJson)).toBe(true);
    expect(fs.existsSync(globalThis.mhtmlDirPhoneHasNotJson)).toBe(true);
    expect(JSON.parse(fs.readFileSync(globalThis.mhtmlDirPhoneHasJson, 'utf8')))
      .toEqual([path.join(save, 'withPhone')]);
    expect(FilesMock.writeJson).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array when every folder already has a phone', () => {
    const save = path.join(root, 'save');
    writeTree(save, { a: { [PHONE]: '' }, b: { '+998-33-999-96-99.app': '' } });
    globalThis.saveDir = save;
    globalThis.mhtmlDirPhoneHasJson = path.join(root, 'has.json');
    globalThis.mhtmlDirPhoneHasNotJson = path.join(root, 'hasnot.json');

    expect(Phone.getNoPhones()).toEqual([]);
  });
});

// =============================================================================
// appFindPhones (drives ES.find + copies clone phone files in)
// =============================================================================

describe('Phone.appFindPhones', () => {
  it('skips folders ES reports no clones for and copies clone phone files into the original', () => {
    const save = path.join(root, 'save');
    writeTree(save, {
      userA: {},                                   // will get a clone
      userB: {},                                   // no clones → skipped
    });
    const cloneDir = path.join(root, 'clones', 'userA-clone');
    writeTree(cloneDir, { [PHONE]: '', '#PhoneOK.txt': '' });
    globalThis.saveDir = save;

    ESMock.find.mockImplementation((folder) => {
      if (folder === 'userA') return [cloneDir];
      return [];
    });

    Phone.appFindPhones();

    // the clone's phone + status files were copied into save/userA
    expect(exists(path.join(save, 'userA'), PHONE)).toBe(true);
    expect(exists(path.join(save, 'userA'), '#PhoneOK.txt')).toBe(true);
    // a #HasClone marker was written for userA
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(path.join(save, 'userA'), '#HasClone');
    // ES.find was queried once per (non-excluded) folder
    expect(ESMock.find).toHaveBeenCalledWith('userA');
    expect(ESMock.find).toHaveBeenCalledWith('userB');
  });

  it('filters out the folder itself when it appears in its own clone list', () => {
    const save = path.join(root, 'save');
    writeTree(save, { onlyUser: {} });
    globalThis.saveDir = save;
    const selfPath = path.join(save, 'onlyUser');
    ESMock.find.mockReturnValue([selfPath]); // only the folder itself → treated as no clones

    Phone.appFindPhones();

    expect(FilesMock.saveInfoToFile).not.toHaveBeenCalled();
  });
});

// =============================================================================
// appCalculateCountOnline / itemCalculateCountOnline / collectRegions
// =============================================================================

describe('Phone.itemCalculateCountOnline', () => {
  it('sums offer counts parsed from "Мы нашли N ..." names and writes #OfferCount', () => {
    writeTree(root, {
      'Мы нашли 407 объявлений.app': '',
      sub: { 'Мы нашли 93 объявлений.app': '' },
      'Онлайн.app': '',
    });

    Phone.itemCalculateCountOnline(root);

    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(root, '#OfferCount 500');
  });

  it('does not write #OfferCount when there are no offer-count files', () => {
    writeTree(root, { 'plain.app': '' });
    Phone.itemCalculateCountOnline(root);
    expect(FilesMock.saveInfoToFile).not.toHaveBeenCalled();
  });
});

describe('Phone.collectRegions', () => {
  it('copies every nested район file up into the folder root', () => {
    writeTree(root, {
      sub: { 'Юнусабадский район.app': '' },
      deeper: { x: { 'Чиланзарский район.app': '' } },
      'ignore.app': '',
    });

    Phone.collectRegions(root);

    expect(exists(root, 'Юнусабадский район.app')).toBe(true);
    expect(exists(root, 'Чиланзарский район.app')).toBe(true);
  });
});

describe('Phone.appCalculateCountOnline', () => {
  it('removes pre-existing #OfferCount files, then recomputes per top-level folder', () => {
    const app = path.join(root, 'app');
    writeTree(app, {
      '#OfferCount 99.app': '',                              // stale, must be removed
      folderA: { 'Мы нашли 10 объявлений.app': '', 'Юнусабадский район.app': '' },
      folderB: { 'plain.app': '' },
    });
    globalThis.saveDirApp = app;

    Phone.appCalculateCountOnline();

    // the stale top-level offer-count file was unlinked
    expect(exists(app, '#OfferCount 99.app')).toBe(false);
    // folderA got a fresh #OfferCount 10 and its region copied up
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(path.join(app, 'folderA'), '#OfferCount 10');
    expect(exists(path.join(app, 'folderA'), 'Юнусабадский район.app')).toBe(true);
  });
});

// =============================================================================
// itemRemoveCountOnline
// =============================================================================

describe('Phone.itemRemoveCountOnline', () => {
  it('deletes every nested "Мы нашли" / "Онлайн" file under an absolute folder', () => {
    writeTree(root, {
      'Мы нашли 10 объявлений.app': '',
      sub: { 'Онлайн.app': '', 'keep.app': '' },
    });

    Phone.itemRemoveCountOnline(root);

    expect(exists(root, 'Мы нашли 10 объявлений.app')).toBe(false);
    expect(exists(root, 'sub', 'Онлайн.app')).toBe(false);
    expect(exists(root, 'sub', 'keep.app')).toBe(true);
  });

  it('resolves a relative name against globalThis.saveDirApp', () => {
    const app = path.join(root, 'app');
    writeTree(app, { user: { 'Онлайн.app': '' } });
    globalThis.saveDirApp = app;

    Phone.itemRemoveCountOnline('user');

    expect(exists(app, 'user', 'Онлайн.app')).toBe(false);
  });

  it('returns early (no throw) when no matching files exist', () => {
    writeTree(root, { 'keep.app': '' });
    expect(() => Phone.itemRemoveCountOnline(root)).not.toThrow();
    expect(exists(root, 'keep.app')).toBe(true);
  });
});

// =============================================================================
// innerMovePhoneFolder (the mover at the heart of merging)
// =============================================================================

describe('Phone.innerMovePhoneFolder', () => {
  it('moves a user folder under saveDirApp/<phoneFolder>/<userName> and actualizes it', () => {
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    globalThis.saveDirApp = app;

    const userDir = path.join(root, 'src', 'Alice');
    writeTree(userDir, { [PHONE]: '' });

    const ok = Phone.innerMovePhoneFolder(userDir, '20-001-33-14');

    expect(ok).toBe(true);
    // The folder was moved under app/20-001-33-14/Alice, then actualize renamed
    // that user folder again after the phone it contains. Assert the phone file
    // survived somewhere under app/20-001-33-14 and the source is gone.
    expect(fs.existsSync(userDir)).toBe(false);
    const moved = path.join(app, '20-001-33-14');
    expect(fs.existsSync(moved)).toBe(true);
    const inner = fs.readdirSync(moved);
    expect(inner.length).toBeGreaterThan(0);
  });

  it('returns false when the source userDir does not exist', () => {
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    globalThis.saveDirApp = app;

    expect(Phone.innerMovePhoneFolder(path.join(root, 'missing'), '20-001-33-14')).toBe(false);
  });

  it('cleans count-online files from a pre-existing target before moving', () => {
    const app = path.join(root, 'app');
    globalThis.saveDirApp = app;
    // pre-create the destination target with a stale Онлайн file
    const target = path.join(app, '20-001-33-14', 'Bob');
    writeTree(target, { 'Онлайн.app': '' });

    const userDir = path.join(root, 'src', 'Bob');
    writeTree(userDir, { [PHONE]: '' });

    Phone.innerMovePhoneFolder(userDir, '20-001-33-14');

    // the stale Онлайн file under the existing target was removed by
    // itemRemoveCountOnline before the (copy) move merged the source in
    expect(exists(app, '20-001-33-14', 'Bob', 'Онлайн.app')).toBe(false);
  });
});

// =============================================================================
// itemMergePhones / appMergePhones
// =============================================================================

describe('Phone.itemMergePhones', () => {
  it('moves the source user folder under the phone folder it derives from its phones', () => {
    const save = path.join(root, 'save');
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    globalThis.saveDir = save;
    globalThis.saveDirApp = app;

    // itemMergePhones joins saveDir + folder, so pass a relative folder name
    writeTree(path.join(save, 'Carol'), { [PHONE]: '' });

    Phone.itemMergePhones('Carol');

    // with no matching folder under saveDirApp, the trailing
    // innerMovePhoneFolder(userDir, phoneFolder) moves Carol under
    // app/<phoneFolder>/Carol
    expect(fs.existsSync(path.join(save, 'Carol'))).toBe(false);
    const moved = path.join(app, '20-001-33-14');
    expect(fs.existsSync(moved)).toBe(true);
  });

  it('returns false when the derived phoneFolder is empty (no phone files)', () => {
    const save = path.join(root, 'save');
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    globalThis.saveDir = save;
    globalThis.saveDirApp = app;
    writeTree(path.join(save, 'Empty'), { 'notes.txt': '' });

    expect(Phone.itemMergePhones('Empty')).toBe(false);
  });
});

describe('Phone.appMergePhones', () => {
  it('iterates non-excluded folders and merges each via itemMergePhones', () => {
    const save = path.join(root, 'save');
    const app = path.join(root, 'app');
    fs.mkdirSync(app, { recursive: true });
    globalThis.saveDir = save;
    globalThis.saveDirApp = app;

    writeTree(save, {
      Dave: { [PHONE]: '' },
      '@ excluded': { [PHONE]: '' },   // excluded by '@'
      '#excluded': { [PHONE]: '' },    // excluded by '#'
      '- Theory': { [PHONE]: '' },     // excluded by name
    });

    Phone.appMergePhones();

    // Dave was merged out of save into app/<phone>/Dave; excluded folders stay.
    expect(fs.existsSync(path.join(save, 'Dave'))).toBe(false);
    expect(fs.existsSync(path.join(save, '@ excluded'))).toBe(true);
    expect(fs.existsSync(path.join(save, '#excluded'))).toBe(true);
    expect(fs.existsSync(path.join(save, '- Theory'))).toBe(true);
    expect(fs.existsSync(path.join(app, '20-001-33-14'))).toBe(true);
  });
});
