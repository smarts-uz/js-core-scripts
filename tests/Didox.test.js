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
import { createSecretsMock } from './helpers/secrets.js';

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
  incrementFileName: (p) => {
    const parsed = path.parse(p);
    return path.join(parsed.dir, `${parsed.name} 2${parsed.ext}`);
  },
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

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));

// Credentials come from keys.yml (service -> kind -> firm); the in-memory mock
// keeps the developer's real keys.yml out of every test. Didox sends firm SRental.
const secrets = createSecretsMock();
jest.unstable_mockModule(utilsModule('Secrets.js'), () => ({ Secrets: secrets.mock }));
const setDidox = (kind, value) => secrets.set('didox', kind, 'SRental', value);

const { Didox } = await import('../classes/Didox.js');

let restApiDir;
let folderDir;
let savedFetch;

beforeEach(() => {
  secrets.clear();
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
  it('creates a single shared ofetch client with the partner base URL + auth headers', async () => {
    // The client is built LAZILY on first API call (not at module import) to
    // avoid the didox.js<->Yamls.js import-cycle TDZ crash, so trigger one call
    // before asserting the captured ofetch.create(...) config.
    didoxApi.mockResolvedValue('OK');
    await Didox.saveMeasures();
    expect(capturedCreateConfig).not.toBeNull();
    expect(capturedCreateConfig.baseURL).toBe('https://api-partners.didox.uz');
    expect(capturedCreateConfig.headers).toContainKey('user-key');
    expect(capturedCreateConfig.headers).toContainKey('Partner-Authorization');
  });
});

// ---------------------------------------------------------------------------
// Postman collection — every endpoint is a promise-returning method over didoxApi.
// Nothing here touches the network: didoxApi is a jest.fn.
// ---------------------------------------------------------------------------
const DOC = 'ABC123';
const PAGED = 'page=1&size=100';

