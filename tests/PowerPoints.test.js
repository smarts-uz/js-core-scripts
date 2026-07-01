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
        get Text() {
          return this._t;
        },
        set Text(v) {
          this._t = v;
          comLog.push({ op: 'setShapeText', args: [v] });
        },
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
  // InsertFromFile(FileName, Index, SlideStart, SlideEnd): records the call and
  // grows the target's slide count by (SlideEnd - SlideStart + 1), mirroring how
  // PowerPoint appends the source slides onto the merged base.
  slidesFn.InsertFromFile = jest.fn((file, index, start, end) => {
    comLog.push({ op: 'InsertFromFile', args: [file, index, start, end] });
    slidesFn.Count += end - start + 1;
  });

  const presentation = {
    Slides: slidesFn,
    get Password() {
      return this._password;
    },
    set Password(v) {
      this._password = v;
      comLog.push({ op: 'setPassword', args: [v] });
    },
    _password: state.password,
    set WritePassword(v) {
      comLog.push({ op: 'setWritePassword', args: [v] });
    },
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
const winaxMock = {
  default: { Object: winaxObject, release: winaxRelease },
  Object: winaxObject,
  release: winaxRelease,
};

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
    if (m) {
      base = m[1];
      counter = parseInt(m[2], 10);
    }
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
      key === 'PowerPoint.ProtectSuffix' ? ' Secured' : def
    );
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
    expect(() => PowerPoints.protectFile(path.join(workDir, 'gone.pptx'), 'pw')).toThrow(
      /File not found/
    );
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
    expect(ops()).toEqual(
      expect.arrayContaining(['Open', 'setPassword', 'SaveAs', 'Close', 'Quit'])
    );
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
    // Open now flows through _safeOpen, which retries read-only and, on a second
    // failure, wraps the cause ("…Last error: open denied"); protectFile then
    // wraps that. Both prefixes and the original message are still present.
    expect(() => PowerPoints.protectFile(file, 'pw')).toThrow(
      /PowerPoints\.protectFile failed: .*open denied/
    );
    expect(ops()).toEqual(expect.arrayContaining(['Quit']));
    expect(winaxRelease).toHaveBeenCalled();
  });
});

