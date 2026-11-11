# Integration Helpers — Didox / Ijara (Soliq.uz) / Kapital / My3

This file holds everything **concrete and project-specific** to the third-party government/bank integration helpers that live in the shared `utils/` source (`Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js`) — their config keys, credentials, `keys.yml` layout, base URL, and test conventions. These are credentials/endpoints for an **unrelated external integration**, not business logic implemented by this document-processing tool set.

The **generic external-service integration conventions** (integration-helper classes living in the library; a separate integration-docs file; base URLs resolved from the environment with a literal fallback; credentials in the gitignored `keys.yml` only, shaped service → kind → firm; per-test in-memory Secrets store; a previously committed secret being compromised) are owned by the **`smarts-app-cmdline` skill** → `module/integrations.md`. This file records only the concrete values that fill those conventions in for this project; the project's own technical requirements live in [CLAUDE.md](CLAUDE.md).

---

## Integration helpers (shared `utils/`)

The integration helpers — `Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js` — live in the `smarts-uz/js-core-scripts` source repo (resolved through the `utils/` symlink, tracked as plain files in this repo too). Per the global "treat symlinks as local files/folders" rule, edit them through the link and commit the change in **each** repo that tracks them.

---

## Didox base URL

- The Didox Partner API base URL is `https://api-partners.didox.uz`. It is non-secret and lives in `config.yml` (`Didox.BaseURL`, stored bare). The shared `didoxApi` client (`ofetch.create`) and the per-TIN lookups (`infoByTinPinfl`, transport/waybills) read it through `Yamls.getConfig('Didox.BaseURL')` and build the request as `https://<baseURL>/v1/...`.

---

## Credentials & `keys.yml` layout (concrete)

- **`keys.yml`** (gitignored; template `keys.example.yml`) holds every credential, shaped **service → kind → firm**, firms `SRental` and `WorkSpace`. `Secrets.get('didox', 'partner_key', 'SRental')` reads `didox.partner_key.SRental`; `Secrets.set(service, kind, firm, value)` rewrites only that one value line (comments, blank lines and key order stay). `Secrets.env('NAME')` reads an exact process env var (CI/shell injection only, never filled from a file).
- **Services / kinds in use:** `didox` and `didox_dev` (`partner_key`, `login`, `password`, `user_key`), `my3` (`api_key`, `token`), `ijara` (`token`), `kapital` (`token`, `id`).
- **Didox user-key is minted, not pasted.** `didox` is tried before `didox_dev`: the first profile with `partner_key` serves the data calls, the first holding `login` + `password` mints the `user_key` through `POST /v1/auth/{login}/password/ru`. A missing key, or a 401/403 from the API, mints a fresh `user_key`, saves it to `keys.yml` under that profile and retries the call once. `Didox.login()` forces a mint.
- **The `.env`/`config.yml`/`Didox.js` secrets were once committed and pushed** to the private repos (`smarts-uz/js_ai_category` and the `utils/` source repo `smarts-uz/js-core-scripts`). They remain in git history; **rotate/revoke the Kapital, Didox, Ijara, and My3 tokens** — the old values are compromised even after the working tree was scrubbed.

---

## Tests — integration-credential specifics (concrete)

- The integration classes read credentials via `Secrets.get(service, kind, firm)`. Specs replace `Secrets` with the in-memory store from `tests/helpers/secrets.js` (`makeSecretsMock()`, `reset(data)` per test, `saved` records every `set`), so a consumer project's real `keys.yml` can't make a test non-deterministic. `tests/Secrets.test.js` runs the real class against a throwaway `keys.yml` (`Secrets.file`). `Didox.js` keeps the user-key in process memory; specs call the exported `resetDidoxAuth()` between tests.
- **The bundled data lives in `conf/data/` and is read from there directly** (no root `data/` symlink). `Didox.js` imports `../conf/data/banks.json`/`regions.json`/`districts.json` and `tests/Didox.test.js` imports `../conf/data/...`, so the suite needs `conf/data/*.json` present.
