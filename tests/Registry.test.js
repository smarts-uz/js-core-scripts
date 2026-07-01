// Unit tests for utils/Registry.js — public method clean, plus helpers _parseQuery
// and _stamp.
//
// Registry.clean no longer uses PowerShell (whose UTF-16 stdout leaked garbled
// text). It shells out to the plain `reg.exe` CLI via child_process.execFileSync
// and does the token-cleaning in Node. We mock execFileSync (asserting the reg
// query/add/export/broadcast calls and steering their output), Dialogs (UI),
// Yamls (config), Files (isEmpty) and node:fs (backup dir + directory-exists
// checks), and steer process.platform per test.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { utilsModule } from './helpers/esm.js';

const execFileSync = jest.fn();

const DialogsMock = {
  warningBox: jest.fn(),
  messageBox: jest.fn(),
};

// Minimal real isEmpty (mirrors Files.isEmpty for the values clean() passes).
const FilesMock = {
  isEmpty: (v) => {
    if (v === null || v === undefined) return true;
    if (typeof v === 'string') return v.trim() === '';
    if (Array.isArray(v)) return v.length === 0;
    if (v instanceof Map || v instanceof Set) return v.size === 0;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  },
};

const YamlsMock = { getConfig: jest.fn(() => null) };

// fs: backup uses mkdirSync; cleanValue uses existsSync/statSync to decide if a
// literal path still exists. Default: every literal path is a live directory
// (so nothing is removed) unless a test overrides it.
const fsMock = {
  mkdirSync: jest.fn(),
  existsSync: jest.fn(() => true),
  statSync: jest.fn(() => ({ isDirectory: () => true })),
};

jest.unstable_mockModule('child_process', () => ({ execFileSync, default: { execFileSync } }));
jest.unstable_mockModule('node:fs', () => ({ default: fsMock, ...fsMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Registry } = await import('../utils/Registry.js');

const realPlatform = process.platform;

function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

// Build a `reg query` stdout block from [{name, kind, value}] rows, in reg.exe's
// "    <name>    <TYPE>    <data>" format (4-space separators).
function regQueryOutput(rows) {
  const head = 'HKEY_CURRENT_USER\\Environment\r\n';
  return head + rows.map((r) => `    ${r.name}    ${r.kind}    ${r.value}`).join('\r\n') + '\r\n';
}

// Route execFileSync by (bin, args): reg query → configured rows; reg add/export
// → success; rundll32 → success. `queryRows` is keyed by hive marker in the key path.
function wireReg({ userRows = [], sysRows = [], addStatus = 0, addStderr = '' } = {}) {
  execFileSync.mockImplementation((bin, args) => {
    if (bin === 'reg') {
      const sub = args[0];
      const keyPath = args[1] || '';
      if (sub === 'query') {
        const rows = keyPath.startsWith('HKLM') ? sysRows : userRows;
        return regQueryOutput(rows);
      }
      if (sub === 'add') {
        if (addStatus !== 0) {
          const e = new Error('reg add failed');
          e.status = addStatus;
          e.stderr = addStderr;
          throw e;
        }
        return '';
      }
      if (sub === 'export') return '';
    }
    if (bin === 'rundll32') return '';
    return '';
  });
}

beforeEach(() => {
  setPlatform('win32');
  YamlsMock.getConfig.mockReturnValue(null);
  fsMock.existsSync.mockReturnValue(true);
  fsMock.statSync.mockReturnValue({ isDirectory: () => true });
  wireReg(); // default: empty hives, all reg calls succeed
});

afterEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(process, 'platform', { value: realPlatform, configurable: true });
});

describe('Registry.clean — platform guard', () => {
  it('warns and returns null on non-Windows platforms', () => {
    setPlatform('linux');
    const out = Registry.clean();
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      'Registry Clean is only available on Windows.',
      'Registry Clean'
    );
    expect(execFileSync).not.toHaveBeenCalled();
  });
});

describe('Registry.clean — invocation via reg.exe (no PowerShell)', () => {
  it('queries the User and System Environment keys with reg.exe', () => {
    Registry.clean();
    const regQueries = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'query');
    const queried = regQueries.map((c) => c[1][1]);
    expect(queried.some((k) => k === 'HKCU\\Environment')).toBe(true);
    expect(queried.some((k) => k.includes('Session Manager\\Environment'))).toBe(true);
    // never PowerShell
    expect(execFileSync.mock.calls.some((c) => /powershell/i.test(c[0]))).toBe(false);
  });
});

describe('Registry.clean — hive resolution', () => {
  it.each([
    ['System', 'System'],
    ['system', 'System'],
    ['hklm', 'System'],
    ['machine', 'System'],
    ['User', 'User'],
    ['hkcu', 'User'],
    ['Both', 'Both'],
    ['anything-else', 'Both'],
  ])('maps hives=%s to scope %s in the result', (input, scope) => {
    const out = Registry.clean(input);
    expect(out.scope).toBe(scope);
  });

  it('defaults to Both when hives is null and no config is set', () => {
    expect(Registry.clean(null).scope).toBe('Both');
  });

  it('falls back to the config Registry.clean.Hives value when arg is null', () => {
    YamlsMock.getConfig.mockImplementation((key) =>
      key === 'Registry.clean.Hives' ? 'User' : null
    );
    expect(Registry.clean(null).scope).toBe('User');
  });
});

