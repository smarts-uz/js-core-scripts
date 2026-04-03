import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { Chromes } from './Chromes.js';
import { Dialogs } from './Dialogs.js';

/**
 * Universal Organizer:
 * Reads a YAML file specifying:
 *   TargetPath: "{category_path}/RealStat/{source_file}"   ← REQUIRED
 *   SourceFolder: ...                                       ← optional fallback for source_path
 *
 * For each file entry in YAML:
 *   source_path: full source path of the file              ← preferred
 *   category_path: resolved destination category folder    ← used in TargetPath template
 *   (any other field can also be used in the TargetPath template)
 *
 * TargetPath template placeholders (resolved per entry):
 *   {source_file}    → the YAML key (filename)
 *   {category_path}  → fields.category_path
 *   {category}       → fields.category
 *   {relative_path}  → fields.relative_path
 *   {domain_name} → domain extracted from .mhtml/.html URL
 *   {SourceFolder}   → top-level SourceFolder value
 *   {<any_field>}    → any other field from the entry
 */
export class Category {

  /**
   * Returns a timestamp string in YYYY-MM-DD_HH-MM format.
   */
  static timestamp() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm   = String(now.getMonth() + 1).padStart(2, '0');
    const dd   = String(now.getDate()).padStart(2, '0');
    const hh   = String(now.getHours()).padStart(2, '0');
    const min  = String(now.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}_${hh}-${min}`;
  }

  /**
   * Reads and parses a YAML file.
   */
  static loadYaml(filePath, tag) {
    if (!fs.existsSync(filePath)) {
      console.warn(`[${tag}] WARNING: YAML file not found: ${filePath}`);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');

    // Pre-process: detect and rename duplicate top-level keys before parsing.
    // YAML keys that appear more than once get a suffix _2, _3, etc.
    const keyCounts = {};
    const deduped = raw.replace(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\S+)\s*:/gm, (match, key) => {
      keyCounts[key] = (keyCounts[key] || 0) + 1;
      if (keyCounts[key] > 1) {
        const ext  = key.match(/(\.[^."]+)("?)$/);
        const base = ext ? key.slice(0, key.length - ext[0].length) : key.replace(/"$/, '');
        const suffix = `_${keyCounts[key]}`;
        const newKey = ext
          ? `${base}${suffix}${ext[1]}${ext[2]}`
          : `${base}${suffix}"`;
        console.warn(`[${tag}] Duplicate key detected, renamed: ${key} → ${newKey}`);
        return match.replace(key, newKey);
      }
      return match;
    });

    try {
      return yaml.load(deduped);
    } catch (e) {
      console.error(`[${tag}] Failed to parse YAML: ${e.message}`);
      return null;
    }
  }


  /**
   * Ensures a directory exists, creating it recursively if needed.
   */
  static ensureDir(dirPath, tag) {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`[${tag}] Created directory: ${dirPath}`);
    }
  }

  /**
   * Moves a file from src to dest.
   * If dest exists, renames the existing file by appending a timestamp before its extension.
   * Returns true on success, false if src not found.
   */
  static moveFile(src, dest, tag) {
    if (!fs.existsSync(src)) {
      console.warn(`[${tag}] WARNING: Source file not found, skipping: ${src}`);
      return false;
    }
    if (fs.existsSync(dest)) {
      const ext     = path.extname(dest);
      const base    = path.basename(dest, ext);
      const dir     = path.dirname(dest);
      const renamed = path.join(dir, `${base} ${this.timestamp()}${ext}`);
      fs.renameSync(dest, renamed);
      console.log(`[${tag}] Renamed existing file to: ${renamed}`);
    }
    fs.renameSync(src, dest);
    console.log(`[${tag}] Moved: ${src} → ${dest}`);
    return true;
  }

  /**
   * Recursively removes empty directories starting from dirPath upwards,
   * stopping at limitPath (exclusive).
   */
  static removeEmptyDirs(dirPath, limitPath, tag) {
    let current     = path.normalize(dirPath);
    const limit     = limitPath ? path.normalize(limitPath) : null;

    while (current && current !== limit) {
      if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) break;
      const entries = fs.readdirSync(current);
      if (entries.length === 0) {
        fs.rmdirSync(current);
        console.log(`[${tag}] Removed empty directory: ${current}`);
        current = path.dirname(current);
      } else {
        break;
      }
    }
  }

  /**
   * Finds a file by name recursively in a directory. Returns full path or null.
   */
  static findFileRecursively(dir, filename) {
    if (!fs.existsSync(dir)) return null;
    for (const file of fs.readdirSync(dir)) {
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
   * Resolves a TargetPath template string using top-level YAML values and per-entry fields.
   * Available placeholders: {source_file}, {category_path}, {category}, {relative_path},
   *                         {domain_name}, {SourceFolder}, and any entry field key.
   */
  static resolveTargetPath(template, target, fields, SourceFolder, domain_name) {
    let resolved = template
      .replace(/{source_file}/g, target)
      .replace(/{SourceFolder}/g, SourceFolder || '');

    // Replace all per-entry field placeholders
    for (const [k, v] of Object.entries(fields)) {
      if (v !== null && v !== undefined) {
        resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), String(v));
      } else {
        resolved = resolved.replace(new RegExp(`/{${k}}/`, 'g'), '/');
        resolved = resolved.replace(new RegExp(`{${k}}`, 'g'), '');
      }
    }

    // Handle {domain_name}
    if (domain_name) {
      resolved = resolved.replace(/{domain_name}/g, domain_name);
    } else {
      resolved = resolved.replace(/\/{domain_name}\//g, '/');
      resolved = resolved.replace(/{domain_name}/g, '');
    }

    // Clean up any remaining unreplaced placeholders
    resolved = resolved.replace(/\/{[^{}]+}\//g, '/');
    resolved = resolved.replace(/{[^{}]+}/g, '');

    return path.normalize(resolved);
  }

  /**
   * Returns a short display path for logging.
   * Prefers relative_path + target if SourceFolder is absent.
   */
  static displayPath(target, fields, SourceFolder, absolutePath) {
    if (SourceFolder && absolutePath) {
      return path.relative(SourceFolder, absolutePath).replace(/\\/g, '/');
    }
    if (fields.relative_path) {
      return path.join(fields.relative_path, target).replace(/\\/g, '/');
    }
    return target;
  }

  /**
   * Full pipeline: moves each entry's source file to its TargetPath-resolved destination.
   * Requires TargetPath in YAML — shows Windows error dialog and exits if missing.
   */
  static run(yamlPath) {
    const tag = 'Organizer';
    console.log(`[${tag}] Starting pipeline for: ${yamlPath}`);

    const data = this.loadYaml(yamlPath, tag);
    if (!data) {
      console.warn(`[${tag}] Aborting: could not load YAML data.`);
      return;
    }

    const { TargetPath, SourceFolder } = data;

    if (!TargetPath) {
      const msg = `TargetPath is required in YAML but was not found.\nFile: ${yamlPath}`;
      Dialogs.errorBox(msg, 'Category Organizer — Missing TargetPath', undefined, undefined, false);
      console.error(`[${tag}] Aborting: ${msg}`);
      return;
    }

    const reservedKeys = new Set(['TargetPath', 'SourceFolder', 'TargetFolder', 'SubCategoryKey']);
    let validCount = 0;
    const movedFiles   = [];
    const missingFiles = [];

    for (const [target, fields] of Object.entries(data)) {
      if (reservedKeys.has(target)) continue;
      if (!fields || typeof fields !== 'object') continue;

      const category = fields.category ?? fields.Category;

      if (!category || category === 'Uncategorized') {
        console.log(`[${tag}] Skipping Uncategorized or missing category: ${target}`);
        continue;
      }

      const sourcePath = fields.source_path ?? (SourceFolder ? path.join(SourceFolder, target) : null);
      if (!sourcePath) {
        console.warn(`[${tag}] Skipping — no source_path and no SourceFolder for: ${target}`);
        continue;
      }

      // Extract domain from .mhtml / .html for optional use in TargetPath template
      let domain_name = null;
      const ext = path.extname(target).toLowerCase();
      if ((ext === '.mhtml' || ext === '.html') && fs.existsSync(sourcePath)) {
        try {
          const url = Chromes.getUrlFromFile(sourcePath);
          if (url) {
            domain_name = new URL(url).hostname.replace(/^www\./, '');
          }
        } catch {
          domain_name = null;
        }
      }

      if (fields.new_category === true) {
        console.log(`[${tag}] New category — will create: ${fields.category_path}`);
      }

      const targetPath = this.resolveTargetPath(TargetPath, target, fields, SourceFolder, domain_name);

      this.ensureDir(path.dirname(targetPath), tag);
      const success = this.moveFile(sourcePath, targetPath, tag);

      const label = this.displayPath(target, fields, SourceFolder, sourcePath);
      if (success) {
        movedFiles.push(label);
        validCount++;
      } else {
        missingFiles.push(label);
      }
    }

    console.log(`[${tag}] --- Summary ---`);
    console.log(`[${tag}] Moved:   ${validCount}`);
    console.log(`[${tag}] Missing: ${missingFiles.length}`);

    if (movedFiles.length > 0) {
      console.log(`[${tag}] Successfully moved:`);
      movedFiles.forEach(f => console.log(`  ✅ ${f}`));
    }
    if (missingFiles.length > 0) {
      console.log(`[${tag}] Not found (skipped):`);
      missingFiles.forEach(f => console.log(`  ⚠️  ${f}`));
    }

    console.log(`[${tag}] Pipeline complete.`);


    // add sleep 5 seconds sync method
    const start = Date.now();
    while (Date.now() - start < 10000) {
      // busy wait
    }
  }

  /**
   * Revert: moves each file back from its TargetPath-resolved location to its original source_path.
   * Empty directories created during run are removed.
   * Requires TargetPath in YAML — shows Windows error dialog and exits if missing.
   */
  static revert(yamlPath) {
    const tag = 'Reverter';
    console.log(`[${tag}] Starting revert for: ${yamlPath}`);

    const data = this.loadYaml(yamlPath, tag);
    if (!data) {
      console.warn(`[${tag}] Aborting: could not load YAML data.`);
      return;
    }

    const { TargetPath, SourceFolder } = data;

    if (!TargetPath) {
      const msg = `TargetPath is required in YAML but was not found.\nFile: ${yamlPath}`;
      Dialogs.errorBox(msg, 'Category Reverter — Missing TargetPath', undefined, undefined, false);
      console.error(`[${tag}] Aborting: ${msg}`);
      return;
    }

    const reservedKeys = new Set(['TargetPath', 'SourceFolder', 'TargetFolder', 'SubCategoryKey']);
    let revertCount = 0;
    const revertedFiles   = [];
    const missingFiles    = [];

    for (const [target, fields] of Object.entries(data)) {
      if (reservedKeys.has(target)) continue;
      if (!fields || typeof fields !== 'object') continue;

      const category = fields.category ?? fields.Category;
      if (!category || category === 'Uncategorized') continue;

      const originalPath = fields.source_path ?? (SourceFolder ? path.join(SourceFolder, target) : null);
      if (!originalPath) {
        console.warn(`[${tag}] Skipping — no source_path and no SourceFolder for: ${target}`);
        continue;
      }

      // Resolve where the file was moved to
      let currentPath;
      if (TargetPath.includes('{domain_name}')) {
        // Domain is unknown at revert time — search recursively from category_path
        const searchBase = fields.category_path || '';
        currentPath = searchBase ? this.findFileRecursively(searchBase, target) : null;
      } else {
        currentPath = this.resolveTargetPath(TargetPath, target, fields, SourceFolder, null);
      }

      if (!currentPath) {
        console.warn(`[${tag}] Could not resolve current path for: ${target}`);
        continue;
      }

      const label = this.displayPath(target, fields, SourceFolder, originalPath);

      if (fs.existsSync(currentPath)) {
        const success = this.moveFile(currentPath, originalPath, tag);
        if (success) {
          revertedFiles.push(label);
          revertCount++;
          // Clean up empty parent dirs up to but not including category_path parent
          const limitPath = fields.category_path ? path.dirname(fields.category_path) : null;
          this.removeEmptyDirs(path.dirname(currentPath), limitPath, tag);
        } else {
          missingFiles.push(label);
        }
      } else {
        console.warn(`[${tag}] File not found at resolved path: ${currentPath}`);
        missingFiles.push(label);
      }
    }

    console.log(`[${tag}] --- Revert Summary ---`);
    console.log(`[${tag}] Reverted: ${revertCount}`);
    console.log(`[${tag}] Missing:  ${missingFiles.length}`);

    if (revertedFiles.length > 0) {
      console.log(`[${tag}] Successfully reverted:`);
      revertedFiles.forEach(f => console.log(`  ✅ ${f}`));
    }
    if (missingFiles.length > 0) {
      console.log(`[${tag}] Not found (skipped):`);
      missingFiles.forEach(f => console.log(`  ⚠️  ${f}`));
    }

    console.log(`[${tag}] Revert complete.`);

    // add sleep 5 seconds sync method
    const start = Date.now();
    while (Date.now() - start < 10000) {
      // busy wait
    }
  }

}
