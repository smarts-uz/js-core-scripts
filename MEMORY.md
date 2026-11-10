# Project Memory — js_ai_category

Single-file memory store for this project. Each fact is a `##` section with inline `type` / `description` / optional `dependsOn`. Skips anything the repo, git history, or `CLAUDE.md` already records.

## Secrets Live in keys.yml Only — config.yml & Source Are Secret-Free

- type: project
- description: all credentials live in a gitignored keys.yml (service → kind → firm), read via classes/Secrets.js; config.yml + source scrubbed; old tokens compromised → rotate

Credentials were previously **committed in `config.yml`** (Kapital/Didox/Ijara JWT tokens, `My3Api` UUID) and **hardcoded in `utils/Didox.js`** (a `user-key` UUID, a `Partner-Authorization` JWT, the login password `4beruniave`), in repos with no `.gitignore`/no env model — so they were pushed to the private repos `smarts-uz/js_ai_category` and `smarts-uz/js-core-scripts`. They were migrated to a **gitignored `keys.yml`** (first `.env`, then `keys.yml` by user decision) read through `classes/Secrets.js`: `Secrets.get('service','kind','firm')` → `keys.yml` path `<service>.<kind>.<firm>` (e.g. `didox`/`partner_key`/`SRental`, `my3`/`api_key`/`SRental`). `config.yml` and all `classes/*.js` are now secret-free.

**Why:** Live tokens in a tracked file/source are leaked the moment they're pushed. Decision (user): scrub the working tree and **rotate the tokens** rather than rewrite git history (force-push is riskier on the private repos).

**How to apply:** Never put a secret in `config.yml`, source, or any tracked file — only in `keys.yml` (gitignored; template `keys.example.yml`, layout documented in `INTEGRATIONS.md`). Read via `Secrets.get(service, kind, firm)`. Treat the old Kapital/Didox/Ijara/My3 tokens as **compromised — they must be revoked/rotated** (they remain in git history). See [[secrets-env-only]]-related detail in `CLAUDE.md`.

## Project Identity — Document-Processing CLI Tool Set

- type: project
- description: js_ai_category is a set of Node ESM CLI document tools, not an app with a business domain

This is a **toolbox of single-purpose Node.js (ESM) CLI scripts** for Office/Markdown document processing on Windows (conversion, homoglyph normalization, Excel/Word/PPT ops, merges). No server, UI, build, `package.json`, or business/monetization domain. Driven by `yargs` + `config.yml`, launched directly or via the `shell/` right-click context-menu launchers. Full technical detail lives in `CLAUDE.md`; don't duplicate it here.
