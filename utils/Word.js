import fs, { existsSync } from "fs";
import path from "path";
let winax;
try {
  winax = (await import("winax")).default;
} catch (e) {
  // winax not available (likely binary not built)
}
import pkg from "number-to-words-ru";
const { convert } = pkg;

import { Files } from "./Files.js";
import { Yamls } from "./Yamls.js";
import { Dialogs } from "./Dialogs.js";
import TurndownService from "turndown";
import turndownPluginGfm from "turndown-plugin-gfm";

export class Word {
  static checkWinax(methodName) {
      console.info(`[Word.checkWinax] 🟢 Starting...`);
    console.log(`[Word.checkWinax] 🔍 Checking winax availability for: ${methodName}`);
    if (!winax) {
      console.error(`[Word.checkWinax] ❌ Native automation (winax) is not available.`);
      throw new Error(
        `${methodName}: Native automation (winax) is not available. Please ensure Node-ActiveX is built for your Node.js version.`,
      );
    }
    console.info(`[Word.checkWinax] ✅ winax is available.`);
  }

  static merge(filePaths, pageBreak = true, targetDir = null) {
    console.info(`[Word.merge] 🟢 Starting...`);
    if (!filePaths || filePaths.length === 0) {
      throw new Error("No files provided to merge.");
    }

    const templateFolder = Yamls.getConfig("Templates.WordMerge");
    if (!templateFolder || !fs.existsSync(templateFolder)) {
      throw new Error(`Word template folder not found at: ${templateFolder}`);
    }

    const templatePath = Files.getLatestMatchingFile(templateFolder, ".docx");
    if (!templatePath) {
      throw new Error(
        `No latest "Basename N" .docx template found in folder: ${templateFolder}`,
      );
    }
    console.info(`[Word.merge] 📄 Using latest template: ${templatePath}`);

    const resolvedTargetDir = targetDir
      ? path.resolve(targetDir)
      : path.dirname(path.resolve(filePaths[0]));
    const parentDirName = path.basename(resolvedTargetDir);

    const proposedName = `${parentDirName}${path.extname(templatePath)}`;
    const baseTargetPath = path.join(resolvedTargetDir, proposedName);

    const targetPath = Files.incrementFileName(baseTargetPath);

    console.log(`📑 Copying template to: ${targetPath}`);
    fs.copyFileSync(templatePath, targetPath);

    console.log("Word Application starting...");
    this.checkWinax("merge");
    const wordApp = new winax.Object("Word.Application");
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0; // wdAlertsNone

    try {
      console.log(`📂 Opening target document: ${targetPath}`);
      const doc = wordApp.Documents.Open(targetPath);
      const selection = wordApp.Selection;

      for (let i = 0; i < filePaths.length; i++) {
        const sourceFile = path.resolve(filePaths[i]);
        if (!fs.existsSync(sourceFile)) {
          console.warn(`⚠️ Source file not found, skipping: ${sourceFile}`);
          continue;
        }

        console.log(
          `📌 Inserting file ${i + 1}/${filePaths.length}: ${sourceFile}`,
        );
        selection.EndKey(6); // wdStory
        selection.InsertFile(sourceFile);

        if (pageBreak && i < filePaths.length - 1) {
          selection.InsertBreak(7); // wdPageBreak
        }
      }

      console.log(`🔄 Updating Tables of Contents...`);
      const tocCount = doc.TablesOfContents.Count;
      for (let j = 1; j <= tocCount; j++) {
        doc.TablesOfContents.Item(j).Update();
      }

      console.log(`💾 Saving merged document...`);
      doc.Save();
      doc.Close(false);
      console.log(`✅ Merged successfully into: ${targetPath}`);
    } finally {
      try {
        wordApp.Quit();
      } catch (_) {}
      try {
        winax.release(wordApp);
      } catch (_) {}
    }
  }

  static mergeFolder(folderPaths, pageBreak = true) {
    console.info(`[Word.mergeFolder] 🟢 Starting...`);
    if (!folderPaths || folderPaths.length === 0) {
      throw new Error("No folders provided to mergeFolder.");
    }

    const latestFiles = [];

    for (const folder of folderPaths) {
      const resolvedFolder = path.resolve(folder);
      if (!fs.existsSync(resolvedFolder)) {
        console.warn(`⚠️ Folder not found, skipping: ${resolvedFolder}`);
        continue;
      }

      const files = fs.readdirSync(resolvedFolder);
      let latestFile = null;
      let latestTime = 0;

      for (const file of files) {
        if (!file.toLowerCase().endsWith(".docx") || file.startsWith("~$")) {
          continue;
        }

        const filePath = path.join(resolvedFolder, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile() && stats.mtimeMs > latestTime) {
          latestTime = stats.mtimeMs;
          latestFile = filePath;
        }
      }

      if (latestFile) {
        latestFiles.push(latestFile);
      } else {
        console.warn(`⚠️ No valid .docx files found in: ${resolvedFolder}`);
      }
    }

    if (latestFiles.length === 0) {
      throw new Error("No .docx files found across the provided folders.");
    }

    console.log(
      `📑 Found ${latestFiles.length} latest files to merge:\n${latestFiles.join("\n")}`,
    );
    const lastFolder = path.resolve(folderPaths[folderPaths.length - 1]);
    const lastFolderParent = path.dirname(lastFolder);
    return this.merge(latestFiles, pageBreak, lastFolderParent);
  }

