import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';

import { Yamls } from './Yamls.js';
import { Files } from './Files.js';
import { Dialogs } from './Dialogs.js';

/**
 * Claude — thin wrapper around the locally installed `claude` CLI (claude.exe).
 *
 * Every request shells out to the CLI in print mode (`claude -p`), feeding the
 * prompt over STDIN (so file content never has to be escaped onto the command
 * line) and parsing the JSON envelope it prints back.
 *
 * Defaults for model / effort / think live under the `Claude:` section of
 * config.yml and are used whenever the matching argument is omitted.
 */
export class Claude {

    /** Max characters of text-file content embedded inline (keeps the prompt sane). */
    static MAX_CONTENT_CHARS = 16000;

    /** Ultimate fallback detalization level if config is missing. */
    static DEFAULT_LEVEL = 3;

    /** Text-like extensions that `summarize` refuses (it is for rich/binary files). */
    static TEXT_EXTENSIONS = new Set([
        '.txt', '.text', '.md', '.markdown', '.mdx', '.rst', '.log', '.csv', '.tsv',
        '.json', '.json5', '.jsonc', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.conf', '.env', '.properties',
        '.xml', '.html', '.htm', '.svg', '.css', '.scss', '.sass', '.less',
        '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.vue', '.svelte',
        '.py', '.rb', '.php', '.java', '.kt', '.kts', '.scala', '.go', '.rs',
        '.c', '.h', '.cpp', '.hpp', '.cc', '.cxx', '.cs', '.swift', '.m', '.mm',
        '.sh', '.bash', '.zsh', '.ps1', '.psm1', '.bat', '.cmd', '.lua', '.pl', '.r', '.sql',
        '.gradle', '.dockerfile', '.makefile', '.gitignore', '.editorconfig',
    ]);

    /**
     * Quote a single CLI argument for use with spawnSync({shell:true}) on
     * Windows, where the args array is joined into one command line and is NOT
     * auto-quoted. Wraps values containing whitespace (e.g. paths) in quotes.
     */
    static _shellArg(value) {
        const s = String(value);
        if (s.length === 0) return '""';
        if (!/\s/.test(s)) return s;
        return `"${s.replace(/"/g, '\\"')}"`;
    }

    /** Sub-folder under AI/ that holds this provider's prompt templates. */
    static PROMPT_DIR = 'Claude';

    /**
     * Load a prompt template from <project>/AI/<PROMPT_DIR>/<method>.md. The
     * folder is resolved next to config.yml (via Files.currentDir()) so it works
     * regardless of junctions on the utils/ folder. Prompts are kept in files,
     * never hardcoded in this class.
     */
    static _loadPrompt(method) {
        const file = path.join(Files.currentDir(), 'AI', this.PROMPT_DIR, `${method}.md`);
        if (!fs.existsSync(file)) {
            throw new Error(`Prompt template not found: ${file}`);
        }
        return fs.readFileSync(file, 'utf8');
    }

