// Unit tests for utils/Dialogs.js — public methods warningBox, errorBox,
// messageBox, openFileDialog, inputBox, multilineInputBox, plus the static
// Buttons / Icons constant tables.
//
// Dialogs no longer uses PowerShell (whose UTF-16 stdout leaked garbled
// "Chinese-looking" text into the terminal). The boundaries are now:
//   - messageBox        → winax COM WScript.Shell.Popup
//   - inputBox / openFileDialog → execFileSync('cscript', ['//nologo', <vbs>])
//   - multilineInputBox → execFileSync('mshta', [<hta>]) + a temp UTF-16 file
// We mock ONLY those boundaries (child_process, winax, node:fs) so the genuine
// VBScript / HTA building, quote escaping and return-value logic are exercised
// without spawning a real shell / GUI.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// --- Boundary mocks (declared before importing Dialogs) ---
const execFileSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({ execFileSync, default: { execFileSync } }));

// winax COM is loaded through createRequire('winax') (CommonJS in an ESM file),
// which bypasses jest.unstable_mockModule. So we mock node:module's createRequire
// to hand back a require() that returns our winax fake for 'winax'.
const popup = jest.fn(() => -1);
const winaxObject = jest.fn(() => ({ Popup: popup }));
const winaxFake = { Object: winaxObject };
const fakeRequire = (id) => (id === 'winax' ? winaxFake : (() => { throw new Error(`unexpected require: ${id}`); })());
jest.unstable_mockModule('node:module', () => ({
  createRequire: () => fakeRequire,
  default: { createRequire: () => fakeRequire },
}));

// fs is used by _runVbs (write/unlink the temp .vbs) and multilineInputBox
// (write the .hta, read the UTF-16 output file). Provide controllable fakes.
const fsMock = {
  writeFileSync: jest.fn(),
  unlinkSync: jest.fn(),
  existsSync: jest.fn(() => false),
  readFileSync: jest.fn(() => ''),
};
jest.unstable_mockModule('node:fs', () => ({ default: fsMock, ...fsMock }));

const { Dialogs } = await import('../utils/Dialogs.js');

/** The args array passed to execFileSync on its first call. */
function firstCall() {
  return execFileSync.mock.calls[0];
}

beforeEach(() => {
  execFileSync.mockReset();
  execFileSync.mockReturnValue('');
  popup.mockReset();
  popup.mockReturnValue(-1);
  winaxObject.mockClear();
  fsMock.writeFileSync.mockReset();
  fsMock.unlinkSync.mockReset();
  fsMock.existsSync.mockReset().mockReturnValue(false);
  fsMock.readFileSync.mockReset().mockReturnValue('');
});

describe('Dialogs.Buttons / Dialogs.Icons (static constants)', () => {
  it('exposes the documented MessageBox button constants', () => {
    expect(Dialogs.Buttons).toEqual({
      OK: 0,
      OKCancel: 1,
      AbortRetryIgnore: 2,
      YesNoCancel: 3,
      YesNo: 4,
      RetryCancel: 5,
    });
  });

  it('exposes the documented MessageBox icon constants', () => {
    expect(Dialogs.Icons).toEqual({
      Stop: 16,
      Question: 32,
      Exclamation: 48,
      Information: 64,
    });
  });
});

describe('Dialogs._vbsStr (VBScript string escaping)', () => {
  it('wraps a plain string in double quotes', () => {
    expect(Dialogs._vbsStr('Enter value:')).toBe('"Enter value:"');
  });
  it('doubles embedded double quotes', () => {
    expect(Dialogs._vbsStr('say "hi"')).toBe('"say ""hi"""');
  });
  it('splices newlines via vbCrLf', () => {
    expect(Dialogs._vbsStr('line1\nline2')).toBe('"line1" & vbCrLf & "line2"');
  });
});

