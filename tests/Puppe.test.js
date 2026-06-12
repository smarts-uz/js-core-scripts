// Unit tests for utils/Puppe.js — every public (non-_) static method:
//   humanScroll, autoScroll, scrollUntilSelector, extractOffers, extractUserId,
//   extractContent, extractApp, extractAppPhone, extractID, showPhone,
//   saveAsMhtml, scrapeOffers, scrapePhone, scrapeUser, offersCount,
//   scrapePages, appSavePagination, itemSavePagination, appSavePages,
//   appSavePhones, appSaveOffers, pageTitle, scrollAds.
//
// Puppe is a Puppeteer page-driven OLX scraper. Every method drives
// `globalThis.page` (the methods that take a `page` arg ignore it and use the
// global — a quirk of the source we mock around by setting globalThis.page).
// We follow the README "native/OS/network boundary" style: mock only the
// boundary — puppeteer + the sibling utils classes (Files, Chromes, Dialogs,
// Dates, ES, Phone, Yamls) and p-retry — while letting the real method logic
// (parsing, path building, control flow) run. fs writes go to real temp dirs.
//
// NOTE: the task list includes `findRecursiveFull`, but there is NO
// `static findRecursiveFull` on Puppe — the name appears only inside a log
// string and as a call to `Files.findRecursiveFull` from `offersCount`. It is
// therefore covered indirectly via offersCount and documented, not as its own
// Puppe method (it does not exist).

import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { makePuppeteerPage, makePuppeteerMock } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- boundary mocks ----------------------------------------------------------
// puppeteer is imported at the top of Puppe.js but page-driven methods never
// touch it directly; still mock it so no real browser is loaded.
jest.unstable_mockModule('puppeteer', () => makePuppeteerMock());

// p-retry: keep the REAL implementation — it is pure control-flow and our
// mocks make the wrapped fns succeed on the first attempt, so nothing loops.
// (Importing the real module is fine; no mock registered for it.)

const Files = {
  mkdirIfNotExists: jest.fn((d) => fs.mkdirSync(d, { recursive: true })),
  saveInfoToFile: jest.fn(),
  removeFilesWithExtension: jest.fn(),
  writeJson: jest.fn((p, data) => fs.writeFileSync(p, JSON.stringify(data), 'utf8')),
  readJson: jest.fn((p) => JSON.parse(fs.readFileSync(p, 'utf8'))),
  combineJsonFiles: jest.fn(),
  backupFolderZip: jest.fn(),
  backupFile: jest.fn(),
  cleanupFileName: jest.fn((s) => String(s).replace(/[\\/:*?"<>|]/g, ' ').trim()),
  findRecursiveFull: jest.fn(() => []),
};

const Chromes = {
  pageGo: jest.fn(async () => {}),
  runBrowser: jest.fn(async () => {}),
  getUrlFromFile: jest.fn(() => 'https://www.olx.uz/d/obyavlenie/test-ID999.html'),
  saveUrlFile: jest.fn(),
  saveUrlFileFromMht: jest.fn(),
  randomInt: jest.fn((min) => min),
  getRandomFloat: jest.fn((min) => min),
};

const Dialogs = { warningBox: jest.fn(), errorBox: jest.fn(), messageBox: jest.fn() };

const Dates = {
  randomIntOne: jest.fn((v) => v),
  randomInt: jest.fn((min) => min),
  sleep: jest.fn(async () => {}),
  normalizeUzAccordingToRule: jest.fn((v) => `NORM(${v})`),
};

const ES = {};

const Phone = {
  extractUzbekPhones: jest.fn(() => []),
  getNoPhones: jest.fn(() => []),
};

const Yamls = { getConfig: jest.fn(() => undefined) };

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files }));
jest.unstable_mockModule(utilsModule('Chromes.js'), () => ({ Chromes }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs }));
jest.unstable_mockModule(utilsModule('Dates.js'), () => ({ Dates }));
jest.unstable_mockModule(utilsModule('ES.js'), () => ({ ES }));
jest.unstable_mockModule(utilsModule('Phone.js'), () => ({ Phone }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls }));

const { Puppe } = await import('../utils/Puppe.js');

// --- shared helpers ----------------------------------------------------------

/** Install a fake page (with optional overrides) as globalThis.page. */
function setPage(overrides = {}) {
  const page = makePuppeteerPage(overrides);
  globalThis.page = page;
  return page;
}

/** A CDP session stub whose captureSnapshot yields MHTML bytes. */
function cdpSession(data = 'From: <Saved by Test>\n\nMHTML-DATA') {
  return {
    send: jest.fn(async (cmd) => {
      if (cmd === 'Page.captureSnapshot') return { data };
      return {};
    }),
  };
}

