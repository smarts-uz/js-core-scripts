// Unit tests for utils/PowerPoints.js — public methods checkWinax, homoglyph,
// getProtectedPath, protectFile, unProtectFile, protectFileAsk,
// unProtectFileAsk, homoglyphAsk.
//
// Pattern (native boundary): PowerPoints drives PowerPoint via the winax COM
// bridge (`new winax.Object('PowerPoint.Application')`), prompts through Dialogs
// and reads suffixes via Yamls. We mock those boundaries with
// jest.unstable_mockModule BEFORE importing the class, let real fs run against a
// throwaway temp dir, and assert the documented COM call chain
// (Presentations.Open / SaveAs / Save / Close / password set) plus the
// missing-file / empty-map / already-protected / not-protected / cancel
// branches. Word.buildHomoglyphMap is mocked to a small deterministic map so we
// do not pull Word's own native deps.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- boundary mocks ----------------------------------------------------------

// A hand-built PowerPoint COM stand-in we can fully observe and steer per test.
// `state` lets each test pin the values the source reads back (Password,
// Slides.Count, the per-slide shape text) and records every COM method call.
const state = {
  password: '', // value reported by presentation.Password
  slideText: [], // slideText[slideIndex0][shapeIndex0] = string (homoglyph)
  openThrows: null, // if set, Presentations.Open throws this
};

let comLog; // ordered list of {op, args} recorded across the COM session

function makePresentation() {
  // Build a presentation object mirroring the members PowerPoints.js touches.
  const slidesArr = state.slideText.map((shapeTexts) => {
    const shapesArr = shapeTexts.map((txt) => {
      const textRange = {
        get Text() { return this._t; },
        set Text(v) { this._t = v; comLog.push({ op: 'setShapeText', args: [v] }); },
        _t: txt,
      };
      return {
        HasTextFrame: true,
        TextFrame: { HasText: txt.length > 0, TextRange: textRange },
      };
    });
    // slide.Shapes is callable (Shapes(sh)) AND carries a numeric .Count
    const shapesFn = (i) => shapesArr[i - 1];
    shapesFn.Count = shapesArr.length;
    return { Shapes: shapesFn };
  });

  const slidesFn = (i) => slidesArr[i - 1];
  slidesFn.Count = slidesArr.length;

  const presentation = {
    Slides: slidesFn,
    get Password() { return this._password; },
    set Password(v) { this._password = v; comLog.push({ op: 'setPassword', args: [v] }); },
    _password: state.password,
    set WritePassword(v) { comLog.push({ op: 'setWritePassword', args: [v] }); },
    Save: jest.fn(() => comLog.push({ op: 'Save', args: [] })),
    SaveAs: jest.fn((p) => comLog.push({ op: 'SaveAs', args: [p] })),
    Close: jest.fn(() => comLog.push({ op: 'Close', args: [] })),
  };
  return presentation;
}

function makePptApp() {
  return {
    Presentations: {
      Open: jest.fn((...args) => {
        comLog.push({ op: 'Open', args });
        if (state.openThrows) throw state.openThrows;
        return makePresentation();
      }),
    },
    Quit: jest.fn(() => comLog.push({ op: 'Quit', args: [] })),
  };
}

const winaxObject = jest.fn(() => makePptApp());
const winaxRelease = jest.fn();
const winaxMock = { default: { Object: winaxObject, release: winaxRelease }, Object: winaxObject, release: winaxRelease };

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
  inputBox: jest.fn(),
};

// Real-ish Files.incrementFileName so suffix/auto-increment logic is exercised.
const FilesMock = {
  incrementFileName: (filePath) => {
    if (!fs.existsSync(filePath)) return filePath;
    const parsed = path.parse(filePath);
    let base = parsed.name;
    let counter = 1;
    const m = base.match(/^(.*?)\s+(\d+)$/);
    if (m) { base = m[1]; counter = parseInt(m[2], 10); }
    let np = filePath;
    while (fs.existsSync(np)) {
      np = path.join(parsed.dir, `${base} ${counter}${parsed.ext}`);
      counter++;
    }
    return np;
  },
};

// Deterministic, tiny homoglyph map: Latin S/T/y -> Cyrillic look-alikes.
const HOMOGLYPH = { S: 'Ѕ', T: 'Т', y: 'у' };
const WordMock = {
  buildHomoglyphMap: jest.fn((chars = null) => {
    if (chars === null) return { ...HOMOGLYPH };
    const out = {};
    for (const ch of String(chars).split('')) if (ch in HOMOGLYPH) out[ch] = HOMOGLYPH[ch];
    return out;
  }),
};