describe('Didox GET endpoints', () => {
  // [method, args, expected path+query]
  const cases = [
    ['saveMeasures', [], '/v1/measures/all'],
    ['getRegionInfo', [6], '/v1/utils/waybills/districts?regionId=6'],
    ['saveDistricts', [], '/v1/districts/all'],
    ['saveRegions', [], '/v1/regions/all'],
    ['saveBanks', [], '/v1/banks/all'],
    ['saveRegionsTTN', [], '/v1/utils/waybills/regions'],
    ['saveRailwayStations', [], '/v1/utils/stations'],
    ['stationInfo', ['7'], '/v1/utils/stations/7'],
    ['waybillTransport', ['555'], '/v1/utils/waybills/transport?tinOrPinfl=555'],
    ['utilsInfo', ['312002053'], '/v1/utils/info/312002053'],
    ['fraudsByTin', ['311506035'], `/v1/utils/non-conformity-goods-companies/ru?${PAGED}&tin=311506035`],
    ['frauds', [], `/v1/utils/non-conformity-goods-companies/ru?${PAGED}`],
    ['withoutVatProducts', [], `/v1/utils/without-vat-products/ru?${PAGED}`],
    ['zeroVatProducts', [], `/v1/utils/zero-vat-products/ru?${PAGED}`],
    ['privilegedSellerCompanies', [], `/v1/utils/privileged-seller-companies/ru?${PAGED}`],
    ['privilegedBuyerCompanies', [], `/v1/utils/privileged-buyer-companies/ru?${PAGED}`],
    ['notIncludedProducts', [], `/v1/utils/not-included-products/ru?${PAGED}`],
    ['compensationWorks', [], `/v1/utils/compensation-works/ru?${PAGED}`],
    ['incomeTypes', [], '/v1/utils/income-types/ru'],
    ['otherIncomeProductClasses', [], '/v1/utils/other-income-product-classes/ru'],
    ['profileInfo', [], '/v1/profile/'],
    ['profileIKPUCodes', [], '/v1/profile/productClassCodes/ru'],
    ['searchIKPUCode', ['noodle'], '/v1/profile/productClasses/search?text=noodle&lang=ru'],
    ['productClassCheck', ['312002053', '1070', 'ru'], '/v1/profile/312002053/productClasses/check/1070/ru'],
    ['profileBranches', ['312002053'], '/v1/profile/branches?tin=312002053'],
    ['vatRegStatus', ['312261753'], '/v1/profile/vatRegStatus/312261753'],
    ['profileWarehouses', ['312261753'], '/v1/profile/warehouses/312261753'],
    ['getTaxpayerType', ['312261753'], '/v1/profile/taxpayerType/312261753/ru'],
    ['documentList', [], `/v2/documents?${PAGED}&owner=1`],
    ['documentGet', [DOC], `/v1/documents/${DOC}?owner=1`],
    ['documentPrivileges', [DOC], `/v1/documents/${DOC}/privileges`],
    ['documentHtml', [DOC], `/v1/documents/view/${DOC}/html/ru`],
    ['documentFile', [DOC], `/v1/documents/${DOC}/file/true`],
    ['contractInfo', ['C1'], '/v1/documents/contract/C1/info/ru'],
    ['exchangeLot', ['311', 'L1'], '/v1/documents/exchange?buyerTin=311&lotId=L1'],
    ['exchangeTypes', [], '/v1/documents/exchange/types'],
    ['exchangeLotsWithTypes', ['311', 'L1'], '/v1/documents/exchange/lotswithtypes/ru?buyerTin=311&lotId=L1'],
  ];

  it.each(cases)('%s(%j) GETs %s and returns the parsed reply', async (method, args, endpoint) => {
    didoxApi.mockResolvedValue({ ok: 1 });
    const ret = await Didox[method](...args);
    expect(ret).toEqual({ ok: 1 });
    expect(didoxApi).toHaveBeenCalledTimes(1);
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(opts.method).toBe('GET');
    expect(opts.headers).toMatchObject({ 'Accept-Language': 'ru' });
    expect(opts.body).toBeUndefined();
  });

  it('drops empty filters from the query and keeps the requested ones', async () => {
    await Didox.documentList({ doctype: '002', partner: '312002053', status: '', name: undefined });
    expect(didoxApi.mock.calls[0][0]).toBe(`/v2/documents?${PAGED}&owner=1&doctype=002&partner=312002053`);
  });

  it('config.yml Didox.Locale is the default locale; an explicit locale wins', async () => {
    state.config['Didox.Locale'] = 'uz';
    await Didox.incomeTypes();
    expect(didoxApi.mock.calls[0][0]).toBe('/v1/utils/income-types/uz');
    expect(didoxApi.mock.calls[0][1].headers).toMatchObject({ 'Accept-Language': 'uz' });
    await Didox.incomeTypes('ru');
    expect(didoxApi.mock.calls[1][0]).toBe('/v1/utils/income-types/ru');
  });

  it('a rejected request rejects the call (the runner reports it)', async () => {
    didoxApi.mockRejectedValue(new Error('boom'));
    await expect(Didox.saveMeasures()).rejects.toThrow('boom');
  });
});

