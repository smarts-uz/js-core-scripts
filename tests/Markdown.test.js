// Unit tests for utils/Markdown.js — public methods convertToWord,
// convertToWordTOC, convertToHtml, merge.
//
// Strategy (per tests/README.md):
//  - `marked` is real (installed) and runs for real so we assert genuine HTML.
//  - The two marked plugins it imports (marked-footnote, marked-katex-extension)
//    and `katex` are NOT installed, so they are stubbed as no-op marked
//    extensions on the bare specifier — otherwise the module fails to import.
//  - winax (Word COM) is mocked with makeWinaxMock(); we assert the boundary
//    calls and the returned .docx path, never launching real Word.
//  - Sibling utils are mocked at their absolute path: Yamls.js
//    (config), Files.js (real fs helpers), Dialogs.js (UI spies).
//  - fs runs for real against throwaway temp directories.
import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { makeTmpDir, cleanupAllTmpDirs, writeTree, read, exists } from './helpers/tmp.js';
import { makeWinaxMock, makeComProxy } from './helpers/mocks.js';
import { utilsModule } from './helpers/esm.js';

// --- config-backed mock store ------------------------------------------------
const config = {};
const YamlsMock = {
  getConfig: jest.fn((key, _type = null, def = null) => (key in config ? config[key] : def)),
  setConfig: jest.fn((key, value) => { config[key] = value; }),
};

// --- Files: real fs-backed helpers (mirrors the genuine implementations) ------
const FilesMock = {
  incrementFileName: jest.fn((filePath) => {
    if (!fs.existsSync(filePath)) return filePath;
    const parsed = path.parse(filePath);
    let baseName = parsed.name;
    let counter = 1;
    const m = baseName.match(/^(.*?)\s+(\d+)$/);
    if (m) { baseName = m[1]; counter = parseInt(m[2], 10); }
    let np = filePath;
    while (fs.existsSync(np)) {
      np = path.join(parsed.dir, `${baseName} ${counter}${parsed.ext}`);
      counter++;
    }
    return np;
  }),
  getBaseName: jest.fn((filePath, ext) => path.basename(filePath, ext)),
  mkdirIfNotExists: jest.fn((d) => fs.mkdirSync(d, { recursive: true })),
  // Folder mode: pick the latest "Basename N" file with the given ext from a
  // folder. Mirrors the real Files.getLatestMatchingFile signature; tests only
  // exercise the missing-folder path (template tests point the config at a
  // non-existent path), so a not-found returns null like the real helper.
  getLatestMatchingFile: jest.fn((folder, ext = null) => {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) return null;
    const entries = fs.readdirSync(folder)
      .filter((f) => (ext ? f.toLowerCase().endsWith(ext.toLowerCase()) : true))
      .sort();
    return entries.length ? path.join(folder, entries[entries.length - 1]) : null;
  }),
  currentDir: jest.fn(() => workDir),
};

const DialogsMock = {
  // warningBox returns null like the real one (callers rely on that).
  warningBox: jest.fn(() => null),
  errorBox: jest.fn(() => null),
  messageBox: jest.fn(),
  inputBox: jest.fn(),
};

// no-op marked extensions for the two uninstalled plugins.
jest.unstable_mockModule('marked-footnote', () => ({ default: () => ({}) }));
jest.unstable_mockModule('marked-katex-extension', () => ({ default: () => ({}) }));

// Single winax mock instance so tests can tweak the COM object per call via
// winaxMock.Object.mockImplementationOnce(...). By default each
// `new winax.Object('Word.Application')` yields an auto-chaining COM proxy.
const winaxMock = makeWinaxMock();
jest.unstable_mockModule('winax', () => winaxMock);
jest.unstable_mockModule(utilsModule('Yamls.js'), () => ({ Yamls: YamlsMock }));
jest.unstable_mockModule(utilsModule('Files.js'), () => ({ Files: FilesMock }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: DialogsMock }));

const { Markdown } = await import('../utils/Markdown.js');

let workDir;
let savedFetch;

beforeEach(() => {
  workDir = makeTmpDir('md-test-');
  for (const k of Object.keys(config)) delete config[k];
  // _postProcessHtml downloads every remote <img> via global fetch — a network
  // boundary. Stub it to a non-ok response by default so no real request fires
  // and _downloadImage returns null (keeping the original URL). Individual
  // tests can override global.fetch for an ok response.
  savedFetch = global.fetch;
  global.fetch = jest.fn(async () => ({
    ok: false,
    status: 404,
    headers: { get: () => '' },
    arrayBuffer: async () => new ArrayBuffer(0),
  }));
});

