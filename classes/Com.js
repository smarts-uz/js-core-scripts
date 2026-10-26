import fs from 'node:fs';
import path from 'path';
import { execSync } from 'child_process';

/**
 * Shared Windows-COM robustness helpers for the winax-driven Office classes
 * (Word / Excels / PowerPoints / Homoglyph). Centralizes the two patterns every
 * COM driver needs so the logic lives in exactly one place:
 *
 *   1. Orphaned-process cleanup — snapshot the running PIDs of an Office image
 *      before creating the COM object, then in `finally` kill ONLY the PID(s)
 *      this run newly spawned (a crash-orphaned instance), never one the user
 *      already had open. See {@link Com.pidsOf} + {@link Com.killOrphans}.
 *   2. Safe-open with repair fallback — try a plain open first, then a
 *      per-application repair mode (Word OpenAndRepair / Excel CorruptLoad /
 *      PowerPoint read-only). See {@link Com.openWord}/{@link Com.openWorkbook}/
 *      {@link Com.openPresentation}.
 *
 * Pure JS — no winax import. The COM objects are passed in by the caller, so
 * this module stays trivially unit-testable with a fake app object.
 */
export class Com {
  static getPidConfigPath() {
    const root = process.env.PROJECT_ROOT || path.resolve(import.meta.dirname, '..');
    return path.join(root, 'pid.json');
  }

  static isProcessAlive(pid) {
    if (!pid) return false;
    if (isNaN(Number(pid))) return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch (_) {
      return false;
    }
  }

  static getProcessDetails(pid) {
    if (!pid) return null;
    if (isNaN(Number(pid))) return null;
    try {
      const script = `Get-CimInstance Win32_Process -Filter 'ProcessId = ${pid}' | Select-Object ProcessId, Name, CommandLine | ConvertTo-Json`;
      const out = execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8', windowsHide: true }).trim();
      if (!out) return null;
      const parsed = JSON.parse(out);
      return {
        pid: Number(parsed.ProcessId),
        name: String(parsed.Name || ''),
        cmdline: String(parsed.CommandLine || '')
      };
    } catch (_) {
      return null;
    }
  }

  static getRunningOfficeNodes(excludePid = null) {
    try {
      const script = "Get-CimInstance Win32_Process -Filter 'Name = ''node.exe''' | Select-Object ProcessId, CommandLine | ConvertTo-Json";
      const out = execSync(`powershell -NoProfile -Command "${script}"`, { encoding: 'utf8', windowsHide: true }).trim();
      if (!out) return [];
      const parsed = JSON.parse(out);
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const officePattern = /(?:excels?|words?|powerpoints?|pptx|xlsx|docx|winax)/i;
      const results = [];
      for (const p of list) {
        const pid = Number(p.ProcessId);
        if (excludePid !== null) {
          if (pid === Number(excludePid)) {
            continue;
          }
        }
        const cmdline = String(p.CommandLine || '');
        if (officePattern.test(cmdline)) {
          results.push({ pid, cmdline });
        }
      }
      return results;
    } catch (_) {
      return [];
    }
  }

