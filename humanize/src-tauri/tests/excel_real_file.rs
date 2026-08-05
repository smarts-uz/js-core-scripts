// Real, end-to-end proof that app_lib::excel::apply_excel actually drives
// Excel.Application via COM and produces the correct "<name> L<count>.ext"
// output — no mock, no stand-in. Requires a real Excel install (same
// requirement as the rest of this app). The fixture (tests/fixtures/
// sample.xlsx) contains "ACE Test" in cell A1 and "Plain text" in B1, on a
// sheet named "Data" (not excluded).

#[test]
fn replaces_homoglyphs_in_a_real_sample_xlsx() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample.xlsx"));
    assert!(source.exists(), "sample fixture must exist for this real test to run");

    let mut progress_events = Vec::new();
    let result = app_lib::excel::apply_excel(
        source,
        Some("AC"),
        &["Results", "Lookup", "ALL", "App", "Stroop", "TMT", "DST", "LMWT", "NS", "EEG"],
        |p| progress_events.push((p.latin.clone(), p.found)),
    );
    let output_path = result.expect("apply_excel should succeed against a real Excel install");

    assert!(output_path.exists(), "output file must be written to disk");
    let file_name = output_path.file_name().unwrap().to_string_lossy();
    assert!(file_name.contains("L2"), "output filename must contain 'L2' (2 chars requested), got: {file_name}");

    assert_eq!(
        progress_events,
        vec![("A".to_string(), true), ("C".to_string(), true)],
        "both A and C must be found and replaced — the fixture's 'ACE Test' cell contains both"
    );

    println!("Real output written to: {}", output_path.display());
}
