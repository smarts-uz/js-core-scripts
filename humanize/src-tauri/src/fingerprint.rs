// Builds a stable per-machine fingerprint used to lock a user account to the
// first PC it logs in from. Combines two identifiers that both survive a
// normal Windows reinstall-free lifetime (a fresh Windows install DOES
// regenerate both, which is the intended behavior — the lock is meant to
// tie an account to a physical machine's current install, not survive OS
// reinstalls) but are NOT trivially user-editable through the Settings UI:
//
//   1. The C: volume serial number (GetVolumeInformationW) — regenerated
//      only by reformatting the C: drive.
//   2. The registry MachineGuid (HKLM\SOFTWARE\Microsoft\Cryptography) —
//      generated once at Windows install time, stable across reboots.
//
// Both are hashed together (SHA-256) into one opaque fingerprint string, so
// neither raw identifier is ever transmitted or stored — only the digest.

use sha2::{Digest, Sha256};
use windows::core::PCWSTR;
use windows::Win32::Foundation::ERROR_SUCCESS;
use windows::Win32::Storage::FileSystem::GetVolumeInformationW;
use windows::Win32::System::Registry::{
    RegCloseKey, RegOpenKeyExW, RegQueryValueExW, HKEY, HKEY_LOCAL_MACHINE, KEY_READ,
    REG_VALUE_TYPE,
};
use windows::Win32::System::SystemInformation::{ComputerNamePhysicalDnsHostname, GetComputerNameExW};

fn c_drive_volume_serial() -> Result<u32, String> {
    let root: Vec<u16> = "C:\\\0".encode_utf16().collect();
    let mut serial: u32 = 0;

    unsafe {
        GetVolumeInformationW(
            PCWSTR(root.as_ptr()),
            None,
            Some(&mut serial),
            None,
            None,
            None,
        )
        .map_err(|e| format!("GetVolumeInformationW failed: {e}"))?;
    }

    Ok(serial)
}

/// Reads HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid via the raw Win32
/// registry API (no extra crate needed — the `windows` crate already
/// exposes RegOpenKeyExW/RegQueryValueExW).
fn machine_guid() -> Result<String, String> {
    let subkey: Vec<u16> = "SOFTWARE\\Microsoft\\Cryptography\0".encode_utf16().collect();
    let value_name: Vec<u16> = "MachineGuid\0".encode_utf16().collect();

    let mut hkey = HKEY::default();
    unsafe {
        let result = RegOpenKeyExW(
            HKEY_LOCAL_MACHINE,
            PCWSTR(subkey.as_ptr()),
            Some(0),
            KEY_READ,
            &mut hkey,
        );
        if result != ERROR_SUCCESS {
            return Err(format!("RegOpenKeyExW failed: {result:?}"));
        }
    }

    // Query the required buffer size first, then read the actual value.
    let mut value_type = REG_VALUE_TYPE(0);
    let mut data_len: u32 = 0;
    unsafe {
        let result = RegQueryValueExW(
            hkey,
            PCWSTR(value_name.as_ptr()),
            None,
            Some(&mut value_type),
            None,
            Some(&mut data_len),
        );
        if result != ERROR_SUCCESS {
            let _ = RegCloseKey(hkey);
            return Err(format!("RegQueryValueExW (size probe) failed: {result:?}"));
        }
    }

    let mut buffer = vec![0u8; data_len as usize];
    unsafe {
        let result = RegQueryValueExW(
            hkey,
            PCWSTR(value_name.as_ptr()),
            None,
            Some(&mut value_type),
            Some(buffer.as_mut_ptr()),
            Some(&mut data_len),
        );
        let _ = RegCloseKey(hkey);
        if result != ERROR_SUCCESS {
            return Err(format!("RegQueryValueExW (read) failed: {result:?}"));
        }
    }

    // REG_SZ data is UTF-16LE, NUL-terminated.
    let u16_data: Vec<u16> = buffer
        .chunks_exact(2)
        .map(|c| u16::from_le_bytes([c[0], c[1]]))
        .collect();
    let end = u16_data.iter().position(|&c| c == 0).unwrap_or(u16_data.len());
    String::from_utf16(&u16_data[..end]).map_err(|e| format!("MachineGuid was not valid UTF-16: {e}"))
}

/// The device fingerprint sent to Supabase's check_and_bind_fingerprint RPC —
/// a SHA-256 hex digest of "<volume-serial>:<machine-guid>". Never the raw
/// identifiers themselves.
pub fn compute() -> Result<String, String> {
    let serial = c_drive_volume_serial()?;
    let guid = machine_guid()?;

    let mut hasher = Sha256::new();
    hasher.update(format!("{serial:08x}:{guid}").as_bytes());
    let digest = hasher.finalize();

    Ok(digest.iter().map(|b| format!("{b:02x}")).collect())
}

/// This machine's human-readable network name (its DNS hostname, e.g.
/// "DESKTOP-ABC123") — sent alongside the fingerprint purely so a rejected
/// login (wrong machine) can tell the user WHICH machine the account is
/// bound to, without exposing the raw fingerprint identifiers themselves.
pub fn device_name() -> Result<String, String> {
    // Query the required buffer size first (in WCHARs, including the NUL).
    let mut len: u32 = 0;
    unsafe {
        // A too-small buffer error here is EXPECTED — it's how the size is
        // discovered; only bail if len comes back zero (a real failure).
        let _ = GetComputerNameExW(ComputerNamePhysicalDnsHostname, None, &mut len);
    }
    if len == 0 {
        return Err("GetComputerNameExW returned an empty size".to_string());
    }

    let mut buffer = vec![0u16; len as usize];
    unsafe {
        GetComputerNameExW(
            ComputerNamePhysicalDnsHostname,
            Some(windows::core::PWSTR(buffer.as_mut_ptr())),
            &mut len,
        )
        .map_err(|e| format!("GetComputerNameExW failed: {e}"))?;
    }

    String::from_utf16(&buffer[..len as usize])
        .map_err(|e| format!("computer name was not valid UTF-16: {e}"))
}
