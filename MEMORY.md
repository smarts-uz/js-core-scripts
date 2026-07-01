# Project Memory — js_ai_category

Single-file memory store for this project. Each fact is a `##` section with inline `type` / `description` / optional `dependsOn`. Skips anything the repo, git history, or `CLAUDE.md` already records.

## Secrets Live in .env Only — config.yml & Source Are Secret-Free

- type: project
- description: all credentials moved to a gitignored .env, read via utils/Secrets.js (dotenv); config.yml + utils source scrubbed; old tokens compromised → rotate

Credentials were previously **committed in `config.yml`** (Kapital/Didox/Ijara JWT tokens, `My3Api` UUID) and **hardcoded in `utils/Didox.js`** (a `user-key` UUID, a `Partner-Authorization` JWT, the login password `4beruniave`), in repos with no `.gitignore`/no env model — so they were pushed to the private repos `smarts-uz/js_ai_category` and `smarts-uz/js-core-scripts`. They were migrated to a **gitignored `.env`** read through a new `utils/Secrets.js` (dotenv): `Secrets.get('Section','Owner')` → `<SECTION>_<OWNER>` env var (e.g. `Didox`/`SRental` → `DIDOX_SRENTAL`, `My3Api`/`SRental` → `MY3_API_SRENTAL`). `config.yml` and all `utils/*.js` are now secret-free.

**Why:** Live tokens in a tracked file/source are leaked the moment they're pushed. Decision (user): scrub the working tree and **rotate the tokens** rather than rewrite git history (force-push is riskier on the private repos).

**How to apply:** Never put a secret in `config.yml`, source, or any tracked file — only in `.env` (gitignored; variable names documented in `INTEGRATIONS.md`). Read via `Secrets.get(...)`/`Secrets.env(...)`. Treat the old Kapital/Didox/Ijara/My3 tokens as **compromised — they must be revoked/rotated** (they remain in git history). See [[secrets-env-only]]-related detail in `CLAUDE.md`.

## Project Identity — Document-Processing CLI Tool Set

- type: project
- description: js_ai_category is a set of Node ESM CLI document tools, not an app with a business domain

This is a **toolbox of single-purpose Node.js (ESM) CLI scripts** for Office/Markdown document processing on Windows (conversion, homoglyph normalization, Excel/Word/PPT ops, merges). No server, UI, build, `package.json`, or business/monetization domain. Driven by `yargs` + `config.yml`, launched directly or via the `shell/` right-click context-menu launchers. Full technical detail lives in `CLAUDE.md`; don't duplicate it here.
