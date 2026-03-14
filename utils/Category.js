import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Chromes } from './Chromes.js';

/**
 * Universal Organizer:
 * Reads a YAML file specifying:
 *   TargetFolder: ...
 *   SourceFolder: ...
 *   SubCategoryKey: ... (optional)
 *   TargetPath: ... (optional, template for destination path)
 * And a list of targets as keys.
 * 
 * Target files are moved from SourceFolder to:
 *   If TargetPath exists: Resolved path based on template
 *   Otherwise:
 *     If SubCategoryKey exists: TargetFolder/Category/<SubCategory>/Services/Target
 *     Otherwise:                TargetFolder/Category/Target
 *
 * It extracts no variables from environment files (no dotenv).
 */
export class Category {

  /**
   * Returns a timestamp string in YYYY-MM-DD_HH-MM format for the current moment.
   * Used when renaming conflicting files before a move.
   */
  static timestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
  }

  /**
   * Reads and parses a YAML file at the given path.
   */
  static loadYaml(filePath, tag) {
    if (!fs.existsSync(filePath)) {
      console.warn(`[${tag}] WARNING: YAML file not found: ${filePath}`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    return yaml.load(raw);
  }

  /**
   * Ensures a directory exists, creating it recursively if necessary.
   */
  static ensureDir(dirPath, tag) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[${tag}] Created directory: ${dirPath}`);
    }
  }

  /**
   * Moves a file from src to dest.
   * If a file already exists at dest, renames the existing file by appending
   * a space-separated timestamp before its extension, then moves the new file.
   */
  static moveFile(src, dest, tag) {
    if (!fs.existsSync(src)) {
      console.warn(`[${tag}] WARNING: Source file not found, skipping: ${src}`);
      return;
    }
    if (fs.existsSync(dest)) {
      const ext = path.extname(dest);
      const base = path.basename(dest, ext);
      const dir = path.dirname(dest);
      const renamed = path.join(dir, `${base} ${this.timestamp()}${ext}`);
      fs.renameSync(dest, renamed);
      console.log(`[${tag}] Renamed existing file to: ${renamed}`);
    }
    fs.renameSync(src, dest);
    console.log(`[${tag}] Moved: ${src} → ${dest}`);
  }

  /**
   * Helper to find a file by name recursively inside a directory
   */
  static findFileRecursively(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        const result = this.findFileRecursively(fullPath, filename);
        if (result) return result;
      } else if (file === filename) {
        return fullPath;
      }
    }
    return null;
  }

  /**
   * Full pipeline to organize files based on a specific YAML file.
   *   1. Parse YAML
   *   2. Move each target to its correct category directory
   */
  static run(yamlPath) {
    const tag = 'Organizer';
    console.log(`[${tag}] Starting pipeline for: ${yamlPath}`);

    const data = this.loadYaml(yamlPath, tag);
    if (!data) {
      console.warn(`[${tag}] Aborting: could not load YAML data.`);
      return;
    }

    const { TargetFolder, SourceFolder, SubCategoryKey, TargetPath } = data;

    if (!TargetFolder || !SourceFolder) {
      console.error(`[${tag}] Aborting: Missing TargetFolder or SourceFolder in YAML.`);
      return;
    }

    const reservedKeys = new Set(['TargetFolder', 'SourceFolder', 'SubCategoryKey', 'TargetPath']);
    let validCount = 0;

    for (const [target, fields] of Object.entries(data)) {
      if (reservedKeys.has(target)) continue;

      const category = fields.category ?? fields.Category;
      const subCategory = SubCategoryKey ? fields[SubCategoryKey] : null;

      if (!category || category === 'Uncategorized' || (SubCategoryKey && subCategory === 'Uncategorized')) {
        console.log(`[${tag}] Skipping Uncategorized or missing category: ${target}`);
        continue;
      }

      const sourcePath = path.join(SourceFolder, target);

      let sourceFileDomain = null;
      const ext = path.extname(target).toLowerCase();
      if ((ext === '.mhtml' || ext === '.html') && fs.existsSync(sourcePath)) {
        const extractedUrl = Chromes.getUrlFromMht(sourcePath);
        if (extractedUrl) {
          try {
            sourceFileDomain = new URL(extractedUrl).hostname;
            if (sourceFileDomain.startsWith('www.')) {
              sourceFileDomain = sourceFileDomain.substring(4);
            }
          } catch (e) {
            sourceFileDomain = null;
          }
        }
      }

      let targetPath;

      let resolved = TargetPath
        .replace(/{TargetFolder}/g, TargetFolder)
        .replace(/{SourceFolder}/g, SourceFolder)
        .replace(/{category}/g, category)
        .replace(/{sourceFileName}/g, target);

      if (sourceFileDomain) {
        resolved = resolved.replace(/{sourceFileDomain}/g, sourceFileDomain);
      } else {
        resolved = resolved.replace(/\/{sourceFileDomain}\//g, '/');
        resolved = resolved.replace(/{sourceFileDomain}/g, '');
      }

      for (const [k, v] of Object.entries(fields)) {
        if (v) {
          resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), String(v));
        } else {
          resolved = resolved.replace(new RegExp(`/{${k}}/`, 'g'), '/');
          resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), '');
        }
      }

      // Clean up any remaining unreplaced placeholders
      resolved = resolved.replace(/\/{[^{}]+}\//g, '/');
      resolved = resolved.replace(/{[^{}]+}/g, '');

      targetPath = path.normalize(resolved);

      const targetDir = path.dirname(targetPath);
      this.ensureDir(targetDir, tag);
      this.moveFile(sourcePath, targetPath, tag);
      validCount++;
    }

    console.log(`[${tag}] Processed ${validCount} valid targets.`);
    console.log(`[${tag}] Pipeline complete.`);
  }

  /**
   * Reverts the organization process by moving files back to their original SourceFolder.
   *   1. Parse YAML
   *   2. Move each target back from its category folder to SourceFolder
   */
  static revert(yamlPath) {
    const tag = 'Reverter';
    console.log(`[${tag}] Starting revert for: ${yamlPath}`);

    const data = this.loadYaml(yamlPath, tag);
    if (!data) {
      console.warn(`[${tag}] Aborting: could not load YAML data.`);
      return;
    }

    const { TargetFolder, SourceFolder, SubCategoryKey, TargetPath } = data;

    if (!TargetFolder || !SourceFolder) {
      console.error(`[${tag}] Aborting: Missing TargetFolder or SourceFolder in YAML.`);
      return;
    }

    const reservedKeys = new Set(['TargetFolder', 'SourceFolder', 'SubCategoryKey', 'TargetPath']);
    let revertCount = 0;

    for (const [target, fields] of Object.entries(data)) {
      if (reservedKeys.has(target)) continue;

      const category = fields.category ?? fields.Category;
      const subCategory = SubCategoryKey ? fields[SubCategoryKey] : null;

      if (!category || category === 'Uncategorized' || (SubCategoryKey && subCategory === 'Uncategorized')) {
        continue;
      }

      let currentPath;
      if (TargetPath) {
        if (TargetPath.includes('{sourceFileDomain}')) {
          // Since we don't know the domain easily at revert time, we search recursively in the category directory.
          const searchBase = path.join(TargetFolder, category);
          currentPath = this.findFileRecursively(searchBase, target);
        } else {
          let resolved = TargetPath
            .replace(/{TargetFolder}/g, TargetFolder)
            .replace(/{SourceFolder}/g, SourceFolder)
            .replace(/{category}/g, category)
            .replace(/{sourceFileName}/g, target);

          for (const [k, v] of Object.entries(fields)) {
            if (v) {
              resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), String(v));
            } else {
              resolved = resolved.replace(new RegExp(`/{${k}}/`, 'g'), '/');
              resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), '');
            }
          }

          // Clean up any remaining unreplaced placeholders
          resolved = resolved.replace(/\/{[^{}]+}\//g, '/');
          resolved = resolved.replace(/{[^{}]+}/g, '');

          currentPath = path.normalize(resolved);
        }
      } else {
        let targetDir;
        if (SubCategoryKey && subCategory) {
          targetDir = path.join(TargetFolder, category, subCategory, 'Services');
        } else {
          targetDir = path.join(TargetFolder, category);
        }
        currentPath = path.join(targetDir, target);
      }

      const originalPath = path.join(SourceFolder, target);

      if (fs.existsSync(currentPath)) {
        this.moveFile(currentPath, originalPath, tag);
        revertCount++;
      } else {
        console.warn(`[${tag}] File not found at ${currentPath}, skipping revert for this target.`);
      }
    }

    console.log(`[${tag}] Reverted ${revertCount} targets.`);

    // If the YAML is in an '@ Ready' folder, move it back up to the parent directory
    const yamlDir = path.dirname(yamlPath);
    if (path.basename(yamlDir) === '@ Ready') {
      const parentDir = path.dirname(yamlDir);
      const fileName = path.basename(yamlPath);
      const originalYamlPath = path.join(parentDir, fileName);
      this.moveFile(yamlPath, originalYamlPath, tag);
      console.log(`[${tag}] Restored YAML to: ${originalYamlPath}`);
    }

    console.log(`[${tag}] Revert complete.`);
  }

}
