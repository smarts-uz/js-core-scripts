// Mock factories for the heavy native dependencies the utils classes import.
//
// Used together with jest.unstable_mockModule() (required for native-ESM
// mocking) — register the mock BEFORE dynamically importing the class:
//
//   import { jest } from '@jest/globals';
//   import { makeComProxy } from '../helpers/mocks.js';
//   const winax = { Object: jest.fn(() => makeComProxy()), release: jest.fn() };
//   jest.unstable_mockModule('winax', () => ({ default: winax }));
//   const { Excels } = await import('../../utils/Excels.js');

import { jest } from '@jest/globals';

/**
 * A self-extending Proxy that stands in for a COM automation object (Excel /
 * Word / PowerPoint via winax). Any property access returns another proxy, any
 * call returns a proxy, and assignments are recorded on `__sets__`. This lets a
 * test import a class that drives long COM chains
 * (`app.Workbooks.Open(p).Sheets(1).Range('A1').Value = x`) without a real COM
 * server. Pass `overrides` to pin specific leaf values.
 */
export function makeComProxy(overrides = {}, label = 'COM') {
  const sets = {};
  const calls = [];
  const handler = {
    get(_t, prop) {
      if (prop === '__sets__') return sets;
      if (prop === '__calls__') return calls;
      if (prop === '__isComProxy__') return true;
      if (prop === Symbol.toPrimitive || prop === 'valueOf') return () => label;
      if (prop === 'toString') return () => label;
      if (prop === Symbol.iterator) return undefined;
      if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(overrides, prop)) {
        const v = overrides[prop];
        return typeof v === 'function' ? v : v;
      }
      // then/catch must be undefined so `await comProxy` does not hang.
      if (prop === 'then' || prop === 'catch' || prop === 'finally') return undefined;
      return makeComProxy(overrides[prop] && typeof overrides[prop] === 'object' ? overrides[prop] : {}, `${label}.${String(prop)}`);
    },
    set(_t, prop, value) {
      sets[prop] = value;
      return true;
    },
    apply(_t, _thisArg, args) {
      calls.push(args);
      return makeComProxy(overrides, `${label}()`);
    },
  };
  return new Proxy(function () {}, handler);
}

/**
 * Build a winax module mock. `objectImpl` lets a test decide what each
 * `new winax.Object(progId)` returns (defaults to a fresh COM proxy).
 */
export function makeWinaxMock(objectImpl) {
  const Obj = jest.fn(function (progId) {
    return objectImpl ? objectImpl(progId) : makeComProxy({}, progId);
  });
  return { default: { Object: Obj, release: jest.fn() }, Object: Obj, release: jest.fn() };
}

/**
 * Mock a Puppeteer Page with the methods utils code commonly calls. Override or
 * extend via `overrides`. All async methods resolve; `evaluate` returns
 * `evaluateResult` (default []).
 */
export function makePuppeteerPage(overrides = {}) {
  const page = {
    goto: jest.fn(async () => ({ status: () => 200 })),
    setUserAgent: jest.fn(async () => {}),
    setViewport: jest.fn(async () => {}),
    setRequestInterception: jest.fn(async () => {}),
    on: jest.fn(),
    evaluate: jest.fn(async (fn, ...args) => (typeof fn === 'function' ? undefined : undefined)),
    $: jest.fn(async () => null),
    $$: jest.fn(async () => []),
    $eval: jest.fn(async () => null),
    $$eval: jest.fn(async () => []),
    waitForSelector: jest.fn(async () => ({})),
    waitForTimeout: jest.fn(async () => {}),
    content: jest.fn(async () => '<html></html>'),
    title: jest.fn(async () => 'Title'),
    url: jest.fn(() => 'https://example.com'),
    close: jest.fn(async () => {}),
    cookies: jest.fn(async () => []),
    setCookie: jest.fn(async () => {}),
    screenshot: jest.fn(async () => Buffer.from('')),
    pdf: jest.fn(async () => Buffer.from('')),
    mouse: { wheel: jest.fn(async () => {}), move: jest.fn(async () => {}) },
    keyboard: { press: jest.fn(async () => {}), type: jest.fn(async () => {}) },
    ...overrides,
  };
  return page;
}

/**
 * Mock a Puppeteer Browser. `page` is the page returned by newPage()/pages().
 */
export function makePuppeteerBrowser(page = makePuppeteerPage()) {
  return {
    newPage: jest.fn(async () => page),
    pages: jest.fn(async () => [page]),
    close: jest.fn(async () => {}),
    process: jest.fn(() => ({ pid: 1234 })),
    on: jest.fn(),
    version: jest.fn(async () => 'HeadlessChrome/124'),
    wsEndpoint: jest.fn(() => 'ws://localhost:0'),
  };
}

/** Build a full puppeteer module mock whose launch() yields `browser`. */
export function makePuppeteerMock(browser = makePuppeteerBrowser()) {
  const launch = jest.fn(async () => browser);
  const connect = jest.fn(async () => browser);
  return { default: { launch, connect }, launch, connect };
}

/** A spawnSync/execSync-style successful result. */
export function spawnResult({ stdout = '', stderr = '', status = 0, error = null } = {}) {
  return { stdout, stderr, status, error, signal: null, pid: 1, output: [null, stdout, stderr] };
}