let tmp;
beforeEach(() => {
  tmp = makeTmpDir('puppe-');
  // sane defaults for the global save dirs many methods read
  globalThis.saveDir = path.join(tmp, 'save');
  globalThis.saveDirMht = path.join(tmp, 'mht');
  globalThis.saveDirUrl = path.join(tmp, 'url');
  globalThis.mhtmlDir = path.join(tmp, 'mhtmlDir');
  globalThis.mhtmlDirPage = path.join(tmp, 'mhtmlDirPage');
  globalThis.mhtmlDirData = path.join(tmp, 'mhtmlDirData');
  globalThis.mhtmlDirPageAllJson = path.join(tmp, 'pageAll.json');
  globalThis.mhtmlDirDataAllJson = path.join(tmp, 'dataAll.json');
  for (const d of ['save', 'mht', 'url', 'mhtmlDir', 'mhtmlDirPage', 'mhtmlDirData']) {
    fs.mkdirSync(path.join(tmp, d), { recursive: true });
  }
});

afterEach(() => {
  cleanupAllTmpDirs();
  delete globalThis.page;
  jest.clearAllMocks();
});

// =============================================================================
// Scrolling helpers
// =============================================================================

describe('Puppe.humanScroll', () => {
  it('wheels the mouse once per configured step and sleeps between', async () => {
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '3' : '120'));
    const page = setPage();

    await Puppe.humanScroll();

    expect(page.mouse.wheel).toHaveBeenCalledTimes(3);
    expect(Dates.randomIntOne).toHaveBeenCalledWith(120);
    expect(page.mouse.wheel).toHaveBeenLastCalledWith({ deltaY: 120 });
    expect(Dates.sleep).toHaveBeenCalledTimes(3);
  });

  it('does nothing when the step count is 0', async () => {
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '0' : '100'));
    const page = setPage();

    await Puppe.humanScroll();

    expect(page.mouse.wheel).not.toHaveBeenCalled();
  });

  it('breaks the loop (no throw) when wheel rejects', async () => {
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '5' : '100'));
    const page = setPage({
      mouse: { wheel: jest.fn(async () => { throw new Error('detached'); }), move: jest.fn() },
    });

    await expect(Puppe.humanScroll()).resolves.toBeUndefined();
    expect(page.mouse.wheel).toHaveBeenCalledTimes(1); // broke after first failure
  });
});

describe('Puppe.autoScroll', () => {
  it('runs the scroll routine inside page.evaluate with step/delay args', async () => {
    const page = setPage({ evaluate: jest.fn(async () => undefined) });

    await Puppe.autoScroll(250, 50);

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    const [, step, delay] = page.evaluate.mock.calls[0];
    expect(step).toBe(250);
    expect(delay).toBe(50);
  });

  it('uses default step/delay when omitted', async () => {
    const page = setPage();
    await Puppe.autoScroll();
    const [, step, delay] = page.evaluate.mock.calls[0];
    expect(step).toBe(400);
    expect(delay).toBe(150);
  });
});

describe('Puppe.scrollUntilSelector', () => {
  it('returns true immediately when the selector is already present', async () => {
    const page = setPage({ $: jest.fn(async () => ({ found: true })) });

    const out = await Puppe.scrollUntilSelector('.target');

    expect(out).toBe(true);
    expect(page.$).toHaveBeenCalledWith('.target');
    expect(page.evaluate).not.toHaveBeenCalled();
  });

  it('scrolls until the selector appears, then returns true', async () => {
    let calls = 0;
    const page = setPage({
      $: jest.fn(async () => (++calls >= 3 ? {} : null)),
      evaluate: jest.fn(async () => {}),
      waitForTimeout: jest.fn(async () => {}),
    });

    const out = await Puppe.scrollUntilSelector('.late', { step: 100, delay: 1, maxScrolls: 10 });

    expect(out).toBe(true);
    expect(page.evaluate).toHaveBeenCalledTimes(2); // scrolled twice before found on 3rd check
    expect(page.waitForTimeout).toHaveBeenCalledTimes(2);
  });

  it('returns false after exhausting maxScrolls without finding it', async () => {
    const page = setPage({
      $: jest.fn(async () => null),
      evaluate: jest.fn(async () => {}),
      waitForTimeout: jest.fn(async () => {}),
    });

    const out = await Puppe.scrollUntilSelector('.never', { maxScrolls: 4, delay: 1 });

    expect(out).toBe(false);
    expect(page.$).toHaveBeenCalledTimes(4);
    expect(page.evaluate).toHaveBeenCalledTimes(4);
  });
});

// =============================================================================
// Extraction helpers
// =============================================================================

