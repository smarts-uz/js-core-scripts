// Centralized secret access. Secrets live ONLY in a gitignored keys.yml
// (template: keys.example.yml) shaped service -> kind -> firm, e.g.
//   didox:
//     partner_key:
//       SRental: <token>
//       WorkSpace:
// — never in config.yml and never hardcoded.
//
// keys.yml is looked up next to the running entry script (the same place
// Yamls reads config.yml: dirname(process.argv[1])), then in the cwd, so a
// script in any consumer project picks up that project's keys.yml.
//
// Parsed with the FAILSAFE schema: every scalar stays a string, so a numeric
// login (311958304) or an id with a leading zero is never turned into a number
// and a blank value stays ''.

import fs from 'node:fs';
import path from 'node:path';
import yaml from '#js-yaml';

const KEYS_FILE = 'keys.yml';

export class Secrets {
    // Explicit keys.yml path; null = auto-lookup (entry script dir, then cwd).
    static file = null;

    // First existing keys.yml candidate, or null when none exists.
    static #resolveFile() {
        if (Secrets.file) return Secrets.file;
        const entryDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
        const candidates = [path.join(entryDir, KEYS_FILE), path.join(process.cwd(), KEYS_FILE)];
        return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    }

    // Parsed keys.yml, re-read on every call so an edited file is picked up
    // without a restart. Missing or unparseable file -> {}.
    static #load() {
        const file = Secrets.#resolveFile();
        if (!file) {
            console.warn(`[Secrets.load] ⚠️ ${KEYS_FILE} not found`);
            return {};
        }
        try {
            const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
            return yaml.load(text, { schema: yaml.FAILSAFE_SCHEMA }) ?? {};
        } catch (error) {
            console.error(`[Secrets.load] ❌ ${file}: ${error.message}`);
            return {};
        }
    }

    // Secrets.get('didox', 'partner_key', 'SRental') -> keys.yml didox.partner_key.SRental
    // Returns the stored value (a blank value stays ''), null when absent.
    static get(service, kind, firm) {
        const value = Secrets.#load()?.[service]?.[kind]?.[firm];
        console.debug(`[Secrets.get] ${service}.${kind}.${firm} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }

    // Index of the line "<key>:" at exactly `indent` spaces inside lines[from, to); -1 when absent.
    static #findKey(lines, key, indent, from, to) {
        const escaped = key.replace(/[.*+?^$(){}|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`^ {${indent}}${escaped}:(\\s|$)`);
        for (let index = from; index < to; index++) {
            switch (pattern.test(lines[index])) {
                case true:
                    return index;
            }
        }
        return -1;
    }

    // End (exclusive) of the block whose key line sits at `index` with `indent`:
    // right after the last non-blank line indented deeper than the key.
    static #blockEnd(lines, index, indent) {
        let end = index + 1;
        for (let cursor = index + 1; cursor < lines.length; cursor++) {
            const line = lines[cursor];
            switch (true) {
                case line.trim() === '':
                    continue;
                case line.length - line.trimStart().length > indent:
                    end = cursor + 1;
                    continue;
            }
            break;
        }
        return end;
    }

    // YAML scalar text of a value: a plain token stays bare, anything else is double-quoted.
    static #scalar(value) {
        const text = String(value ?? '');
        const plain = /^[A-Za-z][A-Za-z0-9._~+\-/=]*$/.test(text) && !/^(true|false|null|yes|no|on|off)$/i.test(text);
        switch (true) {
            case text === '':
                return '';
            case plain:
                return ` ${text}`;
            default:
                return ` ${JSON.stringify(text)}`;
        }
    }

    // Secrets.set('didox', 'user_key', 'SRental', token) -> writes keys.yml didox.user_key.SRental.
    // Only the one value line changes (comments, blank lines and key order stay);
    // a missing service / kind / firm is added at the end of its parent block.
    // Returns true when the file was written, false otherwise.
    static set(service, kind, firm, value) {
        const file = Secrets.#resolveFile();
        switch (file) {
            case null:
                console.warn(`[Secrets.set] ⚠️ ${KEYS_FILE} not found — ${service}.${kind}.${firm} not saved`);
                return false;
        }
        try {
            const raw = fs.readFileSync(file, 'utf8');
            const bom = raw.startsWith('﻿') ? '﻿' : '';
            const text = raw.slice(bom.length);
            const eol = text.includes('\r\n') ? '\r\n' : '\n';
            const lines = text.split(/\r?\n/);
            const keys = [service, kind, firm];

            let from = 0;
            let to = lines.length;
            let depth = 0;
            for (; depth < keys.length; depth++) {
                const found = Secrets.#findKey(lines, keys[depth], depth * 2, from, to);
                switch (found) {
                    case -1:
                        break;
                    default:
                        switch (depth === keys.length - 1) {
                            case true:
                                lines[found] = `${' '.repeat(depth * 2)}${keys[depth]}:${Secrets.#scalar(value)}`;
                                fs.writeFileSync(file, bom + lines.join(eol));
                                console.debug(`[Secrets.set] ${service}.${kind}.${firm} -> ✅ saved`);
                                return true;
                        }
                        from = found + 1;
                        to = Secrets.#blockEnd(lines, found, depth * 2);
                        continue;
                }
                break;
            }

            const missing = keys.slice(depth).map((key, offset) => `${' '.repeat((depth + offset) * 2)}${key}:`);
            missing[missing.length - 1] += Secrets.#scalar(value);
            switch (depth) {
                case 0: {
                    let last = lines.length;
                    while (last > 0) {
                        switch (lines[last - 1].trim()) {
                            case '':
                                last--;
                                continue;
                        }
                        break;
                    }
                    lines.splice(last, 0, '', ...missing);
                    break;
                }
                default:
                    lines.splice(to, 0, ...missing);
            }
            fs.writeFileSync(file, bom + lines.join(eol));
            console.debug(`[Secrets.set] ${service}.${kind}.${firm} -> ✅ added`);
            return true;
        } catch (error) {
            console.error(`[Secrets.set] ❌ ${file}: ${error.message}`);
            return false;
        }
    }

    // Direct read of a real process environment variable by exact name
    // (CI / shell injection); never populated from a file.
    static env(name) {
        const value = process.env[name];
        console.debug(`[Secrets.env] ${name} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }
}
