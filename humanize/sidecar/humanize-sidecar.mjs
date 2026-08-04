// Thin JSON-in/JSON-out CLI wrapper over humanize/classes/Homoglyph.js — the
// Tauri sidecar invokes this compiled entry over stdio. Never reimplements
// the homoglyph logic; only resolves format-by-extension and marshals I/O.
//
// Input (stdin, one JSON line): { "filePath": "...", "chars": "ACE..." }
// Output (stdout, one JSON line): { "ok": true, "outputPath": "..." }
//                              or { "ok": false, "error": "..." }
import path from 'node:path';

// humanize/sidecar/ is two levels below the project root, so '..','..' = root
// (same depth convention as scripts/<Class>/<method>.mjs runners).
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const { Homoglyph } = await import('../classes/Homoglyph.js');

const EXT_TO_METHOD = {
  '.docx': 'word',
  '.xlsx': 'excel',
  '.pptx': 'powerpoint',
  '.md': 'markdown',
};

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

function writeResult(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

async function main() {
  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    writeResult({ ok: false, error: `Invalid JSON input: ${e.message}` });
    process.exit(1);
    return;
  }

  const { filePath, chars } = payload;
  if (!filePath) {
    writeResult({ ok: false, error: 'filePath is required' });
    process.exit(1);
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const method = EXT_TO_METHOD[ext];
  if (!method) {
    writeResult({ ok: false, error: `Unsupported file extension: ${ext}` });
    process.exit(1);
    return;
  }

  try {
    const outputPath = await Homoglyph[method](filePath, chars ?? null);
    if (outputPath === undefined) {
      writeResult({ ok: false, error: 'Homoglyph returned no output (see stderr log for the reason)' });
      process.exit(1);
      return;
    }
    writeResult({ ok: true, outputPath });
  } catch (e) {
    writeResult({ ok: false, error: e.message });
    process.exit(1);
  }
}

main();