describe('Puppe.extractOffers', () => {
  it('returns de-duplicated absolute ad links from $$eval', async () => {
    // The method passes a mapper fn to $$eval; our mock returns the already
    // transformed array (the mapper logic runs in a real browser). We assert
    // Puppe applies Set-dedup on top.
    const page = setPage({
      $$eval: jest.fn(async () => [
        'https://www.olx.uz/a',
        'https://www.olx.uz/a', // dup
        'https://www.olx.uz/b',
      ]),
    });

    const out = await Puppe.extractOffers();

    expect(page.$$eval).toHaveBeenCalledTimes(1);
    expect(out).toEqual(['https://www.olx.uz/a', 'https://www.olx.uz/b']);
  });

  it('returns an empty array when no links are present', async () => {
    setPage({ $$eval: jest.fn(async () => []) });
    expect(await Puppe.extractOffers()).toEqual([]);
  });
});

describe('Puppe.extractUserId', () => {
  it('decodes the user slug from a /list/user/<slug>/ href', async () => {
    setPage({
      $eval: jest.fn(async () => ({
        href: '/list/user/bitovaya%20texnika/',
        match: ['/list/user/bitovaya texnika/', 'bitovaya texnika'],
      })),
    });

    const out = await Puppe.extractUserId();

    // relative href gets the olx.uz origin prepended
    expect(out.href).toBe('https://olx.uz/list/user/bitovaya%20texnika/');
    expect(out.match).toBe('bitovaya texnika'); // decodeURIComponent applied
  });

  it('keeps an absolute href untouched and returns null-ish match when no regex hit', async () => {
    setPage({
      $eval: jest.fn(async () => ({ href: 'https://olx.uz/list/user/abc/', match: null })),
    });

    const out = await Puppe.extractUserId();

    expect(out.href).toBe('https://olx.uz/list/user/abc/');
    expect(out.match).toBeNull();
  });

  it('propagates the $eval rejection as a destructuring TypeError (documents real behavior)', async () => {
    // $eval rejects → the .catch returns null → `let { href, match } = null`
    // throws a TypeError. We document this real, un-guarded behavior.
    setPage({ $eval: jest.fn(async () => { throw new Error('no node'); }) });

    await expect(Puppe.extractUserId()).rejects.toThrow(TypeError);
  });
});

describe('Puppe.extractContent', () => {
  it('returns the trimmed description text from $eval', async () => {
    const page = setPage({ $eval: jest.fn(async () => 'Hello world description') });

    const out = await Puppe.extractContent(globalThis.page);

    expect(out).toBe('Hello world description');
    expect(page.$eval).toHaveBeenCalledWith(
      '[data-cy="ad_description"] > div:last-child',
      expect.any(Function),
    );
  });
});

describe('Puppe.extractApp', () => {
  it('returns the extracted text for a matching pattern', async () => {
    const page = setPage({ $eval: jest.fn(async () => '1 200 000 сум') });

    const out = await Puppe.extractApp('[data-testid="ad-price-container"] h3', globalThis.page);

    expect(out).toBe('1 200 000 сум');
    expect(page.$eval).toHaveBeenCalledWith('[data-testid="ad-price-container"] h3', expect.any(Function));
  });

  it('returns null when the selector is absent (rejection swallowed)', async () => {
    setPage({ $eval: jest.fn(async () => { throw new Error('no node'); }) });

    expect(await Puppe.extractApp('.missing', globalThis.page)).toBeNull();
  });
});

describe('Puppe.extractAppPhone', () => {
  it('returns the tel: href with the scheme stripped', async () => {
    setPage({ $eval: jest.fn(async () => '+998901234567') });

    const out = await Puppe.extractAppPhone('a.phone', globalThis.page);

    expect(out).toBe('+998901234567');
  });

  it('returns null when extraction throws', async () => {
    setPage({ $eval: jest.fn(async () => { throw new Error('no href'); }) });

    expect(await Puppe.extractAppPhone('a.phone', globalThis.page)).toBeNull();
  });
});

describe('Puppe.extractID', () => {
  it('prefixes the parsed numeric ID with "ID-"', async () => {
    setPage({ $eval: jest.fn(async () => '48768780') });

    expect(await Puppe.extractID(globalThis.page)).toBe('ID-48768780');
  });

  it('returns "ID-null" when no ID matches (documents real behavior)', async () => {
    // The $eval mapper returns null on no match; the method still does
    // `id = \`ID-${id}\``, producing the literal string "ID-null".
    setPage({ $eval: jest.fn(async () => null) });

    expect(await Puppe.extractID(globalThis.page)).toBe('ID-null');
  });
});

// =============================================================================
// Phone reveal
// =============================================================================

