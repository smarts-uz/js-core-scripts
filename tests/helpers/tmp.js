// Temp-directory toolkit for fs-based tests.
//
// fs-heavy utils methods (Files, Scanner, Category, Yamls, ES output …) are
// tested for real against a throwaway directory under the OS temp folder rather
// than by mocking `fs` — this exercises the genuine code path (path joins,
// recursion, encoding) and is far more robust than a mocked fs.

import fs from 'fs';
import os from 'os';
import path from 'path';

const active = new Set();

/**
 * Create a unique empty temporary directory and return its absolute path.
 * Registered for teardown via cleanupAllTmpDirs().
 */
export function makeTmpDir(prefix = 'utils-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  active.add(dir);
  return dir;
}

/**
 * Build a file/dir tree inside `root` from a plain object spec.
 *   { 'a.txt': 'hello', sub: { 'b.json': '{}' } }
 * A string value writes a file; an object value creates a sub-directory.
 * Returns `root` for chaining.
 */
export function writeTree(root, spec) {
  fs.mkdirSync(root, { recursive: true });
  for (const [name, value] of Object.entries(spec)) {
    const full = path.join(root, name);
    if (value && typeof value === 'object') {
      writeTree(full, value);
    } else {
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, value == null ? '' : String(value), 'utf8');
    }
  }
  return root;
}

/** Read a file under a temp dir as UTF-8 text. */
export function read(root, ...segments) {
  return fs.readFileSync(path.join(root, ...segments), 'utf8');
}

/** True if a path under a temp dir exists. */
export function exists(root, ...segments) {
  return fs.existsSync(path.join(root, ...segments));
}

/** Recursively remove a single temp dir. */
export function removeTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
  active.delete(dir);
}

/** Remove every temp dir created in the current test file. */
export function cleanupAllTmpDirs() {
  for (const dir of [...active]) removeTmpDir(dir);
}