  static initFolders(ymlFile) {
      console.info(`[Word.initFolders] 🟢 Starting...`);
    globalThis.ymlFile = ymlFile;
    console.info(globalThis.ymlFile, "ymlFile globalThis");

    globalThis.folderALL = path.dirname(globalThis.ymlFile);
    console.log(globalThis.folderALL, "folderALL");

    globalThis.folderCompan = path.join(globalThis.folderALL, "Compan");

    if (!fs.existsSync(globalThis.folderCompan))
      return Dialogs.warningBox(
        `Compan folder not found: ${globalThis.folderCompan}`,
        "Compan Folder not found",
      );
    else console.log(`Compan folder found: ${globalThis.folderCompan}`);

    globalThis.folderDirector = path.join(globalThis.folderALL, "Director");
    globalThis.folderFounder = path.join(globalThis.folderALL, "Founder");
    globalThis.folderSureties = path.join(globalThis.folderALL, "Sureties");
    globalThis.folderPartners = path.join(globalThis.folderALL, "Partners");
    globalThis.folderActReco = path.join(globalThis.folderALL, "ActReco");
    globalThis.folderRestAPI = path.join(globalThis.folderALL, "RestAPI");
    Files.mkdirIfNotExists(globalThis.folderRestAPI);
    globalThis.folderContract = path.join(globalThis.folderALL, "Contract");
    globalThis.folderNotifiers = path.join(globalThis.folderALL, "Notifiers");
    globalThis.folderPricings = path.join(globalThis.folderALL, "Pricings");
    globalThis.folderTelegram = path.join(globalThis.folderALL, "Telegram");
    globalThis.folderForNDS = path.join(globalThis.folderALL, "ForNDS");

    return true;
  }

  static getNumberWordOnly(num) {
    console.info(`[Word.getNumberWordOnly] 🟢 Starting...`);
    if (!num) return "";
    num = num.replace(/[,. :]/g, "");
    num = parseFloat(num);

    const full = convert(num, { currency: "number" });
    const idx = full.indexOf("целых");
    if (idx !== -1) {
      return full.slice(0, idx).trim();
    }
    return full;
  }

  static getRussianMonthName(monthNumber) {
    console.info(`[Word.getRussianMonthName] 🟢 Starting...`);
    if (!monthNumber) return "";
    monthNumber = parseInt(monthNumber);
    const date = new Date(2025, monthNumber - 1, 1);
    const monthName = new Intl.DateTimeFormat("ru-RU", {
      month: "long",
    }).format(date);
    console.info(monthName, "monthName");
    return monthName;
  }

  static getComNameInitials(name) {
    console.info(`[Word.getComNameInitials] 🟢 Starting...`);
    if (!name || typeof name !== "string") return "";
    let cleaned = this.cleanCompanyName(name);
    return cleaned
      .split(/\s+/)
      .map((word) => (word[0] ? word[0].toUpperCase() : ""))
      .join("");
  }

