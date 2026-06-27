// Unit tests for utils/Homoglyph.js — every public (non-_) static method:
//   markdown, markdownAsk, word, wordAsk, excel, excelAsk, powerpoint,
//   powerpointAsk.
//
// Strategy: `markdown` is plain UTF-8 text (no COM) and is tested FOR REAL
// against throwaway temp dirs — the genuine read→regex→write path, including the
// PERFECT_STEALTH Latin→Cyrillic map and the `chars` subset filter. The COM
// formats (word/excel/powerpoint) require winax; we do not drive a real Word/
// Excel/PowerPoint instance, we exercise their reachable NON-COM branches:
//   • missing source file  → _resolveSource warns + returns undefined
//   • winax unavailable     → _checkWinax throws (mocked absent)
// The interactive *Ask variants are driven by mocking Dialogs.inputBox (the only
// UI boundary) and asserting the char-filter + persistence (Yamls.setConfig).
//
// Mocked boundaries: Files (getBaseName/incrementFileName — real-ish on temp
// dirs), Yamls (getConfig/setConfig — in-memory config), Dialogs (UI). The
// `winax` package is mocked ABSENT so _checkWinax takes its throw branch
// deterministically regardless of whether the native binary is built locally.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, read } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- mocked boundaries -------------------------------------------------------
// winax absent → the COM guard (_checkWinax) throws deterministically.
jest.unstable_mockModule('winax', () => {
  throw new Error('winax unavailable (mocked)');
});

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
  inputBox: jest.fn(),
};

// Config-backed Yamls stub: getConfig returns the suffix/choosed-chars values we
// seed; setConfig records the persisted choice so *Ask persistence is asserted.
const state = { config: {} };
const YamlsMock = {
  getConfig: jest.fn((key, _type, def) => (key in state.config ? state.config[key] : def)),
  setConfig: jest.fn((key, value) => {
    state.config[key] = value;
  }),
};

// Real-ish Files stub: the two helpers Homoglyph._resolveOutputPath calls.
const FilesMock = {
  getBaseName: (p, ext) => path.basename(p, ext),
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
};

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));

const { Homoglyph } = await import('../utils/Homoglyph.js');

let workDir;
beforeEach(() => {
  workDir = makeTmpDir('homoglyph-');
  state.config = {
    'Markdown.HomoglyphSuffix': ' App',
    'Word.HomoglyphSuffix': ' App',
    'Excel.HomoglyphSuffix': ' Norm',
    'PowerPoint.HomoglyphSuffix': ' App',
  };
});
afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

/** Write a source .md and return its absolute path. */
function writeMd(name, content) {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

// ---------------------------------------------------------------------------
describe('Homoglyph.markdown', () => {
  it('replaces all mapped Latin chars with Cyrillic homoglyphs and writes the suffixed output', () => {
    const src = writeMd('doc.md', 'Test ACEHO ace ox');
    const out = Homoglyph.markdown(src);

    // output path = "<base><suffix><ext>" with the configured ' App' suffix
    expect(out).toBe(path.join(workDir, 'doc App.md'));
    expect(fs.existsSync(out)).toBe(true);

    // Each MAPPED char is swapped to its Cyrillic twin; chars with no entry in
    // PERFECT_STEALTH stay Latin. Note lowercase 's' and 't' are NOT in the map,
    // so "Test" → "Теst" (only T→Т, e→е) — this documents the real map coverage.
    const result = read(workDir, 'doc App.md');
    expect(result).toBe('Теst АСЕНО асе ох');
    // the source file is left untouched (it copies/writes to a new file)
    expect(read(workDir, 'doc.md')).toBe('Test ACEHO ace ox');
  });

  it('honors a `chars` subset — only the requested characters are replaced', () => {
    const src = writeMd('subset.md', 'AaEe');
    const out = Homoglyph.markdown(src, 'A'); // only uppercase A
    const result = fs.readFileSync(out, 'utf8');
    // 'A' → Cyrillic 'А'; the others (a, E, e) stay Latin
    expect(result).toBe('Аa' + 'Ee');
    expect(result.charCodeAt(0)).toBe('А'.charCodeAt(0)); // Cyrillic
    expect(result.charCodeAt(1)).toBe('a'.charCodeAt(0)); // Latin, untouched
  });

  it('leaves characters with no mapping unchanged', () => {
    const src = writeMd('nomap.md', 'Bb Dd 123 !?');
    const out = Homoglyph.markdown(src);
    // none of B,b,D,d,digits,punctuation are in PERFECT_STEALTH
    expect(fs.readFileSync(out, 'utf8')).toBe('Bb Dd 123 !?');
  });

  it('auto-increments the output path when the suffixed file already exists', () => {
    const src = writeMd('dup.md', 'A');
    fs.writeFileSync(path.join(workDir, 'dup App.md'), 'existing', 'utf8');
    const out = Homoglyph.markdown(src);
    expect(out).toBe(path.join(workDir, 'dup App 1.md'));
    expect(read(workDir, 'dup App.md')).toBe('existing'); // not clobbered
  });

  it('warns and returns undefined when the source file does not exist', () => {
    const out = Homoglyph.markdown(path.join(workDir, 'missing.md'));
    expect(out).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns undefined (nothing to do) when `chars` contains no mappable characters', () => {
    const src = writeMd('empty.md', 'Bb');
    const out = Homoglyph.markdown(src, 'BbZ'); // none of B,b,Z are mapped
    expect(out).toBeUndefined();
  });
});

describe('Homoglyph.markdownAsk', () => {
  it('prompts pre-filled with the persisted chars, filters, persists, and applies', () => {
    state.config['ChoosedChars.Markdown'] = 'Aa'; // persisted default
    const src = writeMd('ask.md', 'AaEe');
    // user keeps "Aa" but also types an unmappable "Z" — Z must be filtered out
    DialogsMock.inputBox.mockReturnValue('AaZ');

    const out = Homoglyph.markdownAsk(src);

    // the prompt was pre-filled from the persisted choice
    expect(DialogsMock.inputBox).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      'Aa'
    );
    // only the valid chars (Aa) are persisted back
    expect(YamlsMock.setConfig).toHaveBeenCalledWith('ChoosedChars.Markdown', 'Aa');
    // and applied: A→А, a→а; E,e stay Latin
    expect(fs.readFileSync(out, 'utf8')).toBe('Аа' + 'Ee');
  });

  it('returns undefined and does nothing when the user cancels the dialog', () => {
    const src = writeMd('cancel.md', 'A');
    DialogsMock.inputBox.mockReturnValue(null); // cancelled

    const out = Homoglyph.markdownAsk(src);
    expect(out).toBeUndefined();
    expect(YamlsMock.setConfig).not.toHaveBeenCalled();
  });
});

// --- COM formats: only the reachable non-COM branches are exercised ----------
describe.each([
  ['word', 'Word'],
  ['excel', 'Excel'],
  ['powerpoint', 'PowerPoint'],
])('Homoglyph.%s (COM guard)', (method) => {
  it('throws because winax (native automation) is unavailable', () => {
    // _checkWinax runs first, before any file work — winax is mocked absent.
    expect(() => Homoglyph[method](path.join(workDir, 'x.docx'))).toThrow(/winax/i);
  });
});
