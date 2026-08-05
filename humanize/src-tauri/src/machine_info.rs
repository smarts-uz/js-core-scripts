// Collects a full OS/user/hardware snapshot of the machine this app is
// running on, via WMI (see wmi.rs). Sent to Supabase on every successful
// login (auth.rs), alongside the device fingerprint, so the humanize
// project owner has a full record of which physical machines are actually
// using each account — not just the opaque fingerprint hash.

use crate::wmi::query;
use serde::Serialize;

#[derive(Serialize, Default)]
pub struct OsInfo {
    pub caption: Option<String>,
    pub version: Option<String>,
    pub build_number: Option<String>,
    pub architecture: Option<String>,
    pub install_date: Option<String>,
    pub last_boot_up_time: Option<String>,
    pub free_physical_memory_kb: Option<i32>,
    pub total_visible_memory_kb: Option<i32>,
}

#[derive(Serialize, Default)]
pub struct ComputerSystemInfo {
    pub manufacturer: Option<String>,
    pub model: Option<String>,
    pub system_type: Option<String>,
    pub total_physical_memory_bytes: Option<String>,
    pub number_of_processors: Option<i32>,
    pub domain: Option<String>,
    pub username: Option<String>,
}

#[derive(Serialize, Default)]
pub struct ProcessorInfo {
    pub name: Option<String>,
    pub manufacturer: Option<String>,
    pub number_of_cores: Option<i32>,
    pub number_of_logical_processors: Option<i32>,
    pub max_clock_speed_mhz: Option<i32>,
}

#[derive(Serialize, Default)]
pub struct MemoryModule {
    pub capacity_bytes: Option<String>,
    pub manufacturer: Option<String>,
    pub speed_mhz: Option<i32>,
    pub device_locator: Option<String>,
}

#[derive(Serialize, Default)]
pub struct DiskInfo {
    pub model: Option<String>,
    pub interface_type: Option<String>,
    pub size_bytes: Option<String>,
    pub media_type: Option<String>,
}

#[derive(Serialize, Default)]
pub struct VideoControllerInfo {
    pub name: Option<String>,
    pub adapter_ram_bytes: Option<String>,
    pub driver_version: Option<String>,
}

#[derive(Serialize, Default)]
pub struct BaseBoardInfo {
    pub manufacturer: Option<String>,
    pub product: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Serialize, Default)]
pub struct BiosInfo {
    pub manufacturer: Option<String>,
    pub name: Option<String>,
    pub version: Option<String>,
    pub serial_number: Option<String>,
}

#[derive(Serialize, Default)]
pub struct MachineInfo {
    pub computer_name: Option<String>,
    pub os: OsInfo,
    pub computer_system: ComputerSystemInfo,
    pub processors: Vec<ProcessorInfo>,
    pub memory_modules: Vec<MemoryModule>,
    pub disks: Vec<DiskInfo>,
    pub video_controllers: Vec<VideoControllerInfo>,
    pub base_board: BaseBoardInfo,
    pub bios: BiosInfo,
}

