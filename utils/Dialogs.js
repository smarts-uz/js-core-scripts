import fs, { existsSync } from 'fs';
import path from 'path';
import { exec, execSync } from "child_process";
import dotenv from 'dotenv';
import winax from 'winax';
import { execFileSync } from "child_process";
import notifier from "node-notifier";
import { fileURLToPath } from "url";


export class Dialogs {


  // windows notification function
  static notify(message, title = "Message") {
    try {


      // __dirname workaround for ESM
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      notifier.notify(
        {
          title: title,
          message: message,
          icon: null,  // Absolute path
          sound: true,
          wait: true
        },
        (err, response, metadata) => {
          // Response from notification
          // metadata: activationType, activationAt, deliveredAt
        }
      );

      // Events
      notifier.on("click", (notifierObject, options, event) => {
        // Fires when user clicks (with wait: true)
      });

      notifier.on("timeout", (notifierObject, options) => {
        // Fires when notification closes (with wait: true)
      });

    } catch (err) {
      console.error(err);
      this.messageBox(message, title);
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
