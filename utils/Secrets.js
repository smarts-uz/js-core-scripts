// Centralized secret access. Secrets live ONLY in a gitignored .env (loaded via
// dotenv) and are read through process.env — never from config.yml and never
// hardcoded. This mirrors the old `Yamls.getConfig('Section.Owner')` shape so
// integration code can swap `Yamls.getConfig('Didox.SRental')` for
// `Secrets.get('Didox', 'SRental')` with no behavior change.
//
// dotenv is loaded from the .env next to the running entry script (the same
// place Yamls reads config.yml: dirname(process.argv[1])), so a script in any
// consumer project picks up that project's .env.

import path from 'node:path';
import dotenv from 'dotenv';

// Load .env from the entry script's directory (consumer project root), falling
// back to the default cwd lookup. Safe to call repeatedly; dotenv no-ops on
// already-set vars.
const entryDir = process.argv[1] ? path.dirname(process.argv[1]) : process.cwd();
dotenv.config({ path: path.join(entryDir, '.env') });
dotenv.config(); // also honor a .env in the cwd, if present

// Map a logical (section, owner) pair to its .env variable name.
// SECTION_OWNER, upper-snake-cased — e.g. ('Didox','SRental') -> DIDOX_SRENTAL.
function envName(section, owner) {
    // camelCase / digit boundaries -> underscores: My3Api -> MY3_API,
    // KapitalId -> KAPITAL_ID, DidoxBaseURL -> DIDOX_BASE_URL.
    const norm = (s) => String(s)
        .replace(/([a-z])([A-Z])/g, '$1_$2')   // camelCase boundary: My->.. ApiKey->API_KEY
        .replace(/(\d)([A-Z])/g, '$1_$2')       // digit->Cap boundary: My3Api->MY3_API (keeps My3->MY3)
        .toUpperCase();
    return owner ? `${norm(section)}_${norm(owner)}` : norm(section);
}

export class Secrets {
    // Secrets.get('Didox', 'SRental')  -> process.env.DIDOX_SRENTAL
    // Secrets.get('Didox.BaseURL')     -> process.env.DIDOX_BASE_URL
    static get(section, owner = '') {
        let key;
        if (section.includes('.')) {
            const [sec, sub] = section.split('.');
            key = envName(sec, sub);
        } else {
            key = envName(section, owner);
        }
        const value = process.env[key];
        console.debug(`[Secrets.get] ${key} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }

    // Direct env read by exact variable name.
    static env(name) {
        const value = process.env[name];
        console.debug(`[Secrets.env] ${name} -> ${value ? '✅ set' : '⚠️ missing'}`);
        return value ?? null;
    }
}
