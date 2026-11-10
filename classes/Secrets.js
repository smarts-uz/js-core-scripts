// Centralized secret access. Secrets live ONLY in a gitignored keys.json
// (template: keys.example.json) shaped service -> kind -> firm, e.g.
//   { "didox": { "user_key": { "SRental": "", "WorkSpace": "" }, "partner_key": { ... } } }
// — never in config.yml and never hardcoded.
//
// keys.json is looked up next to the running entry script (the same place
// Yamls reads config.yml: dirname(process.argv[1])), then in the cwd, so a
// script in any consumer project picks up that project's keys.json.

import fs from 'node:fs';
import path from 'node:path';

const KEYS_FILE = 'keys.json';

export class Secrets {
    // Explicit keys.json path; null = auto-lookup (entry script dir, then cwd).
    static file = null;

    // First existing keys.json candidate, or null when none exists.
    static #resolveFile() {
        if (Secrets.file) return Secrets.file;
        const entryDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
        const candidates = [path.join(entryDir, KEYS_FILE), path.join(process.cwd(), KEYS_FILE)];
        return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
    }

    // Parsed keys.json, re-read on every call so an edited file is picked up
    // without a restart. Missing or unparseable file -> {}.
    static #load() {
        const file = Secrets.#resolveFile();
        if (!file) {
            console.warn(`[Secrets.load] ⚠️ ${KEYS_FILE} not found`);
            return {};
        }
        try {
            return JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, ''));
        } catch (error) {
            console.error(`[Secrets.load] ❌ ${file}: ${error.message}`);
            return {};
        }
    }

    // Secrets.get('didox', 'partner_key', 'SRental') -> keys.json didox.partner_key.SRental
    // Returns the stored value (an empty string stays ''), null when absent.
    static get(service, kind, firm) {
        const value = Secrets.#load()?.[service]?.[kind]?.[firm];
        console.debug(`[Secrets.get] ${service}.${kind}.${firm} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }

    // Direct read of a real process environment variable by exact name
    // (CI / shell injection); never populated from a file.
    static env(name) {
        const value = process.env[name];
        console.debug(`[Secrets.env] ${name} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }
}
