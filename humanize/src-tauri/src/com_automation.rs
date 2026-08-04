// Late-bound (IDispatch) COM automation — the Rust equivalent of what winax/
// VBScript provide for free: calling a method or reading/writing a property
// on a COM Automation object BY NAME, with no compile-time type-library
// bindings. `windows-rs` has no generic "call by name" helper (that only
// exists once real bindings are generated from the target app's own type
// library, which Word/Excel/PowerPoint don't ship pre-generated for), so this
// module hand-implements the same GetIDsOfNames + Invoke pattern winax uses
// internally, via raw Win32 COM calls.
//
// Every VARIANT this module produces must be released with VariantClear —
// callers own the returned VARIANT and must clear it (or wrap it in a guard).

use windows::core::{BSTR, Error, HRESULT, Result};
use windows::Win32::Foundation::DISP_E_EXCEPTION;
use windows::Win32::System::Com::{
    CLSCTX_LOCAL_SERVER, CoCreateInstance, DISPATCH_METHOD, DISPATCH_PROPERTYGET,
    DISPATCH_PROPERTYPUT, DISPPARAMS, EXCEPINFO, IDispatch,
};
use windows::Win32::System::Ole::DISPID_PROPERTYPUT;
use windows::Win32::System::Variant::{VARIANT, VT_BSTR, VT_BOOL, VT_DISPATCH, VT_I4};
use std::mem::ManuallyDrop;

const LOCALE_USER_DEFAULT: u32 = 0x0400;

/// Creates the given COM Application object (e.g. "Word.Application") via its
/// ProgID and returns its default IDispatch. Equivalent to winax's
/// `new winax.Object('Word.Application')`.
pub fn create_com_object(prog_id: &str) -> Result<IDispatch> {
    unsafe {
        let clsid = windows::core::GUID::from(
            windows::Win32::System::Com::CLSIDFromProgID(&BSTR::from(prog_id))?,
        );
        CoCreateInstance(&clsid, None, CLSCTX_LOCAL_SERVER)
    }
}

/// Resolves a member name (method or property) to its DISPID via
/// GetIDsOfNames — the same lookup winax performs on every named call.
fn resolve_dispid(dispatch: &IDispatch, name: &str) -> Result<i32> {
    unsafe {
        let wide_name: Vec<u16> = name.encode_utf16().chain(std::iter::once(0)).collect();
        let mut names = [windows::core::PCWSTR(wide_name.as_ptr())];
        let mut dispid = 0i32;
        dispatch.GetIDsOfNames(
            &windows::core::GUID::zeroed(),
            names.as_mut_ptr(),
            1,
            LOCALE_USER_DEFAULT,
            &mut dispid,
        )?;
        Ok(dispid)
    }
}

/// A owned VARIANT wrapper that calls VariantClear on Drop, so a caller never
/// has to remember the cleanup step manually (the single biggest footgun in
/// hand-rolled COM automation).
pub struct OwnedVariant(pub VARIANT);

impl Drop for OwnedVariant {
    fn drop(&mut self) {
        unsafe {
            let _ = windows::Win32::System::Variant::VariantClear(&mut self.0);
        }
    }
}

/// Builds a VT_BSTR VARIANT from a Rust string slice.
pub fn variant_from_str(value: &str) -> VARIANT {
    let bstr = BSTR::from(value);
    unsafe {
        std::mem::transmute_copy(&windows::Win32::System::Variant::VARIANT_0_0 {
            vt: VT_BSTR,
            wReserved1: 0,
            wReserved2: 0,
            wReserved3: 0,
            Anonymous: windows::Win32::System::Variant::VARIANT_0_0_0 {
                bstrVal: ManuallyDrop::new(bstr),
            },
        })
    }
}

/// Builds a VT_I4 VARIANT from an i32.
pub fn variant_from_i32(value: i32) -> VARIANT {
    unsafe {
        std::mem::transmute_copy(&windows::Win32::System::Variant::VARIANT_0_0 {
            vt: VT_I4,
            wReserved1: 0,
            wReserved2: 0,
            wReserved3: 0,
            Anonymous: windows::Win32::System::Variant::VARIANT_0_0_0 { lVal: value },
        })
    }
}

/// Builds a VT_BOOL VARIANT (COM VARIANT_BOOL: -1 = TRUE, 0 = FALSE).
pub fn variant_from_bool(value: bool) -> VARIANT {
    use windows::Win32::Foundation::VARIANT_BOOL;
    unsafe {
        std::mem::transmute_copy(&windows::Win32::System::Variant::VARIANT_0_0 {
            vt: VT_BOOL,
            wReserved1: 0,
            wReserved2: 0,
            wReserved3: 0,
            Anonymous: windows::Win32::System::Variant::VARIANT_0_0_0 {
                boolVal: if value { VARIANT_BOOL(-1) } else { VARIANT_BOOL(0) },
            },
        })
    }
}

