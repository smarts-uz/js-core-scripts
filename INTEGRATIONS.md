# Integration Helpers — Didox / Ijara (Soliq.uz) / Kapital / My3

This file holds everything **concrete and project-specific** to the third-party government/bank integration helpers that live in the shared `utils/` source (`Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js`) — their config keys, credentials, env-var mapping, base URL, and test conventions. These are credentials/endpoints for an **unrelated external integration**, not business logic implemented by this document-processing tool set.

The **generic external-service integration conventions** (integration-helper classes living in the library; a separate integration-docs file; base URLs resolved from the environment with a literal fallback; credentials in a gitignored `keys.yml` only via a service→kind→firm mapping; per-test keys.yml isolation; a previously committed secret being compromised) are owned by the **`smarts-app-cmdline` skill** → `module/integrations.md`. This file records only the concrete values that fill those conventions in for this project; the project's own technical requirements live in [CLAUDE.md](CLAUDE.md).

---

## Integration helpers (shared `utils/`)

The integration helpers — `Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js` — live in the `smarts-uz/js-core-scripts` source repo (resolved through the `utils/` symlink, tracked as plain files in this repo too). Per the global "treat symlinks as local files/folders" rule, edit them through the link and commit the change in **each** repo that tracks them.

---

## Didox base URL

- The Didox Partner API base URL is `https://api-partners.didox.uz`. It is non-secret and lives in `config.yml` (`Didox.BaseURL`, stored bare as `api-partners.didox.uz`). The shared `didoxApi` client (`ofetch.create`) and the per-TIN lookups (`infoByTinPinfl`, transport/waybills) read it via `Yamls.getConfig('Didox.BaseURL')` with that literal as a fallback and build the request as `https://<baseURL>/v1/...`.

---

## Credentials & env-var mapping (concrete)

- **`Secrets.get('service', 'kind', 'firm')`** reads `keys.yml` → `<service>.<kind>.<firm>` (e.g. `didox`/`partner_key`/`SRental` → `didox.partner_key.SRental`). Two firms exist: `SRental`, `WorkSpace`. A missing path returns `null`; an empty value stays `''`. `Secrets.env('NAME')` reads an exact real process env var (CI injection only, never a file).
- **`keys.yml` shape** (gitignored; template `keys.example.yml`): `didox` → `user_key`, `partner_key`, `login_password`; `my3` → `api_key`, `token`; `ijara` → `token`; `kapital` → `token`, `id`. Each kind maps firm → value.
- **The `.env`/`config.yml`/`Didox.js` secrets were once committed and pushed** to the private repos (`smarts-uz/js_ai_category` and the `utils/` source repo `smarts-uz/js-core-scripts`). They remain in git history; **rotate/revoke the Kapital, Didox, Ijara, and My3 tokens** — the old values are compromised even after the working tree was scrubbed.

---

## Tests — integration-credential specifics (concrete)

- The integration classes read credentials via `Secrets.get(service, kind, firm)` → `keys.yml`. Specs never touch a real `keys.yml`: `tests/helpers/secrets.js` installs an in-memory Secrets mock (or a throwaway temp `keys.yml` for `Secrets.test.js` itself), so a consumer project's real `keys.yml` can't make the test non-deterministic.
- **The bundled data lives in `conf/data/` and is read from there directly** (no root `data/` symlink). `Didox.js` imports `../conf/data/banks.json`/`regions.json`/`districts.json` and `tests/Didox.test.js` imports `../conf/data/...`, so the suite needs `conf/data/*.json` present.
