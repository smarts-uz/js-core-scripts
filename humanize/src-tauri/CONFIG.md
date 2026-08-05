# `config.json`

Every non-secret, tunable value this app reads is here — never hardcoded as a Rust
constant. Because `config.json` is parsed via plain `serde_json` (no comments allowed),
this file is the comment layer: every key documented here, nowhere else.

`config.json` is embedded into the compiled binary at build time via `include_str!`
(`src/config.rs`) — there is no external `config.json` shipped alongside `app.exe`;
changing a value requires a rebuild (`cargo build --release` / `tauri build`).

## `supabase`

| Key          | Accepted values  | Default                                    | Meaning                                                                                                                                                                                                                                                                                          |
| ------------ | ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `url`        | HTTPS URL string | `https://kduqhvzqxongeeglhuim.supabase.co` | The `humanize` Supabase project's REST/Auth base URL.                                                                                                                                                                                                                                            |
| `anonKey`    | JWT string       | (project's anon key)                       | Supabase's public anon key — NOT a secret; it is designed to be embedded client-side. Real access control is enforced by the project's Row Level Security policies and the `check_and_bind_fingerprint` RPC's own `SECURITY DEFINER` logic (see `supabase/migrations/`), not by hiding this key. |
| `projectRef` | string           | `kduqhvzqxongeeglhuim`                     | The Supabase project ref — used when a script (not the compiled app itself) needs to call the Management API against this same project.                                                                                                                                                          |

## `session`

| Key       | Accepted values            | Default       | Meaning                                                                                                                                                                                                                                        |
| --------- | -------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ttlSecs` | positive integer (seconds) | `86400` (24h) | How long a stored login session is honored before `has_stored_session()` treats it as expired and clears it, re-showing the login screen — even on the same, already-bound machine. Independent of the underlying Supabase token's own expiry. |

## `excel`

| Key              | Accepted values             | Default             | Meaning                                                                                                                                                                                                                   |
| ---------------- | --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `excludedSheets` | array of sheet-name strings | (see `config.json`) | Sheet names `excel::apply_excel` skips during homoglyph replace — mirrors the rest of this project's `config.yml`'s `Excel.ExcludedSheets` (this Tauri app has no config.yml of its own, so the list lives here instead). |

## What is genuinely a secret (never goes in this file)

The Supabase Management API token (used only by test/maintenance scripts to set up/tear
down test fixtures, never by the compiled app itself) is read from the
`SUPABASE_ACCESS_TOKEN` environment variable — the same variable the `supabase` CLI
itself populates on `supabase login`. It is never hardcoded, and never belongs in
`config.json` either, since `config.json` is compiled into the distributed binary and
would ship the token to every machine running the app.
