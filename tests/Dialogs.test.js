// Unit tests for utils/Dialogs.js — public methods warningBox, errorBox,
// messageBox, openFileDialog, inputBox, multilineInputBox, plus the static
// Buttons / Icons constant tables.
//
// Every Dialogs method shells out to PowerShell via execSync from
// 'child_process'. We mock ONLY that boundary (per tests/README.md) so the
// genuine PowerShell-script building, single-quote escaping, base64 encoding
// and return-value logic are exercised without spawning a real shell / GUI.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';

// Mock the child_process boundary BEFORE importing Dialogs.
const execSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({ execSync, default: { execSync } }));

const { Dialogs } = await import('../utils/Dialogs.js');

/**
 * Decode the base64 payload of a `powershell ... -EncodedCommand <b64>` command
 * back into the original UTF-16LE PowerShell script text.
 */
function decodeEncodedCommand(command) {
  const m = command.match(/-EncodedCommand\s+(\S+)/);
  if (!m) return null;
  return Buffer.from(m[1], 'base64').toString('utf16le');
}

/** The single command string passed to execSync on its first (only) call. */
function firstCommand() {
  return execSync.mock.calls[0][0];
}

beforeEach(() => {
  execSync.mockReset();
  // Default: a successful, silent shell call returning nothing.
  execSync.mockReturnValue('');
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

describe('Dialogs.messageBox', () => {
  it('invokes powershell with an -EncodedCommand carrying the message & title', () => {
    Dialogs.messageBox('Hello world', 'My Title');

    expect(execSync).toHaveBeenCalledTimes(1);
    const cmd = firstCommand();
    expect(cmd).toStartWith('powershell -NoProfile -EncodedCommand ');

    const script = decodeEncodedCommand(cmd);
    expect(script).toInclude("[System.Windows.Forms.MessageBox]::Show(");
    expect(script).toInclude("'Hello world'");
    expect(script).toInclude("'My Title'");
  });

  it("defaults the title to 'Message' when omitted", () => {
    Dialogs.messageBox('Just a message');
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'Message'");
  });

  it('doubles single quotes in the message and title (PowerShell escaping)', () => {
    Dialogs.messageBox("it's a 'quote'", "o'clock");
    const script = decodeEncodedCommand(firstCommand());
    // every ' becomes '' inside the literal
    expect(script).toInclude("'it''s a ''quote'''");
    expect(script).toInclude("'o''clock'");
  });

  it('swallows execSync errors and does not throw (catch branch)', () => {
    execSync.mockImplementation(() => { throw new Error('powershell missing'); });
    expect(() => Dialogs.messageBox('boom', 'T')).not.toThrow();
    expect(execSync).toHaveBeenCalledTimes(1);
  });

  it('swallows the TypeError when message is not a string (replace runs inside try)', () => {
    // message.replace(...) sits INSIDE the try block, so a non-string message
    // raises a TypeError that the catch swallows — no throw, no execSync call.
    expect(() => Dialogs.messageBox(null, 'T')).not.toThrow();
    expect(execSync).not.toHaveBeenCalled();
  });
});

describe('Dialogs.warningBox', () => {
  it('delegates to messageBox and returns null by default (stop=false)', () => {
    const result = Dialogs.warningBox('careful', 'Heads up');

    expect(result).toBeNull();
    expect(execSync).toHaveBeenCalledTimes(1);
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'careful'");
    expect(script).toInclude("'Heads up'");
  });

  it('defaults the title to "Warning"', () => {
    Dialogs.warningBox('careful');
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'Warning'");
  });

  it('throws an Error carrying the message when stop=true', () => {
    expect(() =>
      Dialogs.warningBox('stop now', 'Warning', Dialogs.Icons.Exclamation, Dialogs.Buttons.OK, true),
    ).toThrow('stop now');
    // the message box is still shown before throwing
    expect(execSync).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogs.errorBox', () => {
  it('delegates to messageBox and returns null by default (stop=false)', () => {
    const result = Dialogs.errorBox('it broke', 'Failure');

    expect(result).toBeNull();
    expect(execSync).toHaveBeenCalledTimes(1);
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'it broke'");
    expect(script).toInclude("'Failure'");
  });

  it('defaults the title to "Error"', () => {
    Dialogs.errorBox('it broke');
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'Error'");
  });

  it('throws an Error carrying the message when stop=true', () => {
    expect(() =>
      Dialogs.errorBox('fatal', 'Error', Dialogs.Icons.Stop, Dialogs.Buttons.OK, true),
    ).toThrow('fatal');
    expect(execSync).toHaveBeenCalledTimes(1);
  });
});

describe('Dialogs.openFileDialog', () => {
  it('returns the trimmed path printed by the dialog', () => {
    execSync.mockReturnValue('  C:\\docs\\file.docx \r\n');
    const result = Dialogs.openFileDialog();
    expect(result).toBe('C:\\docs\\file.docx');
  });

  it('uses an inline -Command powershell invocation, not -EncodedCommand', () => {
    execSync.mockReturnValue('C:\\x.docx');
    Dialogs.openFileDialog();
    const cmd = firstCommand();
    expect(cmd).toInclude('powershell -NoProfile -Command');
    expect(cmd).not.toInclude('-EncodedCommand');
  });

  it('embeds the (escaped) initial directory in the script', () => {
    execSync.mockReturnValue('C:\\x.docx');
    Dialogs.openFileDialog("D:\\It's Mine");
    const cmd = firstCommand();
    // single quotes doubled for PowerShell
    expect(cmd).toInclude("$dlg.InitialDirectory = 'D:\\It''s Mine'");
  });

  it("defaults the initial directory to D:\\Projects", () => {
    execSync.mockReturnValue('C:\\x.docx');
    Dialogs.openFileDialog();
    expect(firstCommand()).toInclude("$dlg.InitialDirectory = 'D:\\Projects'");
  });

  it('returns null when the dialog prints nothing (no selection)', () => {
    execSync.mockReturnValue('   \r\n');
    expect(Dialogs.openFileDialog()).toBeNull();
  });

  it('returns null when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('powershell missing'); });
    expect(Dialogs.openFileDialog()).toBeNull();
  });
});

describe('Dialogs.inputBox', () => {
  it('returns the trimmed entered text', () => {
    execSync.mockReturnValue('  user typed this  \r\n');
    expect(Dialogs.inputBox()).toBe('user typed this');
  });

  it('encodes a script carrying the prompt, title and default value', () => {
    execSync.mockReturnValue('x');
    Dialogs.inputBox('Your name?', 'Name Entry', 'John');
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude('[Microsoft.VisualBasic.Interaction]::InputBox(');
    expect(script).toInclude("'Your name?'");
    expect(script).toInclude("'Name Entry'");
    expect(script).toInclude("'John'");
  });

  it('doubles single quotes in prompt/title/default', () => {
    execSync.mockReturnValue('x');
    Dialogs.inputBox("don't", "can't", "won't");
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("'don''t'");
    expect(script).toInclude("'can''t'");
    expect(script).toInclude("'won''t'");
  });

  it('returns null for empty / whitespace-only output', () => {
    execSync.mockReturnValue('   \r\n');
    expect(Dialogs.inputBox()).toBeNull();
  });

  it('returns null when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('boom'); });
    expect(Dialogs.inputBox()).toBeNull();
  });
});

describe('Dialogs.multilineInputBox', () => {
  it('returns the entered text with the trailing newline stripped but inner breaks kept', () => {
    execSync.mockReturnValue('line one\nline two\r\n');
    expect(Dialogs.multilineInputBox()).toBe('line one\nline two');
  });

  it('encodes a WinForms script carrying the prompt, title and default value', () => {
    execSync.mockReturnValue('text');
    Dialogs.multilineInputBox('Type a lot', 'Editor', 'seed value');
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude('System.Windows.Forms.Form');
    expect(script).toInclude("$form.Text = 'Editor'");
    expect(script).toInclude("$label.Text = 'Type a lot'");
    expect(script).toInclude("$textBox.Text = 'seed value'");
  });

  it('coerces a non-string default value via String() before escaping', () => {
    execSync.mockReturnValue('text');
    Dialogs.multilineInputBox('p', 't', 12345);
    const script = decodeEncodedCommand(firstCommand());
    expect(script).toInclude("$textBox.Text = '12345'");
  });

  it('returns null for empty / whitespace-only output', () => {
    execSync.mockReturnValue('   \r\n');
    expect(Dialogs.multilineInputBox()).toBeNull();
  });

  it('returns null when execSync throws', () => {
    execSync.mockImplementation(() => { throw new Error('boom'); });
    expect(Dialogs.multilineInputBox()).toBeNull();
  });
});
