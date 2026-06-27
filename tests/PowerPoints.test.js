// Unit tests for utils/PowerPoints.js — public methods checkWinax,
// getProtectedPath, protectFile, unProtectFile, protectFileAsk,
// unProtectFileAsk.
//
// Pattern (native boundary): PowerPoints drives PowerPoint via the winax COM
// bridge (`new winax.Object('PowerPoint.Application')`), prompts through Dialogs
// and reads suffixes via Yamls. We mock those boundaries with
// jest.unstable_mockModule BEFORE importing the class, let real fs run against a
// throwaway temp dir, and assert the documented COM call chain
// (Presentations.Open / SaveAs / Save / Close / password set) plus the
// missing-file / already-protected / not-protected / cancel
// branches.
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

const YamlsMock = {
  getConfig: jest.fn((key, _type, def) => def),
  setConfig: jest.fn(),
};

jest.unstable_mockModule('winax', () => winaxMock);
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
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
