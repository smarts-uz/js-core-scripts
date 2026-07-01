// Auto-generates README.md documenting every per-method runner.
//
//   # <Class>          (one heading per utils/ class with public static methods)
//   ## <method>(sig)   (one heading per public static method)
//   <full explanation> (the method's JSDoc, signature, run command, params)
//
// The explanation is built from: the method's JSDoc block (parsed from source),
// its reflected signature, the runs/<Class>/<method>.mjs run command, and a
// per-parameter table. Re-run whenever the utils/ API changes:
//   node runs/_gen-readme.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNS_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(RUNS_DIR, '..');
const UTILS_DIR = path.join(ROOT, 'utils');

function publicStaticMethods(cls) {
    return Object.getOwnPropertyNames(cls)
        .filter(
            (n) =>
                typeof cls[n] === 'function' &&
                !n.startsWith('_') &&
                !['length', 'name', 'prototype'].includes(n)
        )
        .sort();
}

function reflectParams(fn) {
    const src = Function.prototype.toString.call(fn);
    const objMatch = src.match(/^[^(]*\(\s*\{([^}]*)\}\s*(?:=\s*\{\s*\})?\s*\)/s);
    if (objMatch) {
        const keys = objMatch[1]
            .split(',')
            .map((k) => k.split('=')[0].trim())
            .filter(Boolean);
        return [{ name: 'options', isObject: true, keys, hasDefault: true }];
    }
    const m = src.match(/^[^(]*\(([^)]*)\)/s) || src.match(/\(([^)]*)\)/s);
    const raw = (m ? m[1] : '').trim();
    if (!raw) return [];
    return raw.split(',').map((p) => {
        const [namePart, ...rest] = p.split('=');
        const name = namePart.trim().replace(/^\.\.\./, '');
        return { name, hasDefault: rest.length > 0, default: rest.join('=').trim() };
    });
}

/** Renders a reflected signature like `word(fileName, [chars])`. */
function signature(name, params) {
    if (params.length === 1 && params[0].isObject) {
        return `${name}({ ${params[0].keys.join(', ')} })`;
    }
    return `${name}(${params.map((p) => (p.hasDefault ? `[${p.name}]` : p.name)).join(', ')})`;
}

/**
 * Extracts, per method, the JSDoc block immediately preceding its
 * `static <name>(` declaration from the class source. Returns { summary, params,
 * returns } where summary is the prose, params/returns come from @param/@returns.
 */
function parseJsDoc(source, methodName) {
    // Locate the method declaration, then require a /** … */ block IMMEDIATELY
    // before it (only whitespace between the closing */ and `static <name>(`).
    // Without that adjacency we'd capture a far-away class-level comment plus all
    // the source in between.
    const declRe = new RegExp(`\\n([ \\t]*)static\\s+${methodName}\\s*\\(`);
    const decl = source.match(declRe);
    if (!decl) return { summary: '', params: {}, returns: '' };
    const before = source.slice(0, decl.index);
    // The JSDoc must be the very LAST thing before the declaration: only
    // whitespace may sit between its closing */ and the static decl.
    if (!/\*\/\s*$/.test(before)) return { summary: '', params: {}, returns: '' };
    // Take the last /** … */ block — find the final `/**` opener.
    const open = before.lastIndexOf('/**');
    if (open === -1) return { summary: '', params: {}, returns: '' };
    const block = before.slice(open).trimEnd();
    // Reject if another `*/` (i.e. an earlier block's close, or stray code) sits
    // between this opener and the decl beyond the block's own close — guards
    // against a method with no JSDoc grabbing a distant one.
    if (block.indexOf('*/') !== block.length - 2) return { summary: '', params: {}, returns: '' };
    const lines = block.split('\n').map((l) => l.replace(/^\s*\/?\*+\/?/, '').trim());
    const summary = [];
    const params = {};
    let returns = '';
    for (const line of lines) {
        const pm = line.match(/^@param\s+\{[^}]*\}\s+(\[?[\w.]+\]?)\s*-?\s*(.*)$/);
        const rm = line.match(/^@returns?\s+\{[^}]*\}\s*(.*)$/);
        if (pm) {
            params[pm[1].replace(/[[\]]/g, '')] = pm[2];
        } else if (rm) {
            returns = rm[1];
        } else if (!line.startsWith('@') && line) {
            summary.push(line);
        }
    }
    return { summary: summary.join(' ').trim(), params, returns };
}

