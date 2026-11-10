// Unit tests for classes/Eimzo.js — the local E-IMZO signing client.
//
// Only the pure helpers (alias parsing, expiry, holder match, certificate choice,
// base64) and the loopback guard are exercised here. The WebSocket itself is never
// opened: `#ws` is replaced by an inert stub, so no test reaches a real E-IMZO
// service or signs anything.
import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { utilsModule } from './helpers/esm.js';

const WebSocket = jest.fn();
jest.unstable_mockModule('#ws', () => ({ WebSocket, default: WebSocket }));

const state = { config: {} };
const YamlsMock = {
  getConfig: jest.fn((key) => state.config[key]),
};
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Eimzo } = await import('../classes/Eimzo.js');

const TIN_OID = '1.2.860.3.16.1.1';
const PINFL_OID = '1.2.860.3.16.1.2';
const NOW = new Date(2026, 5, 1, 12, 0, 0);

const cert = (tin, validto, extra = '') => ({
  alias: `cn=HOLDER,${TIN_OID}=${tin},validfrom=2024.01.01 00:00:00,validto=${validto}${extra}`,
});

beforeEach(() => {
  state.config = {};
});

describe('Eimzo.toBase64', () => {
  it('encodes UTF-8 text, and treats null/undefined as empty', () => {
    expect(Eimzo.toBase64('312002053')).toBe('MzEyMDAyMDUz');
    expect(Eimzo.toBase64('Аренда')).toBe(Buffer.from('Аренда', 'utf8').toString('base64'));
    expect(Eimzo.toBase64(undefined)).toBe('');
    expect(Eimzo.toBase64(null)).toBe('');
  });
});

describe('Eimzo.parseAlias', () => {
  it('splits a key=value alias into lower-cased keys', () => {
    expect(Eimzo.parseAlias('CN=Fio, UID=324543543,validto=2024.04.25 23:59:59')).toEqual({
      cn: 'Fio',
      uid: '324543543',
      validto: '2024.04.25 23:59:59',
    });
  });

  it('skips parts without "=" and survives a missing alias', () => {
    expect(Eimzo.parseAlias('junk,cn=A')).toEqual({ cn: 'A' });
    expect(Eimzo.parseAlias(undefined)).toEqual({});
  });
});

describe('Eimzo.validTo', () => {
  it('parses date + time and date-only expiries', () => {
    expect(Eimzo.validTo('validto=2026.12.31 23:59:59')).toEqual(new Date(2026, 11, 31, 23, 59, 59));
    expect(Eimzo.validTo('validto=2026.12.31')).toEqual(new Date(2026, 11, 31, 0, 0, 0));
  });

  it('returns null when validto is missing or malformed', () => {
    expect(Eimzo.validTo('cn=A')).toBeNull();
    expect(Eimzo.validTo('validto=31.12.2026')).toBeNull();
  });
});

describe('Eimzo.holds', () => {
  it('matches the TIN OID, the PINFL OID and uid', () => {
    expect(Eimzo.holds({ alias: `${TIN_OID}=312002053` }, '312002053')).toBe(true);
    expect(Eimzo.holds({ alias: `${PINFL_OID}=50101016590040` }, '50101016590040')).toBe(true);
    expect(Eimzo.holds({ alias: 'uid=311958304' }, '311958304')).toBe(true);
  });

  it('is false for another holder, a blank tin, or no alias', () => {
    expect(Eimzo.holds({ alias: `${TIN_OID}=312002053` }, '311958304')).toBe(false);
    expect(Eimzo.holds({ alias: 'cn=A' }, '')).toBe(false);
    expect(Eimzo.holds(undefined, '312002053')).toBe(false);
  });
});

describe('Eimzo.pickCertificate', () => {
  it('chooses the holder\'s certificate that is still valid', () => {
    const live = cert('311958304', '2027.01.01 00:00:00');
    const expired = cert('311958304', '2025.01.01 00:00:00');
    const other = cert('312002053', '2028.01.01 00:00:00');
    expect(Eimzo.pickCertificate([expired, other, live], '311958304', NOW)).toBe(live);
  });

  it('prefers the latest expiry among several valid certificates of the holder', () => {
    const soon = cert('311958304', '2026.09.01 00:00:00');
    const later = cert('311958304', '2028.09.01 00:00:00');
    expect(Eimzo.pickCertificate([soon, later], '311958304', NOW)).toBe(later);
  });

  it('without a tin picks the only live certificate', () => {
    const only = cert('311958304', '2027.01.01 00:00:00');
    expect(Eimzo.pickCertificate([only], '', NOW)).toBe(only);
  });

  it('without a tin refuses to guess between several live certificates', () => {
    const a = cert('311958304', '2027.01.01 00:00:00');
    const b = cert('312002053', '2027.01.01 00:00:00');
    expect(() => Eimzo.pickCertificate([a, b], '', NOW)).toThrow(/pass the TIN/);
  });

  it('throws when nothing is valid for the tin (expired, unknown holder, empty list)', () => {
    const expired = cert('311958304', '2025.01.01 00:00:00');
    expect(() => Eimzo.pickCertificate([expired], '311958304', NOW)).toThrow(/no valid certificate for 311958304/);
    expect(() => Eimzo.pickCertificate([expired], '999', NOW)).toThrow(/no valid certificate/);
    expect(() => Eimzo.pickCertificate([], '311958304', NOW)).toThrow(/no valid certificate/);
    expect(() => Eimzo.pickCertificate(undefined, '311958304', NOW)).toThrow(/among 0 found/);
  });

  it('treats a certificate without a parseable validto as still valid', () => {
    const open = { alias: `${TIN_OID}=311958304` };
    expect(Eimzo.pickCertificate([open], '311958304', NOW)).toBe(open);
  });
});

describe('Eimzo._settings', () => {
  it('falls back to the documented defaults', () => {
    expect(Eimzo._settings()).toEqual({
      url: 'wss://127.0.0.1:64443/service/cryptapi',
      origin: 'https://didox.uz',
      device: 'pfx',
      timeout: 60000,
    });
  });

  it('reads Eimzo.* overrides from config.yml', () => {
    state.config['Eimzo.Device'] = 'ckc';
    state.config['Eimzo.Timeout'] = '5000';
    expect(Eimzo._settings()).toMatchObject({ device: 'ckc', timeout: 5000 });
  });
});

describe('Eimzo._open', () => {
  it('refuses a non-loopback Eimzo.Url before opening any socket', () => {
    state.config['Eimzo.Url'] = 'wss://evil.example.com/service/cryptapi';
    expect(() => Eimzo._open()).toThrow(/refusing non-loopback/);
    expect(WebSocket).not.toHaveBeenCalled();
  });
});
