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
// to auth.uid() = the caller's own row).

use keyring::Entry;
use serde::{Deserialize, Serialize};

const SUPABASE_URL: &str = "https://kduqhvzqxongeeglhuim.supabase.co";
const SUPABASE_ANON_KEY: &str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtkdXFodnpxeG9uZ2VlZ2xodWltIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4NzE1MDUsImV4cCI6MjEwMTQ0NzUwNX0.uuWUKsMyLlQ4cAUat3OAnEzJ0Su6awe19VEVF6iMkUE";

const KEYRING_SERVICE: &str = "com.jsaicategory.humanize";
const KEYRING_USER: &str = "session";

/// A stored session is only honored for this long — past it,
/// has_stored_session() reports false (and clears the stale entry) so the
/// login screen reappears once per day, even though the underlying
/// Supabase refresh token itself may still be valid for longer.
const SESSION_TTL_SECS: u64 = 24 * 60 * 60;

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
        .post(format!("{SUPABASE_URL}/auth/v1/token?grant_type=password"))
        .header("apikey", SUPABASE_ANON_KEY)
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

    if !status.is_success() {
        let reason = token
            .error_description
            .or(token.msg)
            .unwrap_or_else(|| "invalid email or password".to_string());
        return Err(LoginError::InvalidCredentials { message: reason });
    }

    let fingerprint = crate::fingerprint::compute()
        .map_err(|e| LoginError::InvalidCredentials { message: e })?;
    let device_name = crate::fingerprint::device_name().unwrap_or_else(|_| "Unknown PC".to_string());

    let rpc_resp = http
        .post(format!("{SUPABASE_URL}/rest/v1/rpc/check_and_bind_fingerprint"))
        .header("apikey", SUPABASE_ANON_KEY)
        .header("Authorization", format!("Bearer {}", token.access_token))
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

    store_session(&token.access_token, &token.refresh_token)
        .map_err(|e| LoginError::InvalidCredentials { message: e })?;
    Ok(())
}

fn now_unix_secs() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn store_session(access_token: &str, refresh_token: &str) -> Result<(), String> {
    let entry = Entry::new(KEYRING_SERVICE, KEYRING_USER)
        .map_err(|e| format!("failed to open credential store: {e}"))?;
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
    let Ok(entry) = Entry::new(KEYRING_SERVICE, KEYRING_USER) else {
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
    if age > SESSION_TTL_SECS {
        let _ = entry.delete_credential();
        return false;
    }

    true
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
