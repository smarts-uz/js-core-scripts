// Jest configuration for the utils/ test suite.
//
// The project is native ESM ("type": "module") and the utils classes import
// heavy native deps (winax, puppeteer, pino, xlsx). We therefore run Jest in
// native-ESM mode (NODE_OPTIONS=--experimental-vm-modules, set by the npm
// scripts) with NO Babel transform, and mock the native deps per-test via
// jest.unstable_mockModule(). Pure-logic and fs-based methods are tested for
// real against temporary directories.
/** @type {import('jest').Config} */
export default {
  testEnvironment: 'node',

  // Native ESM: do not transform sources. Files are loaded as real ES modules.
  transform: {},

  // Only our own *.test.js files under tests/ are test suites; everything else
  // (helpers, fixtures, setup) is ignored as a suite. roots is left at its
  // default (<rootDir>) so relative module resolution from utils/ is unaffected.
  testMatch: ['<rootDir>/tests/**/*.test.js'],

  // jest-extended adds ~100 matchers (toBeArray, toBeString, toBeOneOf,
  // toContainKey, toBeWithin, …); our own file silences noisy console output
  // and registers domain matchers (toBeUzbekPhone, toBeSafeWindowsName).
  setupFilesAfterEnv: [
    'jest-extended/all',
    '<rootDir>/tests/setup/jest.setup.js',
  ],

  // Trending watch-mode plugins: filter by file name / test name as you type.
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],

  // Clear mock.calls between tests but keep the console-silencing implementation
  // installed by the setup file (restoreMocks would undo it after test #1).
  clearMocks: true,
  resetMocks: false,
  restoreMocks: false,

  // Coverage is collected from the source classes, not the tests/helpers.
  collectCoverageFrom: [
    'utils/**/*.js',
    '!utils/**/*.test.js',
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text-summary', 'lcov', 'html'],

  // jest-junit picks up its own options from package.json / env in CI runs.
  reporters: ['default'],

  verbose: true,
  testTimeout: 15000,
};
