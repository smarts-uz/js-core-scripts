// Supabase-backed login, gated by a per-machine device fingerprint (see
// fingerprint.rs). Flow:
//
//   1. POST /auth/v1/token?grant_type=password  -> access_token (JWT)
//   2. POST /rest/v1/rpc/check_and_bind_fingerprint (Authorization: Bearer
//      <access_token>) -> true (first login on this machine, or fingerprint
//      already matched) / false (correct password, WRONG machine — reject).
//   3. On success, the session (access_token + refresh_token) is stored in
//      Windows Credential Manager via `keyring`, so the user isn't asked to
//      log in again on every launch of this same machine.
//
// The Supabase URL + anon key are NOT secrets — Supabase's anon key is
// designed to be embedded in a client and is only as powerful as the
// project's Row Level Security policies allow (see
// supabase/migrations/20260805000000_device_fingerprint_lock.sql, which
// scopes every RPC/select to auth.uid() = the caller's own row).

use keyring::Entry;
use serde::{Deserialize, Serialize};

const SUPABASE_URL: &str = "https://kduqhvzqxongeeglhuim.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdXFodnpxeG9uZ2VlZ2xodWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzE1MDUsImV4cCI6MjEwMTQ0NzUwNX0.uuWUKsMyLlQ4cAUat3OAnEzJ0Su6awe19VEVF6iMkUE";

const KEYRING_SERVICE: &str = "com.jsaicategory.humanize";
const KEYRING_USER: &str = "session";

#[derive(Serialize)]
struct PasswordGrantRequest<'a> {
    email: &'a str,
    password: &'a str,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    refresh_token: String,
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    msg: Option<String>,
}

#[derive(Serialize)]
struct StoredSession {
    access_token: String,
    refresh_token: String,
}

fn client() -> reqwest::Client {
    reqwest::Client::new()
}

/// Exchanges email+password for a Supabase session, then checks/binds the
/// current machine's fingerprint via check_and_bind_fingerprint(). Returns
/// Ok(()) only when the password was correct AND the fingerprint check
/// passed (first login on this machine, or a match) — persisting the
/// session to Windows Credential Manager on success.
pub async fn login(email: &str, password: &str) -> Result<(), String> {
    let http = client();

    let token_resp = http
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=password"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Content-Type", "application/json")
        .json(&PasswordGrantRequest { email, password })
        .send()
        .await
        .map_err(|e| format!("network error contacting Supabase: {e}"))?;

    let status = token_resp.status();
    let token: TokenResponse = token_resp
        .json()
        .await
        .map_err(|e| format!("failed to parse Supabase auth response: {e}"))?;

    if !status.is_success() {
        let reason = token
            .error_description
            .or(token.msg)
            .unwrap_or_else(|| "invalid email or password".to_string());
        return Err(reason);
    }

    let fingerprint = crate::fingerprint::compute()?;

    let rpc_resp = http
        .post(format!("{SUPABASE_URL}/rest/v1/rpc/check_and_bind_fingerprint"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", token.access_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "p_fingerprint": fingerprint }))
        .send()
        .await
        .map_err(|e| format!("network error checking device fingerprint: {e}"))?;

    let allowed: bool = rpc_resp
        .json()
        .await
        .map_err(|e| format!("failed to parse fingerprint-check response: {e}"))?;

    if !allowed {
        return Err(
            "This account is already bound to a different PC. Login is only allowed from the \
             machine it was first used on."
                .to_string(),
        );
    }

    store_session(&token.access_token, &token.refresh_token)?;
    Ok(())
}

fn store_session(access_token: &str, refresh_token: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("failed to open credential store: {e}"))?;
    let payload = serde_json::to_string(&StoredSession {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
    })
    .map_err(|e| format!("failed to serialize session: {e}"))?;
    entry.set_password(&payload).map_err(|e| format!("failed to store session: {e}"))
}

/// True if a previously stored session exists (does not itself re-validate
/// against Supabase — a stale/expired token still returns true here; the
/// frontend should retry login if a subsequent action fails with 401).
pub fn has_stored_session() -> bool {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).and_then(|e| e.get_password()).is_ok()
}

/// Clears the stored session (logout).
pub fn clear_session() -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("failed to open credential store: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to clear session: {e}")),
    }
}
