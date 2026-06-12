// Unit tests for utils/Gemini.js — public methods rename, renameMany,
// summarize, execute.
//
// Gemini is a 1:1 clone of the Claude utility adapted to the `gemini` CLI
// (@google/gemini-cli). It shells out via child_process spawnSync('gemini', …):
// the full prompt rides on STDIN (spawnOpts.input), a short directive is passed
// with `-p`, the model with `-m`, and `-o json` is requested. Output is parsed
// from the JSON envelope whose answer lives under one of
// response/result/text/output/content.
//
// Pattern (mirrors Claude.test.js): mock ONLY the external boundary —
// child_process (the CLI), Dialogs (UI), Yamls (config) and Files (project-root
// resolver) — while real fs operates on a throwaway temp project. This exercises
// the genuine prompt-building, sanitizing, collision and JSON-parsing logic.
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

const { Gemini } = await import('../utils/Gemini.js');

/**
 * Make spawnSync return a successful `-o json` envelope carrying `text` under
 * the `response` key (the first key Gemini._extractText looks for).
 */
function cliReturns(text) {
  spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify({ response: text }) }));
}

let projectDir;
let workDir;

beforeEach(() => {
  projectDir = makeTmpDir('gemini-proj-');
  workDir = makeTmpDir('gemini-work-');
  state.projectDir = projectDir;
  // prompt templates live under <project>/AI/Gemini/<method>.md
  writeTree(projectDir, {
    AI: {
      Gemini: {
        'rename.md': '# Rename\nOld: {{OldName}} Ext: {{Ext}} Lang: {{Language}} Min: {{MinLen}} Max: {{MaxLen}} Path: {{FilePath}}\n{{ThinkHint}}\n{{Content}}',
        'summarize.md': '# Summarize\nLevel {{Level}} {{LevelDesc}} Lang {{Language}} File {{FilePath}}\n{{ThinkHint}}',
        'execute.md': '# Execute\nFolder {{Folder}}\n{{ThinkHint}}',
      },
    },
  });
  cliReturns('Default Answer');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

describe('Gemini.rename', () => {
  it('renames a text file using the inlined content and CLI answer', () => {
    const file = path.join(workDir, 'document.txt');
    fs.writeFileSync(file, 'invoice for acme corp, 2024 totals', 'utf8');
    cliReturns('Acme Corp 2024 Invoice');

    const result = Gemini.rename(file);

    expect(result).toBe(path.join(workDir, 'Acme Corp 2024 Invoice.txt'));
    expect(fs.existsSync(result)).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(spawnSync).toHaveBeenCalledTimes(1);
  });

  it('invokes the gemini CLI with the documented args and STDIN prompt', () => {
    const file = path.join(workDir, 'doc.txt');
    fs.writeFileSync(file, 'hello world content', 'utf8');
    cliReturns('Some Name');

    Gemini.rename(file);

    const [cmd, args, opts] = spawnSync.mock.calls[0];
    expect(cmd).toBe('gemini');
    // -o json, -m <model>, -p <directive>
    expect(args).toContain('-o');
    expect(args).toContain('json');
    expect(args).toContain('-m');
    expect(args[args.indexOf('-m') + 1]).toBe('gemini-2.5-pro'); // config getConfig→null → default
    expect(args).toContain('-p');
    // full prompt rides on STDIN, never on the command line
    expect(opts.input).toContain('hello world content');
    expect(opts.shell).toBe(true);
    expect(opts.encoding).toBe('utf8');
    // text file → no workspace/tool flags
    expect(args).not.toContain('--include-directories');
    expect(args).not.toContain('--approval-mode');
  });

  it('keeps the original extension and sanitizes illegal characters', () => {
    const file = path.join(workDir, 'a.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    cliReturns('Report: Q1/Q2 <final>');

    const result = Gemini.rename(file);

    expect(path.extname(result)).toBe('.txt');
    expect(path.basename(result, '.txt')).toBeSafeWindowsName();
  });

  it('grants the file tool and includes the dir for binary files instead of inlining', () => {
    const file = path.join(workDir, 'scan.pdf');
    fs.writeFileSync(file, 'binary-bytes', 'utf8');
    cliReturns('Scanned Contract');

    Gemini.rename(file);

    const [, args, opts] = spawnSync.mock.calls[0];
    expect(args).toContain('--include-directories');
    expect(args).toContain('--approval-mode');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo');
    // binary content is NOT embedded in the prompt (only the path is given)
    expect(opts.input).not.toContain('binary-bytes');
  });

  it('returns null and warns when the file does not exist', () => {
    const result = Gemini.rename(path.join(workDir, 'missing.txt'));
    expect(result).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null and warns when the path is a directory, not a file', () => {
    const sub = path.join(workDir, 'adir');
    fs.mkdirSync(sub);
    const result = Gemini.rename(sub);
    expect(result).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns the same path when the suggested name equals the current name', () => {
    const file = path.join(workDir, 'KeepMe.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    cliReturns('KeepMe');

    expect(Gemini.rename(file)).toBe(file);
    expect(fs.existsSync(file)).toBe(true);
  });

  it('auto-increments on a name collision with an existing file', () => {
    const file = path.join(workDir, 'orig.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    // a file already occupies the suggested target name
    fs.writeFileSync(path.join(workDir, 'Taken Name.txt'), 'existing', 'utf8');
    cliReturns('Taken Name');

    const result = Gemini.rename(file);
    expect(result).toBe(path.join(workDir, 'Taken Name 1.txt'));
    expect(fs.existsSync(result)).toBe(true);
  });

  it('warns and returns null when the model returns an empty/unusable name', () => {
    const file = path.join(workDir, 'c.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    // valid JSON envelope but the answer text is empty → sanitized to ''
    spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify({ response: '' }) }));

    expect(Gemini.rename(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    // the original file is untouched
    expect(fs.existsSync(file)).toBe(true);
  });

  it('returns null and shows an error dialog when the CLI fails to launch', () => {
    const file = path.join(workDir, 'b.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    spawnSync.mockReturnValue(spawnResult({ error: new Error('ENOENT'), status: null }));

    expect(Gemini.rename(file)).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });

  it('returns null and warns when Gemini reports a structured JSON error', () => {
    const file = path.join(workDir, 'auth.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    spawnSync.mockReturnValue(spawnResult({
      stdout: JSON.stringify({ error: { code: 401, message: 'missing auth' } }),
    }));

    expect(Gemini.rename(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    const [desc] = DialogsMock.warningBox.mock.calls[0];
    expect(desc).toContain('missing auth');
  });

  it('strips a code-fence wrapper and a duplicated extension from the answer', () => {
    const file = path.join(workDir, 'rep.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    // model wraps in a fence and appends the original extension
    cliReturns('```\nQuarterly Report.txt\n```');

    const result = Gemini.rename(file);
    expect(result).toBe(path.join(workDir, 'Quarterly Report.txt'));
  });
});

describe('Gemini.renameMany', () => {
  it('processes every file and reports per-file results', () => {
    const f1 = path.join(workDir, 'one.txt');
    const f2 = path.join(workDir, 'two.txt');
    fs.writeFileSync(f1, 'a', 'utf8');
    fs.writeFileSync(f2, 'b', 'utf8');
    cliReturns('Renamed File');

    const results = Gemini.renameMany([f1, f2]);

    expect(results).toBeArrayOfSize(2);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(results[0]).toContainAllKeys(['from', 'to', 'ok']);
    // second file collides with the first renamed → auto-incremented, still ok
    expect(results[1].to).not.toBeNull();
  });

  it('accepts a single path (not an array)', () => {
    const f1 = path.join(workDir, 'solo.txt');
    fs.writeFileSync(f1, 'a', 'utf8');
    cliReturns('Solo Renamed');

    const results = Gemini.renameMany(f1);
    expect(results).toBeArrayOfSize(1);
    expect(results[0].ok).toBe(true);
  });

  it('marks a missing file as not ok without aborting the batch', () => {
    const ok = path.join(workDir, 'good.txt');
    fs.writeFileSync(ok, 'a', 'utf8');
    cliReturns('Good Renamed');

    const results = Gemini.renameMany([path.join(workDir, 'gone.txt'), ok]);
    expect(results[0].ok).toBe(false);
    expect(results[0].to).toBeNull();
    expect(results[1].ok).toBe(true);
  });
});

describe('Gemini.summarize', () => {
  it('writes a Markdown summary next to a non-text file', () => {
    const file = path.join(workDir, 'paper.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    cliReturns('# Summary\n\nKey points.');

    const out = Gemini.summarize(file);

    expect(out).toBe(path.join(workDir, 'paper.md'));
    expect(fs.readFileSync(out, 'utf8')).toBe('# Summary\n\nKey points.');
  });

  it('reads the file via the CLI (include dir + yolo), prompt on STDIN', () => {
    const file = path.join(workDir, 'doc.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    cliReturns('Summary text');

    Gemini.summarize(file);

    const [cmd, args, opts] = spawnSync.mock.calls[0];
    expect(cmd).toBe('gemini');
    expect(args).toContain('--include-directories');
    expect(args).toContain('--approval-mode');
    expect(args[args.indexOf('--approval-mode') + 1]).toBe('yolo');
    // the prompt (with the file path) is delivered on STDIN
    expect(opts.input).toContain(file);
  });

  it('auto-increments the .md output when one already exists', () => {
    const file = path.join(workDir, 'report.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    fs.writeFileSync(path.join(workDir, 'report.md'), 'old summary', 'utf8');
    cliReturns('fresh summary');

    const out = Gemini.summarize(file);
    expect(out).toBe(path.join(workDir, 'report 1.md'));
    expect(fs.readFileSync(out, 'utf8')).toBe('fresh summary');
  });

  it('refuses text files', () => {
    const file = path.join(workDir, 'notes.md');
    fs.writeFileSync(file, '# notes', 'utf8');

    expect(Gemini.summarize(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null when the file is missing', () => {
    expect(Gemini.summarize(path.join(workDir, 'nope.pdf'))).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('warns and returns null on an empty summary', () => {
    const file = path.join(workDir, 'empty.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify({ response: '   ' }) }));

    expect(Gemini.summarize(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    // no .md was written
    expect(fs.existsSync(path.join(workDir, 'empty.md'))).toBe(false);
  });

  it('returns null and reports an error when the CLI launch fails', () => {
    const file = path.join(workDir, 'x.pdf');
    fs.writeFileSync(file, 'binary', 'utf8');
    spawnSync.mockReturnValue(spawnResult({ error: new Error('ENOENT'), status: null }));

    expect(Gemini.summarize(file)).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });
});

describe('Gemini.execute', () => {
  it('runs the typed instruction in the folder and shows the report', () => {
    DialogsMock.multilineInputBox.mockReturnValue('categorize all files');
    cliReturns('Done: moved 3 files');

    const answer = Gemini.execute(workDir);

    expect(answer).toBe('Done: moved 3 files');
    expect(DialogsMock.messageBox).toHaveBeenCalledWith('Done: moved 3 files', expect.any(String));
    const [, args, opts] = spawnSync.mock.calls[0];
    // the CLI runs inside the target folder
    expect(opts.cwd).toBe(path.resolve(workDir));
    expect(args).toContain('--include-directories');
    expect(args).toContain('--approval-mode');
    // the user's instruction is appended to the STDIN prompt
    expect(opts.input).toContain('categorize all files');
  });

  it('aborts when no instruction is entered', () => {
    DialogsMock.multilineInputBox.mockReturnValue(null);
    expect(Gemini.execute(workDir)).toBeNull();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('aborts on an empty/whitespace instruction', () => {
    DialogsMock.multilineInputBox.mockReturnValue('   ');
    expect(Gemini.execute(workDir)).toBeNull();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('returns null for a non-existent folder', () => {
    expect(Gemini.execute(path.join(workDir, 'no-such-dir'))).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(DialogsMock.multilineInputBox).not.toHaveBeenCalled();
  });

  it('returns null for a file path (not a directory)', () => {
    const file = path.join(workDir, 'afile.txt');
    fs.writeFileSync(file, 'x', 'utf8');
    expect(Gemini.execute(file)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns null and reports an error when the CLI launch fails', () => {
    DialogsMock.multilineInputBox.mockReturnValue('do the thing');
    spawnSync.mockReturnValue(spawnResult({ error: new Error('ENOENT'), status: null }));

    expect(Gemini.execute(workDir)).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });

  it('returns the empty answer without showing a report dialog', () => {
    DialogsMock.multilineInputBox.mockReturnValue('do nothing');
    // non-empty stdout JSON whose answer text is empty → _ask returns '' (no throw)
    spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify({ response: '' }) }));

    const answer = Gemini.execute(workDir);
    expect(answer).toBe('');
    expect(DialogsMock.messageBox).not.toHaveBeenCalled();
  });
});