const YamlsMock = {
  getConfig: jest.fn((key, _type, def) => def),
  setConfig: jest.fn(),
};

jest.unstable_mockModule('winax', () => winaxMock);
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Word.js'), () => ({ Word: WordMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { PowerPoints } = await import('../utils/PowerPoints.js');

let workDir;

beforeEach(() => {
  workDir = makeTmpDir('ppt-test-');
  comLog = [];
  state.password = '';
  state.slideText = [];
  state.openThrows = null;
  YamlsMock.getConfig.mockImplementation((key, _type, def) => def);
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

/** Create a fake .pptx file in workDir and return its absolute path. */
function makePptx(name = 'deck.pptx', content = 'binary') {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

const ops = () => comLog.map((c) => c.op);

describe('PowerPoints.checkWinax', () => {
  it('does not throw when winax is available (it is mocked)', () => {
    expect(() => PowerPoints.checkWinax('PowerPoints.test')).not.toThrow();
  });
});

describe('PowerPoints.getProtectedPath', () => {
  it('appends the default " Protected" suffix before the extension', () => {
    const out = PowerPoints.getProtectedPath(path.join(workDir, 'deck.pptx'));
    expect(out).toBe(path.join(workDir, 'deck Protected.pptx'));
  });

  it('honors a configured ProtectSuffix from Yamls', () => {
    YamlsMock.getConfig.mockImplementation((key, _t, def) =>
      key === 'PowerPoint.ProtectSuffix' ? ' Secured' : def);
    const out = PowerPoints.getProtectedPath(path.join(workDir, 'deck.pptx'));
    expect(out).toBe(path.join(workDir, 'deck Secured.pptx'));
  });

  it('returns the original path when the stem already contains the suffix', () => {
    const input = path.join(workDir, 'deck Protected.pptx');
    expect(PowerPoints.getProtectedPath(input)).toBe(path.resolve(input));
  });

  it('auto-increments when the target path already exists on disk', () => {
    fs.writeFileSync(path.join(workDir, 'deck Protected.pptx'), 'x', 'utf8');
    const out = PowerPoints.getProtectedPath(path.join(workDir, 'deck.pptx'));
    expect(out).toBe(path.join(workDir, 'deck Protected 1.pptx'));
  });

  it('returns an absolute, resolved path', () => {
    const out = PowerPoints.getProtectedPath('deck.pptx');
    expect(path.isAbsolute(out)).toBe(true);
  });
});

describe('PowerPoints.homoglyph', () => {
  it('warns and returns undefined when the file does not exist', () => {
    const out = PowerPoints.homoglyph(path.join(workDir, 'missing.pptx'));
    expect(out).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('returns undefined without touching COM when the replace map is empty', () => {
    const file = makePptx();
    WordMock.buildHomoglyphMap.mockReturnValueOnce({});
    const out = PowerPoints.homoglyph(file, 'zzz');
    expect(out).toBeUndefined();
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('copies to a " Norm" output, rewrites mapped shape text, saves and returns the new path', () => {
    const file = makePptx();
    // one slide, one shape whose text contains mapped Latin chars
    state.slideText = [['STy data']];

    const out = PowerPoints.homoglyph(file);

    expect(out).toBe(path.join(workDir, 'deck Norm.pptx'));
    expect(fs.existsSync(out)).toBe(true); // copy made before COM
    expect(winaxObject).toHaveBeenCalledWith('PowerPoint.Application');
    expect(comLog.find((c) => c.op === 'Open').args[0]).toBe(out);
    // the only shape's text was rewritten to the homoglyph form
    const setText = comLog.find((c) => c.op === 'setShapeText');
    expect(setText.args[0]).toBe('ЅТу data');
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'setShapeText', 'Save', 'Close', 'Quit']));
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('honors a configured HomoglyphSuffix', () => {
    const file = makePptx();
    state.slideText = [['T']];
    YamlsMock.getConfig.mockImplementation((key, _t, def) =>
      key === 'PowerPoint.HomoglyphSuffix' ? ' Cyr' : def);

    const out = PowerPoints.homoglyph(file);
    expect(out).toBe(path.join(workDir, 'deck Cyr.pptx'));
  });

  it('does not rewrite a shape whose text has no mapped characters', () => {
    const file = makePptx();
    state.slideText = [['no mapped letters here: bdfg']];
    PowerPoints.homoglyph(file);
    expect(comLog.find((c) => c.op === 'setShapeText')).toBeUndefined();
    // Save/Close still happen
    expect(ops()).toEqual(expect.arrayContaining(['Save', 'Close']));
  });

  it('passes only the requested chars to buildHomoglyphMap', () => {
    const file = makePptx();
    state.slideText = [['Ty']];
    PowerPoints.homoglyph(file, 'Ty');
    expect(WordMock.buildHomoglyphMap).toHaveBeenCalledWith('Ty');
  });

  it('warns and still quits/releases when a COM error is thrown mid-run', () => {
    const file = makePptx();
    state.openThrows = new Error('COM boom');

    const out = PowerPoints.homoglyph(file);
    expect(out).toBeUndefined();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('COM boom'),
      'Error',
    );
    // finally block always runs
    expect(ops()).toEqual(expect.arrayContaining(['Quit']));
    expect(winaxRelease).toHaveBeenCalled();
  });

  it('throws when winax is unavailable — documented via checkWinax (cannot trigger with mock present)', () => {
    // winax is mocked as present here, so checkWinax passes; this asserts the
    // happy path reached COM construction, confirming checkWinax did not throw.
    const file = makePptx();
    state.slideText = [['T']];
    PowerPoints.homoglyph(file);
    expect(winaxObject).toHaveBeenCalledWith('PowerPoint.Application');
  });
});

describe('PowerPoints.protectFile', () => {
  it('throws when the source file does not exist', () => {
    expect(() => PowerPoints.protectFile(path.join(workDir, 'gone.pptx'), 'pw'))
      .toThrow(/File not found/);
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('sets the open-password, SaveAs the protected path, closes and returns it', () => {
    const file = makePptx();
    state.password = ''; // not yet protected

    const out = PowerPoints.protectFile(file, 'secret');

    expect(out).toBe(path.join(workDir, 'deck Protected.pptx'));
    expect(winaxObject).toHaveBeenCalledWith('PowerPoint.Application');
    expect(comLog.find((c) => c.op === 'Open').args[0]).toBe(path.resolve(file));
    expect(comLog.find((c) => c.op === 'setPassword').args[0]).toBe('secret');
    expect(comLog.find((c) => c.op === 'SaveAs').args[0]).toBe(out);
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'setPassword', 'SaveAs', 'Close', 'Quit']));
    // no write-password set when not provided
    expect(comLog.find((c) => c.op === 'setWritePassword')).toBeUndefined();
  });

  it('also sets the write-password when one is provided', () => {
    const file = makePptx();
    PowerPoints.protectFile(file, 'secret', 'editpw');
    expect(comLog.find((c) => c.op === 'setWritePassword').args[0]).toBe('editpw');
  });

  it('skips and returns the original path when already password-protected', () => {
    const file = makePptx();
    state.password = 'alreadyset';

    const out = PowerPoints.protectFile(file, 'secret');

    expect(out).toBe(path.resolve(file));
    expect(comLog.find((c) => c.op === 'SaveAs')).toBeUndefined();
    expect(comLog.find((c) => c.op === 'setPassword')).toBeUndefined();
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'Close', 'Quit']));
  });

  it('wraps a COM failure in a PowerPoints.protectFile error and still quits', () => {
    const file = makePptx();
    state.openThrows = new Error('open denied');
    expect(() => PowerPoints.protectFile(file, 'pw'))
      .toThrow(/PowerPoints\.protectFile failed: open denied/);
    expect(ops()).toEqual(expect.arrayContaining(['Quit']));
    expect(winaxRelease).toHaveBeenCalled();
  });
});

describe('PowerPoints.unProtectFile', () => {
  it('throws when the source file does not exist', () => {
    expect(() => PowerPoints.unProtectFile(path.join(workDir, 'gone.pptx'), 'pw'))
      .toThrow(/File not found/);
  });

  it('clears both passwords, saves in place and closes when protected', () => {
    const file = makePptx();
    state.password = 'secret';

    PowerPoints.unProtectFile(file, 'secret');

    expect(comLog.find((c) => c.op === 'Open').args[0]).toBe(path.resolve(file));
    // password and write-password both cleared to ''
    const pwSets = comLog.filter((c) => c.op === 'setPassword').map((c) => c.args[0]);
    expect(pwSets).toContain('');
    expect(comLog.find((c) => c.op === 'setWritePassword').args[0]).toBe('');
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'Save', 'Close', 'Quit']));
  });

  it('warns and skips saving when the file is not protected', () => {
    const file = makePptx();
    state.password = '';

    PowerPoints.unProtectFile(file, 'secret');

    expect(DialogsMock.warningBox).toHaveBeenCalledWith('File is not protected', 'Unprotect Presentation');
    expect(comLog.find((c) => c.op === 'Save')).toBeUndefined();
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'Close', 'Quit']));
  });

  it('wraps a COM failure in a PowerPoints.unProtectFile error', () => {
    const file = makePptx();
    state.openThrows = new Error('locked');
    expect(() => PowerPoints.unProtectFile(file, 'pw'))
      .toThrow(/PowerPoints\.unProtectFile failed: locked/);
    expect(ops()).toEqual(expect.arrayContaining(['Quit']));
  });
});

