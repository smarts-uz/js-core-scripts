import fs, { existsSync } from 'fs';
import path from 'path';
import winax from 'winax';
import pkg from 'number-to-words-ru';
const { convert } = pkg;

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';
import { Dialogs } from './Dialogs.js';

export class Word {
  static merge(filePaths) {
    if (!filePaths || filePaths.length === 0) {
      throw new Error('No files provided to merge.');
    }

    const templatePath = Yamls.getConfig('Templates.Word');
    if (!templatePath || !fs.existsSync(templatePath)) {
      throw new Error(`Word template not found at: ${templatePath}`);
    }

    const firstFile = path.resolve(filePaths[0]);
    const parentDir = path.dirname(firstFile);
    const parentDirName = path.basename(parentDir);

    const proposedName = `${parentDirName}${path.extname(templatePath)}`;
    const baseTargetPath = path.join(parentDir, proposedName);
    
    const targetPath = Files.incrementFileName(baseTargetPath);

    console.log(`📑 Copying template to: ${targetPath}`);
    fs.copyFileSync(templatePath, targetPath);

    console.log('Word Application starting...');
    const wordApp = new winax.Object('Word.Application');
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

        console.log(`📌 Inserting file ${i+1}/${filePaths.length}: ${sourceFile}`);
        selection.EndKey(6); // wdStory
        selection.InsertFile(sourceFile);
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
      try { wordApp.Quit(); } catch (_) {}
      try { winax.release(wordApp); } catch (_) {}
    }
  }

  static mergeFolder(folderPaths) {
    if (!folderPaths || folderPaths.length === 0) {
      throw new Error('No folders provided to mergeFolder.');
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
        if (!file.toLowerCase().endsWith('.docx') || file.startsWith('~$')) {
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
      throw new Error('No .docx files found across the provided folders.');
    }

    console.log(`📑 Found ${latestFiles.length} latest files to merge:\n${latestFiles.join('\n')}`);
    return this.merge(latestFiles);
  }

  static initFolders(ymlFile) {
    globalThis.ymlFile = ymlFile;
    console.info(globalThis.ymlFile, 'ymlFile globalThis');

    globalThis.folderALL = path.dirname(globalThis.ymlFile);
    console.log(globalThis.folderALL, 'folderALL');

    globalThis.folderCompan = path.join(globalThis.folderALL, 'Compan');

    if (!fs.existsSync(globalThis.folderCompan))
      return Dialogs.warningBox(`Compan folder not found: ${globalThis.folderCompan}`, 'Compan Folder not found');
    else
      console.log(`Compan folder found: ${globalThis.folderCompan}`);

    globalThis.folderDirector = path.join(globalThis.folderALL, 'Director');
    globalThis.folderFounder = path.join(globalThis.folderALL, 'Founder');
    globalThis.folderSureties = path.join(globalThis.folderALL, 'Sureties');
    globalThis.folderPartners = path.join(globalThis.folderALL, 'Partners');
    globalThis.folderActReco = path.join(globalThis.folderALL, 'ActReco');
    globalThis.folderRestAPI = path.join(globalThis.folderALL, 'RestAPI');
    Files.mkdirIfNotExists(globalThis.folderRestAPI);
    globalThis.folderContract = path.join(globalThis.folderALL, 'Contract');
    globalThis.folderNotifiers = path.join(globalThis.folderALL, 'Notifiers');
    globalThis.folderPricings = path.join(globalThis.folderALL, 'Pricings');
    globalThis.folderTelegram = path.join(globalThis.folderALL, 'Telegram');
    globalThis.folderForNDS = path.join(globalThis.folderALL, 'ForNDS');

    return true;
  }

  static getNumberWordOnly(num) {
    if (!num) return "";
    num = num.replace(/[,. :]/g, "");
    num = parseFloat(num);

    const full = convert(num, { currency: 'number' });
    const idx = full.indexOf('целых');
    if (idx !== -1) {
      return full.slice(0, idx).trim();
    }
    return full;
  }

  static getRussianMonthName(monthNumber) {
    if (!monthNumber) return "";
    monthNumber = parseInt(monthNumber);
    const date = new Date(2025, monthNumber - 1, 1);
    const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long' }).format(date);
    console.info(monthName, "monthName");
    return monthName;
  }

  static getComNameInitials(name) {
    if (!name || typeof name !== "string") return "";
    let cleaned = this.cleanCompanyName(name);
    return cleaned
      .split(/\s+/)
      .map(word => word[0] ? word[0].toUpperCase() : "")
      .join("");
  }

  static cleanCompanyName(name) {
    if (!name || typeof name !== "string") return "";
    let cleaned = name.replace(/[«»"']/g, "").trim();
    cleaned = cleaned.replace(/MCHJ|AK|YaTT/g, "").trim();
    console.info(cleaned, "cleanCompanyName");
    return cleaned;
  }

  static contractNumFromFormat(data) {
    const prefix = Yamls.getConfig('Contract.Prefix');
    const format = Yamls.getConfig('Contract.Format');

    const values = {
      contractPrefix: prefix,
      Prefix: prefix,
      ComName: this.getComNameInitials(data.ComName),
      Day: data.Day,
      Month: data.Month,
      Year: data.Year
    };

    const replaceAll = format.replace(
      /\{(contractPrefix|Prefix|ComName|Day|Month|Year)\}/g,
      (_, key) => values[key] || ""
    );
    console.log("Generated Contract Number:", replaceAll);

    return replaceAll;
  }

  static makeContract(ymlFile) {
    const templatePath = path.resolve(Yamls.getConfig('Templates.Word'));
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

    if (!data.ContractNum) Dialogs.warningBox(`Contract number not found in YAML: ${ymlFile}`, "Error");

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
    const word = new winax.Object("Word.Application");
    word.Visible = false;

    const doc = word.Documents.Open(path.resolve(templatePath));
    const find = doc.Content.Find;
    find.ClearFormatting();

    const docContent = doc.Content.Text;
    const regex = /\[([A-Za-z0-9_]+)\]/g;
    let match;
    const placeholders = new Set();
    while ((match = regex.exec(docContent)) !== null) {
      placeholders.add(match[1]);
    }

    for (const placeholder of placeholders) {
      let replacementText = "";
      switch (true) {
        case (placeholder.endsWith("Text")): {
          const key = placeholder.replace(/Text$/, "");
          const value = data[key];
          replacementText = this.getNumberWordOnly(value);
          break;
        }
        case (placeholder.endsWith("Title")): {
          const key = placeholder.replace(/Title$/, "");
          const value = data[key];
          replacementText = this.getRussianMonthName(value);
          break;
        }
        case (placeholder.endsWith("Phone")): {
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

      console.info(`Replace: ${placeholder} → ${replacementText}`);

      find.Text = `[${placeholder}]`;
      find.Replacement.ClearFormatting();
      find.Replacement.Text = replacementText;

      find.Execute(
        find.Text,
        false, false, false, false, false,
        true, 1, false,
        find.Replacement.Text,
        2 // wdReplaceAll
      );
    }

    doc.SaveAs(outputDocxPath);
    doc.SaveAs(outputPdfPath, Number(Yamls.getConfig('Contract.PdfFormatCode')));

    if (existsSync(outputDocxPath)) console.log('✅ Word yaratildi:', outputDocxPath);
    if (existsSync(outputPdfPath)) console.log('✅ PDF yaratildi:', outputPdfPath);

    doc.Close(false);
    word.Quit();
  }
}
