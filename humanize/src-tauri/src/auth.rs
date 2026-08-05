// Supabase-backed login, gated by a per-machine device fingerprint (see
// fingerprint.rs). Flow:
//
//   1. POST /auth/v1/token?grant_type=password  -> access_token (JWT)
//   2. POST /rest/v1/rpc/check_and_bind_fingerprint (Authorization: Bearer
//      <access_token>) -> { allowed, bound_device_name }. allowed=true means
//      first login on this machine (now bound), or fingerprint already
//      matched. allowed=false means correct password, WRONG machine —
//      reject, and bound_device_name names the machine it IS bound to, so
//      the frontend can show a concrete "already registered on <name>"
//      warning instead of a generic denial.
//   3. On success, the session (access_token + refresh_token) is stored in
//      Windows Credential Manager via `keyring`, so the user isn't asked to
//      log in again on every launch of this same machine.
//
// The Supabase URL + anon key are NOT secrets — Supabase's anon key is
// designed to be embedded in a client and is only as powerful as the
// project's Row Level Security policies allow (see
// supabase/migrations/20260805000000_device_fingerprint_lock.sql +
// 20260805010000_device_fingerprint_name.sql, which scope every RPC/select
// to auth.uid() = the caller's own row). Both live in config.json (see
// CONFIG.md), never hardcoded here.

use crate::config::CONFIG;
use keyring::Entry;
use serde::{Deserialize, Serialize};

fn keyring_entry() -> keyring::Result<Entry> {
    Entry::new(&CONFIG.keyring.service, &CONFIG.keyring.user)
}

#[derive(Serialize)]
struct PasswordGrantRequest<'a> {
    email: &'a str,
    password: &'a str,
}

// Supabase's password-grant endpoint returns TWO genuinely different JSON
// shapes on the SAME endpoint depending on outcome: a success body has
// access_token/refresh_token (and no error_code); a failure body (e.g.
// invalid_credentials) has NEITHER of those, only error_code/msg
// (sometimes error_description instead of msg). Both access_token and
// refresh_token MUST be Optional here — making them required strings, as
// an earlier version of this struct did, meant deserializing a genuine
// wrong-password response failed the whole struct outright (missing
// required fields), which surfaced as an opaque "failed to parse Supabase
// auth response: error decoding response body" instead of the real,
// clean "Invalid login credentials" message — every wrong password showed
// this confusing error, 100% of the time, not just on a rare parse glitch.
#[derive(Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    refresh_token: Option<String>,
    #[serde(default)]
    error_description: Option<String>,
    #[serde(default)]
    msg: Option<String>,
}

