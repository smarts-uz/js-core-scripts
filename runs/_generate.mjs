// Generates STANDALONE per-method runners: runs/<Class>/<method>.mjs for every
// public static (non "_"-prefixed) method of every class under utils/ (or a
// chosen subset). Each generated runner is a COMPLETE self-contained script —
// it imports the class + Yamls/Dates/Dialogs, parses its own args with yargs
// (one .option() per method parameter, reflected at generation time), and calls
// the class's static method DIRECTLY, wrapped in the CmdLine.TryCatch toggle.
// No shared engine, no delegation.
//
//   node runs/_generate.mjs                  # all classes
//   node runs/_generate.mjs Homoglyph Word   # only the named classes
//
// runs/_generate.mjs sits one level below the project root inside runs/, so
// utils/ is ../utils and the generated runners (runs/<Class>/x.mjs, two levels
// down) import the class as ../../utils/<Class>.js.

import { readdirSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RUNS_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const ROOT = path.resolve(RUNS_DIR, '..');
const UTILS_DIR = path.join(ROOT, 'utils');

// Per-parameter CLI flag aliases (generation-time): chooses the flag name(s) a
// parameter is exposed under. The primary path-ish param gets --file/-f; the
// rest map by their own name (with a few short aliases) so the generated
// .option() blocks read naturally and the legacy shell tokens keep working.
const FLAG = {
    fileName: { flag: 'file', alias: 'f' },
    filename: { flag: 'file', alias: 'f' },
    filePath: { flag: 'file', alias: 'f' },
    path: { flag: 'file', alias: 'f' },
    source: { flag: 'file', alias: 'f' },
    folder: { flag: 'folder' },
    folderPath: { flag: 'folder' },
    mhtPath: { flag: 'mhtml' },
    mhtmlPath: { flag: 'mhtml' },
    yamlPath: { flag: 'yaml' },
    ymlFile: { flag: 'yaml' },
    sourceFolder: { flag: 'sourceFolder' },
    chars: { flag: 'chars', alias: 'c' },
    type: { flag: 'type', alias: 't' },
    searchStr: { flag: 'search', alias: 's' },
    replaceStr: { flag: 'replace', alias: 'r' },
    sheetFilter: { flag: 'sheet' },
    recalc: { flag: 'recalc' },
    fontName: { flag: 'font' },
    pageBreak: { flag: 'pageBreak', alias: 'pb' },
    password: { flag: 'password', alias: 'p' },
    genPdf: { flag: 'gen-pdf' },
    templatePath: { flag: 'template' },
    lineBetween: { flag: 'lineBetween' },
    deleteMht: { flag: 'offline' },
    mergedName: { flag: 'name' },
    protectionType: { flag: 'protectionType' },
    sheetName: { flag: 'sheetName' },
    maxLevel: { flag: 'maxLevel' },
};

// Parameter names that take a list (swallow all positionals into an array).
const ARRAY_PARAMS = ['filePaths', 'folderPaths', 'files', 'folders', 'paths', 'fileNames'];

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

async function importClass(className) {
    const filePath = path.join(UTILS_DIR, `${className}.js`);
    const mod = await import(pathToFileURL(filePath).href);
    return mod[className] ?? mod.default ?? Object.values(mod).find((v) => typeof v === 'function');
}

/** Reflect a method's parameters: plain, optional (default), rest, object. */
function reflectParams(fn) {
    const src = Function.prototype.toString.call(fn);
    const objMatch = src.match(/^[^(]*\(\s*\{([^}]*)\}\s*(?:=\s*\{\s*\})?\s*\)/s);
    if (objMatch) {
        const keys = objMatch[1]
            .split(',')
            .map((k) => k.split('=')[0].trim())
            .filter(Boolean);
        return { object: true, keys };
    }
    const m = src.match(/^[^(]*\(([^)]*)\)/s) || src.match(/\(([^)]*)\)/s);
    const raw = (m ? m[1] : '').trim();
    if (!raw) return { object: false, params: [] };
    const params = raw.split(',').map((p) => {
        const rest = p.trim().startsWith('...');
        const [namePart, ...def] = p.split('=');
        return { name: namePart.trim().replace(/^\.\.\./, ''), hasDefault: def.length > 0, rest };
    });
    return { object: false, params };
}

