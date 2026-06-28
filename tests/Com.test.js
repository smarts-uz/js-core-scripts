// Unit tests for utils/Com.js — the shared Windows-COM robustness helpers used
// by Word / Excels / PowerPoints / Homoglyph.
//
// Com is pure JS (no winax import): the COM Application objects are passed in by
// the caller, so every method is tested directly with a hand-built fake app
// whose Open methods we steer (succeed / throw) and whose calls we record.
// pidsOf runs the real `tasklist`, so we only assert it returns a Set.
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import path from 'path';
import { Com } from '../utils/Com.js';

afterEach(() => jest.restoreAllMocks());

describe('Com.pidsOf', () => {
  it('returns a Set (reads tasklist for real; contents not asserted)', () => {
    const pids = Com.pidsOf('WINWORD.EXE');
    expect(pids).toBeInstanceOf(Set);
  });

  it('returns an empty Set for an image that is surely not running', () => {
    const pids = Com.pidsOf('NO_SUCH_IMAGE_XYZ.EXE');
    expect(pids).toBeInstanceOf(Set);
    expect(pids.size).toBe(0);
  });
});

describe('Com.killOrphans', () => {
  it('kills only PIDs not present in the before-set and returns the kill count', () => {
    // Pretend two images are "running now": 111 (was there before) and 222 (new).
    jest.spyOn(Com, 'pidsOf').mockReturnValue(new Set([111, 222]));
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    const killed = Com.killOrphans('WINWORD.EXE', new Set([111]));

    expect(killed).toBe(1);
    expect(killSpy).toHaveBeenCalledTimes(1);
    expect(killSpy).toHaveBeenCalledWith(222);
  });

  it('kills nothing when every running PID was already present before', () => {
    jest.spyOn(Com, 'pidsOf').mockReturnValue(new Set([5, 6]));
    const killSpy = jest.spyOn(process, 'kill').mockImplementation(() => true);

    const killed = Com.killOrphans('POWERPNT.EXE', new Set([5, 6]));

    expect(killed).toBe(0);
    expect(killSpy).not.toHaveBeenCalled();
  });

  it('counts a process.kill that throws as not-killed (best-effort, no crash)', () => {
    jest.spyOn(Com, 'pidsOf').mockReturnValue(new Set([999]));
    jest.spyOn(process, 'kill').mockImplementation(() => { throw new Error('ESRCH'); });

    const killed = Com.killOrphans('WINWORD.EXE', new Set());

    expect(killed).toBe(0);
  });
});

// --- a fake Word.Application whose Documents.Open we steer + record -----------
function makeWordApp(plan) {
  // plan: array of 'ok' | Error — consumed one per Open call.
  const calls = [];
  let i = 0;
  return {
    calls,
    Documents: {
      Open: (...args) => {
        calls.push(args);
        const step = plan[i++];
        if (step instanceof Error) throw step;
        return { __doc: true, openedWith: args };
      },
    },
  };
}

describe('Com.openWord', () => {
  it('returns the document on a plain open (3-arg form)', () => {
    const app = makeWordApp(['ok']);
    const doc = Com.openWord(app, 'x.docx');
    expect(doc.__doc).toBe(true);
    expect(app.calls).toHaveLength(1);
    expect(app.calls[0]).toHaveLength(3); // absPath, false, readOnly
    expect(app.calls[0][0]).toBe(path.resolve('x.docx'));
    expect(app.calls[0][2]).toBe(false); // readOnly default
  });

  it('passes readOnly through on the happy path', () => {
    const app = makeWordApp(['ok']);
    Com.openWord(app, 'x.docx', { readOnly: true });
    expect(app.calls[0][2]).toBe(true);
  });

  it('falls back to OpenAndRepair when the first open throws', () => {
    const app = makeWordApp([new Error('boom'), 'ok']);
    const doc = Com.openWord(app, 'x.docx');
    expect(doc.__doc).toBe(true);
    expect(app.calls).toHaveLength(2);
    // Repair call uses the long positional form ending in OpenAndRepair=true.
    const repairArgs = app.calls[1];
    expect(repairArgs[repairArgs.length - 1]).toBe(true);
  });

  it('throws a descriptive error when both opens fail', () => {
    const app = makeWordApp([new Error('boom'), new Error('still boom')]);
    expect(() => Com.openWord(app, 'x.docx')).toThrow(/Com\.openWord: Unable to open/);
  });
});

