// Unit tests for utils/Chromes.js — every public (non-_) static method.
//
// Chromes is a Puppeteer/undici/child_process-backed scraper-and-MHT toolkit, so
// it mixes two test styles (per tests/README.md):
//   • Pure logic & fs (randomInt, getRandomFloat, getUrlFromFile*, the MHT/URL
//     savers and converters) are tested for real against temp files.
//   • The native/network boundaries — puppeteer / puppeteer-core (browser),
//     undici (fetch), child_process (nircmd shell-outs, clip) — are mocked with
//     jest.unstable_mockModule BEFORE importing Chromes, and we assert the
//     boundary was driven with the right arguments and the return is shaped right.
//
// Siblings (Files / Dialogs / Yamls) are mocked to isolate the unit and to feed
// config: Files.cleanUrl, which Chromes.getUrlFromFileClean calls, does NOT exist
// in the real Files class (documented below) — the mock supplies a pass-through
// so the genuine URL-stripping logic in Chromes can be exercised.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs } from './helpers/tmp.js';
import { makePuppeteerMock, makePuppeteerBrowser, makePuppeteerPage } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- network boundary (undici) -----------------------------------------------
const undiciFetch = jest.fn();
const setGlobalDispatcher = jest.fn();
class AgentMock {
  constructor(opts) { this.opts = opts; }
}
jest.unstable_mockModule('undici', () => ({
  fetch: undiciFetch,
  request: jest.fn(),
  Agent: AgentMock,
  setGlobalDispatcher,
  default: {},
}));

// --- shell boundary (child_process) ------------------------------------------
// exec is imported at module top (used by kill/close/hide/showChrome).
// processPathsToClipboard does a dynamic import('child_process') for spawnSync.
const exec = jest.fn();
const spawnSync = jest.fn();
jest.unstable_mockModule('child_process', () => ({
  exec,
  spawnSync,
  execSync: jest.fn(),
  default: { exec, spawnSync },
}));

// --- browser boundaries (puppeteer + puppeteer-core) -------------------------
// pageSetup() calls setDefaultTimeout/setDefaultNavigationTimeout, which the
// default page mock omits — add them so runBrowser/pageGo can run pageSetup.
const page = makePuppeteerPage({
  setDefaultTimeout: jest.fn(),
  setDefaultNavigationTimeout: jest.fn(),
});
const browser = makePuppeteerBrowser(page);
const puppeteerMock = makePuppeteerMock(browser);
jest.unstable_mockModule('puppeteer', () => puppeteerMock);
const coreLaunch = jest.fn(async () => browser);
jest.unstable_mockModule('puppeteer-core', () => ({
  default: { launch: coreLaunch, connect: jest.fn() },
  launch: coreLaunch,
  connect: jest.fn(),
}));

// --- user-agents: keep deterministic & dependency-free -----------------------
class UserAgentMock {
  constructor() {
    this.data = { userAgent: 'Mozilla/5.0 Chrome/124', deviceCategory: 'desktop' };
  }
  toString() { return this.data.userAgent; }
}
jest.unstable_mockModule('user-agents', () => ({ default: UserAgentMock }));

// --- sibling utils mocks ------------------------------------------------------
const config = {};
const YamlsMock = { getConfig: jest.fn((key) => config[key]) };