/** Builds an example run command for a method from its params. */
function runCommand(className, methodName, params) {
    const rel = `runs/${className}/${methodName}.mjs`;
    if (!params.length) return `node ${rel}`;
    if (params[0].isObject) {
        const flags = params[0].keys
            .slice(0, 2)
            .map((k) => `--${k} <${k}>`)
            .join(' ');
        return `node ${rel} ${flags}`;
    }
    const first = params[0].name;
    const isPathish = /file|path|folder|yaml|mht|source/i.test(first);
    const isArray = /^(files|folders|paths|filePaths|folderPaths|fileNames)$/.test(first);
    if (isArray) return `node ${rel} <item1> <item2> …`;
    if (isPathish) return `node ${rel} --file "<path>"`;
    return `node ${rel} --${first} <${first}>`;
}

async function main() {
    const classFiles = readdirSync(UTILS_DIR).filter((f) => f.endsWith('.js'));
    const sections = [];
    let classCount = 0;
    let methodCount = 0;

    for (const file of classFiles.sort()) {
        const className = path.basename(file, '.js');
        const source = readFileSync(path.join(UTILS_DIR, file), 'utf8');
        let cls;
        try {
            const mod = await import(pathToFileURL(path.join(UTILS_DIR, file)).href);
            cls =
                mod[className] ??
                mod.default ??
                Object.values(mod).find((v) => typeof v === 'function');
        } catch (e) {
            console.warn(`⚠️  ${className}: import failed — ${e.message}`);
            continue;
        }
        if (!cls) continue;
        const methods = publicStaticMethods(cls);
        if (!methods.length) continue;

        classCount++;
        const lines = [
            `# ${className}`,
            '',
            `Runners: \`runs/${className}/\` — ${methods.length} public static method(s).`,
            '',
        ];

        for (const method of methods) {
            methodCount++;
            const params = reflectParams(cls[method]);
            const doc = parseJsDoc(source, method);

            lines.push(`## ${signature(method, params)}`, '');
            if (doc.summary) lines.push(doc.summary, '');

            lines.push('**Run:**', '', '```bash', runCommand(className, method, params), '```', '');

            if (params.length === 1 && params[0].isObject) {
                lines.push('**Object parameter** — pass each key as `--key value`:', '');
                lines.push('| Key | Description |', '|-----|-------------|');
                for (const k of params[0].keys)
                    lines.push(`| \`--${k}\` | ${doc.params[k] || '—'} |`);
                lines.push('');
            } else if (params.length) {
                lines.push(
                    '| Parameter | Optional | Description |',
                    '|-----------|----------|-------------|'
                );
                for (const p of params) {
                    lines.push(
                        `| \`${p.name}\` | ${p.hasDefault ? `yes (default \`${p.default}\`)` : 'no'} | ${doc.params[p.name] || '—'} |`
                    );
                }
                lines.push('');
            }
            if (doc.returns) lines.push(`**Returns:** ${doc.returns}`, '');
        }
        sections.push(lines.join('\n'));
    }

    const header = [
        '# js_ai_category — Method Runner Reference',
        '',
        '> **Auto-generated** by [`runs/_gen-readme.mjs`](runs/_gen-readme.mjs).',
        '> Do not edit by hand — change the JSDoc in `utils/<Class>.js` and re-run',
        '> `node runs/_gen-readme.mjs`.',
        '',
        'Every public static method of every class under [`utils/`](utils/) has a',
        'dedicated runner at `runs/<Class>/<method>.mjs`, generated by',
        '[`runs/_generate.mjs`](runs/_generate.mjs). Each runner parses CLI args',
        '(via the shared [`runs/_lib.mjs`](runs/_lib.mjs) engine — alias flags like',
        '`--file`/`-f`, positionals, array & object params), maps them to the',
        "method's parameters by reflection, wraps the call in the `CmdLine.TryCatch`",
        'config toggle with exit-timeout sleeps and numbered Start/Done logs, and',
        'prints the return value.',
        '',
        '**Invoke a runner directly:**',
        '',
        '```bash',
        'node runs/Homoglyph/word.mjs --file "report.docx" --chars "STy"',
        'node runs/Markdown/merge.mjs one.md two.md',
        'node runs/Scanner/run.mjs --sourceFolder "d:\\\\Statistic" --maxLevel 5',
        '```',
        '',
        'The Windows right-click menus ([`shell/`](shell/)) and VS Code debug',
        'configs ([`.vscode/launch.json`](.vscode/launch.json)) each point at these',
        'per-method runners.',
        '',
        `**Coverage:** ${classCount} classes, ${methodCount} runnable methods.`,
        '',
        '---',
        '',
    ].join('\n');

    writeFileSync(
        path.join(ROOT, 'README.md'),
        header + sections.join('\n\n---\n\n') + '\n',
        'utf8'
    );
    console.log(`✅ README.md — ${classCount} classes, ${methodCount} methods`);
}

main();
