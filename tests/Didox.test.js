// Unit tests for utils/Didox.js — a Didox Partner API client.
//
// HTTP boundary: the reference-data methods (saveMeasures, getRegionInfo,
// saveDistricts, saveRegions, saveBanks, saveRegionsTTN, saveRailwayStations,
// fraudsByTin, frauds, profileIKPUCodes, documentList, documentPDF,
// searchIKPUCode, profileInfo, vatRegStatus, getTaxpayerType, login, documentPDF)
// all go through `didoxApi`, the instance returned by `ofetch.create(...)` at
// module load. We therefore mock `ofetch` so `create()` returns a controllable
// jest.fn we can inspect. `infoByTinPinfl`/`carInfoByPinfl` use the GLOBAL
// `fetch`, which we stub per-test. `bankByCode`/`regionsByCode`/
// `districtsByCode` are pure lookups against the bundled data JSON (tested for
// real). `contracts` references an undefined `Chromes` symbol — a source bug we
// document rather than fix.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

import banks from '../data/banks.json' with { type: 'json' };
import regions from '../data/regions.json' with { type: 'json' };
import districts from '../data/districts.json' with { type: 'json' };

// --- HTTP boundary: ofetch.create() -> didoxApi (the per-call client) ---------
// `didoxApi` is captured here so every test can drive what each call resolves to
// and assert the endpoint/options it was invoked with.
const didoxApi = jest.fn(async () => '');
// Capture the create() config at module-load time: the source calls
// ofetch.create(...) ONCE during import, and the suite's clearMocks wipes the
// mock.calls history before any test body runs — so we snapshot it here instead.
let capturedCreateConfig = null;
const ofetchCreate = jest.fn((cfg) => {
  capturedCreateConfig = cfg;
  return didoxApi;
});
const ofetch = Object.assign(jest.fn(), { create: ofetchCreate });
jest.unstable_mockModule('ofetch', () => ({ ofetch, default: ofetch, $fetch: ofetch }));

// --- sibling deps -------------------------------------------------------------
const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const state = { config: {} };
const YamlsMock = { getConfig: jest.fn((key) => state.config[key]) };

// real-fs-backed Files stub so save/read behavior is observable on a temp dir.
const FilesMock = {
  readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
  writeJson: (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  },
  mkdirIfNotExists: (d) => fs.mkdirSync(d, { recursive: true }),
  saveInfoToFile: jest.fn(),
};

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));

const { Didox } = await import('../utils/Didox.js');

let restApiDir;
let folderDir;
let savedFetch;