#[derive(Deserialize)]
struct FingerprintCheckResponse {
    allowed: bool,
    bound_device_name: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct StoredSession {
    access_token: String,
    refresh_token: String,
    /// Unix timestamp (seconds) of when this session was stored — checked
    /// against SESSION_TTL_SECS by has_stored_session().
    stored_at: u64,
}

/// Structured login failure — lets the frontend show a specific warning
/// card for a wrong-machine rejection (naming the bound machine) instead of
/// a generic error string.
#[derive(Debug, Serialize)]
#[serde(tag = "kind")]
pub enum LoginError {
    /// Wrong email/password, or a network/parse failure.
    InvalidCredentials { message: String },
    /// Correct password, but this machine isn't the one the account is
    /// bound to. `bound_device_name` is the OTHER machine's name, when the
    /// server has one on file (older bindings created before device_name
    /// existed have `None`).
    WrongDevice { bound_device_name: Option<String> },
}

fn client() -> reqwest::Client {
    reqwest::Client::new()
}

/// Exchanges email+password for a Supabase session, then checks/binds the
/// current machine's fingerprint via check_and_bind_fingerprint(). Returns
/// Ok(()) only when the password was correct AND the fingerprint check
/// passed (first login on this machine, or a match) — persisting the
/// session to Windows Credential Manager on success.
pub async fn login(email: &str, password: &str) -> Result<(), LoginError> {
    let http = client();

    let token_resp = http
        .post(format!("{}/auth/v1/token?grant_type=password", CONFIG.supabase.url))
        .header("apikey", &CONFIG.supabase.anon_key)
        .header("Content-Type", "application/json")
        .json(&PasswordGrantRequest { email, password })
        .send()
        .await
        .map_err(|e| LoginError::InvalidCredentials {
            message: format!("network error contacting Supabase: {e}"),
        })?;

    let status = token_resp.status();
    let token: TokenResponse =
        token_resp.json().await.map_err(|e| LoginError::InvalidCredentials {
            message: format!("failed to parse Supabase auth response: {e}"),
        })?;

    // A failure response (wrong password, unknown email, etc.) has neither
    // access_token nor refresh_token — check this BEFORE `!status.is_success()`
    // alone, since a non-2xx status with a real access_token is not a shape
    // Supabase's API produces, but treating "both tokens present" as the
    // actual success signal is the more robust check either way.
    let (Some(access_token), Some(refresh_token)) = (token.access_token, token.refresh_token) else {
        let reason = token
            .msg
            .or(token.error_description)
            .unwrap_or_else(|| "Invalid email or password.".to_string());
        return Err(LoginError::InvalidCredentials { message: reason });
    };

    if !status.is_success() {
        return Err(LoginError::InvalidCredentials { message: "Invalid email or password.".to_string() });
    }

    let fingerprint = crate::fingerprint::compute()
        .map_err(|e| LoginError::InvalidCredentials { message: e })?;
    let device_name = crate::fingerprint::device_name().unwrap_or_else(|_| "Unknown PC".to_string());

    let rpc_resp = http
        .post(format!("{}/rest/v1/rpc/check_and_bind_fingerprint", CONFIG.supabase.url))
        .header("apikey", &CONFIG.supabase.anon_key)
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "p_fingerprint": fingerprint, "p_device_name": device_name }))
        .send()
        .await
        .map_err(|e| LoginError::InvalidCredentials {
            message: format!("network error checking device fingerprint: {e}"),
        })?;

    let check: FingerprintCheckResponse =
        rpc_resp.json().await.map_err(|e| LoginError::InvalidCredentials {
            message: format!("failed to parse fingerprint-check response: {e}"),
        })?;

    if !check.allowed {
        return Err(LoginError::WrongDevice { bound_device_name: check.bound_device_name });
    }

    store_session(&access_token, &refresh_token).map_err(|e| LoginError::InvalidCredentials { message: e })?;
    Ok(())
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn store_session(access_token: &str, refresh_token: &str) -> Result<(), String> {
    let entry = keyring_entry().map_err(|e| format!("failed to open credential store: {e}"))?;
    let payload = serde_json::to_string(&StoredSession {
        access_token: access_token.to_string(),
        refresh_token: refresh_token.to_string(),
        stored_at: now_unix_secs(),
    })
    .map_err(|e| format!("failed to serialize session: {e}"))?;
    entry.set_password(&payload).map_err(|e| format!("failed to store session: {e}"))
}

/// True if a previously stored session exists AND is still within its
/// SESSION_TTL_SECS (24h) window — a session past that window is treated
/// as absent (and its keyring entry is cleared), so the login screen
/// reappears once a day even though the underlying Supabase token might
/// still technically be valid. Does not itself re-validate the token
/// against Supabase beyond the age check; the frontend should retry login
/// if a subsequent action fails with 401.
pub fn has_stored_session() -> bool {
    let Ok(entry) = keyring_entry() else {
        return false;
    };
    let Ok(payload) = entry.get_password() else {
        return false;
    };
    let Ok(session) = serde_json::from_str::<StoredSession>(&payload) else {
        // A pre-existing session stored before stored_at was added won't
        // parse into the new shape — treat it as expired rather than
        // erroring, so the user is just asked to log in again once.
        let _ = entry.delete_credential();
        return false;
    };

    let age = now_unix_secs().saturating_sub(session.stored_at);
    if age > CONFIG.session.ttl_secs {
        let _ = entry.delete_credential();
        return false;
    }

    true
}

/// Clears the stored session (logout).
pub fn clear_session() -> Result<(), String> {
    let entry = keyring_entry().map_err(|e| format!("failed to open credential store: {e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("failed to clear session: {e}")),
    }
}
