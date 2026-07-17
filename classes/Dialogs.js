import { execFileSync } from "child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);

export class Dialogs {

  // Run a VBScript snippet via cscript (NOT PowerShell) and return its trimmed
  // stdout. cscript emits clean UTF-8 — unlike the old PowerShell path, whose
  // UTF-16 stdout leaked garbled ("Chinese-looking") text into the terminal.
  // The .vbs is written latin1 so VBScript's default (ANSI) parser reads it.
  static _runVbs(vbsScript) {
    const file = path.join(os.tmpdir(), `js-core-dialog-${process.pid}-${Date.now()}.vbs`);
    try {
      fs.writeFileSync(file, vbsScript, "latin1");
      const out = execFileSync("cscript", ["//nologo", file], { encoding: "utf8" });
      return out.replace(/\r?\n$/, "");
    } finally {
      try { fs.unlinkSync(file); } catch { /* best-effort cleanup */ }
    }
  }

  // Escape a JS string for embedding inside a VBScript double-quoted literal:
  // doubled quotes, and CR/LF spliced via VBScript's Chr() so multi-line values survive.
  static _vbsStr(s) {
    const parts = String(s).split(/\r\n|\r|\n/).map((line) => `"${line.replace(/"/g, '""')}"`);
    return parts.join(" & vbCrLf & ");
  }


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




  static messageBox(message, title = 'Message', icon = this.Icons.Information) {
    console.info(`[Dialogs.messageBox] 🟢 Starting...`);
    console.info(`[Dialogs.messageBox] 💬 Opening native message box: [${title}]`);
    try {
      // winax COM WScript.Shell.Popup — a native message box with NO PowerShell.
      // The old PowerShell path piped UTF-16 stdout into the terminal, which the
      // console rendered as garbled "Chinese" text; COM writes nothing to stdout.
      // Popup(text, secondsToWait=0 → wait forever, title, type = buttons|icon).
      const shell = new (require("winax").Object)("WScript.Shell");
      const buttonCode = this.Buttons.OK; // 0 = OK only
      shell.Popup(String(message), 0, String(title), buttonCode + Number(icon));
      console.log(`[Dialogs.messageBox] ✅ Native message box closed successfully.`);
    } catch (err) {
      console.error(`[Dialogs.messageBox] ❌ Error opening message box:`, err.message);
    }
  }

  static openFileDialog(initialDir = "D:\\Projects") {
    console.info(`[Dialogs.openFileDialog] 🟢 Starting...`);
    // A native file-open dialog via the UserAccounts.CommonDialog COM object,
    // driven by cscript (NOT PowerShell) so stdout stays clean UTF-8.
    const vbs = `
Dim dlg, ok
Set dlg = CreateObject("UserAccounts.CommonDialog")
dlg.Filter = "Word Documents|*.doc;*.docx|All Files|*.*"
dlg.InitialDir = ${this._vbsStr(initialDir)}
ok = dlg.ShowOpen
If ok Then WScript.Echo dlg.FileName
`.trim();

    try {
      const filePath = this._runVbs(vbs).trim();
      if (filePath) {
        console.log("Selected file:", filePath);
        return filePath;
      }
      console.log("No file selected.");
      return null;
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
    // VBScript's built-in InputBox() via cscript — no PowerShell, clean UTF-8 stdout.
    const vbs = `WScript.Echo InputBox(${this._vbsStr(prompt)}, ${this._vbsStr(title)}, ${this._vbsStr(defaultValue)})`;
    try {
      const output = this._runVbs(vbs).trim();
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
    // A resizable multi-line input window via mshta (HTA) — NOT PowerShell. The
    // HTA writes the entered text to a temp file as UTF-8; we read it back and
    // delete it. Enter inserts a newline; OK submits, Cancel/close yields "".
    const outFile = path.join(os.tmpdir(), `js-core-mlinput-${process.pid}-${Date.now()}.txt`);
    const htaFile = path.join(os.tmpdir(), `js-core-mlinput-${process.pid}-${Date.now()}.hta`);
    const jsStr = (s) => JSON.stringify(String(s)); // safe JS string literal for the HTA

    const hta = `<!DOCTYPE html><html><head><title>${String(title).replace(/</g, "&lt;")}</title>
<HTA:APPLICATION ID="app" BORDER="thin" SCROLL="no" INNERBORDER="no" MAXIMIZEBUTTON="no" MINIMIZEBUTTON="no" SYSMENU="yes" />
<style>
  body{font-family:Segoe UI,Arial;margin:10px;background:#f0f0f0}
  #lbl{margin-bottom:6px;white-space:pre-wrap}
  textarea{width:100%;height:300px;font-family:Consolas,monospace;font-size:13px;box-sizing:border-box}
  .bar{margin-top:8px;text-align:right}
  button{width:90px;height:28px;margin-left:6px}
</style></head><body>
<div id="lbl"></div>
<textarea id="txt"></textarea>
<div class="bar"><button onclick="submit()">OK</button><button onclick="cancelIt()">Cancel</button></div>
<script>
  window.resizeTo(660,480);
  var fso = new ActiveXObject("Scripting.FileSystemObject");
  document.getElementById("lbl").innerText = ${jsStr(prompt)};
  document.getElementById("txt").value = ${jsStr(defaultValue)};
  document.getElementById("txt").focus();
  function writeOut(t){
    var f = fso.CreateTextFile(${jsStr(outFile)}, true, true); // unicode=true → UTF-16 file
    f.Write(t); f.Close();
  }
  function submit(){ writeOut(document.getElementById("txt").value); window.close(); }
  function cancelIt(){ writeOut(""); window.close(); }
<\/script></body></html>`;

    try {
      fs.writeFileSync(htaFile, hta, "utf8");
      // mshta blocks until the HTA window closes.
      execFileSync("mshta", [htaFile], { stdio: "ignore" });
      let output = "";
      if (fs.existsSync(outFile)) {
        // The HTA wrote a UTF-16 (unicode) file; read and strip a BOM if present.
        output = fs.readFileSync(outFile, "utf16le").replace(/^﻿/, "").replace(/\r\n/g, "\n");
      }
      console.log(`[Dialogs.multilineInputBox] ✅ entered ${output.length} char(s)`);
      return output.trim().length > 0 ? output : null;
    } catch (err) {
      console.error('Error opening multiline input box:', err.message);
      return null;
    } finally {
      try { fs.unlinkSync(htaFile); } catch { /* best-effort */ }
      try { fs.unlinkSync(outFile); } catch { /* best-effort */ }
    }
  }

}
