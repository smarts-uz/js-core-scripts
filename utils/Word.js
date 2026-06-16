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

    const templatePath = Yamls.getConfig("Templates.WordPhD");
    if (!templatePath || !fs.existsSync(templatePath)) {
      throw new Error(`Word template not found at: ${templatePath}`);
    }

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
    const oldFolderRef = `${htmlBase}_files`;
    const newFolderRef = `${targetBaseName}_Files`;
    // Replace occurrences in the HTML content
    return htmlContent.replace(new RegExp(oldFolderRef, "g"), newFolderRef);
  }

  static _processTurndownRules(turndownService) {
    console.log(`[Word._processTurndownRules] ⚙️ Applying Turndown rules (GFM, PageBreaks, Colors, Footnotes)...`);
    turndownService.use(turndownPluginGfm.gfm);

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

    try {
      console.log(`[Word.wordToMD] 📂 Opening document: ${resolvedFile}`);
      const doc = wordApp.Documents.Open(resolvedFile);

      // Save as Filtered HTML
      const htmlBase = `${baseName}_temp_${Date.now()}`;
      const htmlPath = path.join(mdDir, `${htmlBase}.html`);
      this._exportToHtml(doc, htmlPath);
      
      console.log(`[Word.wordToMD] 🏁 Closing document...`);
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

      console.info(`[Word.wordToMD] 💾 Writing markdown content to: ${targetPath}`);
      fs.writeFileSync(targetPath, mdContent.trim() + "\n", "utf8");

      // Cleanup temp HTML file
      if (fs.existsSync(htmlPath)) fs.unlinkSync(htmlPath);

      console.log(`[Word.wordToMD] ✅ Converted to MD successfully: ${targetPath}`);
      return targetPath;
    } catch (e) {
      console.error(`[Word.wordToMD] ❌ Error converting to MD:`, e);
      Dialogs.warningBox(`Error converting to MD: ${e.message}`, "Error");
    } finally {
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
   * Shared Latin→Cyrillic homoglyph map (PERFECT_STEALTH).
   * Returns the full map when chars is null, or a filtered subset when chars
   * is a string (each character is used as a lookup key).
   * Characters not present in the map are skipped with a warning.
   *
   * @param {string|null} chars
   * @returns {Record<string,string>}
   */
  static buildHomoglyphMap(chars = null) {
    console.info(`[Word.buildHomoglyphMap] 🟢 Starting...`);
    const PERFECT_STEALTH = {
      A: "А",
      a: "а",

      C: "С",
      c: "с",

      E: "Е",
      e: "е",

      H: "Н",

      I: "І",
      i: "і",

      J: "Ј",

      K: "К",

      M: "М",

      O: "О",
      o: "о",

      P: "Р",
      p: "р",

      S: "Ѕ",

      T: "Т",

      X: "Х",
      x: "х",

      y: "у",
    };

    if (chars === null) {
      return { ...PERFECT_STEALTH };
    }

    const replaceMap = {};
    for (const ch of chars.split("")) {
      if (ch in PERFECT_STEALTH) {
        replaceMap[ch] = PERFECT_STEALTH[ch];
      } else {
        console.warn(
          `⚠️ buildHomoglyphMap: '${ch}' not in PERFECT_STEALTH — skipped`,
        );
      }
    }
    return replaceMap;
  }

  /**
   * Replaces Latin characters in a Word document with visually identical Cyrillic homoglyphs.
   *
   * @param {string} fileName - Path to the source .docx file.
   * @param {string|null} chars - If null, all PERFECT_STEALTH keys are replaced.
   *   If a string (e.g. "STy"), only those characters present in PERFECT_STEALTH are replaced.
   * @returns {string|undefined} Path to the saved output file, or undefined on error.
   */
  static homoglyph(fileName, chars = null) {
    console.info(`[Word.homoglyph] 🟢 Starting...`);
    this.checkWinax("homoglyph");

    if (!fileName || !fs.existsSync(fileName)) {
      Dialogs.warningBox(`File not found: ${fileName}`, "Error");
      return;
    }

    const replaceMap = this.buildHomoglyphMap(chars);

    if (Object.keys(replaceMap).length === 0) {
      console.warn(
        "⚠️ homoglyph: No valid replacement characters found. Nothing to do.",
      );
      return;
    }

    // Build output path: "<basename> Norm<ext>", auto-incremented
    const resolvedFile = path.resolve(fileName);
    const ext = path.extname(resolvedFile);
    const baseName = Files.getBaseName(resolvedFile, ext);
    const dir = path.dirname(resolvedFile);
    const homoglyphSuffix = Yamls.getConfig('Word.HomoglyphSuffix', null, ' Norm') || ' Norm';
    const baseOutputPath = path.join(dir, `${baseName}${homoglyphSuffix}${ext}`);
    const outputPath = Files.incrementFileName(baseOutputPath);

    // Copy original → output so we operate on a fresh copy
    fs.copyFileSync(resolvedFile, outputPath);
    console.log(`📋 Copied to: ${outputPath}`);

    const wordApp = new winax.Object("Word.Application");
    wordApp.Visible = false;
    wordApp.DisplayAlerts = 0;

    try {
      console.log(`📂 Opening: ${outputPath}`);
      const doc = wordApp.Documents.Open(outputPath);
      const find = doc.Content.Find;

      for (const [latin, cyrillic] of Object.entries(replaceMap)) {
        find.ClearFormatting();
        find.Replacement.ClearFormatting();
        find.Text = latin;
        find.Replacement.Text = cyrillic;
        find.Execute(
          find.Text,
          true, // MatchCase — keep case sensitivity for correct mapping
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
        console.log(`🔄 '${latin}' → '${cyrillic}'`);
      }

      doc.Save();
      doc.Close(false);
      console.log(`✅ Homoglyph file saved: ${outputPath}`);
      return outputPath;
    } catch (e) {
      console.error(e);
      Dialogs.warningBox(`Error in homoglyph: ${e.message}`, "Error");
    } finally {
      try {
        wordApp.Quit();
      } catch (_) {}
      try {
        winax.release(wordApp);
      } catch (_) {}
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


  /**
   * Prompts the user with an input box containing all PERFECT_STEALTH keys.
   * The user can remove characters, but adding new ones will be ignored.
   * Calls homoglyph with the selected characters.
   *
   * @param {string} fileName - Path to the source .docx file.
   * @returns {string|undefined} Path to the saved output file.
   */
  static homoglyphAsk(fileName) {
    console.info(`[Word.homoglyphAsk] 🟢 Starting...`);
    const allChars = Object.keys(this.buildHomoglyphMap()).join("");
    const defaultChars =
      Yamls.getConfig("ChoosedChars.Word", null, allChars) || allChars;

    const selectedChars = Dialogs.inputBox(
      "Leave only the characters you want to replace (adding new symbols is prohibited):",
      "Select Homoglyph Characters",
      defaultChars,
    );

    if (selectedChars === null) {
      console.log("homoglyphAsk: Cancelled by user.");
      return;
    }

    // Filter out any characters not in PERFECT_STEALTH (adding new symbols is prohibited)
    const validChars = selectedChars
      .split("")
      .filter((ch) => allChars.includes(ch))
      .join("");

    // Persist the user's choice for next time
    Yamls.setConfig("ChoosedChars.Word", validChars);

    return this.homoglyph(fileName, validChars);
  }
}
