# Project Requirements - js_ai_category

This project is a private Node.js ESM command-line toolkit for Windows document and browser automation. It exposes utility classes under `utils/` as generated runners under `runs/<Class>/<method>.mjs`, with shell launcher definitions in `shell/` and VS Code launch configs in `.vscode/launch.json`.

## Project Shape

- `utils/` contains the authored library classes. Public methods are non-underscore methods and are the source for generated runners.
- `runs/` contains generated per-method runner entry points plus generator scripts. Regenerate runners, README, shell definitions, and launch configs with the existing npm scripts when public APIs change.
- `tests/` is the permanent Jest suite. Keep one focused test file per utility class and extend the matching spec when adding or changing public behavior.
- `config.yml` stores non-secret runtime configuration only. Secrets belong in the gitignored `.env` and are read through `utils/Secrets.js`.
- `shell/`, `cmd/`, and `App/` hold Windows integration launchers and app shortcuts. Treat launcher edits as user-facing behavior changes and test the real invoked path where possible.

## Development Rules

- Use native ESM JavaScript. Keep imports relative for local files.
- Do not hardcode secrets, tokens, passwords, or machine-specific credentials in source, config, tests, docs, or generated runners.
- Do not kill processes by image name. If a run launches a process that may need cleanup, snapshot PIDs before launch and terminate only PIDs created by that run.
- Do not add PowerShell scripts or PowerShell-based runtime instructions. Use Node `.mjs` scripts for automation.
- When changing a public utility method, keep `utils/`, `runs/`, `shell/`, `.vscode/launch.json`, `README.md`, and the matching `tests/<Class>.test.js` in sync.
- For browser-facing behavior, reproduce through the real UI flow with Playwright or the existing browser automation entry point, then rerun the same flow after each code change.

## Verification

- Run the narrowest relevant test first, then broader checks when the touched path affects shared behavior.
- Use `npm test` for the full Jest suite when practical.
- Use `npm run lint` when JavaScript source or generated runner code changes.