describe('PowerPoints.protectFileAsk', () => {
  it('prompts for a password and delegates to protectFile', () => {
    const file = makePptx();
    DialogsMock.inputBox.mockReturnValue('typed-pw');

    const out = PowerPoints.protectFileAsk(file);

    expect(DialogsMock.inputBox).toHaveBeenCalledWith(
      'Enter open-password to protect the presentation:',
      'Protect Presentation',
    );
    expect(out).toBe(path.join(workDir, 'deck Protected.pptx'));
    expect(comLog.find((c) => c.op === 'setPassword').args[0]).toBe('typed-pw');
  });

  it('aborts and returns undefined when the prompt is cancelled (null)', () => {
    const file = makePptx();
    DialogsMock.inputBox.mockReturnValue(null);

    const out = PowerPoints.protectFileAsk(file);

    expect(out).toBeUndefined();
    expect(winaxObject).not.toHaveBeenCalled();
  });
});

describe('PowerPoints.unProtectFileAsk', () => {
  it('prompts for a password and delegates to unProtectFile', () => {
    const file = makePptx();
    state.password = 'secret';
    DialogsMock.inputBox.mockReturnValue('secret');

    const out = PowerPoints.unProtectFileAsk(file);

    expect(DialogsMock.inputBox).toHaveBeenCalledWith(
      'Enter open-password to unprotect the presentation:',
      'Unprotect Presentation',
    );
    // unProtectFile returns nothing; ask returns undefined
    expect(out).toBeUndefined();
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'Save', 'Close']));
  });

  it('aborts when the prompt is cancelled (null)', () => {
    const file = makePptx();
    DialogsMock.inputBox.mockReturnValue(null);

    PowerPoints.unProtectFileAsk(file);

    expect(winaxObject).not.toHaveBeenCalled();
  });
});

