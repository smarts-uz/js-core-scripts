// Unit tests for utils/Files.js — every public (non-_) static method.
//
// Files is overwhelmingly a real-filesystem class, so per the test conventions
// it is tested FOR REAL against throwaway temp dirs (helpers/tmp.js) with NO
// mocked fs. adm-zip and fs-extra run for real inside those temp dirs. Only the
// OS shell / GUI / circular-dep boundaries are mocked BEFORE importing Files:
//   * `open` (npm)        → openFile() must not launch a real app
//   * `child_process`     → openFileQoder() calls exec()
//   * Dialogs.js          → copyFileWithRetry() calls Dialogs.messageBox on fail
//   * Phone.js            → stubbed to dodge circular / native import issues
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, writeTree, read, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- mocks for the external / GUI / circular boundary ------------------------
const openMock = jest.fn(async () => {});
const execMock = jest.fn();
const DialogsMock = { messageBox: jest.fn() };

jest.unstable_mockModule('open', () => ({ default: openMock }));
jest.unstable_mockModule('child_process', () => ({ exec: execMock, default: { exec: execMock } }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Phone.js'), () => ({ Phone: {} }));

const { Files } = await import('../utils/Files.js');

let dir;
beforeEach(() => {
  dir = makeTmpDir('files-test-');
});
afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

// =============================================================================
// Pure helpers
// =============================================================================

describe('Files.isEmpty', () => {
  it('is true for null and undefined', () => {
    expect(Files.isEmpty(null)).toBe(true);
    expect(Files.isEmpty(undefined)).toBe(true);
  });

  it('is true for empty / whitespace strings, false for non-empty', () => {
    expect(Files.isEmpty('')).toBe(true);
    expect(Files.isEmpty('   ')).toBe(true);
    expect(Files.isEmpty('x')).toBe(false);
  });

  it('is true for an empty array, false for a populated one', () => {
    expect(Files.isEmpty([])).toBe(true);
    expect(Files.isEmpty([1])).toBe(false);
  });

  it('is true for an empty plain object, false for a populated one', () => {
    expect(Files.isEmpty({})).toBe(true);
    expect(Files.isEmpty({ a: 1 })).toBe(false);
  });

  it('is true for empty Map / Set', () => {
    expect(Files.isEmpty(new Map())).toBe(true);
    expect(Files.isEmpty(new Set())).toBe(true);
  });

  it('also reports a POPULATED Map / Set as empty (documents real behavior)', () => {
    // Real behavior note: the generic "object with no own enumerable keys" check
    // (`Object.keys(value).length === 0`) runs BEFORE the Map/Set size check and
    // returns early. A Map/Set has no own enumerable string keys regardless of
    // its size, so even a populated Map/Set is reported as empty. The dedicated
    // Map/Set branch is therefore effectively dead code.
    expect(Files.isEmpty(new Map([['a', 1]]))).toBe(true);
    expect(Files.isEmpty(new Set([1]))).toBe(true);
  });

  it('is false for numbers and booleans', () => {
    expect(Files.isEmpty(0)).toBe(false);
    expect(Files.isEmpty(42)).toBe(false);
    expect(Files.isEmpty(false)).toBe(false);
  });
});

describe('Files.cleanPath', () => {
  it('collapses doubled backslashes and converts to forward slashes', () => {
    expect(Files.cleanPath('C:\\\\Users\\\\me')).toBe('C:/Users/me');
  });

  it('converts single backslashes to forward slashes', () => {
    expect(Files.cleanPath('a\\b\\c')).toBe('a/b/c');
  });

  it('leaves an already-forward-slash path unchanged', () => {
    expect(Files.cleanPath('a/b/c')).toBe('a/b/c');
  });
});

describe('Files.cleanupFileName', () => {
  it('strips Windows-illegal characters and collapses whitespace', () => {
    const out = Files.cleanupFileName('a<b>c:"d|e?f*g');
    expect(out).toBeSafeWindowsName();
    expect(out).not.toMatch(/[<>:"|?*]/);
  });

  it('replaces slashes and ampersands with the replacement char', () => {
    expect(Files.cleanupFileName('a/b\\c&d')).toBe('a b c d');
  });

  it('collapses multiple spaces and trims the result', () => {
    expect(Files.cleanupFileName('  hello   world  ')).toBe('hello world');
  });

  it('truncates to 100 characters', () => {
    const out = Files.cleanupFileName('a'.repeat(250));
    expect(out.length).toBeLessThanOrEqual(100);
  });

  it('honours a custom replacement string', () => {
    expect(Files.cleanupFileName('a/b', '_')).toBe('a_b');
  });
});

describe('Files.getBaseName', () => {
  it('returns the file name', () => {
    expect(Files.getBaseName(path.join('a', 'b', 'c.txt'))).toBe('c.txt');
  });

  it('strips the supplied extension', () => {
    expect(Files.getBaseName(path.join('a', 'b', 'c.txt'), '.txt')).toBe('c');
  });
});

describe('Files.getDirName', () => {
  it('returns the resolved parent directory of a path', () => {
    const file = path.join(dir, 'sub', 'file.txt');
    expect(Files.getDirName(file)).toBe(path.dirname(path.resolve(file)));
  });
});

describe('Files.currentDir', () => {
  it('returns path.dirname(process.argv[1])', () => {
    expect(Files.currentDir()).toBe(path.dirname(process.argv[1]));
  });
});

// =============================================================================
// Read helpers
// =============================================================================

describe('Files.readLines', () => {
  it('returns trimmed, non-empty lines', () => {
    const f = path.join(dir, 'lines.txt');
    fs.writeFileSync(f, '  a  \r\n\n b \n   \nc', 'utf8');
    expect(Files.readLines(f)).toEqual(['a', 'b', 'c']);
  });
});

describe('Files.readProfilesFromFile', () => {
  it('reads non-empty trimmed profile lines', () => {
    const f = path.join(dir, 'profiles.txt');
    fs.writeFileSync(f, 'p1\r\n  p2  \n\np3\n', 'utf8');
    expect(Files.readProfilesFromFile(f)).toEqual(['p1', 'p2', 'p3']);
  });

  it('throws when the file is missing', () => {
    expect(() => Files.readProfilesFromFile(path.join(dir, 'nope.txt'))).toThrow(/not found/);
  });
});

describe('Files.readTextFile', () => {
  it('returns the raw file contents', () => {
    const f = path.join(dir, 't.txt');
    fs.writeFileSync(f, 'raw content', 'utf8');
    expect(Files.readTextFile(f)).toBe('raw content');
  });
});

describe('Files.readJson / Files.writeJson', () => {
  it('writeJson serializes pretty JSON and creates missing parents', () => {
    const f = path.join(dir, 'deep', 'nested', 'data.json');
    Files.writeJson(f, { a: 1, b: [2, 3] });
    expect(fs.existsSync(f)).toBe(true);
    expect(read(dir, 'deep', 'nested', 'data.json')).toContain('\n  ');
  });

  it('readJson round-trips what writeJson wrote', () => {
    const f = path.join(dir, 'rt.json');
    const value = { x: 1, y: ['a', 'b'] };
    Files.writeJson(f, value);
    expect(Files.readJson(f)).toEqual(value);
  });
});

describe('Files.readUrlsFromDirectory', () => {
  it('parses .url files into {url, filePath, fileName}', () => {
    writeTree(dir, {
      'site.url': '[InternetShortcut]\r\nURL=https://example.com\r\n',
      'other.txt': 'ignored',
      'nourl.url': '[InternetShortcut]\r\nIconIndex=0\r\n',
    });
    const urls = Files.readUrlsFromDirectory(dir);
    expect(urls).toBeArrayOfSize(1);
    expect(urls[0].url).toBe('https://example.com');
    expect(urls[0].fileName).toBe('site.url');
    expect(urls[0].filePath).toBe(path.join(dir, 'site.url'));
  });

  it('returns an empty array when there are no .url files', () => {
    writeTree(dir, { 'a.txt': 'x' });
    expect(Files.readUrlsFromDirectory(dir)).toEqual([]);
  });
});

// =============================================================================
// Directory discovery
// =============================================================================

describe('Files.findRelevantDirectories', () => {
  it('includes the root plus existing "@ Weak" / "@ Other" subdirs', () => {
    writeTree(dir, { '@ Weak': {}, '@ Other': {} });
    const dirs = Files.findRelevantDirectories(dir);
    expect(dirs).toIncludeAllMembers([dir, path.join(dir, '@ Weak'), path.join(dir, '@ Other')]);
    expect(dirs).toBeArrayOfSize(3);
  });

  it('omits subdirectories that do not exist', () => {
    const dirs = Files.findRelevantDirectories(dir);
    expect(dirs).toEqual([dir]);
  });

  it('returns an empty array when the root itself is missing', () => {
    expect(Files.findRelevantDirectories(path.join(dir, 'ghost'))).toEqual([]);
  });
});

describe('Files.urlExistsInDirectories', () => {
  it('finds an exact URL match in a sibling "@ Weak" directory', () => {
    writeTree(dir, {
      '@ Weak': { 'a.url': '[InternetShortcut]\r\nURL=https://match.com\r\n' },
    });
    expect(Files.urlExistsInDirectories('https://match.com', dir)).toBe(true);
  });

  it('skips the current save directory when scanning', () => {
    // The matching url lives ONLY in the current save dir → excluded → not found.
    writeTree(dir, { 'self.url': '[InternetShortcut]\r\nURL=https://only-here.com\r\n' });
    expect(Files.urlExistsInDirectories('https://only-here.com', dir)).toBe(false);
  });

  it('returns false when no directory contains the URL', () => {
    writeTree(dir, { '@ Other': { 'x.url': 'URL=https://nope.com' } });
    expect(Files.urlExistsInDirectories('https://absent.com', dir)).toBe(false);
  });
});

describe('Files.findAllContractFiles', () => {
  it('collects every ALL.contract recursively, skipping ignored folders', () => {
    writeTree(dir, {
      'ALL.contract': 'top',
      sub: { 'ALL.contract': 'nested', 'note.txt': 'x' },
      ALL: { 'ALL.contract': 'ignored-ALL-folder' },
      '@ Bads': { 'ALL.contract': 'ignored-bads' },
    });
    const found = Files.findAllContractFiles(dir);
    expect(found).toIncludeSameMembers([
      path.join(dir, 'ALL.contract'),
      path.join(dir, 'sub', 'ALL.contract'),
    ]);
  });

  it('accepts a file path and scans its parent folder', () => {
    writeTree(dir, { 'ALL.contract': 'c', 'seed.txt': 'x' });
    const found = Files.findAllContractFiles(path.join(dir, 'seed.txt'));
    expect(found).toEqual([path.join(dir, 'ALL.contract')]);
  });
});

describe('Files.findRecursive', () => {
  it('returns matching file NAMES across nested folders', () => {
    writeTree(dir, {
      'a.json': '{}',
      sub: { 'b.json': '{}', 'c.txt': 'x', deep: { 'd.json': '{}' } },
    });
    const out = Files.findRecursive(dir, (name) => name.endsWith('.json'));
    expect(out).toIncludeSameMembers(['a.json', 'b.json', 'd.json']);
  });
});

describe('Files.findRecursiveFull', () => {
  it('returns matching FULL paths across nested folders', () => {
    writeTree(dir, { 'a.json': '{}', sub: { 'b.json': '{}' } });
    const out = Files.findRecursiveFull(dir, (name) => name.endsWith('.json'));
    expect(out).toIncludeSameMembers([path.join(dir, 'a.json'), path.join(dir, 'sub', 'b.json')]);
  });

  it('honours the ignoreFolderCondition predicate', () => {
    writeTree(dir, {
      'a.json': '{}',
      skip: { 'b.json': '{}' },
    });
    const out = Files.findRecursiveFull(
      dir,
      (name) => name.endsWith('.json'),
      (folderName) => folderName === 'skip'
    );
    expect(out).toEqual([path.join(dir, 'a.json')]);
  });
});

describe('Files.pickRandomFile', () => {
  it('returns a path to a file with the requested extension', () => {
    writeTree(dir, { 'a.json': '{}', 'b.json': '{}', 'c.txt': 'x' });
    const picked = Files.pickRandomFile(dir, '.json');
    expect(picked).toBeOneOf([path.join(dir, 'a.json'), path.join(dir, 'b.json')]);
  });

  it('returns null when no matching files exist', () => {
    writeTree(dir, { 'a.txt': 'x' });
    expect(Files.pickRandomFile(dir, '.json')).toBeNull();
  });
});

// =============================================================================
// TXT/APP scanners
// =============================================================================

describe('Files.getDateFromTXT', () => {
  it('matches a DD.MM.YYYY.txt file and strips ext + spaces', () => {
    writeTree(dir, { '29.03.2017.txt': 'x', 'other.txt': 'y' });
    expect(Files.getDateFromTXT(dir)).toBe('29.03.2017');
  });

  it('returns null when no date file is present', () => {
    writeTree(dir, { 'note.txt': 'x' });
    expect(Files.getDateFromTXT(dir)).toBeNull();
  });
});

describe('Files.getTINFromTXT', () => {
  it('matches a 9-digit .txt TIN file (ext stripped)', () => {
    writeTree(dir, { '123456789.txt': 'x' });
    expect(Files.getTINFromTXT(dir)).toBe('123456789');
  });

  it('matches a spaced 3-3-3 .app TIN file and strips spaces + ext', () => {
    writeTree(dir, { '123 456 789.app': 'x' });
    expect(Files.getTINFromTXT(dir)).toBe('123456789');
  });

  it('returns null when no TIN file matches', () => {
    writeTree(dir, { 'a.txt': 'x' });
    expect(Files.getTINFromTXT(dir)).toBeNull();
  });
});

describe('Files.getPINFLFromTXT', () => {
  it('matches a 14-digit .txt PINFL file (ext stripped)', () => {
    writeTree(dir, { '12345678901234.txt': 'x' });
    expect(Files.getPINFLFromTXT(dir)).toBe('12345678901234');
  });

  it('matches a 14-digit .app PINFL file', () => {
    writeTree(dir, { '98765432109876.app': 'x' });
    expect(Files.getPINFLFromTXT(dir)).toBe('98765432109876');
  });

  it('returns null when no PINFL file matches', () => {
    writeTree(dir, { '123.txt': 'x' });
    expect(Files.getPINFLFromTXT(dir)).toBeNull();
  });
});

// =============================================================================
// File-name math
// =============================================================================

describe('Files.incrementFileName', () => {
  it('returns the path unchanged when nothing exists there', () => {
    const f = path.join(dir, 'free.yml');
    expect(Files.incrementFileName(f)).toBe(f);
  });

  it('appends " 1" before the extension on the first collision', () => {
    const f = path.join(dir, 'file.yml');
    fs.writeFileSync(f, 'x', 'utf8');
    expect(Files.incrementFileName(f)).toBe(path.join(dir, 'file 1.yml'));
  });

  it('continues counting from an existing numeric suffix', () => {
    fs.writeFileSync(path.join(dir, 'doc.txt'), 'x', 'utf8');
    fs.writeFileSync(path.join(dir, 'doc 1.txt'), 'x', 'utf8');
    expect(Files.incrementFileName(path.join(dir, 'doc 1.txt'))).toBe(path.join(dir, 'doc 2.txt'));
  });
});

// =============================================================================
// fs mutation helpers
// =============================================================================

describe('Files.mkdirIfNotExists', () => {
  it('creates a nested directory tree', () => {
    const target = path.join(dir, 'x', 'y', 'z');
    Files.mkdirIfNotExists(target);
    expect(fs.existsSync(target)).toBe(true);
  });

  it('is a no-op when the directory already exists', () => {
    Files.mkdirIfNotExists(dir);
    expect(fs.existsSync(dir)).toBe(true);
  });
});

describe('Files.removeFile', () => {
  it('deletes an existing file', () => {
    const f = path.join(dir, 'gone.txt');
    fs.writeFileSync(f, 'x', 'utf8');
    Files.removeFile(f);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('silently does nothing when the file is absent', () => {
    expect(() => Files.removeFile(path.join(dir, 'absent.txt'))).not.toThrow();
  });
});

describe('Files.removeFilesWithExtension', () => {
  it('removes only files with the given extension', () => {
    writeTree(dir, { 'a.tmp': 'x', 'b.tmp': 'x', 'keep.txt': 'x' });
    Files.removeFilesWithExtension(dir, '.tmp');
    expect(fs.existsSync(path.join(dir, 'a.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'b.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(dir, 'keep.txt'))).toBe(true);
  });
});

describe('Files.copyFolderRecursiveSync', () => {
  it('copies a whole tree, creating missing intermediate dirs', () => {
    const src = path.join(dir, 'src');
    writeTree(src, { 'a.txt': 'A', sub: { 'b.txt': 'B' } });
    const target = path.join(dir, 'out', 'copy');
    Files.copyFolderRecursiveSync(src, target);
    expect(read(target, 'a.txt')).toBe('A');
    expect(read(target, 'sub', 'b.txt')).toBe('B');
  });

  it('warns and does nothing when the source is missing', () => {
    expect(() =>
      Files.copyFolderRecursiveSync(path.join(dir, 'no'), path.join(dir, 'out'))
    ).not.toThrow();
    expect(fs.existsSync(path.join(dir, 'out'))).toBe(false);
  });
});

describe('Files.moveFolder', () => {
  it('moves via copy + delete when rename=false', () => {
    const src = path.join(dir, 'mv-src');
    writeTree(src, { 'f.txt': 'data' });
    const dest = path.join(dir, 'mv-dest');
    Files.moveFolder(src, dest);
    expect(read(dest, 'f.txt')).toBe('data');
    expect(fs.existsSync(src)).toBe(false);
  });

  it('moves via rename when rename=true (creating parents)', () => {
    const src = path.join(dir, 'rn-src');
    writeTree(src, { 'g.txt': 'g' });
    const dest = path.join(dir, 'deep', 'rn-dest');
    Files.moveFolder(src, dest, true);
    expect(read(dest, 'g.txt')).toBe('g');
    expect(fs.existsSync(src)).toBe(false);
  });

  it('throws when the source does not exist', () => {
    expect(() => Files.moveFolder(path.join(dir, 'no'), path.join(dir, 'd'))).toThrow(
      /does not exist/
    );
  });

  it('returns early (no overwrite) when rename=true and dest exists', () => {
    const src = path.join(dir, 's2');
    const dest = path.join(dir, 'd2');
    writeTree(src, { 'a.txt': 'src' });
    writeTree(dest, { 'a.txt': 'dest' });
    Files.moveFolder(src, dest, true);
    expect(read(dest, 'a.txt')).toBe('dest'); // untouched
    expect(fs.existsSync(src)).toBe(true); // source untouched
  });
});

// =============================================================================
// Backups & archiving
// =============================================================================

describe('Files.backupFile', () => {
  it('copies a file into a "- Theory" sibling folder and returns its path', () => {
    const f = path.join(dir, 'report.txt');
    fs.writeFileSync(f, 'content', 'utf8');
    const out = Files.backupFile(f);
    expect(out).toStartWith(path.join(dir, '- Theory'));
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe('content');
    expect(fs.existsSync(f)).toBe(true); // original kept by default
  });

  it('deletes the original when deletes=true', () => {
    const f = path.join(dir, 'temp.txt');
    fs.writeFileSync(f, 'x', 'utf8');
    const out = Files.backupFile(f, true);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(f)).toBe(false);
  });

  it('honours a custom backup directory', () => {
    const f = path.join(dir, 'c.txt');
    fs.writeFileSync(f, 'x', 'utf8');
    const backupDir = path.join(dir, 'my-backups');
    const out = Files.backupFile(f, false, backupDir);
    expect(out).toStartWith(backupDir);
  });

  it('returns null when the source file does not exist', () => {
    expect(Files.backupFile(path.join(dir, 'missing.txt'))).toBeNull();
  });
});

describe('Files.backupFolder', () => {
  it('copies the folder into "- Theory" and removes the original by default', () => {
    const folder = path.join(dir, 'data');
    writeTree(folder, { 'a.txt': 'A' });
    const out = Files.backupFolder(folder);
    expect(out).toStartWith(path.join(dir, '- Theory'));
    expect(read(out, 'a.txt')).toBe('A');
    expect(fs.existsSync(folder)).toBe(false); // deletes=true by default
  });

  it('keeps the original when deletes=false', () => {
    const folder = path.join(dir, 'keep');
    writeTree(folder, { 'b.txt': 'B' });
    const out = Files.backupFolder(folder, false);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(folder)).toBe(true);
  });
});

describe('Files.archiveFolder', () => {
  it('zips a folder into the parent using a relative archive name', () => {
    const folder = path.join(dir, 'to-zip');
    writeTree(folder, { 'a.txt': 'A', 'b.txt': 'B' });
    const out = Files.archiveFolder(folder, 'archive');
    expect(out).toEndWith('.zip');
    expect(fs.existsSync(out)).toBe(true);
    expect(path.dirname(out)).toBe(dir); // written next to the folder's parent
  });

  it('uses an absolute archive name verbatim and adds .zip', () => {
    const folder = path.join(dir, 'src2');
    writeTree(folder, { 'x.txt': 'x' });
    const abs = path.join(dir, 'out', 'bundle');
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    const out = Files.archiveFolder(folder, abs);
    expect(out).toBe(`${abs}.zip`);
    expect(fs.existsSync(out)).toBe(true);
  });
});

describe('Files.backupFolderZip', () => {
  it('archives the folder into "- Theory" and removes the source by default', () => {
    const folder = path.join(dir, 'zip-me');
    writeTree(folder, { 'a.txt': 'A' });
    const out = Files.backupFolderZip(folder);
    expect(out).toEndWith('.zip');
    expect(fs.existsSync(out)).toBe(true);
    expect(out).toContain(`${path.sep}- Theory${path.sep}`);
    expect(fs.existsSync(folder)).toBe(false);
  });

  it('keeps the source folder when deletes=false', () => {
    const folder = path.join(dir, 'zip-keep');
    writeTree(folder, { 'a.txt': 'A' });
    const out = Files.backupFolderZip(folder, false);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(folder)).toBe(true);
  });
});

describe('Files.combineJsonFiles', () => {
  it('merges arrays from sibling json files, dedupes, and writes ALL.json', () => {
    writeTree(dir, {
      'one.json': JSON.stringify([1, 2, 3]),
      'two.json': JSON.stringify([3, 4]),
    });
    const out = Files.combineJsonFiles(dir);
    expect(out).toIncludeSameMembers([1, 2, 3, 4]);
    expect(fs.existsSync(path.join(dir, 'ALL.json'))).toBe(true);
    expect(Files.readJson(path.join(dir, 'ALL.json'))).toIncludeSameMembers([1, 2, 3, 4]);
  });

  it('excludes the output file (default ALL) from the inputs', () => {
    writeTree(dir, {
      'ALL.json': JSON.stringify([99]),
      'data.json': JSON.stringify([1]),
    });
    const out = Files.combineJsonFiles(dir);
    expect(out).toEqual([1]); // ALL.json contents excluded from the merge
  });

  it('supports a custom output file name', () => {
    writeTree(dir, { 'p.json': JSON.stringify(['a']) });
    const out = Files.combineJsonFiles(dir, 'MERGED');
    expect(out).toEqual(['a']);
    expect(fs.existsSync(path.join(dir, 'MERGED.json'))).toBe(true);
  });
});

// =============================================================================
// saveInfoToFile / deleteInfo
// =============================================================================

describe('Files.saveInfoToFile', () => {
  it('writes a sanitized "<name>.app" file and returns its path', () => {
    const out = Files.saveInfoToFile(dir, 'My Company');
    expect(out).toBe(path.join(dir, 'My Company.app'));
    expect(fs.readFileSync(out, 'utf8')).toBe('App');
  });

  it('removes a stale matching .txt before writing the .app', () => {
    const sanitized = Files.cleanupFileName('Acme');
    fs.writeFileSync(path.join(dir, `${sanitized}.txt`), 'old', 'utf8');
    Files.saveInfoToFile(dir, 'Acme');
    expect(fs.existsSync(path.join(dir, `${sanitized}.txt`))).toBe(false);
    expect(fs.existsSync(path.join(dir, `${sanitized}.app`))).toBe(true);
  });

  it('returns null for empty input', () => {
    expect(Files.saveInfoToFile(dir, '')).toBeNull();
    expect(Files.saveInfoToFile(dir, null)).toBeNull();
  });
});

describe('Files.deleteInfo', () => {
  it('removes every file whose name contains the sanitized pattern', () => {
    Files.saveInfoToFile(dir, 'Globex');
    fs.writeFileSync(path.join(dir, 'Globex extra.txt'), 'x', 'utf8');
    Files.deleteInfo(dir, 'Globex');
    expect(fs.readdirSync(dir).filter((f) => f.toLowerCase().includes('globex'))).toHaveLength(0);
  });

  it('returns null for empty input', () => {
    expect(Files.deleteInfo(dir, '')).toBeNull();
  });

  it('warns and returns null when no matching files are found', () => {
    writeTree(dir, { 'unrelated.txt': 'x' });
    expect(Files.deleteInfo(dir, 'Nonexistent')).toBeNull();
  });
});

// =============================================================================
// async fs boundaries
// =============================================================================

describe('Files.exists', () => {
  // Real behavior note: exists() calls `fs.access(path)` (the callback-style API)
  // with no callback. On modern Node that throws synchronously ("callback must be
  // a function"); the throw is caught and `false` is returned — even for files
  // that genuinely exist. We assert the ACTUAL returned boolean here.
  it('returns false for a real existing file (documents the fs.access bug)', async () => {
    const f = path.join(dir, 'present.txt');
    fs.writeFileSync(f, 'x', 'utf8');
    await expect(Files.exists(f)).resolves.toBe(false);
  });

  it('returns false for a missing path', async () => {
    await expect(Files.exists(path.join(dir, 'absent.txt'))).resolves.toBe(false);
  });
});

describe('Files.safeCopy', () => {
  it('copies a readable source file to the destination', async () => {
    const src = path.join(dir, 'src.txt');
    const dest = path.join(dir, 'dest.txt');
    fs.writeFileSync(src, 'payload', 'utf8');
    await Files.safeCopy(src, dest);
    expect(fs.readFileSync(dest, 'utf8')).toBe('payload');
  });

  it('swallows the error (no throw) when the source is unreadable/missing', async () => {
    const dest = path.join(dir, 'dest2.txt');
    await expect(Files.safeCopy(path.join(dir, 'missing.txt'), dest)).resolves.toBeUndefined();
    expect(fs.existsSync(dest)).toBe(false);
  });
});

describe('Files.copyFileWithRetry', () => {
  it('copies the source to the destination and returns true on success', () => {
    const src = path.join(dir, 'in.dat');
    const dest = path.join(dir, 'out.dat');
    fs.writeFileSync(src, 'bytes', 'utf8');
    expect(Files.copyFileWithRetry(src, dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('bytes');
  });

  it('overwrites an existing destination file', () => {
    const src = path.join(dir, 'in2.dat');
    const dest = path.join(dir, 'out2.dat');
    fs.writeFileSync(src, 'new', 'utf8');
    fs.writeFileSync(dest, 'old', 'utf8');
    expect(Files.copyFileWithRetry(src, dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('new');
  });

  it('returns false immediately when the source does not exist', () => {
    // Early-return path — never reaches the retry/process.exit(1) branch.
    expect(Files.copyFileWithRetry(path.join(dir, 'no.dat'), path.join(dir, 'x.dat'))).toBe(false);
  });

  it('calls Dialogs.messageBox and process.exit(1) after exhausting retries', () => {
    // Force the copy to fail so the final-failure branch runs. We stub
    // process.exit to THROW instead of killing the Jest worker, then assert the
    // boundary calls. copyFileSync is spied to always reject.
    const src = path.join(dir, 'src3.dat');
    const dest = path.join(dir, 'dest3.dat');
    fs.writeFileSync(src, 'x', 'utf8');

    const copySpy = jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('EBUSY: locked');
    });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    try {
      expect(() => Files.copyFileWithRetry(src, dest, 1, 1)).toThrow('process.exit called');
      expect(DialogsMock.messageBox).toHaveBeenCalledTimes(1);
      expect(exitSpy).toHaveBeenCalledWith(1);
    } finally {
      copySpy.mockRestore();
      exitSpy.mockRestore();
    }
  });
});

// =============================================================================
// Shell / GUI boundary methods (mocked)
// =============================================================================

describe('Files.openFile', () => {
  it('delegates to open() for an existing file', () => {
    const f = path.join(dir, 'open-me.txt');
    fs.writeFileSync(f, 'x', 'utf8');
    Files.openFile(f);
    expect(openMock).toHaveBeenCalledWith(f);
  });

  it('does not call open() when the file is missing', () => {
    Files.openFile(path.join(dir, 'no-file.txt'));
    expect(openMock).not.toHaveBeenCalled();
  });
});

describe('Files.openFileQoder', () => {
  it('shells out to "qoder -r" on win32', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true });
    try {
      Files.openFileQoder('C:\\some\\file.txt');
      expect(execMock).toHaveBeenCalledTimes(1);
      expect(execMock).toHaveBeenCalledWith('qoder -r "C:\\some\\file.txt"');
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });

  it('does not shell out on non-win32 platforms', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    try {
      Files.openFileQoder('/tmp/file.txt');
      expect(execMock).not.toHaveBeenCalled();
    } finally {
      Object.defineProperty(process, 'platform', { value: original, configurable: true });
    }
  });
});
