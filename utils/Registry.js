import { spawnSync } from 'child_process';

import { Yamls } from './Yamls.js';
import { Files } from './Files.js';
import { Dialogs } from './Dialogs.js';

/**
 * Registry — deterministic Windows registry maintenance helpers.
 *
 * These methods do NOT call any model; they shell out to PowerShell (via
 * -EncodedCommand, the same trick Dialogs uses) and parse the JSON envelope
 * the script prints back.
 *
 * Defaults live under the `Registry:` section of config.yml and are used
 * whenever the matching argument is omitted.
 */
export class Registry {

    /** Read a per-method config value, e.g. _cfg('clean', 'Hives'). */
    static _cfg(section, key, defaultValue = null) {
        if (Files.isEmpty(section)) return defaultValue;
        return Yamls.getConfig(`Registry.${section}.${key}`, null, defaultValue);
    }

    /**
     * Resolve a boolean option: explicit arg → config Registry.<section>.<key> → default.
     * Accepts real booleans or the strings 'true' / 'false' (YAML may give either).
     */
    static _resolveBool(value, section, key, defaultValue) {
        if (value === true || value === 'true') return true;
        if (value === false || value === 'false') return false;
        const cfg = this._cfg(section, key);
        if (cfg === true || cfg === 'true') return true;
        if (cfg === false || cfg === 'false') return false;
        return defaultValue;
    }

    /** Coerce a value ConvertTo-Json may emit as a scalar / null into an array. */
    static _asArray(value) {
        if (Array.isArray(value)) return value;
        return value === null || value === undefined ? [] : [value];
    }