describe('Didox POST / DELETE endpoints', () => {
  // [method, args, method, expected path+query, expected body]
  const cases = [
    ['productPrivileges', ['1,2', '2026-01-01'], 'POST', '/v1/utils/product-privileges/ru?checkDate=2026-01-01', ['1', '2']],
    ['companyPrivileges', ['311,312', '2026-01-01'], 'POST', '/v1/utils/company-privileges/ru?checkDate=2026-01-01', ['311', '312']],
    ['companiesPrivileges', [['311'], '2026-01-01'], 'POST', '/v1/utils/companies-privileges/ru', { check_date: '2026-01-01', tax_ids_or_pinfls: ['311'] }],
    ['profileUpdate', ['{"a":1}'], 'POST', '/v1/profile/update', { a: 1 }],
    ['productClassAdd', ['107'], 'POST', '/v1/profile/productClasses', { classCode: '107' }],
    ['productClassRemove', ['107'], 'DELETE', '/v1/profile/productClasses/107', undefined],
    ['authSignup', ['+998901234567', 'a@b.uz', 'pw', 'sig'], 'POST', '/v1/auth/signup', { mobile: '+998901234567', email: 'a@b.uz', password: 'pw', signature: 'sig' }],
    ['authCompanyLogin', ['312002053'], 'POST', '/v1/auth/company/312002053/login/ru', undefined],
    ['documentCreate', ['002', { x: 1 }], 'POST', '/v1/documents/002/create/ru', { x: 1 }],
    ['documentPreview', ['002', '{"x":1}'], 'POST', '/v1/documents/preview/002/ru', { x: 1 }],
    ['documentUpdate', [DOC, '002', { x: 1 }], 'POST', `/v1/documents/${DOC}/update/002`, { x: 1 }],
    ['documentGive', [DOC, 'sig'], 'POST', `/v1/documents/${DOC}/give`, { signature: 'sig' }],
    ['documentTillReturn', [DOC, 'sig', 'late'], 'POST', `/v1/documents/${DOC}/tillreturn`, { signature: 'sig', comment: 'late' }],
    ['documentReturn', [DOC, 'sig', 'wrong'], 'POST', `/v1/documents/${DOC}/return`, { signature: 'sig', comment: 'wrong' }],
    ['documentReject', [DOC, 'sig', 'why'], 'POST', `/v1/documents/${DOC}/reject`, { comment: 'why', signature: 'sig' }],
    ['documentDeleteDraft', [DOC], 'POST', `/v1/documents/${DOC}/delete/draft`, undefined],
    ['documentDelete', [DOC, 'sig'], 'POST', `/v1/documents/${DOC}/delete`, { signature: 'sig' }],
    ['documentToSign', [DOC, 'Sign'], 'POST', `/v1/documents/${DOC}/tosign`, { action: 'Sign' }],
  ];

  it.each(cases)('%s(%j) -> %s %s', async (name, args, verb, endpoint, body) => {
    didoxApi.mockResolvedValue({ ok: 1 });
    const ret = await Didox[name](...args);
    expect(ret).toEqual({ ok: 1 });
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe(endpoint);
    expect(opts.method).toBe(verb);
    expect(opts.body).toEqual(body);
    switch (body === undefined) {
      case false:
        expect(opts.headers).toMatchObject({ 'Content-Type': 'application/json' });
    }
  });
});

describe('Didox required-argument guards', () => {
  // Each call is refused before any request is built.
  const cases = [
    ['getRegionInfo', [], /regionId is required/],
    ['stationInfo', [], /stationId is required/],
    ['waybillTransport', [], /tinOrPinfl is required/],
    ['utilsInfo', [], /tinOrPinfl is required/],
    ['fraudsByTin', [], /tin is required/],
    ['searchIKPUCode', [], /text is required/],
    ['productClassAdd', [], /classCode is required/],
    ['productClassRemove', [], /classCode is required/],
    ['vatRegStatus', [], /tin is required/],
    ['getTaxpayerType', [], /tin is required/],
    ['login', [], /tin is required/],
    ['authSignup', ['+998'], /email is required/],
    ['documentGet', [], /docId is required/],
    ['documentGive', [DOC], /signature is required/],
    ['documentReject', [DOC, 'sig'], /comment is required/],
    ['documentDelete', [DOC], /signature is required/],
    ['productPrivileges', [[], '2026-01-01'], /codes is required/],
    ['companiesPrivileges', [['311']], /checkDate is required/],
    ['documentCreate', ['002', 5], /body must be a JSON object or array/],
    ['documentCreate', ['002', '{not json'], /body is not valid JSON/],
  ];

  it.each(cases)('%s(%j) throws %s without a request', async (name, args, message) => {
    await expect(Didox[name](...args)).rejects.toThrow(message);
    expect(didoxApi).not.toHaveBeenCalled();
  });
});