describe('PowerPoints.unProtectFile', () => {
  it('throws when the source file does not exist', () => {
    expect(() => PowerPoints.unProtectFile(path.join(workDir, 'gone.pptx'), 'pw')).toThrow(
      /File not found/
    );
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

    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      'File is not protected',
      'Unprotect Presentation'
    );
    expect(comLog.find((c) => c.op === 'Save')).toBeUndefined();
    expect(ops()).toEqual(expect.arrayContaining(['Open', 'Close', 'Quit']));
  });

  it('wraps a COM failure in a PowerPoints.unProtectFile error', () => {
    const file = makePptx();
    state.openThrows = new Error('locked');
    // Open flows through _safeOpen (retry → wrap), then unProtectFile wraps that.
    expect(() => PowerPoints.unProtectFile(file, 'pw')).toThrow(
      /PowerPoints\.unProtectFile failed: .*locked/
    );
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
      'Protect Presentation'
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
      'Unprotect Presentation'
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

describe('PowerPoints.merge', () => {
  it('throws when no files are provided', () => {
    expect(() => PowerPoints.merge([])).toThrow(/No files provided/);
    expect(winaxObject).not.toHaveBeenCalled();
  });

  it('throws when the first (base) file does not exist', () => {
    expect(() => PowerPoints.merge([path.join(workDir, 'gone.pptx'), makePptx('b.pptx')])).toThrow(
      /First file not found/
    );
  });

  it('merges 2 files: copies the base, inserts the source slides, saves and closes', () => {
    // Each opened presentation (base + source) reports 3 slides via state.slideText.
    state.slideText = [['a'], ['b'], ['c']];
    const base = makePptx('a.pptx');
    const source = makePptx('b.pptx');

    const out = PowerPoints.merge([base, source]);

    // Output path is beside the first file, ends with .pptx, and was created.
    expect(out.endsWith('.pptx')).toBe(true);
    expect(path.dirname(out)).toBe(workDir);
    expect(fs.existsSync(out)).toBe(true);

    // Base was copied to the merged output path.
    expect(fs.readFileSync(out, 'utf8')).toBe(fs.readFileSync(base, 'utf8'));

    // The source was opened read-only to read its slide count, then inserted once.
    const inserts = comLog.filter((c) => c.op === 'InsertFromFile');
    expect(inserts).toHaveLength(1);
    // InsertFromFile(sourceFile, insertAt=baseCount(3), SlideStart=1, SlideEnd=sourceCount(3))
    expect(inserts[0].args).toEqual([path.resolve(source), 3, 1, 3]);

    // Save + Close on the target, and the COM app quit.
    expect(ops()).toEqual(
      expect.arrayContaining(['Open', 'InsertFromFile', 'Save', 'Close', 'Quit'])
    );
  });

  it('honors an explicit mergedName (appending .pptx and writing beside the base)', () => {
    state.slideText = [['a'], ['b']];
    const base = makePptx('a.pptx');
    const source = makePptx('b.pptx');

    const out = PowerPoints.merge([base, source], 'Combined');

    expect(path.basename(out)).toBe('Combined.pptx');
    expect(path.dirname(out)).toBe(workDir);
    expect(fs.existsSync(out)).toBe(true);
  });

  it('auto-increments the output name when the target already exists', () => {
    state.slideText = [['a'], ['b']];
    const base = makePptx('a.pptx');
    const source = makePptx('b.pptx');
    // Pre-create the would-be output so incrementFileName must bump it.
    fs.writeFileSync(path.join(workDir, 'Combined.pptx'), 'existing', 'utf8');

    const out = PowerPoints.merge([base, source], 'Combined');

    expect(path.basename(out)).toBe('Combined 1.pptx');
    expect(fs.existsSync(out)).toBe(true);
  });
});

describe('PowerPoints.mergeFolder', () => {
  it('throws when no folders are provided', () => {
    expect(() => PowerPoints.mergeFolder([])).toThrow(/No folders provided/);
  });

  it('throws when no .pptx exists across the provided folders', () => {
    const empty = path.join(workDir, 'empty');
    fs.mkdirSync(empty, { recursive: true });
    // A non-pptx file present — still no .pptx found.
    fs.writeFileSync(path.join(empty, 'notes.txt'), 'x', 'utf8');
    expect(() => PowerPoints.mergeFolder([empty])).toThrow(/No \.pptx files found/);
  });

  it('picks the latest .pptx by mtime from each folder and delegates to merge', () => {
    state.slideText = [['a'], ['b']];

    const folderA = path.join(workDir, 'A');
    const folderB = path.join(workDir, 'B');
    fs.mkdirSync(folderA, { recursive: true });
    fs.mkdirSync(folderB, { recursive: true });

    // Folder A: an older and a newer .pptx + a ~$ temp file to be ignored.
    const oldA = path.join(folderA, 'old.pptx');
    const newA = path.join(folderA, 'new.pptx');
    const tempA = path.join(folderA, '~$new.pptx');
    fs.writeFileSync(oldA, 'old-a', 'utf8');
    fs.writeFileSync(newA, 'new-a', 'utf8');
    fs.writeFileSync(tempA, 'temp', 'utf8');
    // Make oldA older and tempA newest — tempA must still be skipped.
    fs.utimesSync(oldA, new Date(Date.now() - 20000) / 1000, new Date(Date.now() - 20000) / 1000);
    fs.utimesSync(newA, new Date(Date.now() - 10000) / 1000, new Date(Date.now() - 10000) / 1000);
    fs.utimesSync(tempA, new Date() / 1000, new Date() / 1000);

    // Folder B: a single .pptx (the base for the second slot).
    const onlyB = path.join(folderB, 'deck.pptx');
    fs.writeFileSync(onlyB, 'b', 'utf8');

    const out = PowerPoints.mergeFolder([folderA, folderB]);

    // newA (latest non-temp in A) is the base; onlyB is the source inserted once.
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe('new-a');
    const inserts = comLog.filter((c) => c.op === 'InsertFromFile');
    expect(inserts).toHaveLength(1);
    expect(inserts[0].args[0]).toBe(path.resolve(onlyB));
    expect(ops()).toEqual(
      expect.arrayContaining(['Open', 'InsertFromFile', 'Save', 'Close', 'Quit'])
    );
  });
});