    /**
     * Clean dead entries out of the Windows PATH-family environment variables in
     * the registry. Deterministic and Windows-only.
     *
     * For the chosen hive(s) it scans the `Path` value and every `Path_*` helper
     * variable and removes tokens that are either a `%VAR%` reference to an
     * undefined variable or a literal directory that no longer exists, keeping
     * everything that still resolves. Each value's registry type is preserved
     * (so `Path` stays REG_EXPAND_SZ and the references keep expanding).
     *
     * Both environment keys are exported to
     * `%USERPROFILE%\registry-path-backup-<timestamp>\` first (unless disabled),
     * and a WM_SETTINGCHANGE broadcast lets already-running apps pick up the new
     * value without a reboot. System (HKLM) changes require an elevated process;
     * when not elevated only User (HKCU) values are touched and a note is shown.
     *
     * Pass null (the default) for any argument to fall back to the config.yml
     * `Registry.clean` section; pass an explicit value to override.
     *
     * @param {string|null}  [hives]      'System' | 'User' | 'Both', or null → config Registry.clean.Hives || 'Both'.
     * @param {boolean|null} [backup]     Export keys before changing, or null → config Registry.clean.Backup || true.
     * @param {boolean|null} [broadcast]  Notify running apps, or null → config Registry.clean.Broadcast || true.
     * @returns {object|null} { scope, changes, errors, removedCount, backup, elevated, broadcast } or null on failure.
     */
    static clean(hives = null, backup = null, broadcast = null) {
        console.info(`[Registry.clean] 🟢 Starting... hives=${hives} backup=${backup} broadcast=${broadcast}`);
        try {
            if (process.platform !== 'win32') {
                Dialogs.warningBox('Registry Clean is only available on Windows.', 'Registry Clean');
                return null;
            }

            const requested = Files.isEmpty(hives) ? this._cfg('clean', 'Hives') : hives;
            const s = String(requested || 'Both').toLowerCase();
            const scope = (s === 'system' || s === 'hklm' || s === 'machine') ? 'System'
                : (s === 'user' || s === 'hkcu') ? 'User'
                : 'Both';
            const doBackup = this._resolveBool(backup, 'clean', 'Backup', true);
            const doBroadcast = this._resolveBool(broadcast, 'clean', 'Broadcast', true);
            console.info(`[Registry.clean] requested=${requested} scope=${scope} doBackup=${doBackup} doBroadcast=${doBroadcast}`);

            // PowerShell does the work: for every Path / Path_* value in the chosen
            // hive(s) it drops %VAR% references to undefined variables and literal
            // directories that no longer exist, rewriting each value in place with
            // its ORIGINAL registry type preserved, then prints a JSON envelope.
            const script = `
$ErrorActionPreference = 'Stop'
$result = [ordered]@{ backup = $null; elevated = $false; broadcast = $false; changes = @(); errors = @() }
try { $wi = [Security.Principal.WindowsIdentity]::GetCurrent(); $result.elevated = (New-Object Security.Principal.WindowsPrincipal($wi)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) } catch {}

$DO_BACKUP = ${doBackup ? '$true' : '$false'}
$DO_BROADCAST = ${doBroadcast ? '$true' : '$false'}
$HIVES = '${scope}'

$smRel = 'SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
$raw = [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames
$sysK = [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($smRel)
$usrK = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment')

if ($DO_BACKUP) {
  try {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $bk = Join-Path $env:USERPROFILE ('registry-path-backup-' + $stamp)
    New-Item -ItemType Directory -Force -Path $bk | Out-Null
    & reg.exe export ('HKLM\\' + $smRel) (Join-Path $bk 'system_env.reg') /y | Out-Null
    & reg.exe export 'HKCU\\Environment' (Join-Path $bk 'user_env.reg') /y | Out-Null
    $result.backup = $bk
  } catch { $result.errors += ('backup: ' + $_.Exception.Message) }
}

$defined = New-Object System.Collections.Generic.HashSet[string] ([System.StringComparer]::OrdinalIgnoreCase)
foreach ($n in $sysK.GetValueNames()) { [void]$defined.Add($n) }
foreach ($n in $usrK.GetValueNames()) { [void]$defined.Add($n) }

function Clean-Value($value) {
  $kept = @(); $removed = @()
  foreach ($tok in ($value -split ';')) {
    if ($tok -eq '') { continue }
    if ($tok -match '^%([^%]+)%$') { if ($defined.Contains($matches[1])) { $kept += $tok } else { $removed += $tok } }
    elseif ($tok -match '%') { $kept += $tok }
    elseif (Test-Path -LiteralPath $tok -PathType Container) { $kept += $tok }
    else { $removed += $tok }
  }
  [pscustomobject]@{ Kept = ($kept -join ';'); Removed = $removed }
}

function Process-Hive($scopeName, $readKey, $openWritable) {
  $names = @($readKey.GetValueNames() | Where-Object { $_ -eq 'Path' -or $_ -like 'Path_*' } | Sort-Object)
  $pending = @()
  foreach ($name in $names) {
    $res = Clean-Value ($readKey.GetValue($name, '', $raw))
    if ($res.Removed.Count -gt 0) { $pending += [pscustomobject]@{ name = $name; kept = $res.Kept; removed = $res.Removed; kind = $readKey.GetValueKind($name) } }
  }
  if ($pending.Count -eq 0) { return }
  $wkey = $null
  try { $wkey = & $openWritable } catch { $result.errors += ('open ' + $scopeName + ': ' + $_.Exception.Message); return }
  foreach ($p in $pending) {
    try {
      $wkey.SetValue($p.name, $p.kept, $p.kind)
      $result.changes += [pscustomobject]@{ scope = $scopeName; name = $p.name; removed = @($p.removed) }
    } catch { $result.errors += ($scopeName + ' / ' + $p.name + ': ' + $_.Exception.Message) }
  }
  $wkey.Flush()
}

if ($HIVES -eq 'System' -or $HIVES -eq 'Both') { Process-Hive 'HKLM' $sysK { [Microsoft.Win32.Registry]::LocalMachine.OpenSubKey($smRel, $true) } }
if ($HIVES -eq 'User'   -or $HIVES -eq 'Both') { Process-Hive 'HKCU' $usrK { [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Environment', $true) } }

if ($DO_BROADCAST -and $result.changes.Count -gt 0) {
  try {
    Add-Type 'using System; using System.Runtime.InteropServices; public static class WinEnvBroadcast { [DllImport("user32.dll", SetLastError=true, CharSet=CharSet.Auto)] public static extern IntPtr SendMessageTimeout(IntPtr hWnd, uint Msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result); }'
    $r = [UIntPtr]::Zero
    [void][WinEnvBroadcast]::SendMessageTimeout([IntPtr]0xffff, 0x1a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$r)
    $result.broadcast = $true
  } catch { $result.errors += ('broadcast: ' + $_.Exception.Message) }
}

$result | ConvertTo-Json -Depth 6 -Compress
`;

            // run the script hidden; -EncodedCommand so nothing has to be shell-escaped
            const encoded = Buffer.from(script, 'utf16le').toString('base64');
            const ps = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
                encoding: 'utf8',
                windowsHide: true,
                maxBuffer: 32 * 1024 * 1024,
            });
            console.debug(`[Registry.clean] scriptLen=${script.length} encodedLen=${encoded.length} status=${ps.status}`);
            if (ps.error) throw ps.error;
            if (ps.status !== 0) {
                const err = (ps.stderr || '').trim();
                throw new Error(`PowerShell exited with code ${ps.status}${err ? `: ${err}` : ''}`);
            }

