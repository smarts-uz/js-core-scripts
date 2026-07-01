// Unit tests for utils/Scanner.js — every public (non-_) static method:
//   isExcluded, getTimestamp, notify, safeWriteFile, scanRecursive, toYaml,
//   getIncrementedPath, flattenTreeForTable, generateTreeMarkdown, run.
//
// Strategy: the directory walking, YAML emit, markdown and incrementing logic
// are all pure / real-fs, so they run for real against throwaway temp dirs.
// Two boundaries are mocked: child_process (Scanner.notify shells out to
// powershell via execSync) and Yamls (Scanner.run pulls exclusions from
// Yamls.getConfig). js-yaml runs for real so toYaml round-trips genuinely.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { makeTmpDir, cleanupAllTmpDirs, writeTree, read } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- mocked boundary ---------------------------------------------------------
const execSync = jest.fn();
const YamlsMock = { getConfig: jest.fn() };

jest.unstable_mockModule('child_process', () => ({ execSync, default: { execSync } }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Scanner } = await import('../utils/Scanner.js');

let workDir;

beforeEach(() => {
  workDir = makeTmpDir('scanner-');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
describe('Scanner.isExcluded', () => {
  it('excludes names contained in the exclusions list', () => {
    expect(Scanner.isExcluded('ALL', Scanner.defaultExclusions)).toBe(true);
    expect(Scanner.isExcluded('App', Scanner.defaultExclusions)).toBe(true);
  });

  it('excludes names beginning with _ or @', () => {
    expect(Scanner.isExcluded('_hidden', [])).toBe(true);
    expect(Scanner.isExcluded('@tag', [])).toBe(true);
  });

  it('keeps ordinary names', () => {
    expect(Scanner.isExcluded('Clients', Scanner.defaultExclusions)).toBe(false);
    expect(Scanner.isExcluded('Reports', [])).toBe(false);
  });
});

describe('Scanner.getTimestamp', () => {
  it('formats now as YYYY-MM-DD_HH-mm', () => {
    expect(Scanner.getTimestamp()).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}$/);
  });

  it('reflects a mocked date', () => {
    jest.useFakeTimers().setSystemTime(new Date(2024, 2, 9, 7, 5)); // 2024-03-09 07:05
    expect(Scanner.getTimestamp()).toBe('2024-03-09_07-05');
    jest.useRealTimers();
  });
});

describe('Scanner.notify', () => {
  it('shells out to powershell via execSync with the message/title/type', () => {
    Scanner.notify('Hello', 'Title', 5, 64);
    expect(execSync).toHaveBeenCalledTimes(1);
    const [cmd, opts] = execSync.mock.calls[0];
    expect(cmd).toContain('powershell');
    expect(cmd).toContain('Hello');
    expect(cmd).toContain('Title');
    expect(cmd).toContain('64');
    expect(opts).toEqual({ stdio: 'ignore' });
  });

  it('doubles single quotes in message and title to escape them', () => {
    Scanner.notify("it's", "o'clock", 3);
    const [cmd] = execSync.mock.calls[0];
    expect(cmd).toContain("it''s");
    expect(cmd).toContain("o''clock");
  });

  it('swallows execSync errors', () => {
    execSync.mockImplementation(() => {
      throw new Error('boom');
    });
    expect(() => Scanner.notify('m', 't', 1)).not.toThrow();
  });
});

describe('Scanner.safeWriteFile', () => {
  it('writes a new file, creating missing parent dirs', () => {
    const aic = path.join(workDir, 'AIC');
    const target = path.join(workDir, 'sub', 'out.txt');
    Scanner.safeWriteFile(target, 'content', aic);
    expect(fs.readFileSync(target, 'utf8')).toBe('content');
  });

  it('moves an existing file into "- Theory" before writing the new content', () => {
    const aic = path.join(workDir, 'AIC');
    fs.mkdirSync(aic, { recursive: true });
    const target = path.join(workDir, 'out.txt');
    fs.writeFileSync(target, 'OLD', 'utf8');

    Scanner.safeWriteFile(target, 'NEW', aic);

    expect(fs.readFileSync(target, 'utf8')).toBe('NEW');
    const theory = path.join(aic, '- Theory');
    expect(fs.readFileSync(path.join(theory, 'out.txt'), 'utf8')).toBe('OLD');
  });

  it('timestamps a prior backup when a backup with the same name already exists', () => {
    const aic = path.join(workDir, 'AIC');
    const theory = path.join(aic, '- Theory');
    fs.mkdirSync(theory, { recursive: true });
    const target = path.join(workDir, 'out.txt');
    fs.writeFileSync(target, 'OLD2', 'utf8');
    fs.writeFileSync(path.join(theory, 'out.txt'), 'BACKUP1', 'utf8');

    Scanner.safeWriteFile(target, 'NEW2', aic);

    // the new file is written
    expect(fs.readFileSync(target, 'utf8')).toBe('NEW2');
    // old current file becomes the canonical backup
    expect(fs.readFileSync(path.join(theory, 'out.txt'), 'utf8')).toBe('OLD2');
    // the previous backup was renamed with a timestamp suffix
    const renamed = fs
      .readdirSync(theory)
      .filter((n) => /^out \d{4}-\d{2}-\d{2}_\d{2}-\d{2}\.txt$/.test(n));
    expect(renamed).toHaveLength(1);
    expect(fs.readFileSync(path.join(theory, renamed[0]), 'utf8')).toBe('BACKUP1');
  });
});

describe('Scanner.scanRecursive', () => {
  it('builds a nested tree of directories, skipping excluded ones', () => {
    writeTree(workDir, {
      Clients: { Acme: {}, Beta: {} },
      App: { ShouldSkip: {} }, // App is in defaultExclusions
      _hidden: {},
      'note.txt': 'file', // files are ignored
    });
    const tree = Scanner.scanRecursive(workDir, 1, 5, Scanner.defaultExclusions);
    expect(tree).toContainKey('Clients');
    expect(tree.Clients).toContainAllKeys(['Acme', 'Beta']);
    expect(tree).not.toContainKey('App');
    expect(tree).not.toContainKey('_hidden');
  });

  it('respects maxDepth (returns {} once depth exceeds it)', () => {
    writeTree(workDir, { L1: { L2: { L3: {} } } });
    const tree = Scanner.scanRecursive(workDir, 1, 2, []);
    expect(tree.L1).toContainKey('L2');
    // L2 is at depth 2 (== maxDepth); its children are scanned at depth 3 (> max) → {}
    expect(tree.L1.L2).toEqual({});
  });

  it('returns {} for a leaf directory with no subdirectories', () => {
    writeTree(workDir, { Only: 'a file' });
    expect(Scanner.scanRecursive(workDir, 1, 5, [])).toEqual({});
  });

  it('returns {} and logs when the directory cannot be read', () => {
    expect(Scanner.scanRecursive(path.join(workDir, 'missing'), 1, 5, [])).toEqual({});
  });

  it('sorts sibling directories alphabetically', () => {
    writeTree(workDir, { Zeta: {}, Alpha: {}, Mid: {} });
    const tree = Scanner.scanRecursive(workDir, 1, 5, []);
    expect(Object.keys(tree)).toEqual(['Alpha', 'Mid', 'Zeta']);
  });
});

describe('Scanner.toYaml', () => {
  it('emits empty-leaf folders as empty strings, sorted', () => {
    const out = Scanner.toYaml({ B: {}, A: { Child: {} } });
    const parsed = yaml.load(out);
    expect(parsed).toEqual({ A: { Child: '' }, B: '' });
    // sorted: A before B
    expect(out.indexOf('A:')).toBeLessThan(out.indexOf('B:'));
  });

  it('round-trips a nested tree through js-yaml', () => {
    const tree = { Root: { Mid: { Leaf: {} } } };
    const parsed = yaml.load(Scanner.toYaml(tree));
    expect(parsed).toEqual({ Root: { Mid: { Leaf: '' } } });
  });

  it('returns an empty-ish dump for an empty tree', () => {
    // normalize({}) -> '' (a string), so the early `typeof !== object` guard returns ''
    expect(Scanner.toYaml({})).toBe('');
  });
});

describe('Scanner.getIncrementedPath', () => {
  it('creates the dir and returns -1 for the first file', () => {
    const dir = path.join(workDir, 'out');
    const p = Scanner.getIncrementedPath(dir, 'Base', '.yml');
    expect(p).toBe(path.join(dir, 'Base-1.yml'));
    expect(fs.existsSync(dir)).toBe(true);
  });

  it('increments the counter past existing collisions', () => {
    const dir = path.join(workDir, 'out');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'Base-1.yml'), '', 'utf8');
    fs.writeFileSync(path.join(dir, 'Base-2.yml'), '', 'utf8');
    expect(Scanner.getIncrementedPath(dir, 'Base', '.yml')).toBe(path.join(dir, 'Base-3.yml'));
  });
});