const FilesMock = {
  mkdirIfNotExists: jest.fn((d) => fs.mkdirSync(d, { recursive: true })),
  cleanupFileName: jest.fn((name) => String(name).replace(/[<>:"|?*\\/\s]+/g, ' ').trim().slice(0, 100)),
  readJson: jest.fn((p) => JSON.parse(fs.readFileSync(p, 'utf8'))),
  writeJson: jest.fn((p, data) => fs.writeFileSync(p, JSON.stringify(data), 'utf8')),
  backupFile: jest.fn(),
  // NOTE: the real Files class has NO cleanUrl method — getUrlFromFileClean would
  // throw against the real sibling. We supply a pass-through so the genuine
  // stripping logic in Chromes.getUrlFromFileClean can be asserted.
  cleanUrl: jest.fn((u) => u),
  currentDir: jest.fn(() => config.__currentDir || ''),
  pickRandomFile: jest.fn(() => config.__txtPath || null),
  cleanPath: jest.fn((p) => String(p).replace(/\\\\+/g, '\\').replace(/\\/g, '/')),
  findRecursiveFull: jest.fn(() => config.__found || []),
};

const DialogsMock = {
  warningBox: jest.fn(() => null),
  errorBox: jest.fn(() => null),
  messageBox: jest.fn(),
};

jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));

const { Chromes } = await import('../utils/Chromes.js');

// helper: a fetch Response stand-in
function jsonResponse(body, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return { ok, status, statusText, json: async () => body, text: async () => body, arrayBuffer: async () => Buffer.from(JSON.stringify(body)) };
}
function bufferResponse(buf, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return { ok, status, statusText, arrayBuffer: async () => buf, text: async () => buf.toString() };
}
function textResponse(text, { ok = true, status = 200, statusText = 'OK' } = {}) {
  return { ok, status, statusText, text: async () => text };
}

let tmp;
beforeEach(() => {
  tmp = makeTmpDir('chromes-');
  // reset config to defaults
  for (const k of Object.keys(config)) delete config[k];
  config['Cache.Directory'] = path.join(tmp, 'cache');
  config['Cache.FetchTimeout'] = 5000;
  // restore the FilesMock implementations that some tests may override
  FilesMock.findRecursiveFull.mockImplementation(() => config.__found || []);
  FilesMock.pickRandomFile.mockImplementation(() => config.__txtPath || null);
  FilesMock.currentDir.mockImplementation(() => config.__currentDir || '');
});

afterEach(() => {
  cleanupAllTmpDirs();
  jest.clearAllMocks();
  // drop any globalThis state set by browser methods
  delete globalThis.browser;
  delete globalThis.page;
  delete globalThis.app;
  delete globalThis.isCmdGo;
  delete globalThis.hideChrome;
});

// =============================================================================
// Pure number helpers
// =============================================================================
describe('Chromes.randomInt', () => {
  it('returns an integer within [min, max] inclusive', () => {
    for (let i = 0; i < 300; i++) {
      const r = Chromes.randomInt(5, 9);
      expect(Number.isInteger(r)).toBe(true);
      expect(r).toBeGreaterThanOrEqual(5);
      expect(r).toBeLessThanOrEqual(9);
    }
  });

  it('returns the value itself when min === max', () => {
    expect(Chromes.randomInt(7, 7)).toBe(7);
  });
});

describe('Chromes.getRandomFloat', () => {
  it('returns a float within [min, max)', () => {
    for (let i = 0; i < 300; i++) {
      const r = Chromes.getRandomFloat(1, 2);
      expect(r).toBeGreaterThanOrEqual(1);
      expect(r).toBeLessThan(2);
    }
  });

  it('can return non-integer values', () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(Chromes.getRandomFloat(0, 1));
    expect([...seen].some((v) => !Number.isInteger(v))).toBe(true);
  });
});

// =============================================================================
// userAgent
// =============================================================================
describe('Chromes.userAgent', () => {
  it('constructs a UserAgent and returns undefined (logs only, no return)', () => {
    // The method builds a UserAgent and console.logs it but does not return it.
    expect(Chromes.userAgent()).toBeUndefined();
  });
});

// =============================================================================
// getUrlFromFile / getUrlFromFileClean (real temp files)
// =============================================================================
describe('Chromes.getUrlFromFile', () => {
  it('extracts the Snapshot-Content-Location URL from an MHT', () => {
    const f = path.join(tmp, 'a.mht');
    fs.writeFileSync(f, 'From: <Saved by Blink>\r\nSnapshot-Content-Location: https://example.com/page?x=1\r\nSubject: test\r\n', 'utf8');
    expect(Chromes.getUrlFromFile(f)).toBe('https://example.com/page?x=1');
  });

  it('falls back to Content-Location when no Snapshot header is present', () => {
    const f = path.join(tmp, 'b.mht');
    fs.writeFileSync(f, 'MIME-Version: 1.0\r\nContent-Location: https://site.org/article\r\n', 'utf8');
    expect(Chromes.getUrlFromFile(f)).toBe('https://site.org/article');
  });

  it('strips surrounding HTML comment markers from the extracted URL', () => {
    const f = path.join(tmp, 'c.html');
    fs.writeFileSync(f, '<!-- Content-Location: https://x.com/p -->\n<html></html>', 'utf8');
    expect(Chromes.getUrlFromFile(f)).toBe('https://x.com/p');
  });

  it('returns null and logs an error when no URL header exists', () => {
    const f = path.join(tmp, 'd.txt');
    fs.writeFileSync(f, 'just some text without any location header', 'utf8');
    expect(Chromes.getUrlFromFile(f)).toBeNull();
  });
});

describe('Chromes.getUrlFromFileClean', () => {
  it('strips scheme, www and a trailing slash then runs Files.cleanUrl', () => {
    const f = path.join(tmp, 'e.mht');
    fs.writeFileSync(f, 'Snapshot-Content-Location: https://www.example.com/path/\r\n', 'utf8');
    const out = Chromes.getUrlFromFileClean(f);
    expect(out).toBe('example.com/path');
    expect(FilesMock.cleanUrl).toHaveBeenCalledWith('example.com/path');
  });

  it('handles http:// scheme without www', () => {
    const f = path.join(tmp, 'f.mht');
    fs.writeFileSync(f, 'Content-Location: http://news.io/a\r\n', 'utf8');
    expect(Chromes.getUrlFromFileClean(f)).toBe('news.io/a');
  });
});

