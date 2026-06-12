// Unit tests for utils/Registry.js — public method clean.
//
// Pattern (CLI boundary): Registry.clean shells out to PowerShell via
// child_process.spawnSync with a base64 -EncodedCommand script and parses the
// JSON envelope it prints back. We mock child_process (asserting the command,
// flags and the decoded script), Dialogs (UI), Yamls (config) and Files
// (isEmpty), and steer process.platform per test. We assert the real
// hive/backup/broadcast resolution, the parsing/fallback, return shaping and the
// error branches as written.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { spawnResult } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

const spawnSync = jest.fn();

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

jest.unstable_mockModule('child_process', () => ({ spawnSync, default: { spawnSync } }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Registry } = await import('../utils/Registry.js');

const realPlatform = process.platform;

/** Force process.platform for a test (Registry.clean is win32-only). */
function setPlatform(value) {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

/** Make spawnSync return a successful PowerShell JSON envelope. */
function psReturns(envelope) {
  spawnSync.mockReturnValue(spawnResult({ stdout: JSON.stringify(envelope) }));
}

/** Decode the base64 -EncodedCommand argument back into the PowerShell script. */
function decodedScript() {
  const args = spawnSync.mock.calls[0][1];
  const idx = args.indexOf('-EncodedCommand');
  const b64 = args[idx + 1];
  return Buffer.from(b64, 'base64').toString('utf16le');
}

beforeEach(() => {
  setPlatform('win32');
  YamlsMock.getConfig.mockReturnValue(null);
  psReturns({ backup: null, elevated: true, broadcast: false, changes: [], errors: [] });
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
      'Registry Clean',
    );
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

describe('Registry.clean — invocation & command shape', () => {
  it('invokes powershell with -NoProfile -NonInteractive -EncodedCommand', () => {
    Registry.clean();
    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [cmd, args, opts] = spawnSync.mock.calls[0];
    expect(cmd).toBe('powershell');
    expect(args).toEqual(expect.arrayContaining(['-NoProfile', '-NonInteractive', '-EncodedCommand']));
    expect(opts).toMatchObject({ encoding: 'utf8', windowsHide: true });
    expect(opts.maxBuffer).toBeGreaterThan(0);
  });

  it('encodes a real PowerShell script touching the Environment registry keys', () => {
    Registry.clean();
    const script = decodedScript();
    expect(script).toContain('Session Manager\\Environment');
    expect(script).toContain("OpenSubKey('Environment')");
    expect(script).toContain('ConvertTo-Json');
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
  ])('maps hives=%s to scope %s in the script and result', (input, scope) => {
    const out = Registry.clean(input);
    expect(decodedScript()).toContain(`$HIVES = '${scope}'`);
    expect(out.scope).toBe(scope);
  });

  it('defaults to Both when hives is null and no config is set', () => {
    const out = Registry.clean(null);
    expect(out.scope).toBe('Both');
    expect(decodedScript()).toContain("$HIVES = 'Both'");
  });

  it('falls back to the config Registry.clean.Hives value when arg is null', () => {
    YamlsMock.getConfig.mockImplementation((key) =>
      key === 'Registry.clean.Hives' ? 'User' : null);
    const out = Registry.clean(null);
    expect(out.scope).toBe('User');
  });
});

describe('Registry.clean — backup & broadcast resolution', () => {
  it('defaults backup and broadcast to true in the script', () => {
    Registry.clean();
    const script = decodedScript();
    expect(script).toContain('$DO_BACKUP = $true');
    expect(script).toContain('$DO_BROADCAST = $true');
  });

  it('respects explicit false arguments', () => {
    Registry.clean('Both', false, false);
    const script = decodedScript();
    expect(script).toContain('$DO_BACKUP = $false');
    expect(script).toContain('$DO_BROADCAST = $false');
  });

  it('accepts the string "false" as false (YAML scalars)', () => {
    Registry.clean('Both', 'false', 'true');
    const script = decodedScript();
    expect(script).toContain('$DO_BACKUP = $false');
    expect(script).toContain('$DO_BROADCAST = $true');
  });

  it('falls back to config booleans when args are null', () => {
    YamlsMock.getConfig.mockImplementation((key) => {
      if (key === 'Registry.clean.Backup') return false;
      if (key === 'Registry.clean.Broadcast') return 'false';
      return null;
    });
    Registry.clean(null, null, null);
    const script = decodedScript();
    expect(script).toContain('$DO_BACKUP = $false');
    expect(script).toContain('$DO_BROADCAST = $false');
  });
});

describe('Registry.clean — result shaping (happy path)', () => {
  it('parses the envelope, computes removedCount and returns the full result object', () => {
    psReturns({
      backup: 'C:\\Users\\me\\registry-path-backup-x',
      elevated: true,
      broadcast: true,
      changes: [
        { scope: 'HKCU', name: 'Path', removed: ['%GONE%', 'D:\\dead'] },
        { scope: 'HKLM', name: 'Path_Extra', removed: ['E:\\nope'] },
      ],
      errors: [],
    });

    const out = Registry.clean('Both');

    expect(out).toMatchObject({
      scope: 'Both',
      removedCount: 3,
      backup: 'C:\\Users\\me\\registry-path-backup-x',
      elevated: true,
      broadcast: true,
    });
    expect(out.changes).toHaveLength(2);
    expect(out.changes[0]).toEqual({ scope: 'HKCU', name: 'Path', removed: ['%GONE%', 'D:\\dead'] });
    expect(out.errors).toEqual([]);
    // success with no errors → message box, not a warning
    expect(DialogsMock.messageBox).toHaveBeenCalledWith(expect.any(String), 'Registry Clean');
    expect(DialogsMock.warningBox).not.toHaveBeenCalled();
  });

  it('coerces a scalar (non-array) removed/changes/errors via _asArray', () => {
    psReturns({
      backup: null,
      elevated: false,
      broadcast: false,
      changes: { scope: 'HKCU', name: 'Path', removed: 'C:\\one-dead' }, // single object, removed scalar
      errors: 'single error',
    });

    const out = Registry.clean('User');

    expect(out.changes).toHaveLength(1);
    expect(out.changes[0].removed).toEqual(['C:\\one-dead']);
    expect(out.removedCount).toBe(1);
    expect(out.errors).toEqual(['single error']);
    // errors present → warning box
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(expect.any(String), 'Registry Clean');
  });

  it('singularizes the "entry" word when exactly one entry is removed', () => {
    psReturns({
      backup: null, elevated: true, broadcast: false,
      changes: [{ scope: 'HKCU', name: 'Path', removed: ['x'] }],
      errors: [],
    });
    Registry.clean('User');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('Removed 1 dead entry');
  });

  it('adds the not-elevated note for System/Both scope when not running elevated', () => {
    psReturns({ backup: null, elevated: false, broadcast: false, changes: [], errors: [] });
    Registry.clean('System');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('not elevated');
    expect(message).toContain('System (HKLM) values were skipped');
  });

  it('omits the elevation note for User scope', () => {
    psReturns({ backup: null, elevated: false, broadcast: false, changes: [], errors: [] });
    Registry.clean('User');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).not.toContain('not elevated');
  });

  it('includes the backup path and broadcast note in the message when present', () => {
    psReturns({
      backup: 'C:\\bk',
      elevated: true,
      broadcast: true,
      changes: [{ scope: 'HKCU', name: 'Path', removed: ['x'] }],
      errors: [],
    });
    Registry.clean('User');
    const [message] = DialogsMock.messageBox.mock.calls[0];
    expect(message).toContain('Backup: C:\\bk');
    expect(message).toContain('Broadcast: environment change sent to running apps.');
  });
});

describe('Registry.clean — JSON parsing', () => {
  it('falls back to the first {...} block when stdout has surrounding noise', () => {
    const envelope = { backup: null, elevated: true, broadcast: false, changes: [], errors: [] };
    spawnSync.mockReturnValue(spawnResult({
      stdout: `WARNING: leading noise\n${JSON.stringify(envelope)}\ntrailing noise`,
    }));

    const out = Registry.clean('User');
    expect(out).not.toBeNull();
    expect(out.scope).toBe('User');
  });

  it('returns null and warns when stdout has no JSON object at all', () => {
    spawnSync.mockReturnValue(spawnResult({ stdout: 'totally not json' }));
    const out = Registry.clean('User');
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(expect.any(String), 'Registry Clean');
  });
});

describe('Registry.clean — failure branches', () => {
  it('returns null and warns when spawnSync reports a launch error', () => {
    spawnSync.mockReturnValue(spawnResult({ error: new Error('spawn ENOENT'), status: null }));
    const out = Registry.clean('User');
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('spawn ENOENT'),
      'Registry Clean',
    );
  });

  it('returns null and warns when PowerShell exits with a non-zero status', () => {
    spawnSync.mockReturnValue(spawnResult({ status: 1, stderr: 'boom in script' }));
    const out = Registry.clean('User');
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('PowerShell exited with code 1'),
      'Registry Clean',
    );
  });

  it('surfaces the stderr text in the non-zero-status error message', () => {
    spawnSync.mockReturnValue(spawnResult({ status: 2, stderr: 'access denied' }));
    Registry.clean('User');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith(
      expect.stringContaining('access denied'),
      'Registry Clean',
    );
  });
});
