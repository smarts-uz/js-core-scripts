import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

import { Yamls } from './Yamls.js';
import { Files } from './Files.js';
import { Dialogs } from './Dialogs.js';

/**
 * Gemini — thin wrapper around the locally installed `gemini` CLI
 * (Google Gemini CLI, @google/gemini-cli). A 1:1 clone of the Claude utility
 * adapted to Gemini's command-line interface.
 *
 * Every request shells out to the CLI in headless mode: the full prompt travels
 * on STDIN (so nothing has to be escaped on the command line) and a short
 * directive is passed via `-p` (which Gemini appends to the STDIN input, and
 * whose presence switches the CLI to non-interactive mode). Output is read as
 * JSON (`-o json`).
 *
 * Defaults for level / language / model / effort / think live under the
 * `Gemini:` section of config.yml (sub-sections `rename` and `summarize`) and
 * are used whenever the matching argument is null.
 *
 * Note: the Gemini CLI has no "effort" flag, so the `effort` argument and
 * config key are kept only for parity with the Claude class and are not sent to
 * the CLI. Gemini also needs an auth method (GEMINI_API_KEY env var or
 * ~/.gemini/settings.json); when missing, the CLI's error is surfaced verbatim.
 */
export class Gemini {

    /** Max characters of text-file content embedded inline (keeps the prompt sane). */
    static MAX_CONTENT_CHARS = 16000;

    /** Ultimate fallback detalization level if config is missing. */
    static DEFAULT_LEVEL = 3;

    /** Short instruction passed via -p; the real prompt is on STDIN before it. */
    static HEADLESS_DIRECTIVE = 'Follow the instruction provided in the input above and respond exactly as specified.';

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

    /**
     * Show a dialog for an error from any method. A launch failure (gemini could
     * not be executed) gets an error dialog with the description; any other
     * error gets a warning dialog titled with `title` and the full error in the
     * message. Dedupes via a flag so it is shown once per error.
     */
    static _reportError(error, title = 'Gemini') {
        if (error && error._geminiDialogShown) return;
        const desc = (error && (error.stack || error.message)) || String(error);
        if (error && error.geminiLaunchFailure) {
            Dialogs.errorBox(desc, 'Gemini CLI could not be executed');
        } else {
            Dialogs.warningBox(desc, title);
        }
        if (error && typeof error === 'object') error._geminiDialogShown = true;
    }

