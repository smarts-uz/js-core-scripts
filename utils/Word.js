import fs from 'fs';
import path from 'path';
import winax from 'winax';

import { Files } from './Files.js';
import { Yamls } from './Yamls.js';

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
}