/** Builds the yargs option/positional declarations + the call-args expression. */
function buildArgsCode(reflected) {
    if (reflected.object) {
        const opts = reflected.keys
            .map(
                (k) =>
                    `        .option(${JSON.stringify(k)}, { describe: ${JSON.stringify(`${k} (object key)`)} })`
            )
            .join('\n');
        return {
            options: opts,
            positional: '',
            callExpr: `{ ${reflected.keys.map((k) => `...(argv[${JSON.stringify(k)}] !== undefined ? { ${k}: argv[${JSON.stringify(k)}] } : {})`).join(', ')} }`,
            objectParam: true,
        };
    }

    const optionLines = [];
    const callParts = [];
    let positional = '';

    reflected.params.forEach((p) => {
        if (ARRAY_PARAMS.includes(p.name)) {
            positional = `        .command('$0 [${p.name}..]', false, (y) => y.positional(${JSON.stringify(p.name)}, { array: true, type: 'string' }))`;
            callParts.push(`argv[${JSON.stringify(p.name)}] || []`);
            return;
        }
        const f = FLAG[p.name] || { flag: p.name };
        const props = [];
        if (f.alias) props.push(`alias: ${JSON.stringify(f.alias)}`);
        props.push(`describe: ${JSON.stringify(`${p.name}${p.hasDefault ? ' (optional)' : ''}`)}`);
        optionLines.push(`        .option(${JSON.stringify(f.flag)}, { ${props.join(', ')} })`);
        callParts.push(`argv[${JSON.stringify(f.flag)}]`);
    });

    return {
        options: optionLines.join('\n'),
        positional,
        callExpr: callParts.join(', '),
        objectParam: false,
    };
}

/** The full standalone source of one generated runner file. */
function runnerSource(className, methodName, reflected) {
    const label = `${className} ${methodName}`;
    const { options, positional, callExpr } = buildArgsCode(reflected);

    // A no-parameter method needs no `argv` — emit a bare `.parse()` (still wires
    // up --help) without an unused `const argv` binding.
    const usesArgv = Boolean(positional || options);
    const bind = usesArgv ? 'const argv = ' : '';
    const yargsBlock = positional
        ? `    ${bind}yargs(hideBin(process.argv))\n${positional}\n${options ? options + '\n' : ''}        .help()\n        .parse();`
        : `    ${bind}yargs(hideBin(process.argv))\n${options ? options + '\n' : ''}        .help()\n        .parse();`;

    const call = `${className}.${methodName}(${callExpr})`;

    // Import Yamls/Dates/Dialogs for the wrapper, but skip whichever equals the
    // target class (a Dates/Yamls/Dialogs runner) to avoid a duplicate `const`.
    const helperImports = ['Yamls', 'Dates', 'Dialogs']
        .filter((h) => h !== className)
        .map((h) => `const { ${h} } = await import('../../utils/${h}.js');`)
        .join('\n');

    return `// AUTO-GENERATED by runs/_generate.mjs — standalone runner for ${className}.${methodName}.
// Edit the method in utils/${className}.js, then re-run the generator to refresh.
// Calls ${className}.${methodName}(...) directly; no shared engine.
//
// argv[1] is repointed at a phantom entrypoint in the PROJECT ROOT *before* the
// dynamic imports run, because utils/Secrets.js loads .env (and Yamls reads
// config.yml) from dirname(process.argv[1]). runs/${className}/ is two levels
// below root, so '..','..' = root.
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('yargs');
const { hideBin } = await import('yargs/helpers');
const yargs = yargsMod.default;
const { ${className} } = await import('../../utils/${className}.js');
${helperImports}

async function main() {
    console.log('1️⃣ ${label} Start');

${yargsBlock}

    const run = async () => {
        const result = await ${call};
        if (result !== undefined) console.log('📤 Result:', typeof result === 'object' ? JSON.stringify(result, null, 2) : result);
    };

    if (Yamls.getConfig('CmdLine.TryCatch') === 'true') {
        try {
            await run();
            Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
        } catch (error) {
            console.error('❌ Error:', error);
            Dialogs.warningBox(error.message, '${label} Error');
            Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError')));
            process.exit(1);
        }
    } else {
        await run();
        Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
    }

    console.log('3️⃣ ${label} Done');
}

main();
`;
}

/** Generate every runner for one class; returns the method count. */
async function generateClass(className) {
    const cls = await importClass(className);
    if (!cls) {
        console.warn(`⚠️  ${className}: no class export found — skipped`);
        return 0;
    }
    const methods = publicStaticMethods(cls);
    if (!methods.length) {
        console.warn(`⚠️  ${className}: no public static methods — skipped`);
        return 0;
    }
    const classDir = path.join(RUNS_DIR, className);
    mkdirSync(classDir, { recursive: true });

    for (const method of methods) {
        const file = path.join(classDir, `${method}.mjs`);
        const next = runnerSource(className, method, reflectParams(cls[method]));
        if (existsSync(file) && readFileSync(file, 'utf8') === next) continue; // unchanged
        writeFileSync(file, next, 'utf8');
    }
    console.log(`✅ runs/${className}/ — ${methods.length} runner(s): ${methods.join(', ')}`);
    return methods.length;
}

// Pure helpers are exported for unit testing; the generation run below only
// fires when this file is the process entry (node runs/_generate.mjs …), so
// importing it in a test is side-effect-free.
export { reflectParams, buildArgsCode, runnerSource, publicStaticMethods };

const isEntry = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntry) {
    const requested = process.argv.slice(2);
    const classNames = requested.length
        ? requested
        : readdirSync(UTILS_DIR)
              .filter((f) => f.endsWith('.js'))
              .map((f) => path.basename(f, '.js'));

    let total = 0;
    for (const className of classNames) {
        total += await generateClass(className);
    }
    console.log(
        `\n🎉 Generated standalone runners for ${classNames.length} class(es), ${total} method(s) total.`
    );
}
