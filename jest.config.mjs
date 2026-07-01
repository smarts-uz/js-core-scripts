// Jest configuration for the js_ai_category test suite.
//
// utils/ and node_modules/ are symlinks into the shared js-core-scripts source
// (d:\Develop\Projects\DevApp\Execute\JS\Develop). The project is native ESM
// ("type": "module"); the utils classes import heavy native deps (winax,
// puppeteer, pino, xlsx). We therefore run Jest in native-ESM mode
// (NODE_OPTIONS=--experimental-vm-modules, set by the npm scripts) with NO Babel
// transform, mocking native deps per-test via jest.unstable_mockModule().
// Pure-logic and fs methods are tested for real against temp directories.
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

    // Coverage is collected from the (symlinked) source classes plus the in-repo
    // generator. NOTE: jest's coverage instrumentation does not follow symlinks
    // reliably, so utils/** may report 0/0 here (the real coverage of those
    // classes is exercised by the suites but not instrumented through the link);
    // runs/_generate.mjs is a real in-repo file and is instrumented normally.
    collectCoverageFrom: ['utils/**/*.js', 'runs/_generate.mjs', '!utils/**/*.test.js'],
    coverageDirectory: '<rootDir>/coverage',
    coverageReporters: ['text-summary', 'lcov', 'html'],

    // Modest, achievable global thresholds — a floor that fails CI on a large
    // regression without being brittle against the symlink-instrumentation gap
    // above. Raise as real coverage instrumentation improves.
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