  static cleanCompanyName(name) {
    console.info(`[Word.cleanCompanyName] 🟢 Starting...`);
    if (!name || typeof name !== "string") return "";
    let cleaned = name.replace(/[«»"']/g, "").trim();
    cleaned = cleaned.replace(/MCHJ|AK|YaTT/g, "").trim();
    console.info(cleaned, "cleanCompanyName");
    return cleaned;
  }

  static contractNumFromFormat(data) {
    console.info(`[Word.contractNumFromFormat] 🟢 Starting...`);
    const prefix = Yamls.getConfig("Contract.Prefix");
    const format = Yamls.getConfig("Contract.Format");

    const values = {
      contractPrefix: prefix,
      Prefix: prefix,
      ComName: this.getComNameInitials(data.ComName),
      Day: data.Day,
      Month: data.Month,
      Year: data.Year,
    };

    const replaceAll = format.replace(
      /\{(contractPrefix|Prefix|ComName|Day|Month|Year)\}/g,
      (_, key) => values[key] || "",
    );
    console.log("Generated Contract Number:", replaceAll);

    return replaceAll;
  }

  static makeContract(ymlFile) {
    console.info(`[Word.makeContract] 🟢 Starting...`);
    const templatePath = path.resolve(Yamls.getConfig("Templates.Word"));
    console.log("Using template", templatePath);

    if (!existsSync(templatePath)) {
      Dialogs.warningBox(`Template file not found: ${templatePath}`, "Error");
      return;
    }

    let data = Yamls.loadYamlWithDeps(ymlFile);
    const resolvedTemplate = path.resolve(templatePath);
    console.log("Resolved template:", resolvedTemplate);

    const docBaseName = Files.getBaseName(resolvedTemplate, ".docx");
    const ymlFolder = Files.getDirName(ymlFile);
    const contractFolder = path.join(ymlFolder, "Contract");
    Files.mkdirIfNotExists(contractFolder);

    if (!data.ContractNum)
      Dialogs.warningBox(
        `Contract number not found in YAML: ${ymlFile}`,
        "Error",
      );

    const contractNumFolder = path.join(contractFolder, data.ContractNum);
    Files.mkdirIfNotExists(contractNumFolder);

    const area = data.Area;
    const outputCore = `${data.ContractNum}, ${area}-kv, ${data.MyCompany}, ${docBaseName}`;
    const outputDocxPath = path.join(contractNumFolder, `${outputCore}.docx`);
    const outputPdfPath = path.join(contractNumFolder, `${outputCore}.pdf`);

    this.wordReplace(data, templatePath, outputDocxPath, outputPdfPath);

    return { outputDocxPath, outputPdfPath };
  }

  static extractDate(date) {
    console.info(`[Word.extractDate] 🟢 Starting...`);
    if (!date || typeof date !== "string") {
      Dialogs.warningBox(`Date not found or invalid: ${date}`, "Error");
      return null;
    }

    const [day, month, year] = date.split(".");
    if (!day || !month || !year) {
      Dialogs.warningBox(`Invalid date format: ${date}`, "Error");
      return null;
    }

    return { year, month, day };
  }

  static wordReplace(data, templatePath, outputDocxPath, outputPdfPath) {
    console.info(`[Word.wordReplace] 🟢 Starting...`);
    this.checkWinax("wordReplace");

    console.log(`[Word.wordReplace] ⚙️ Creating Word.Application COM object...`);
    const word = new winax.Object("Word.Application");
    word.Visible = false;
    word.DisplayAlerts = 0; // wdAlertsNone — suppress all dialogs to prevent hangs

    let doc;
    try {
      console.log(`[Word.wordReplace] 📂 Opening template: ${path.resolve(templatePath)}`);
      doc = word.Documents.Open(path.resolve(templatePath));
      console.log(`[Word.wordReplace] ✅ Template opened.`);

      const find = doc.Content.Find;
      find.ClearFormatting();

      console.log(`[Word.wordReplace] 🔍 Reading document text for placeholders...`);
      const docContent = doc.Content.Text;
      const regex = /\[([A-Za-z0-9_]+)\]/g;
      let match;
      const placeholders = new Set();
      while ((match = regex.exec(docContent)) !== null) {
        placeholders.add(match[1]);
      }
      console.log(`[Word.wordReplace] 📋 Found ${placeholders.size} unique placeholders.`);

      for (const placeholder of placeholders) {
        let replacementText = "";
        switch (true) {
          case placeholder.endsWith("Text"): {
            const key = placeholder.replace(/Text$/, "");
            const value = data[key];
            replacementText = this.getNumberWordOnly(value);
            break;
          }
          case placeholder.endsWith("Title"): {
            const key = placeholder.replace(/Title$/, "");
            const value = data[key];
            replacementText = this.getRussianMonthName(value);
            break;
          }
          case placeholder.endsWith("Phone"): {
            const keyPhone = placeholder.replace(/Phone$/, "");
            const valuePhone = data[keyPhone + "Phone"];
            replacementText = valuePhone
              ? String(valuePhone).replace(/^998/, "+998")
              : "";
            break;
          }
          default:
            replacementText = !Files.isEmpty(data[placeholder])
              ? data[placeholder]
              : "";
        }

        console.info(`[Word.wordReplace] 🔄 Replace: [${placeholder}] → "${replacementText}"`);

        find.Text = `[${placeholder}]`;
        find.Replacement.ClearFormatting();
        find.Replacement.Text = replacementText;

        find.Execute(
          find.Text,
          false,
          false,
          false,
          false,
          false,
          true,
          1,
          false,
          find.Replacement.Text,
          2, // wdReplaceAll
        );
      }

      console.log(`[Word.wordReplace] 💾 Saving as DOCX: ${outputDocxPath}`);
      doc.SaveAs(outputDocxPath, 16); // 16 = wdFormatDocumentDefault (.docx)

      const pdfFormatCode = Number(Yamls.getConfig("Contract.PdfFormatCode"));
      console.log(`[Word.wordReplace] 💾 Saving as PDF (format ${pdfFormatCode}): ${outputPdfPath}`);
      doc.SaveAs(outputPdfPath, pdfFormatCode);

      if (existsSync(outputDocxPath))
        console.log(`[Word.wordReplace] ✅ Word yaratildi: ${outputDocxPath}`);
      if (existsSync(outputPdfPath))
        console.log(`[Word.wordReplace] ✅ PDF yaratildi: ${outputPdfPath}`);

      console.log(`[Word.wordReplace] 📕 Closing document...`);
      doc.Close(false);
    } catch (error) {
      console.error(`[Word.wordReplace] ❌ Error:`, error);
      try { doc?.Close(false); } catch (_) {}
      throw error;
    } finally {
      console.log(`[Word.wordReplace] 🧹 Quitting Word and releasing COM object...`);
      try { word.Quit(); } catch (_) {}
      try { winax.release(word); } catch (_) {}
      console.info(`[Word.wordReplace] 🔴 Finished.`);
    }
  }

  static _exportToHtml(doc, htmlPath) {
    console.log(`[Word._exportToHtml] 💾 Saving as Filtered HTML to: ${htmlPath}`);
    doc.SaveAs2(htmlPath, 10);
  }

  static _processImagesFolder(mdDir, htmlBase, targetBaseName) {
    const oldFolder = path.join(mdDir, `${htmlBase}_files`);
    const newFolder = path.join(mdDir, `${targetBaseName}_Files`);
    if (fs.existsSync(oldFolder)) {
      if (fs.existsSync(newFolder)) {
        fs.rmSync(newFolder, { recursive: true, force: true });
      }
      fs.renameSync(oldFolder, newFolder);
      console.log(`[Word._processImagesFolder] 📁 Renamed images folder to: ${newFolder}`);
    }
  }

  static _processImages(htmlContent, htmlBase, targetBaseName) {
    console.log(`[Word._processImages] 🔄 Updating image paths in HTML...`);
    const newFolderRef = `${targetBaseName}_Files`;

    // Word URL-encodes spaces in src attributes (e.g. "Rich%20Source_temp_..._files"),
    // while the on-disk folder name uses real spaces. Replace BOTH forms so the
    // generated links point at the renamed "<base>_Files" folder. Escaping the base
    // for regex avoids breaking on names with regex-special characters.
    const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rawRef = `${htmlBase}_files`;
    const encodedRef = `${encodeURI(htmlBase)}_files`; // spaces → %20, etc.

    let result = htmlContent.replace(new RegExp(escape(rawRef), "g"), newFolderRef);
    if (encodedRef !== rawRef) {
      result = result.replace(new RegExp(escape(encodedRef), "g"), newFolderRef);
    }
    return result;
  }

  /**
   * Extracts every equation from an open Word document as LaTeX, returning a list
   * of LaTeX strings in document order. Equations are linearized (UnicodeMath),
   * then converted to LaTeX. An equation that yields no usable text becomes null
   * so the caller can fall back to its exported image.
   *
   * NOTE: This mutates the in-memory document (Linearize), so it must run on a
   * throwaway copy or before the HTML export — never on a doc that will be saved.
   *
   * @param {object} doc An open Word.Document COM object.
   * @returns {(string|null)[]} LaTeX strings (or null) in equation order.
   */
  static _extractEquationsAsLatex(doc) {
    console.info(`[Word._extractEquationsAsLatex] 🟢 Starting...`);
    const latexList = [];
    let count = 0;
    try {
      count = doc.OMaths.Count;
    } catch (e) {
      console.warn(`[Word._extractEquationsAsLatex] ⚠️ OMaths not accessible: ${e.message}`);
      return latexList;
    }
    console.log(`[Word._extractEquationsAsLatex] 📐 Found ${count} equation(s).`);
    if (count === 0) return latexList;

    // Linearize converts every equation to its UnicodeMath linear form in-place.
    try {
      doc.OMaths.Linearize();
    } catch (e) {
      console.warn(`[Word._extractEquationsAsLatex] ⚠️ Linearize failed: ${e.message}`);
    }

    for (let i = 1; i <= count; i++) {
      let linear = "";
      try {
        linear = String(doc.OMaths.Item(i).Range.Text || "");
      } catch (e) {
        console.warn(`[Word._extractEquationsAsLatex] ⚠️ eq ${i} read failed: ${e.message}`);
      }
      const latex = this._unicodeMathToLatex(linear);
      console.info(`[Word._extractEquationsAsLatex] 🔢 eq ${i}: ${JSON.stringify(linear)} → ${JSON.stringify(latex)}`);
      latexList.push(latex);
    }
    return latexList;
  }

  /**
   * Converts a Word UnicodeMath linear string to a best-effort LaTeX string.
   * Handles math-italic/bold Unicode letters, fractions (a)/(b), superscripts,
   * subscripts, roots, and common operators/Greek letters. Returns null when the
   * input has no meaningful content (so the caller can fall back to an image).
   *
   * @param {string} input UnicodeMath linear text from Word.
   * @returns {string|null}
   */
  static _unicodeMathToLatex(input) {
    if (!input) return null;

    // Strip carriage returns/control chars Word injects between runs.
    let s = input.replace(/[\r\n-]/g, "").trim();
    if (!s || s === "Type equation here.") return null;

    // 1. Normalize Mathematical-Alphanumeric Unicode letters/digits back to ASCII.
    s = this._normalizeMathAlphanum(s);

    // 2. Common Unicode math symbols → LaTeX.
    const symbolMap = {
      "≤": "\\le", "≥": "\\ge", "≠": "\\ne", "≈": "\\approx", "±": "\\pm",
      "×": "\\times", "÷": "\\div", "⋅": "\\cdot", "∙": "\\cdot", "→": "\\to",
      "∞": "\\infty", "∑": "\\sum", "∏": "\\prod", "∫": "\\int", "√": "\\sqrt",
      "∂": "\\partial", "∇": "\\nabla", "∈": "\\in", "∉": "\\notin",
      "α": "\\alpha", "β": "\\beta", "γ": "\\gamma", "δ": "\\delta",
      "ε": "\\epsilon", "θ": "\\theta", "λ": "\\lambda", "μ": "\\mu",
      "π": "\\pi", "ρ": "\\rho", "σ": "\\sigma", "τ": "\\tau", "φ": "\\phi",
      "ω": "\\omega", "Δ": "\\Delta", "Σ": "\\Sigma", "Ω": "\\Omega",
    };
    for (const [u, tex] of Object.entries(symbolMap)) {
      s = s.split(u).join(tex + " ");
    }

    // 3. Fractions: (numer)/(denom) → \frac{numer}{denom}; a/b → \frac{a}{b}.
    s = this._convertFractions(s);

    // 4. \sqrt(x) → \sqrt{x}; \sqrt x stays as-is.
    s = s.replace(/\\sqrt\s*\(([^()]*)\)/g, "\\sqrt{$1}");

    // 5. Superscripts/subscripts: ^(...) → ^{...}, ^ab → ^{ab} (multi-char).
    s = s.replace(/\^\(([^()]*)\)/g, "^{$1}");
    s = s.replace(/_\(([^()]*)\)/g, "_{$1}");
    s = s.replace(/\^([A-Za-z0-9]{2,})/g, "^{$1}");
    s = s.replace(/_([A-Za-z0-9]{2,})/g, "_{$1}");

    // 6. Collapse repeated spaces.
    s = s.replace(/\s{2,}/g, " ").trim();

    return s.length ? s : null;
  }

  /**
   * Maps Unicode Mathematical Alphanumeric Symbols (italic/bold/etc.) to ASCII.
   * Word emits these for variables in linearized equations (e.g. 𝐸 → E).
   */
  static _normalizeMathAlphanum(s) {
    let out = "";
    for (const ch of s) {
      const cp = ch.codePointAt(0);
      let mapped = ch;
      // Mathematical Alphanumeric Symbols block: U+1D400–U+1D7FF.
      if (cp >= 0x1d400 && cp <= 0x1d7ff) {
        const blocks = [
          [0x1d400, 0x1d419, 0x41], [0x1d41a, 0x1d433, 0x61], // bold A-Z, a-z
          [0x1d434, 0x1d44d, 0x41], [0x1d44e, 0x1d467, 0x61], // italic
          [0x1d468, 0x1d481, 0x41], [0x1d482, 0x1d49b, 0x61], // bold italic
          [0x1d49c, 0x1d4b5, 0x41], [0x1d4b6, 0x1d4cf, 0x61], // script
          [0x1d4d0, 0x1d4e9, 0x41], [0x1d4ea, 0x1d503, 0x61], // bold script
          [0x1d504, 0x1d51d, 0x41], [0x1d51e, 0x1d537, 0x61], // fraktur
          [0x1d538, 0x1d551, 0x41], [0x1d552, 0x1d56b, 0x61], // double-struck
          [0x1d56c, 0x1d585, 0x41], [0x1d586, 0x1d59f, 0x61], // bold fraktur
          [0x1d5a0, 0x1d5b9, 0x41], [0x1d5ba, 0x1d5d3, 0x61], // sans-serif
          [0x1d5d4, 0x1d5ed, 0x41], [0x1d5ee, 0x1d607, 0x61], // sans bold
          [0x1d608, 0x1d621, 0x41], [0x1d622, 0x1d63b, 0x61], // sans italic
          [0x1d63c, 0x1d655, 0x41], [0x1d656, 0x1d66f, 0x61], // sans bold italic
          [0x1d670, 0x1d689, 0x41], [0x1d68a, 0x1d6a3, 0x61], // monospace
        ];
        for (const [lo, hi, base] of blocks) {
          if (cp >= lo && cp <= hi) { mapped = String.fromCharCode(base + (cp - lo)); break; }
        }
        // Mathematical digits U+1D7CE–U+1D7FF map to 0-9 in groups of 10.
        if (cp >= 0x1d7ce && cp <= 0x1d7ff) {
          mapped = String.fromCharCode(0x30 + ((cp - 0x1d7ce) % 10));
        }
      }
      out += mapped;
    }
    return out;
  }

  /**
   * Converts UnicodeMath fraction syntax to LaTeX \frac{}{}.
   * Supports (a)/(b) and simple token/token; nested groups are handled greedily
   * for the common single-level case Word produces.
   */
  static _convertFractions(s) {
    // (numer)/(denom)
    let prev;
    do {
      prev = s;
      s = s.replace(/\(([^()]*)\)\s*\/\s*\(([^()]*)\)/g, "\\frac{$1}{$2}");
      s = s.replace(/\(([^()]*)\)\s*\/\s*([A-Za-z0-9]+)/g, "\\frac{$1}{$2}");
      s = s.replace(/([A-Za-z0-9]+)\s*\/\s*\(([^()]*)\)/g, "\\frac{$1}{$2}");
    } while (s !== prev);
    return s;
  }

  /**
   * Returns true when a <table> node contains any merged cell (colspan/rowspan > 1)
   * or any cell with block-level/multi-paragraph content — i.e. a table GFM pipe
   * syntax cannot faithfully represent.
   */
  static _isComplexTable(tableNode) {
    // Turndown's DOM (domino) returns array-LIKE NodeLists that are not always
    // iterable with for...of, so coerce every NodeList to a real array.
    const toArr = (nl) => Array.prototype.slice.call(nl || []);
    const cells = toArr(tableNode.querySelectorAll("td, th"));
    for (const cell of cells) {
      const cs = parseInt(cell.getAttribute("colspan") || "1", 10);
      const rs = parseInt(cell.getAttribute("rowspan") || "1", 10);
      if (cs > 1 || rs > 1) return true;
      // More than one paragraph or a line break inside a cell breaks GFM rows.
      if (toArr(cell.querySelectorAll("p")).length > 1) return true;
      if (cell.querySelector("br")) return true;
    }
    return false;
  }

  /**
   * Produces clean, minimal HTML for a complex table: strips every Word `mso-*`
   * style, class, width, and inline-style attribute, keeping only the structural
   * colspan/rowspan and the cell text. The result is valid Markdown-embeddable HTML.
   */
  static _cleanTableHtml(tableNode) {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const toArr = (nl) => Array.prototype.slice.call(nl || []);

    // Extracts a node's text, turning every <br> into a sentinel that survives
    // HTML-escaping so multi-line cells keep their breaks as <br> in the output.
    const BR = "BR";
    const innerText = (node) => {
      let out = "";
      const kids = toArr(node.childNodes);
      for (const k of kids) {
        if (k.nodeType === 3) out += k.nodeValue || ""; // text node
        else if (k.nodeName === "BR") out += BR;
        else out += innerText(k);
      }
      return out;
    };

    const rowsOut = [];
    const rows = toArr(tableNode.querySelectorAll("tr"));
    for (const row of rows) {
      const cellsOut = [];
      const cells = toArr(row.querySelectorAll("td, th"));
      for (const cell of cells) {
        const tag = cell.nodeName.toLowerCase();
        const cs = parseInt(cell.getAttribute("colspan") || "1", 10);
        const rs = parseInt(cell.getAttribute("rowspan") || "1", 10);
        const attrs = [];
        if (cs > 1) attrs.push(`colspan="${cs}"`);
        if (rs > 1) attrs.push(`rowspan="${rs}"`);
        // Join inner paragraphs with <br>; collapse whitespace and &nbsp;.
        const paras = toArr(cell.querySelectorAll("p"));
        const sources = paras.length ? paras : [cell];
        const text = sources
          .map((p) => innerText(p).replace(/ /g, " ").trim())
          .filter((t) => t.length)
          .join(BR);
        const attrStr = attrs.length ? " " + attrs.join(" ") : "";
        // Escape real text, then turn the sentinel into a literal <br>.
        const cellHtml = text ? esc(text).split(BR).join("<br>") : "";
        cellsOut.push(`<${tag}${attrStr}>${cellHtml}</${tag}>`);
      }
      rowsOut.push(`  <tr>${cellsOut.join("")}</tr>`);
    }
    return `<table>\n${rowsOut.join("\n")}\n</table>`;
  }

  static _processTurndownRules(turndownService) {
    console.log(`[Word._processTurndownRules] ⚙️ Applying Turndown rules (GFM, Tables, PageBreaks, Colors, Footnotes)...`);
    turndownService.use(turndownPluginGfm.gfm);

    // Complex tables (merged cells / multi-line cells): emit cleaned HTML so no
    // data is lost. Must run BEFORE the GFM table rule, which would otherwise
    // mangle them. Simple tables fall through to GFM for clean pipe syntax.
    const self = this;
    turndownService.addRule("complexTable", {
      filter: function (node) {
        return node.nodeName === "TABLE" && self._isComplexTable(node);
      },
      replacement: function (content, node) {
        return "\n\n" + self._cleanTableHtml(node) + "\n\n";
      },
    });

    turndownService.addRule('pagebreak', {
      filter: function (node) {
        return node.nodeName === 'BR' && node.getAttribute('style') && node.getAttribute('style').includes('page-break-before:always');
      },
      replacement: function () {
        return '\n\n***\n\n';
      }
    });

    turndownService.addRule('highlight', {
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.getAttribute('style') && node.getAttribute('style').toLowerCase().includes('background');
      },
      replacement: function (content) {
        return `<mark>${content}</mark>`;
      }
    });

    turndownService.addRule('fontcolor', {
      filter: function (node) {
        return node.nodeName === 'SPAN' && node.getAttribute('style') && node.getAttribute('style').toLowerCase().includes('color');
      },
      replacement: function (content, node) {
        const style = node.getAttribute('style');
        const colorMatch = style.match(/color:\s*([^;]+)/i);
        const color = colorMatch ? colorMatch[1] : 'inherit';
        if (!content.trim()) return content;
        return `<span style="color:${color}">${content}</span>`;
      }
    });

    turndownService.addRule('footnoteRef', {
      filter: function (node) {
        return node.nodeName === 'A' && node.getAttribute('href') && node.getAttribute('href').startsWith('#_ftn') && node.getAttribute('name') && node.getAttribute('name').startsWith('_ftnref');
      },
      replacement: function (content, node) {
        const id = node.getAttribute('href').replace('#_ftn', '');
        return `[^${id}]`;
      }
    });

    turndownService.addRule('footnoteBacklink', {
      filter: function (node) {
        return node.nodeName === 'A' && node.getAttribute('href') && node.getAttribute('href').startsWith('#_ftnref');
      },
      replacement: function () {
        return ''; 
      }
    });

    turndownService.addRule('footnoteDef', {
      filter: function (node) {
        return node.nodeName === 'DIV' && node.getAttribute('id') && node.getAttribute('id').startsWith('ftn');
      },
      replacement: function (content, node) {
        const id = node.getAttribute('id').replace('ftn', '');
        return `\n\n[^${id}]: ${content.trim()}\n\n`;
      }
    });
  }

  static _convertHtmlToMd(htmlContent) {
    console.info(`[Word._convertHtmlToMd] 🔄 Converting HTML to Markdown...`);
    const turndownService = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
    this._processTurndownRules(turndownService);
    return turndownService.turndown(htmlContent);
  }

  /**
   * Replaces every equation in an OPEN document with a unique text placeholder
   * (`@@WMDEQ{n}@@`) and returns the LaTeX captured for each, in order. The
   * placeholder removes both the equation's rendered image and its text fallback
   * from the exported HTML, leaving a single token we re-expand to `$latex$` after
   * Markdown conversion. Equations whose LaTeX is null keep their image (no
   * placeholder is written) so nothing is silently lost.
   *
   * Must run on the working copy that will be exported (it mutates the document).
   *
   * @param {object} doc Open Word.Document COM object.
   * @returns {{token:string, latex:string}[]} Restorations to apply post-MD.
   */
  static _injectEquationPlaceholders(doc) {
    console.info(`[Word._injectEquationPlaceholders] 🟢 Starting...`);
    const latexList = this._extractEquationsAsLatex(doc);
    const restorations = [];

    // After Linearize(), OMaths still enumerates the same equations in order.
    let count = 0;
    try { count = doc.OMaths.Count; } catch (_) { count = 0; }

    for (let i = 1; i <= count; i++) {
      const latex = latexList[i - 1];
      if (!latex) {
        console.warn(`[Word._injectEquationPlaceholders] ⚠️ eq ${i} has no LaTeX — keeping image.`);
        continue;
      }
      const token = `@@WMDEQ${i}@@`;
      try {
        // Replace the equation's range text with the token, then remove the OMath
        // wrapper so no equation object (and thus no image) is exported.
        const om = doc.OMaths.Item(i);
        const rng = om.Range;
        rng.Text = token;
        try { om.Remove(); } catch (_) {} // unwrap the math zone if still present
        restorations.push({ token, latex });
        console.info(`[Word._injectEquationPlaceholders] 🔁 eq ${i} → ${token} = $${latex}$`);
      } catch (e) {
        console.warn(`[Word._injectEquationPlaceholders] ⚠️ eq ${i} placeholder failed: ${e.message}`);
      }
    }
    return restorations;
  }

  static wordToMD(filename) {
      console.info(`[Word.wordToMD] 🟢 Starting...`);
    console.info(`[Word.wordToMD] 🟢 Starting word to MD conversion for: ${filename}`);
    this.checkWinax("wordToMD");

    if (!filename || !fs.existsSync(filename)) {
      console.warn(`[Word.wordToMD] ⚠️ File not found: ${filename}`);
      Dialogs.warningBox(`File not found: ${filename}`, "Error");
      return;
    }

    const resolvedFile = path.resolve(filename);
    const parentDir = path.dirname(resolvedFile);
    const mdDir = path.join(parentDir, "MD");
    
    console.log(`[Word.wordToMD] 📁 Ensuring MD directory exists: ${mdDir}`);
    Files.mkdirIfNotExists(mdDir);

    const baseName = Files.getBaseName(resolvedFile, path.extname(resolvedFile));
    const baseTargetPath = path.join(mdDir, `${baseName}.md`);
    const targetPath = Files.incrementFileName(baseTargetPath);
    const targetBaseName = Files.getBaseName(targetPath, ".md");
    console.info(`[Word.wordToMD] 📄 Target MD file path determined: ${targetPath}`);

    console.log(`[Word.wordToMD] ⚙️ Initializing Word.Application via COM...`);
    const wordApp = new winax.Object("Word.Application");
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0;

    // Hoisted so the finally block can always remove the temp HTML, even on error.
    let htmlPath = null;

    try {
      console.log(`[Word.wordToMD] 📂 Opening document: ${resolvedFile}`);
      const doc = wordApp.Documents.Open(resolvedFile);

      // Capture equations as LaTeX and swap them for text placeholders BEFORE the
      // HTML export. This is mutation on the in-memory doc only — it is closed
      // without saving, so the source .docx is untouched.
      const equationRestores = this._injectEquationPlaceholders(doc);

      // Save as Filtered HTML
      const htmlBase = `${baseName}_temp_${Date.now()}`;
      htmlPath = path.join(mdDir, `${htmlBase}.html`);
      this._exportToHtml(doc, htmlPath);

      console.log(`[Word.wordToMD] 🏁 Closing document (no save — source preserved)...`);
      doc.Close(false);

      // Process Images folder
      this._processImagesFolder(mdDir, htmlBase, targetBaseName);

      // Read HTML
      let htmlContent = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, "utf8") : "";

      // Clean up body
      const match = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      if (match) htmlContent = match[1];

      // Update image links in HTML
      htmlContent = this._processImages(htmlContent, htmlBase, targetBaseName);

      // Convert to Markdown using Turndown + private methods for tables
      let mdContent = this._convertHtmlToMd(htmlContent);

      // Restore equation placeholders as inline LaTeX ($...$).
      for (const { token, latex } of equationRestores) {
        mdContent = mdContent.split(token).join(`$${latex}$`);
      }

      console.info(`[Word.wordToMD] 💾 Writing markdown content to: ${targetPath}`);
      fs.writeFileSync(targetPath, mdContent.trim() + "\n", "utf8");

      console.log(`[Word.wordToMD] ✅ Converted to MD successfully: ${targetPath}`);
      return targetPath;
    } catch (e) {
      console.error(`[Word.wordToMD] ❌ Error converting to MD:`, e);
      Dialogs.warningBox(`Error converting to MD: ${e.message}`, "Error");
    } finally {
      // Always remove the temp HTML, even when conversion threw mid-way.
      try {
        if (htmlPath && fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);
      } catch (_) {
        console.warn(`[Word.wordToMD] ⚠️ Error removing temp HTML: ${htmlPath}`);
      }
      console.log(`[Word.wordToMD] 🧹 Cleaning up COM resources...`);
      try {
        wordApp.Quit();
      } catch (_) {
        console.warn(`[Word.wordToMD] ⚠️ Error quitting Word App.`);
      }
      try {
        winax.release(wordApp);
      } catch (_) {
        console.warn(`[Word.wordToMD] ⚠️ Error releasing winax object.`);
      }
      console.info(`[Word.wordToMD] 🔴 Finished wordToMD execution.`);
    }
  }

