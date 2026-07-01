// Unit tests for runs/_generate.mjs — the generator that emits STANDALONE
// per-method runners (runs/<Class>/<method>.mjs). Its pure helpers
// (reflectParams / buildArgsCode / runnerSource / publicStaticMethods) are
// exported; the generation run only fires when the file is the process entry,
// so importing it here is side-effect-free. We assert the reflection and the
// generated arg-code/source shape; a final test confirms every emitted runner
// file actually parses as valid ESM (node --check).
import { describe, it, expect } from '@jest/globals';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import {
  reflectParams,
  buildArgsCode,
  runnerSource,
  publicStaticMethods,
} from '../runs/_generate.mjs';

// import.meta.dirname is undefined under jest's experimental-vm-modules; derive
// it from import.meta.url instead.
const RUNS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'runs');

describe('reflectParams', () => {
  it('reflects a plain signature with an optional param', () => {
    const r = reflectParams(function word(fileName, chars = null) {});
    expect(r.object).toBe(false);
    expect(r.params).toEqual([
      { name: 'fileName', hasDefault: false, rest: false },
      { name: 'chars', hasDefault: true, rest: false },
    ]);
  });

  it('flags a rest parameter', () => {
    expect(reflectParams(function f(...items) {}).params[0]).toMatchObject({
      name: 'items',
      rest: true,
    });
  });

  it('returns empty params for a zero-arg function', () => {
    expect(reflectParams(function f() {})).toEqual({ object: false, params: [] });
  });

  it('detects a destructured-object parameter and its keys', () => {
    const r = reflectParams(function run({
      sourceFolder,
      aicFolder,
      maxLevel = 5,
      exclusions = [],
    }) {});
    expect(r.object).toBe(true);
    expect(r.keys).toEqual(['sourceFolder', 'aicFolder', 'maxLevel', 'exclusions']);
  });
});

describe('buildArgsCode', () => {
  it('maps the first path param to --file/-f and an optional selector to its flag', () => {
    const code = buildArgsCode(reflectParams(function word(fileName, chars = null) {}));
    expect(code.objectParam).toBe(false);
    expect(code.options).toContain('.option("file", { alias: "f"');
    expect(code.options).toContain('.option("chars", { alias: "c"');
    expect(code.callExpr).toBe('argv["file"], argv["chars"]');
    expect(code.options).not.toContain('{,'); // no stray leading comma
  });

  it('emits a positional array command for an array param', () => {
    const code = buildArgsCode(reflectParams(function merge(files, lineBetween = 20) {}));
    expect(code.positional).toContain("command('$0 [files..]'");
    expect(code.callExpr).toContain('argv["files"] || []');
  });

  it('emits one --key option per object key and an options-object call', () => {
    const code = buildArgsCode(reflectParams(function run({ sourceFolder, maxLevel = 5 }) {}));
    expect(code.objectParam).toBe(true);
    expect(code.options).toContain('.option("sourceFolder"');
    expect(code.options).toContain('.option("maxLevel"');
    expect(code.callExpr).toContain('sourceFolder: argv["sourceFolder"]');
  });
});

describe('runnerSource', () => {
  it('produces a standalone script that imports the class and calls the method directly', () => {
    const src = runnerSource(
      'Homoglyph',
      'word',
      reflectParams(function word(fileName, chars = null) {})
    );
    expect(src).toContain("await import('../../utils/Homoglyph.js')");
    expect(src).toContain('Homoglyph.word(argv["file"], argv["chars"])');
    expect(src).toContain(
      "process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js')"
    );
    expect(src).not.toContain('_lib.mjs'); // no shared-engine delegation
    expect(src).toContain("Yamls.getConfig('CmdLine.TryCatch')");
  });

  it('does NOT re-import a helper that equals the target class (no duplicate const)', () => {
    const src = runnerSource(
      'Dates',
      'sleep',
      reflectParams(function sleep(ms) {})
    );
    // exactly one `const { Dates }` import line
    const datesImports = (src.match(/const \{ Dates \} = await import/g) || []).length;
    expect(datesImports).toBe(1);
  });
});

describe('publicStaticMethods', () => {
  it('lists public static methods, sorted, excluding _-prefixed and built-ins', () => {
    class C {
      static beta() {}
      static alpha() {}
      static _private() {}
    }
    expect(publicStaticMethods(C)).toEqual(['alpha', 'beta']);
  });
});

describe('generated runner files', () => {
  it('every emitted runs/<Class>/<method>.mjs parses as valid ESM (node --check)', () => {
    const classDirs = readdirSync(RUNS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(classDirs.length).toBeGreaterThan(0);

    let checked = 0;
    for (const cls of classDirs) {
      const dir = path.join(RUNS_DIR, cls);
      for (const file of readdirSync(dir).filter((f) => f.endsWith('.mjs'))) {
        execFileSync(process.execPath, ['--check', path.join(dir, file)]); // throws on syntax error
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(100); // ~304 runners (289 generated + 15 hand-written)
  });
});