            // parse the JSON envelope (fall back to the first {...} block if needed)
            const stdout = (ps.stdout || '').trim();
            console.debug(`[Registry.clean] stdoutLen=${stdout.length}`);
            let data;
            try {
                data = JSON.parse(stdout);
            } catch (_) {
                const a = stdout.indexOf('{');
                const b = stdout.lastIndexOf('}');
                if (a < 0 || b <= a) throw new Error(`Could not parse PowerShell JSON output:\n${stdout.slice(0, 500)}`);
                data = JSON.parse(stdout.slice(a, b + 1));
            }

            const changes = this._asArray(data.changes).map(c => ({
                scope: c.scope,
                name: c.name,
                removed: this._asArray(c.removed),
            }));
            const errors = this._asArray(data.errors);
            const removedCount = changes.reduce((n, c) => n + c.removed.length, 0);
            console.info(`[Registry.clean] elevated=${data.elevated} backup=${data.backup} broadcast=${data.broadcast} removedCount=${removedCount} changes=${changes.length} errors=${errors.length}`);

            const lines = [];
            lines.push(`Removed ${removedCount} dead entr${removedCount === 1 ? 'y' : 'ies'} from ${changes.length} value(s) [scope: ${scope}].`);
            if (!data.elevated && (scope === 'System' || scope === 'Both')) {
                lines.push('Note: not elevated — System (HKLM) values were skipped. Run elevated to clean them.');
            }
            for (const c of changes) {
                lines.push('');
                lines.push(`[${c.scope}] ${c.name}`);
                for (const r of c.removed) lines.push(`  - ${r}`);
            }
            if (data.backup) { lines.push(''); lines.push(`Backup: ${data.backup}`); }
            if (data.broadcast) lines.push('Broadcast: environment change sent to running apps.');
            for (const e of errors) lines.push(`Error: ${e}`);

            const message = lines.join('\n');
            console.log(`[Registry.clean] ${message}`);
            if (errors.length > 0) {
                Dialogs.warningBox(message, 'Registry Clean');
            } else {
                Dialogs.messageBox(message, 'Registry Clean');
            }

            return { scope, changes, errors, removedCount, backup: data.backup || null, elevated: !!data.elevated, broadcast: !!data.broadcast };
        } catch (error) {
            const desc = (error && (error.stack || error.message)) || String(error);
            console.error(`[Registry.clean] ❌ ${desc}`);
            Dialogs.warningBox(desc, 'Registry Clean');
            return null;
        }
    }
}