// =============================================================================
// saveUrlFile / saveUrlFileFromMht (real temp files)
// =============================================================================
describe('Chromes.saveUrlFile', () => {
  it('writes a Windows .url InternetShortcut with the given URL', () => {
    const out = path.join(tmp, 'shortcut.url');
    Chromes.saveUrlFile(out, 'https://example.com/x');
    const content = fs.readFileSync(out, 'utf8');
    expect(content).toContain('[InternetShortcut]');
    expect(content).toContain('URL=https://example.com/x');
  });
});

describe('Chromes.saveUrlFileFromMht', () => {
  it('reads the URL out of an MHT and writes a .url shortcut for it', () => {
    const mht = path.join(tmp, 'src.mht');
    fs.writeFileSync(mht, 'Snapshot-Content-Location: https://example.com/from-mht\r\n', 'utf8');
    const out = path.join(tmp, 'out.url');

    Chromes.saveUrlFileFromMht(mht, out);

    const content = fs.readFileSync(out, 'utf8');
    expect(content).toContain('[InternetShortcut]');
    expect(content).toContain('URL=https://example.com/from-mht');
  });

  it('writes URL=null when the MHT has no URL header', () => {
    const mht = path.join(tmp, 'nourl.mht');
    fs.writeFileSync(mht, 'no header here', 'utf8');
    const out = path.join(tmp, 'out2.url');
    Chromes.saveUrlFileFromMht(mht, out);
    expect(fs.readFileSync(out, 'utf8')).toContain('URL=null');
  });
});

