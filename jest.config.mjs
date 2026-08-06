// Jest configuration for the js_ai_category test suite.
//
// classes/ and node_modules/ are real local folders in this project root (no
// symlink into a shared tree). The project is native ESM ("type": "module");
// the classes import heavy native deps (winax, puppeteer, pino, xlsx). We
// therefore run Jest in native-ESM mode (NODE_OPTIONS=--experimental-vm-modules,
// set by the npm scripts) with NO Babel transform, mocking native deps
// per-test via jest.unstable_mockModule(). Pure-logic and fs methods are
// tested for real against temp directories.
/** @type {import('jest').Config} */
export default {
    testEnvironment: 'node',

    // Native ESM: do not transform sources. Files are loaded as real ES modules.
    transform: {},

    // Only our own *.test.js files under tests/ are suites; helpers/setup are not.
    testMatch: ['<rootDir>/tests/**/*.test.js'],

    setupFilesAfterEnv: ['jest-extended/all', '<rootDir>/tests/setup/jest.setup.js'],

    watchPlugins: ['jest-watch-typeahead/filename', 'jest-watch-typeahead/testname'],

    clearMocks: true,
    resetMocks: false,
    restoreMocks: false,

    // Coverage is collected from the source classes plus the in-repo generator.
    collectCoverageFrom: ['classes/**/*.js', 'scripts/_generate.mjs', '!classes/**/*.test.js'],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text-summary', 'lcov', 'html'],

    // Modest, achievable global thresholds — a floor that fails CI on a large
    // regression. Raise as real coverage instrumentation improves.
    coverageThreshold: {
        global: {
            statements: 50,
            branches: 40,
            functions: 50,
            lines: 50,
        },
    },

    reporters: ['default'],
    verbose: true,
    testTimeout: 15000,
};
