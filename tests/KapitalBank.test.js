// Unit tests for utils/KapitalBank.js — a b2b-api.kapitalbank.uz payments client.
//
// HTTP boundary: KapitalBank does not call fetch directly — it delegates to
// `Chromes.fetcher(url, options, owner, duration, replace)`. We mock Chromes
// (and Dialogs / Secrets / IjaraSoliq) so we can drive the response body and
// assert the URL/auth/state that gets built. No real network ever runs.
//
// Credentials: the source reads `Secrets.get('Kapital', owner)` (bearer) and
// `Secrets.get('KapitalId', owner)` (b2b id) — both env-backed. We mock Secrets
// to delegate to process.env via the same SECTION_OWNER mapping the real helper
// uses (KapitalId -> KAPITAL_ID), and drive it by setting/restoring those env
// vars per test, so an owner only reaches the fetcher once both are present.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { utilsModule } from './helpers/esm.js';

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const ChromesMock = {
  Duration: { Sec1: 1, Sec10: 10, Hour10: 36000, noCache: -1, Unlimited: 0 },
  fetcher: jest.fn(),
  download: jest.fn(),
};
const IjaraSoliqMock = { Owner: { SRental: 'SRental', WorkSpace: 'WorkSpace' } };

// Mirror utils/Secrets.js: ('Kapital','SRental') -> KAPITAL_SRENTAL,
// ('KapitalId','SRental') -> KAPITAL_ID_SRENTAL. Reads process.env, never config.
const envName = (section, owner = '') => {
  const norm = (s) => String(s)
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/(\d)([A-Z])/g, '$1_$2')
    .toUpperCase();
  return owner ? `${norm(section)}_${norm(owner)}` : norm(section);
};
const SecretsMock = {
  get: jest.fn((section, owner = '') => process.env[envName(section, owner)] ?? null),
  env: jest.fn((name) => process.env[name] ?? null),
};

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Secrets.js'), () => ({ Secrets: SecretsMock }));
jest.unstable_mockModule(utilsModule('Chromes.js'), () => ({ Chromes: ChromesMock }));
jest.unstable_mockModule(utilsModule('IjaraSoliq.js'), () => ({ IjaraSoliq: IjaraSoliqMock }));

const { KapitalBank } = await import('../utils/KapitalBank.js');

// Track every credential env var we set so afterEach can restore the prior value.
const touchedEnv = new Map();
function setEnv(name, value) {
  if (!touchedEnv.has(name)) touchedEnv.set(name, process.env[name]);
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  // Start each test with no Kapital credentials present.
  for (const owner of ['SRental', 'WorkSpace']) {
    setEnv(envName('Kapital', owner), undefined);
    setEnv(envName('KapitalId', owner), undefined);
  }
});

afterEach(() => {
  for (const [name, prev] of touchedEnv) {
    if (prev === undefined) delete process.env[name];
    else process.env[name] = prev;
  }
  touchedEnv.clear();
  jest.clearAllMocks();
});

/** Provide both env-backed credentials an owner needs to reach the fetcher. */
function configureOwner(owner, bearer = 'bearer-x', kapitalId = '07209920') {
  setEnv(envName('Kapital', owner), bearer);
  setEnv(envName('KapitalId', owner), kapitalId);
}

describe('KapitalBank static surface', () => {
  it('exposes the KapitalState enum', () => {
    expect(KapitalBank.KapitalState).toEqual({
      Conducted: 2,
      Delayed: -1,
      Entered: 1,
      InProgress: 3,
    });
  });
});