  static readPidConfig() {
    const configPath = this.getPidConfigPath();
    if (!fs.existsSync(configPath)) {
      return { word: [], excel: [] };
    }
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const normalize = (arr) => {
        if (!Array.isArray(arr)) return [];
        return arr
          .map((item) => {
            switch (typeof item) {
              case 'number': {
                return { pid: Number(item), ownerPid: null };
              }
              case 'object': {
                if (!item) return null;
                const pid = Number(item.pid);
                if (!pid) return null;
                if (isNaN(pid)) return null;
                const ownerPid = item.ownerPid ? Number(item.ownerPid) : null;
                return { pid, ownerPid };
              }
              default: {
                const num = Number(item);
                const isValid = !isNaN(num) && num > 0;
                return isValid ? { pid: num, ownerPid: null } : null;
              }
            }
          })
          .filter(Boolean);
      };
      return {
        word: normalize(parsed?.word),
        excel: normalize(parsed?.excel)
      };
    } catch (_) {
      return { word: [], excel: [] };
    }
  }

  static writePidConfig(data) {
    const configPath = this.getPidConfigPath();
    const cleanList = (arr) => {
      if (!Array.isArray(arr)) return [];
      const seen = new Set();
      const result = [];
      for (const item of arr) {
        const pid = typeof item === 'object' && item !== null ? Number(item.pid) : Number(item);
        if (!pid) continue;
        if (isNaN(pid)) continue;
        if (seen.has(pid)) continue;
        seen.add(pid);
        const ownerPid = typeof item === 'object' && item !== null && item.ownerPid ? Number(item.ownerPid) : null;
        result.push(ownerPid ? { pid, ownerPid } : { pid });
      }
      return result;
    };
    const payload = {
      word: cleanList(data?.word),
      excel: cleanList(data?.excel)
    };
    try {
      fs.writeFileSync(configPath, JSON.stringify(payload, null, 2) + '\n', 'utf8');
    } catch (err) {
      console.warn(`[Com.writePidConfig] ⚠️ Could not write pid.json: ${err.message}`);
    }
  }

  static cleanupPidsBefore(appType) {
    const isExcel = String(appType).toLowerCase() === 'excel';
    const key = isExcel ? 'excel' : 'word';
    const imageName = isExcel ? 'EXCEL.EXE' : 'WINWORD.EXE';

    const config = this.readPidConfig();
    const recordedEntries = config[key] || [];
    if (recordedEntries.length === 0) return;

    const runningPids = this.pidsOf(imageName);
    const activeOfficeNodes = this.getRunningOfficeNodes(process.pid);
    const activeNodePids = new Set(activeOfficeNodes.map((n) => n.pid));

    const remaining = [];

    for (const entry of recordedEntries) {
      const pid = entry.pid;
      const nodePid = entry.nodePid || entry.ownerPid;

      // If another active node process is currently running an Office script, preserve its PID
      if (nodePid) {
        if (activeNodePids.has(nodePid)) {
          remaining.push(entry);
          console.info(`[Com.cleanupPidsBefore] 🛡️ Preserved active sibling ${imageName} PID ${pid} (owner Node PID ${nodePid})`);
          continue;
        }
      }

      // If no other node.exe is running Office scripts (or this entry's owner is dead), kill it if process name matches
      switch (runningPids.has(pid)) {
        case true: {
          try {
            process.kill(pid);
            console.warn(`[Com.cleanupPidsBefore] 🪓 Force-closed orphaned ${imageName} PID ${pid}`);
          } catch (_) {
            try {
              execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true });
              console.warn(`[Com.cleanupPidsBefore] 🪓 taskkill forced ${imageName} PID ${pid}`);
            } catch (e) {
              console.warn(`[Com.cleanupPidsBefore] ⚠️ Could not kill PID ${pid}: ${e.message}`);
            }
          }
          break;
        }
        default: {
          console.log(`[Com.cleanupPidsBefore] PID ${pid} is not running ${imageName}, removing from pid.json.`);
          break;
        }
      }
    }

    config[key] = remaining;
    this.writePidConfig(config);
  }

  static recordPid(appType, pid) {
    if (!pid) return;
    if (isNaN(Number(pid))) return;
    const key = String(appType).toLowerCase() === 'excel' ? 'excel' : 'word';
    const numPid = Number(pid);
    const config = this.readPidConfig();
    const exists = config[key].some((e) => e.pid === numPid);
    if (!exists) {
      const details = this.getProcessDetails(numPid);
      const name = details?.name || (key === 'excel' ? 'EXCEL.EXE' : 'WINWORD.EXE');
      const cmdline = details?.cmdline || '';
      const nodeCmdline = process.argv.join(' ');
      config[key].push({
        pid: numPid,
        name,
        cmdline,
        nodePid: process.pid,
        nodeCmdline
      });
      this.writePidConfig(config);
      console.info(`[Com.recordPid] 📝 Recorded ${key} PID ${numPid} (${name}) to pid.json with full cmdline`);
    }
  }

  static unrecordPid(appType, pid) {
    if (!pid) return;
    if (isNaN(Number(pid))) return;
    const key = String(appType).toLowerCase() === 'excel' ? 'excel' : 'word';
    const numPid = Number(pid);
    const config = this.readPidConfig();
    config[key] = config[key].filter((e) => e.pid !== numPid);
    this.writePidConfig(config);
    console.info(`[Com.unrecordPid] 🗑️ Removed ${key} PID ${numPid} from pid.json`);
  }

  static trackPid(appType, beforeSet, appInstance = null) {
    let pid = null;
    const isExcel = String(appType).toLowerCase() === 'excel';
    if (isExcel) {
      if (appInstance) {
        try {
          pid = appInstance.ExecuteExcel4Macro('CALL("kernel32","GetCurrentProcessId","J")');
        } catch (_) {}
      }
    }
    if (!pid) {
      if (beforeSet) {
        const imageName = isExcel ? 'EXCEL.EXE' : 'WINWORD.EXE';
        const after = this.pidsOf(imageName);
        pid = [...after].find((p) => !beforeSet.has(p));
      }
    }
    if (pid) {
      this.recordPid(appType, pid);
    }
    return pid;
  }

  static killRecordedPid(appType, pid) {
    if (!pid) return;
    if (isNaN(Number(pid))) return;
    const numPid = Number(pid);
    const isExcel = String(appType).toLowerCase() === 'excel';
    const imageName = isExcel ? 'EXCEL.EXE' : 'WINWORD.EXE';
    const runningPids = this.pidsOf(imageName);

    if (runningPids.has(numPid)) {
      try {
        process.kill(numPid);
        console.warn(`[Com.killRecordedPid] 🪓 Killed ${imageName} PID ${numPid}`);
      } catch (_) {
        try {
          execSync(`taskkill /PID ${numPid} /F /T`, { windowsHide: true });
        } catch (_) {}
      }
    }
    this.unrecordPid(appType, numPid);
  }
  /**
   * Returns the set of currently-running PIDs for a given image name
   * (e.g. "WINWORD.EXE"). Reads `tasklist` CSV — empty set when none run or on
   * any error (non-Windows, tasklist absent, …).
   *
   * @param {string} imageName Process image name, e.g. "WINWORD.EXE".
   * @returns {Set<number>} The PIDs currently running that image.
   */
  static pidsOf(imageName) {
    try {
      const out = execSync(
        `tasklist /FI "IMAGENAME eq ${imageName}" /FO CSV /NH`,
        { encoding: 'utf8', windowsHide: true }
      );
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const m = line.match(/^"[^"]*","(\d+)"/);
        if (m) pids.add(Number(m[1]));
      }
      return pids;
    } catch (_) {
      return new Set();
    }
  }

  /**
   * Kills any process of `imageName` whose PID is NOT in `before` — i.e. an
   * instance this run spawned that `Quit()`/`winax.release()` failed to close
   * (the orphaned-process case after a COM error). PIDs present before the run
   * are left untouched so a user's own open Office app is never killed.
   *
   * @param {string} imageName Process image name, e.g. "WINWORD.EXE".
   * @param {Set<number>} before PIDs captured before the COM object was created.
   * @returns {number} How many orphaned processes were killed.
   */
  static killOrphans(imageName, before) {
    const after = this.pidsOf(imageName);
    const appType = imageName.toUpperCase().includes('EXCEL') ? 'excel' : 'word';
    let killed = 0;
    for (const pid of after) {
      if (before.has(pid)) continue;
      try {
        process.kill(pid);
        killed++;
        console.warn(`[Com.killOrphans] 🪓 Killed orphaned ${imageName} PID ${pid}`);
      } catch (err) {
        try {
          execSync(`taskkill /PID ${pid} /F /T`, { windowsHide: true });
          killed++;
        } catch (_) {
          console.warn(`[Com.killOrphans] ⚠️ Could not kill PID ${pid}: ${err.message}`);
        }
      }
      this.unrecordPid(appType, pid);
    }
    return killed;
  }

  /**
   * Opens a Word document via a passed-in Word.Application COM object, falling
   * back to OpenAndRepair when a plain open fails on a mildly damaged file.
   *
   * @param {object} wordApp  A Word.Application COM object.
   * @param {string} filePath Path to the .docx.
   * @param {{readOnly?: boolean}} [opts]
   * @returns {object} The opened Document.
   */
  static openWord(wordApp, filePath, { readOnly = false } = {}) {
    const absPath = path.resolve(filePath);

    // Mode 1 — plain open (the form the codebase already uses successfully).
    try {
      return wordApp.Documents.Open(absPath, false, readOnly);
    } catch (err) {
      console.warn(`[Com.openWord] ↩️ Normal open failed: ${err.message}. Trying repair mode…`);
    }

    // Mode 2 — Open with OpenAndRepair=true. Pass null (VT_NULL) for skipped
    // optional params winax accepts.
    //   Open(FileName, ConfirmConversions, ReadOnly, AddToRecentFiles,
    //        PasswordDocument, PasswordTemplate, Revert, WritePasswordDocument,
    //        WritePasswordTemplate, Format, Encoding, Visible, OpenConflictDocument,
    //        OpenAndRepair, …)
    try {
      const doc = wordApp.Documents.Open(
        absPath,
        false,    // ConfirmConversions
        readOnly, // ReadOnly
        false,    // AddToRecentFiles
        null,     // PasswordDocument
        null,     // PasswordTemplate
        false,    // Revert
        null,     // WritePasswordDocument
        null,     // WritePasswordTemplate
        null,     // Format
        null,     // Encoding
        false,    // Visible
        null,     // OpenConflictDocument
        null,     // OpenAndConvert / placeholder
        true      // OpenAndRepair
      );
      console.warn(`[Com.openWord] ⚠️ Opened "${absPath}" in repair mode (OpenAndRepair=true).`);
      return doc;
    } catch (err) {
      console.warn(`[Com.openWord] ↩️ Repair-mode open failed: ${err.message}. Trying read-only fallback…`);
    }

    // Mode 3 — force ReadOnly=true. Both prior modes need an exclusive lock;
    // when the file is already open elsewhere (another Word session holds it),
    // both fail with the same RPC/lock error. A read-only open only needs a
    // shared lock, so it succeeds even while the file is open elsewhere.
    if (!readOnly) {
      try {
        const doc = wordApp.Documents.Open(absPath, false, true);
        console.warn(`[Com.openWord] ⚠️ Opened "${absPath}" read-only (file locked by another process).`);
        return doc;
      } catch (err) {
        throw new Error(`Com.openWord: Unable to open "${absPath}" even read-only. Last error: ${err.message}`);
      }
    }

    throw new Error(`Com.openWord: Unable to open "${absPath}" even in repair mode.`);
  }

  /**
   * Opens a presentation via a passed-in PowerPoint.Application COM object,
   * falling back to a read-only open when a plain open fails (the closest
   * PowerPoint analogue to repair mode — PowerPoint has no CorruptLoad flag).
   *
   * @param {object} pptApp   A PowerPoint.Application COM object.
   * @param {string} filePath Path to the .pptx.
   * @param {{readOnly?: boolean}} [opts]
   * @returns {object} The opened Presentation.
   */
  static openPresentation(pptApp, filePath, { readOnly = false } = {}) {
    const absPath = path.resolve(filePath);
    // Open(FileName, ReadOnly, Untitled, WithWindow) — msoTrue=-1, msoFalse=0.
    const ro = readOnly ? -1 : 0;
    try {
      return pptApp.Presentations.Open(absPath, ro, 0, 0);
    } catch (err) {
      console.warn(`[Com.openPresentation] ↩️ Normal open failed: ${err.message}. Trying read-only…`);
    }
    try {
      const pres = pptApp.Presentations.Open(absPath, -1, 0, 0);
      console.warn(`[Com.openPresentation] ⚠️ Opened "${absPath}" read-only.`);
      return pres;
    } catch (err) {
      throw new Error(`Com.openPresentation: Unable to open "${absPath}". Last error: ${err.message}`);
    }
  }

  /**
   * Opens an Excel workbook via a passed-in Excel.Application COM object,
   * silently falling back to Excel's repair/extract-data recovery modes when
   * the file has problematic content (the modes Excel's "We found a problem…
   * recover?" dialog offers).
   *
   *   CorruptLoad: 0 = xlNormalLoad, 1 = xlRepairFile, 2 = xlExtractData.
   *
   * @param {object} excelApp A Excel.Application COM object.
   * @param {string} filePath Path to the .xlsx.
   * @param {{updateLinks?: number, readOnly?: boolean}} [opts]
   * @returns {object} The opened Workbook.
   */
  static openWorkbook(excelApp, filePath, { updateLinks = 0, readOnly = false } = {}) {
    const absPath = path.resolve(filePath);

    // Mode 1 — plain open. winax/OLE does not always accept `undefined` in the
    // middle of a positional argument list, so keep this form short.
    try {
      return excelApp.Workbooks.Open(absPath, updateLinks, readOnly);
    } catch (err) {
      console.warn(`[Com.openWorkbook] ↩️ Normal open failed: ${err.message}. Trying repair mode…`);
    }

    // Modes 2 & 3 — CorruptLoad fallback. Pass `null` (VT_NULL) for the optional
    // params; `undefined` tends to surface as "Open method ... failed".
    const callWithCorruptLoad = (corruptLoad) =>
      excelApp.Workbooks.Open(
        absPath,
        updateLinks, // UpdateLinks
        readOnly,    // ReadOnly
        null,        // Format
        null,        // Password
        null,        // WriteResPassword
        true,        // IgnoreReadOnlyRecommended
        null,        // Origin
        null,        // Delimiter
        null,        // Editable
        false,       // Notify
        null,        // Converter
        false,       // AddToMru
        null,        // Local
        corruptLoad  // CorruptLoad
      );

    try {
      const wb = callWithCorruptLoad(1);
      console.warn(`[Com.openWorkbook] ⚠️ Opened "${absPath}" in repair mode (CorruptLoad=1).`);
      return wb;
    } catch (err) {
      console.warn(`[Com.openWorkbook] ↩️ Repair-mode open failed: ${err.message}. Trying extract-data mode…`);
    }

    try {
      const wb = callWithCorruptLoad(2);
      console.warn(`[Com.openWorkbook] ⚠️ Opened "${absPath}" in extract-data mode (CorruptLoad=2).`);
      return wb;
    } catch (err) {
      throw new Error(`Com.openWorkbook: Unable to open "${absPath}" even with repair/extract-data modes. Last error: ${err.message}`);
    }
  }
}
