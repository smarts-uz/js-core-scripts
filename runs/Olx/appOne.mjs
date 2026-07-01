// AUTO-GENERATED shell-out runner — forwards to the cmd/ entrypoint.
// Feature: Olx App One (pages+pagination)
// Delegates to: cmd/js-scraper-olx.uz/App-One.js
// The cmd script orchestrates the utils/ pipeline (single --yaml/--input or batch
// --all). This runner just spawns it, forwarding the primary input + any extra args.
import { spawn } from 'node:child_process';
import path from 'node:path';

const SCRIPT = "D:\\Develop\\Projects\\DevApp\\Execute\\JS\\Sources\\cmd\\js-scraper-olx.uz\\App-One.js";
const PRIMARY_FLAG = "--app";

// Build args: a bare positional (%1 from a shell launcher) becomes "<flag> <value>";
// explicit flags (--yaml, --all, --open, --input, --output) are passed through as-is.
const raw = process.argv.slice(2);
const args = [];
if (raw.length && !raw[0].startsWith('-')) {
    args.push(PRIMARY_FLAG, raw[0], ...raw.slice(1));
} else {
    args.push(...raw);
}

console.log('1️⃣ Olx appOne Start →', path.basename(SCRIPT), args.join(' '));

const child = spawn(process.execPath, [SCRIPT, ...args], {
    stdio: 'inherit',
    cwd: path.dirname(SCRIPT), // config.yml / .env resolve from the cmd folder
});

child.on('exit', (code) => {
    console.log('3️⃣ Olx appOne Done (exit ' + code + ')');
    process.exit(code ?? 0);
});
child.on('error', (err) => {
    console.error('❌ Olx appOne failed to spawn:', err.message);
    process.exit(1);
});