describe('Didox binary endpoints', () => {
  it('documentPDF asks for bytes and returns them when no out path is given', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]).buffer;
    didoxApi.mockResolvedValue(bytes);
    const ret = await Didox.documentPDF(DOC);
    expect(ret).toBe(bytes);
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe(`/v1/documents/view/${DOC}/pdf/ru`);
    expect(opts).toMatchObject({ method: 'GET', responseType: 'arrayBuffer' });
  });

  it('documentPDF saves to out, and a second save never overwrites the first', async () => {
    didoxApi.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);
    const out = path.join(folderDir, 'sub', 'doc.pdf');

    const first = await Didox.documentPDF(DOC, 'ru', out);
    const second = await Didox.documentPDF(DOC, 'ru', out);

    expect(first).toBe(out);
    expect(second).toBe(path.join(folderDir, 'sub', 'doc 2.pdf'));
    expect([...fs.readFileSync(first)]).toEqual([1, 2, 3]);
    expect(fs.existsSync(second)).toBe(true);
  });

  it('documentArchive asks for bytes from the archive endpoint', async () => {
    didoxApi.mockResolvedValue(new Uint8Array([80, 75]).buffer);
    await Didox.documentArchive(DOC);
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe(`/v1/documents/${DOC}/archive`);
    expect(opts.responseType).toBe('arrayBuffer');
  });
});

