// Unit tests for utils/IjaraSoliq.js — an ijara.soliq.uz rent-contract client.
//
// HTTP boundary: IjaraSoliq delegates all network I/O to Chromes —
// `Chromes.fetcher(...)` for contracts and `Chromes.download(...)` for the PDF.
// We mock Chromes (plus Dialogs / Yamls) so tests drive the response and assert
// the URL / auth / replace patterns. No real network ever runs.
//
// SOURCE NOTE: `contracts`/`download` declare default params `owner = Owner.SRental`
// where `Owner` is NOT a module-level binding (only `IjaraSoliq.Owner` exists).
// Calling them WITHOUT an explicit owner therefore throws a ReferenceError when
// the default is evaluated — documented below, not fixed. Passing an owner
// explicitly skips the default and works.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { utilsModule } from './helpers/esm.js';

const DialogsMock = {
  warningBox: jest.fn(),
  errorBox: jest.fn(),
  messageBox: jest.fn(),
};
const state = { config: {} };
const YamlsMock = { getConfig: jest.fn((key) => state.config[key]) };
const ChromesMock = {
  Duration: { Sec1: 1, Sec10: 10, Hour10: 36000, noCache: -1, Unlimited: 0 },
  fetcher: jest.fn(),
  download: jest.fn(),
};

jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Chromes.js'), () => ({ Chromes: ChromesMock }));

const { IjaraSoliq, RentType, IjaraState } = await import('../utils/IjaraSoliq.js');

