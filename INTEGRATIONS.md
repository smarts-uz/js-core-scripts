# Integration Helpers — Didox / Ijara (Soliq.uz) / Kapital / My3

This file holds everything **concrete and project-specific** to the third-party government/bank integration helpers that live in the shared `utils/` source (`Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js`) — their config keys, credentials, env-var mapping, base URL, and test conventions. These are credentials/endpoints for an **unrelated external integration**, not business logic implemented by this document-processing tool set.

The **generic external-service integration conventions** (integration-helper classes living in the library; a separate integration-docs file; base URLs resolved from the environment with a literal fallback; credentials in `.env` only via a section/owner→env-var mapping; per-test env-var set/restore isolation; a previously committed secret being compromised) are owned by the **`smarts-app-cmdline` skill** → `module/integrations.md`. This file records only the concrete values that fill those conventions in for this project; the project's own technical requirements live in [CLAUDE.md](CLAUDE.md).

---

## Integration helpers (shared `utils/`)

The integration helpers — `Didox.js`, `MySoliq.js`, `IjaraSoliq.js`, `KapitalBank.js`, `Secrets.js` — live in the `smarts-uz/js-core-scripts` source repo (resolved through the `utils/` symlink, tracked as plain files in this repo too). Per the global "treat symlinks as local files/folders" rule, edit them through the link and commit the change in **each** repo that tracks them.

---

## Didox base URL

- The Didox Partner API base URL is `https://api-partners.didox.uz`. The shared `didoxApi` client (`ofetch.create`) reads it from `Secrets.env("DIDOX_BASE_URL")` with that literal as a fallback. The per-TIN lookups (`infoByTinPinfl`, transport/waybills) read it via `Secrets.get('Didox.BaseURL')` and build the request from that base URL as `https://<baseURL>/v1/...`.

---

## Credentials & env-var mapping (concrete)

- **`Secrets.get('Section', 'Owner')`** maps to the env var `<SECTION>_<OWNER>` (e.g. `Didox`/`SRental` → `DIDOX_SRENTAL`, `My3Api`/`SRental` → `MY3_API_SRENTAL`, `KapitalId`/`SRental` → `KAPITAL_ID_SRENTAL`). `Secrets.env('NAME')` reads an exact var.
- **Env vars in use:** `DIDOX_BASE_URL`, `DIDOX_USER_KEY`, `DIDOX_PARTNER_AUTHORIZATION`, `DIDOX_LOGIN_PASSWORD`, `DIDOX_SRENTAL`, `MY3_API_SRENTAL`, `MY3_SRENTAL`, `IJARA_SRENTAL`, `KAPITAL_SRENTAL`, `KAPITAL_ID_SRENTAL`.
- **The `.env`/`config.yml`/`Didox.js` secrets were once committed and pushed** to the private repos (`smarts-uz/js_ai_category` and the `utils/` source repo `smarts-uz/js-core-scripts`). They remain in git history; **rotate/revoke the Kapital, Didox, Ijara, and My3 tokens** — the old values are compromised even after the working tree was scrubbed.

---

## Tests — integration-credential specifics (concrete)

- The integration classes read credentials via `Secrets.get(...)` → `process.env.<SECTION>_<OWNER>`. Specs set/restore the exact env var per test (e.g. `process.env.IJARA_SRENTAL`, `KAPITAL_ID_SRENTAL`) and isolate it (delete before a "no bearer" guard test) so a consumer project's real `.env` can't make the test non-deterministic.
- **`data/` is a symlink** (like `utils/` and `node_modules/`) into the shared source, tracked as real JSON files in this repo too; `Didox.js` and its spec import the bundled `data/banks.json`/`regions.json`/`districts.json`, so the suite needs it present.
