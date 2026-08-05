// Real, end-to-end proof that app_lib::text::apply_text correctly replaces
// homoglyphs in plain Markdown/text files — a straight read → replace →
// write, no COM/mocking involved.

#[test]
fn replaces_homoglyphs_in_a_real_md_file() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample.md"));
    assert!(source.exists(), "sample.md fixture must exist for this real test to run");

    let mut progress_events = Vec::new();
    let result = app_lib::text::apply_text(source, Some("AC"), |p| progress_events.push((p.latin.clone(), p.found)));
    let output_path = result.expect("apply_text should succeed against a real .md file");

    assert!(output_path.exists(), "output file must be written to disk");
    assert_eq!(output_path.extension().and_then(|e| e.to_str()), Some("md"), "output must stay .md");

    let output_content = std::fs::read_to_string(&output_path).expect("output file should be readable");
    assert!(
        output_content.contains('А') && output_content.contains('С'),
        "output must contain the Cyrillic replacements, got: {output_content}"
    );
    assert!(
        !output_content.contains("ACE"),
        "output must NOT contain the original Latin 'ACE' sequence anymore, got: {output_content}"
    );

    assert_eq!(
        progress_events,
        vec![("A".to_string(), true), ("C".to_string(), true)],
        "both A and C must be found and replaced — the fixture's content contains both"
    );

    println!("Real .md output written to: {}", output_path.display());
}

#[test]
fn replaces_homoglyphs_in_a_real_txt_file() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample.txt"));
    assert!(source.exists(), "sample.txt fixture must exist for this real test to run");

    let result = app_lib::text::apply_text(source, Some("AC"), |_| {});
    let output_path = result.expect("apply_text should succeed against a real .txt file");

    assert!(output_path.exists(), "output file must be written to disk");
    assert_eq!(output_path.extension().and_then(|e| e.to_str()), Some("txt"), "output must stay .txt");

    let output_content = std::fs::read_to_string(&output_path).expect("output file should be readable");
    assert!(
        output_content.contains('А') && output_content.contains('С'),
        "output must contain the Cyrillic replacements, got: {output_content}"
    );

    println!("Real .txt output written to: {}", output_path.display());
}
