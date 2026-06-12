// Helpers for native-ESM module mocking.
//
// jest.unstable_mockModule() keys its registry by RESOLVED absolute path, but
// resolving a relative specifier from a test file is brittle under our config
// (it can anchor to the setup file). Registering the mock with the absolute
// path of the utils module removes the ambiguity — Claude's `import './Files.js'`
// resolves to the same absolute path and matches the mock.

import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // tests/helpers
export const UTILS_DIR = path.resolve(HERE, '..', '..', 'utils');

/** Absolute path of a utils module, e.g. utilsModule('Files.js'). */
export const utilsModule = (name) => path.join(UTILS_DIR, name);