beforeEach(() => {
  state.config = {};
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('IjaraSoliq static surface', () => {
  it('exposes the Owner enum and the exported RentType / IjaraState maps', () => {
    expect(IjaraSoliq.Owner).toMatchObject({ SRental: 'SRental', WorkSpace: 'WorkSpace' });
    expect(RentType).toEqual({ IN: 2, Out: 1 });
    expect(IjaraState).toEqual({ Confirmed: 20, Outdated: 50, Rejected: 15, Waiting: 10 });
  });
});

// ---------------------------------------------------------------------------
// contracts
// ---------------------------------------------------------------------------
describe('IjaraSoliq.contracts — guard clauses', () => {
  it('warns when rentType is falsy (owner passed explicitly)', async () => {
    await IjaraSoliq.contracts('SRental', 0, IjaraState.Confirmed);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No rentType', 'Warning');
    expect(ChromesMock.fetcher).not.toHaveBeenCalled();
  });

  it('warns when state is falsy', async () => {
    await IjaraSoliq.contracts('SRental', RentType.Out, 0);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No state', 'Warning');
  });

  it('warns when no bearer is configured', async () => {
    await IjaraSoliq.contracts('SRental', RentType.Out, IjaraState.Confirmed);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No bearer', 'Warning');
  });

  it('BUG: throws ReferenceError when owner is omitted (default `Owner.SRental` is undefined)', async () => {
    await expect(IjaraSoliq.contracts()).rejects.toBeInstanceOf(ReferenceError);
  });
});

describe('IjaraSoliq.contracts — happy path', () => {
  it('builds the by-params URL, sends the Bearer + referer and returns the body', async () => {
    state.config['Ijara.SRental'] = 'tok-ij';
    const body = { items: [{ id: 1 }] };
    ChromesMock.fetcher.mockResolvedValue(body);

    const out = await IjaraSoliq.contracts('SRental', RentType.Out, IjaraState.Confirmed, 0, 1000);

    expect(out).toBe(body);
    const [url, options, owner, duration, replace] = ChromesMock.fetcher.mock.calls[0];
    expect(url).toBe('https://ijara.soliq.uz/api/rent/client/contract/get-list/by-params?myRentType=1&state=20&page=0&size=1000');
    expect(options.headers.authorization).toBe('Bearer tok-ij');
    expect(options.headers.referer).toContain('myRentType=1&state=20');
    expect(owner).toBe('SRental');
    expect(duration).toBe(ChromesMock.Duration.Sec1);
    expect(replace).toEqual(['api/rent/client/contract/get-list/by-params']);
  });

  it('warns when the fetcher returns no body', async () => {
    state.config['Ijara.SRental'] = 'tok-ij';
    ChromesMock.fetcher.mockResolvedValue(null);
    const r = await IjaraSoliq.contracts('SRental', RentType.Out, IjaraState.Confirmed);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No body in response', 'Warning');
    expect(r).toBeUndefined();
  });

  it('routes a thrown fetcher error to errorBox', async () => {
    state.config['Ijara.SRental'] = 'tok-ij';
    ChromesMock.fetcher.mockRejectedValue(new Error('blew up'));
    const r = await IjaraSoliq.contracts('SRental', RentType.Out, IjaraState.Confirmed);
    expect(DialogsMock.errorBox).toHaveBeenCalled();
    expect(r).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// download
// ---------------------------------------------------------------------------
describe('IjaraSoliq.download — guard clauses', () => {
  it('warns when docId is missing', async () => {
    await IjaraSoliq.download('SRental', undefined, '01.02.2026', '31.12.2028');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No docId', 'Warning');
    expect(ChromesMock.download).not.toHaveBeenCalled();
  });

  it('warns when startDate is missing', async () => {
    await IjaraSoliq.download('SRental', 123, undefined, '31.12.2028');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No startDate', 'Warning');
  });

  it('warns when endDate is missing', async () => {
    await IjaraSoliq.download('SRental', 123, '01.02.2026', undefined);
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No endDate', 'Warning');
  });

  it('BUG: throws ReferenceError when owner is omitted (default `Owner.SRental` is undefined)', async () => {
    await expect(IjaraSoliq.download(undefined, 1, 'a', 'b')).rejects.toBeInstanceOf(ReferenceError);
  });
});

describe('IjaraSoliq.download — happy path', () => {
  it('builds the download-file URL and returns the resulting file path', async () => {
    ChromesMock.download.mockResolvedValue('C:/tmp/contract.pdf');

    const out = await IjaraSoliq.download('SRental', 3754678, '01.02.2026', '31.12.2028');

    expect(out).toBe('C:/tmp/contract.pdf');
    const [url, options, owner, fileType, duration, replace] = ChromesMock.download.mock.calls[0];
    expect(url).toBe('https://ijara.soliq.uz/api/rent/client/file/download-file/3754678/01.02.2026/31.12.2028');
    expect(options.method).toBe('GET');
    expect(owner).toBe('SRental');
    expect(fileType).toBe('pdf');
    expect(duration).toBe(ChromesMock.Duration.Sec10);
    expect(replace).toEqual(['api/rent/client/file/download-file']);
  });

  it('warns when the downloader returns no path', async () => {
    ChromesMock.download.mockResolvedValue(null);
    const r = await IjaraSoliq.download('SRental', 123, '01.02.2026', '31.12.2028');
    expect(DialogsMock.warningBox).toHaveBeenCalledWith('No filePath in response', 'Warning');
    expect(r).toBeUndefined();
  });

  it('re-throws when the downloader rejects', async () => {
    ChromesMock.download.mockRejectedValue(new Error('download failed'));
    await expect(IjaraSoliq.download('SRental', 123, '01.02.2026', '31.12.2028')).rejects.toThrow('download failed');
  });
});

// ---------------------------------------------------------------------------
// testing — calls contracts + download with explicit owner (no ReferenceError)
// ---------------------------------------------------------------------------
describe('IjaraSoliq.testing', () => {
  it('invokes contracts and download with the SRental owner', async () => {
    state.config['Ijara.SRental'] = 'tok-ij';
    ChromesMock.fetcher.mockResolvedValue({ items: [] });
    ChromesMock.download.mockResolvedValue('C:/tmp/x.pdf');

    await IjaraSoliq.testing();
    // allow the fire-and-forget contracts()/download() promises to settle
    await new Promise((r) => setTimeout(r, 0));

    expect(ChromesMock.fetcher).toHaveBeenCalledTimes(1);
    expect(ChromesMock.download).toHaveBeenCalledTimes(1);
    expect(ChromesMock.fetcher.mock.calls[0][2]).toBe('SRental');
    expect(ChromesMock.download.mock.calls[0][0]).toContain('/download-file/3754678/01.02.2026/31.12.2028');
  });
});