/// Builds a VT_DISPATCH VARIANT wrapping another IDispatch (used to pass an
/// object, e.g. a Document, as an argument to another call).
pub fn variant_from_dispatch(dispatch: &IDispatch) -> VARIANT {
    unsafe {
        std::mem::transmute_copy(&windows::Win32::System::Variant::VARIANT_0_0 {
            vt: VT_DISPATCH,
            wReserved1: 0,
            wReserved2: 0,
            wReserved3: 0,
            Anonymous: windows::Win32::System::Variant::VARIANT_0_0_0 {
                pdispVal: ManuallyDrop::new(Some(dispatch.clone())),
            },
        })
    }
}

/// Invokes a method BY NAME on an IDispatch, with positional arguments —
/// the Rust equivalent of `object.methodName(args...)` in winax/VBScript.
/// Arguments are passed in REVERSE order internally (COM's own DISPPARAMS
/// convention), but callers supply them in normal left-to-right order here.
pub fn invoke_method(dispatch: &IDispatch, name: &str, args: &mut [VARIANT]) -> Result<OwnedVariant> {
    invoke(dispatch, name, args, DISPATCH_METHOD)
}

/// Reads a property BY NAME — the Rust equivalent of `object.propertyName`.
pub fn get_property(dispatch: &IDispatch, name: &str) -> Result<OwnedVariant> {
    invoke(dispatch, name, &mut [], DISPATCH_PROPERTYGET)
}

/// Writes a property BY NAME — the Rust equivalent of `object.propertyName = value`.
pub fn put_property(dispatch: &IDispatch, name: &str, value: VARIANT) -> Result<()> {
    let mut args = [value];
    let mut dispid_named = DISPID_PROPERTYPUT;
    unsafe {
        let dispid = resolve_dispid(dispatch, name)?;
        let params = DISPPARAMS {
            rgvarg: args.as_mut_ptr(),
            rgdispidNamedArgs: &mut dispid_named,
            cArgs: 1,
            cNamedArgs: 1,
        };
        let mut exception = EXCEPINFO::default();
        dispatch
            .Invoke(
                dispid,
                &windows::core::GUID::zeroed(),
                LOCALE_USER_DEFAULT,
                DISPATCH_PROPERTYPUT,
                &params,
                None,
                Some(&mut exception),
                None,
            )
            .map_err(|e| annotate_dispatch_error(e, name, &exception))?;
    }
    // The VARIANT in `args` was consumed by-value into DISPPARAMS; the caller
    // handed us ownership via `value`, so clear it here.
    unsafe {
        let _ = windows::Win32::System::Variant::VariantClear(&mut args[0]);
    }
    Ok(())
}

fn invoke(
    dispatch: &IDispatch,
    name: &str,
    args: &mut [VARIANT],
    flags: windows::Win32::System::Com::DISPATCH_FLAGS,
) -> Result<OwnedVariant> {
    unsafe {
        let dispid = resolve_dispid(dispatch, name)?;
        // DISPPARAMS expects arguments in REVERSE order (COM convention).
        args.reverse();
        let params = DISPPARAMS {
            rgvarg: args.as_mut_ptr(),
            rgdispidNamedArgs: std::ptr::null_mut(),
            cArgs: args.len() as u32,
            cNamedArgs: 0,
        };
        let mut result = VARIANT::default();
        let mut exception = EXCEPINFO::default();
        dispatch
            .Invoke(
                dispid,
                &windows::core::GUID::zeroed(),
                LOCALE_USER_DEFAULT,
                flags,
                &params,
                Some(&mut result),
                Some(&mut exception),
                None,
            )
            .map_err(|e| annotate_dispatch_error(e, name, &exception))?;
        Ok(OwnedVariant(result))
    }
}

/// Enriches a raw HRESULT error with the COM Automation exception's own
/// description (bstrDescription/bstrSource), when the failure was
/// DISP_E_EXCEPTION — otherwise the caller only sees an opaque HRESULT code,
/// which is far less useful than the real "Word couldn't find X" message.
fn annotate_dispatch_error(err: Error, member: &str, exception: &EXCEPINFO) -> Error {
    if err.code() == HRESULT::from(DISP_E_EXCEPTION) {
        let desc = if !exception.bstrDescription.is_empty() {
            exception.bstrDescription.to_string()
        } else {
            "(no description)".to_string()
        };
        Error::new(err.code(), format!("{member} failed: {desc}"))
    } else {
        Error::new(err.code(), format!("{member} failed: {err}"))
    }
}
