// Unit tests for classes/Didox.js — a Didox Partner API client.
//
// HTTP boundary: the reference-data methods (saveMeasures, getRegionInfo,
// saveDistricts, saveRegions, saveBanks, saveRegionsTTN, saveRailwayStations,
// fraudsByTin, frauds, profileIKPUCodes, documentList, documentPDF,
// searchIKPUCode, profileInfo, vatRegStatus, getTaxpayerType, login, documentPDF)
// all go through `didoxApi`, the instance returned by `ofetch.create(...)` —
// built LAZILY on the first API call (not at module load) to dodge the
// didox.js<->Yamls.js import-cycle TDZ crash. We therefore mock `ofetch` so
// `create()` returns a controllable jest.fn we can inspect. `infoByTinPinfl`/`carInfoByPinfl` use the GLOBAL
// `fetch`, which we stub per-test. `bankByCode`/`regionsByCode`/
// `districtsByCode` are pure lookups against the bundled data JSON (tested for
// real). `contracts` references an undefined `Chromes` symbol — a source bug we
// document rather than fix.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';
import { makeSecretsMock } from './helpers/secrets.js';

import banks from '../conf/data/banks.json' with { type: 'json' };
import regions from '../conf/data/regions.json' with { type: 'json' };
import districts from '../conf/data/districts.json' with { type: 'json' };

// --- HTTP boundary: ofetch.create() -> didoxApi (the per-call client) ---------
// `didoxApi` is captured here so every test can drive what each call resolves to
// and assert the endpoint/options it was invoked with.
const didoxApi = jest.fn(async () => '');
// Capture the create() config: the source calls ofetch.create(...) ONCE, lazily,
// on the first didoxApi() call (memoized thereafter). We snapshot the config here
// so it survives the suite's clearMocks between tests.
let capturedCreateConfig = null;
const ofetchCreate = jest.fn((cfg) => {
  capturedCreateConfig = cfg;
  return didoxApi;
});
const ofetch = Object.assign(jest.fn(), { create: ofetchCreate });
jest.unstable_mockModule('#ofetch', () => ({ ofetch, default: ofetch, $fetch: ofetch }));

// --- sibling deps -------------------------------------------------------------
const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const state = { config: {} };
const YamlsMock = {
  getConfig: jest.fn((key) => state.config[key]),
  getCacheMaxAgeDays: jest.fn(() => 30),
};

// real-fs-backed Files stub so save/read behavior is observable on a temp dir.
const FilesMock = {
  readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
  writeJson: (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  },
  mkdirIfNotExists: (d) => fs.mkdirSync(d, { recursive: true }),
  saveInfoToFile: jest.fn(),
  normalizeApostrophe: (name) => (typeof name === 'string' ? name.replace(/[‘’ʻʼ]/g, "'") : name),
  isCacheFresh: (p, maxAgeDays) => {
    if (!fs.existsSync(p)) return false;
    const days = Number(maxAgeDays);
    switch (true) {
      case !Number.isFinite(days):
      case days <= 0:
        return true;
    }
    return Date.now() - fs.statSync(p).mtimeMs <= days * 24 * 60 * 60 * 1000;
  },
  isMeaningfulJson: (value) => {
    switch (value) {
      case null:
      case undefined:
        return false;
    }
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value !== 'object') return false;
    return Object.keys(value).some((k) => value[k] !== null && value[k] !== undefined && value[k] !== '');
  },
  readJsonCache: (p) => {
    if (!fs.existsSync(p)) return null;
    try {
      const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
      return FilesMock.isMeaningfulJson(parsed) ? parsed : null;
    } catch {
      return null;
    }
  },
  backupFile: jest.fn((p) => {
    const dir = path.join(path.dirname(p), '- Theory');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `${path.basename(p, '.json')} backup.json`);
    fs.copyFileSync(p, target);
    return target;
  }),
  saveJsonCache: (p, data) => {
    if (!FilesMock.isMeaningfulJson(data)) return false;
    if (fs.existsSync(p)) FilesMock.backupFile(p, false);
    FilesMock.writeJson(p, data);
    return true;
  },
};

// keys.yml stand-in (service -> kind -> firm); the real file is never read or written.
const SecretsMock = makeSecretsMock();

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Secrets.js'), () => ({ Secrets: SecretsMock }));

const { Didox, resetDidoxAuth } = await import('../classes/Didox.js');