describe('Scanner.flattenTreeForTable', () => {
  it('flattens to {name, path} rows with slash-joined paths, sorted', () => {
    const tree = { A: { Child: {} }, B: {} };
    const rows = Scanner.flattenTreeForTable(tree);
    expect(rows).toEqual([
      { name: 'A', path: 'A' },
      { name: 'Child', path: 'A/Child' },
      { name: 'B', path: 'B' },
    ]);
  });

  it('returns the accumulator for a null tree', () => {
    expect(Scanner.flattenTreeForTable(null)).toEqual([]);
  });
});

describe('Scanner.generateTreeMarkdown', () => {
  it('produces an indented bullet list, sorted, with 4-space indentation per level', () => {
    const tree = { Top: { Sub: {} }, Other: {} };
    const md = Scanner.generateTreeMarkdown(tree);
    expect(md).toBe('- Other\n- Top\n    - Sub\n');
  });

  it('returns an empty string for a null tree', () => {
    expect(Scanner.generateTreeMarkdown(null)).toBe('');
  });
});

describe('Scanner.run', () => {
  it('writes the YAML, table and tree outputs from a real folder scan', () => {
    writeTree(workDir, {
      Clients: { Acme: {}, Beta: {} },
      Reports: {},
      App: { Skip: {} },
    });
    YamlsMock.getConfig.mockReturnValue(Scanner.defaultExclusions);
    const base = path.basename(workDir);

    Scanner.run({ sourceFolder: workDir, maxLevel: 5 });

    const aic = path.join(workDir, 'AIC');
    const mdDir = path.join(aic, 'MD');

    // YAML output: ALL header + sorted tree, App excluded
    const yamlContent = read(aic, `${base}-1.yml`);
    expect(yamlContent).toStartWith(`ALL: "${workDir.replace(/\\/g, '/')}"`);
    expect(yamlContent).toContain('Clients:');
    expect(yamlContent).toContain('Reports:');
    expect(yamlContent).not.toContain('App:');

    // Markdown table
    const table = read(mdDir, `${base}-Table-1.md`);
    expect(table).toStartWith('| Folder Name | Path |');
    expect(table).toContain('| Acme | Clients/Acme |');

    // Markdown tree
    const treeMd = read(mdDir, `${base}-Tree-1.md`);
    expect(treeMd).toStartWith('# Directory Tree (Level 1-5)');
    expect(treeMd).toContain('- Clients');
    expect(treeMd).toContain('    - Acme');
  });

  it('uses the default exclusions when Yamls.getConfig throws', () => {
    writeTree(workDir, { Keep: {}, ALL: { skipped: {} } });
    YamlsMock.getConfig.mockImplementation(() => {
      throw new Error('no config');
    });
    const base = path.basename(workDir);

    Scanner.run({ sourceFolder: workDir });

    const yamlContent = read(path.join(workDir, 'AIC'), `${base}-1.yml`);
    expect(yamlContent).toContain('Keep:');
    expect(yamlContent).not.toContain('ALL:\n'); // ALL folder excluded (the ALL: header has a value)
  });

  it('honours an explicit aicFolder and produces incremented filenames on re-run', () => {
    writeTree(workDir, { Folder: {} });
    const aic = path.join(workDir, 'custom-aic');
    YamlsMock.getConfig.mockReturnValue(Scanner.defaultExclusions);
    const base = path.basename(workDir);

    Scanner.run({ sourceFolder: workDir, aicFolder: aic });
    Scanner.run({ sourceFolder: workDir, aicFolder: aic });

    expect(fs.existsSync(path.join(aic, `${base}-1.yml`))).toBe(true);
    expect(fs.existsSync(path.join(aic, `${base}-2.yml`))).toBe(true);
  });

  it('notifies and rethrows when scanning the source folder fails', () => {
    YamlsMock.getConfig.mockReturnValue(Scanner.defaultExclusions);
    // sourceFolder does not exist → scanRecursive logs but returns {};
    // run still succeeds writing empty outputs, so to force the error path we
    // pass a sourceFolder whose basename produces a write into an unwritable
    // location is hard cross-platform. Instead, make path.basename throw via a
    // non-string sourceFolder, which throws synchronously inside the try block.
    expect(() =>
      Scanner.run({ sourceFolder: 12345, aicFolder: path.join(workDir, 'a') })
    ).toThrow();
    expect(execSync).toHaveBeenCalled(); // notify() shelled out on error
  });
});
