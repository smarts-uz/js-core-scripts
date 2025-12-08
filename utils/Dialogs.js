import fs, { existsSync } from 'fs';
import path from 'path';
import { exec, execSync } from "child_process";
import dotenv from 'dotenv';
import winax from 'winax';
import { execFileSync } from "child_process";
import { notifier } from "node-notifier";


export class Dialogs {


  // windows notification function
  static notify(message, title = "Message") {
    try {

      notifier.notify(
        {
          title: title,
          message: message,
          icon: null, // Absolute path (doesn't work on balloons)
          sound: true, // Only Notification Center or Windows Toasters
          wait: true // Wait with callback, until user action is taken against notification, does not apply to Windows Toasters as they always wait or notify-send as it does not support the wait option
        },
        function (err, response, metadata) {
          // Response is response from notification
          // Metadata contains activationType, activationAt, deliveredAt
          console.error(response, metadata);
        }
      );

      notifier.on('click', function (notifierObject, options, event) {
        // Triggers if `wait: true` and user clicks notification
      });

      notifier.on('timeout', function (notifierObject, options) {
        // Triggers if `wait: true` and notification closes
      });
      // Use -EncodedCommand to avoid shell escaping issues
    }
  }


  static warningBox(message, title, type = 16) {
    console.error(message);
    this.messageBoxAx(message, title, type);
    throw new Error(message);

  }


  // === MessageBox Helper (native Windows via WinAX) ===
  static messageBoxAx(msg, title = "Message", type = 64) {
    const shell = new winax.Object("WScript.Shell");
    return shell.Popup(msg, 0, title, type);
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
