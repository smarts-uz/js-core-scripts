// Unit tests for utils/MySoliq.js — a My3.soliq.uz API client.
//
// HTTP boundary: every *API method uses the GLOBAL `fetch`, stubbed per-test.
// Sibling deps Files / Word / Dialogs / Yamls are mocked: Files is backed by the
// real fs against a temp dir so the read/write-cache + saveInfoToFile side
// effects are observable.
//
// NOTE ON SOURCE: the class body defines `entrepreneurInfoAPI` and
// `entrepreneurInfo` TWICE. In a JS class the LATER definition wins, so the
// effective public surface is: entrepreneurInfoAPI, entrepreneurInfo (2nd:
// returns null on missing args), vatInfoAPI, companyInfoAPI, vatInfo,
// companyInfo. These tests assert the effective behavior.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { utilsModule } from './helpers/esm.js';

// --- sibling deps -------------------------------------------------------------
const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const state = { config: {} };
const YamlsMock = { getConfig: jest.fn((key) => state.config[key]) };
const WordMock = { cleanCompanyName: jest.fn((n) => `clean:${n}`) };

const FilesMock = {
  readJson: (p) => JSON.parse(fs.readFileSync(p, 'utf8')),
  writeJson: (p, data) => {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, JSON.stringify(data, null, 2));
  },
  saveInfoToFile: jest.fn(),
};

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Word.js'), () => ({ Word: WordMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));

const { MySoliq } = await import('../utils/MySoliq.js');

let restApiDir;
let savedFetch;

beforeEach(() => {
  restApiDir = makeTmpDir('mysoliq-');
  globalThis.folderRestAPI = restApiDir;
  globalThis.folderCompan = makeTmpDir('mysoliq-compan-');
  globalThis.folderForNDS = makeTmpDir('mysoliq-nds-');
  globalThis.folderALL = makeTmpDir('mysoliq-all-');
  state.config = {};
  savedFetch = global.fetch;
});

