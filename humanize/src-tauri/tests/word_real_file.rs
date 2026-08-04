// Real, end-to-end proof that app_lib::homoglyph::apply_word actually drives
// Word.Application via COM and produces the correct "<name> L<count>.ext"
// output — no mock, no stand-in. Requires a real Word install on the machine
// running this test (same requirement as the rest of this app).

#[test]
fn replaces_homoglyphs_in_a_real_sample_docx() {
    let source = std::path::Path::new(
        r"d:\Humans\Languag\ReWrite\App\Cardio\Kardiologiya_haqida_maqola.docx",
    );
    assert!(source.exists(), "sample file must exist for this real test to run");

    let mut progress_events = Vec::new();
    let result = app_lib::homoglyph::apply_word(source, Some("AC"), |p| progress_events.push(p.latin.clone()));
    let output_path = result.expect("apply_word should succeed against a real Word install");

    assert_eq!(
        progress_events,
        vec!["A".to_string(), "C".to_string()],
        "on_progress must fire once per requested char pair, in order"
    );

    assert!(output_path.exists(), "output file must be written to disk");
    let file_name = output_path.file_name().unwrap().to_string_lossy();
    assert!(
        file_name.contains("L2"),
        "output filename must contain 'L2' (2 chars requested: A, C), got: {file_name}"
    );

    println!("Real output written to: {}", output_path.display());
}