  /**
   * Returns a suffixed, auto-incremented path for the protected output file.
   * Reads 'Word.ProtectSuffix' from config.yml (falls back to ' Protected').
   * If the stem already contains the suffix the original path is returned as-is.
   *
   * @param {string} filename
   * @returns {string}
   */
  static getProtectedPath(filename) {
    console.info(`[Word.getProtectedPath] 🟢 Starting...`);
    const absPath = path.resolve(filename);
    const ext = path.extname(absPath);
    const stem = path.basename(absPath, ext);
    const protectSuffix = Yamls.getConfig('Word.ProtectSuffix', null, ' Protected') || ' Protected';

    if (stem.includes(protectSuffix)) return absPath;

    const newPath = path.join(path.dirname(absPath), `${stem}${protectSuffix}${ext}`);
    return Files.incrementFileName(newPath);
  }

  /**
   * Protects a Word document against editing.
   * Saves the result to a new suffixed file via getProtectedPath (original untouched).
   *
   * Protection type constants (wdProtectionType):
   *   0 = wdAllowOnlyRevisions  — Tracked changes only
   *   1 = wdAllowOnlyComments   — Comments only
   *   2 = wdAllowOnlyFormFields — Filling in forms only
   *   3 = wdAllowOnlyReading    — No changes (Read only)  ← default
   *
   * @param {string} filename           - Path to the source .docx file.
   * @param {string} password           - Password required to remove protection.
   * @param {number} [protectionType=3] - wdProtectionType constant (0–3).
   * @returns {string} Path to the saved protected file.
   */
  static protectFile(filename, password, protectionType = 3) {
    console.info(`[Word.protectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`protectFile: File not found: ${absPath}`);
    }

    this.checkWinax('protectFile');
    const wordApp = new winax.Object('Word.Application');
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0;

    try {
      console.log(`📂 Opening document for protection: ${absPath}`);
      const doc = wordApp.Documents.Open(absPath);

      if (doc.ProtectionType !== -1) { // -1 = wdNoProtection
        console.warn(`⚠️ Document is already protected: ${absPath}. Skipping.`);
        doc.Close(false);
        return absPath;
      }

      console.log(`🔒 Protecting document (type ${protectionType}) with password...`);
      // Protect(Type, NoReset, Password, UseIRM, EnforceStyleLock)
      doc.Protect(protectionType, false, password);

      const newPath = this.getProtectedPath(absPath);
      // 16 = wdFormatDocumentDefault (.docx)
      doc.SaveAs(newPath, 16);
      console.log(`💾 Protected document saved as: ${newPath}`);
      doc.Close(false);

      return newPath;
    } catch (error) {
      throw new Error(`protectFile failed: ${error.message}`);
    } finally {
      try { wordApp.Quit(); } catch (_) {}
      try { winax.release(wordApp); } catch (_) {}
    }
  }

  /**
   * Removes editing protection from a Word document, saving in-place.
   *
   * @param {string} filename - Path to the protected .docx file.
   * @param {string} password - Password used when the document was protected.
   */
  static unProtectFile(filename, password) {
    console.info(`[Word.unProtectFile] 🟢 Starting...`);
    const absPath = path.resolve(filename);

    if (!fs.existsSync(absPath)) {
      throw new Error(`unProtectFile: File not found: ${absPath}`);
    }

    this.checkWinax('unProtectFile');
    const wordApp = new winax.Object('Word.Application');
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0;

    try {
      console.log(`📂 Opening protected document: ${absPath}`);
      const doc = wordApp.Documents.Open(absPath);

      if (doc.ProtectionType === -1) { // -1 = wdNoProtection
        console.warn(`⚠️ Document is not protected: ${absPath}.`);
        Dialogs.warningBox('File is not protected', 'Unprotect Document');
        doc.Close(false);
        return;
      }

      console.log(`🔓 Removing document protection...`);
      doc.Unprotect(password);

      doc.Save();
      console.log(`💾 Unprotected document saved: ${absPath}`);
      doc.Close(false);
    } catch (error) {
      throw new Error(`unProtectFile failed: ${error.message}`);
    } finally {
      try { wordApp.Quit(); } catch (_) {}
      try { winax.release(wordApp); } catch (_) {}
    }
  }

  /**
   * Prompt the user for a password then protect the document.
   * @param {string} filename           - Path to the .docx file.
   * @param {number} [protectionType=3] - wdProtectionType constant (0–3).
   */
  static protectFileAsk(filename, protectionType = 3) {
    console.info(`[Word.protectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to protect the document:', 'Protect Document');
    if (password === null) {
      console.log('protectFileAsk: cancelled by user.');
      return;
    }
    return this.protectFile(filename, password, protectionType);
  }

  /**
   * Prompt the user for a password then unprotect the document.
   * @param {string} filename - Path to the .docx file.
   */
  static unProtectFileAsk(filename) {
    console.info(`[Word.unProtectFileAsk] 🟢 Starting...`);
    const password = Dialogs.inputBox('Enter password to unprotect the document:', 'Unprotect Document');
    if (password === null) {
      console.log('unProtectFileAsk: cancelled by user.');
      return;
    }
    this.unProtectFile(filename, password);
  }
}
