// Real, end-to-end proof that machine_info::collect() actually queries WMI
// on this real machine and returns genuine OS/hardware data — no mock.

#[test]
fn collects_real_machine_info_via_wmi() {
    let info = app_lib::machine_info::collect();

    assert!(info.computer_name.is_some(), "computer_name must be collected");
    println!("Computer name: {:?}", info.computer_name);

    assert!(info.os.caption.is_some(), "OS caption must be collected");
    assert!(info.os.version.is_some(), "OS version must be collected");
    println!("OS: {:?} {:?} (build {:?})", info.os.caption, info.os.version, info.os.build_number);

    assert!(info.computer_system.manufacturer.is_some(), "computer manufacturer must be collected");
    println!(
        "System: {:?} {:?}, {} logical processor(s)",
        info.computer_system.manufacturer,
        info.computer_system.model,
        info.computer_system.number_of_processors.unwrap_or(0)
    );

    assert!(!info.processors.is_empty(), "at least one processor must be collected");
    println!("CPU: {:?}", info.processors[0].name);

    assert!(!info.disks.is_empty(), "at least one disk must be collected");
    println!("Disk: {:?} ({:?} bytes)", info.disks[0].model, info.disks[0].size_bytes);

    // Serializes cleanly to JSON (the shape sent to record_login_machine_info).
    let json = serde_json::to_string(&info).expect("machine info must serialize to JSON");
    assert!(json.len() > 100, "serialized machine info should be substantial, got {} bytes", json.len());
    println!("Serialized machine info: {} bytes", json.len());
}