// --- a fake PowerPoint.Application -------------------------------------------
function makePptApp(plan) {
  const calls = [];
  let i = 0;
  return {
    calls,
    Presentations: {
      Open: (...args) => {
        calls.push(args);
        const step = plan[i++];
        if (step instanceof Error) throw step;
        return { __pres: true, openedWith: args };
      },
    },
  };
}

describe('Com.openPresentation', () => {
  it('opens window-less, read-only=0 by default', () => {
    const app = makePptApp(['ok']);
    const pres = Com.openPresentation(app, 'd.pptx');
    expect(pres.__pres).toBe(true);
    // Open(absPath, ReadOnly, Untitled, WithWindow)
    expect(app.calls[0]).toEqual([path.resolve('d.pptx'), 0, 0, 0]);
  });

  it('passes msoTrue (-1) when readOnly is requested', () => {
    const app = makePptApp(['ok']);
    Com.openPresentation(app, 'd.pptx', { readOnly: true });
    expect(app.calls[0][1]).toBe(-1);
  });

  it('falls back to a read-only open when the first open throws', () => {
    const app = makePptApp([new Error('locked'), 'ok']);
    const pres = Com.openPresentation(app, 'd.pptx');
    expect(pres.__pres).toBe(true);
    expect(app.calls).toHaveLength(2);
    expect(app.calls[1][1]).toBe(-1); // read-only retry
  });

  it('throws when both opens fail', () => {
    const app = makePptApp([new Error('locked'), new Error('dead')]);
    expect(() => Com.openPresentation(app, 'd.pptx')).toThrow(/Com\.openPresentation: Unable to open/);
  });
});

// --- a fake Excel.Application -------------------------------------------------
function makeExcelApp(plan) {
  const calls = [];
  let i = 0;
  return {
    calls,
    Workbooks: {
      Open: (...args) => {
        calls.push(args);
        const step = plan[i++];
        if (step instanceof Error) throw step;
        return { __wb: true, openedWith: args };
      },
    },
  };
}

describe('Com.openWorkbook', () => {
  it('opens with the short 3-arg form on the happy path', () => {
    const app = makeExcelApp(['ok']);
    const wb = Com.openWorkbook(app, 'b.xlsx');
    expect(wb.__wb).toBe(true);
    expect(app.calls[0]).toHaveLength(3); // absPath, updateLinks, readOnly
    expect(app.calls[0][0]).toBe(path.resolve('b.xlsx'));
  });

  it('falls back to CorruptLoad=1 (repair) when the plain open throws', () => {
    const app = makeExcelApp([new Error('bad'), 'ok']);
    const wb = Com.openWorkbook(app, 'b.xlsx');
    expect(wb.__wb).toBe(true);
    expect(app.calls).toHaveLength(2);
    // repair call: long form, last positional is CorruptLoad=1
    expect(app.calls[1][app.calls[1].length - 1]).toBe(1);
  });

  it('falls back to CorruptLoad=2 (extract-data) when repair also throws', () => {
    const app = makeExcelApp([new Error('bad'), new Error('worse'), 'ok']);
    const wb = Com.openWorkbook(app, 'b.xlsx');
    expect(wb.__wb).toBe(true);
    expect(app.calls).toHaveLength(3);
    expect(app.calls[2][app.calls[2].length - 1]).toBe(2);
  });

  it('throws when plain + repair + extract-data all fail', () => {
    const app = makeExcelApp([new Error('a'), new Error('b'), new Error('c')]);
    expect(() => Com.openWorkbook(app, 'b.xlsx')).toThrow(/Com\.openWorkbook: Unable to open/);
  });
});
