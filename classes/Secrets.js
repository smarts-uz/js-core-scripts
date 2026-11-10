// Centralized secret access. Secrets live ONLY in a gitignored keys.yml
// (template: keys.example.yml) shaped service -> kind -> firm, e.g.
//   didox:
//     user_key: { SRental: "", WorkSpace: "" }
//     partner_key: { SRental: "", WorkSpace: "" }
// — never in config.yml and never hardcoded.
//
// keys.yml is looked up next to the running entry script (the same place
// Yamls reads config.yml: dirname(process.argv[1])), then in the cwd, so a
// script in any consumer project picks up that project's keys.yml.
// Every value is read as a string (YAML FAILSAFE schema): a numeric-looking id
// never turns into a number.

import fs from 'node:fs';
import path from 'node:path';
import yaml from '#js-yaml';

const KEYS_FILE = 'keys.yml';

export class Secrets {
    // Explicit keys.yml path; null = auto-lookup (entry script dir, then cwd).
    static file = null;

    // In-process overrides (e.g. a session token from Didox.authToken), keyed
    // "service.kind.firm". Never written to disk.
    static #overrides = new Map();

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

    // Internal: sets an in-process value that wins over keys.yml for this run
    // only (nothing is persisted). Underscore = not a CLI operation.
    static _set(service, kind, firm, value) {
        Secrets.#overrides.set(`${service}.${kind}.${firm}`, String(value));
    }

    // Secrets.get('didox', 'partner_key', 'SRental') -> keys.yml didox.partner_key.SRental
    // Returns the stored value (an empty string stays ''), null when absent.
    static get(service, kind, firm) {
        const value =
            Secrets.#overrides.get(`${service}.${kind}.${firm}`) ?? Secrets.#load()?.[service]?.[kind]?.[firm];
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