// =============================================================================
// mhtToHtmConvert (real MHT fixture, offline — no network)
// =============================================================================
function buildMht({ url = 'https://example.com/article', encoding = '8bit', body = '<html><body><img src="/img/a.png"><a href="/next">n</a></body></html>' } = {}) {
  const boundary = '----MultipartBoundary--XYZ----';
  let encodedBody = body;
  if (encoding === 'base64') encodedBody = Buffer.from(body, 'utf8').toString('base64');
  return [
    'From: <Saved by Blink>',
    'Snapshot-Content-Location: ' + url,
    'Subject: Test Page',
    'MIME-Version: 1.0',
    `Content-Type: multipart/related; type="text/html"; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html',
    `Content-Transfer-Encoding: ${encoding}`,
    'Content-Location: ' + url,
    '',
    encodedBody,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

describe('Chromes.mhtToHtmConvert', () => {
  it('converts an 8bit MHT to .html, rewrites relative links and keeps the source', async () => {
    const mht = path.join(tmp, 'page.mhtml');
    fs.writeFileSync(mht, buildMht(), 'binary');

    const out = await Chromes.mhtToHtmConvert(mht, false);

    expect(out).toBe(path.join(tmp, 'page.html'));
    const html = fs.readFileSync(out, 'utf8');
    expect(html).toContain('<!-- Content-Location: https://example.com/article -->');
    // relative img/href resolved against origin / full URL
    expect(html).toContain('https://example.com/img/a.png');
    expect(html).toContain('https://example.com/next');
    // deleteMht=false keeps the source
    expect(fs.existsSync(mht)).toBe(true);
  });

  it('decodes a base64 HTML part', async () => {
    const mht = path.join(tmp, 'b64.mhtml');
    fs.writeFileSync(mht, buildMht({ encoding: 'base64', body: '<html><body>Hello B64 World</body></html>' }), 'binary');

    const out = await Chromes.mhtToHtmConvert(mht, false);
    expect(fs.readFileSync(out, 'utf8')).toContain('Hello B64 World');
  });

  it('decodes a quoted-printable HTML part via libqp', async () => {
    // "café=" soft break edge — encode é as =C3=A9 and a trailing soft line break
    const qpBody = '<html><body>caf=C3=A9 and=\r\n more text</body></html>';
    const mht = path.join(tmp, 'qp.mhtml');
    fs.writeFileSync(mht, buildMht({ encoding: 'quoted-printable', body: qpBody }), 'binary');

    const out = await Chromes.mhtToHtmConvert(mht, false);
    const html = fs.readFileSync(out, 'utf8');
    expect(html).toContain('café and more text');
  });

  it('deletes the source MHT when deleteMht and resulting html > 1024 bytes', async () => {
    const big = '<html><body>' + 'x'.repeat(2000) + '</body></html>';
    const mht = path.join(tmp, 'big.mhtml');
    fs.writeFileSync(mht, buildMht({ body: big }), 'binary');

    const out = await Chromes.mhtToHtmConvert(mht, true);
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.existsSync(mht)).toBe(false);
  });

  it('returns null and warns when the file does not exist', async () => {
    const out = await Chromes.mhtToHtmConvert(path.join(tmp, 'missing.mhtml'));
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns null when no MIME boundary is present', async () => {
    const mht = path.join(tmp, 'noboundary.mhtml');
    fs.writeFileSync(mht, 'Snapshot-Content-Location: https://x.com/\r\n\r\nplain text, no boundary', 'binary');
    const out = await Chromes.mhtToHtmConvert(mht, false);
    expect(out).toBeNull();
  });
});

// =============================================================================
// convertFolderMhtToHtm (drives mhtToHtmConvert over Files.findRecursiveFull)
// =============================================================================
describe('Chromes.convertFolderMhtToHtm', () => {
  it('converts every .mhtml found in the folder', async () => {
    const folder = path.join(tmp, 'folder');
    fs.mkdirSync(folder, { recursive: true });
    const m1 = path.join(folder, 'one.mhtml');
    const m2 = path.join(folder, 'two.mhtml');
    fs.writeFileSync(m1, buildMht({ url: 'https://a.com/1' }), 'binary');
    fs.writeFileSync(m2, buildMht({ url: 'https://a.com/2' }), 'binary');
    config.__found = [m1, m2];

    await Chromes.convertFolderMhtToHtm(folder, false);

    expect(fs.existsSync(path.join(folder, 'one.html'))).toBe(true);
    expect(fs.existsSync(path.join(folder, 'two.html'))).toBe(true);
  });

  it('warns and returns when the folder does not exist', async () => {
    await Chromes.convertFolderMhtToHtm(path.join(tmp, 'nope'), false);
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('keeps going when one file fails to convert', async () => {
    const folder = path.join(tmp, 'folder2');
    fs.mkdirSync(folder, { recursive: true });
    const good = path.join(folder, 'good.mhtml');
    const bad = path.join(folder, 'bad.mhtml');
    fs.writeFileSync(good, buildMht({ url: 'https://a.com/g' }), 'binary');
    fs.writeFileSync(bad, 'broken, no boundary', 'binary'); // returns null, no throw
    config.__found = [bad, good];

    await Chromes.convertFolderMhtToHtm(folder, false);
    expect(fs.existsSync(path.join(folder, 'good.html'))).toBe(true);
  });
});

// =============================================================================
// saveHtmlFromMht (network: undici fetch is mocked)
// =============================================================================
describe('Chromes.saveHtmlFromMht', () => {
  it('downloads HTML for the MHT URL, rewrites links and writes .html', async () => {
    const mht = path.join(tmp, 'live.mhtml');
    fs.writeFileSync(mht, 'Snapshot-Content-Location: https://example.com/post\r\n', 'utf8');
    undiciFetch.mockResolvedValue(textResponse('<html><body><img src="/p.png"><a href="/n">n</a></body></html>'));

    const out = await Chromes.saveHtmlFromMht(mht, false);

    expect(out).toBe(path.join(tmp, 'live.html'));
    expect(undiciFetch).toHaveBeenCalledWith('https://example.com/post', expect.objectContaining({ method: 'GET' }));
    const html = fs.readFileSync(out, 'utf8');
    expect(html).toContain('<!-- Content-Location: https://example.com/post -->');
    expect(html).toContain('https://example.com/p.png');
    expect(html).toContain('https://example.com/n');
  });

  it('returns null and warns when the downloaded page is an Incapsula block', async () => {
    const mht = path.join(tmp, 'blocked.mhtml');
    fs.writeFileSync(mht, 'Snapshot-Content-Location: https://example.com/b\r\n', 'utf8');
    undiciFetch.mockResolvedValue(textResponse('<html>Incapsula incident id</html>'));

    const out = await Chromes.saveHtmlFromMht(mht, false);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns null when the MHT file is missing', async () => {
    const out = await Chromes.saveHtmlFromMht(path.join(tmp, 'gone.mhtml'));
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('returns null when the MHT has no URL to fetch', async () => {
    const mht = path.join(tmp, 'nolink.mhtml');
    fs.writeFileSync(mht, 'no location header at all', 'utf8');
    const out = await Chromes.saveHtmlFromMht(mht, false);
    expect(out).toBeNull();
    expect(undiciFetch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// processPathsToClipboard (clip via dynamic child_process import)
// =============================================================================
describe('Chromes.processPathsToClipboard', () => {
  it('collects URLs from passed MHT files and pipes them to clip', async () => {
    const m1 = path.join(tmp, 'p1.mht');
    const m2 = path.join(tmp, 'p2.mht');
    fs.writeFileSync(m1, 'Snapshot-Content-Location: https://a.com/1\r\n', 'utf8');
    fs.writeFileSync(m2, 'Snapshot-Content-Location: https://a.com/2\r\n', 'utf8');

    await Chromes.processPathsToClipboard([m1, m2]);

    expect(spawnSync).toHaveBeenCalledTimes(1);
    const [cmd, opts] = spawnSync.mock.calls[0];
    expect(cmd).toBe('clip');
    expect(opts.input).toBe('https://a.com/1\nhttps://a.com/2');
  });

  it('accepts a single path (auto-wraps to array)', async () => {
    const m1 = path.join(tmp, 'solo.mht');
    fs.writeFileSync(m1, 'Snapshot-Content-Location: https://a.com/solo\r\n', 'utf8');

    await Chromes.processPathsToClipboard(m1);

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync.mock.calls[0][1].input).toBe('https://a.com/solo');
  });

  it('scans a directory recursively via Files.findRecursiveFull', async () => {
    const folder = path.join(tmp, 'dir');
    fs.mkdirSync(folder, { recursive: true });
    const m1 = path.join(folder, 'deep.mht');
    fs.writeFileSync(m1, 'Snapshot-Content-Location: https://a.com/deep\r\n', 'utf8');
    config.__found = [m1];

    await Chromes.processPathsToClipboard(folder);

    expect(FilesMock.findRecursiveFull).toHaveBeenCalled();
    expect(spawnSync.mock.calls[0][1].input).toBe('https://a.com/deep');
  });

  it('warns and copies nothing when no MHTML/HTML files are present', async () => {
    const folder = path.join(tmp, 'empty');
    fs.mkdirSync(folder, { recursive: true });
    config.__found = [];

    await Chromes.processPathsToClipboard(folder);

    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });

  it('warns when files exist but contain no extractable URLs', async () => {
    const m1 = path.join(tmp, 'nourl.mht');
    fs.writeFileSync(m1, 'plain text, no location', 'utf8');

    await Chromes.processPathsToClipboard([m1]);

    expect(DialogsMock.warningBox).toHaveBeenCalled();
    expect(spawnSync).not.toHaveBeenCalled();
  });
});

// =============================================================================
// initFolders (sets globalThis paths, makes dirs)
// =============================================================================
describe('Chromes.initFolders', () => {
  it('derives every save/mhtml directory from the app path and creates them', () => {
    const appPath = path.join(tmp, 'project', 'app.exe');
    fs.mkdirSync(path.dirname(appPath), { recursive: true });

    Chromes.initFolders(appPath);

    const saveDir = path.dirname(appPath);
    expect(globalThis.app).toBe(appPath);
    expect(globalThis.saveDir).toBe(saveDir);
    expect(globalThis.mhtmlDir).toBe(path.join(saveDir, '- Theory'));
    expect(globalThis.saveDirApp).toBe(path.join(saveDir, '#APP'));
    expect(globalThis.saveDirMht).toBe(path.join(saveDir, '#MHT'));
    expect(globalThis.saveDirUrl).toBe(path.join(saveDir, '#URL'));
    // the leaf dirs that get created
    expect(FilesMock.mkdirIfNotExists).toHaveBeenCalledWith(path.join(saveDir, '- Theory', 'Page'));
    expect(FilesMock.mkdirIfNotExists).toHaveBeenCalledWith(path.join(saveDir, '#URL'));
  });
});

// =============================================================================
// runIxbrowser (puppeteer-core.launch — config-driven arg building)
// =============================================================================
describe('Chromes.runIxbrowser', () => {
  function writeCmdTxt(dir) {
    fs.mkdirSync(dir, { recursive: true });
    const txt = path.join(dir, 'profile.txt');
    fs.writeFileSync(
      txt,
      '[FULL] "C:\\Chrome\\chrome.exe" --load-extension=C:\\ext\\crx --window-size=800,600',
      'utf8',
    );
    return txt;
  }

  it('parses the chrome.exe + extension from the cmd txt and launches puppeteer-core', async () => {
    const dir = path.join(tmp, 'cmd');
    const txt = writeCmdTxt(dir);
    config.__currentDir = tmp;
    config.__txtPath = txt;
    config['Headless'] = 'true';
    config['protocolTimeout'] = '60000';

    const result = await Chromes.runIxbrowser(false);

    expect(result).toBe(browser);
    expect(coreLaunch).toHaveBeenCalledTimes(1);
    const opts = coreLaunch.mock.calls[0][0];
    expect(opts.headless).toBe(true);
    expect(opts.executablePath).toMatch(/chrome\.exe$/i);
    expect(opts.args).toContain('--no-sandbox');
    expect(opts.args.some((a) => a.startsWith('--load-extension='))).toBe(true);
    expect(opts.protocolTimeout).toBe(60000);
  });

  it('uses the cmdGo folder + HeadlessGo config when isCmdGo is true', async () => {
    const dir = path.join(tmp, 'cmdGo');
    const txt = writeCmdTxt(dir);
    config.__currentDir = tmp;
    config.__txtPath = txt;
    config['HeadlessGo'] = 'false';
    config['protocolTimeout'] = '1000';

    await Chromes.runIxbrowser(true);

    // pickRandomFile must be asked for the cmdGo folder
    expect(FilesMock.pickRandomFile).toHaveBeenCalledWith(path.join(tmp, 'cmdGo'), '.txt');
    expect(coreLaunch.mock.calls[0][0].headless).toBe(false);
  });

  it('throws when no chrome.exe is found in the config text', async () => {
    const dir = path.join(tmp, 'cmd');
    fs.mkdirSync(dir, { recursive: true });
    const txt = path.join(dir, 'bad.txt');
    fs.writeFileSync(txt, '[FULL] --some-flag --load-extension=C:\\ext', 'utf8');
    config.__currentDir = tmp;
    config.__txtPath = txt;

    await expect(Chromes.runIxbrowser(false)).rejects.toThrow(/chrome\.exe/);
  });

  it('throws when no extension is configured', async () => {
    const dir = path.join(tmp, 'cmd');
    fs.mkdirSync(dir, { recursive: true });
    const txt = path.join(dir, 'noext.txt');
    fs.writeFileSync(txt, '[FULL] "C:\\Chrome\\chrome.exe" --window-size=800,600', 'utf8');
    config.__currentDir = tmp;
    config.__txtPath = txt;

    await expect(Chromes.runIxbrowser(false)).rejects.toThrow(/Extension/);
  });
});

// =============================================================================
// runBrowser (orchestrates runIxbrowser + newPage + pageSetup)
// =============================================================================
describe('Chromes.runBrowser', () => {
  function primeCmd() {
    const dir = path.join(tmp, 'cmd');
    fs.mkdirSync(dir, { recursive: true });
    const txt = path.join(dir, 'profile.txt');
    fs.writeFileSync(txt, '[FULL] "C:\\Chrome\\chrome.exe" --load-extension=C:\\ext\\crx', 'utf8');
    config.__currentDir = tmp;
    config.__txtPath = txt;
    config['protocolTimeout'] = '1000';
    config['Headless'] = 'true';
  }

  it('launches a browser, opens a page and runs pageSetup (pageCloseBeforeGo off)', async () => {
    primeCmd();
    config['pageCloseBeforeGo'] = 'false';
    config['setDefaultTimeout'] = '1000';
    config['setDefaultNavigationTimeout'] = '2000';

    await Chromes.runBrowser(false, false);

    expect(globalThis.browser).toBe(browser);
    expect(browser.newPage).toHaveBeenCalledTimes(1);
    expect(page.setViewport).toHaveBeenCalledWith({ width: 1280, height: 900 });
  });

  it('returns early without relaunching when a browser already exists and not cmdGo', async () => {
    globalThis.browser = browser;
    await Chromes.runBrowser(false, false);
    expect(coreLaunch).not.toHaveBeenCalled();
    expect(browser.newPage).not.toHaveBeenCalled();
  });

  it('hides chrome when hideChrome arg is true', async () => {
    primeCmd();
    config['pageCloseBeforeGo'] = 'false';
    config['setDefaultTimeout'] = '1000';
    config['setDefaultNavigationTimeout'] = '2000';

    await Chromes.runBrowser(false, true);
    expect(exec).toHaveBeenCalledWith(expect.stringContaining('hide'), expect.any(Function));
  });

  it('closes existing browsers first when isCmdGo is true', async () => {
    primeCmd();
    config['pageCloseBeforeGo'] = 'true'; // skip page creation branch
    globalThis.browser = browser;

    await Chromes.runBrowser(true, false);
    expect(browser.close).toHaveBeenCalled();
  });
});

// =============================================================================
// pageGo
// =============================================================================
describe('Chromes.pageGo', () => {
  it('navigates the existing page to the URL with the given params', async () => {
    config['pageCloseBeforeGo'] = 'false';
    globalThis.browser = browser;
    globalThis.page = page;

    await Chromes.pageGo('https://example.com', { waitUntil: 'load' });

    expect(page.goto).toHaveBeenCalledWith('https://example.com', { waitUntil: 'load' });
  });

  it('opens a fresh page when pageCloseBeforeGo is true and closes the old one', async () => {
    config['pageCloseBeforeGo'] = 'true';
    config['setDefaultTimeout'] = '1000';
    config['setDefaultNavigationTimeout'] = '2000';
    globalThis.browser = browser;
    globalThis.page = page;

    await Chromes.pageGo('https://example.com/new');

    expect(page.close).toHaveBeenCalled();
    expect(browser.newPage).toHaveBeenCalled();
    expect(page.goto).toHaveBeenCalledWith('https://example.com/new', { waitUntil: 'networkidle2' });
  });

  it('swallows a goto failure and invokes its recovery runBrowser path', async () => {
    config['pageCloseBeforeGo'] = 'false';
    globalThis.browser = browser;
    globalThis.page = page;
    globalThis.isCmdGo = false;
    page.goto.mockRejectedValueOnce(new Error('net::ERR'));

    // pageGo catches the goto error and calls runBrowser(isCmdGo,...). With a
    // browser already present and isCmdGo falsy, runBrowser returns early (no
    // relaunch) — the important contract is that pageGo does not throw and the
    // navigation was attempted.
    await expect(Chromes.pageGo('https://example.com/err')).resolves.toBeUndefined();
    expect(page.goto).toHaveBeenCalledWith('https://example.com/err', { waitUntil: 'networkidle2' });
    expect(coreLaunch).not.toHaveBeenCalled();
  });
});

// =============================================================================
// pageSetup
// =============================================================================
describe('Chromes.pageSetup', () => {
  it('sets viewport and the configured timeouts', async () => {
    config['setDefaultTimeout'] = '11000';
    config['setDefaultNavigationTimeout'] = '22000';
    config['debugMode'] = 'false';
    globalThis.page = makePuppeteerPage({
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
    });

    await Chromes.pageSetup();

    expect(globalThis.page.setViewport).toHaveBeenCalledWith({ width: 1280, height: 900 });
    expect(globalThis.page.setDefaultTimeout).toHaveBeenCalledWith(11000);
    expect(globalThis.page.setDefaultNavigationTimeout).toHaveBeenCalledWith(22000);
  });

  it('wires debug console listeners when debugMode is true', async () => {
    config['setDefaultTimeout'] = '1000';
    config['setDefaultNavigationTimeout'] = '2000';
    config['debugMode'] = 'true';
    globalThis.page = makePuppeteerPage({
      setDefaultTimeout: jest.fn(),
      setDefaultNavigationTimeout: jest.fn(),
    });

    await Chromes.pageSetup();
    expect(globalThis.page.on).toHaveBeenCalledWith('console', expect.any(Function));
    expect(globalThis.page.on).toHaveBeenCalledWith('pageerror', expect.any(Function));
  });
});

// =============================================================================
// cleanCache (CDP session)
// =============================================================================
describe('Chromes.cleanCache', () => {
  it('opens a CDP session and clears browser cache + origin storage', async () => {
    const send = jest.fn(async () => {});
    const createCDPSession = jest.fn(async () => ({ send }));
    globalThis.page = makePuppeteerPage({
      target: jest.fn(() => ({ createCDPSession })),
      url: jest.fn(() => 'https://example.com/here'),
    });

    await Chromes.cleanCache();

    expect(createCDPSession).toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith('Network.clearBrowserCache');
    expect(send).toHaveBeenCalledWith('Storage.clearDataForOrigin', {
      origin: 'https://example.com/here',
      storageTypes: 'all',
    });
  });
});

// =============================================================================
// pageMetrics
// =============================================================================
describe('Chromes.pageMetrics', () => {
  it('reads page.metrics() without throwing', async () => {
    const metrics = jest.fn(async () => ({ JSHeapUsedSize: 123 }));
    globalThis.page = makePuppeteerPage({ metrics });
    await Chromes.pageMetrics();
    expect(metrics).toHaveBeenCalled();
  });
});

// =============================================================================
// closeBrowsers / finish
// =============================================================================
describe('Chromes.closeBrowsers', () => {
  it('closes the global browser when present', async () => {
    globalThis.browser = browser;
    await Chromes.closeBrowsers();
    expect(browser.close).toHaveBeenCalled();
  });

  it('is a no-op when there is no global browser', async () => {
    await expect(Chromes.closeBrowsers()).resolves.toBeUndefined();
    expect(browser.close).not.toHaveBeenCalled();
  });
});

describe('Chromes.finish', () => {
  it('closes browsers', async () => {
    globalThis.browser = browser;
    await Chromes.finish();
    expect(browser.close).toHaveBeenCalled();
  });
});

// =============================================================================
// nircmd shell-out helpers: killChrome / closeChrome / hideChrome / showChrome
// =============================================================================
describe('Chromes nircmd shell-outs', () => {
  it('killChrome runs nircmd win kill', async () => {
    await Chromes.killChrome();
    expect(exec).toHaveBeenCalledWith('nircmd win kill ititle "chromium"', expect.any(Function));
  });

  it('closeChrome runs nircmd win close', async () => {
    await Chromes.closeChrome();
    expect(exec).toHaveBeenCalledWith('nircmd win close ititle "chromium"', expect.any(Function));
  });

  it('hideChrome runs nircmd win hide', async () => {
    await Chromes.hideChrome();
    expect(exec).toHaveBeenCalledWith('nircmd win hide ititle "Chromium"', expect.any(Function));
  });

  it('showChrome runs nircmd win show', async () => {
    await Chromes.showChrome();
    expect(exec).toHaveBeenCalledWith('nircmd win show ititle "Chromium"', expect.any(Function));
  });

  it('the exec callback logs and swallows an error without throwing', async () => {
    await Chromes.hideChrome();
    const cb = exec.mock.calls[0][1];
    // exercise both error and success branches of the callback
    expect(() => cb(new Error('boom'), '', '')).not.toThrow();
    expect(() => cb(null, 'ok-stdout', 'some-stderr')).not.toThrow();
  });
});

// =============================================================================
// fetcher (undici fetch + JSON cache)
// =============================================================================
describe('Chromes.fetcher', () => {
  it('fetches JSON from the network and writes it to the cache', async () => {
    undiciFetch.mockResolvedValue(jsonResponse({ hello: 'world' }));

    const body = await Chromes.fetcher('https://api.example.com/v1/data', { method: 'GET' }, 'owner1');

    expect(body).toEqual({ hello: 'world' });
    expect(undiciFetch).toHaveBeenCalledWith('https://api.example.com/v1/data', { method: 'GET' });
    expect(FilesMock.writeJson).toHaveBeenCalled();
    // cached under <cacheDir>/<domain>/<owner>/<name>.json
    const [cacheFile] = FilesMock.writeJson.mock.calls[0];
    expect(cacheFile).toContain(path.join('api.example.com', 'owner1'));
    expect(cacheFile.endsWith('.json')).toBe(true);
  });

  it('returns the cached JSON when a fresh cache file exists', async () => {
    // first call populates the cache for real (writeJson mock writes the file)
    undiciFetch.mockResolvedValue(jsonResponse({ n: 1 }));
    await Chromes.fetcher('https://api.example.com/c', { method: 'GET' }, 'own', Chromes.Duration.Hour10);

    undiciFetch.mockClear();
    undiciFetch.mockResolvedValue(jsonResponse({ n: 999 }));
    const second = await Chromes.fetcher('https://api.example.com/c', { method: 'GET' }, 'own', Chromes.Duration.Hour10);

    expect(second).toEqual({ n: 1 });           // served from cache, not the network
    expect(undiciFetch).not.toHaveBeenCalled();  // no network hit on the 2nd call
  });

  it('always hits the network when duration is noCache', async () => {
    undiciFetch.mockResolvedValue(jsonResponse({ fresh: true }));
    const out = await Chromes.fetcher('https://api.example.com/nc', { method: 'GET' }, 'own', Chromes.Duration.noCache);
    expect(out).toEqual({ fresh: true });
    expect(undiciFetch).toHaveBeenCalled();
    expect(FilesMock.writeJson).not.toHaveBeenCalled(); // noCache → not persisted
  });

  it('warns (returns null) on a non-ok response', async () => {
    undiciFetch.mockResolvedValue(jsonResponse({}, { ok: false, status: 503, statusText: 'Down' }));
    const out = await Chromes.fetcher('https://api.example.com/err', { method: 'GET' }, 'own', Chromes.Duration.noCache);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('errors (returns null) when fetch throws', async () => {
    undiciFetch.mockRejectedValue(new Error('network down'));
    const out = await Chromes.fetcher('https://api.example.com/throw', { method: 'GET' }, 'own', Chromes.Duration.noCache);
    expect(out).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });
});

// =============================================================================
// download (undici fetch → binary file cache)
// =============================================================================
describe('Chromes.download', () => {
  it('downloads a binary file and writes it to the cache, returning the path', async () => {
    undiciFetch.mockResolvedValue(bufferResponse(Buffer.from('PDFDATA')));

    const out = await Chromes.download('https://files.example.com/a/doc', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.noCache);

    expect(typeof out).toBe('string');
    expect(out.endsWith('.pdf')).toBe(true);
    expect(out).toContain(path.join('files.example.com', 'own'));
    expect(fs.existsSync(out)).toBe(true);
    expect(fs.readFileSync(out, 'utf8')).toBe('PDFDATA');
  });

  it('returns the cached file path when a fresh cache exists', async () => {
    undiciFetch.mockResolvedValue(bufferResponse(Buffer.from('ORIGINAL')));
    const first = await Chromes.download('https://files.example.com/b/doc', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.Hour10);

    undiciFetch.mockClear();
    const second = await Chromes.download('https://files.example.com/b/doc', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.Hour10);

    expect(second).toBe(first);
    expect(undiciFetch).not.toHaveBeenCalled();
  });

  it('warns (returns null) on a non-ok response', async () => {
    undiciFetch.mockResolvedValue(bufferResponse(Buffer.from(''), { ok: false, status: 404, statusText: 'NF' }));
    const out = await Chromes.download('https://files.example.com/x/y', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.noCache);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('warns (returns null) when the downloaded buffer is empty', async () => {
    undiciFetch.mockResolvedValue(bufferResponse(Buffer.alloc(0)));
    const out = await Chromes.download('https://files.example.com/e/empty', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.noCache);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('errors (returns null) when fetch throws', async () => {
    undiciFetch.mockRejectedValue(new Error('boom'));
    const out = await Chromes.download('https://files.example.com/t/throw', { method: 'GET' }, 'own', 'pdf', Chromes.Duration.noCache);
    expect(out).toBeNull();
    expect(DialogsMock.errorBox).toHaveBeenCalled();
  });
});
