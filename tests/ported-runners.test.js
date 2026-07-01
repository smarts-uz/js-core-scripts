// Tests for the hand-written, self-contained runners that replaced the deleted
// cmd/ sub-projects (cmd/js-scraper-olx.uz → runs/Olx/*, cmd/js-winax-contract →
// runs/Word|Yamls|Excels/contract*). These are NOT reflection-generated, so
// runs-generate.test.js does not cover their content — this file asserts they:
//   1. exist and parse as valid ESM,
//   2. import their utils from '../../utils/…' (call utils directly),
//   3. contain NO reference to a deleted cmd/ path or a spawned child process,
//   4. invoke the exact utils methods each ported feature is defined by.
import { describe, it, expect } from '@jest/globals';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

// import.meta.dirname is undefined under jest's experimental-vm-modules; derive it.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNS = path.join(ROOT, 'runs');

const read = (rel) => readFileSync(path.join(RUNS, rel), 'utf8');

// runner file → the utils methods it must call (the ported feature's definition).
const OLX = {
  'Olx/appOne.mjs': ['Chromes.initFolders', 'Puppe.appSavePagination', 'Puppe.appSavePages', 'Chromes.finish'],
  'Olx/appTwo.mjs': ['Chromes.initFolders', 'Puppe.appSaveOffers', 'Phone.appFindPhones', 'Chromes.finish'],
  'Olx/appThree.mjs': ['Chromes.initFolders', 'Puppe.appSavePhones', 'Phone.appMergePhones', 'Phone.appCalculateCountOnline', 'Chromes.finish'],
  'Olx/offers.mjs': ['Chromes.initFolders', 'Puppe.appSaveOffers', 'Chromes.finish'],
  'Olx/pages.mjs': ['Chromes.initFolders', 'Puppe.appSavePagination', 'Puppe.appSavePages', 'Chromes.finish'],
  'Olx/phone.mjs': ['Chromes.initFolders', 'Puppe.appSavePhones', 'Chromes.finish'],
  'Olx/finder.mjs': ['Chromes.initFolders', 'Phone.appFindPhones', 'Chromes.finish'],
  'Olx/merge.mjs': ['Chromes.initFolders', 'Phone.appMergePhones', 'Phone.appCalculateCountOnline', 'Chromes.finish'],
  'Olx/checker.mjs': ['Chromes.initFolders', 'Phone.getNoPhones', 'Chromes.finish'],
  'Olx/testing.mjs': ['Chromes.initFolders', 'Phone.appCalculateCountOnline', 'Chromes.finish'],
};

const CONTRACT = {
  'Word/contract.mjs': ['Word.makeContract', 'Files.findAllContractFiles'],
  'Yamls/contractFill.mjs': ['Yamls.fillYamlWithInfo', 'Files.findAllContractFiles'],
  'Yamls/contractUpdate.mjs': ['Yamls.update', 'Files.findAllContractFiles'],
  'Excels/contract.mjs': ['Excels.generate', 'Files.findAllContractFiles'],
  'Excels/contractConvert.mjs': ['Excels.convertXltxToXlsx', 'Excels.convertXltxToXlsxAuto'],
};

const ALL = { ...OLX, ...CONTRACT };

describe('ported runners exist and parse', () => {
  it.each(Object.keys(ALL))('%s exists and is valid ESM', (rel) => {
    const file = path.join(RUNS, rel);
    expect(existsSync(file)).toBe(true);
    // node --check throws on a syntax error
    expect(() => execFileSync(process.execPath, ['--check', file])).not.toThrow();
  });
});

describe('ported runners are self-contained (no cmd spawn)', () => {
  it.each(Object.keys(ALL))('%s imports utils from ../../utils and never references cmd/', (rel) => {
    const src = read(rel);
    // imports at least one util from the sibling utils/ tree
    expect(src).toMatch(/await import\('\.\.\/\.\.\/utils\/\w+\.js'\)/);
    // must NOT spawn a child process or reference a deleted cmd/ path
    expect(src).not.toMatch(/js-winax-contract|js-scraper-olx/);
    expect(src).not.toMatch(/child_process|spawn\(|execFile\(|execSync\(/);
  });
});

describe('OLX runners call their exact Chromes/Puppe/Phone pipeline', () => {
  it.each(Object.entries(OLX))('%s calls the expected methods', (rel, methods) => {
    const src = read(rel);
    for (const m of methods) expect(src).toContain(m);
    // every OLX runner takes --app
    expect(src).toContain("option('app'");
  });
});

describe('contract runners call their exact Word/Yamls/Excels method', () => {
  it.each(Object.entries(CONTRACT))('%s calls the expected methods', (rel, methods) => {
    const src = read(rel);
    for (const m of methods) expect(src).toContain(m);
  });

  // The 4 batch-capable contract runners honour single --yaml OR batch --all.
  it.each(['Word/contract.mjs', 'Yamls/contractFill.mjs', 'Yamls/contractUpdate.mjs', 'Excels/contract.mjs'])(
    '%s supports single --yaml and batch --all',
    (rel) => {
      const src = read(rel);
      expect(src).toContain("option('yaml'");
      expect(src).toContain("option('all'");
      expect(src).toContain('findAllContractFiles');
    }
  );

  it('contractConvert takes --input (and optional --output), not --yaml/--all', () => {
    const src = read('Excels/contractConvert.mjs');
    expect(src).toContain("option('input'");
    expect(src).toContain("option('output'");
    expect(src).not.toContain("option('all'");
  });
});
