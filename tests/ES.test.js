// Unit tests for utils/ES.js — public methods find, findIn, execute.
//
// ES is a thin wrapper around the `es.exe` (Everything CLI) invoked through
// child_process.execSync. Per the native-boundary convention we mock ONLY
// child_process before importing ES, then assert (a) the exact command string
// built by find/findIn and (b) the CRLF-splitting / blank-filtering /
// backslash-collapsing parsing done by execute, including its catch branch.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const execSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({ execSync, default: { execSync } }));

const { ES } = await import('../utils/ES.js');

beforeEach(() => {
  jest.clearAllMocks();
  // default: a successful run returning a single line
  execSync.mockReturnValue('');
});

describe('ES.find', () => {
  it('delegates to execute with a command carrying the default instance and ^name$ regex', () => {
    execSync.mockReturnValue('');
    ES.find('Arty 3D Viewer');

    expect(execSync).toHaveBeenCalledTimes(1);
    const [command, options] = execSync.mock.calls[0];
    expect(command).toContain('es.exe');
    expect(command).toContain('-instance "One"');
    expect(command).toContain('-regex "^Arty 3D Viewer$"');
    expect(command).toContain('/ad');
    // execute always asks for utf-8 encoding
    expect(options).toEqual({ encoding: 'utf-8' });
  });

  it('honors a custom instance name', () => {
    ES.find('cursor.com', 'Two');
    const [command] = execSync.mock.calls[0];
    expect(command).toContain('-instance "Two"');
    expect(command).toContain('-regex "^cursor.com$"');
  });

  it('does not include a folder argument (no quoted path before -regex)', () => {
    ES.find('foo');
    const [command] = execSync.mock.calls[0];
    // findIn injects `"<folder>"` right after the instance; find must not.
    expect(command).toContain('-instance "One"  -regex');
  });

  it('returns the parsed array from execute', () => {
    execSync.mockReturnValue('C:\\a\\b\r\n');
    expect(ES.find('foo')).toEqual(['C:\\a\\b']);
  });
});

describe('ES.findIn', () => {
  it('embeds the folder, default instance and ^name$ regex in the command', () => {
    ES.findIn('cursor.com', 'D:\\');

    expect(execSync).toHaveBeenCalledTimes(1);
    const [command] = execSync.mock.calls[0];
    expect(command).toContain('-instance "One"');
    expect(command).toContain('"D:\\"');
    expect(command).toContain('-regex "^cursor.com$"');
    // folder appears between the instance and the -regex switch
    expect(command).toContain('-instance "One" "D:\\" -regex "^cursor.com$"');
  });

  it('honors a custom instance name', () => {
    ES.findIn('name', 'C:\\Temp', 'Alt');
    const [command] = execSync.mock.calls[0];
    expect(command).toContain('-instance "Alt"');
    expect(command).toContain('"C:\\Temp"');
  });

  it('returns the parsed array from execute', () => {
    execSync.mockReturnValue('line1\r\n');
    expect(ES.findIn('name', 'D:\\')).toEqual(['line1']);
  });
});

describe('ES.execute', () => {
  it('splits on CRLF, drops blank lines and collapses doubled backslashes', () => {
    execSync.mockReturnValue('line1\r\n\r\nC:\\\\a\\\\b\r\n');

    const out = ES.execute('es.exe whatever');

    expect(out).toEqual(['line1', 'C:\\a\\b']);
  });

  it('passes the command through to execSync with utf-8 encoding', () => {
    execSync.mockReturnValue('');
    ES.execute('es.exe -instance "One"');

    expect(execSync).toHaveBeenCalledWith('es.exe -instance "One"', { encoding: 'utf-8' });
  });

  it('returns an empty array for empty output', () => {
    execSync.mockReturnValue('');
    expect(ES.execute('es.exe')).toEqual([]);
  });

  it('returns an empty array when only blank/whitespace lines are produced', () => {
    execSync.mockReturnValue('   \r\n\t\r\n\r\n');
    expect(ES.execute('es.exe')).toEqual([]);
  });

  it('collapses every doubled backslash in a single line (global replace)', () => {
    execSync.mockReturnValue('C:\\\\Users\\\\Name\\\\file.app\r\n');
    expect(ES.execute('es.exe')).toEqual(['C:\\Users\\Name\\file.app']);
  });

  it('keeps single backslashes untouched', () => {
    execSync.mockReturnValue('C:\\already\\single\r\n');
    expect(ES.execute('es.exe')).toEqual(['C:\\already\\single']);
  });

  it('returns [] and logs the error when execSync throws (catch branch)', () => {
    execSync.mockImplementation(() => {
      throw new Error('es.exe not found');
    });

    expect(ES.execute('es.exe')).toEqual([]);
  });
});