describe('KapitalBank.payments — guard clauses', () => {
  it('warns when owner resolves falsy', async () => {
    const r = await KapitalBank.payments('', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No owner', 'Warning');
    expect(ChromesMock.fetcher).not.toHaveBeenCalled();
    expect(r).toBeUndefined();
  });

  it('warns when page is falsy', async () => {
    await KapitalBank.payments('SRental', 0, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No page', 'Warning');
    expect(ChromesMock.fetcher).not.toHaveBeenCalled();
  });

  it('warns when size is falsy', async () => {
    await KapitalBank.payments('SRental', 1, 0);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No size', 'Warning');
    expect(ChromesMock.fetcher).not.toHaveBeenCalled();
  });

  it('warns when no bearer is configured for the owner', async () => {
    await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No bearer', 'Warning');
  });

  it('warns when bearer exists but kapitalId is missing', async () => {
    // Source guard order checks bearer BEFORE kapitalId, so with bearer set the
    // next failing guard is kapitalId.
    setEnv(envName('Kapital', 'SRental'), 'bearer-x');
    await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No kapitalId', 'Warning');
    expect(ChromesMock.fetcher).not.toHaveBeenCalled();
  });
});

describe('KapitalBank.payments — happy path', () => {
  it('builds the b2b URL with kapitalId/size/page/state and returns the items array', async () => {
    configureOwner('SRental', 'tok-1', '07209920');
    const items = [{ id: 1 }, { id: 2 }];
    ChromesMock.fetcher.mockResolvedValue({
      result: { totalCount: 2, totalPages: 1, items },
    });

    const out = await KapitalBank.payments('SRental', 2, 500, KapitalBank.KapitalState.Conducted);

    expect(out).toEqual(items);
    const [url, options, owner, duration, replace] = ChromesMock.fetcher.mock.calls[0];
    expect(url).toBe('https://b2b-api.kapitalbank.uz/api/business/07209920/01158/paymentOrders/inBank?pageSize=500&pageNumber=2&state=2');
    expect(options.method).toBe('GET');
    expect(options.headers.authorization).toBe('Bearer tok-1');
    expect(owner).toBe('SRental');
    expect(duration).toBe(ChromesMock.Duration.Sec1);
    expect(replace).toEqual(['api/business', 'paymentOrders/inBank']);
  });

  it('defaults state to Conducted (2) when not passed', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue({ result: { totalCount: 1, totalPages: 1, items: [{}] } });
    await KapitalBank.payments('SRental', 1, 10);
    expect(ChromesMock.fetcher.mock.calls[0][0]).toContain('&state=2');
  });

  it('returns an Array (via Array.from) even for an array-like items value', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue({ result: { totalCount: 1, totalPages: 1, items: [{ a: 1 }] } });
    const out = await KapitalBank.payments('SRental', 1, 10);
    expect(out).toBeArray();
    expect(out).toEqual([{ a: 1 }]);
  });
});

describe('KapitalBank.payments — response edge cases', () => {
  it('warns when the fetcher returns nothing', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue(undefined);
    const r = await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No body in response', 'Warning');
    expect(r).toBeUndefined();
  });

  it('warns when the body lacks a result field', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue({});
    await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No result in response', 'Warning');
  });

  it('warns when totalCount is 0', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue({ result: { totalCount: 0, items: [] } });
    await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No Items in result', 'Warning');
  });

  it('routes a thrown fetcher error to errorBox', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockRejectedValue(new Error('chrome blew up'));
    const r = await KapitalBank.payments('SRental', 1, 10);
    expect(DialogsMock.errorBox).toHaveBeenCalled();
    expect(DialogsMock.errorBox.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(r).toBeUndefined();
  });
});

describe('KapitalBank.testing', () => {
  it('delegates to payments with the SRental owner and forwards its result', async () => {
    configureOwner('SRental');
    ChromesMock.fetcher.mockResolvedValue({ result: { totalCount: 1, totalPages: 1, items: [{ id: 9 }] } });

    await KapitalBank.testing();

    // testing calls KapitalBank.payments(IjaraSoliq.Owner.SRental, 1, 100)
    expect(ChromesMock.fetcher).toHaveBeenCalledTimes(1);
    const url = ChromesMock.fetcher.mock.calls[0][0];
    expect(url).toContain('/api/business/07209920/01158/paymentOrders/inBank');
    expect(url).toContain('pageSize=100');
    expect(url).toContain('pageNumber=1');
  });
});
