import { execFileSync } from 'child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { Yamls } from './Yamls.js';
import { Files } from './Files.js';
import { Dialogs } from './Dialogs.js';

/**
 * Registry — deterministic Windows registry maintenance helpers.
 *
 * These methods do NOT call any model and do NOT use PowerShell (whose UTF-16
 * stdout leaked garbled "Chinese-looking" text into the terminal). They shell
 * out to the plain `reg.exe` CLI — which emits clean UTF-8 — reading and
 * rewriting values in Node, preserving each value's registry type.
 *
 * Defaults live under the `Registry:` section of config.yml and are used
 * whenever the matching argument is omitted.
 */
export class Registry {

    /** Run reg.exe with args and return { status, stdout, stderr } (clean UTF-8). */
    static _reg(args) {
        try {
            const stdout = execFileSync('reg', args, { encoding: 'utf8', windowsHide: true, maxBuffer: 32 * 1024 * 1024 });
            return { status: 0, stdout, stderr: '' };
        } catch (e) {
            return { status: e.status ?? 1, stdout: e.stdout ? String(e.stdout) : '', stderr: e.stderr ? String(e.stderr) : (e.message || '') };
        }
    }

    /**
     * Parse `reg query <key>` output into [{ name, kind, value }]. reg.exe prints
     * each value as: "    <name>    <REG_TYPE>    <data>" (whitespace-separated,
     * data may itself contain spaces/semicolons).
     */
    static _parseQuery(stdout) {
        const out = [];
        for (const line of stdout.split(/\r?\n/)) {
            const m = line.match(/^\s{4}(.+?)\s{4}(REG_[A-Z_]+)\s{4}(.*)$/);
            if (m) out.push({ name: m[1], kind: m[2], value: m[3] });
        }
        return out;
    }

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

            // Pure Node + reg.exe (NO PowerShell): for every Path / Path_* value in
            // the chosen hive(s) drop %VAR% references to undefined variables and
            // literal directories that no longer exist, rewriting each value in
            // place with its ORIGINAL registry type preserved. reg.exe emits clean
            // UTF-8, so nothing garbled ever reaches the terminal.
            const data = this._cleanCore(scope, doBackup, doBroadcast);

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

    /**
     * The deterministic core of clean(), implemented with reg.exe + Node only
     * (no PowerShell). Reads the User (HKCU\Environment) and System (HKLM\…\
     * Session Manager\Environment) keys, drops dead tokens from Path / Path_*,
     * writes each survivor back preserving its registry type, optionally backs
     * up first and broadcasts the change. Returns the same envelope shape the
     * old PowerShell script produced.
     */
    static _cleanCore(scope, doBackup, doBroadcast) {
        const SYS_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment';
        const USR_KEY = 'HKCU\\Environment';
        const result = { backup: null, elevated: false, broadcast: false, changes: [], errors: [] };

        // Elevation is confirmed later by whether an HKLM write actually succeeds
        // (an HKCU-only run never needs it). Read both hives' value lists first —
        // the union of their names is the "defined variable" set for %VAR% checks.
        const usrVals = this._parseQuery(this._reg(['query', USR_KEY]).stdout);
        const sysVals = this._parseQuery(this._reg(['query', SYS_KEY]).stdout);
        const defined = new Set();
        for (const v of usrVals) defined.add(v.name.toLowerCase());
        for (const v of sysVals) defined.add(v.name.toLowerCase());

        // Backup via reg.exe export (clean, native).
        if (doBackup) {
            try {
                const stamp = this._stamp();
                const bk = path.join(os.homedir(), `registry-path-backup-${stamp}`);
                fs.mkdirSync(bk, { recursive: true });
                this._reg(['export', SYS_KEY, path.join(bk, 'system_env.reg'), '/y']);
                this._reg(['export', USR_KEY, path.join(bk, 'user_env.reg'), '/y']);
                result.backup = bk;
            } catch (e) {
                result.errors.push(`backup: ${e.message || e}`);
            }
        }

        const cleanValue = (value) => {
            const kept = [];
            const removed = [];
            for (const tok of String(value).split(';')) {
                if (tok === '') continue;
                const ref = tok.match(/^%([^%]+)%$/);
                if (ref) {
                    if (defined.has(ref[1].toLowerCase())) kept.push(tok); else removed.push(tok);
                } else if (tok.includes('%')) {
                    kept.push(tok); // partial expansion — leave as-is
                } else {
                    let exists = false;
                    try { exists = fs.existsSync(tok) && fs.statSync(tok).isDirectory(); } catch { exists = false; }
                    if (exists) kept.push(tok); else removed.push(tok);
                }
            }
            return { kept: kept.join(';'), removed };
        };

        const processHive = (scopeName, keyPath, vals) => {
            const targets = vals
                .filter(v => v.name === 'Path' || v.name.startsWith('Path_'))
                .sort((a, b) => a.name.localeCompare(b.name));
            for (const v of targets) {
                const res = cleanValue(v.value);
                if (res.removed.length === 0) continue;
                // reg add preserves the type via /t; write the cleaned value.
                const w = this._reg(['add', keyPath, '/v', v.name, '/t', v.kind, '/d', res.kept, '/f']);
                if (w.status === 0) {
                    if (scopeName === 'HKLM') result.elevated = true; // an HKLM write only succeeds when elevated
                    result.changes.push({ scope: scopeName, name: v.name, removed: res.removed });
                } else {
                    const msg = (w.stderr || '').trim();
                    if (scopeName === 'HKLM' && /denied|Access is denied|requires elevation/i.test(msg)) {
                        // not elevated — HKLM skipped; recorded via the elevated=false note upstream
                    } else {
                        result.errors.push(`${scopeName} / ${v.name}: ${msg || 'reg add failed'}`);
                    }
                }
            }
        };

        if (scope === 'System' || scope === 'Both') processHive('HKLM', SYS_KEY, sysVals);
        if (scope === 'User' || scope === 'Both') processHive('HKCU', USR_KEY, usrVals);

        // Broadcast WM_SETTINGCHANGE so running apps pick up the new environment
        // without a reboot — via rundll32 (native, no PowerShell).
        if (doBroadcast && result.changes.length > 0) {
            try {
                execFileSync('rundll32', ['user32.dll,UpdatePerUserSystemParameters'], { windowsHide: true });
                result.broadcast = true;
            } catch (e) {
                result.errors.push(`broadcast: ${e.message || e}`);
            }
        }

        return result;
    }

    /** yyyyMMdd_HHmmss timestamp for backup folder names. */
    static _stamp() {
        const n = new Date();
        const p = (x) => String(x).padStart(2, '0');
        return `${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}${p(n.getSeconds())}`;
    }
}
