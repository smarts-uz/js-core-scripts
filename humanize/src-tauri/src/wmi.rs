// Minimal WMI query helper via real generated COM bindings (the `windows`
// crate DOES ship proper typed bindings for WMI's IWbemServices/
// IWbemLocator/IEnumWbemClassObject — unlike Word/Excel/PowerPoint, which
// have no type library and need the late-bound IDispatch approach in
// com_automation.rs). Used by machine_info.rs to collect real OS/hardware
// details for the machine-info snapshot sent on every login.

use crate::com_automation::{variant_to_i32, variant_to_string};
use windows::core::{BSTR, Result};
use windows::Win32::System::Com::{
    CoCreateInstance, CoSetProxyBlanket, CLSCTX_INPROC_SERVER, EOAC_NONE, RPC_C_AUTHN_LEVEL_CALL,
    RPC_C_IMP_LEVEL_IMPERSONATE,
};
use windows::Win32::System::Rpc::RPC_C_AUTHN_WINNT;
use windows::Win32::System::Variant::{VARIANT, VT_I4, VT_UI4};
use windows::Win32::System::Wmi::{
    IWbemClassObject, IWbemLocator, WbemLocator, WBEM_FLAG_FORWARD_ONLY, WBEM_FLAG_RETURN_IMMEDIATELY,
    WBEM_GENERIC_FLAG_TYPE, WBEM_INFINITE,
};

/// One row from a WMI query result, as a name→VARIANT map the caller reads
/// specific fields from via `get_string`/`get_i32`.
pub struct WmiRow(IWbemClassObject);

impl WmiRow {
    /// Reads a property as a string. WMI marshals a genuinely large
    /// 64-bit numeric property (e.g. TotalPhysicalMemory, a disk's Size)
    /// as VT_BSTR specifically to avoid VARIANT overflow, so this is the
    /// correct accessor for those fields too — but as a fallback, an
    /// ordinary VT_I4/VT_UI4 numeric property is also accepted and
    /// stringified, so a caller never has to guess which accessor a given
    /// WMI class actually uses for a field.
    pub fn get_string(&self, name: &str) -> Option<String> {
        let mut variant = VARIANT::default();
        unsafe {
            self.0.Get(&BSTR::from(name), 0, &mut variant, None, None).ok()?;
        }
        if let Ok(s) = variant_to_string(&variant) {
            return Some(s);
        }
        let vt = unsafe { variant.Anonymous.Anonymous.vt };
        if vt == VT_I4 || vt == VT_UI4 {
            return variant_to_i32(&variant).ok().map(|n| n.to_string());
        }
        None
    }

    pub fn get_i32(&self, name: &str) -> Option<i32> {
        let mut variant = VARIANT::default();
        unsafe {
            self.0.Get(&BSTR::from(name), 0, &mut variant, None, None).ok()?;
        }
        variant_to_i32(&variant).ok()
    }
}

/// Connects to the local machine's ROOT\CIMV2 WMI namespace and runs a WQL
/// query, returning every result row. Must be called after CoInitializeEx
/// (the caller — machine_info.rs — already does this for the COM calls it
/// shares with the Office automation path).
pub fn query(wql: &str) -> Result<Vec<WmiRow>> {
    unsafe {
        let locator: IWbemLocator = CoCreateInstance(&WbemLocator, None, CLSCTX_INPROC_SERVER)?;

        let services = locator.ConnectServer(
            &BSTR::from("ROOT\\CIMV2"),
            &BSTR::new(),
            &BSTR::new(),
            &BSTR::new(),
            0,
            &BSTR::new(),
            None,
        )?;

        CoSetProxyBlanket(
            &services,
            RPC_C_AUTHN_WINNT,
            0,
            None,
            RPC_C_AUTHN_LEVEL_CALL,
            RPC_C_IMP_LEVEL_IMPERSONATE,
            None,
            EOAC_NONE,
        )?;

        let enumerator = services.ExecQuery(
            &BSTR::from("WQL"),
            &BSTR::from(wql),
            WBEM_GENERIC_FLAG_TYPE(WBEM_FLAG_FORWARD_ONLY.0 | WBEM_FLAG_RETURN_IMMEDIATELY.0),
            None,
        )?;

        let mut rows = Vec::new();
        loop {
            let mut result: [Option<IWbemClassObject>; 1] = [None];
            let mut returned: u32 = 0;
            let hr = enumerator.Next(WBEM_INFINITE, &mut result, &mut returned);
            if returned == 0 || hr.is_err() {
                break;
            }
            if let Some(obj) = result[0].take() {
                rows.push(WmiRow(obj));
            }
        }

        Ok(rows)
    }
}
