// Unit tests for classes/Secrets.js — every public (non-_) static method:
//   get, env.
//
// Strategy: Secrets reads a gitignored keys.yml shaped service -> kind -> firm.
// There is no native, network, or UI boundary to mock — the real methods run
// against a throwaway keys.yml in a temp dir (pinned via Secrets.file, or found
// through process.argv[1] / cwd for the auto-lookup case), so the developer's
// real keys.yml is never read. env() reads process.env, snapshotted and restored
// per test. The in-process override (_set) is exercised with unique service
// names because its map is module-wide.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';

import { Secrets } from '../classes/Secrets.js';

let workDir;
let savedEnv;
let savedArgv1;

function writeKeys(text) {
  const file = path.join(workDir, 'keys.yml');
  fs.writeFileSync(file, text, 'utf8');
  return file;
}

beforeEach(() => {
  workDir = makeTmpDir('secrets-');
  savedEnv = { ...process.env };
  savedArgv1 = process.argv[1];
  Secrets.file = null;
});

afterEach(() => {
  Secrets.file = null;
  process.argv[1] = savedArgv1;
  process.env = savedEnv;
  cleanupAllTmpDirs();
});

// ---------------------------------------------------------------------------
describe('Secrets.get', () => {
  it('reads service.kind.firm from keys.yml', () => {
    Secrets.file = writeKeys('didox:\n  partner_key:\n    SRental: tok-123\n    WorkSpace: tok-456\n');
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBe('tok-123');
    expect(Secrets.get('didox', 'partner_key', 'WorkSpace')).toBe('tok-456');
  });

  it('reads the inline-map shape used by keys.example.yml', () => {
    Secrets.file = writeKeys('kapital:\n  token: { SRental: "bearer-x", WorkSpace: "" }\n');
    expect(Secrets.get('kapital', 'token', 'SRental')).toBe('bearer-x');
  });

  it('returns an empty value as "" (distinct from missing)', () => {
    Secrets.file = writeKeys('didox:\n  user_key: { SRental: "", WorkSpace: "" }\n');
    expect(Secrets.get('didox', 'user_key', 'SRental')).toBe('');
  });

  it('keeps a numeric-looking value as a string (never a number)', () => {
    Secrets.file = writeKeys('kapital:\n  id:\n    SRental: 07209920\n');
    expect(Secrets.get('kapital', 'id', 'SRental')).toBe('07209920');
  });

  it('returns null (not undefined) for a missing service, kind or firm', () => {
    Secrets.file = writeKeys('didox:\n  user_key: { SRental: abc }\n');
    expect(Secrets.get('nope', 'user_key', 'SRental')).toBeNull();
    expect(Secrets.get('didox', 'nope', 'SRental')).toBeNull();
    expect(Secrets.get('didox', 'user_key', 'WorkSpace')).toBeNull();
  });

  it('returns null when keys.yml does not exist', () => {
    Secrets.file = path.join(workDir, 'absent.yml');
    expect(Secrets.get('didox', 'user_key', 'SRental')).toBeNull();
  });

  it('returns null when keys.yml is not valid YAML', () => {
    Secrets.file = writeKeys('didox: [unclosed\n');
    expect(Secrets.get('didox', 'user_key', 'SRental')).toBeNull();
  });

  it('returns null for an empty keys.yml', () => {
    Secrets.file = writeKeys('');
    expect(Secrets.get('didox', 'user_key', 'SRental')).toBeNull();
  });

  it('re-reads the file on every call, so an edit is picked up without a restart', () => {
    Secrets.file = writeKeys('ijara:\n  token: { SRental: old }\n');
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('old');
    writeKeys('ijara:\n  token: { SRental: new }\n');
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('new');
  });

  it('finds keys.yml next to the running entry script when no file is pinned', () => {
    writeKeys('my3:\n  api_key: { SRental: from-entry-dir }\n');
    process.argv[1] = path.join(workDir, 'runner.js');
    expect(Secrets.get('my3', 'api_key', 'SRental')).toBe('from-entry-dir');
  });

});

describe('Secrets._set (in-process override)', () => {
  it('wins over keys.yml for this run and is never written to disk', () => {
    const file = writeKeys('zzauth:\n  user_key: { SRental: from-file }\n');
    Secrets.file = file;
    Secrets._set('zzauth', 'user_key', 'SRental', 'session-token');
    expect(Secrets.get('zzauth', 'user_key', 'SRental')).toBe('session-token');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('session-token');
  });

  it('stores the value as a string', () => {
    Secrets._set('zznum', 'id', 'SRental', 12345);
    expect(Secrets.get('zznum', 'id', 'SRental')).toBe('12345');
  });
});

describe('Secrets.env', () => {
  it('reads an exact variable name verbatim', () => {
    process.env.DIDOX_PARTNER_AUTHORIZATION = 'Bearer xyz';
    expect(Secrets.env('DIDOX_PARTNER_AUTHORIZATION')).toBe('Bearer xyz');
  });

  it('does NOT normalize the name — the exact key is used', () => {
    process.env.MY3_API_SRENTAL = 'set';
    // the un-normalized lookups must miss
    expect(Secrets.env('My3Api_SRental')).toBeNull();
    expect(Secrets.env('MY3_API_SRENTAL')).toBe('set');
  });

  it('returns null (not undefined) for a missing variable', () => {
    delete process.env.NOPE_VAR;
    expect(Secrets.env('NOPE_VAR')).toBeNull();
  });

  it('returns an empty string as-is when the var is set but empty', () => {
    process.env.EMPTY_VAR = '';
    // '' ?? null === '' — an explicitly empty value is distinct from missing
    expect(Secrets.env('EMPTY_VAR')).toBe('');
  });
});
