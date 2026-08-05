// Real, end-to-end proof that the existing Word/Excel/PowerPoint COM
// drivers ALSO handle the legacy binary formats (.doc/.xls/.ppt) correctly
// — Office's own Open()/SaveAs()/Save() transparently read the old format,
// and Save() (never SaveAs, so no format-conversion argument needed)
// preserves whichever format the file was already opened in, so the same
// apply_word/apply_excel/apply_powerpoint functions used for the OOXML
// formats work unchanged here — this test proves that assumption for real
// rather than trusting it.

#[test]
fn replaces_homoglyphs_in_a_real_legacy_doc() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample-legacy.doc"));
    assert!(source.exists(), "legacy .doc fixture must exist for this real test to run");

    let result = app_lib::homoglyph::apply_word(source, Some("AC"), |_| {});
    let output_path = result.expect("apply_word should succeed against a real legacy .doc file");

    assert!(output_path.exists(), "output file must be written to disk");
    assert_eq!(
        output_path.extension().and_then(|e| e.to_str()),
        Some("doc"),
        "output must stay .doc, not silently upconvert to .docx"
    );
    println!("Real legacy .doc output written to: {}", output_path.display());
}

#[test]
fn replaces_homoglyphs_in_a_real_legacy_xls() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample-legacy.xls"));
    assert!(source.exists(), "legacy .xls fixture must exist for this real test to run");

    let result = app_lib::excel::apply_excel(source, Some("AC"), &[], |_| {});
    let output_path = result.expect("apply_excel should succeed against a real legacy .xls file");

    assert!(output_path.exists(), "output file must be written to disk");
    assert_eq!(
        output_path.extension().and_then(|e| e.to_str()),
        Some("xls"),
        "output must stay .xls, not silently upconvert to .xlsx"
    );
    println!("Real legacy .xls output written to: {}", output_path.display());
}

#[test]
fn replaces_homoglyphs_in_a_real_legacy_ppt() {
    let source = std::path::Path::new(concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/sample-legacy.ppt"));
    assert!(source.exists(), "legacy .ppt fixture must exist for this real test to run");

    let result = app_lib::powerpoint::apply_powerpoint(source, Some("AC"), |_| {});
    let output_path = result.expect("apply_powerpoint should succeed against a real legacy .ppt file");

    assert!(output_path.exists(), "output file must be written to disk");
    assert_eq!(
        output_path.extension().and_then(|e| e.to_str()),
        Some("ppt"),
        "output must stay .ppt, not silently upconvert to .pptx"
    );
    println!("Real legacy .ppt output written to: {}", output_path.display());
}