afterEach(() => {
  global.fetch = savedFetch;
  cleanupAllTmpDirs();
  jest.clearAllMocks();
});

/** Write a .md file in workDir and return its absolute path. */
function writeMd(name, content) {
  const p = path.join(workDir, name);
  fs.writeFileSync(p, content, 'utf8');
  return p;
}

describe('Markdown.convertToHtml', () => {
  it('renders headings and lists to an HTML file under HTM/ and returns its path', async () => {
    const md = writeMd('doc.md', '# Title\n\n## Sub\n\n- one\n- two\n\nText with **bold**.\n');

    const out = await Markdown.convertToHtml(md);

    expect(out).toBe(path.join(workDir, 'HTM', 'doc.html'));
    expect(fs.existsSync(out)).toBe(true);
    const html = read(workDir, 'HTM', 'doc.html');
    expect(html).toInclude('<!DOCTYPE html>');
    expect(html).toInclude('<title>doc</title>');
    expect(html).toInclude('<h1>Title</h1>');
    expect(html).toInclude('<h2>Sub</h2>');
    expect(html).toInclude('<li>one</li>');
    expect(html).toInclude('<li>two</li>');
    expect(html).toInclude('<strong>bold</strong>');
  });

  it('rewrites a relative <img> src to an absolute path (post-processing)', async () => {
    const md = writeMd('img.md', '![pic](assets/pic.png)\n');
    const out = await Markdown.convertToHtml(md);
    const html = fs.readFileSync(out, 'utf8');
    const expectedAbs = path.resolve(workDir, 'assets/pic.png');
    expect(html).toInclude(`src="${expectedAbs}"`);
  });

  it('leaves a remote http(s) <img> src untouched when the download fails', async () => {
    // _postProcessHtml attempts to download every remote <img>; the stubbed
    // fetch returns a non-ok response, so _downloadImage returns null and the
    // original remote URL is preserved verbatim in the output.
    const md = writeMd('imgabs.md', '![pic](https://example.com/p.png)\n');
    const out = await Markdown.convertToHtml(md);
    const html = fs.readFileSync(out, 'utf8');
    expect(global.fetch).toHaveBeenCalledWith('https://example.com/p.png');
    expect(html).toInclude('src="https://example.com/p.png"');
  });

  it('warns and returns the warningBox result when the file is missing', async () => {
    const out = await Markdown.convertToHtml(path.join(workDir, 'nope.md'));
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledTimes(1);
    expect(DialogsMock.warningBox.mock.calls[0][1]).toBe('convertToHtml');
  });
});

describe('Markdown.merge', () => {
  it('merges multiple .md files into <folder> 1.md with N blank lines between', () => {
    const a = writeMd('a.md', 'Alpha');
    const b = writeMd('b.md', 'Beta');

    const out = Markdown.merge([a, b], 2);

    const folderName = path.basename(workDir);
    expect(out).toBe(path.join(workDir, `${folderName} 1.md`));
    // separator = '\n'.repeat(2 + 1) = three newlines between the two parts
    expect(fs.readFileSync(out, 'utf8')).toBe('Alpha\n\n\nBeta');
  });

  it('reads lineBetween from config when the arg is null', () => {
    config['Markdown.LineBetween'] = 1;
    const a = writeMd('x.md', 'X');
    const b = writeMd('y.md', 'Y');
    const out = Markdown.merge([a, b]);
    // 1 + 1 = two newlines
    expect(fs.readFileSync(out, 'utf8')).toBe('X\n\nY');
  });

  it('auto-increments the output name on a second merge', () => {
    const a = writeMd('one.md', '1');
    const b = writeMd('two.md', '2');
    const first = Markdown.merge([a, b], 0);
    const second = Markdown.merge([a, b], 0);
    const folderName = path.basename(workDir);
    expect(path.basename(first)).toBe(`${folderName} 1.md`);
    expect(path.basename(second)).toBe(`${folderName} 2.md`);
  });

  it('returns undefined for a non-array / empty input without touching disk', () => {
    expect(Markdown.merge([])).toBeUndefined();
    expect(Markdown.merge(null)).toBeUndefined();
    expect(DialogsMock.warningBox).not.toHaveBeenCalled();
  });

  it('warns (returns null) when one of the files does not exist', () => {
    const a = writeMd('present.md', 'P');
    const out = Markdown.merge([a, path.join(workDir, 'absent.md')]);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledTimes(1);
  });
});

