// Unit tests for utils/Logs.js — public instance methods showMessageBox and
// cleanPath (Logs is instantiated via `new Logs()`).
//
// The constructor builds a real pino + pino-roll logger (worker threads) and
// overrides the global console. We MUST mock 'pino' BEFORE importing Logs so no
// real transport/worker is spawned; we also mock 'child_process' so
// showMessageBox does not actually shell out to `msg`. fs.mkdirSync for the logs
// dir runs for real (harmless). The constructor caches a global singleton
// (global.__utils_instance__) and overrides console.*, so we snapshot and
// restore console around the suite to keep other behavior tidy.
import { jest, describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';

// --- mock the heavy boundaries BEFORE importing Logs -------------------------
const logger = { info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
const pinoFn = jest.fn(() => logger);
pinoFn.transport = jest.fn(() => ({}));
jest.unstable_mockModule('pino', () => ({ default: pinoFn, pino: pinoFn }));

const execSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({ execSync, default: { execSync } }));

const { Logs } = await import('../utils/Logs.js');

// Snapshot the original console methods so the constructor's override does not
// leak; also clear the singleton so each construct path is exercised cleanly.
const originalConsole = {
  log: console.log,
  info: console.info,
  debug: console.debug,
  warn: console.warn,
  error: console.error,
};

beforeAll(() => {
  delete global.__utils_instance__;
});

afterAll(() => {
  Object.assign(console, originalConsole);
  delete global.__utils_instance__;
});

beforeEach(() => {
  jest.clearAllMocks();
});

afterEach(() => {
  // Restore console after every test so the wrapped versions don't accumulate.
  Object.assign(console, originalConsole);
});

describe('Logs constructor', () => {
  it('builds a pino logger and overrides the console methods', () => {
    delete global.__utils_instance__;
    Object.assign(console, originalConsole);

    new Logs();

    expect(pinoFn).toHaveBeenCalled();
    expect(pinoFn.transport).toHaveBeenCalledWith(
      expect.objectContaining({ target: 'pino-roll' }),
    );
    // console.* are now wrapped (no longer the originals).
    expect(console.log).not.toBe(originalConsole.log);
  });

  it('reuses the global singleton on a second instantiation', () => {
    delete global.__utils_instance__;
    const a = new Logs();
    const b = new Logs();
    expect(b).toBe(a);
  });
});

describe('Logs.showMessageBox', () => {
  it('invokes execSync with a `msg *` command carrying title and message', async () => {
    const logs = new Logs();
    await logs.showMessageBox('Hello world', 'Notice');

    expect(execSync).toHaveBeenCalledTimes(1);
    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toContain('msg *');
    expect(cmd).toContain('Notice:');
    expect(cmd).toContain('Hello world');
  });

  it('defaults the title to "Error"', async () => {
    const logs = new Logs();
    await logs.showMessageBox('boom');
    expect(execSync.mock.calls[0][0]).toContain('Error:');
  });

  it('escapes double quotes in the message to single quotes', async () => {
    const logs = new Logs();
    await logs.showMessageBox('say "hi" now', 'T');
    const cmd = execSync.mock.calls[0][0];
    expect(cmd).toContain("say 'hi' now");
    expect(cmd).not.toContain('say "hi"');
  });

  it('swallows errors when execSync throws (does not reject)', async () => {
    execSync.mockImplementation(() => { throw new Error('msg not available'); });
    const logs = new Logs();
    await expect(logs.showMessageBox('x', 'T')).resolves.toBeUndefined();
  });
});

describe('Logs.cleanPath', () => {
  it('normalizes backslashes to forward slashes', () => {
    const logs = new Logs();
    expect(logs.cleanPath('C:\\Users\\me\\file.txt')).toBe('C:/Users/me/file.txt');
  });

  it('collapses doubled backslashes before converting', () => {
    const logs = new Logs();
    expect(logs.cleanPath('C:\\\\a\\\\b')).toBe('C:/a/b');
  });

  it('leaves an already forward-slashed path unchanged', () => {
    const logs = new Logs();
    expect(logs.cleanPath('C:/already/clean')).toBe('C:/already/clean');
  });
});
