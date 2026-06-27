// Unit tests for utils/Secrets.js — every public (non-_) static method:
//   get, env.
//
// Strategy: Secrets reads ONLY from process.env (dotenv is loaded once at import
// time from the entry script's dir / cwd). There is no native, network, or UI
// boundary to mock — we drive the real methods by setting/clearing process.env
// per test and assert the SECTION_OWNER name-mapping and the null-on-missing
// contract. The envName normalization (camelCase + digit→Cap boundaries:
// My3Api→MY3_API, KapitalId→KAPITAL_ID, DidoxBaseURL→DIDOX_BASE_URL) is private
// but is exercised through get()'s observable output.
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import { Secrets } from '../utils/Secrets.js';

// Snapshot and restore process.env so a test's writes never leak across cases.
let savedEnv;
beforeEach(() => {
  savedEnv = { ...process.env };
});
afterEach(() => {
  process.env = savedEnv;
});

// ---------------------------------------------------------------------------
describe('Secrets.get', () => {
  it('maps (section, owner) to SECTION_OWNER and returns the value', () => {
    process.env.DIDOX_SRENTAL = 'tok-123';
    expect(Secrets.get('Didox', 'SRental')).toBe('tok-123');
  });

  it('maps a dotted "Section.Owner" string the same way', () => {
    process.env.DIDOX_BASE_URL = 'https://api.example';
    expect(Secrets.get('Didox.BaseURL')).toBe('https://api.example');
  });

  it('normalizes camelCase boundaries (My3Api → MY3_API)', () => {
    process.env.MY3_API_SRENTAL = 'my3-key';
    expect(Secrets.get('My3Api', 'SRental')).toBe('my3-key');
  });

  it('normalizes a digit→Cap boundary (KapitalId → KAPITAL_ID)', () => {
    process.env.KAPITAL_ID_SRENTAL = 'kap-id';
    expect(Secrets.get('KapitalId', 'SRental')).toBe('kap-id');
  });

  it('keeps a digit that is NOT followed by a capital together (My3 → MY3)', () => {
    process.env.MY3_SRENTAL = 'my3-only';
    expect(Secrets.get('My3', 'SRental')).toBe('my3-only');
  });

  it('reads a section with no owner as just the section name', () => {
    process.env.DIDOX_USER_KEY = 'uk';
    expect(Secrets.get('Didox.UserKey')).toBe('uk');
    process.env.KAPITAL = 'k-only';
    expect(Secrets.get('Kapital')).toBe('k-only');
  });

  it('returns null (not undefined) for a missing variable', () => {
    delete process.env.DOES_NOT_EXIST_OWNER;
    expect(Secrets.get('DoesNotExist', 'Owner')).toBeNull();
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
