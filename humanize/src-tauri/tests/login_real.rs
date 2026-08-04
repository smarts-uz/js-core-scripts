// Real, end-to-end proof that auth::login actually reaches the live
// Supabase project, validates the password, computes this machine's real
// fingerprint, and binds/checks it via check_and_bind_fingerprint — no mock.

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
}
