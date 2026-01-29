import fs, { existsSync } from 'fs';
import path from 'path';
import { exec, execSync } from "child_process";
import dotenv from 'dotenv';
import winax from 'winax';
import { execFileSync } from "child_process";
import notifier from "node-notifier";
import { fileURLToPath } from "url";


export const Buttons = {

  /**
   * 
   * v 0

Show OK button.

1

Show OK and Cancel buttons.

2

Show Abort, Retry, and Ignore buttons.

3

Show Yes, No, and Cancel buttons.

4

Show Yes and No buttons.

5

Show Retry and Cancel buttons.
   */


  OK: 0,
  OKCancel: 1,
  AbortRetryIgnore: 2,
  YesNoCancel: 3,
  YesNo: 4,
  RetryCancel: 5

}

export const Icons = {
  /**
   * 
   * 16
   * Show "Stop Mark" icon.
   * 32
   * Show "Question Mark" icon.
   * 48
   * Show "Exclamation Mark" icon.
   * 64
   * Show "Information Mark" icon.
   */

  Stop: 16,
  Question: 32,
  Exclamation: 48,
  Information: 64


}

export class Dialogs {


  
  // === MessageBox Helper (native Windows via WinAX) ===
  static messageBoxAx(msg, title = "Message", icon = Icons.Information, buttons = Buttons.OK) {
    const shell = new winax.Object("WScript.Shell");
    return shell.Popup(msg, 0, title, icon + buttons);
  }


  static warningBox(message, title = "Warning", icon = Icons.Exclamation, buttons = Buttons.OK, stop = false) {
    console.warn(title, message);
    this.messageBoxAx(message, title, icon, buttons);
    if (stop) throw new Error(message);
    return null
  }

  
  static errorBox(message, title = "Error", icon = Icons.Stop, buttons = Buttons.OK, stop = false) {
    console.error(title, message);
    this.messageBoxAx(message, title, icon, buttons);
    if (stop) throw new Error(message);
    return null
  }


  

  // create messagebox for windows
  static messageBox(message, title = 'Message') {
    try {
      // Properly escape the message and title for PowerShell
      // Escape single quotes by doubling them (PowerShell string literal escaping)
      const escapedMessage = message.replace(/'/g, "''");
      const escapedTitle = title.replace(/'/g, "''");

      // Create the PowerShell script with properly escaped strings
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${escapedMessage}', '${escapedTitle}')`;

      // Use -EncodedCommand to avoid shell escaping issues
      const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
      execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`);
    } catch (err) {
      console.error("Error opening message box:", err.message);
    }
  }

  static openFileDialog(initialDir = "D:\\Projects") {
    // Properly escape single quotes by doubling them for PowerShell
    const escapedInitialDir = initialDir.replace(/'/g, "''");

    const psScript = `
    Add-Type -AssemblyName System.Windows.Forms
    $dlg = New-Object System.Windows.Forms.OpenFileDialog
    $dlg.InitialDirectory = '${escapedInitialDir}'
    $dlg.Filter = 'Word Documents (*.doc;*.docx)|*.doc;*.docx|All Files (*.*)|*.*'
    if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        Write-Output $dlg.FileName
    }
    `;

    try {
      // Inline PowerShell script with -NoProfile to avoid user profile issues
      const filePath = execSync(
        `powershell -NoProfile -Command "${psScript.replace(/\n/g, ';')}"`,
        { encoding: "utf8" }
      ).trim();

      if (filePath) {
        console.log("Selected file:", filePath);
        return filePath;
      } else {
        console.log("No file selected.");
        return null;
      }
    } catch (err) {
      console.error("Error opening dialog:", err.message);
      return null;
    }
  }


}
