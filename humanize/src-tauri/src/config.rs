// Loads config.json — every non-secret, tunable value this app reads,
// embedded into the compiled binary at build time (never a loose file
// shipped alongside app.exe; changing a value needs a rebuild). See
// CONFIG.md for what each key means and why. A genuine secret (the
// Supabase Management API token) never lives here — see auth.rs's
// SUPABASE_ACCESS_TOKEN env var handling instead.

use serde::Deserialize;
use std::sync::LazyLock;

const RAW_CONFIG: &str = include_str!("../config.json");

#[derive(Deserialize)]
pub struct Config {
    pub supabase: SupabaseConfig,
    pub session: SessionConfig,
    pub keyring: KeyringConfig,
    pub excel: ExcelConfig,
    pub homoglyph: HomoglyphConfig,
}

#[derive(Deserialize)]
pub struct SupabaseConfig {
    pub url: String,
    #[serde(rename = "anonKey")]
    pub anon_key: String,
    #[serde(rename = "projectRef")]
    #[allow(dead_code)] // not read by the compiled app itself; documented for maintenance scripts
    pub project_ref: String,
}

#[derive(Deserialize)]
pub struct SessionConfig {
    #[serde(rename = "ttlSecs")]
    pub ttl_secs: u64,
}

#[derive(Deserialize)]
pub struct KeyringConfig {
    pub service: String,
    pub user: String,
}

#[derive(Deserialize)]
pub struct ExcelConfig {
    #[serde(rename = "excludedSheets")]
    pub excluded_sheets: Vec<String>,
}

#[derive(Deserialize)]
pub struct HomoglyphPair {
    pub latin: String,
    pub cyrillic: String,
}

#[derive(Deserialize)]
pub struct HomoglyphConfig {
    #[serde(rename = "perfectStealth")]
    pub perfect_stealth: Vec<HomoglyphPair>,
}

/// The parsed config.json, loaded once and shared for the lifetime of the
/// process. Panics on first access if config.json is malformed — this is a
/// build-time-embedded file under our own control, so a parse failure here
/// is a real bug to fix, not a runtime condition to handle gracefully.
pub static CONFIG: LazyLock<Config> =
    LazyLock::new(|| serde_json::from_str(RAW_CONFIG).expect("config.json must be valid JSON matching the Config shape"));