describe('Puppe.showPhone', () => {
  it('returns false when there are no phone buttons', async () => {
    setPage({ $$: jest.fn(async () => []) });

    expect(await Puppe.showPhone()).toBe(false);
  });

  it('clicks a visible button and returns the revealed phone number', async () => {
    const btn = {
      isVisible: jest.fn(async () => true),
      click: jest.fn(async () => {}),
      evaluate: jest.fn(async () => true),
    };
    Yamls.getConfig.mockReturnValue('3000');
    setPage({
      $$: jest.fn(async () => [btn]),
      waitForSelector: jest.fn(async () => ({})),
      $eval: jest.fn(async () => '+998993334455'),
    });

    const out = await Puppe.showPhone();

    expect(btn.click).toHaveBeenCalledTimes(1);
    expect(out).toBe('+998993334455');
  });

  it('returns null when waitForSelector rejects (error branch)', async () => {
    const btn = { isVisible: jest.fn(async () => true), click: jest.fn(async () => {}) };
    setPage({
      $$: jest.fn(async () => [btn]),
      waitForSelector: jest.fn(async () => { throw new Error('timeout'); }),
    });

    expect(await Puppe.showPhone()).toBeNull();
  });

  it('returns null when the only button is not visible', async () => {
    const btn = {
      isVisible: jest.fn(async () => false),
      evaluate: jest.fn(async () => false),
    };
    setPage({ $$: jest.fn(async () => [btn]) });

    expect(await Puppe.showPhone()).toBeNull();
  });
});

// =============================================================================
// MHTML snapshot
// =============================================================================

describe('Puppe.saveAsMhtml', () => {
  it('writes the captured MHTML snapshot to the given file', async () => {
    const cdp = cdpSession('MHTML-BYTES-HERE');
    setPage({ createCDPSession: jest.fn(async () => cdp) });
    const out = path.join(tmp, 'snap.mhtml');

    await Puppe.saveAsMhtml(out);

    expect(cdp.send).toHaveBeenCalledWith('Page.enable');
    expect(cdp.send).toHaveBeenCalledWith('Page.captureSnapshot', { format: 'mhtml' });
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe('MHTML-BYTES-HERE');
  });

  it('does not write a file and does not throw when captureSnapshot fails', async () => {
    const cdp = {
      send: jest.fn(async (cmd) => {
        if (cmd === 'Page.captureSnapshot') throw new Error('Failed to generate MHTML');
        return {};
      }),
    };
    setPage({ createCDPSession: jest.fn(async () => cdp), url: jest.fn(() => 'https://x.test') });
    const out = path.join(tmp, 'fail.mhtml');

    await expect(Puppe.saveAsMhtml(out)).resolves.toBeUndefined();
    expect(fs.existsSync(out)).toBe(false);
  });

  it('swallows an error when the CDP session cannot be created', async () => {
    setPage({
      createCDPSession: jest.fn(async () => { throw new Error('no target'); }),
      url: jest.fn(() => 'https://x.test'),
    });

    await expect(Puppe.saveAsMhtml(path.join(tmp, 'x.mhtml'))).resolves.toBeUndefined();
  });
});

// =============================================================================
// pageTitle
// =============================================================================

describe('Puppe.pageTitle', () => {
  it('cleans the title and strips the " на Olx" suffix', async () => {
    setPage({ title: jest.fn(async () => 'Apple iPhone на Olx') });

    const out = await Puppe.pageTitle();

    expect(Files.cleanupFileName).toHaveBeenCalledWith('Apple iPhone на Olx');
    expect(out).toBe('Apple iPhone');
  });

  it('returns the cleaned title unchanged when there is no Olx suffix', async () => {
    setPage({ title: jest.fn(async () => 'Just A Title') });
    expect(await Puppe.pageTitle()).toBe('Just A Title');
  });
});

// =============================================================================
// scrollAds
// =============================================================================

describe('Puppe.scrollAds', () => {
  it('reads page geometry and performs scrollCount + final scroll evaluates', async () => {
    Yamls.getConfig.mockReturnValue(undefined); // fall back to defaults
    Chromes.randomInt
      .mockReturnValueOnce(0)   // waitTime
      .mockReturnValueOnce(2)   // scrollCount
      .mockReturnValue(100);    // scroll positions
    Chromes.getRandomFloat.mockReturnValue(0.001);
    const page = setPage({
      evaluate: jest.fn(async () => 1000), // scrollHeight / innerHeight / scrollTo
    });

    await Puppe.scrollAds();

    // 2 geometry reads + scrollCount(2) + 1 final = 5 evaluate calls
    expect(page.evaluate).toHaveBeenCalledTimes(5);
    expect(Chromes.randomInt).toHaveBeenCalled();
  });
});

// =============================================================================
// offersCount  (exercises Files.findRecursiveFull — there is no Puppe.findRecursiveFull)
// =============================================================================

