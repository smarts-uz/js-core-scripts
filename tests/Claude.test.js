// Unit tests for utils/Claude.js — public methods rename, renameMany,
// summarize, execute, exportChat.
//
// Pattern (reference for all native/CLI-backed classes): mock only the external
// boundary — child_process (the `claude` CLI), Dialogs (UI), Yamls (config) and
// Files (project-root resolver) — while letting real fs operate on a throwaway
// temp project. This exercises the genuine prompt-building, sanitizing, collision
// and transcript-parsing logic.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree } from './helpers/tmp.js';
import { spawnResult } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- mocks for the external boundary -----------------------------------------
const state = { projectDir: '' };
const spawnSync = jest.fn();

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
  mkdirIfNotExists: (d) => fs.mkdirSync(d, { recursive: true }),
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
};
const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
  multilineInputBox: jest.fn(),
};
const YamlsMock = { getConfig: jest.fn(() => null) };

jest.unstable_mockModule('child_process', () => ({ spawnSync, default: { spawnSync } }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Claude } = await import('../utils/Claude.js');

/** Make spawnSync return a successful JSON envelope carrying `text`. */
function cliReturns(text) {
  spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify({ result: text }) }));
}

let projectDir;
let workDir;

beforeEach(() => {
  projectDir = makeTmpDir('claude-proj-');
  workDir = makeTmpDir('claude-work-');
  state.projectDir = projectDir;
  // prompt templates live under <project>/AI/Claude/<method>.md
  writeTree(projectDir, {
    AI: {
      Claude: {
        'rename.md': '# Rename\nOld: {{OldName}} Ext: {{Ext}} Lang: {{Language}}\n{{Content}}',
        'summarize.md': '# Summarize\nLevel {{Level}} {{LevelDesc}} Lang {{Language}} File {{FilePath}}',
        'execute.md': '# Execute\nFolder {{Folder}} {{ThinkHint}}',
      },
    },
  });
  cliReturns('Default Answer');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

describe('Claude.rename', () => {
  it('renames a text file using the inlined content and CLI answer', () => {
    const file = path.join(workDir, 'document.txt');
    fs.writeFileSync(file, 'invoice for acme corp, 2024 totals', 'utf8');
    cliReturns('Acme Corp 2024 Invoice');

    const result = Claude.rename(file);

    expect(result).toBe(path.join(workDir, 'Acme Corp 2024 Invoice.txt'));
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(1);
    // text file → content embedded inline, no Read tool granted
    const [, args] = spawnSync.mock.calls[0];
    expect(args).not.toContain('--allowed-tools');
  });

  it('keeps the original extension and sanitizes illegal characters', () => {
    const file = path.join(workDir, 'a.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    cliReturns('Report: Q1/Q2 <final>');

    const result = Claude.rename(file);

    expect(path.extname(result)).toBe('.txt');
    expect(path.basename(result, '.txt')).toBeSafeWindowsName();
  });

  it('grants the Read tool for binary files instead of inlining content', () => {
    const file = path.join(workDir, 'scan.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    cliReturns('Scanned Contract');

    Claude.rename(file);

    const [, args] = spawnSync.mock.calls[0];
    expect(args).toContain('--allowed-tools');
  });

  it('returns null and warns when the file does not exist', () => {
    const result = Claude.rename(path.join(workDir, 'missing.txt'));
    expect(result).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns the same path when the suggested name equals the current name', () => {
    const file = path.join(workDir, 'KeepMe.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    cliReturns('KeepMe');

    expect(Claude.rename(file)).toBe(file);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('returns null when the CLI fails to launch', () => {
    const file = path.join(workDir, 'b.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    spawnSync.mockReturnValue(spawnResult({ error: new Error('ENOENT'), status: null }));

    expect(Claude.rename(file)).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });
});

describe('Claude.renameMany', () => {
  it('processes every file and reports per-file results', () => {
    const f1 = path.join(workDir, 'one.txt');
    const f2 = path.join(workDir, 'two.txt');
    fs.writeFileSync(f1, 'a', 'utf8');
    fs.writeFileSync(f2, 'b', 'utf8');
    cliReturns('Renamed File');

    const results = Claude.renameMany([f1, f2]);

    expect(results).toBeArrayOfSize(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0]).toContainAllKeys(['from', 'to', 'ok']);
  });

  it('accepts a single path (not an array)', () => {
    const f1 = path.join(workDir, 'solo.txt');
    fs.writeFileSync(f1, 'a', 'utf8');
    cliReturns('Solo Renamed');

    const results = Claude.renameMany(f1);
    expect(results).toBeArrayOfSize(1);
  });

  it('marks a missing file as not ok without aborting the batch', () => {
    const ok = path.join(workDir, 'good.txt');
    fs.writeFileSync(ok, 'a', 'utf8');
    cliReturns('Good Renamed');

    const results = Claude.renameMany([path.join(workDir, 'gone.txt'), ok]);
    expect(results[0].ok).toBe(false);
    expect(results[1].ok).toBe(true);
  });
});

describe('Claude.summarize', () => {
  it('writes a Markdown summary next to a non-text file', () => {
    const file = path.join(workDir, 'paper.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    cliReturns('# Summary\n\nKey points.');

    const out = Claude.summarize(file);

    expect(out).toBe(path.join(workDir, 'paper.md'));
    expect(fs.readFileSync(out, 'utf8')).toBe('# Summary\n\nKey points.');
  });

  it('refuses text files', () => {
    const file = path.join(workDir, 'notes.md');
    fs.writeFileSync(file, '# notes', 'utf8');

    expect(Claude.summarize(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null when the file is missing', () => {
    expect(Claude.summarize(path.join(workDir, 'nope.pdf'))).toBeNull();
  });
});

describe('Claude.execute', () => {
  it('runs the typed instruction in the folder and shows the report', () => {
    DialogsMock.multilineInputBox.mockReturnValue('categorize all files');
    cliReturns('Done: moved 3 files');

    const answer = Claude.execute(workDir);

    expect(answer).toBe('Done: moved 3 files');
    expect(DialogsMock.messageBox).toHaveBeenCalledWith('Done: moved 3 files', expect.any(String));
    const [, , opts] = spawnSync.mock.calls[0];
    expect(opts.cwd).toBe(path.resolve(workDir));
  });

  it('aborts when no instruction is entered', () => {
    DialogsMock.multilineInputBox.mockReturnValue(null);
    expect(Claude.execute(workDir)).toBeNull();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null for a non-existent folder', () => {
    expect(Claude.execute(path.join(workDir, 'no-such-dir'))).toBeNull();
  });
});

describe('Claude.exportChat', () => {
  it('converts an explicit JSONL transcript into a Markdown chat file', () => {
    const transcript = path.join(workDir, 'session.jsonl');
    const lines = [
      JSON.stringify({ type: 'user', message: { content: 'Hello Claude' } }),
      JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Hi there' }] } }),
    ].join('\n');
    fs.writeFileSync(transcript, lines, 'utf8');
    const outDir = path.join(workDir, 'out');

    const out = Claude.exportChat(workDir, { sessionFile: transcript, outDir });

    expect(out).toEndWith('.md');
    const md = fs.readFileSync(out, 'utf8');
    expect(md).toInclude('# Chat Transcript');
    expect(md).toInclude('👤 User');
    expect(md).toInclude('Hello Claude');
    expect(md).toInclude('🤖 Claude');
    expect(md).toInclude('Hi there');
  });

  it('warns and returns null when the explicit session file is missing', () => {
    const out = Claude.exportChat(workDir, { sessionFile: path.join(workDir, 'gone.jsonl') });
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('warns when the transcript has no exportable messages', () => {
    const transcript = path.join(workDir, 'empty.jsonl');
    fs.writeFileSync(transcript, JSON.stringify({ type: 'user', isMeta: true, message: { content: 'x' } }), 'utf8');

    const out = Claude.exportChat(workDir, { sessionFile: transcript, outDir: path.join(workDir, 'o') });
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });
});
