// Unit tests for utils/Category.js — public static methods timestamp, loadYaml,
// ensureDir, moveFile, removeEmptyDirs, findFileRecursively, resolveTargetPath,
// displayPath, run, revert.
//
// Category is almost entirely real fs + js-yaml, so it is tested FOR REAL
// against throwaway temp directories. Only the two external boundaries are
// mocked: Chromes (reads a URL out of .mhtml/.html files, native-ish) and
// Dialogs (Windows UI). Everything else (fs, fs-extra, js-yaml) runs for real.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree, exists } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- mocks for the external boundary -----------------------------------------
const ChromesMock = { getUrlFromFile: jest.fn(() => null) };
const DialogsMock = { errorBox: jest.fn() };

jest.unstable_mockModule(utilsModule('Chromes.js'), () => ({ Chromes: ChromesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));

const { Category } = await import('../utils/Category.js');

let work;

beforeEach(() => {
  work = makeTmpDir('category-');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

// Write a YAML mapping file under the temp dir and return its absolute path.
function writeYaml(name, body) {
  const p = path.join(work, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body, 'utf8');
  return p;
}

describe('Category.timestamp', () => {
  it('returns a YYYY-MM-DD_HH-MM string', () => {
    const ts = Category.timestamp();
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/);
  });

  it('reflects the current date', () => {
    const ts = Category.timestamp();
    expect(ts.slice(0, 4)).toBe(String(new Date().getFullYear()));
  });
});

describe('Category.loadYaml', () => {
  it('parses a valid YAML file into an object', () => {
    const p = writeYaml('map.yml', 'TargetPath: "x"\nSourceFolder: "src"\n');
    const data = Category.loadYaml(p, 'T');
    expect(data).toEqual({ TargetPath: 'x', SourceFolder: 'src' });
  });

  it('returns null and warns when the file is missing', () => {
    const data = Category.loadYaml(path.join(work, 'nope.yml'), 'T');
    expect(data).toBeNull();
  });

  it('renames duplicate top-level keys with a numeric suffix', () => {
    // Two entries keyed "a.txt" — the second becomes "a_2.txt" so both survive.
    const body = [
      'TargetPath: "{category}/{source_file}"',
      '"a.txt":',
      '  category: One',
      '"a.txt":',
      '  category: Two',
    ].join('\n');
    const p = writeYaml('dups.yml', body);
    const data = Category.loadYaml(p, 'T');
    expect(data).toContainKey('a.txt');
    expect(data).toContainKey('a_2.txt');
    expect(data['a.txt'].category).toBe('One');
    expect(data['a_2.txt'].category).toBe('Two');
  });

  it('returns null when the YAML is unparseable', () => {
    // Unbalanced bracket → js-yaml throws → method catches and returns null.
    const p = writeYaml('bad.yml', 'foo: [1, 2\nbar: ]');
    expect(Category.loadYaml(p, 'T')).toBeNull();
  });
});

describe('Category.ensureDir', () => {
  it('creates a nested directory that does not exist', () => {
    const dir = path.join(work, 'a', 'b', 'c');
    expect(fs.existsSync(dir)).toBe(false);
    Category.ensureDir(dir, 'T');
    expect(fs.existsSync(dir)).toBe(true);
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it('is a no-op when the directory already exists', () => {
    const dir = path.join(work, 'exists');
    fs.mkdirSync(dir);
    expect(() => Category.ensureDir(dir, 'T')).not.toThrow();
    expect(fs.existsSync(dir)).toBe(true);
  });
});

describe('Category.moveFile', () => {
  it('moves a file to a new destination and returns true', () => {
    const src = path.join(work, 'src.txt');
    const dest = path.join(work, 'out', 'dest.txt');
    fs.writeFileSync(src, 'hello', 'utf8');

    const ok = Category.moveFile(src, dest, 'T');

    expect(ok).toBe(true);
    expect(fs.existsSync(src)).toBe(false);
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello');
  });

  it('returns false and does nothing when the source is missing', () => {
    const ok = Category.moveFile(path.join(work, 'gone.txt'), path.join(work, 'd.txt'), 'T');
    expect(ok).toBe(false);
    expect(fs.existsSync(path.join(work, 'd.txt'))).toBe(false);
  });

  it('renames a pre-existing destination (timestamp suffix) before moving', () => {
    const dir = path.join(work, 'dir');
    fs.mkdirSync(dir);
    const src = path.join(dir, 'src.txt');
    const dest = path.join(dir, 'dest.txt');
    fs.writeFileSync(src, 'NEW', 'utf8');
    fs.writeFileSync(dest, 'OLD', 'utf8');

    const ok = Category.moveFile(src, dest, 'T');

    expect(ok).toBe(true);
    // dest now holds the moved (NEW) content
    expect(fs.readFileSync(dest, 'utf8')).toBe('NEW');
    // the old dest was preserved under a "dest <timestamp>.txt" name
    const preserved = fs.readdirSync(dir).filter((f) => f.startsWith('dest ') && f.endsWith('.txt'));
    expect(preserved).toHaveLength(1);
    expect(fs.readFileSync(path.join(dir, preserved[0]), 'utf8')).toBe('OLD');
  });
});

describe('Category.removeEmptyDirs', () => {
  it('prunes empty directories upward, stopping before the limit', () => {
    const base = path.join(work, 'base');
    const leaf = path.join(base, 'a', 'b', 'c');
    fs.mkdirSync(leaf, { recursive: true });

    Category.removeEmptyDirs(leaf, base, 'T');

    // a/b/c, a/b and a all empty → removed; base (the limit) is kept.
    expect(fs.existsSync(path.join(base, 'a'))).toBe(false);
    expect(fs.existsSync(base)).toBe(true);
  });

  it('stops at the first non-empty directory', () => {
    const base = path.join(work, 'base');
    const mid = path.join(base, 'a');
    const leaf = path.join(mid, 'b');
    fs.mkdirSync(leaf, { recursive: true });
    fs.writeFileSync(path.join(mid, 'keep.txt'), 'x', 'utf8'); // makes `a` non-empty

    Category.removeEmptyDirs(leaf, base, 'T');

    expect(fs.existsSync(leaf)).toBe(false); // empty leaf removed
    expect(fs.existsSync(mid)).toBe(true);   // non-empty parent kept
  });

  it('does nothing when the start path does not exist', () => {
    expect(() => Category.removeEmptyDirs(path.join(work, 'nope'), work, 'T')).not.toThrow();
  });
});

describe('Category.findFileRecursively', () => {
  it('finds a nested file and returns its full path', () => {
    writeTree(work, { x: { y: { 'needle.txt': 'found' } }, 'top.txt': 'a' });
    const found = Category.findFileRecursively(work, 'needle.txt');
    expect(found).toBe(path.join(work, 'x', 'y', 'needle.txt'));
  });

  it('returns null when the file is not present', () => {
    writeTree(work, { a: { 'other.txt': 'x' } });
    expect(Category.findFileRecursively(work, 'missing.txt')).toBeNull();
  });

  it('returns null when the root directory does not exist', () => {
    expect(Category.findFileRecursively(path.join(work, 'gone'), 'x.txt')).toBeNull();
  });
});

describe('Category.resolveTargetPath', () => {
  it('substitutes {source_file}, {SourceFolder} and entry fields', () => {
    const out = Category.resolveTargetPath(
      '{SourceFolder}/{category}/{source_file}',
      'file.txt',
      { category: 'Docs' },
      'C:/src',
      null,
    );
    expect(out).toBe(path.normalize('C:/src/Docs/file.txt'));
  });

  it('substitutes {domain_name} when provided', () => {
    const out = Category.resolveTargetPath(
      '{category}/{domain_name}/{source_file}',
      'page.html',
      { category: 'Web' },
      '',
      'example.com',
    );
    expect(out).toBe(path.normalize('Web/example.com/page.html'));
  });

  it('collapses the /{domain_name}/ segment when no domain is given', () => {
    const out = Category.resolveTargetPath(
      '{category}/{domain_name}/{source_file}',
      'page.html',
      { category: 'Web' },
      '',
      null,
    );
    expect(out).toBe(path.normalize('Web/page.html'));
  });

  it('strips leftover/unknown placeholders', () => {
    const out = Category.resolveTargetPath(
      '{category}/{unknown}/{source_file}',
      'f.txt',
      { category: 'C' },
      '',
      null,
    );
    expect(out).toBe(path.normalize('C/f.txt'));
  });
});

describe('Category.displayPath', () => {
  it('returns a forward-slash relative path when SourceFolder and absolutePath are given', () => {
    const out = Category.displayPath(
      'f.txt',
      {},
      path.join('C:', 'src'),
      path.join('C:', 'src', 'sub', 'f.txt'),
    );
    expect(out).toBe('sub/f.txt');
  });

  it('joins relative_path + target when SourceFolder is absent', () => {
    const out = Category.displayPath('f.txt', { relative_path: 'a/b' }, null, null);
    expect(out).toBe('a/b/f.txt');
  });

  it('falls back to the bare target', () => {
    expect(Category.displayPath('f.txt', {}, null, null)).toBe('f.txt');
  });
});

describe('Category.run', () => {
  // run()/revert() end with a 10s busy-wait loop; bump the per-test timeout.
  jest.setTimeout(40000);

  it('aborts (errorBox) when TargetPath is missing', () => {
    const p = writeYaml('no-target.yml', 'SourceFolder: src\n');
    Category.run(p);
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  }, 40000);

  it('returns early without errorBox when the YAML cannot be loaded', () => {
    Category.run(path.join(work, 'missing.yml'));
    expect(DialogsMock.errorBox).not.toHaveBeenCalled();
  }, 40000);

  it('moves categorized source files to their resolved TargetPath', () => {
    const srcDir = path.join(work, 'src');
    const destRoot = path.join(work, 'dest');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'a.txt'), 'AAA', 'utf8');
    fs.writeFileSync(path.join(srcDir, 'b.txt'), 'BBB', 'utf8');

    const body = [
      `TargetPath: "${destRoot.replace(/\\/g, '/')}/{category}/{source_file}"`,
      `SourceFolder: "${srcDir.replace(/\\/g, '/')}"`,
      '"a.txt":',
      '  category: Docs',
      '"b.txt":',
      '  category: Uncategorized', // skipped
    ].join('\n');
    const p = writeYaml('run.yml', body);

    Category.run(p);

    // a.txt moved into dest/Docs; b.txt left in place (Uncategorized).
    expect(exists(destRoot, 'Docs', 'a.txt')).toBe(true);
    expect(fs.readFileSync(path.join(destRoot, 'Docs', 'a.txt'), 'utf8')).toBe('AAA');
    expect(fs.existsSync(path.join(srcDir, 'a.txt'))).toBe(false);
    expect(fs.existsSync(path.join(srcDir, 'b.txt'))).toBe(true);
  }, 40000);

  it('uses explicit source_path when present', () => {
    const srcDir = path.join(work, 's2');
    const destRoot = path.join(work, 'd2');
    fs.mkdirSync(srcDir, { recursive: true });
    const srcFile = path.join(srcDir, 'doc.txt');
    fs.writeFileSync(srcFile, 'DOC', 'utf8');

    const body = [
      `TargetPath: "${destRoot.replace(/\\/g, '/')}/{category}/{source_file}"`,
      '"doc.txt":',
      '  category: Reports',
      `  source_path: "${srcFile.replace(/\\/g, '/')}"`,
    ].join('\n');
    const p = writeYaml('run2.yml', body);

    Category.run(p);

    expect(exists(destRoot, 'Reports', 'doc.txt')).toBe(true);
    expect(fs.existsSync(srcFile)).toBe(false);
  }, 40000);
});

describe('Category.revert', () => {
  jest.setTimeout(40000);

  it('aborts (errorBox) when TargetPath is missing', () => {
    const p = writeYaml('rev-no-target.yml', 'SourceFolder: src\n');
    Category.revert(p);
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  }, 40000);

  it('moves files back from the resolved TargetPath to their original source_path', () => {
    const srcDir = path.join(work, 'orig');
    const destRoot = path.join(work, 'moved');
    fs.mkdirSync(srcDir, { recursive: true });
    const movedFile = path.join(destRoot, 'Docs', 'a.txt');
    fs.mkdirSync(path.dirname(movedFile), { recursive: true });
    fs.writeFileSync(movedFile, 'AAA', 'utf8');

    const body = [
      `TargetPath: "${destRoot.replace(/\\/g, '/')}/{category}/{source_file}"`,
      `SourceFolder: "${srcDir.replace(/\\/g, '/')}"`,
      '"a.txt":',
      '  category: Docs',
      `  category_path: "${path.join(destRoot, 'Docs').replace(/\\/g, '/')}"`,
    ].join('\n');
    const p = writeYaml('revert.yml', body);

    Category.revert(p);

    // a.txt restored to SourceFolder, and the now-empty Docs dir pruned.
    expect(exists(srcDir, 'a.txt')).toBe(true);
    expect(fs.readFileSync(path.join(srcDir, 'a.txt'), 'utf8')).toBe('AAA');
    expect(fs.existsSync(path.join(destRoot, 'Docs'))).toBe(false);
  }, 40000);

  it('uses findFileRecursively when TargetPath contains {domain_name}', () => {
    const srcDir = path.join(work, 'orig2');
    const catPath = path.join(work, 'cat');
    fs.mkdirSync(srcDir, { recursive: true });
    // File was moved under cat/<domain>/page.html — domain unknown at revert time.
    const movedFile = path.join(catPath, 'example.com', 'page.html');
    fs.mkdirSync(path.dirname(movedFile), { recursive: true });
    fs.writeFileSync(movedFile, 'PAGE', 'utf8');

    const body = [
      `TargetPath: "{category_path}/{domain_name}/{source_file}"`,
      `SourceFolder: "${srcDir.replace(/\\/g, '/')}"`,
      '"page.html":',
      '  category: Web',
      `  category_path: "${catPath.replace(/\\/g, '/')}"`,
    ].join('\n');
    const p = writeYaml('revert-domain.yml', body);

    Category.revert(p);

    expect(exists(srcDir, 'page.html')).toBe(true);
    expect(fs.existsSync(movedFile)).toBe(false);
  }, 40000);
});