describe('Dialogs.messageBox', () => {
  it('opens a native message box via winax COM WScript.Shell.Popup', () => {
    Dialogs.messageBox('Hello world', 'My Title');
    expect(winaxObject).toHaveBeenCalledWith('WScript.Shell');
    expect(popup).toHaveBeenCalledTimes(1);
    const [text, secs, title, type] = popup.mock.calls[0];
    expect(text).toBe('Hello world');
    expect(title).toBe('My Title');
    expect(secs).toBe(0); // wait forever
    // type = OK(0) + Information(64) by default
    expect(type).toBe(Dialogs.Buttons.OK + Dialogs.Icons.Information);
  });

  it("defaults the title to 'Message' when omitted", () => {
    Dialogs.messageBox('Just a message');
    expect(popup.mock.calls[0][2]).toBe('Message');
  });

  it('passes the requested icon through to the Popup type', () => {
    Dialogs.messageBox('warn', 'T', Dialogs.Icons.Exclamation);
    expect(popup.mock.calls[0][3]).toBe(Dialogs.Buttons.OK + Dialogs.Icons.Exclamation);
  });

  it('swallows COM errors and does not throw (catch branch)', () => {
    winaxObject.mockImplementationOnce(() => { throw new Error('winax missing'); });
    expect(() => Dialogs.messageBox('boom', 'T')).not.toThrow();
  });
});