describe('Puppe.offersCount', () => {
  it('delegates to Files.findRecursiveFull with a predicate and resolves', async () => {
    Files.findRecursiveFull.mockReturnValue(['/a/Мы нашли 5 объявлений']);

    const out = await Puppe.offersCount(tmp);

    expect(Files.findRecursiveFull).toHaveBeenCalledTimes(1);
    const [dir, predicate] = Files.findRecursiveFull.mock.calls[0];
    expect(dir).toBe(tmp);
    // the predicate matches folder names containing both Russian markers
    expect(predicate('Мы нашли 5 объявлений')).toBe(true);
    expect(predicate('unrelated folder')).toBe(false);
    expect(out).toBeUndefined(); // method does not return a value
  });
});

// =============================================================================
// scrapePages
// =============================================================================

describe('Puppe.scrapePages', () => {
  it('navigates, extracts offers, writes the JSON index and the page MHTML', async () => {
    const cdp = cdpSession('PAGE-MHTML');
    setPage({
      title: jest.fn(async () => 'Catalog Page'),
      $$eval: jest.fn(async () => ['https://www.olx.uz/x', 'https://www.olx.uz/y']),
      createCDPSession: jest.fn(async () => cdp),
    });

    await Puppe.scrapePages('https://www.olx.uz/catalog');

    expect(Chromes.pageGo).toHaveBeenCalledWith('https://www.olx.uz/catalog', { waitUntil: 'networkidle2' });
    // JSON index written under mhtmlDirData
    expect(Files.writeJson).toHaveBeenCalledWith(
      path.join(globalThis.mhtmlDirData, 'Catalog Page.json'),
      ['https://www.olx.uz/x', 'https://www.olx.uz/y'],
    );
    // page MHTML saved under mhtmlDirPage
    expect(fs.existsSync(path.join(globalThis.mhtmlDirPage, 'Catalog Page.mhtml'))).toBe(true);
  });
});

// =============================================================================
// scrapeUser
// =============================================================================

describe('Puppe.scrapeUser', () => {
  it('returns early without navigating when the user MHTML already exists', async () => {
    const userDir = path.join(tmp, 'users', 'u1');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, 'User u1.mhtml'), 'x', 'utf8');
    setPage();

    await Puppe.scrapeUser('https://olx.uz/u1', userDir, 'u1');

    expect(Chromes.pageGo).not.toHaveBeenCalled();
  });

  it('navigates, snapshots the user page, writes the url file and saves patterns', async () => {
    const userDir = path.join(tmp, 'users', 'u2');
    fs.mkdirSync(userDir, { recursive: true });
    const cdp = cdpSession('USER-MHTML');
    setPage({
      createCDPSession: jest.fn(async () => cdp),
      $eval: jest.fn(async () => 'Some Seller'),
    });

    await Puppe.scrapeUser('https://olx.uz/u2', userDir, 'u2');

    expect(Chromes.pageGo).toHaveBeenCalledWith('https://olx.uz/u2', { waitUntil: 'networkidle2' });
    expect(fs.existsSync(path.join(userDir, 'User u2.mhtml'))).toBe(true);
    expect(Files.removeFilesWithExtension).toHaveBeenCalledWith(userDir, '.app');
    expect(Chromes.saveUrlFile).toHaveBeenCalledWith(path.join(userDir, 'User u2.url'), 'https://olx.uz/u2');
    // each extracted pattern is normalized then persisted
    expect(Dates.normalizeUzAccordingToRule).toHaveBeenCalledWith('Some Seller');
    expect(Files.saveInfoToFile).toHaveBeenCalled();
  });
});

// =============================================================================
// scrapeOffers  (the big orchestrator)
// =============================================================================

