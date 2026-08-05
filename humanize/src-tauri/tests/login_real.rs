// Real, end-to-end proof that auth::login actually reaches the live
// Supabase project, validates the password, computes this machine's real
// fingerprint, and binds/checks it via check_and_bind_fingerprint — no mock.

const GULCHIROY_USER_ID: &str = "75cc198f-07b0-4650-91c0-57062e9af62c";
const PROJECT_REF: &str = "kduqhvzqxongeeglhuim";

/// Runs a raw SQL statement against the live project via the Supabase
/// Management API — used only to set up / tear down the SIMULATED
/// other-machine binding this test needs, since a real second physical PC
/// isn't available to test the wrong-machine rejection path from. The
/// Management API token is a real secret and is NEVER hardcoded — it's read
/// from the SUPABASE_ACCESS_TOKEN env var (the same var the `supabase` CLI
/// itself uses), so this file is safe to commit.
async fn run_sql(query: &str) {
    let token = std::env::var("SUPABASE_ACCESS_TOKEN")
        .expect("SUPABASE_ACCESS_TOKEN must be set to run this test (Management API token)");
    let client = reqwest::Client::new();
    let resp = client
        .post(format!("https://api.supabase.com/v1/projects/{PROJECT_REF}/database/query"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "query": query }))
        .send()
        .await
        .expect("Management API request should succeed");
    assert!(resp.status().is_success(), "Management API query failed: {}", resp.status());
}

#[tokio::test]
async fn logs_in_and_binds_this_machine_fingerprint() {
    let fp = app_lib::fingerprint::compute().expect("fingerprint computation should succeed");
    assert_eq!(fp.len(), 64, "SHA-256 hex digest must be 64 chars, got: {fp}");
    println!("Computed device fingerprint: {fp}");

    let result = app_lib::auth::login("asror.zk@gmail.com", "u9Dk79b48VZNzDF4hp8q").await;
    assert!(result.is_ok(), "first login on this machine should succeed: {result:?}");

    let has_session = app_lib::auth::has_stored_session();
    assert!(has_session, "a session should be persisted after a successful login");

    // Logging in again from the SAME machine should still succeed (fingerprint matches).
    let second = app_lib::auth::login("asror.zk@gmail.com", "u9Dk79b48VZNzDF4hp8q").await;
    assert!(second.is_ok(), "a second login from the same machine should still succeed: {second:?}");

    app_lib::auth::clear_session().expect("clearing session should succeed");
}

#[tokio::test]
async fn rejects_wrong_password() {
    let result = app_lib::auth::login("asror.zk@gmail.com", "definitely-wrong-password").await;
    assert!(result.is_err(), "a wrong password must be rejected");
    match result.unwrap_err() {
        // Assert the MESSAGE, not just the variant — a real bug here
        // previously slipped past this test entirely: TokenResponse's
        // access_token/refresh_token were non-optional, so a genuine
        // Supabase error response (which has neither field) failed to
        // deserialize at all, and the resulting error message was the
        // opaque "failed to parse Supabase auth response: error decoding
        // response body" instead of a clean "Invalid email or password."
        // Both paths return InvalidCredentials, so checking only the enum
        // variant (as this test previously did) passed either way and
        // masked the bug — checking the message text is what actually
        // catches it.
        app_lib::auth::LoginError::InvalidCredentials { message } => {
            assert!(
                !message.to_lowercase().contains("failed to parse"),
                "a wrong-password rejection must show a clean message, not a raw parse-error \
                 leak — got: {message}"
            );
        }
        other => panic!("expected InvalidCredentials for a wrong password, got: {other:?}"),
    }
}

/// Self-contained: sets up gulchiroy@gmail.com's profile row with a
/// SIMULATED other machine's fingerprint/name (via the real Management
/// API), proves a correct-password login from THIS machine is still
/// rejected and names the bound machine, then restores the row to unbound
/// — so this test can run any number of times without external setup.
#[tokio::test]
async fn rejects_correct_password_from_a_different_machine() {
    run_sql(&format!(
        "update public.profiles set device_fingerprint = 'deadbeef_simulated_other_machine', \
         device_name = 'OFFICE-PC-07' where id = '{GULCHIROY_USER_ID}';"
    ))
    .await;

    let result = app_lib::auth::login("gulchiroy@gmail.com", "Y6ygNyV9Yeo9tnRLlYMS").await;

    // Restore the row to unbound BEFORE any assertion runs, so a failed
    // assertion (which panics and skips everything after it) can never
    // leave gulchiroy's account stuck in the simulated-bound state.
    run_sql(&format!(
        "update public.profiles set device_fingerprint = null, device_name = null \
         where id = '{GULCHIROY_USER_ID}';"
    ))
    .await;
    let _ = app_lib::auth::clear_session();

    assert!(result.is_err(), "a correct password from an unbound machine must still be rejected");
    match result.unwrap_err() {
        app_lib::auth::LoginError::WrongDevice { bound_device_name } => {
            assert_eq!(
                bound_device_name.as_deref(),
                Some("OFFICE-PC-07"),
                "the error must name the machine the account is actually bound to"
            );
            println!("Correctly rejected — account is bound to: {bound_device_name:?}");
        }
        other => panic!("expected WrongDevice, got: {other:?}"),
    }
}
