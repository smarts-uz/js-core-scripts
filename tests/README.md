# utils/ test suite

Unit tests for every public method (name **not** starting with `_`) of every
class under [`utils/`](../utils). Built on **Jest** (native ESM) with the
trending plugins **jest-extended**, **@fast-check/jest**, **jest-when**,
**jest-watch-typeahead** and **jest-junit**.

## Running

```bash
npm test                 # run everything
npm run test:watch       # watch mode (typeahead filename / testname filters)
npm run test:coverage    # coverage report under coverage/
npx cross-env NODE_OPTIONS=--experimental-vm-modules npx jest tests/Files.test.js   # one file
```

The project is native ESM (`"type": "module"`), so Jest runs with
`NODE_OPTIONS=--experimental-vm-modules` (wired into the npm scripts) and **no
Babel transform**.

## Conventions

There are two test styles. Pick per method.

### 1. Pure logic & filesystem — test for real

String/date/number helpers and fs methods are tested against **real temporary
directories**, never a mocked `fs`. Use [`helpers/tmp.js`](helpers/tmp.js):

```js
import { makeTmpDir, writeTree, read, exists, cleanupAllTmpDirs } from './helpers/tmp.js';
const dir = makeTmpDir();
writeTree(dir, { 'a.txt': 'hi', sub: { 'b.json': '{}' } });
afterEach(() => cleanupAllTmpDirs());
```

Import the class directly: `import { Files } from '../utils/Files.js';`

### 2. Native / OS / network boundary — mock only the boundary

For methods that drive **winax COM** (Excel/Word/PowerPoint), **Puppeteer**,
**child_process** (`execSync`/`spawnSync`/`exec`), the **registry**, **HTTP**
(`fetch`/`ofetch`/`undici`/`node-fetch`), `node-notifier` or `open`, mock that
boundary with `jest.unstable_mockModule` **before** dynamically importing the
class:

```js
import { jest } from '@jest/globals';
import { utilsModule } from './helpers/esm.js';
import { makeWinaxMock, makeComProxy, makePuppeteerMock, spawnResult } from './helpers/mocks.js';

// node/npm modules: bare specifier. local sibling deps: utilsModule('X.js') (absolute key!).
jest.unstable_mockModule('child_process', () => ({ execSync: jest.fn(), default: {} }));
jest.unstable_mockModule(utilsModule('Dialogs.js'), () => ({ Dialogs: { messageBox: jest.fn() } }));

const { Excels } = await import('../utils/Excels.js');   // import AFTER mocks
```

- Local sibling deps (`./Files.js`, `./Dialogs.js`, …) **must** be keyed with
  `utilsModule('Name.js')` (resolved absolute path) or the mock will not match.
- Mock a sibling dep when it pulls in a native module or to isolate the unit;
  otherwise the real one is fine.
- Helpers in [`helpers/mocks.js`](helpers/mocks.js): `makeComProxy` (auto-chaining
  COM stand-in), `makeWinaxMock`, `makePuppeteerPage/Browser/Mock`, `spawnResult`.

## Rules

- **Cover every public method** (no `_` prefix), incl. static fields that are
  arrow functions (e.g. `Dates.sleepOne`).
- **Assert real, observable behavior of the code as written** — happy path, edge
  cases, empty/invalid input, and error branches. For thin native wrappers,
  assert the boundary was called with the right arguments and the return is
  shaped correctly.
- **Never modify `utils/` source** to make a test pass. If a method has a bug,
  write a test that documents the actual behavior and add a comment.
- Prefer **jest-extended** (`toBeArray`, `toBeOneOf`, `toContainAllKeys`, …) and
  the custom matchers in [`setup/matchers.js`](setup/matchers.js)
  (`toBeUzbekPhone`, `toBeSafeWindowsName`, `toBeDateDMY`, `toBeDateYMD`).
- `console.log/info/debug` are silenced globally; `warn`/`error` stay live (the
  noise in passing output is expected). `clearMocks` runs between tests.

See [`Dates.test.js`](Dates.test.js) (pure) and [`Claude.test.js`](Claude.test.js)
(mocked boundary) as the canonical references.
