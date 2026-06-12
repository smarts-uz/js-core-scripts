// Global test setup, run after the test framework is installed (so `expect`,
// `jest`, `beforeEach` etc. are available).
//
// 1. Silence the very chatty console.{log,info,debug} output the utils classes
//    emit on every call (each public method logs "[Class.method] 🟢 Starting").
//    console.warn / console.error are left live so genuine problems still show;
//    individual tests may still spy on log/info/debug — clearMocks only resets
//    recorded calls, never the no-op implementation installed here.
// 2. Register the domain matchers in ./matchers.js.

import { jest } from '@jest/globals';
import './matchers.js';

for (const method of ['log', 'info', 'debug']) {
  // Replace with a jest.fn() so tests can still assert on it if they want;
  // jest.config clearMocks resets the call log between tests but keeps this fn.
  // eslint-disable-next-line no-console
  console[method] = jest.fn();
}