let restApiDir;
let folderDir;
let savedFetch;

/** keys.yml content for the shared SRental firm: partner_key + user_key under `didox`. */
const KEYS_READY = {
  didox: { partner_key: { SRental: 'token-123' }, user_key: { SRental: 'ukey-123' } },
};

/** keys.yml content that lets the login API mint a user-key (nothing stored yet). */
const KEYS_LOGIN = {
  didox: { partner_key: { SRental: 'token-123' }, login: { SRental: '311958304' }, password: { SRental: 'pw-1' } },
};

/** An ofetch-style failure carrying an HTTP status. */
const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { response: { status } });

beforeEach(() => {
  SecretsMock.reset();
  resetDidoxAuth();
  ofetch.mockReset();
  restApiDir = makeTmpDir('didox-rest-');
  folderDir = makeTmpDir('didox-folder-');
  globalThis.folderRestAPI = restApiDir;
  globalThis.folderDirector = folderDir;
  state.config = {};
  savedFetch = global.fetch;
  didoxApi.mockReset();
  didoxApi.mockResolvedValue('OK');
});

afterEach(() => {
  global.fetch = savedFetch;
  delete globalThis.folderRestAPI;
  delete globalThis.folderDirector;
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

/** Make the global fetch resolve to a controllable response object. */
function stubFetch(impl) {
  global.fetch = jest.fn(impl);
  return global.fetch;
}

// ---------------------------------------------------------------------------
// Module wiring
// ---------------------------------------------------------------------------
describe('Didox module wiring', () => {
  it('creates a shared ofetch client with the partner base URL and an onRequest hook that injects both auth headers', async () => {
    // The client is built LAZILY on first API call (not at module import) to
    // avoid the didox.js<->Yamls.js import-cycle TDZ crash, so trigger one call
    // before asserting the captured ofetch.create(...) config.
    SecretsMock.reset(KEYS_READY);
    didoxApi.mockResolvedValue('OK');
    Didox.saveMeasures();
    expect(capturedCreateConfig).not.toBeNull();
    expect(capturedCreateConfig.baseURL).toBe('https://api-partners.didox.uz');

    const options = { headers: { 'Accept-Language': 'ru' } };
    await capturedCreateConfig.onRequest({ options });
    expect(options.headers.get('user-key')).toBe('ukey-123');
    expect(options.headers.get('Partner-Authorization')).toBe('token-123');
    expect(options.headers.get('Accept-Language')).toBe('ru');
  });
});

// ---------------------------------------------------------------------------
// user-key lifecycle: keys.yml -> login API -> saved back to keys.yml
// ---------------------------------------------------------------------------
describe('Didox user-key via the login API', () => {
  it('login mints a user-key from the profile holding login + password and saves it under that profile', async () => {
    SecretsMock.reset({
      didox_dev: {
        partner_key: { SRental: 'dev-partner' },
        login: { SRental: '311958304' },
        password: { SRental: 'dev-pw' },
      },
    });
    ofetch.mockResolvedValueOnce({ token: 'minted-key' });

    const token = await Didox.login();

    expect(token).toBe('minted-key');
    const [url, opts] = ofetch.mock.calls[0];
    expect(url).toBe('/v1/auth/311958304/password/ru');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ password: 'dev-pw' });
    expect(opts.headers).toMatchObject({ 'Partner-Authorization': 'dev-partner', 'Accept-Language': 'ru' });
    expect(SecretsMock.saved).toEqual([
      { service: 'didox_dev', kind: 'user_key', firm: 'SRental', value: 'minted-key' },
    ]);
    expect(SecretsMock.get('didox_dev', 'user_key', 'SRental')).toBe('minted-key');
  });

  it('login returns "" and saves nothing when no profile holds login + password', async () => {
    SecretsMock.reset({ didox: { partner_key: { SRental: 'token-123' } } });

    expect(await Didox.login()).toBe('');
    expect(ofetch).not.toHaveBeenCalled();
    expect(SecretsMock.saved).toEqual([]);
  });

  it('login returns "" and saves nothing when the login API fails', async () => {
    SecretsMock.reset(KEYS_LOGIN);
    ofetch.mockRejectedValueOnce(new Error('network down'));

    expect(await Didox.login()).toBe('');
    expect(SecretsMock.saved).toEqual([]);
  });

  it('a 401 from the API mints a fresh user-key, saves it and retries the call once', async () => {
    SecretsMock.reset({ ...KEYS_LOGIN, didox: { ...KEYS_LOGIN.didox, user_key: { SRental: 'stale' } } });
    ofetch.mockResolvedValueOnce({ token: 'fresh-key' });
    didoxApi.mockRejectedValueOnce(httpError(401)).mockResolvedValueOnce({ _id: 'doc-1' });

    const reply = await Didox.documentCreate('002', { a: 1 });

    expect(reply).toEqual({ _id: 'doc-1' });
    expect(didoxApi).toHaveBeenCalledTimes(2);
    expect(ofetch).toHaveBeenCalledTimes(1);
    expect(SecretsMock.get('didox', 'user_key', 'SRental')).toBe('fresh-key');
  });

  it('a 403 from the API takes the same login + retry path', async () => {
    SecretsMock.reset(KEYS_LOGIN);
    ofetch.mockResolvedValueOnce({ token: 'fresh-key' });
    didoxApi.mockRejectedValueOnce(httpError(403)).mockResolvedValueOnce({ _id: 'doc-2' });

    expect(await Didox.documentCreate('002', {})).toEqual({ _id: 'doc-2' });
    expect(didoxApi).toHaveBeenCalledTimes(2);
    expect(SecretsMock.get('didox', 'user_key', 'SRental')).toBe('fresh-key');
  });

  it('a 401 is rethrown when the login cannot mint a key (no retry)', async () => {
    SecretsMock.reset({ didox: { partner_key: { SRental: 'token-123' } } });
    didoxApi.mockRejectedValue(httpError(401));

    await expect(Didox.documentCreate('002', {})).rejects.toThrow('HTTP 401');
    expect(didoxApi).toHaveBeenCalledTimes(1);
    expect(SecretsMock.saved).toEqual([]);
  });

  it('a non-auth error (500) is rethrown untouched, no login', async () => {
    SecretsMock.reset(KEYS_LOGIN);
    didoxApi.mockRejectedValue(httpError(500));

    await expect(Didox.documentCreate('002', {})).rejects.toThrow('HTTP 500');
    expect(ofetch).not.toHaveBeenCalled();
    expect(didoxApi).toHaveBeenCalledTimes(1);
  });

  it('concurrent callers share ONE login', async () => {
    SecretsMock.reset(KEYS_LOGIN);
    ofetch.mockResolvedValue({ token: 'shared-key' });

    const [a, b] = await Promise.all([Didox.login(), Didox.login()]);

    expect(a).toBe('shared-key');
    expect(b).toBe('shared-key');
    expect(ofetch).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Fire-and-forget reference-data calls (return undefined, log result/error)
// ---------------------------------------------------------------------------
describe('Didox reference-data GET calls', () => {
  // [method, expected endpoint substring]
  const cases = [
    ['saveMeasures', '/v1/measures/all'],
    ['getRegionInfo', '/v1/utils/waybills/districts?regionId=6'],
    ['saveDistricts', '/v1/districts/all'],
    ['saveRegions', '/v1/regions/all'],
    ['saveBanks', '/v1/banks/all'],
    ['saveRegionsTTN', '/v1/utils/waybills/regions'],
    ['saveRailwayStations', '/v1/utils/stations'],
    ['fraudsByTin', '/v1/utils/non-conformity-goods-companies/ru?tin='],
    ['frauds', '/v1/utils/non-conformity-goods-companies/ru?page=1&size=100&tin'],
    ['profileIKPUCodes', '/v1/profile/productClassCodes/ru'],
    ['documentList', '/v2/documents?page=1&size=100'],
    ['searchIKPUCode', '/v1/profile/productClasses/search'],
    ['profileInfo', '/v1/profile/'],
    ['vatRegStatus', '/v1/profile/vatRegStatus/312261753'],
    ['getTaxpayerType', '/v1/profile/taxpayerType/312261753/uz?date='],
  ];

  it.each(cases)(
    '%s requests %s as text and returns undefined (fire-and-forget)',
    async (method, endpoint) => {
      didoxApi.mockResolvedValue('payload');
      const ret = Didox[method]();
      expect(ret).toBeUndefined();
      expect(didoxApi).toHaveBeenCalledTimes(1);
      const [url, opts] = didoxApi.mock.calls[0];
      expect(url).toContain(endpoint);
      expect(opts).toMatchObject({ responseType: 'text' });
      // let the internal .then() settle so a stray rejection cannot leak
      await Promise.resolve();
    }
  );

  it('documentPDF embeds the doc id in the view path', async () => {
    didoxApi.mockResolvedValue('%PDF');
    const ret = Didox.documentPDF('ABC123');
    expect(ret).toBeUndefined();
    expect(didoxApi.mock.calls[0][0]).toBe('/v1/documents/view/ABC123/pdf/ru');
    await Promise.resolve();
  });

  it('swallows a rejected request without throwing (logs via .catch)', async () => {
    didoxApi.mockRejectedValue(new Error('boom'));
    expect(() => Didox.saveMeasures()).not.toThrow();
    // allow the internal promise chain to reject and be caught
    await new Promise((r) => setTimeout(r, 0));
  });

  it('profileIKPUCodes / documentList / searchIKPUCode send JSON content-type headers', async () => {
    Didox.profileIKPUCodes();
    expect(didoxApi.mock.calls[0][1].headers).toMatchObject({ 'Content-Type': 'application/json' });
    await Promise.resolve();
  });
});

// ---------------------------------------------------------------------------
// Pure data lookups
// ---------------------------------------------------------------------------
describe('Didox.bankByCode', () => {
  it('returns the bank whose bankId matches the given code', () => {
    const sample = banks[0];
    expect(Didox.bankByCode(sample.bankId)).toEqual(sample);
  });

  it('matches loosely (numeric code vs string-stored id) when there is no leading zero', () => {
    // bankByCode compares String(b.bankId) === String(code); a numeric code only
    // round-trips for ids without a leading zero (Number("00001") -> "1").
    const sample = banks.find((b) => /^[1-9]\d*$/.test(b.bankId));
    expect(sample).toBeDefined();
    expect(Didox.bankByCode(Number(sample.bankId))).toEqual(sample);
  });

  it('does NOT match a numeric code against a leading-zero id (string-compare semantics)', () => {
    const padded = banks.find((b) => /^0\d+$/.test(b.bankId));
    expect(padded).toBeDefined();
    expect(Didox.bankByCode(Number(padded.bankId))).toBeNull();
  });

  it('returns null for an unknown code', () => {
    expect(Didox.bankByCode('no-such-bank-zzz')).toBeNull();
  });

  it('returns null for a falsy code (empty/undefined)', () => {
    expect(Didox.bankByCode('')).toBeNull();
    expect(Didox.bankByCode(undefined)).toBeNull();
    expect(Didox.bankByCode(0)).toBeNull();
  });
});

describe('Didox.regionsByCode', () => {
  it('returns the region whose regionId matches the code', () => {
    const sample = regions[0];
    expect(Didox.regionsByCode(sample.regionId)).toEqual(sample);
    expect(Didox.regionsByCode(String(sample.regionId))).toEqual(sample);
  });

  it('returns null for an unknown code', () => {
    expect(Didox.regionsByCode(999999)).toBeNull();
  });

  it('returns null for a falsy code', () => {
    expect(Didox.regionsByCode(undefined)).toBeNull();
    expect(Didox.regionsByCode(null)).toBeNull();
  });
});

describe('Didox.districtsByCode', () => {
  it('returns the district matching both regionId and districtCode', () => {
    const sample = districts[0];
    const got = Didox.districtsByCode(sample.regionId, sample.districtCode);
    expect(got).toEqual(sample);
  });

  it('returns null when only one of the two keys is supplied', () => {
    const sample = districts[0];
    expect(Didox.districtsByCode(sample.regionId, undefined)).toBeNull();
    expect(Didox.districtsByCode(undefined, sample.districtCode)).toBeNull();
  });

  it('returns null when no district matches the pair', () => {
    expect(Didox.districtsByCode(999999, 999999)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// global fetch — infoByTinPinfl
// ---------------------------------------------------------------------------
describe('Didox.infoByTinPinfl', () => {
  beforeEach(() => {
    SecretsMock.reset(KEYS_READY);
  });

  it('returns null for a missing tin without touching the network', async () => {
    const f = stubFetch();
    expect(await Didox.infoByTinPinfl('')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches, saves the JSON to folderRestAPI and classifies a company address', async () => {
    // infoByTinPinfl resolves baseURL via Yamls.getConfig('Didox.BaseURL') and sends
    // both user-key (didox.user_key.SRental) and Partner-Authorization (didox.partner_key.SRental).
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const payload = { name: 'Acme', address: 'Adolat MFY, building 4', tin: '123456789' };
    // json() yields a FRESH object each call: the source mutates the returned
    // object (adds AddressType) AFTER writing the file, so the saved file must
    // compare against the original (unmutated) payload.
    const f = stubFetch(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ...payload }),
    }));

    const out = await Didox.infoByTinPinfl('123456789');

    // INN prefix (tin length <= 9) and saved to disk (file written before the
    // AddressType mutation, so it equals the original payload).
    const saved = path.join(restApiDir, 'INN Didox 123456789.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(JSON.parse(fs.readFileSync(saved, 'utf8'))).toEqual(payload);
    // correct URL + user-key + Partner-Authorization headers
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://api.example.uz/v1/utils/info/123456789');
    expect(opts.method).toBe('GET');
    expect(opts.headers.get('user-key')).toBe('ukey-123');
    expect(opts.headers.get('Partner-Authorization')).toBe('token-123');
    // address classified
    expect(out.AddressType).toBe('Adolat');
  });

  it('falls back to the didox_dev profile when didox has no partner_key', async () => {
    state.config['Didox.BaseURL'] = 'https://api.example.uz/';
    SecretsMock.reset({
      didox_dev: { partner_key: { SRental: 'pauth-fallback' }, user_key: { SRental: 'ukey-123' } },
    });
    const payload = { name: 'Fallback LLC', address: 'Tashkent', tin: '222333444' };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ...payload }) }));

    await Didox.infoByTinPinfl('222333444');

    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://api.example.uz/v1/utils/info/222333444');
    expect(opts.headers.get('user-key')).toBe('ukey-123');
    expect(opts.headers.get('Partner-Authorization')).toBe('pauth-fallback');
  });

  it('uses the PINFL prefix and a person folder for an individual (personalNum present)', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const payload = { name: 'John Doe', address: 'somewhere', tin: '99', personalNum: '301010' };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await Didox.infoByTinPinfl('1234567890'); // length 10 -> PINFL

    const [, opts] = f.mock.calls[0];
    expect(opts.headers.get('user-key')).toBe('ukey-123');
    expect(opts.headers.get('Partner-Authorization')).toBe('token-123');
    const saved = path.join(restApiDir, 'PINFL Didox 1234567890.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(out).toEqual(payload);
    // person folder created under folderDirector and info written through Files
    expect(FilesMock.saveInfoToFile).toHaveBeenCalled();
  });

  it('normalizes a curly apostrophe in the API-returned name before building the person folder path', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const payload = {
      name: 'JO‘RABOYEVA SHAXNOZAXON BAXODIR QIZI',
      address: 'somewhere',
      tin: '99',
      personalNum: '301010',
    };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await Didox.infoByTinPinfl('1234567891');

    // the returned name must have the curly apostrophe replaced with a plain one
    expect(out.name).toBe("JO'RABOYEVA SHAXNOZAXON BAXODIR QIZI");
    expect(out.name).not.toMatch(/[‘’ʻʼ]/);
  });

  it('does not call fetch and returns null when no user_key is stored and no login can mint one', async () => {
    SecretsMock.reset({ didox: { partner_key: { SRental: 'token-123' } } });
    const f = stubFetch();

    expect(await Didox.infoByTinPinfl('123456789')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();

    SecretsMock.reset({ didox: { partner_key: { SRental: 'token-123' }, user_key: { SRental: '   ' } } });
    resetDidoxAuth();
    expect(await Didox.infoByTinPinfl('123456789')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('mints the user_key through the login API when none is stored, saves it and sends it', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    SecretsMock.reset(KEYS_LOGIN);
    ofetch.mockResolvedValueOnce({ token: 'minted-key' });
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ name: 'Acme', address: 'x', tin: '1' }) }));

    await Didox.infoByTinPinfl('123456789');

    expect(f.mock.calls[0][1].headers.get('user-key')).toBe('minted-key');
    expect(SecretsMock.get('didox', 'user_key', 'SRental')).toBe('minted-key');
  });

  it('retries once with a freshly minted user_key when the API answers 401 (cache empty)', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    SecretsMock.reset({ ...KEYS_LOGIN, didox: { ...KEYS_LOGIN.didox, user_key: { SRental: 'stale-key' } } });
    ofetch.mockResolvedValueOnce({ token: 'fresh-key' });
    const payload = { name: 'Acme', address: 'x', tin: '123456789' };
    const f = stubFetch();
    f.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) });
    f.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ...payload }) });

    const out = await Didox.infoByTinPinfl('123456789');

    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0][1].headers.get('user-key')).toBe('stale-key');
    expect(f.mock.calls[1][1].headers.get('user-key')).toBe('fresh-key');
    expect(out).toMatchObject({ name: 'Acme' });
    expect(SecretsMock.get('didox', 'user_key', 'SRental')).toBe('fresh-key');
  });

  it('does not call fetch and keeps stale cache when no user_key can be resolved', async () => {
    SecretsMock.reset({ didox: { partner_key: { SRental: 'token-123' } } });
    const cachedFile = path.join(restApiDir, 'INN Didox 803803803.json');
    const cached = { name: 'Cached', address: 'Others place', tin: '803803803' };
    fs.writeFileSync(cachedFile, JSON.stringify(cached));
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cachedFile, old, old);
    const f = stubFetch();

    const out = await Didox.infoByTinPinfl('803803803');

    expect(f).not.toHaveBeenCalled();
    expect(out).toMatchObject({ name: 'Cached' });
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('does not call fetch and returns null when no partner_key exists in didox or didox_dev', async () => {
    SecretsMock.reset({ didox: { user_key: { SRental: 'ukey-123' } } });
    const f = stubFetch();

    const out = await Didox.infoByTinPinfl('123456789');

    expect(out).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('reads from the cache file when it already exists (no fetch)', async () => {
    SecretsMock.reset();
    const cached = { name: 'Cached', address: 'Others place', tin: '5' };
    fs.writeFileSync(path.join(restApiDir, 'INN Didox 5.json'), JSON.stringify(cached));
    const f = stubFetch();

    const out = await Didox.infoByTinPinfl('5');
    expect(f).not.toHaveBeenCalled();
    expect(out).toMatchObject({ name: 'Cached' });
    expect(out.AddressType).toBe('Others');
  });

  it('returns null and shows a dialog on a non-OK response', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    stubFetch(async () => ({ ok: false, status: 500, statusText: 'ERR', json: async () => ({}) }));
    const out = await Didox.infoByTinPinfl('700700700');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns null and shows a dialog when fetch throws', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    stubFetch(async () => {
      throw new Error('network down');
    });
    const out = await Didox.infoByTinPinfl('700700701');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('re-fetches an expired cache, archives the old file to "- Theory" and replaces it', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const cachedFile = path.join(restApiDir, 'INN Didox 800800800.json');
    fs.writeFileSync(cachedFile, JSON.stringify({ name: 'Old', address: 'Old place', tin: '800800800' }));
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cachedFile, old, old);

    const fresh = { name: 'New', address: 'Adolat MFY', tin: '800800800' };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ...fresh }) }));

    const out = await Didox.infoByTinPinfl('800800800');

    expect(f).toHaveBeenCalledTimes(1);
    expect(out.name).toBe('New');
    expect(JSON.parse(fs.readFileSync(cachedFile, 'utf8')).name).toBe('New');
    // the previous file is archived into the sibling "- Theory" folder, never deleted with the folder
    const theoryDir = path.join(restApiDir, '- Theory');
    expect(fs.existsSync(theoryDir)).toBe(true);
    expect(fs.readdirSync(theoryDir).length).toBe(1);
  });

  it('keeps a stale cache untouched and continues with it when the API answers 401', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const cachedFile = path.join(restApiDir, 'INN Didox 801801801.json');
    const cached = { name: 'Cached', address: 'Others place', tin: '801801801' };
    fs.writeFileSync(cachedFile, JSON.stringify(cached));
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cachedFile, old, old);
    const before = fs.readFileSync(cachedFile, 'utf8');

    stubFetch(async () => ({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) }));

    const out = await Didox.infoByTinPinfl('801801801');

    expect(out).toMatchObject({ name: 'Cached' });
    expect(fs.readFileSync(cachedFile, 'utf8')).toBe(before);
    expect(fs.existsSync(path.join(restApiDir, '- Theory'))).toBe(false);
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('keeps a stale cache when the API returns an empty JSON object', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    const cachedFile = path.join(restApiDir, 'INN Didox 802802802.json');
    const cached = { name: 'Cached', address: 'Others place', tin: '802802802' };
    fs.writeFileSync(cachedFile, JSON.stringify(cached));
    const old = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cachedFile, old, old);
    const before = fs.readFileSync(cachedFile, 'utf8');

    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({}) }));

    const out = await Didox.infoByTinPinfl('802802802');

    expect(out).toMatchObject({ name: 'Cached' });
    expect(fs.readFileSync(cachedFile, 'utf8')).toBe(before);
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// global fetch — carInfoByPinfl
// ---------------------------------------------------------------------------
describe('Didox.carInfoByPinfl', () => {
  beforeEach(() => {
    state.config['Didox.BaseURL'] = 'api.cars.uz';
    SecretsMock.reset({
      didox_dev: { partner_key: { SRental: 'pauth' }, user_key: { SRental: 'ukey' } },
    });
  });

  it('returns null for a missing tin', async () => {
    const f = stubFetch();
    expect(await Didox.carInfoByPinfl(undefined)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches transport info with user-key + Partner-Authorization headers, writes the CAR file and returns the parsed result', async () => {
    const payload = { cars: [{ plate: '01A123BC' }] };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await Didox.carInfoByPinfl('555');

    const saved = path.join(restApiDir, 'CAR Didox 555.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(JSON.parse(fs.readFileSync(saved, 'utf8'))).toEqual(payload);
    expect(out).toEqual(payload);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://api.cars.uz/v1/utils/waybills/transport?tinOrPinfl=555');
    expect(opts.headers.get('user-key')).toBe('ukey');
    expect(opts.headers.get('Partner-Authorization')).toBe('pauth');
  });

  it('does not call fetch and returns null when no user_key can be resolved', async () => {
    SecretsMock.reset({ didox_dev: { partner_key: { SRental: 'pauth' } } });
    const f = stubFetch();
    const out = await Didox.carInfoByPinfl('556');
    expect(out).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns the cached CAR file when present (no fetch)', async () => {
    SecretsMock.reset();
    const cached = { cars: [] };
    fs.writeFileSync(path.join(restApiDir, 'CAR Didox 9.json'), JSON.stringify(cached));
    const f = stubFetch();
    const out = await Didox.carInfoByPinfl('9');
    expect(f).not.toHaveBeenCalled();
    expect(out).toEqual(cached);
  });

  it('returns null and warns on a non-OK response', async () => {
    stubFetch(async () => ({ ok: false, status: 404, statusText: 'NF', json: async () => ({}) }));
    const out = await Didox.carInfoByPinfl('123');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(async () => {
      throw new Error('boom');
    });
    const out = await Didox.carInfoByPinfl('124');
    expect(out).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// contracts — documents a source bug: `Chromes` is referenced but never imported
// ---------------------------------------------------------------------------
describe('Didox.contracts', () => {
  it('warns and returns early when owner is missing (no bearer lookup)', async () => {
    const r = await Didox.contracts(undefined, 'IN', 'Confirmed');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No owner', 'Warning');
    expect(r).toBeUndefined();
  });

  it('warns when rentType is missing', async () => {
    await Didox.contracts('SRental', undefined, 'Confirmed');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No rentType', 'Warning');
  });

  it('warns when state is missing', async () => {
    await Didox.contracts('SRental', 'IN', undefined);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No state', 'Warning');
  });

  it('warns when no bearer is configured for the owner', async () => {
    state.config = {};
    // The bearer is keys.yml's ijara.token.SRental; an empty store exercises the "No bearer" guard.
    SecretsMock.reset();
    await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No bearer', 'Warning');
  });

  it('BUG: throws ReferenceError because `Chromes` is never imported, caught and routed to errorBox', async () => {
    // bearer present so it reaches the try-block; `Chromes.fetch(...)` is an
    // undefined symbol -> ReferenceError -> caught -> Dialogs.errorBox.
    // The bearer is read via Secrets.get('ijara', 'token', owner) -> keys.yml ijara.token.SRental.
    SecretsMock.reset({ ijara: { token: { SRental: 'bearer-token' } } });
    const r = await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.errorBox).toHaveBeenCalled();
    const err = DialogsMock.errorBox.mock.calls[0][0];
    expect(err).toBeInstanceOf(ReferenceError);
    expect(r).toBeUndefined();
  });
});