describe('Dialogs.warningBox', () => {
  it('delegates to messageBox and returns null by default (stop=false)', () => {
    const result = Dialogs.warningBox('careful', 'Heads up');
    expect(result).toBeNull();
    expect(popup).toHaveBeenCalledTimes(1);
    expect(popup.mock.calls[0][0]).toBe('careful');
    expect(popup.mock.calls[0][2]).toBe('Heads up');
  });

  it('defaults the title to "Warning"', () => {
    Dialogs.warningBox('careful');
    expect(popup.mock.calls[0][2]).toBe('Warning');
  });

  it('throws an Error carrying the message when stop=true', () => {
    expect(() =>
      Dialogs.warningBox('stop now', 'Warning', Dialogs.Icons.Exclamation, Dialogs.Buttons.OK, true)
    ).toThrow('stop now');
    expect(popup).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogs.errorBox', () => {
  it('delegates to messageBox and returns null by default (stop=false)', () => {
    const result = Dialogs.errorBox('it broke', 'Failure');
    expect(result).toBeNull();
    expect(popup).toHaveBeenCalledTimes(1);
    expect(popup.mock.calls[0][0]).toBe('it broke');
    expect(popup.mock.calls[0][2]).toBe('Failure');
  });

  it('throws an Error carrying the message when stop=true', () => {
    expect(() =>
      Dialogs.errorBox('fatal', 'Error', Dialogs.Icons.Stop, Dialogs.Buttons.OK, true)
    ).toThrow('fatal');
    expect(popup).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogs.openFileDialog', () => {
  it('returns the trimmed path printed by cscript', () => {
    execFileSync.mockReturnValue('  C:\\docs\\file.docx \r\n');
    expect(Dialogs.openFileDialog()).toBe('C:\\docs\\file.docx');
  });

  it('runs cscript //nologo against a generated .vbs (NOT PowerShell)', () => {
    execFileSync.mockReturnValue('C:\\x.docx');
    Dialogs.openFileDialog();
    const [bin, args] = firstCall();
    expect(bin).toBe('cscript');
    expect(args[0]).toBe('//nologo');
    expect(args[1]).toMatch(/\.vbs$/);
    // the VBS body was written to that temp file
    const vbsBody = fsMock.writeFileSync.mock.calls[0][1];
    expect(vbsBody).toInclude('CreateObject("UserAccounts.CommonDialog")');
  });

  it('embeds the (escaped) initial directory in the VBS via _vbsStr', () => {
    execFileSync.mockReturnValue('C:\\x.docx');
    Dialogs.openFileDialog("D:\\It's Mine");
    const vbsBody = fsMock.writeFileSync.mock.calls[0][1];
    expect(vbsBody).toInclude('dlg.InitialDir = "D:\\It\'s Mine"');
  });

  it('returns null when cscript prints nothing (no selection)', () => {
    execFileSync.mockReturnValue('   \r\n');
    expect(Dialogs.openFileDialog()).toBeNull();
  });

  it('returns null when execFileSync throws', () => {
    execFileSync.mockImplementation(() => { throw new Error('cscript missing'); });
    expect(Dialogs.openFileDialog()).toBeNull();
  });
});

describe('Dialogs.inputBox', () => {
  it('returns the trimmed entered text', () => {
    execFileSync.mockReturnValue('  user typed this  \r\n');
    expect(Dialogs.inputBox()).toBe('user typed this');
  });

  it('builds a VBS calling InputBox() with the prompt, title and default', () => {
    execFileSync.mockReturnValue('x');
    Dialogs.inputBox('Your name?', 'Name Entry', 'John');
    const vbsBody = fsMock.writeFileSync.mock.calls[0][1];
    expect(vbsBody).toInclude('WScript.Echo InputBox(');
    expect(vbsBody).toInclude('"Your name?"');
    expect(vbsBody).toInclude('"Name Entry"');
    expect(vbsBody).toInclude('"John"');
  });

  it('doubles double quotes in prompt/title/default (VBScript escaping)', () => {
    execFileSync.mockReturnValue('x');
    Dialogs.inputBox('say "a"', 'ti"tle', 'de"f');
    const vbsBody = fsMock.writeFileSync.mock.calls[0][1];
    expect(vbsBody).toInclude('"say ""a"""');
    expect(vbsBody).toInclude('"ti""tle"');
    expect(vbsBody).toInclude('"de""f"');
  });

  it('returns null for empty / whitespace-only output', () => {
    execFileSync.mockReturnValue('   \r\n');
    expect(Dialogs.inputBox()).toBeNull();
  });

  it('returns null when execFileSync throws', () => {
    execFileSync.mockImplementation(() => { throw new Error('boom'); });
    expect(Dialogs.inputBox()).toBeNull();
  });
});

describe('Dialogs.multilineInputBox', () => {
  it('returns the entered text (CRLF normalized) read back from the HTA output file', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('line one\r\nline two');
    expect(Dialogs.multilineInputBox()).toBe('line one\nline two');
    // mshta was the launcher (not PowerShell)
    expect(firstCall()[0]).toBe('mshta');
  });

  it('writes an HTA carrying the prompt, title and default value', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('text');
    Dialogs.multilineInputBox('Type a lot', 'Editor', 'seed value');
    // first writeFileSync call is the .hta
    const htaCall = fsMock.writeFileSync.mock.calls.find(c => /\.hta$/.test(c[0]));
    expect(htaCall).toBeDefined();
    const hta = htaCall[1];
    expect(hta).toInclude('<HTA:APPLICATION');
    expect(hta).toInclude('Editor');
    expect(hta).toInclude('Type a lot');
    expect(hta).toInclude('seed value');
  });

  it('coerces a non-string default value via JSON.stringify(String()) before embedding', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('text');
    Dialogs.multilineInputBox('p', 't', 12345);
    const htaCall = fsMock.writeFileSync.mock.calls.find(c => /\.hta$/.test(c[0]));
    expect(htaCall[1]).toInclude('"12345"');
  });

  it('returns null for empty / whitespace-only output', () => {
    fsMock.existsSync.mockReturnValue(true);
    fsMock.readFileSync.mockReturnValue('   \r\n');
    expect(Dialogs.multilineInputBox()).toBeNull();
  });

  it('returns null when the output file is absent (dialog cancelled)', () => {
    fsMock.existsSync.mockReturnValue(false);
    expect(Dialogs.multilineInputBox()).toBeNull();
  });

  it('returns null when execFileSync throws', () => {
    execFileSync.mockImplementation(() => { throw new Error('boom'); });
    expect(Dialogs.multilineInputBox()).toBeNull();
  });
});