/// Collects the full machine-info snapshot. Best-effort per WMI class — a
/// query that fails (e.g. a class genuinely absent on some machine
/// configuration) leaves that section's fields as None/empty rather than
/// failing the whole collection, since a partial snapshot is still far
/// more useful than none at all.
///
/// Initializes COM on the calling thread itself (WMI's IWbemLocator/
/// IWbemServices calls require it) — always call this from its own
/// thread (e.g. via `spawn_blocking`), never the same thread another
/// CoInitializeEx with a different concurrency model already ran on.
pub fn collect() -> MachineInfo {
    unsafe {
        let _ = windows::Win32::System::Com::CoInitializeEx(
            None,
            windows::Win32::System::Com::COINIT_MULTITHREADED,
        );
    }

    let mut info = MachineInfo::default();

    info.computer_name = crate::fingerprint::device_name().ok();

    if let Ok(rows) = query(
        "SELECT Caption, Version, BuildNumber, OSArchitecture, InstallDate, LastBootUpTime, \
         FreePhysicalMemory, TotalVisibleMemorySize FROM Win32_OperatingSystem",
    ) {
        if let Some(row) = rows.first() {
            info.os = OsInfo {
                caption: row.get_string("Caption"),
                version: row.get_string("Version"),
                build_number: row.get_string("BuildNumber"),
                architecture: row.get_string("OSArchitecture"),
                install_date: row.get_string("InstallDate"),
                last_boot_up_time: row.get_string("LastBootUpTime"),
                free_physical_memory_kb: row.get_i32("FreePhysicalMemory"),
                total_visible_memory_kb: row.get_i32("TotalVisibleMemorySize"),
            };
        }
    }

    if let Ok(rows) = query(
        "SELECT Manufacturer, Model, SystemType, TotalPhysicalMemory, NumberOfProcessors, \
         Domain, UserName FROM Win32_ComputerSystem",
    ) {
        if let Some(row) = rows.first() {
            info.computer_system = ComputerSystemInfo {
                manufacturer: row.get_string("Manufacturer"),
                model: row.get_string("Model"),
                system_type: row.get_string("SystemType"),
                total_physical_memory_bytes: row.get_string("TotalPhysicalMemory"),
                number_of_processors: row.get_i32("NumberOfProcessors"),
                domain: row.get_string("Domain"),
                username: row.get_string("UserName"),
            };
        }
    }

    if let Ok(rows) = query(
        "SELECT Name, Manufacturer, NumberOfCores, NumberOfLogicalProcessors, MaxClockSpeed \
         FROM Win32_Processor",
    ) {
        info.processors = rows
            .iter()
            .map(|row| ProcessorInfo {
                name: row.get_string("Name"),
                manufacturer: row.get_string("Manufacturer"),
                number_of_cores: row.get_i32("NumberOfCores"),
                number_of_logical_processors: row.get_i32("NumberOfLogicalProcessors"),
                max_clock_speed_mhz: row.get_i32("MaxClockSpeed"),
            })
            .collect();
    }

    if let Ok(rows) =
        query("SELECT Capacity, Manufacturer, Speed, DeviceLocator FROM Win32_PhysicalMemory")
    {
        info.memory_modules = rows
            .iter()
            .map(|row| MemoryModule {
                capacity_bytes: row.get_string("Capacity"),
                manufacturer: row.get_string("Manufacturer"),
                speed_mhz: row.get_i32("Speed"),
                device_locator: row.get_string("DeviceLocator"),
            })
            .collect();
    }

    if let Ok(rows) = query("SELECT Model, InterfaceType, Size, MediaType FROM Win32_DiskDrive") {
        info.disks = rows
            .iter()
            .map(|row| DiskInfo {
                model: row.get_string("Model"),
                interface_type: row.get_string("InterfaceType"),
                size_bytes: row.get_string("Size"),
                media_type: row.get_string("MediaType"),
            })
            .collect();
    }

    if let Ok(rows) = query("SELECT Name, AdapterRAM, DriverVersion FROM Win32_VideoController") {
        info.video_controllers = rows
            .iter()
            .map(|row| VideoControllerInfo {
                name: row.get_string("Name"),
                adapter_ram_bytes: row.get_string("AdapterRAM"),
                driver_version: row.get_string("DriverVersion"),
            })
            .collect();
    }

    if let Ok(rows) = query("SELECT Manufacturer, Product, SerialNumber FROM Win32_BaseBoard") {
        if let Some(row) = rows.first() {
            info.base_board = BaseBoardInfo {
                manufacturer: row.get_string("Manufacturer"),
                product: row.get_string("Product"),
                serial_number: row.get_string("SerialNumber"),
            };
        }
    }

    if let Ok(rows) = query("SELECT Manufacturer, Name, Version, SerialNumber FROM Win32_BIOS") {
        if let Some(row) = rows.first() {
            info.bios = BiosInfo {
                manufacturer: row.get_string("Manufacturer"),
                name: row.get_string("Name"),
                version: row.get_string("Version"),
                serial_number: row.get_string("SerialNumber"),
            };
        }
    }

    unsafe {
        windows::Win32::System::Com::CoUninitialize();
    }

    info
}