describe('Registry.clean — backup resolution', () => {
  it('exports both hives via reg export by default (backup on)', () => {
    Registry.clean('User');
    const exports = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'export');
    expect(exports.length).toBe(2);
    expect(fsMock.mkdirSync).toHaveBeenCalled();
  });

  it('skips the backup export when backup=false', () => {
    Registry.clean('User', false, false);
    const exports = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'export');
    expect(exports.length).toBe(0);
  });

  it('accepts the string "false" as false (YAML scalars)', () => {
    Registry.clean('User', 'false', 'true');
    const exports = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'export');
    expect(exports.length).toBe(0);
  });

  it('falls back to config booleans when args are null', () => {
    YamlsMock.getConfig.mockImplementation((key) => {
      if (key === 'Registry.clean.Backup') return false;
      return null;
    });
    Registry.clean('User', null, null);
    const exports = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'export');
    expect(exports.length).toBe(0);
  });
});

describe('Registry.clean — dead-token removal (real cleaning logic)', () => {
  it('removes %VAR% references to undefined variables and rewrites Path via reg add', () => {
    // Path references %GONE% (undefined) and %Path_OK% (defined) plus a live dir.
    wireReg({
      userRows: [
        { name: 'Path_OK', kind: 'REG_SZ', value: 'C:\\live' },
        { name: 'Path', kind: 'REG_EXPAND_SZ', value: '%GONE%;%Path_OK%;C:\\live' },
      ],
    });
    const out = Registry.clean('User');
    expect(out.removedCount).toBe(1);
    expect(out.changes[0]).toMatchObject({ scope: 'HKCU', name: 'Path' });
    expect(out.changes[0].removed).toEqual(['%GONE%']);
    // the surviving value was written back preserving REG_EXPAND_SZ
    const add = execFileSync.mock.calls.find((c) => c[0] === 'reg' && c[1][0] === 'add' && c[1][3] === 'Path');
    expect(add).toBeDefined();
    const args = add[1];
    expect(args).toEqual(expect.arrayContaining(['/t', 'REG_EXPAND_SZ']));
    const dataIdx = args.indexOf('/d');
    expect(args[dataIdx + 1]).toBe('%Path_OK%;C:\\live');
  });

  it('removes literal directories that no longer exist', () => {
    fsMock.existsSync.mockImplementation((p) => p === 'C:\\live'); // only C:\live exists
    wireReg({ userRows: [{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\live;C:\\dead' }] });
    const out = Registry.clean('User');
    expect(out.removedCount).toBe(1);
    expect(out.changes[0].removed).toEqual(['C:\\dead']);
  });

  it('makes no changes when every token still resolves', () => {
    wireReg({ userRows: [{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\live;C:\\also' }] });
    const out = Registry.clean('User');
    expect(out.removedCount).toBe(0);
    expect(out.changes).toEqual([]);
    const adds = execFileSync.mock.calls.filter((c) => c[0] === 'reg' && c[1][0] === 'add');
    expect(adds.length).toBe(0);
  });

  it('only touches Path and Path_* values, never other env vars', () => {
    fsMock.existsSync.mockReturnValue(false); // every literal is "dead"
    wireReg({
      userRows: [
        { name: 'TEMP', kind: 'REG_SZ', value: 'C:\\gone' },
        { name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\gone' },
      ],
    });
    const out = Registry.clean('User');
    const changedNames = out.changes.map((c) => c.name);
    expect(changedNames).toContain('Path');
    expect(changedNames).not.toContain('TEMP');
  });
});

describe('Registry.clean — result shaping (happy path)', () => {
  it('shows a message box (not a warning) and reports the scope on success', () => {
    wireReg({ userRows: [] });
    const out = Registry.clean('User');
    expect(out.scope).toBe('User');
    expect(out.errors).toEqual([]);
    expect(DialogsMock.messageBox).toHaveBeenCalledWith(expect.any(String), 'Registry Clean');
    expect(DialogsMock.warningBox).not.toHaveBeenCalled();
  });

  it('singularizes the "entry" word when exactly one entry is removed', () => {
    fsMock.existsSync.mockReturnValue(false);
    wireReg({ userRows: [{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\dead' }] });
    Registry.clean('User');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('Removed 1 dead entry');
  });

  it('reports a backup path in the message when backup ran', () => {
    wireReg({ userRows: [{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\live' }] });
    Registry.clean('User'); // backup on by default
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('Backup:');
  });
});

describe('Registry.clean — elevation & errors', () => {
  it('records a reg-add error when an HKCU write genuinely fails', () => {
    fsMock.existsSync.mockReturnValue(false);
    wireReg({
      userRows: [{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\dead' }],
      addStatus: 1,
      addStderr: 'some other failure',
    });
    const out = Registry.clean('User');
    expect(out.errors.length).toBeGreaterThan(0);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(expect.any(String), 'Registry Clean');
  });

  it('adds the not-elevated note for System scope when no HKLM write succeeded', () => {
    // System scope, but sys hive has no changes → elevated stays false → note shown
    wireReg({ sysRows: [] });
    Registry.clean('System');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('not elevated');
  });
});

describe('Registry._parseQuery', () => {
  it('parses reg query lines into {name, kind, value}', () => {
    const rows = Registry._parseQuery(
      regQueryOutput([{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\a;C:\\b' }])
    );
    expect(rows).toEqual([{ name: 'Path', kind: 'REG_EXPAND_SZ', value: 'C:\\a;C:\\b' }]);
  });

  it('ignores non-value lines (headers, blanks)', () => {
    expect(Registry._parseQuery('HKEY_CURRENT_USER\\Environment\r\n\r\n')).toEqual([]);
  });
});

describe('Registry._stamp', () => {
  it('formats now as yyyyMMdd_HHmmss', () => {
    expect(Registry._stamp()).toMatch(/^\d{8}_\d{6}$/);
  });
});