describe('Puppe.scrapeOffers', () => {
  it('builds the offer folder tree, writes content + ID, saves MHTML and returns true', async () => {
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '0' : undefined));
    Phone.extractUzbekPhones.mockReturnValue(['998901112233']);
    const cdp = cdpSession('OFFER-MHTML');

    // $eval drives extractUserId (object), extractContent (desc), extractID
    // (digits) and extractApp (text). Return values are matched positionally
    // by selector via a small router.
    setPage({
      title: jest.fn(async () => 'iPhone 13'),
      createCDPSession: jest.fn(async () => cdp),
      $eval: jest.fn(async (selector) => {
        if (selector === 'a[data-testid="user-profile-link"]') {
          return { href: '/list/user/seller1/', match: ['/list/user/seller1/', 'seller1'] };
        }
        if (selector === '[data-cy="ad_description"] > div:last-child') {
          return 'Great phone. Call 998901112233';
        }
        if (selector === '[data-testid="ad-footer-bar-section"]') return '55512345';
        return 'Some Field';
      }),
    });

    const url = 'https://www.olx.uz/d/obyavlenie/iphone-13-ID12345.html';
    const out = await Puppe.scrapeOffers(url);

    expect(Chromes.pageGo).toHaveBeenCalledWith(url, { waitUntil: 'networkidle2' });
    // user folder + offer folder created under saveDir
    const userIdPath = path.join(globalThis.saveDir, 'seller1');
    const offerPath = path.join(userIdPath, 'iPhone 13');
    expect(fs.existsSync(path.join(offerPath, 'ALL.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(offerPath, 'ALL.txt'), 'utf8')).toContain('Great phone');
    // copied offer MHTML lands in saveDirMht and method reports success
    expect(fs.existsSync(path.join(globalThis.saveDirMht, 'iPhone 13.mhtml'))).toBe(true);
    expect(Chromes.saveUrlFileFromMht).toHaveBeenCalled();
    expect(out).toBe(true);
  });

  it('warns via Dialogs then throws when the user ID cannot be extracted (documents real bug)', async () => {
    // When extractUserId yields a null `match`, scrapeOffers shows the warning
    // but then unconditionally does `path.join(saveDir, match)` with null,
    // which throws a TypeError. The method does NOT recover — we assert both
    // the warning fired and the real throw (the source has no early return).
    Yamls.getConfig.mockReturnValue('0');
    const cdp = cdpSession('OFFER-MHTML');
    setPage({
      title: jest.fn(async () => 'NoUser Offer'),
      createCDPSession: jest.fn(async () => cdp),
      $eval: jest.fn(async (selector) => {
        if (selector === 'a[data-testid="user-profile-link"]') {
          return { href: 'https://olx.uz/x', match: null }; // no match → warning then throw
        }
        if (selector === '[data-cy="ad_description"] > div:last-child') return '';
        if (selector === '[data-testid="ad-footer-bar-section"]') return null;
        return null;
      }),
    });

    // Match by message (not constructor): under --experimental-vm-modules the
    // engine TypeError comes from a different realm, so `toThrow(TypeError)`
    // fails the identity check even though it IS a TypeError.
    await expect(
      Puppe.scrapeOffers('https://www.olx.uz/d/obyavlenie/x-ID1.html'),
    ).rejects.toThrow(/path.*argument must be of type string/);

    expect(Dialogs.warningBox).toHaveBeenCalled();
  });
});

// =============================================================================
// scrapePhone
// =============================================================================

describe('Puppe.scrapePhone', () => {
  it('reveals the phone, clears the error marker and persists OK + phone', async () => {
    const userDir = path.join(tmp, 'phoneuser');
    fs.mkdirSync(userDir, { recursive: true });
    fs.writeFileSync(path.join(userDir, '#PhoneError.txt'), 'prev', 'utf8');
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '0' : '3000'));

    const btn = { isVisible: jest.fn(async () => true), click: jest.fn(async () => {}) };
    setPage({
      $$: jest.fn(async () => [btn]),
      waitForSelector: jest.fn(async () => ({})),
      $eval: jest.fn(async (selector) => {
        if (selector === 'a[data-testid="contact-phone"]') return '+998901112233';
        return null; // extractAppPhone patterns
      }),
    });

    const out = await Puppe.scrapePhone('https://olx.uz/offer', userDir);

    expect(out).toBe(true);
    // previous error marker removed
    expect(fs.existsSync(path.join(userDir, '#PhoneError.txt'))).toBe(false);
    expect(Files.saveInfoToFile).toHaveBeenCalledWith(userDir, '#PhoneOK');
    expect(Files.saveInfoToFile).toHaveBeenCalledWith(userDir, 'NORM(+998901112233)');
  });

  it('returns false after p-retry exhausts when the phone never shows', async () => {
    const userDir = path.join(tmp, 'nophone');
    fs.mkdirSync(userDir, { recursive: true });
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '0' : '10'));
    // No phone buttons → showPhone returns false (not null) → the retried fn
    // resolves false, so p-retry succeeds and the method returns false.
    setPage({ $$: jest.fn(async () => []) });

    const out = await Puppe.scrapePhone('https://olx.uz/offer', userDir);

    expect(out).toBe(false);
  }, 20000);
});

// =============================================================================
// appSavePagination
// =============================================================================