    /** Replace {{KEY}} placeholders in a template with values from `vars`. */
    static _renderTemplate(template, vars) {
        return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
            const v = vars[key];
            return v === undefined || v === null ? '' : String(v);
        });
    }

    /** Read a per-method config value, e.g. _cfg('rename', 'Model'). */
    static _cfg(section, key, defaultValue = null) {
        if (Files.isEmpty(section)) return defaultValue;
        return Yamls.getConfig(`Claude.${section}.${key}`, null, defaultValue);
    }

    /**
     * Show a dialog for an error from any method. A launch failure (claude.exe
     * could not be executed) gets an error dialog with the description; any
     * other error gets a warning dialog titled with `title` and the full error
     * in the message. Dedupes via a flag so it is shown once per error.
     */
    static _reportError(error, title = 'Claude') {
        if (error && error._claudeDialogShown) return;
        const desc = (error && (error.stack || error.message)) || String(error);
        if (error && error.claudeLaunchFailure) {
            Dialogs.errorBox(desc, 'Claude Code could not be executed');
        } else {
            Dialogs.warningBox(desc, title);
        }
        if (error && typeof error === 'object') error._claudeDialogShown = true;
    }

    /** Resolve the model: explicit arg → config Claude.<section>.Model → 'sonnet'. */
    static _resolveModel(model, section) {
        console.info(`[Claude._resolveModel] 🟢 Starting...`);
        if (!Files.isEmpty(model)) return String(model);
        return String(this._cfg(section, 'Model') || 'sonnet');
    }

    /** Resolve the effort level: explicit arg → config Claude.<section>.Effort → 'max'. */
    static _resolveEffort(effort, section) {
        console.info(`[Claude._resolveEffort] 🟢 Starting...`);
        if (!Files.isEmpty(effort)) return String(effort);
        return String(this._cfg(section, 'Effort') || 'max');
    }

    /** Resolve the think flag: explicit arg → config Claude.<section>.Think → false. */
    static _resolveThink(think, section) {
        console.info(`[Claude._resolveThink] 🟢 Starting...`);
        if (think === true || think === 'true') return true;
        if (think === false || think === 'false') return false;
        const cfg = this._cfg(section, 'Think');
        return cfg === true || cfg === 'true';
    }

    /** Resolve the detalization level: explicit arg → config Claude.<section>.level → fallback. */
    static _resolveLevel(level, section, fallback) {
        console.info(`[Claude._resolveLevel] 🟢 Starting...`);
        if (!Files.isEmpty(level)) return this._clampLevel(level);
        const cfg = this._cfg(section, 'level');
        return this._clampLevel(Files.isEmpty(cfg) ? fallback : cfg);
    }

    /** Resolve the output language: explicit arg → config Claude.<section>.Language → 'English'. */
    static _resolveLanguage(language, section) {
        console.info(`[Claude._resolveLanguage] 🟢 Starting...`);
        if (!Files.isEmpty(language)) return String(language);
        const cfg = this._cfg(section, 'Language');
        return String(Files.isEmpty(cfg) ? 'English' : cfg);
    }

    /**
     * Run the `claude` CLI once and return its plain-text answer.
     *
     * @param {string} prompt              The full prompt (sent via STDIN).
     * @param {object} [opts]
     * @param {string} [opts.model]        Model alias or id (default from config).
     * @param {string} [opts.effort]       Effort level low|medium|high|xhigh|max.
     * @param {string|string[]} [opts.allowedTools] Tool names to pre-allow (e.g. 'Read').
     * @param {string|string[]} [opts.addDir]       Extra directories tools may access.
     * @returns {string} The assistant's final text answer (trimmed).
     */
    static _ask(prompt, opts = {}) {
        console.info(`[Claude._ask] 🟢 Starting...`);
        try {
            if (Files.isEmpty(prompt)) {
                throw new Error('Claude._ask: prompt is empty');
            }

            const model = this._resolveModel(opts.model, opts.section);
            const effort = this._resolveEffort(opts.effort, opts.section);

            const args = ['-p', '--model', model, '--effort', effort, '--output-format', 'json'];

            // optionally let the CLI use tools (e.g. Read) and reach extra dirs.
            // With shell:true on Windows, args are not auto-quoted, so values
            // that may contain spaces (paths) must be quoted explicitly.
            if (!Files.isEmpty(opts.allowedTools)) {
                const tools = Array.isArray(opts.allowedTools) ? opts.allowedTools.join(',') : String(opts.allowedTools);
                args.push('--allowed-tools', this._shellArg(tools));
            }
            if (!Files.isEmpty(opts.addDir)) {
                const dirs = Array.isArray(opts.addDir) ? opts.addDir : [opts.addDir];
                for (const d of dirs) args.push('--add-dir', this._shellArg(d));
            }

            console.log(`[Claude._ask] claude ${args.join(' ')} (cwd=${opts.cwd || process.cwd()})`);

            // shell:true is required on Windows to launch the `claude.cmd` shim;
            // the prompt travels on STDIN so nothing has to be shell-escaped.
            const spawnOpts = {
                input: prompt,
                encoding: 'utf8',
                shell: true,
                windowsHide: true,
                maxBuffer: 64 * 1024 * 1024,
            };
            // run the CLI inside a specific folder when asked (e.g. execute()),
            // so its tools naturally operate on that folder's files.
            if (!Files.isEmpty(opts.cwd)) spawnOpts.cwd = opts.cwd;
            const result = spawnSync('claude', args, spawnOpts);

            // claude.exe (Claude Code) could not be executed at all
            if (result.error) {
                const e = new Error(`Claude Code (claude.exe) could not be executed.\n\n${result.error.message}\n\nIs Claude Code installed and available on PATH?`);
                e.claudeLaunchFailure = true;
                throw e;
            }

            const stderr = (result.stderr || '').trim();
            // Windows cmd reports a missing command via this text / exit code 9009
            if (result.status === 9009 || /not recognized|command not found|cannot find/i.test(stderr)) {
                const e = new Error(`Claude Code (claude.exe) was not found or could not run.\n\n${stderr || `exit code ${result.status}`}\n\nIs Claude Code installed and available on PATH?`);
                e.claudeLaunchFailure = true;
                throw e;
            }

            if (result.status !== 0) {
                const out = (result.stdout || '').trim().slice(0, 300);
                throw new Error(`Claude CLI exited with code ${result.status} (stderr: ${stderr || 'none'}; stdout: ${out || 'none'})`);
            }

            const stdout = (result.stdout || '').trim();
            if (Files.isEmpty(stdout)) {
                throw new Error('Claude CLI returned no output');
            }

            return this._extractText(stdout);
        } catch (error) {
            // report here so a direct _ask() call still surfaces a dialog;
            // the dedupe flag stops callers from showing it again.
            this._reportError(error, 'Claude');
            throw error;
        }
    }

    /**
     * Pull the assistant text out of the CLI's `--output-format json` envelope,
     * falling back to the raw stdout when it is not valid JSON.
     */
    static _extractText(stdout) {
        console.info(`[Claude._extractText] 🟢 Starting...`);
        try {
            const obj = JSON.parse(stdout);
            const text = obj.result ?? obj.text ?? obj.content ?? '';
            return String(text).trim();
        } catch (e) {
            console.warn(`[Claude._extractText] Output is not JSON, using raw stdout`);
            return stdout.trim();
        }
    }

    /**
     * Remove ASCII control characters from a string, keeping tab (9), newline
     * (10) and carriage return (13). Done with a char-code scan so no control
     * bytes ever have to appear in this source file.
     */
    static _stripControlChars(text) {
        let out = '';
        for (let i = 0; i < text.length; i++) {
            const code = text.charCodeAt(i);
            if (code >= 32 || code === 9 || code === 10 || code === 13) {
                out += text[i];
            }
        }
        return out;
    }

    /** Clamp a detalization level into the supported 1..5 range. */
    static _clampLevel(level) {
        let n = parseInt(level, 10);
        if (Number.isNaN(n)) n = this.DEFAULT_LEVEL;
        return Math.min(5, Math.max(1, n));
    }

    /**
     * Turn the model's free-text answer into a safe Windows filename stem
     * (no extension, no path, no characters illegal on Windows).
     */
    static _sanitizeName(name, maxLen = 150) {
        console.info(`[Claude._sanitizeName] 🟢 Starting...`);
        if (name === null || name === undefined) return '';
        let n = String(name).trim();
        // strip a ```code fence``` wrapper the model sometimes adds
        n = n.replace(/^```[a-z]*\s*/i, '').replace(/```$/i, '').trim();
        // keep only the first non-empty line
        n = (n.split(/\r?\n/).find(l => l.trim().length > 0) || '').trim();
        // strip surrounding quotes / backticks
        n = n.replace(/^["'`]+|["'`]+$/g, '').trim();
        // drop any path components the model may have added
        n = path.basename(n);
        // remove control characters, then replace Windows-illegal characters
        n = this._stripControlChars(n);
        n = n.replace(/[<>:"/\\|?*]/g, ' ');
        // collapse whitespace
        n = n.replace(/\s+/g, ' ').trim();
        // Windows forbids trailing dots/spaces
        n = n.replace(/[ .]+$/, '');
        // length guard (driven by the detalization level, hard-capped at 150)
        const cap = Math.min(150, Math.max(1, maxLen || 150));
        if (n.length > cap) {
            n = n.slice(0, cap).trim();
            n = n.replace(/[ .]+$/, '');
        }
        return n;
    }

    /**
     * Analyse a file's content and rename it to a descriptive name.
     *
     * The new name is proposed by Claude from the file content WITHOUT
     * discarding the existing name — the current name is given to the model as
     * context to preserve/refine. The original extension is always kept and
     * collisions are auto-incremented.
     *
     * The `level` controls how detailed the new name is, expressed as its
     * target length: level * 30 characters, hard-capped at 150
     * (L1=30, L2=60, L3=90, L4=120, L5=150).
     *
     * Pass null (the default) for level/language/model/effort/think to fall
     * back to the corresponding value in the config.yml `Claude.rename`
     * section; pass an explicit value to override it.
     *
     * @param {string} fileName          Path to the file to rename.
     * @param {number|null} [level]      Detalization level 1..5, or null → config Claude.rename.level || 4.
     * @param {string|null} [language]   Output language for the name, or null → config Claude.rename.Language || 'English'.
     * @param {string|null} [model]      Model alias/id, or null → config Claude.rename.Model || 'sonnet'.
     * @param {string|null} [effort]     Effort level, or null → config Claude.rename.Effort || 'max'.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Claude.rename.Think || false.
     * @returns {string|null} The new absolute path, or null on failure / no-op.
     */
    static rename(fileName, level = null, language = null, model = null, effort = null, think = null) {
        console.info(`[Claude.rename] 🟢 Starting... fileName=${fileName} level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        try {
            const filePath = path.resolve(fileName);
            if (!fs.existsSync(filePath)) {
                Dialogs.warningBox(`File not found: ${filePath}`, 'Claude Rename');
                return null;
            }
            if (!fs.lstatSync(filePath).isFile()) {
                Dialogs.warningBox(`Not a file: ${filePath}`, 'Claude Rename');
                return null;
            }

            const dir = path.dirname(filePath);
            const ext = path.extname(filePath);
            const oldStem = path.basename(filePath, ext);
            console.info(`[Claude.rename] filePath=${filePath} dir=${dir} ext=${ext} oldStem=${oldStem}`);

            const lvl = this._resolveLevel(level, 'rename', 4);
            // target name length: level * 30 chars, capped at 150 (L1=30 ... L5=150)
            const maxLen = Math.min(150, this._clampLevel(lvl) * 30);
            const lang = this._resolveLanguage(language, 'rename');
            const wantThink = this._resolveThink(think, 'rename');
            // Text files: read the bytes directly and embed them inline — fast, one-shot,
            // no tool round-trip. Binary/scanned files: leave the content empty and let
            // Claude's own Read tool open the path (OCR), so a scan is named by its real
            // content, not by raw bytes that for a scan are only technical image metadata.
            const isText = this.TEXT_EXTENSIONS.has(ext.toLowerCase());
            let content = '';
            if (isText) {
                content = this._stripControlChars(fs.readFileSync(filePath, 'utf8'));
                if (content.length > this.MAX_CONTENT_CHARS) {
                    content = content.slice(0, this.MAX_CONTENT_CHARS) + '\n\n[...truncated...]';
                }
            }
            console.info(`[Claude.rename] lvl=${lvl} maxLen=${maxLen} lang=${lang} wantThink=${wantThink} isText=${isText} contentLen=${content.length}`);

            const thinkHint = wantThink ? 'Think carefully about the content before deciding, then give the final name.' : '';
            const prompt = this._renderTemplate(this._loadPrompt('rename'), {
                ThinkHint: thinkHint,
                Level: lvl,
                MinLen: Math.max(1, maxLen - 10),
                MaxLen: maxLen,
                Language: lang,
                OldName: oldStem,
                Ext: ext || '(none)',
                FilePath: filePath,
                Content: content,
            });
            console.debug(`[Claude.rename] thinkHint="${thinkHint}" promptLen=${prompt.length}`);
            // grant the Read tool only for binary files; text content is already inline
            const askOpts = { model, effort, section: 'rename' };
            if (!isText) { askOpts.allowedTools = ['Read']; askOpts.addDir = dir; }
            const answer = this._ask(prompt, askOpts);
            console.log(`[Claude.rename] Raw answer: ${answer}`);

            let newStem = this._sanitizeName(answer, maxLen);
            // drop a duplicated extension if the model appended the original one
            if (ext && newStem.toLowerCase().endsWith(ext.toLowerCase())) {
                newStem = newStem.slice(0, newStem.length - ext.length).trim();
            }
            console.info(`[Claude.rename] newStem=${newStem}`);

            if (Files.isEmpty(newStem)) {
                console.warn(`[Claude.rename] Empty suggestion, keeping old name`);
                Dialogs.warningBox(`Claude returned no usable name for:\n${filePath}`, 'Claude Rename');
                return null;
            }

            if (newStem === oldStem) {
                console.log(`[Claude.rename] Suggested name equals current name, no change`);
                return filePath;
            }

            let target = path.join(dir, `${newStem}${ext}`);
            // skip the collision check for a case-only rename of the same file
            if (path.resolve(target).toLowerCase() !== filePath.toLowerCase()) {
                target = Files.incrementFileName(target);
            }
            console.info(`[Claude.rename] target=${target}`);

            fs.renameSync(filePath, target);
            console.log(`[Claude.rename] ✅ ${path.basename(filePath)}  →  ${path.basename(target)}`);
            return target;
        } catch (error) {
            this._reportError(error, 'Claude Rename');
            return null;
        }
    }

    /**
     * Rename many files by content. Each file is processed independently; one
     * failure never aborts the rest.
     *
     * Pass null (the default) for level/language/model/effort/think to use the
     * config.yml `Claude.rename` defaults; pass an explicit value to override.
     *
     * @param {string|string[]} filePaths  One path or an array of paths.
     * @param {number|null} [level]        Detalization level 1..5, or null → config.
     * @param {string|null} [language]     Output language, or null → config.
     * @param {string|null} [model]
     * @param {string|null} [effort]
     * @param {boolean|null} [think]
     * @returns {Array<{from:string,to:(string|null),ok:boolean}>}
     */
    static renameMany(filePaths, level = null, language = null, model = null, effort = null, think = null) {
        console.info(`[Claude.renameMany] 🟢 Starting... level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        console.info(`[Claude.renameMany] ${files.length} file(s): ${JSON.stringify(files)}`);
        const results = [];

        // rename() reports its own errors and never throws, so the loop always
        // completes; a failed file simply yields ok:false.
        for (const file of files) {
            const to = this.rename(file, level, language, model, effort, think);
            console.info(`[Claude.renameMany] ${file} → ${to}`);
            results.push({ from: file, to, ok: to !== null });
        }

        const okCount = results.filter(r => r.ok).length;
        console.log(`[Claude.renameMany] ✅ Renamed ${okCount}/${files.length} file(s)`);
        return results;
    }

    /**
     * Read a (non-text) file in full and write a Markdown summary of its
     * content next to the original, as `<name>.md` (auto-incremented if that
     * file already exists). The file is read by the `claude` CLI itself via its
     * Read tool, so this works for PDFs, images and other rich documents.
     *
     * Plain-text files (.txt, .md, .js, …) are rejected — this method is for
     * non-text files.
     *
     * Pass null (the default) for level/language/model/effort/think to fall
     * back to the config.yml `Claude.summarize` section; pass an explicit value
     * to override.
     *
     * @param {string} fileName          Path to the file to summarize.
     * @param {number|null} [level]      Detalization level 1..5, or null → config Claude.summarize.level || 5.
     * @param {string|null} [language]   Output language, or null → config Claude.summarize.Language || 'English'.
     * @param {string|null} [model]      Model alias/id, or null → config Claude.summarize.Model || 'sonnet'.
     * @param {string|null} [effort]     Effort level, or null → config Claude.summarize.Effort || 'max'.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Claude.summarize.Think || false.
     * @returns {string|null} The absolute path of the written .md file, or null on failure.
     */
    static summarize(fileName, level = null, language = null, model = null, effort = null, think = null) {
        console.info(`[Claude.summarize] 🟢 Starting... fileName=${fileName} level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        try {
            const filePath = path.resolve(fileName);
            console.info(`[Claude.summarize] filePath=${filePath}`);
            if (!fs.existsSync(filePath)) {
                Dialogs.warningBox(`File not found: ${filePath}`, 'Claude Summarize');
                return null;
            }
            if (!fs.lstatSync(filePath).isFile()) {
                Dialogs.warningBox(`Not a file: ${filePath}`, 'Claude Summarize');
                return null;
            }

            const ext = path.extname(filePath).toLowerCase();
            if (this.TEXT_EXTENSIONS.has(ext)) {
                Dialogs.warningBox(`summarize is for non-text files; "${ext || '(no extension)'}" is a text file.\n\nSkipped:\n${filePath}`, 'Claude Summarize');
                return null;
            }

            const dir = path.dirname(filePath);
            const stem = path.basename(filePath, path.extname(filePath));
            console.info(`[Claude.summarize] ext=${ext} dir=${dir} stem=${stem}`);

            const lvl = this._resolveLevel(level, 'summarize', 5);
            const lang = this._resolveLanguage(language, 'summarize');
            const wantThink = this._resolveThink(think, 'summarize');
            console.info(`[Claude.summarize] lvl=${lvl} lang=${lang} wantThink=${wantThink}`);

            const levelDesc = {
                1: 'Level 1 (minimal): one or two sentences capturing only the essence.',
                2: 'Level 2 (brief): a short paragraph with the main point and a few key facts.',
                3: 'Level 3 (balanced): a concise summary covering the main points and overall structure.',
                4: 'Level 4 (detailed): a thorough, section-by-section summary with key details and findings.',
                5: 'Level 5 (comprehensive): an exhaustive, in-depth summary covering every section, all details, data and nuances.',
            };
            const thinkHint = wantThink ? 'Think carefully as you read the file, then write the summary.' : '';
            const prompt = this._renderTemplate(this._loadPrompt('summarize'), {
                ThinkHint: thinkHint,
                Level: lvl,
                LevelDesc: levelDesc[lvl] || levelDesc[3],
                Language: lang,
                FilePath: filePath,
            });
            console.debug(`[Claude.summarize] thinkHint="${thinkHint}" levelDesc="${levelDesc[lvl] || levelDesc[3]}" promptLen=${prompt.length}`);
            const summary = this._ask(prompt, {
                model,
                effort,
                section: 'summarize',
                allowedTools: ['Read'],
                addDir: dir,
            });
            console.info(`[Claude.summarize] summaryLen=${(summary || '').length}`);

            if (Files.isEmpty(summary)) {
                Dialogs.warningBox(`Claude returned an empty summary for:\n${filePath}`, 'Claude Summarize');
                return null;
            }

            const outPath = Files.incrementFileName(path.join(dir, `${stem}.md`));
            console.info(`[Claude.summarize] outPath=${outPath}`);
            fs.writeFileSync(outPath, summary, 'utf8');
            console.log(`[Claude.summarize] ✅ ${path.basename(filePath)}  →  ${path.basename(outPath)}`);
            return outPath;
        } catch (error) {
            this._reportError(error, 'Claude Summarize');
            return null;
        }
    }

    /**
     * Run a free-form, user-typed instruction against every file in a folder.
     *
     * Opens a multi-line input dialog for the instruction (e.g. "categorize all
     * files"), builds the prompt as the `AI/Claude/execute.md` base template
     * followed by one empty line and that instruction, then runs the `claude`
     * CLI inside the folder with file tools enabled so it carries the task out
     * autonomously (creating sub-folders, moving / renaming / editing files).
     *
     * Pass null (the default) for model/effort/think to fall back to the
     * config.yml `Claude.execute` section; pass an explicit value to override.
     *
     * @param {string} folder            Path to the folder to operate on.
     * @param {string|null} [model]      Model alias/id, or null → config Claude.execute.Model || 'sonnet'.
     * @param {string|null} [effort]     Effort level, or null → config Claude.execute.Effort || 'max'.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Claude.execute.Think || false.
     * @returns {string|null} The CLI's final text report, or null on failure / cancel.
     */
    static execute(folder, model = null, effort = null, think = null) {
        console.info(`[Claude.execute] 🟢 Starting... folder=${folder} model=${model} effort=${effort} think=${think}`);
        try {
            const folderPath = path.resolve(folder);
            console.info(`[Claude.execute] folderPath=${folderPath}`);
            if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
                Dialogs.warningBox(`Folder not found: ${folderPath}`, 'Claude Execute');
                return null;
            }

            // multi-line prompt typed by the user (e.g. "categorize all files")
            const instruction = Dialogs.multilineInputBox(
                `Enter the instruction Claude should run on every file in:\n${folderPath}`,
                'Claude Execute',
            );
            console.info(`[Claude.execute] instructionLen=${(instruction || '').length}`);
            if (Files.isEmpty(instruction)) {
                console.warn(`[Claude.execute] No instruction entered, aborting`);
                return null;
            }

            const wantThink = this._resolveThink(think, 'execute');
            const allowedTools = String(this._cfg('execute', 'AllowedTools') || 'Read,Write,Edit,Bash,Glob,Grep');
            console.info(`[Claude.execute] wantThink=${wantThink} allowedTools=${allowedTools}`);

            // base template + one empty line + the user's instruction
            const thinkHint = wantThink ? 'Think carefully about the folder and the instruction before acting, then carry it out.' : '';
            const base = this._renderTemplate(this._loadPrompt('execute'), { ThinkHint: thinkHint, Folder: folderPath });
            const prompt = `${base.replace(/\s+$/, '')}\n\n${instruction}`;
            console.debug(`[Claude.execute] thinkHint="${thinkHint}" promptLen=${prompt.length}`);

            const answer = this._ask(prompt, {
                model,
                effort,
                section: 'execute',
                allowedTools,
                addDir: folderPath,
                cwd: folderPath,
            });
            console.info(`[Claude.execute] answerLen=${(answer || '').length}`);

            if (!Files.isEmpty(answer)) {
                Dialogs.messageBox(answer, 'Claude Execute — Done');
            }
            console.log(`[Claude.execute] ✅ Finished on ${folderPath}`);
            return answer;
        } catch (error) {
            this._reportError(error, 'Claude Execute');
            return null;
        }
    }

    /** Today's date as a YYYY-MM-DD stamp (local time), used for the export file name. */
    static _todayStamp() {
        const d = new Date();
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    /**
     * Resolve the project root whose chat to export. Accepts a folder or a file
     * (the file's directory is used), tolerates surrounding quotes and an
     * unsubstituted "%1" shell token, and falls back to the current working
     * directory when nothing usable is given.
     */
    static _resolveProjectRoot(projectPath) {
        let root = (projectPath === null || projectPath === undefined) ? '' : String(projectPath).trim();
        root = root.replace(/^["']+|["']+$/g, '').trim();
        if (Files.isEmpty(root) || root === '%1') return process.cwd();
        try {
            const stat = fs.statSync(root);
            return stat.isDirectory() ? path.resolve(root) : path.dirname(path.resolve(root));
        } catch (e) {
            return process.cwd();
        }
    }

    /** Return the most recently modified *.jsonl transcript in a directory, or null. */
    static _findLatestTranscript(transcriptsDir) {
        const files = fs.readdirSync(transcriptsDir)
            .filter(f => f.toLowerCase().endsWith('.jsonl'))
            .map(f => {
                const full = path.join(transcriptsDir, f);
                let mtime = 0;
                try { mtime = fs.statSync(full).mtimeMs; } catch (e) { mtime = 0; }
                return { full, mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);
        return files.length ? files[0].full : null;
    }

    /** Strip IDE / system wrapper blocks the harness injects into user turns. */
    static _stripExportWrappers(text) {
        return String(text)
            .replace(/<ide_selection>[\s\S]*?<\/ide_selection>/gi, '')
            .replace(/<ide_opened_file>[\s\S]*?<\/ide_opened_file>/gi, '')
            .replace(/<ide_diagnostics>[\s\S]*?<\/ide_diagnostics>/gi, '')
            .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/gi, '');
    }

    /**
     * Extract the genuine user prose from a transcript user turn, or '' if the
     * turn carries no real prose (tool results, command wrappers, meta noise).
     */
    static _userTextForExport(content) {
        let parts = [];
        if (typeof content === 'string') {
            parts.push(content);
        } else if (Array.isArray(content)) {
            for (const b of content) {
                if (b && b.type === 'text') parts.push(String(b.text || ''));
            }
        } else {
            return '';
        }
        let text = this._stripExportWrappers(parts.join('\n')).trim();
        if (Files.isEmpty(text)) return '';
        if (/^<(system-reminder|command-name|command-message|command-args|local-command-stdout|bash-input|bash-stdout|bash-stderr)\b/i.test(text)) return '';
        if (/^Caveat:/.test(text)) return '';
        if (/^\[Request interrupted by user/.test(text)) return '';
        return text;
    }

    /** Render a tool_use block as a one-line blockquote: `> 🔧 Name — description`. */
    static _toolUseLine(block) {
        const name = block.name || 'Tool';
        const input = block.input || {};
        let desc = input.description || input.prompt || input.command || input.pattern
            || input.query || input.file_path || input.path || input.url || input.skill || '';
        desc = String(desc).split(/\r?\n/)[0].trim();
        if (desc.length > 100) desc = desc.slice(0, 100).trim() + '…';
        return desc ? `> 🔧 ${name} — ${desc}` : `> 🔧 ${name}`;
    }

    /**
     * Convert a Claude Code session transcript (JSONL text) into a readable
     * Markdown chat. Each genuine user turn becomes a `## 👤 User` section and
     * each assistant text / tool-use block a `## 🤖 Claude` section. Hidden
     * thinking and raw tool results are omitted unless includeThinking is set.
     */
    static _transcriptToMarkdown(jsonlText, opts = {}) {
        console.info(`[Claude._transcriptToMarkdown] 🟢 Starting...`);
        const includeThinking = opts.includeThinking === true;
        const includeTools = opts.includeTools !== false;
        const out = ['# Chat Transcript', ''];

        for (const raw of String(jsonlText).split(/\r?\n/)) {
            if (!raw.trim()) continue;
            let entry;
            try { entry = JSON.parse(raw); } catch (e) { continue; }
            if (!entry || (entry.type !== 'user' && entry.type !== 'assistant')) continue;

            const content = (entry.message || {}).content;

            if (entry.type === 'user') {
                if (entry.isMeta) continue;
                const text = this._userTextForExport(content);
                if (!Files.isEmpty(text)) out.push('## 👤 User', '', text, '');
                continue;
            }

            // assistant
            const blocks = Array.isArray(content)
                ? content
                : (typeof content === 'string' ? [{ type: 'text', text: content }] : []);
            for (const b of blocks) {
                if (!b || !b.type) continue;
                if (b.type === 'text') {
                    const t = String(b.text || '').trim();
                    if (t) out.push('## 🤖 Claude', '', t, '');
                } else if (b.type === 'thinking') {
                    if (!includeThinking) continue;
                    const t = String(b.thinking || '').trim();
                    if (t) out.push('## 🤖 Claude', '', '> 💭 ' + t.replace(/\r?\n/g, '\n> '), '');
                } else if (b.type === 'tool_use') {
                    if (!includeTools) continue;
                    out.push('## 🤖 Claude', '', this._toolUseLine(b), '');
                }
                // tool_result blocks (only seen in user turns) are intentionally dropped
            }
        }

        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
    }

    /**
     * Export a Claude Code chat to Markdown under the project's `.claude` folder.
     *
     * Finds the project's most recent session transcript (the JSONL files Claude
     * Code keeps under ~/.claude/projects/<encoded-path>/), converts it to a
     * readable Markdown chat and writes it as `<project>/.claude/YYYY-MM-DD.md`
     * (auto-incremented if that file already exists). This is the offline
     * equivalent of the `/export` command, which is unavailable in the VS Code
     * extension.
     *
     * @param {string|null} [projectPath]  Project folder (or a file inside it) whose chat to export; null → current working directory.
     * @param {object} [opts]
     * @param {string|null} [opts.sessionFile]   Explicit .jsonl to export instead of the latest.
     * @param {string|null} [opts.outDir]        Output folder; default <project>/<config Claude.export.Folder || .claude>.
     * @param {boolean|null} [opts.includeThinking] Include hidden thinking blocks; null → config Claude.export.IncludeThinking || false.
     * @param {boolean|null} [opts.includeTools]    Include tool-use lines; null → config Claude.export.IncludeTools (default true).
     * @returns {string|null} The absolute path of the written .md file, or null on failure / no-op.
     */
    static exportChat(projectPath = null, opts = {}) {
        console.info(`[Claude.exportChat] 🟢 Starting... projectPath=${projectPath} opts=${JSON.stringify(opts)}`);
        try {
            const projectRoot = this._resolveProjectRoot(projectPath);
            console.info(`[Claude.exportChat] projectRoot=${projectRoot}`);

            let sessionFile = opts.sessionFile ? path.resolve(opts.sessionFile) : null;
            console.info(`[Claude.exportChat] explicit sessionFile=${sessionFile}`);
            if (sessionFile) {
                if (!fs.existsSync(sessionFile)) {
                    Dialogs.warningBox(`Session file not found:\n${sessionFile}`, 'Export Chat');
                    return null;
                }
            } else {
                // Claude Code stores transcripts under a folder where every
                // non-alphanumeric char of the project path becomes a dash.
                const encodedDir = String(projectRoot).replace(/[^a-zA-Z0-9]/g, '-');
                const transcriptsDir = path.join(os.homedir(), '.claude', 'projects', encodedDir);
                console.info(`[Claude.exportChat] encodedDir=${encodedDir} transcriptsDir=${transcriptsDir}`);
                if (!fs.existsSync(transcriptsDir)) {
                    Dialogs.warningBox(`No Claude Code transcripts found for this project.\n\nLooked in:\n${transcriptsDir}`, 'Export Chat');
                    return null;
                }
                sessionFile = this._findLatestTranscript(transcriptsDir);
                console.info(`[Claude.exportChat] latest sessionFile=${sessionFile}`);
                if (!sessionFile) {
                    Dialogs.warningBox(`No .jsonl session transcript found in:\n${transcriptsDir}`, 'Export Chat');
                    return null;
                }
            }

            const cfgThink = this._cfg('export', 'IncludeThinking');
            const cfgTools = this._cfg('export', 'IncludeTools');
            const includeThinking = Files.isEmpty(opts.includeThinking)
                ? (cfgThink === true || cfgThink === 'true')
                : (opts.includeThinking === true || opts.includeThinking === 'true');
            const includeTools = Files.isEmpty(opts.includeTools)
                ? !(cfgTools === false || cfgTools === 'false')
                : !(opts.includeTools === false || opts.includeTools === 'false');
            console.info(`[Claude.exportChat] cfgThink=${cfgThink} cfgTools=${cfgTools} includeThinking=${includeThinking} includeTools=${includeTools}`);

            const markdown = this._transcriptToMarkdown(fs.readFileSync(sessionFile, 'utf8'), { includeThinking, includeTools });
            console.info(`[Claude.exportChat] markdownLen=${(markdown || '').length}`);
            if (Files.isEmpty(markdown) || markdown.trim() === '# Chat Transcript') {
                Dialogs.warningBox(`The session transcript produced no exportable messages:\n${sessionFile}`, 'Export Chat');
                return null;
            }

            const folderName = String(this._cfg('export', 'Folder') || '.claude');
            const outDir = opts.outDir ? path.resolve(opts.outDir) : path.join(projectRoot, folderName);
            console.info(`[Claude.exportChat] folderName=${folderName} outDir=${outDir}`);
            Files.mkdirIfNotExists(outDir);

            const outPath = Files.incrementFileName(path.join(outDir, `${this._todayStamp()}.md`));
            console.info(`[Claude.exportChat] outPath=${outPath}`);
            fs.writeFileSync(outPath, markdown, 'utf8');
            console.log(`[Claude.exportChat] ✅ ${path.basename(sessionFile)}  →  ${outPath}`);
            return outPath;
        } catch (error) {
            this._reportError(error, 'Export Chat');
            return null;
        }
    }
}
