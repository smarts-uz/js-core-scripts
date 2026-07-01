// tests/ALL.mjs — scan-and-run the utils test suite (top level only).
//
// Discovers every `*.test.js` directly inside tests/ — NON-recursively, the top
// level only — and runs them through Jest in native-ESM mode. Any folder whose
// name starts with "@" is excluded (its tests are never run). Run it with:
//
//   node tests/ALL.mjs                 # run every top-level (non-@) test
//   node tests/ALL.mjs Word Secrets    # only suites whose name matches a filter
//   node tests/ALL.mjs --coverage      # pass-through extra jest flags (start with -)
//
// Why a runner script: the suite needs NODE_OPTIONS=--experimental-vm-modules
// (native ESM, no Babel transform). This script sets that itself and shells out
// to the local jest binary, so you never have to remember the flag. The "@"
// exclusion is enforced two ways — discovery skips @-folders (and, being
// non-recursive, never descends into one anyway), and jest is also told to
// ignore them via --testPathIgnorePatterns — so an @-folder test can never run.

import { spawn } from 'node:child_process';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // <root>/tests
const ROOT = path.resolve(HERE, '..'); // project root (CWD)

// The "@" rule: a folder whose name starts with "@" is excluded.
const isExcludedDir = (name) => name.startsWith('@');

/** Collect *.test.js files DIRECTLY in `dir` (top level only — no recursion). */
function collectTests(dir, found = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            // Not recursive: subfolders are not descended into. Still log an excluded
            // @-folder explicitly so it's clear it was skipped on purpose.
            if (isExcludedDir(entry.name)) {
                console.info(
                    `⏭️  excluded @-folder: ${path.relative(ROOT, path.join(dir, entry.name))}`
                );
            }
            continue;
        }
        if (entry.isFile() && entry.name.endsWith('.test.js')) {
            found.push(path.join(dir, entry.name));
        }
    }
    return found;
}

async function main() {
    console.info(
        `[ALL] 🟢 scanning ${path.relative(ROOT, HERE) || 'tests'} (top level only) for *.test.js (excluding @-folders)…`
    );

    // Split argv into name filters (bare words) and pass-through jest flags (-…).
    const argv = process.argv.slice(2);
    const passThrough = argv.filter((a) => a.startsWith('-'));
    const filters = argv.filter((a) => !a.startsWith('-'));
    console.info(
        `[ALL] filters = ${JSON.stringify(filters)}, jest flags = ${JSON.stringify(passThrough)}`
    );

    let testFiles = collectTests(HERE).map((p) => path.relative(ROOT, p).replaceAll('\\', '/'));
    if (filters.length) {
        testFiles = testFiles.filter((f) =>
            filters.some((flt) => f.toLowerCase().includes(flt.toLowerCase()))
        );
    }
    console.info(`[ALL] discovered ${testFiles.length} test file(s):`);
    for (const f of testFiles) console.info(`        • ${f}`);

    if (testFiles.length === 0) {
        console.warn('[ALL] ⚠️ no matching test files found — nothing to run.');
        process.exit(0);
    }

    // Resolve the local jest binary (node_modules is a symlink in this project).
    const jestBin = path.join(
        ROOT,
        'node_modules',
        '.bin',
        process.platform === 'win32' ? 'jest.cmd' : 'jest'
    );
    if (!existsSync(jestBin)) {
        console.error(
            `[ALL] ❌ jest binary not found at ${jestBin}. Run from a project with node_modules.`
        );
        process.exit(1);
    }

    // Belt-and-braces: also tell jest to ignore @-folders, so an @-test can never
    // run even if a filter/path somehow reaches it.
    const jestArgs = [
        '--rootDir',
        ROOT,
        '--testPathIgnorePatterns',
        '/node_modules/',
        '--testPathIgnorePatterns',
        '/@[^/]*/',
        ...passThrough,
        '--', // everything after is treated as a path pattern
        ...testFiles,
    ];
    console.info(`[ALL] ▶️  ${path.basename(jestBin)} ${jestArgs.join(' ')}`);

    const child = spawn(jestBin, jestArgs, {
        cwd: ROOT,
        stdio: 'inherit',
        shell: process.platform === 'win32', // .cmd needs a shell on Windows
        env: {
            ...process.env,
            // Native-ESM jest: required for the no-Babel-transform setup.
            NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ''} --experimental-vm-modules`.trim(),
        },
    });

    child.on('exit', (code) => {
        console.info(
            `[ALL] ${code === 0 ? '✅ all suites passed' : `❌ jest exited with code ${code}`}`
        );
        process.exit(code ?? 1);
    });
}

main();