describe('Puppe.appSavePagination', () => {
  it('starts the browser, backs up, processes each .mhtml file then combines json', async () => {
    // seed two .mhtml files in mhtmlDir
    fs.writeFileSync(path.join(globalThis.mhtmlDir, 'one.mhtml'), 'x', 'utf8');
    fs.writeFileSync(path.join(globalThis.mhtmlDir, 'two.mhtml'), 'x', 'utf8');
    fs.writeFileSync(path.join(globalThis.mhtmlDir, 'skip.txt'), 'x', 'utf8');

    Yamls.getConfig.mockReturnValue('0');
    Chromes.getUrlFromFile.mockReturnValue('https://www.olx.uz/list?q=1');
    // itemSavePagination drives the page: make pagination resolve fast.
    setPage({
      title: jest.fn(async () => 'Listing'),
      url: jest.fn(() => 'https://www.olx.uz/list?q=1'),
      waitForSelector: jest.fn(async () => ({})),
      evaluate: jest.fn(async (fn) => {
        // first evaluate (scrollIntoView) → undefined; the "next" clicker must
        // return false so the while-loop exits immediately; maxPage → 0.
        return false;
      }),
    });

    await Puppe.appSavePagination();

    expect(Chromes.runBrowser).toHaveBeenCalled();
    expect(Files.backupFolderZip).toHaveBeenCalledWith(globalThis.mhtmlDirPage);
    // two mhtml files → two url lookups → two itemSavePagination runs
    expect(Chromes.getUrlFromFile).toHaveBeenCalledTimes(2);
    expect(Files.combineJsonFiles).toHaveBeenCalledWith(globalThis.mhtmlDirPage);
  });
});

// =============================================================================
// itemSavePagination
// =============================================================================

describe('Puppe.itemSavePagination', () => {
  it('builds pagination URLs from the max page number and writes them to json', async () => {
    Yamls.getConfig.mockReturnValue('0');
    let evalCall = 0;
    setPage({
      title: jest.fn(async () => 'Cat Listing'),
      url: jest.fn(() => 'https://www.olx.uz/list?q=phones'),
      waitForSelector: jest.fn(async () => ({})),
      evaluate: jest.fn(async () => {
        evalCall++;
        // call order: scrollIntoView, [next-clicker → false], scrollTo top,
        // maxPageNumber → return 3 for the maxPage evaluate.
        if (evalCall === 2) return false; // next button clicker: stop loop
        if (evalCall === 4) return 3;      // maxPageNumber
        return undefined;
      }),
    });

    const out = await Puppe.itemSavePagination('https://www.olx.uz/list?q=phones');

    // base url (page param removed) + pages 2..3 = 3 urls
    expect(out).toEqual([
      'https://www.olx.uz/list?q=phones',
      'https://www.olx.uz/list?q=phones&page=2',
      'https://www.olx.uz/list?q=phones&page=3',
    ]);
    expect(Files.writeJson).toHaveBeenCalledWith(
      path.join(globalThis.mhtmlDirPage, 'Cat Listing.json'),
      out,
    );
  });

  it('returns just the base url when there are no extra pages (maxPage 0)', async () => {
    Yamls.getConfig.mockReturnValue('0');
    setPage({
      title: jest.fn(async () => 'Single'),
      url: jest.fn(() => 'https://www.olx.uz/list?page=1&q=x'),
      waitForSelector: jest.fn(async () => ({})),
      evaluate: jest.fn(async () => false), // next-clicker false; maxPage falsy → 0
    });

    const out = await Puppe.itemSavePagination('https://www.olx.uz/list?page=1&q=x');

    // the existing `page` param is stripped from the base url
    expect(out).toEqual(['https://www.olx.uz/list?q=x']);
  });
});

// =============================================================================
// appSavePages
// =============================================================================

describe('Puppe.appSavePages', () => {
  it('iterates every page url in the all-json and scrapes each, then combines', async () => {
    fs.writeFileSync(
      globalThis.mhtmlDirPageAllJson,
      JSON.stringify(['https://www.olx.uz/p1', 'https://www.olx.uz/p2']),
      'utf8',
    );
    Yamls.getConfig.mockReturnValue('0');
    const cdp = cdpSession('PAGE');
    setPage({
      title: jest.fn(async () => 'PageTitle'),
      $$eval: jest.fn(async () => []),
      createCDPSession: jest.fn(async () => cdp),
    });

    await Puppe.appSavePages();

    expect(Chromes.runBrowser).toHaveBeenCalled();
    expect(Files.backupFolderZip).toHaveBeenCalledWith(globalThis.mhtmlDirData);
    // scrapePages ran for both urls → two writeJson index calls
    expect(Files.writeJson).toHaveBeenCalledTimes(2);
    expect(Files.combineJsonFiles).toHaveBeenCalledWith(globalThis.mhtmlDirData);
  });

  it('does nothing past the backup when the all-json file is missing', async () => {
    // mhtmlDirPageAllJson intentionally not created
    Yamls.getConfig.mockReturnValue('0');
    setPage();

    await Puppe.appSavePages();

    expect(Files.combineJsonFiles).not.toHaveBeenCalled();
  });
});