describe('PowerPoints.homoglyphAsk', () => {
  it('seeds the prompt with all map keys, filters the selection, persists it and runs homoglyph', () => {
    const file = makePptx();
    state.slideText = [['STy']];
    // user keeps "Ty" and (ignored) adds a bogus 'Z'
    DialogsMock.inputBox.mockReturnValue('TyZ');

    const out = PowerPoints.homoglyphAsk(file);

    // default offered = all keys joined
    expect(DialogsMock.inputBox).toHaveBeenCalledWith(
      'Leave only the characters you want to replace (adding new symbols is prohibited):',
      'Select Homoglyph Characters',
      'STy',
    );
    // bogus char filtered out before persist + homoglyph
    expect(YamlsMock.setConfig).toHaveBeenCalledWith('ChoosedChars.PowerPoint', 'Ty');
    expect(WordMock.buildHomoglyphMap).toHaveBeenCalledWith('Ty');
    expect(out).toBe(path.join(workDir, 'deck Norm.pptx'));
  });

  it('uses a configured default char set when present', () => {
    const file = makePptx();
    state.slideText = [['T']];
    YamlsMock.getConfig.mockImplementation((key, _t, def) =>
      key === 'ChoosedChars.PowerPoint' ? 'T' : def);
    DialogsMock.inputBox.mockReturnValue('T');

    PowerPoints.homoglyphAsk(file);
    expect(DialogsMock.inputBox).toHaveBeenCalledWith(
      expect.any(String), expect.any(String), 'T',
    );
  });

  it('aborts and returns undefined when the prompt is cancelled (null)', () => {
    const file = makePptx();
    DialogsMock.inputBox.mockReturnValue(null);

    const out = PowerPoints.homoglyphAsk(file);

    expect(out).toBeUndefined();
    expect(YamlsMock.setConfig).not.toHaveBeenCalled();
    expect(winaxObject).not.toHaveBeenCalled();
  });
});