afterEach(() => {
  global.fetch = savedFetch;
  delete globalThis.folderRestAPI;
  delete globalThis.folderCompan;
  delete globalThis.folderForNDS;
  delete globalThis.folderALL;
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

function stubFetch(impl) {
  global.fetch = jest.fn(impl);
  return global.fetch;
}

// ---------------------------------------------------------------------------
// entrepreneurInfoAPI (effective = 2nd definition; X-API-KEY auth)
// ---------------------------------------------------------------------------
describe('MySoliq.entrepreneurInfoAPI', () => {
  it('returns parsed JSON and sends X-API-KEY on a 200 response', async () => {
    state.config['My3Api.SRental'] = 'apikey-1';
    const payload = { registrationDate: '2020-01-01' };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await MySoliq.entrepreneurInfoAPI('PIN1', 'AA', '123');

    expect(out).toEqual(payload);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://My3.soliq.uz/api/remote-access-api/entrepreneur/info/PIN1?passportSeries=AA&passportNumber=123');
    expect(opts.method).toBe('GET');
    // header set via Headers().append("X-API-KEY", ...)
    expect(opts.headers.get('X-API-KEY')).toBe('apikey-1');
  });

  it('returns null and shows a dialog on a non-OK response', async () => {
    stubFetch(async () => ({ ok: false, status: 403, statusText: 'Forbidden', json: async () => ({}) }));
    const out = await MySoliq.entrepreneurInfoAPI('PIN1', 'AA', '123');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(async () => { throw new Error('offline'); });
    const out = await MySoliq.entrepreneurInfoAPI('PIN1', 'AA', '123');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// entrepreneurInfo (effective = 2nd definition: returns null on missing args)
// ---------------------------------------------------------------------------
describe('MySoliq.entrepreneurInfo', () => {
  it('warns and returns null when pinfl is missing', async () => {
    expect(await MySoliq.entrepreneurInfo(undefined, 'AA', '123')).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No pinfl', 'Warning');
  });

  it('warns and returns null when passportSeries is missing', async () => {
    expect(await MySoliq.entrepreneurInfo('PIN', undefined, '123')).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No passportSeries', 'Warning');
  });

  it('warns and returns null when passportNumber is missing', async () => {
    expect(await MySoliq.entrepreneurInfo('PIN', 'AA', undefined)).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No passportNumber', 'Warning');
  });

  it('fetches, caches to PINFL Soliq <pinfl>.json and writes RegDate side-info', async () => {
    state.config['My3Api.SRental'] = 'apikey-1';
    const payload = { registrationDate: '2021-05-05', vatNumber: 'V999' };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await MySoliq.entrepreneurInfo('PIN42', 'AA', '5555');

    const saved = path.join(restApiDir, 'PINFL Soliq PIN42.json');
    expect(fs.existsSync(saved)).toBe(true);
    expect(out).toEqual(payload);
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderCompan, 'RegDate 2021-05-05');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderCompan, 'VatNumber V999');
  });

  it('reads from cache when the PINFL file already exists (no fetch)', async () => {
    const cached = { registrationDate: '2019-09-09' };
    fs.writeFileSync(path.join(restApiDir, 'PINFL Soliq PINC.json'), JSON.stringify(cached));
    const f = stubFetch();
    const out = await MySoliq.entrepreneurInfo('PINC', 'AA', '1');
    expect(f).not.toHaveBeenCalled();
    expect(out).toEqual(cached);
  });

  it('returns null when the API yields nothing (file not written)', async () => {
    state.config['My3Api.SRental'] = 'apikey-1';
    stubFetch(async () => ({ ok: false, status: 500, statusText: 'ERR', json: async () => ({}) }));
    const out = await MySoliq.entrepreneurInfo('PINX', 'AA', '1');
    expect(out).toBeNull();
    expect(fs.existsSync(path.join(restApiDir, 'PINFL Soliq PINX.json'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// vatInfoAPI (Bearer from env, returns result.data)
// ---------------------------------------------------------------------------
describe('MySoliq.vatInfoAPI', () => {
  it('returns result.data and sends a Bearer authorization from env on 200', async () => {
    process.env.My3SRental = 'bearer-token';
    const data = [{ companyName: 'X', id: 7 }];
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ recordsTotal: 1, data }) }));

    const out = await MySoliq.vatInfoAPI('305');

    expect(out).toEqual(data);
    const [url, opts] = f.mock.calls[0];
    expect(url).toBe('https://My3.soliq.uz/api/nds-api/api/certificate/grid?search=305&page=1');
    expect(opts.headers.get('Authorization')).toBe('Bearer bearer-token');
    delete process.env.My3SRental;
  });

  it('still returns data (empty) and warns internally when recordsTotal is 0', async () => {
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ recordsTotal: 0, data: [] }) }));
    const out = await MySoliq.vatInfoAPI('999');
    expect(out).toEqual([]);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('returns null and shows a dialog on a non-OK response', async () => {
    stubFetch(async () => ({ ok: false, status: 502, statusText: 'Bad Gateway', json: async () => ({}) }));
    const out = await MySoliq.vatInfoAPI('305');
    expect(out).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(async () => { throw new Error('boom'); });
    expect(await MySoliq.vatInfoAPI('305')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// companyInfoAPI (X-API-KEY auth)
// ---------------------------------------------------------------------------
describe('MySoliq.companyInfoAPI', () => {
  it('returns parsed JSON and hits the company/info endpoint on 200', async () => {
    state.config['My3Api.SRental'] = 'apikey-2';
    const payload = { company: { name: 'Acme' } };
    const f = stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await MySoliq.companyInfoAPI('305000000');

    expect(out).toEqual(payload);
    expect(f.mock.calls[0][0]).toBe('https://My3.soliq.uz/api/remote-access-api/company/info/305000000?type=full');
    expect(f.mock.calls[0][1].headers.get('X-API-KEY')).toBe('apikey-2');
  });

  it('returns null and warns on a non-OK response', async () => {
    stubFetch(async () => ({ ok: false, status: 404, statusText: 'NF', json: async () => ({}) }));
    expect(await MySoliq.companyInfoAPI('1')).toBeNull();
    expect(DialogsMock.messageBox).toHaveBeenCalled();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(async () => { throw new Error('down'); });
    expect(await MySoliq.companyInfoAPI('1')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// vatInfo (cache + first-row extraction + side-info)
// ---------------------------------------------------------------------------
describe('MySoliq.vatInfo', () => {
  it('fetches via vatInfoAPI, caches, returns the FIRST data row and saves NDS info', async () => {
    process.env.My3SRental = 'bearer';
    const row = {
      companyName: 'Acme LLC',
      address: 'Tashkent',
      id: 11,
      stateNameLat: 'Active',
      directorFioUz: 'Ali',
      dateReg: '2020-02-02',
    };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ recordsTotal: 1, data: [row] }) }));

    const out = await MySoliq.vatInfo('700');

    // cached the raw array; returned the first element
    expect(fs.existsSync(path.join(restApiDir, 'INN VAT 700.json'))).toBe(true);
    expect(out).toEqual(row);
    expect(WordMock.cleanCompanyName).toHaveBeenCalledWith('Acme LLC');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderForNDS, 'clean:Acme LLC');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderForNDS, '11');
    delete process.env.My3SRental;
  });

  it('returns null when the data array is empty (returns[0] ?? null)', async () => {
    stubFetch(async () => ({ ok: true, status: 200, json: async () => ({ recordsTotal: 0, data: [] }) }));
    const out = await MySoliq.vatInfo('701');
    expect(out).toBeNull();
  });

  it('reads the cached array and extracts its first row (no fetch)', async () => {
    const row = { companyName: 'Cached Co', address: 'A', id: 1, stateNameLat: 'S', directorFioUz: 'D', dateReg: 'X' };
    fs.writeFileSync(path.join(restApiDir, 'INN VAT 702.json'), JSON.stringify([row]));
    const f = stubFetch();
    const out = await MySoliq.vatInfo('702');
    expect(f).not.toHaveBeenCalled();
    expect(out).toEqual(row);
  });
});

// ---------------------------------------------------------------------------
// companyInfo (cache + scammer detection + side-info)
// ---------------------------------------------------------------------------
describe('MySoliq.companyInfo', () => {
  it('fetches, caches and flags a CASHED_OUT company as a scammer', async () => {
    state.config['My3Api.SRental'] = 'apikey';
    const payload = {
      company: { name: 'Bad Co', statusType: 'CASHED_OUT', registrationDate: '2018-01-01', vatNumber: 'V1' },
    };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await MySoliq.companyInfo('303000000');

    expect(fs.existsSync(path.join(restApiDir, 'INN Soliq 303000000.json'))).toBe(true);
    expect(out.IsScammer).toBe('Да');
    expect(DialogsMock.messageBox).toHaveBeenCalled();
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderALL, '#Scam');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderCompan, 'CASHED_OUT');
  });

  it('marks a normal company as not a scammer and writes RegDate', async () => {
    state.config['My3Api.SRental'] = 'apikey';
    const payload = { company: { name: 'Good Co', statusType: 'ACTIVE', registrationDate: '2015-06-06' } };
    stubFetch(async () => ({ ok: true, status: 200, json: async () => payload }));

    const out = await MySoliq.companyInfo('304000000');
    expect(out.IsScammer).toBe('Нет');
    expect(FilesMock.saveInfoToFile).toHaveBeenCalledWith(globalThis.folderCompan, 'RegDate 2015-06-06');
  });

  it('returns null when the API yields nothing', async () => {
    state.config['My3Api.SRental'] = 'apikey';
    stubFetch(async () => ({ ok: false, status: 500, statusText: 'ERR', json: async () => ({}) }));
    const out = await MySoliq.companyInfo('305000000');
    expect(out).toBeNull();
  });

  it('reads from cache when the INN Soliq file already exists (no fetch)', async () => {
    const cached = { company: { name: 'Cached', statusType: 'ACTIVE', registrationDate: '2010-10-10' } };
    fs.writeFileSync(path.join(restApiDir, 'INN Soliq 306.json'), JSON.stringify(cached));
    const f = stubFetch();
    const out = await MySoliq.companyInfo('306');
    expect(f).not.toHaveBeenCalled();
    expect(out.company.name).toBe('Cached');
    expect(out.IsScammer).toBe('Нет');
  });
});