// =============================================================================
// appSavePhones
// =============================================================================

describe('Puppe.appSavePhones', () => {
  it('warns and returns when there are no folders to scan', async () => {
    Phone.getNoPhones.mockReturnValue([]);

    await Puppe.appSavePhones();

    expect(Chromes.runBrowser).not.toHaveBeenCalled();
  });

  it('scrapes the phone for an offer folder containing ALL.mhtml and re-saves on success', async () => {
    // folderToScan/<offerFolder>/ALL.mhtml
    const folderToScan = path.join(tmp, 'noPhoneUser');
    const offerFolder = path.join(folderToScan, 'OfferA');
    fs.mkdirSync(offerFolder, { recursive: true });
    fs.writeFileSync(path.join(offerFolder, 'ALL.mhtml'), 'mhtml', 'utf8');

    Phone.getNoPhones.mockReturnValue([folderToScan]);
    Chromes.getUrlFromFile.mockReturnValue('https://www.olx.uz/d/obyavlenie/x-ID7.html');
    Yamls.getConfig.mockImplementation((k) => (k === 'humanScrollStep' ? '0' : '10'));

    // make scrapePhone succeed: visible button + contact phone present
    const btn = { isVisible: jest.fn(async () => true), click: jest.fn(async () => {}) };
    const cdp = cdpSession('RESAVED');
    setPage({
      $$: jest.fn(async () => [btn]),
      waitForSelector: jest.fn(async () => ({})),
      createCDPSession: jest.fn(async () => cdp),
      $eval: jest.fn(async (selector) =>
        selector === 'a[data-testid="contact-phone"]' ? '+998900000000' : null),
    });

    await Puppe.appSavePhones();

    expect(Chromes.runBrowser).toHaveBeenCalled();
    // on success the offer MHTML is re-saved
    expect(fs.existsSync(path.join(offerFolder, 'ALL.mhtml'))).toBe(true);
  }, 20000);

  it('skips a folder whose offer subfolder has no ALL.mhtml', async () => {
    const folderToScan = path.join(tmp, 'emptyUser');
    fs.mkdirSync(path.join(folderToScan, 'OfferEmpty'), { recursive: true });
    Phone.getNoPhones.mockReturnValue([folderToScan]);
    Yamls.getConfig.mockReturnValue('0');
    setPage();

    await Puppe.appSavePhones();

    // browser started but no url lookup happened (skipped before getUrlFromFile)
    expect(Chromes.runBrowser).toHaveBeenCalled();
    expect(Chromes.getUrlFromFile).not.toHaveBeenCalled();
  });
});

// =============================================================================
// appSaveOffers
// =============================================================================

describe('Puppe.appSaveOffers', () => {
  it('returns without running when the data all-json file is missing', async () => {
    // mhtmlDirDataAllJson intentionally absent
    await expect(Puppe.appSaveOffers()).resolves.toBeUndefined();
    expect(Chromes.runBrowser).not.toHaveBeenCalled();
  });

  it('returns early when the data all-json is an empty array', async () => {
    fs.writeFileSync(globalThis.mhtmlDirDataAllJson, '[]', 'utf8');
    Files.readJson.mockReturnValue([]);

    await Puppe.appSaveOffers();

    expect(Chromes.runBrowser).not.toHaveBeenCalled();
  });

  it('scrapes each offer url, then rewrites the shrunk json after a success', async () => {
    const urls = ['https://www.olx.uz/d/obyavlenie/a-ID1.html'];
    fs.writeFileSync(globalThis.mhtmlDirDataAllJson, JSON.stringify(urls), 'utf8');
    Files.readJson.mockReturnValue([...urls]);
    Yamls.getConfig.mockReturnValue('0');
    Phone.extractUzbekPhones.mockReturnValue([]);

    const cdp = cdpSession('OFFER');
    setPage({
      title: jest.fn(async () => 'Offer A'),
      createCDPSession: jest.fn(async () => cdp),
      $eval: jest.fn(async (selector) => {
        if (selector === 'a[data-testid="user-profile-link"]') {
          return { href: '/list/user/s1/', match: ['/list/user/s1/', 's1'] };
        }
        if (selector === '[data-cy="ad_description"] > div:last-child') return 'desc';
        if (selector === '[data-testid="ad-footer-bar-section"]') return '111';
        return 'Field';
      }),
    });

    await Puppe.appSaveOffers();

    expect(Chromes.runBrowser).toHaveBeenCalled();
    // after a successful scrape the shrunk list (now empty) is written back
    expect(Files.backupFile).toHaveBeenCalledWith(globalThis.mhtmlDirDataAllJson);
    expect(Files.writeJson).toHaveBeenCalledWith(globalThis.mhtmlDirDataAllJson, []);
  }, 20000);
});
