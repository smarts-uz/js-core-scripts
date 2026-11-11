// Unit tests for classes/Secrets.js — every public (non-_) static method:
//   get, set, env.
//
// Strategy: Secrets reads/writes a keys.yml shaped service -> kind -> firm.
// Every test points `Secrets.file` at a throwaway keys.yml in a temp dir, so the
// real YAML parse and the line-preserving writer run for real and the project's
// own keys.yml is never touched. env() reads process.env directly.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';

import { Secrets } from '../classes/Secrets.js';

let workDir;
let keysFile;

const KEYS = [
  '# Secrets - gitignored',
  '',
  'didox:',
  '  partner_key:',
  '    SRental: pk-srental',
  '    WorkSpace:',
  '  login:',
  '    SRental: 311958304',
  '    WorkSpace:',
  '',
  'ijara:',
  '  token:',
  '    SRental: ij-token',
  '    WorkSpace:',
  '',
].join('\n');

const write = (text) => fs.writeFileSync(keysFile, text, 'utf8');
const read = () => fs.readFileSync(keysFile, 'utf8');

beforeEach(() => {
  workDir = makeTmpDir('secrets-');
  keysFile = path.join(workDir, 'keys.yml');
  write(KEYS);
  Secrets.file = keysFile;
});

afterEach(() => {
  Secrets.file = null;
  cleanupAllTmpDirs();
});

// ---------------------------------------------------------------------------
describe('Secrets.get', () => {
  it('reads service -> kind -> firm from keys.yml', () => {
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBe('pk-srental');
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('ij-token');
  });

  it('keeps a numeric-looking value a string (login 311958304)', () => {
    expect(Secrets.get('didox', 'login', 'SRental')).toBe('311958304');
  });

  it('returns a blank value as an empty/missing value, never a placeholder', () => {
    expect(Secrets.get('didox', 'partner_key', 'WorkSpace') || '').toBe('');
  });

  it('returns null (not undefined) for an absent service, kind or firm', () => {
    expect(Secrets.get('nope', 'partner_key', 'SRental')).toBeNull();
    expect(Secrets.get('didox', 'nope', 'SRental')).toBeNull();
    expect(Secrets.get('didox', 'partner_key', 'Nobody')).toBeNull();
  });

  it('returns null when keys.yml does not exist', () => {
    Secrets.file = path.join(workDir, 'missing.yml');
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBeNull();
  });

  it('returns null when keys.yml cannot be parsed', () => {
    write('didox: [unclosed\n  - : :\n');
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBeNull();
  });

  it('ignores a leading BOM', () => {
    write('﻿' + KEYS);
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBe('pk-srental');
  });

  it('re-reads the file on every call, so an edit is picked up without a restart', () => {
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('ij-token');
    write(KEYS.replace('ij-token', 'ij-new'));
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('ij-new');
  });
});

// ---------------------------------------------------------------------------
describe('Secrets.set', () => {
  it('updates an existing value in place and leaves every other line byte-identical', () => {
    expect(Secrets.set('ijara', 'token', 'SRental', 'ij-updated')).toBe(true);
    expect(read()).toBe(KEYS.replace('ij-token', 'ij-updated'));
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('ij-updated');
  });

  it('fills a blank firm value', () => {
    expect(Secrets.set('didox', 'partner_key', 'WorkSpace', 'pk-ws')).toBe(true);
    expect(Secrets.get('didox', 'partner_key', 'WorkSpace')).toBe('pk-ws');
    expect(Secrets.get('didox', 'partner_key', 'SRental')).toBe('pk-srental');
  });

  it('adds a missing firm at the end of its kind block', () => {
    expect(Secrets.set('ijara', 'token', 'Newcomer', 'nc-token')).toBe(true);
    expect(Secrets.get('ijara', 'token', 'Newcomer')).toBe('nc-token');
    expect(Secrets.get('ijara', 'token', 'WorkSpace') || '').toBe('');
    expect(Secrets.get('ijara', 'token', 'SRental')).toBe('ij-token');
  });

  it('adds a missing kind inside an existing service', () => {
    expect(Secrets.set('didox', 'user_key', 'SRental', 'uk-1')).toBe(true);
    expect(Secrets.get('didox', 'user_key', 'SRental')).toBe('uk-1');
    expect(Secrets.get('didox', 'login', 'SRental')).toBe('311958304');
  });

  it('adds a missing service at the end of the file', () => {
    expect(Secrets.set('didox_dev', 'user_key', 'SRental', 'dev-uk')).toBe(true);
    expect(Secrets.get('didox_dev', 'user_key', 'SRental')).toBe('dev-uk');
    expect(read().startsWith(KEYS.trimEnd())).toBe(true);
  });

  it('quotes a value that is not a plain token, and reads it back as the same string', () => {
    expect(Secrets.set('didox', 'login', 'WorkSpace', '123456789')).toBe(true);
    expect(read()).toContain('WorkSpace: "123456789"');
    expect(Secrets.get('didox', 'login', 'WorkSpace')).toBe('123456789');

    expect(Secrets.set('didox', 'partner_key', 'WorkSpace', 'has space: and "quote"')).toBe(true);
    expect(Secrets.get('didox', 'partner_key', 'WorkSpace')).toBe('has space: and "quote"');
  });

  it('keeps a JWT-style token unquoted', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6MX0.sig-nature_1=';
    expect(Secrets.set('ijara', 'token', 'WorkSpace', jwt)).toBe(true);
    expect(read()).toContain(`WorkSpace: ${jwt}`);
    expect(Secrets.get('ijara', 'token', 'WorkSpace')).toBe(jwt);
  });

  it('preserves CRLF line endings', () => {
    write(KEYS.replace(/\n/g, '\r\n'));
    expect(Secrets.set('ijara', 'token', 'SRental', 'ij-crlf')).toBe(true);
    const text = read();
    expect(text).toContain('SRental: ij-crlf\r\n');
    expect(text.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('returns false and writes nothing when keys.yml does not exist', () => {
    Secrets.file = path.join(workDir, 'missing.yml');
    expect(Secrets.set('didox', 'user_key', 'SRental', 'x')).toBe(false);
    expect(fs.existsSync(path.join(workDir, 'missing.yml'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Secrets.env', () => {
  let saved;
  beforeEach(() => {
    saved = { ...process.env };
  });
  afterEach(() => {
    process.env = saved;
  });

  it('reads an exact variable name verbatim', () => {
    process.env.DIDOX_PARTNER_AUTHORIZATION = 'Bearer xyz';
    expect(Secrets.env('DIDOX_PARTNER_AUTHORIZATION')).toBe('Bearer xyz');
  });

  it('does NOT normalize the name — the exact key is used', () => {
    process.env.MY3_API_SRENTAL = 'set';
    expect(Secrets.env('My3Api_SRental')).toBeNull();
    expect(Secrets.env('MY3_API_SRENTAL')).toBe('set');
  });

  it('returns null (not undefined) for a missing variable', () => {
    delete process.env.NOPE_VAR;
    expect(Secrets.env('NOPE_VAR')).toBeNull();
  });

  it('returns an empty string as-is when the var is set but empty', () => {
    process.env.EMPTY_VAR = '';
    expect(Secrets.env('EMPTY_VAR')).toBe('');
  });
});