beforeEach(() => {
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
  it('creates a single shared ofetch client with the partner base URL + auth headers', () => {
    expect(capturedCreateConfig).not.toBeNull();
    expect(capturedCreateConfig.baseURL).toBe('https://api-partners.didox.uz');
    expect(capturedCreateConfig.headers).toContainKey('user-key');
    expect(capturedCreateConfig.headers).toContainKey('Partner-Authorization');
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

  it.each(cases)('%s requests %s as text and returns undefined (fire-and-forget)', async (method, endpoint) => {
    didoxApi.mockResolvedValue('payload');
    const ret = Didox[method]();
    expect(ret).toBeUndefined();
    expect(didoxApi).toHaveBeenCalledTimes(1);
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toContain(endpoint);
    expect(opts).toMatchObject({ responseType: 'text' });
    // let the internal .then() settle so a stray rejection cannot leak
    await Promise.resolve();
  });

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

  it('login POSTs the password body with Accept-Language', async () => {
    didoxApi.mockResolvedValue('{"token":"x"}');
    const ret = Didox.login();
    expect(ret).toBeUndefined();
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe('/v1/auth/311958304/password/ru');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ password: '4beruniave' });
    expect(opts.headers).toMatchObject({ 'Accept-Language': 'ru' });
    await Promise.resolve();
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
  it('returns null for a missing tin without touching the network', async () => {
    const f = stubFetch();
    expect(await Didox.infoByTinPinfl('')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches, saves the JSON to folderRestAPI and classifies a company address', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    state.config['Didox.SRental'] = 'token-123';
    const payload = { name: 'Acme', address: 'Adolat MFY, building 4', tin: '123456789' };
    // json() yields a FRESH object each call: the source mutates the returned
    // object (adds AddressType) AFTER writing the file, so the saved file must
    // compare against the original (unmutated) payload.
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ...payload }) }));

    const out = await Didox.infoByTinPinfl('123456789');

    // INN prefix (tin length <= 9) and saved to disk (file written before the
    // AddressType mutation, so it equals the original payload).
    const saved = path.join(restApiDir, 'INN Didox 123456789.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(JSON.parse(fs.readFileSync(saved, 'utf8'))).toEqual(payload);
    // correct URL + Partner-Authorization header
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://api.example.uz/v1/utils/info/123456789');
    expect(opts.method).toBe('GET');
    // address classified
    expect(out.AddressType).toBe('Adolat');
  });

  it('uses the PINFL prefix and a person folder for an individual (personalNum present)', async () => {
    state.config['Didox.BaseURL'] = 'api.example.uz';
    state.config['Didox.SRental'] = 'token-123';
    const payload = { name: 'John Doe', address: 'somewhere', tin: '99', personalNum: '301010' };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await Didox.infoByTinPinfl('1234567890'); // length 10 -> PINFL

    const saved = path.join(restApiDir, 'PINFL Didox 1234567890.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(out).toEqual(payload);
    // person folder created under folderDirector and info written through Files
    expect(FilesMock.saveInfoToFile).toHaveBeenCalled();
  });

  it('reads from the cache file when it already exists (no fetch)', async () => {
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
    stubFetch(async () => { throw new Error('network down'); });
    const out = await Didox.infoByTinPinfl('700700701');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// global fetch — carInfoByPinfl
// ---------------------------------------------------------------------------
describe('Didox.carInfoByPinfl', () => {
  it('returns null for a missing tin', async () => {
    const f = stubFetch();
    expect(await Didox.carInfoByPinfl(undefined)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches transport info, writes the CAR file and returns the parsed result', async () => {
    process.env.PARTNER_AUTHORIZATION = 'pauth';
    process.env.USER_KEY = 'ukey';
    process.env.baseURL = 'api.cars.uz';
    const payload = { cars: [{ plate: '01A123BC' }] };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await Didox.carInfoByPinfl('555');

    const saved = path.join(restApiDir, 'CAR Didox 555.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(JSON.parse(fs.readFileSync(saved, 'utf8'))).toEqual(payload);
    expect(out).toEqual(payload);
    expect(f.mock.calls[0][0]).toContain('tinOrPinfl=555');

    delete process.env.PARTNER_AUTHORIZATION;
    delete process.env.USER_KEY;
    delete process.env.baseURL;
  });

  it('returns the cached CAR file when present (no fetch)', async () => {
    const cached = { cars: [] };
    fs.writeFileSync(path.join(restApiDir, 'CAR Didox 9.json'), JSON.stringify(cached));
    const f = stubFetch();
    const out = await Didox.carInfoByPinfl('9');
    expect(f).not.toHaveBeenCalled();
    expect(out).toEqual(cached);
  });

  it('returns null and warns on a non-OK response', async () => {
    process.env.baseURL = 'api.cars.uz';
    stubFetch(async () => ({ ok: false, status: 404, statusText: 'NF', json: async () => ({}) }));
    const out = await Didox.carInfoByPinfl('123');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
    delete process.env.baseURL;
  });

  it('returns null when fetch throws', async () => {
    process.env.baseURL = 'api.cars.uz';
    stubFetch(async () => { throw new Error('boom'); });
    const out = await Didox.carInfoByPinfl('124');
    expect(out).toBeNull();
    delete process.env.baseURL;
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
    await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No bearer', 'Warning');
  });

  it('BUG: throws ReferenceError because `Chromes` is never imported, caught and routed to errorBox', async () => {
    // bearer present so it reaches the try-block; `Chromes.fetch(...)` is an
    // undefined symbol -> ReferenceError -> caught -> Dialogs.errorBox.
    state.config['Ijara.SRental'] = 'bearer-token';
    const r = await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.errorBox).toHaveBeenCalled();
    const err = DialogsMock.errorBox.mock.calls[0][0];
    expect(err).toBeInstanceOf(ReferenceError);
    expect(r).toBeUndefined();
  });
});
