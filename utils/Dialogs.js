import { execSync } from "child_process";



export class Dialogs {


  static Buttons = {

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

  static Icons = {
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


  static warningBox(message, title = "Warning", icon = this.Icons.Exclamation, buttons = this.Buttons.OK, stop = false) {
      console.info(`[Dialogs.warningBox] 🟢 Starting...`);
    console.warn(`[Dialogs.warningBox] ⚠️ Triggered: [${title}] ${message}`);
    this.messageBox(message, title);
    if (stop) {
       console.error(`[Dialogs.warningBox] 🛑 Stopping execution due to warning.`);
       throw new Error(message);
    }
    return null;
  }


  static errorBox(message, title = "Error", icon = this.Icons.Stop, buttons = this.Buttons.OK, stop = false) {
      console.info(`[Dialogs.errorBox] 🟢 Starting...`);
    console.error(title, message);
    this.messageBox(message, title);
    if (stop) throw new Error(message);
    return null
  }




  static messageBox(message, title = 'Message') {
      console.info(`[Dialogs.messageBox] 🟢 Starting...`);
    console.info(`[Dialogs.messageBox] 💬 Opening native message box: [${title}]`);
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
      console.log(`[Dialogs.messageBox] ✅ Native message box closed successfully.`);
    } catch (err) {
      console.error(`[Dialogs.messageBox] ❌ Error opening message box:`, err.message);
    }
  }

  static openFileDialog(initialDir = "D:\\Projects") {
    console.info(`[Dialogs.openFileDialog] 🟢 Starting...`);
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

  /**
   * Show a native Windows input dialog and return the entered text.
   * Returns null if the user cancels or leaves the field empty.
   * @param {string} prompt       - The message shown to the user.
   * @param {string} title        - Dialog window title.
   * @param {string} defaultValue - Pre-filled value in the input field.
   * @returns {string|null}
   */
  static inputBox(prompt = 'Enter value:', title = 'Input', defaultValue = '') {
    console.info(`[Dialogs.inputBox] 🟢 Starting...`);
    const esc = s => s.replace(/'/g, "''");
    const psScript = `
[void][Reflection.Assembly]::LoadWithPartialName('Microsoft.VisualBasic')
$result = [Microsoft.VisualBasic.Interaction]::InputBox('${esc(prompt)}', '${esc(title)}', '${esc(defaultValue)}')
Write-Output $result
`.trim();

    try {
      const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
      const output = execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`, { encoding: 'utf8' }).trim();
      return output.length > 0 ? output : null;
    } catch (err) {
      console.error('Error opening input box:', err.message);
      return null;
    }
  }

  /**
   * Show a native Windows multi-line input dialog (a resizable WinForms window
   * with a multi-line text box) and return the entered text, preserving internal
   * line breaks. Enter inserts a new line; the user submits with the OK button.
   * Returns null if the user cancels or leaves the field empty.
   * @param {string} prompt       - The message shown above the text box.
   * @param {string} title        - Dialog window title.
   * @param {string} defaultValue - Pre-filled value in the text box.
   * @returns {string|null}
   */
  static multilineInputBox(prompt = 'Enter text:', title = 'Input', defaultValue = '') {
    console.info(`[Dialogs.multilineInputBox] 🟢 Starting...`);
    const esc = s => String(s).replace(/'/g, "''");
    // A bare WinForms form: a label, a multi-line text box (Enter = newline,
    // so AcceptButton is intentionally NOT set), and OK / Cancel buttons. Only
    // the OK branch writes the text, so Cancel / Esc yields empty output → null.
    const psScript = `
[void][Reflection.Assembly]::LoadWithPartialName('System.Windows.Forms')
[void][Reflection.Assembly]::LoadWithPartialName('System.Drawing')
$form = New-Object System.Windows.Forms.Form
$form.Text = '${esc(title)}'
$form.StartPosition = 'CenterScreen'
$form.Size = New-Object System.Drawing.Size(640, 480)
$form.MinimumSize = New-Object System.Drawing.Size(400, 300)
$form.TopMost = $true
$label = New-Object System.Windows.Forms.Label
$label.Text = '${esc(prompt)}'
$label.AutoSize = $false
$label.Location = New-Object System.Drawing.Point(12, 10)
$label.Size = New-Object System.Drawing.Size(600, 40)
$label.Anchor = 'Top, Left, Right'
$form.Controls.Add($label)
$textBox = New-Object System.Windows.Forms.TextBox
$textBox.Multiline = $true
$textBox.AcceptsReturn = $true
$textBox.ScrollBars = 'Vertical'
$textBox.WordWrap = $true
$textBox.Font = New-Object System.Drawing.Font('Consolas', 10)
$textBox.Location = New-Object System.Drawing.Point(12, 54)
$textBox.Size = New-Object System.Drawing.Size(600, 340)
$textBox.Anchor = 'Top, Bottom, Left, Right'
$textBox.Text = '${esc(defaultValue)}'
$form.Controls.Add($textBox)
$ok = New-Object System.Windows.Forms.Button
$ok.Text = 'OK'
$ok.DialogResult = [System.Windows.Forms.DialogResult]::OK
$ok.Size = New-Object System.Drawing.Size(90, 30)
$ok.Location = New-Object System.Drawing.Point(424, 404)
$ok.Anchor = 'Bottom, Right'
$form.Controls.Add($ok)
$cancel = New-Object System.Windows.Forms.Button
$cancel.Text = 'Cancel'
$cancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
$cancel.Size = New-Object System.Drawing.Size(90, 30)
$cancel.Location = New-Object System.Drawing.Point(522, 404)
$cancel.Anchor = 'Bottom, Right'
$form.Controls.Add($cancel)
$form.CancelButton = $cancel
if ($form.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $textBox.Text }
`.trim();

    try {
      const encodedScript = Buffer.from(psScript, 'utf16le').toString('base64');
      const output = execSync(`powershell -NoProfile -EncodedCommand ${encodedScript}`, { encoding: 'utf8' }).replace(/\r?\n$/, '');
      console.log(`[Dialogs.multilineInputBox] ✅ entered ${output.length} char(s)`);
      return output.trim().length > 0 ? output : null;
    } catch (err) {
      console.error('Error opening multiline input box:', err.message);
      return null;
    }
  }

}