describe('Markdown.convertToWord', () => {
  beforeEach(() => {
    // a real (empty) template file so the existence check passes and copy works
    const tpl = path.join(workDir, 'template.docx');
    fs.writeFileSync(tpl, 'TEMPLATE', 'utf8');
    config['Templates.WordMd'] = tpl;
  });

  it('builds the .docx under DOC/, drives Word COM and returns the docx path', async () => {
    const md = writeMd('paper.md', '# Heading\n\nBody text.\n');

    const out = await Markdown.convertToWord(md, false); // skip PDF for this case

    expect(out).toBe(path.join(workDir, 'DOC', 'paper.docx'));
    expect(fs.existsSync(out)).toBe(true);
    // the temp HTML scratch file is cleaned up in the finally block
    const leftover = fs.readdirSync(workDir).filter((f) => f.includes('_temp_'));
    expect(leftover).toHaveLength(0);
  });

  it('exports a PDF when genPdf is true (default), creating a PDF/ folder', async () => {
    const md = writeMd('withpdf.md', '# H\n');
    const out = await Markdown.convertToWord(md); // genPdf defaults to true
    expect(out).toBe(path.join(workDir, 'DOC', 'withpdf.docx'));
    // _exportDocToPdf ensures the PDF directory exists
    expect(fs.existsSync(path.join(workDir, 'PDF'))).toBe(true);
  });

  it('warns and returns null when the source markdown is missing', async () => {
    const out = await Markdown.convertToWord(path.join(workDir, 'nope.md'));
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledTimes(1);
  });

  it('warns and returns null when the template is missing', async () => {
    config['Templates.WordMd'] = path.join(workDir, 'no-template.docx');
    const md = writeMd('t.md', '# H\n');
    const out = await Markdown.convertToWord(md, false);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });
});

describe('Markdown.convertToWordTOC', () => {
  beforeEach(() => {
    const tpl = path.join(workDir, 'toc-template.docx');
    fs.writeFileSync(tpl, 'TOC TEMPLATE', 'utf8');
    config['Templates.WordMdTOC'] = tpl;
  });

  it('builds the .docx under DOC/ via the TOC template and returns its path', async () => {
    const md = writeMd('thesis.md', '# Chapter\n\nProse.\n');

    const out = await Markdown.convertToWordTOC(md, false);

    expect(out).toBe(path.join(workDir, 'DOC', 'thesis.docx'));
    expect(fs.existsSync(out)).toBe(true);
  });

  it('warns and returns null when the {Content} placeholder is not found', async () => {
    // Pin the NEXT Word.Application COM object so Selection.Find.Execute()
    // returns 0 (falsey) → the not-found branch closes the doc and warns.
    winaxMock.Object.mockImplementationOnce(() =>
      makeComProxy({
        Selection: {
          HomeKey: () => {},
          Find: { ClearFormatting: () => {}, Replacement: {}, Execute: () => 0 },
        },
      }, 'Word.Application'),
    );
    const md = writeMd('noph.md', '# H\n');

    const out = await Markdown.convertToWordTOC(md, false);

    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledTimes(1);
    // insertFn returns false (placeholder missing); _convertToWordCore surfaces
    // a generic "Content insertion failed" dialog — the "{Content}" text only
    // appears in the console.warn inside the insertFn, not the warningBox arg.
    expect(DialogsMock.warningBox.mock.calls[0][0]).toInclude('Content insertion failed');
  });

  it('warns and returns null when the TOC template is missing', async () => {
    config['Templates.WordMdTOC'] = path.join(workDir, 'missing.docx');
    const md = writeMd('m.md', '# H\n');
    const out = await Markdown.convertToWordTOC(md, false);
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalled();
  });

  it('warns and returns null when the source markdown is missing', async () => {
    const out = await Markdown.convertToWordTOC(path.join(workDir, 'nope.md'));
    expect(out).toBeNull();
    expect(DialogsMock.warningBox).toHaveBeenCalledTimes(1);
  });
});