    /** Sub-folder under AI/ that holds this provider's prompt templates. */
    static PROMPT_DIR = 'Gemini';

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
        return Yamls.getConfig(`Gemini.${section}.${key}`, null, defaultValue);
    }

    /** Resolve the model: explicit arg → config Gemini.<section>.Model → 'gemini-2.5-pro'. */
    static _resolveModel(model, section) {
        console.info(`[Gemini._resolveModel] 🟢 Starting...`);
        if (!Files.isEmpty(model)) return String(model);
        return String(this._cfg(section, 'Model') || 'gemini-2.5-pro');
    }

    /**
     * Resolve the effort level (kept for parity with the Claude class; the
     * Gemini CLI has no effort flag so this value is not sent to it).
     */
    static _resolveEffort(effort, section) {
        console.info(`[Gemini._resolveEffort] 🟢 Starting...`);
        if (!Files.isEmpty(effort)) return String(effort);
        return String(this._cfg(section, 'Effort') || 'max');
    }

    /** Resolve the think flag: explicit arg → config Gemini.<section>.Think → false. */
    static _resolveThink(think, section) {
        console.info(`[Gemini._resolveThink] 🟢 Starting...`);
        if (think === true || think === 'true') return true;
        if (think === false || think === 'false') return false;
        const cfg = this._cfg(section, 'Think');
        return cfg === true || cfg === 'true';
    }

    /** Resolve the detalization level: explicit arg → config Gemini.<section>.level → fallback. */
    static _resolveLevel(level, section, fallback) {
        console.info(`[Gemini._resolveLevel] 🟢 Starting...`);
        if (!Files.isEmpty(level)) return this._clampLevel(level);
        const cfg = this._cfg(section, 'level');
        return this._clampLevel(Files.isEmpty(cfg) ? fallback : cfg);
    }

    /** Resolve the output language: explicit arg → config Gemini.<section>.Language → 'English'. */
    static _resolveLanguage(language, section) {
        console.info(`[Gemini._resolveLanguage] 🟢 Starting...`);
        if (!Files.isEmpty(language)) return String(language);
        const cfg = this._cfg(section, 'Language');
        return String(Files.isEmpty(cfg) ? 'English' : cfg);
    }

    /**
     * Run the `gemini` CLI once and return its plain-text answer.
     *
     * @param {string} prompt                  The full prompt (sent via STDIN).
     * @param {object} [opts]
     * @param {string} [opts.model]            Model id (default from config).
     * @param {string} [opts.section]          Config section for default resolution.
     * @param {string|string[]} [opts.includeDirs] Extra directories to include in the workspace.
     * @param {string} [opts.approvalMode]     Approval mode (e.g. 'yolo' to auto-run tools headlessly).
     * @returns {string} The assistant's final text answer (trimmed).
     */
    static _ask(prompt, opts = {}) {
        console.info(`[Gemini._ask] 🟢 Starting...`);
        try {
            if (Files.isEmpty(prompt)) {
                throw new Error('Gemini._ask: prompt is empty');
            }

            const model = this._resolveModel(opts.model, opts.section);

            // Full prompt rides on STDIN; -p carries a short directive (its
            // presence triggers headless mode and it is appended after STDIN).
            const args = ['-o', 'json', '-m', model, '-p', this._shellArg(this.HEADLESS_DIRECTIVE)];

            if (!Files.isEmpty(opts.includeDirs)) {
                const dirs = Array.isArray(opts.includeDirs) ? opts.includeDirs : [opts.includeDirs];
                for (const d of dirs) args.push('--include-directories', this._shellArg(d));
            }
            if (!Files.isEmpty(opts.approvalMode)) {
                args.push('--approval-mode', String(opts.approvalMode));
            }

            console.log(`[Gemini._ask] gemini ${args.join(' ')} (cwd=${opts.cwd || process.cwd()})`);

            // shell:true is required on Windows to launch the `gemini.cmd` shim;
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
            const result = spawnSync('gemini', args, spawnOpts);

            // gemini could not be executed at all
            if (result.error) {
                const e = new Error(`Gemini CLI (gemini) could not be executed.\n\n${result.error.message}\n\nIs the Gemini CLI installed (npm i -g @google/gemini-cli) and available on PATH?`);
                e.geminiLaunchFailure = true;
                throw e;
            }

            const stderr = (result.stderr || '').trim();
            const stdout = (result.stdout || '').trim();

            // Windows cmd reports a missing command via this text / exit code 9009
            if (result.status === 9009 || /not recognized|command not found|cannot find/i.test(stderr)) {
                const e = new Error(`Gemini CLI (gemini) was not found or could not run.\n\n${stderr || `exit code ${result.status}`}\n\nIs the Gemini CLI installed (npm i -g @google/gemini-cli) and available on PATH?`);
                e.geminiLaunchFailure = true;
                throw e;
            }

            // Gemini prints a structured JSON error (e.g. missing auth) on stdout
            let parsed = null;
            try { parsed = JSON.parse(stdout); } catch (e) { /* not json */ }

            if (parsed && parsed.error) {
                const code = parsed.error.code !== undefined ? ` (code ${parsed.error.code})` : '';
                const msg = parsed.error.message || JSON.stringify(parsed.error);
                throw new Error(`Gemini error${code}: ${msg}`);
            }

            if (result.status !== 0) {
                throw new Error(`Gemini CLI exited with code ${result.status} (stderr: ${stderr || 'none'}; stdout: ${stdout.slice(0, 300) || 'none'})`);
            }

            if (Files.isEmpty(stdout)) {
                throw new Error('Gemini CLI returned no output');
            }

            return this._extractText(stdout, parsed);
        } catch (error) {
            // report here so a direct _ask() call still surfaces a dialog;
            // the dedupe flag stops callers from showing it again.
            this._reportError(error, 'Gemini');
            throw error;
        }
    }

    /**
     * Pull the assistant text out of the CLI's `-o json` envelope, falling back
     * to the raw stdout when it is not valid JSON.
     */
    static _extractText(stdout, parsed = null) {
        console.info(`[Gemini._extractText] 🟢 Starting...`);
        const obj = parsed !== null ? parsed : (() => { try { return JSON.parse(stdout); } catch (e) { return null; } })();
        if (obj && typeof obj === 'object') {
            const text = obj.response ?? obj.result ?? obj.text ?? obj.output ?? obj.content ?? '';
            return String(text).trim();
        }
        return String(stdout).trim();
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
        console.info(`[Gemini._sanitizeName] 🟢 Starting...`);
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
     * The new name is proposed by Gemini from the file content WITHOUT
     * discarding the existing name — the current name is given to the model as
     * context to preserve/refine. The original extension is always kept and
     * collisions are auto-incremented.
     *
     * The `level` controls how detailed the new name is, expressed as its
     * target length: level * 30 characters, hard-capped at 150
     * (L1=30, L2=60, L3=90, L4=120, L5=150).
     *
     * Pass null (the default) for level/language/model/effort/think to fall
     * back to the corresponding value in the config.yml `Gemini.rename`
     * section; pass an explicit value to override it.
     *
     * @param {string} fileName          Path to the file to rename.
     * @param {number|null} [level]      Detalization level 1..5, or null → config Gemini.rename.level || 4.
     * @param {string|null} [language]   Output language for the name, or null → config Gemini.rename.Language || 'English'.
     * @param {string|null} [model]      Model id, or null → config Gemini.rename.Model || 'gemini-2.5-pro'.
     * @param {string|null} [effort]     Kept for parity; not used by the Gemini CLI.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Gemini.rename.Think || false.
     * @returns {string|null} The new absolute path, or null on failure / no-op.
     */
    static rename(fileName, level = null, language = null, model = null, effort = null, think = null) {
        console.info(`[Gemini.rename] 🟢 Starting... fileName=${fileName} level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        try {
            const filePath = path.resolve(fileName);
            if (!fs.existsSync(filePath)) {
                Dialogs.warningBox(`File not found: ${filePath}`, 'Gemini Rename');
                return null;
            }
            if (!fs.lstatSync(filePath).isFile()) {
                Dialogs.warningBox(`Not a file: ${filePath}`, 'Gemini Rename');
                return null;
            }

            const dir = path.dirname(filePath);
            const ext = path.extname(filePath);
            const oldStem = path.basename(filePath, ext);
            console.info(`[Gemini.rename] filePath=${filePath} dir=${dir} ext=${ext} oldStem=${oldStem}`);

            const lvl = this._resolveLevel(level, 'rename', 4);
            // target name length: level * 30 chars, capped at 150 (L1=30 ... L5=150)
            const maxLen = Math.min(150, this._clampLevel(lvl) * 30);
            const lang = this._resolveLanguage(language, 'rename');
            const wantThink = this._resolveThink(think, 'rename');
            // Text files: read the bytes directly and embed them inline — fast, one-shot,
            // no tool round-trip. Binary/scanned files: leave the content empty and let
            // Gemini's own file tool open the path (OCR), so a scan is named by its real
            // content, not by raw bytes that for a scan are only image metadata.
            const isText = this.TEXT_EXTENSIONS.has(ext.toLowerCase());
            let content = '';
            if (isText) {
                content = this._stripControlChars(fs.readFileSync(filePath, 'utf8'));
                if (content.length > this.MAX_CONTENT_CHARS) {
                    content = content.slice(0, this.MAX_CONTENT_CHARS) + '\n\n[...truncated...]';
                }
            }
            console.info(`[Gemini.rename] lvl=${lvl} maxLen=${maxLen} lang=${lang} wantThink=${wantThink} isText=${isText} contentLen=${content.length}`);

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
            console.debug(`[Gemini.rename] thinkHint="${thinkHint}" promptLen=${prompt.length}`);
            // grant the file-reading tool only for binary files; text content is inline
            const askOpts = { model, section: 'rename' };
            if (!isText) { askOpts.includeDirs = dir; askOpts.approvalMode = 'yolo'; }
            const answer = this._ask(prompt, askOpts);
            console.log(`[Gemini.rename] Raw answer: ${answer}`);

            let newStem = this._sanitizeName(answer, maxLen);
            // drop a duplicated extension if the model appended the original one
            if (ext && newStem.toLowerCase().endsWith(ext.toLowerCase())) {
                newStem = newStem.slice(0, newStem.length - ext.length).trim();
            }
            console.info(`[Gemini.rename] newStem=${newStem}`);

            if (Files.isEmpty(newStem)) {
                console.warn(`[Gemini.rename] Empty suggestion, keeping old name`);
                Dialogs.warningBox(`Gemini returned no usable name for:\n${filePath}`, 'Gemini Rename');
                return null;
            }

            if (newStem === oldStem) {
                console.log(`[Gemini.rename] Suggested name equals current name, no change`);
                return filePath;
            }

            let target = path.join(dir, `${newStem}${ext}`);
            // skip the collision check for a case-only rename of the same file
            if (path.resolve(target).toLowerCase() !== filePath.toLowerCase()) {
                target = Files.incrementFileName(target);
            }
            console.info(`[Gemini.rename] target=${target}`);

            fs.renameSync(filePath, target);
            console.log(`[Gemini.rename] ✅ ${path.basename(filePath)}  →  ${path.basename(target)}`);
            return target;
        } catch (error) {
            this._reportError(error, 'Gemini Rename');
            return null;
        }
    }

    /**
     * Rename many files by content. Each file is processed independently; one
     * failure never aborts the rest.
     *
     * Pass null (the default) for level/language/model/effort/think to use the
     * config.yml `Gemini.rename` defaults; pass an explicit value to override.
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
        console.info(`[Gemini.renameMany] 🟢 Starting... level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        const files = Array.isArray(filePaths) ? filePaths : [filePaths];
        console.info(`[Gemini.renameMany] ${files.length} file(s): ${JSON.stringify(files)}`);
        const results = [];

        // rename() reports its own errors and never throws, so the loop always
        // completes; a failed file simply yields ok:false.
        for (const file of files) {
            const to = this.rename(file, level, language, model, effort, think);
            console.info(`[Gemini.renameMany] ${file} → ${to}`);
            results.push({ from: file, to, ok: to !== null });
        }

        const okCount = results.filter(r => r.ok).length;
        console.log(`[Gemini.renameMany] ✅ Renamed ${okCount}/${files.length} file(s)`);
        return results;
    }

    /**
     * Read a (non-text) file in full and write a Markdown summary of its
     * content next to the original, as `<name>.md` (auto-incremented if that
     * file already exists). The file is read by the `gemini` CLI itself, so this
     * works for PDFs, images and other rich documents.
     *
     * Plain-text files (.txt, .md, .js, …) are rejected — this method is for
     * non-text files.
     *
     * Pass null (the default) for level/language/model/effort/think to fall
     * back to the config.yml `Gemini.summarize` section; pass an explicit value
     * to override.
     *
     * @param {string} fileName          Path to the file to summarize.
     * @param {number|null} [level]      Detalization level 1..5, or null → config Gemini.summarize.level || 5.
     * @param {string|null} [language]   Output language, or null → config Gemini.summarize.Language || 'English'.
     * @param {string|null} [model]      Model id, or null → config Gemini.summarize.Model || 'gemini-2.5-pro'.
     * @param {string|null} [effort]     Kept for parity; not used by the Gemini CLI.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Gemini.summarize.Think || false.
     * @returns {string|null} The absolute path of the written .md file, or null on failure.
     */
    static summarize(fileName, level = null, language = null, model = null, effort = null, think = null) {
        console.info(`[Gemini.summarize] 🟢 Starting... fileName=${fileName} level=${level} language=${language} model=${model} effort=${effort} think=${think}`);
        try {
            const filePath = path.resolve(fileName);
            console.info(`[Gemini.summarize] filePath=${filePath}`);
            if (!fs.existsSync(filePath)) {
                Dialogs.warningBox(`File not found: ${filePath}`, 'Gemini Summarize');
                return null;
            }
            if (!fs.lstatSync(filePath).isFile()) {
                Dialogs.warningBox(`Not a file: ${filePath}`, 'Gemini Summarize');
                return null;
            }

            const ext = path.extname(filePath).toLowerCase();
            if (this.TEXT_EXTENSIONS.has(ext)) {
                Dialogs.warningBox(`summarize is for non-text files; "${ext || '(no extension)'}" is a text file.\n\nSkipped:\n${filePath}`, 'Gemini Summarize');
                return null;
            }

            const dir = path.dirname(filePath);
            const stem = path.basename(filePath, path.extname(filePath));
            console.info(`[Gemini.summarize] ext=${ext} dir=${dir} stem=${stem}`);

            const lvl = this._resolveLevel(level, 'summarize', 5);
            const lang = this._resolveLanguage(language, 'summarize');
            const wantThink = this._resolveThink(think, 'summarize');
            console.info(`[Gemini.summarize] lvl=${lvl} lang=${lang} wantThink=${wantThink}`);

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
            console.debug(`[Gemini.summarize] thinkHint="${thinkHint}" levelDesc="${levelDesc[lvl] || levelDesc[3]}" promptLen=${prompt.length}`);
            const summary = this._ask(prompt, {
                model,
                section: 'summarize',
                includeDirs: dir,
                approvalMode: 'yolo',
            });
            console.info(`[Gemini.summarize] summaryLen=${(summary || '').length}`);

            if (Files.isEmpty(summary)) {
                Dialogs.warningBox(`Gemini returned an empty summary for:\n${filePath}`, 'Gemini Summarize');
                return null;
            }

            const outPath = Files.incrementFileName(path.join(dir, `${stem}.md`));
            console.info(`[Gemini.summarize] outPath=${outPath}`);
            fs.writeFileSync(outPath, summary, 'utf8');
            console.log(`[Gemini.summarize] ✅ ${path.basename(filePath)}  →  ${path.basename(outPath)}`);
            return outPath;
        } catch (error) {
            this._reportError(error, 'Gemini Summarize');
            return null;
        }
    }

    /**
     * Run a free-form, user-typed instruction against every file in a folder.
     *
     * Opens a multi-line input dialog for the instruction (e.g. "categorize all
     * files"), builds the prompt as the `AI/Gemini/execute.md` base template
     * followed by one empty line and that instruction, then runs the `gemini`
     * CLI inside the folder in auto-approve mode so it carries the task out
     * autonomously (creating sub-folders, moving / renaming / editing files).
     *
     * Pass null (the default) for model/effort/think to fall back to the
     * config.yml `Gemini.execute` section; pass an explicit value to override.
     *
     * @param {string} folder            Path to the folder to operate on.
     * @param {string|null} [model]      Model id, or null → config Gemini.execute.Model || 'gemini-2.5-pro'.
     * @param {string|null} [effort]     Kept for parity; not used by the Gemini CLI.
     * @param {boolean|null} [think]     Reason-first toggle, or null → config Gemini.execute.Think || false.
     * @returns {string|null} The CLI's final text report, or null on failure / cancel.
     */
    static execute(folder, model = null, effort = null, think = null) {
        console.info(`[Gemini.execute] 🟢 Starting... folder=${folder} model=${model} effort=${effort} think=${think}`);
        try {
            const folderPath = path.resolve(folder);
            console.info(`[Gemini.execute] folderPath=${folderPath}`);
            if (!fs.existsSync(folderPath) || !fs.lstatSync(folderPath).isDirectory()) {
                Dialogs.warningBox(`Folder not found: ${folderPath}`, 'Gemini Execute');
                return null;
            }

            // multi-line prompt typed by the user (e.g. "categorize all files")
            const instruction = Dialogs.multilineInputBox(
                `Enter the instruction Gemini should run on every file in:\n${folderPath}`,
                'Gemini Execute',
            );
            console.info(`[Gemini.execute] instructionLen=${(instruction || '').length}`);
            if (Files.isEmpty(instruction)) {
                console.warn(`[Gemini.execute] No instruction entered, aborting`);
                return null;
            }

            const wantThink = this._resolveThink(think, 'execute');
            const approvalMode = String(this._cfg('execute', 'ApprovalMode') || 'yolo');
            console.info(`[Gemini.execute] wantThink=${wantThink} approvalMode=${approvalMode}`);

            // base template + one empty line + the user's instruction
            const thinkHint = wantThink ? 'Think carefully about the folder and the instruction before acting, then carry it out.' : '';
            const base = this._renderTemplate(this._loadPrompt('execute'), { ThinkHint: thinkHint, Folder: folderPath });
            const prompt = `${base.replace(/\s+$/, '')}\n\n${instruction}`;
            console.debug(`[Gemini.execute] thinkHint="${thinkHint}" promptLen=${prompt.length}`);

            const answer = this._ask(prompt, {
                model,
                section: 'execute',
                includeDirs: folderPath,
                approvalMode,
                cwd: folderPath,
            });
            console.info(`[Gemini.execute] answerLen=${(answer || '').length}`);

            if (!Files.isEmpty(answer)) {
                Dialogs.messageBox(answer, 'Gemini Execute — Done');
            }
            console.log(`[Gemini.execute] ✅ Finished on ${folderPath}`);
            return answer;
        } catch (error) {
            this._reportError(error, 'Gemini Execute');
            return null;
        }
    }
}
