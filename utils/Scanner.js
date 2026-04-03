import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { Yamls } from './Yamls.js';

export class Scanner {

    static defaultExclusions = [
        "ALL", "App", "Asp", "Asv", "Azk", "Services", "Element", "Projects", "- Theory", "AIC"
    ];

    static isExcluded(name, exclusions) {
        if (exclusions.includes(name)) return true;
        if (name.startsWith("_") || name.startsWith("@")) return true;
        return false;
    }

    static getTimestamp() {
        const now = new Date();
        const YYYY = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, '0');
        const DD = String(now.getDate()).padStart(2, '0');
        const HH = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        return `${YYYY}-${MM}-${DD}_${HH}-${mm}`;
    }

    static notify(message, title, timeoutSeconds, type = 64) {
        // type 64 = Information, 16 = Error
        const command = `powershell -Command "$notification = New-Object -ComObject WScript.Shell; $notification.Popup('${message.replace(/'/g, "''")}', ${timeoutSeconds}, '${title.replace(/'/g, "''")}', ${type})"`;
        try {
            execSync(command, { stdio: 'ignore' });
        } catch (e) {
            // Ignore notification errors
        }
    }

    static safeWriteFile(filePath, content, aicFolder) {
        const fileName = path.basename(filePath);
        const dir = path.dirname(filePath);
        
        // theory folder is inside aicFolder
        const theoryFolder = path.join(aicFolder, "- Theory");

        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        if (fs.existsSync(filePath)) {
            if (!fs.existsSync(theoryFolder)) {
                fs.mkdirSync(theoryFolder, { recursive: true });
            }
            
            const theoryPath = path.join(theoryFolder, fileName);

            if (fs.existsSync(theoryPath)) {
                const ext = path.extname(fileName);
                const base = path.basename(fileName, ext);
                const timestampedName = `${base} ${this.getTimestamp()}${ext}`;
                const timestampedPath = path.join(theoryFolder, timestampedName);
                fs.renameSync(theoryPath, timestampedPath);
            }
            
            fs.renameSync(filePath, theoryPath);
        }

        fs.writeFileSync(filePath, content, 'utf8');
    }

    static scanRecursive(currentPath, depth, maxDepth, exclusions) {
        if (depth > maxDepth) return {};

        let entries;
        try {
            entries = fs.readdirSync(currentPath, { withFileTypes: true });
        } catch (e) {
            console.error(`Error reading directory ${currentPath}: ${e.message}`);
            return {};
        }

        const filtered = entries
            .filter(dirent => dirent.isDirectory() && !this.isExcluded(dirent.name, exclusions))
            .sort((a, b) => a.name.localeCompare(b.name));

        if (filtered.length === 0) return {};

        const tree = {};
        for (const entry of filtered) {
            tree[entry.name] = this.scanRecursive(path.join(currentPath, entry.name), depth + 1, maxDepth, exclusions);
        }
        return tree;
    }

    static toYaml(obj, indent = 0) {
        let str = "";
        if (!obj) return str;
        const keys = Object.keys(obj).sort();
        for (const key of keys) {
            const escape = (s) => {
                if (!s) return '""';
                s = String(s);
                if (/[:#\[\]{},*&!|>?%@\`\-"' ]|^\s|\s$/.test(s)) {
                    return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
                }
                return s;
            };

            const value = obj[key];
            const hasChildren = value && Object.keys(value).length > 0;
            
            if (hasChildren) {
                str += "  ".repeat(indent) + `${escape(key)}:\n`;
                str += this.toYaml(value, indent + 1);
            } else {
                str += "  ".repeat(indent) + `${escape(key)}: ""\n`;
            }
        }
        return str;
    }

    static getIncrementedPath(dir, baseName, extension) {
        let counter = 1;
        let filePath;
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        do {
            filePath = path.join(dir, `${baseName}-${counter}${extension}`);
            counter++;
        } while (fs.existsSync(filePath));
        return filePath;
    }

    static flattenTreeForTable(tree, currentPath = "", list = []) {
        if (!tree) return list;
        const keys = Object.keys(tree).sort();
        for (const key of keys) {
            const fullPath = currentPath ? `${currentPath}/${key}` : key;
            list.push({ name: key, path: fullPath });
            this.flattenTreeForTable(tree[key], fullPath, list);
        }
        return list;
    }

    static generateTreeMarkdown(tree, indent = 0) {
        let str = "";
        if (!tree) return str;
        const keys = Object.keys(tree).sort();
        for (const key of keys) {
            str += "    ".repeat(indent) + `- ${key}\n`;
            str += this.generateTreeMarkdown(tree[key], indent + 1);
        }
        return str;
    }

    /**
     * Run the scanner
     * @param {Object} options Options for the scanner
     * @param {string} options.sourceFolder The directory to scan
     * @param {string} [options.aicFolder] The directory to output to, defaults to sourceFolder/AIC
     * @param {number} [options.maxLevel=5] The maximum depth to scan
     * @param {string[]} [options.exclusions] The list of folder names to exclude
     */
    static run({ sourceFolder, aicFolder, maxLevel = 5, exclusions = null }) {
        if (!aicFolder) aicFolder = path.join(sourceFolder, "AIC");
        const mdFolder = path.join(aicFolder, "MD");

        // Load exclusions from config if not provided
        if (!exclusions) {
            try {
                exclusions = Yamls.getConfig('Scanner.Exclusions', 'array', this.defaultExclusions);
            } catch (e) {
                exclusions = this.defaultExclusions;
            }
        }

        try {
            if (!fs.existsSync(aicFolder)) {
                fs.mkdirSync(aicFolder, { recursive: true });
            }

            console.log(`Scanning directories in ${sourceFolder}...`);
            const fullTree = this.scanRecursive(sourceFolder, 1, maxLevel, exclusions);

            const baseName = path.basename(sourceFolder);

            console.log("Generating YAML...");
            const yamlContent = `ALL: "${sourceFolder.replace(/\\/g, '/')}"\n\n` + this.toYaml(fullTree, 0);
            const yamlPath = this.getIncrementedPath(aicFolder, baseName, ".yml");
            fs.writeFileSync(yamlPath, yamlContent, 'utf8');
            console.log(`Written ${yamlPath}`);

            console.log("Generating Markdown Table...");
            let table = "| Folder Name | Path |\n| :--- | :--- |\n";
            const flatList = this.flattenTreeForTable(fullTree);
            for (const item of flatList) {
                table += `| ${item.name} | ${item.path} |\n`;
            }
            const tablePath = this.getIncrementedPath(mdFolder, `${baseName}-Table`, ".md");
            fs.writeFileSync(tablePath, table, 'utf8');
            console.log(`Written ${tablePath}`);

            console.log("Generating Markdown Tree...");
            let treeStr = `# Directory Tree (Level 1-${maxLevel})\n\n`;
            treeStr += this.generateTreeMarkdown(fullTree);
            const treePath = this.getIncrementedPath(mdFolder, `${baseName}-Tree`, ".md");
            fs.writeFileSync(treePath, treeStr, 'utf8');
            console.log(`Written ${treePath}`);

            console.log("Done.");
         //   this.notify("Recursive folder scanning completed successfully.", "Success", 5, 64);

        } catch (error) {
            console.error(error);
            this.notify(`An error occurred: ${error.message}`, "Error", 10, 16);
            throw error;
        }
    }
}