describe('Didox auth + E-IMZO helpers', () => {
  it('login POSTs the keys.yml password and keeps the returned token in-process', async () => {
    // login reads the password via Secrets.get('didox', 'login_password', firm)
    // (keys.yml), not a hardcoded literal — set it so the body carries it.
    setDidox('login_password', 'pw-from-keys');
    didoxApi.mockResolvedValue({ token: 'tok-1' });
    const ret = await Didox.login('311958304');
    expect(ret).toEqual({ token: 'tok-1' });
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe('/v1/auth/311958304/password/ru');
    expect(opts.method).toBe('POST');
    expect(opts.body).toEqual({ password: 'pw-from-keys' });
    expect(opts.headers).toMatchObject({ 'Accept-Language': 'ru', 'Content-Type': 'application/json' });
    expect(secrets.mock._set).toHaveBeenCalledWith('didox', 'user_key', 'SRental', 'tok-1');
  });

  it('login refuses when no password is configured', async () => {
    await expect(Didox.login('311958304')).rejects.toThrow(/password is required/);
    expect(didoxApi).not.toHaveBeenCalled();
  });

  it('timestamp returns timeStampTokenB64 and throws on a reply without it', async () => {
    didoxApi.mockResolvedValueOnce({ timeStampTokenB64: 'TS' });
    expect(await Didox.timestamp('p7', 'hex')).toBe('TS');
    const [url, opts] = didoxApi.mock.calls[0];
    expect(url).toBe('/v1/dsvs/timestamp');
    expect(opts.body).toEqual({ pkcs7: 'p7', signatureHex: 'hex' });

    didoxApi.mockResolvedValueOnce({ error: 'nope' });
    await expect(Didox.timestamp('p7', 'hex')).rejects.toThrow(/timestamp failed/);
  });

  it('documentExists is true only for an exact number match on the outgoing list', async () => {
    didoxApi.mockResolvedValue({ data: [{ name: 'RC26-3-25-4' }, { name: 'RC26-3-25-40' }] });
    expect(await Didox.documentExists('RC26-3-25-4')).toBe(true);
    expect(await Didox.documentExists('RC26-3-25-5')).toBe(false);
    expect(didoxApi.mock.calls[0][0]).toBe('/v2/documents?page=1&size=50&owner=1&doctype=002&name=RC26-3-25-4');
  });

  it('productPackage matches the unit by name, case-insensitively, and refuses an unknown one', async () => {
    didoxApi.mockResolvedValue([{ code: '1425575', name: 'Месяц' }]);
    expect(await Didox.productPackage('312002053', '1070', 'месяц')).toEqual({ code: '1425575', name: 'Месяц' });
    await expect(Didox.productPackage('312002053', '1070', 'год')).rejects.toThrow(/not offered/);
  });

  it('partyInfo serves the cache first, never touches the network offline, and caches an online hit', async () => {
    const cacheFile = path.join(restApiDir, 'INN Didox 312002053.json');
    expect(await Didox.partyInfo('312002053', cacheFile, false)).toBeNull();
    expect(didoxApi).not.toHaveBeenCalled();

    didoxApi.mockResolvedValue({ tin: '312002053', name: 'CODENOVA' });
    expect(await Didox.partyInfo('312002053', cacheFile, true)).toMatchObject({ name: 'CODENOVA' });
    expect(didoxApi.mock.calls[0][0]).toBe('/v1/utils/info/312002053');

    didoxApi.mockClear();
    expect(await Didox.partyInfo('312002053', cacheFile, true)).toMatchObject({ name: 'CODENOVA' });
    expect(didoxApi).not.toHaveBeenCalled();
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
    setDidox('user_key', 'ukey-123');
    setDidox('partner_key', 'token-123');
  });

  it('returns null for a missing tin without touching the network', async () => {
    const f = stubFetch();
    expect(await Didox.infoByTinPinfl('')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('fetches, saves the JSON to folderRestAPI and classifies a company address', async () => {
    // infoByTinPinfl resolves baseURL via Yamls.getConfig('Didox.BaseURL') and sends
    // both user-key (didox.user_key) and Partner-Authorization (didox.partner_key).
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

  it('accepts a base URL written with a scheme and a trailing slash', async () => {
    state.config['Didox.BaseURL'] = 'https://api.example.uz/';
    const payload = { name: 'Fallback LLC', address: 'Tashkent', tin: '222333444' };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ ...payload }) }));

    await Didox.infoByTinPinfl('222333444');

    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://api.example.uz/v1/utils/info/222333444');
    expect(opts.headers.get('user-key')).toBe('ukey-123');
    expect(opts.headers.get('Partner-Authorization')).toBe('token-123');
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

  it('does not call fetch and returns null when didox.user_key is missing or blank', async () => {
    setDidox('user_key', undefined);
    const f = stubFetch();

    expect(await Didox.infoByTinPinfl('123456789')).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();

    setDidox('user_key', '   ');
    expect(await Didox.infoByTinPinfl('123456789')).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });

  it('does not call fetch and keeps stale cache when didox.user_key is missing', async () => {
    setDidox('user_key', undefined);
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

  it('does not call fetch and returns null when didox.partner_key is missing', async () => {
    setDidox('partner_key', undefined);
    const f = stubFetch();

    const out = await Didox.infoByTinPinfl('123456789');

    expect(out).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('reads from the cache file when it already exists (no fetch)', async () => {
    setDidox('user_key', undefined);
    setDidox('partner_key', undefined);
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
    setDidox('user_key', 'ukey');
    setDidox('partner_key', 'pauth');
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

  it('does not call fetch and returns null when didox.user_key is missing', async () => {
    setDidox('user_key', undefined);
    const f = stubFetch();
    const out = await Didox.carInfoByPinfl('556');
    expect(out).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns the cached CAR file when present (no fetch)', async () => {
    setDidox('user_key', undefined);
    setDidox('partner_key', undefined);
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
    // The bearer is keys.yml-sourced (Secrets.get('ijara', 'token', owner)); the
    // per-test secrets.clear() leaves it unset, so the "No bearer" guard is
    // exercised deterministically regardless of the developer's real keys.yml.
    await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No bearer', 'Warning');
  });

  it('BUG: throws ReferenceError because `Chromes` is never imported, caught and routed to errorBox', async () => {
    // bearer present so it reaches the try-block; `Chromes.fetch(...)` is an
    // undefined symbol -> ReferenceError -> caught -> Dialogs.errorBox.
    // The bearer is read via Secrets.get('ijara', 'token', owner) -> keys.yml ijara.token.SRental.
    secrets.set('ijara', 'token', 'SRental', 'bearer-token');
    const r = await Didox.contracts('SRental', 'IN', 'Confirmed');
    expect(DialogsMock.errorBox).toHaveBeenCalled();
    const err = DialogsMock.errorBox.mock.calls[0][0];
    expect(err).toBeInstanceOf(ReferenceError);
    expect(r).toBeUndefined();
  });
});
