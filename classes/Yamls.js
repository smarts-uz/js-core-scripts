import fs from "fs";
import { existsSync } from "fs";

import yaml from "#js-yaml";
import path from "path";
import { getProperty, setProperty } from "#dot-prop";
import { Files } from "./Files.js";
import { Word } from "./Word.js";
import { Didox } from "./didox.js";
import { MySoliq } from "./MySoliq.js";
import { Dates } from "./Dates.js";
import { Dialogs } from "./Dialogs.js";



export class Yamls {



    static getConfig(keyPath, type = null, defaultValue = null) {
    console.info(`[Yamls.getConfig] 🟢 Starting...`);
        const config = Files.currentDir() + '\\config.yml';
        if (!fs.existsSync(config)) {
            throw new Error(`YAML Core Config file not found: ${config}`);
        }

        if (!keyPath) {
            throw new Error(`Key path is required`);
        }

        const value = this.getYamlValue(config, keyPath, defaultValue)

        console.log(`Key: ${keyPath}, Value: ${value}`);

        if (Files.isEmpty(value)) {
            console.warn(`Key: ${keyPath}, Value is Empty: ${value}`);
            return defaultValue;
        }

        switch (type) {
            case 'string':
                return value.toString();
            case 'number':
                return Number(value);
            case 'boolean':
                return Boolean(value);
            case 'array':
                return Array.isArray(value) ? value : [value];
            case 'object':
                return typeof value === 'object' && !Array.isArray(value) ? value : {};
            default:
                return value;
        }

    }

    /**
     * Load YAML and return value by dot-notated path
     * @param {string} filePath - path to yaml file
     * @param {string} keyPath - e.g. "Contract.Format"
     * @param {*} defaultValue - optional fallback
     */
    static getYamlValue(filePath, keyPath, defaultValue = undefined) {
    console.info(`[Yamls.getYamlValue] 🟢 Starting...`);
        if (!fs.existsSync(filePath)) {
            throw new Error(`YAML file not found: ${filePath}`);
        }

        const doc = yaml.load(fs.readFileSync(filePath, "utf8"), { schema: yaml.JSON_SCHEMA });

        // dot-prop resolves the nested dot-path (e.g. "Contract.Format"); the
        // ?? keeps the original fallback for both missing and null values.
        return getProperty(doc, keyPath) ?? defaultValue;
    }

    // Read text file and find text line which contains the given text
    static findTextLine(filePath, text) {
    console.info(`[Yamls.findTextLine] 🟢 Starting...`);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        for (const line of lines) {
            if (line.includes(text)) {
                return line;
            }
        }

        return null;
    }

    // Replace found line with new text
    static replaceTextLine(filePath, key, value) {
        console.info(`[Yamls.replaceTextLine] 🟢 Starting...`);

        if (Files.isEmpty(value)) {
            console.log('null value', key, value);
            value = ''
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        let foundLine = null;

        for (let i = 0; i < lines.length; i++) {

            // find line using regex from search from start of string
            const regex = new RegExp(`^${key}:.*`);

            if (regex.test(lines[i])) {
                console.info('Found line:', lines[i], 'Index:', i);

                if (typeof value === "string" && (value.includes('{') || value.includes('}'))) {
                    lines[i] = key + ': "' + value + '"';
                } else {
                    lines[i] = key + ': ' + value;
                }

                foundLine = lines[i];
            }
        }

        if (!foundLine) {
            console.warn(`Line with key "${key}" not found in file ${filePath}.`);
            return;
        }

        fs.writeFileSync(filePath, lines.join('\n'));

        console.log(`File ${filePath} has been updated.`, value);
    }

    // Strips quotes js-yaml adds around a plain key/value that doesn't
    // actually need them (no space, no YAML-special leading/embedded char) —
    // js-yaml quotes any scalar that LOOKS like a number/date/bool even when
    // unquoted would round-trip fine, e.g. '2026-03-31': '3200000'. Only
    // space-free scalars are eligible; a value containing a space always
    // keeps its quotes. Every dump this project writes uses
    // yaml.JSON_SCHEMA, under which an unquoted date-shaped key/value stays
    // a plain string on reload (never resolved to a JS Date) — see
    // #isSafeUnquoted/every yaml.load call in this class.
    static #isSafeUnquoted(inner) {
        if (inner === '') return false;
        if (/\s/.test(inner)) return false;
        if (/^(true|false|null|~|yes|no|on|off)$/i.test(inner)) return false;
        if (/^[#&*!|>'"%@`]/.test(inner)) return false;
        if (/^[-?:,[\]{}]/.test(inner)) return false;
        if (inner.includes(': ') || inner.endsWith(':') || inner.includes(' #')) return false;
        return true;
    }

    static #stripUnnecessaryQuotes(dumpedYamlText) {
        return dumpedYamlText.split('\n').map(line => {
            let out = line.replace(/^(\s*(?:-\s+)?)(['"])((?:[^'"\\]|\\.)*)\2(\s*:)/, (m, pre, q, inner, colon) => {
                if (q === "'" && inner.includes("''")) return m;
                return Yamls.#isSafeUnquoted(inner) ? `${pre}${inner}${colon}` : m;
            });
            out = out.replace(/(:\s+)(['"])((?:[^'"\\]|\\.)*)\2(\s*)$/, (m, pre, q, inner, trail) => {
                if (q === "'" && inner.includes("''")) return m;
                return Yamls.#isSafeUnquoted(inner) ? `${pre}${inner}${trail}` : m;
            });
            return out;
        }).join('\n');
    }

    // Generic writer for a single top-level "Key:" array block in a .contract
    // yaml. ORDER- AND COMMENT-PRESERVING: when `key` (or one of
    // `legacyKeys`) already exists anywhere in the file, its block is
    // replaced STRICTLY IN PLACE — same line position, every other line
    // (including freestanding "#####" comment separators, blank-line
    // rhythm, and every OTHER key's own position) left byte-identical.
    // Only when `key` has never existed in this file before does it fall
    // back to inserting a brand-new block directly after `afterKey`'s own
    // block — there is no prior position to preserve for a genuinely new
    // key. An empty `entries` array is still written as "Key: []" when
    // allowEmpty is true (the default) — the caller decides whether "no
    // data yet" should still leave the key present (empty) or be skipped
    // entirely.
    //
    // Real incident this was rewritten for: the PRIOR version always
    // deleted a key's block from wherever it sat and reinserted it after a
    // hardcoded fixed anchor (writeAccrual always after ComBase,
    // writePayment always after Accrual, ...) — every write silently
    // reordered the whole chain into one fixed sequence and stranded
    // freestanding "#####" separator comments at the positions their
    // neighboring blocks used to occupy, clumping every separator together
    // once enough blocks had moved away from them. In-place replacement
    // makes reordering structurally impossible for a key that already
    // exists — its line number never changes, so nothing next to it (a
    // comment above/below, another key's own block) can ever drift.
    static writeYamlArraySection(filePath, key, entries, afterKey, legacyKeys = [], allowEmpty = true) {
        console.info(`[Yamls.writeYamlArraySection] 🟢 Starting... key=${key}`);

        if (!Array.isArray(entries)) entries = [];
        if (entries.length === 0 && !allowEmpty) {
            console.warn(`writeYamlArraySection: ${key} is empty and allowEmpty=false, nothing to write for ${filePath}.`);
            return;
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        const block = Yamls.#stripUnnecessaryQuotes(
            yaml.dump({ [key]: entries }, { lineWidth: -1, schema: yaml.JSON_SCHEMA })
        ).trimEnd().split('\n');

        // A block's own extent = its "Key:" line plus every immediately-
        // following indented child line (its array items) — never a
        // trailing blank line, which belongs to file rhythm, not the block.
        const blockExtent = (startIdx) => {
            let endIdx = startIdx + 1;
            while (endIdx < lines.length && /^\s/.test(lines[endIdx]) && lines[endIdx] !== '') {
                endIdx++;
            }
            return endIdx; // exclusive
        };

        const keyRes = [key, ...legacyKeys].map(k => new RegExp(`^${k}:`));
        const existingIdx = lines.findIndex(line => keyRes.some(re => re.test(line)));

        if (existingIdx !== -1) {
            // IN PLACE: splice the old block's exact line range out, put the
            // new block's lines in that exact same range — nothing else in
            // the file (position, spacing, comments) is touched. A
            // legacy-key match is renamed to the current key name as part
            // of this same in-place replacement (no separate relocation).
            const endIdx = blockExtent(existingIdx);
            lines.splice(existingIdx, endIdx - existingIdx, ...block);
            fs.writeFileSync(filePath, lines.join('\n'));
            console.log(`File ${filePath} has been updated with ${key} in place.`, entries);
            return;
        }

        // Genuinely new key — no prior position exists to preserve, fall
        // back to inserting directly after afterKey's own block.
        const afterIdx = lines.findIndex(line => new RegExp(`^${afterKey}:`).test(line));

        if (afterIdx === -1) {
            console.warn(`writeYamlArraySection: "${afterKey}:" line not found in ${filePath}; appending ${key} at end of file.`);
            const toAppend = lines.length > 0 && lines[lines.length - 1] !== '' ? ['', ...block] : [...block];
            fs.writeFileSync(filePath, [...lines, ...toAppend].join('\n'));
            console.log(`File ${filePath} has been updated with ${key} (appended).`, entries);
            return;
        }

        const insertIdx = blockExtent(afterIdx);
        // The new block always gets its own leading blank line (separating
        // it from afterKey's block). A blank line already sitting right at
        // insertIdx is REUSED as the trailing separator (inserted BEFORE
        // it); otherwise a trailing separator is added too, unless
        // insertIdx is genuinely end-of-file (never leave a dangling blank
        // there).
        const hasBlankAfter = lines[insertIdx] === '';
        const atEnd = insertIdx >= lines.length;
        const toInsert = hasBlankAfter || atEnd ? ['', ...block] : ['', ...block, ''];
        lines.splice(insertIdx, 0, ...toInsert);

        fs.writeFileSync(filePath, lines.join('\n'));
        console.log(`File ${filePath} has been updated with ${key} (inserted after ${afterKey}).`, entries);
    }

    /**
     * Generic writer for a single top-level scalar "Key: value" line — the scalar sibling of writeYamlArraySection.
     * Same order-preserving-in-place contract: an existing "Key:" line updates STRICTLY IN PLACE at its own position.
     * A key that has never existed before falls back to inserting a new line directly after afterKey's own block (same blank-line rhythm as writeYamlArraySection).
     * @param {string} filePath
     * @param {string} key
     * @param {string|number} value
     * @param {string} afterKey
     */
    static writeScalarSection(filePath, key, value, afterKey) {
        console.info(`[Yamls.writeScalarSection] 🟢 Starting... key=${key}`);

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        const line = `${key}: ${value}`;

        const existingIdx = lines.findIndex(l => new RegExp(`^${key}:`).test(l));
        if (existingIdx !== -1) {
            lines[existingIdx] = line;
            fs.writeFileSync(filePath, lines.join('\n'));
            console.log(`File ${filePath} has been updated with ${key} in place.`, value);
            return;
        }

        const blockExtent = (startIdx) => {
            let endIdx = startIdx + 1;
            while (endIdx < lines.length && /^\s/.test(lines[endIdx]) && lines[endIdx] !== '') {
                endIdx++;
            }
            return endIdx;
        };

        const afterIdx = lines.findIndex(l => new RegExp(`^${afterKey}:`).test(l));
        if (afterIdx === -1) {
            console.warn(`writeScalarSection: "${afterKey}:" line not found in ${filePath}; appending ${key} at end of file.`);
            const toAppend = lines.length > 0 && lines[lines.length - 1] !== '' ? ['', line] : [line];
            fs.writeFileSync(filePath, [...lines, ...toAppend].join('\n'));
            console.log(`File ${filePath} has been updated with ${key} (appended).`, value);
            return;
        }

        const insertIdx = blockExtent(afterIdx);
        const hasBlankAfter = lines[insertIdx] === '';
        const atEnd = insertIdx >= lines.length;
        const toInsert = hasBlankAfter || atEnd ? ['', line] : ['', line, ''];
        lines.splice(insertIdx, 0, ...toInsert);

        fs.writeFileSync(filePath, lines.join('\n'));
        console.log(`File ${filePath} has been updated with ${key} (inserted after ${afterKey}).`, value);
    }

    /**
     * Removes an obsolete "Key:" scalar line from a .contract file, if present — a no-op when the key doesn't exist.
     * Used to strip a retired field (e.g. the old PeriodEndApp, superseded by the renamed PeriodEnd) from every real file it still lingers in, on the next write.
     * Collapses a resulting doubled blank line (the removed line's own separators on both sides) back down to one, so file rhythm stays consistent.
     * @param {string} filePath
     * @param {string} key
     */
    static deleteScalarLine(filePath, key) {
        console.info(`[Yamls.deleteScalarLine] 🟢 Starting... key=${key}`);

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        const idx = lines.findIndex(l => new RegExp(`^${key}:`).test(l));
        if (idx === -1) return;

        lines.splice(idx, 1);
        if (lines[idx - 1] === '' && lines[idx] === '') lines.splice(idx, 1);

        fs.writeFileSync(filePath, lines.join('\n'));
        console.log(`File ${filePath} had stale key ${key} removed.`);
    }

    // Builds Accrual: entries, every calendar month across contract's active
    // period (PeriodStart..PeriodEnd, both YYYY-MM-DD) — one bare "start"
    // (due date): amount mapping per month, at tariff's normal Price for
    // on-time month. Month re-priced at PriceMax by
    // Yamls.applyPriceMaxToDebtMonths below, once real payment chain
    // (Loaners) for that month known — this function alone only produces
    // Price-rate baseline.
    //
    // Every downstream chain block (Loaners/Faktura/PenaltyDays/Penalty)
    // copies same bare-date key verbatim (computePaymentChain forwards
    // as-is). Period's own end never carried in key — always end of key
    // date's own calendar month, re-derived via Dates wherever still needed
    // (computePenaltyDays).
    //
    // First period prorated by real day count within own calendar month,
    // rounded to nearest whole so'm only (never fractional tiyin, never
    // rounded to nearest 1,000). E.g. 23-of-31-day first month at
    // 390,000/mo → round(23/31*390000) = 289,355.
    static buildAccrualEntries(startDate, futureDate, price) {
        console.info(`[Yamls.buildAccrualEntries] 🟢 Starting... startDate=${startDate} futureDate=${futureDate} price=${price}`);

        const monthRanges = Dates.monthsBetween(startDate, futureDate);
        const priceNum = Number(String(price).replace(/,/g, '')) || 0;

        const entries = monthRanges.map(({ start, end }) => {
            const daysInPeriod = Dates.daysBetween(start, end) + 1;
            const daysInMonth = Dates.daysInMonth(start);
            const isFullMonth = daysInPeriod === daysInMonth;

            const amount = isFullMonth
                ? priceNum
                : Math.round((daysInPeriod / daysInMonth) * priceNum);

            return { [start]: amount.toLocaleString('en-US') };
        });

        console.log(`buildAccrualEntries: ${entries.length} entr(y/ies)`, entries);
        return entries;
    }

    // Re-prices every Accrual month with outstanding Loaners (underpaid or
    // unpaid) at the tariff's PriceMax instead of the normal Price — Price
    // applies only to a month paid on time; a month currently short on
    // payment loses that rate and is charged at PriceMax for its own
    // (possibly prorated) period. Returns a NEW accrual array; does not
    // mutate the input. Must be re-run to a fixed point by the caller
    // (recomputeChain below) since changing one month's Accrual changes the
    // payment chain, which can change which months are in debt.
    static applyPriceMaxToDebtMonths(accrual, loaners, startDate, priceMax) {
        console.info(`[Yamls.applyPriceMaxToDebtMonths] 🟢 Starting... priceMax=${priceMax}`);

        const priceMaxNum = Number(String(priceMax).replace(/,/g, '')) || 0;
        const loanersByKey = new Map((Array.isArray(loaners) ? loaners : []).map(e => Object.entries(e)[0]));

        return accrual.map(entry => {
            const [start, amount] = Object.entries(entry)[0];
            const debt = Number(String(loanersByKey.get(start) ?? '0').replace(/,/g, '')) || 0;
            if (debt <= 0) return { [start]: amount };

            const end = Dates.monthEnd(start);
            const daysInPeriod = Dates.daysBetween(start, end) + 1;
            const daysInMonth = Dates.daysInMonth(start);
            const isFullMonth = daysInPeriod === daysInMonth;

            const newAmount = isFullMonth
                ? priceMaxNum
                : Math.round((daysInPeriod / daysInMonth) * priceMaxNum);

            return { [start]: newAmount.toLocaleString('en-US') };
        });
    }

    /**
     * Builds PriceMon entries, one per Accrual period, key remapped to bare "YYYY-MM".
     * Value: tariff's flat full-month rent price, never prorated (unlike Accrual).
     * Debt month (Loaners > 0 same period) uses PriceMax instead of Price, still flat, never reprorated.
     * Requires FINAL recomputeChain-settled accrual/loaners pair, never pre-recompute baseline.
     * @param {Array<Object>} accrual
     * @param {Array<Object>} loaners
     * @param {string|number} price
     * @param {string|number} priceMax
     * @returns {Array<Object>}
     */
    static buildPriceMonEntries(accrual, loaners, price, priceMax) {
        console.info(`[Yamls.buildPriceMonEntries] 🟢 Starting...`);

        const priceNum = Number(String(price).replace(/,/g, '')) || 0;
        const priceMaxNum = Number(String(priceMax).replace(/,/g, '')) || 0;
        const loanersByKey = new Map(
            (Array.isArray(loaners) ? loaners : [])
                .filter(e => !('ALL' in e))
                .map(e => Object.entries(e)[0])
        );

        const entries = (Array.isArray(accrual) ? accrual : [])
            .filter(e => !('ALL' in e))
            .map(entry => {
                const [start] = Object.entries(entry)[0];
                const debt = Number(String(loanersByKey.get(start) ?? '0').replace(/,/g, '')) || 0;
                const amount = debt > 0 ? priceMaxNum : priceNum;
                return { [start.slice(0, 7)]: amount.toLocaleString('en-US') };
            });

        console.log(`buildPriceMonEntries: ${entries.length} entr(y/ies)`, entries);
        return entries;
    }

    /**
     * Builds PriceMaxMon entries, one per Accrual period, key remapped to bare "YYYY-MM".
     * Value: tariff's flat full-month PriceMax rate for EVERY month, regardless of debt — unlike PriceMon, there is no Price-vs-PriceMax switch here.
     * @param {Array<Object>} accrual
     * @param {string|number} priceMax
     * @returns {Array<Object>}
     */
    static buildPriceMaxMonEntries(accrual, priceMax) {
        console.info(`[Yamls.buildPriceMaxMonEntries] 🟢 Starting...`);

        const priceMaxNum = Number(String(priceMax).replace(/,/g, '')) || 0;

        const entries = (Array.isArray(accrual) ? accrual : [])
            .filter(e => !('ALL' in e))
            .map(entry => {
                const [start] = Object.entries(entry)[0];
                return { [start.slice(0, 7)]: priceMaxNum.toLocaleString('en-US') };
            });

        console.log(`buildPriceMaxMonEntries: ${entries.length} entr(y/ies)`, entries);
        return entries;
    }

    /**
     * Builds PriceDay entries, one per PriceMon entry: that month's PriceMon amount / its real day count, rounded to the nearest whole so'm.
     * Same bare "YYYY-MM" key as PriceMon.
     * @param {Array<Object>} priceMon
     * @returns {Array<Object>}
     */
    static buildPriceDayEntries(priceMon) {
        console.info(`[Yamls.buildPriceDayEntries] 🟢 Starting...`);

        const entries = (Array.isArray(priceMon) ? priceMon : [])
            .filter(e => !('ALL' in e))
            .map(entry => {
                const [month, amount] = Object.entries(entry)[0];
                const amountNum = Number(String(amount).replace(/,/g, '')) || 0;
                const daysInMonth = Dates.daysInMonth(`${month}-01`);
                const perDay = daysInMonth > 0 ? Math.round(amountNum / daysInMonth) : 0;
                return { [month]: perDay.toLocaleString('en-US') };
            });

        console.log(`buildPriceDayEntries: ${entries.length} entr(y/ies)`, entries);
        return entries;
    }

    /**
     * Builds Account: entries — the client's own running balance, one entry per calendar day from startDate (PeriodStart) through futureDate (PeriodEnd) inclusive.
     * Every day debits that day's own month's rate off the PREVIOUS day's balance (day 1's own "previous balance" is 0), then adds that day's own History entry.
     * The debit rate depends on the PREVIOUS day's own balance sign: PriceDay (the prepay discount) when the previous balance was >= 0, PriceMaxDay (the full rate) when it was negative — Price is a prepayment discount, so a client already in debt never gets it, even for the day they're catching up on.
     * History already carries a payment as a positive amount and a return as a negative one, so this is a plain add, never a separate credit/debit split.
     * Returns [{ "YYYY-MM-DD": balance }, ...], one entry per calendar day, no trailing ALL entry (a running balance has no meaningful sum).
     * @param {string} startDate
     * @param {string} futureDate
     * @param {Array<Object>} history
     * @param {Array<Object>} priceDay
     * @param {Array<Object>} priceMaxDay
     * @returns {Array<Object>}
     */
    static buildAccountEntries(startDate, futureDate, history, priceDay, priceMaxDay) {
        console.info(`[Yamls.buildAccountEntries] 🟢 Starting... startDate=${startDate} futureDate=${futureDate}`);

        const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
        if (!ISO_DATE.test(startDate) || !ISO_DATE.test(futureDate) || startDate > futureDate) {
            console.warn(`buildAccountEntries: invalid or empty startDate/futureDate (startDate=${startDate}, futureDate=${futureDate}); returning empty Account.`);
            return [];
        }

        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;
        const historyByDate = new Map(
            (Array.isArray(history) ? history : [])
                .filter(e => !('ALL' in e))
                .map(e => Object.entries(e)[0])
                .map(([d, a]) => [d, toAmount(a)])
        );
        const priceDayByMonth = new Map(
            (Array.isArray(priceDay) ? priceDay : [])
                .filter(e => !('ALL' in e))
                .map(e => Object.entries(e)[0])
                .map(([m, a]) => [m, toAmount(a)])
        );
        const priceMaxDayByMonth = new Map(
            (Array.isArray(priceMaxDay) ? priceMaxDay : [])
                .filter(e => !('ALL' in e))
                .map(e => Object.entries(e)[0])
                .map(([m, a]) => [m, toAmount(a)])
        );

        const entries = [];
        let balance = 0;
        let day = startDate;

        // Hard backstop against any unforeseen non-terminating case — ~137 years of daily entries, far beyond any real contract term.
        const MAX_DAYS = 50000;

        while (day <= futureDate && entries.length < MAX_DAYS) {
            const historyAmount = historyByDate.get(day) || 0;
            const month = day.slice(0, 7);
            const monthDebit = balance >= 0
                ? (priceDayByMonth.get(month) || 0)
                : (priceMaxDayByMonth.get(month) || 0);
            balance = balance - monthDebit + historyAmount;

            entries.push({ [day]: balance.toLocaleString('en-US') });
            day = Yamls._addOneDayIso(day);
        }

        console.log(`buildAccountEntries: ${entries.length} day(s), final balance=${entries.length ? Object.values(entries[entries.length - 1])[0] : 0}`);
        return entries;
    }

    // Chains real cash payments (Bank-OT + Trans-OT + Card-OT, in date
    // order) across Accrual's own periods, in order, starting from period 1
    // — never by arrival-date-vs-due-date comparison, never banking credit
    // past the whole months it actually covers. For each period: Payment[i]
    // = however much of the running payment total reaches that period (fully
    // or partially), Loaners[i] = that period's own Accrual minus Payment[i].
    // Payment[i] + Loaners[i] === Accrual[i] always holds.
    //
    // Returns { payment: [...], loaners: [...] }, same shape/order as accrual.
    static computePaymentChain(accrual, payments) {
        console.info(`[Yamls.computePaymentChain] 🟢 Starting...`);

        const totalPaid = (Array.isArray(payments) ? payments : [])
            .reduce((sum, entry) => sum + (Number(String(Object.values(entry)[0]).replace(/,/g, '')) || 0), 0);

        let remaining = totalPaid;
        const payment = [];
        const loaners = [];

        for (const entry of accrual) {
            const [intervalKey, amount] = Object.entries(entry)[0];
            const owed = Number(String(amount).replace(/,/g, '')) || 0;

            let paid;
            if (remaining >= owed) { paid = owed; remaining -= owed; }
            else if (remaining > 0) { paid = remaining; remaining = 0; }
            else { paid = 0; }

            payment.push({ [intervalKey]: paid.toLocaleString('en-US') });
            loaners.push({ [intervalKey]: (owed - paid).toLocaleString('en-US') });
        }

        console.log(`computePaymentChain: totalPaid=${totalPaid}`, { payment, loaners });
        return { payment, loaners };
    }

    // Distributes real EHF-IN invoice amounts across FINAL (already
    // recomputeChain-settled) Accrual periods — chains total invoiced sum
    // across accrual's periods in order via computePaymentChain, keeping
    // only `payment` half (month's own Loaners-vs-invoice split has no
    // meaning here, EHF-IN is document, not cash). Once whole EHF-IN sum
    // exhausted, every remaining period gets 0 — computePaymentChain
    // already produces exactly that once running `remaining` pool hits
    // zero.
    //
    // Faktura's OWN key is each period's END date (Dates.monthEnd of
    // Accrual's own start-date key) — deliberately NOT the same bare start
    // date Accrual/Payment/Loaners/PenaltyDays/Penalty all share, since an
    // invoice document is dated by when its period closes, not when it
    // opened. computePaymentChain itself still forwards accrual's own key
    // verbatim (shared by Loaners' own call) — the start->end remap happens
    // here, after chaining, output-only.
    //
    // Returns [{ "end": amount }, ..., { ALL: sum }], same order as
    // Payment/Loaners (accrual's own trailing { ALL } entry skipped —
    // computePaymentChain expects bare period entries).
    static computeFaktura(accrual, ehfIn) {
        console.info(`[Yamls.computeFaktura] 🟢 Starting...`);

        const periods = accrual.filter(e => !('ALL' in e));
        const { payment: chained } = Yamls.computePaymentChain(periods, ehfIn);

        const faktura = chained.map(entry => {
            const [start, amount] = Object.entries(entry)[0];
            return { [Dates.monthEnd(start)]: amount };
        });

        const sum = faktura.reduce((s, e) => s + (Number(String(Object.values(e)[0]).replace(/,/g, '')) || 0), 0);
        const result = [...faktura, { ALL: sum.toLocaleString('en-US') }];

        console.log(`computeFaktura: sum=${sum}`, result);
        return result;
    }

    // Per-period amount NOT YET invoiced — Accrual[period] minus that
    // period's own Faktura amount (an invoice is always eventually sent for
    // the full Accrual; FakturaSend is the shortfall still owed). Reuses
    // computePaymentChain's own `loaners` half (owed - paid, same math
    // computeFaktura's `payment` half is built from) rather than
    // recomputing the subtraction by hand — same bare-date key remap as
    // computeFaktura (Accrual's start date -> Dates.monthEnd), so
    // FakturaSend and Faktura always share the same key for the same
    // period.
    //
    // Returns [{ "end": amount }, ..., { ALL: sum }], same order/shape as
    // Faktura.
    static computeFakturaSend(accrual, ehfIn) {
        console.info(`[Yamls.computeFakturaSend] 🟢 Starting...`);

        const periods = accrual.filter(e => !('ALL' in e));
        const { loaners: chained } = Yamls.computePaymentChain(periods, ehfIn);

        const fakturaSend = chained.map(entry => {
            const [start, amount] = Object.entries(entry)[0];
            return { [Dates.monthEnd(start)]: amount };
        });

        const sum = fakturaSend.reduce((s, e) => s + (Number(String(Object.values(e)[0]).replace(/,/g, '')) || 0), 0);
        const result = [...fakturaSend, { ALL: sum.toLocaleString('en-US') }];

        console.log(`computeFakturaSend: sum=${sum}`, result);
        return result;
    }

    // Recomputes Accrual/Payment/Loaners to a fixed point: applying PriceMax
    // to debt months can change which months are in debt (a higher Accrual
    // for one month can push a later month into debt too, or a lower one out
    // of it), so the PriceMax substitution + payment-chain allocation are
    // re-run together until Loaners stops changing (bounded — at most one
    // pass per Accrual entry can ever flip, so this always terminates).
    static recomputeChain(startDate, futureDate, price, priceMax, payments) {
        console.info(`[Yamls.recomputeChain] 🟢 Starting...`);

        let accrual = Yamls.buildAccrualEntries(startDate, futureDate, price);
        let { payment, loaners } = Yamls.computePaymentChain(accrual, payments);

        for (let i = 0; i < accrual.length; i++) {
            const nextAccrual = Yamls.applyPriceMaxToDebtMonths(accrual, loaners, startDate, priceMax);
            const nextChain = Yamls.computePaymentChain(nextAccrual, payments);

            const unchanged = JSON.stringify(nextChain.loaners) === JSON.stringify(loaners);
            accrual = nextAccrual;
            payment = nextChain.payment;
            loaners = nextChain.loaners;

            if (unchanged) break;
        }

        const sum = (arr) => arr.reduce((s, e) => s + (Number(String(Object.values(e)[0]).replace(/,/g, '')) || 0), 0);
        accrual = [...accrual, { ALL: sum(accrual).toLocaleString('en-US') }];
        payment = [...payment, { ALL: sum(payment.filter(e => !('ALL' in e))).toLocaleString('en-US') }];
        loaners = [...loaners, { ALL: sum(loaners.filter(e => !('ALL' in e))).toLocaleString('en-US') }];

        console.log(`recomputeChain: done`, { accrual, payment, loaners });
        return { accrual, payment, loaners };
    }

    // One calendar day later than 'YYYY-MM-DD' dateIso, same format — plain
    // ISO-string day-stepper for the daily-balance simulation below (Dates.
    // addDays takes/returns DD.MM.YYYY, wrong shape for this use).
    static _addOneDayIso(dateIso) {
        const d = new Date(`${dateIso}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() + 1);
        return d.toISOString().slice(0, 10);
    }

    // Contract §3.7/§1.20 + §21.1 — a prepaid running-balance model, like a
    // provider account: every calendar day, that day's pro-rated share of
    // its own month's Accrual is DEBITED from the client's balance; every
    // Payment (Bank-OT+Card-OT+BaaR-OT+Trans-OT merged) entry CREDITS the
    // balance on its own date; every Returns (Bank-IN+Card-IN+BaaR-IN
    // merged) entry DEBITS the balance on its own date. Simulated day by day
    // from startDate through futureDate (both 'YYYY-MM-DD'), inclusive.
    //
    // Returns [{ date, debit, credit, balance }, ...], one entry per
    // calendar day in order — the full day-by-day ledger, consumed by
    // computePenaltyDays below (and useful on its own for audit/debugging).
    static computeDailyBalance(startDate, futureDate, accrual, payment, returns) {
        console.info(`[Yamls.computeDailyBalance] 🟢 Starting... startDate=${startDate} futureDate=${futureDate}`);

        // Guard against missing/malformed bounds (e.g. an unresolvable
        // PeriodEnd collapsing to dayjs's literal "Invalid Date" string) —
        // a non-YYYY-MM-DD futureDate can sort lexically AFTER any real ISO
        // date, which would otherwise turn the day-stepper loop below into
        // an infinite one. Bail out to an empty ledger instead.
        const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
        if (!ISO_DATE.test(startDate) || !ISO_DATE.test(futureDate) || startDate > futureDate) {
            console.warn(`computeDailyBalance: invalid or empty startDate/futureDate (startDate=${startDate}, futureDate=${futureDate}); returning empty ledger.`);
            return [];
        }

        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;

        const accrualByMonth = new Map();
        for (const entry of accrual) {
            if ('ALL' in entry) continue;
            const [intervalKey, amount] = Object.entries(entry)[0];
            const [start] = intervalKey.split('#');
            accrualByMonth.set(start.slice(0, 7), toAmount(amount));
        }

        const paymentByDate = new Map((payment || []).map(e => Object.entries(e)[0]).map(([d, a]) => [d, toAmount(a)]));
        const returnByDate = new Map((returns || []).map(e => Object.entries(e)[0]).map(([d, a]) => [d, toAmount(a)]));

        const ledger = [];
        let balance = 0;
        let day = startDate;

        // Hard backstop against any other unforeseen non-terminating case —
        // ~137 years of daily entries, far beyond any real contract term.
        const MAX_DAYS = 50000;

        while (day <= futureDate && ledger.length < MAX_DAYS) {
            const monthKey = day.slice(0, 7);
            const monthStart = `${monthKey}-01`;
            const monthAccrual = accrualByMonth.get(monthKey) ?? 0;
            const daysInMonth = Dates.daysInMonth(monthStart);
            const debit = monthAccrual / daysInMonth;
            const credit = (paymentByDate.get(day) || 0) - (returnByDate.get(day) || 0);

            balance += credit - debit;
            ledger.push({ date: day, debit, credit, balance });

            day = Yamls._addOneDayIso(day);
        }

        console.log(`computeDailyBalance: ${ledger.length} day(s), final balance=${ledger.length ? ledger[ledger.length - 1].balance : 0}`);
        return ledger;
    }

    /**
     * Contract §21.1 — a fixed PerDay penalty for each calendar day Account's own running balance stays negative BEYOND the 1-calendar-day grace period (§3.7/§1.20: first/each prepayment due within 1 day).
     * The first day a deficit appears is grace, never itself a penalty day; every CONSECUTIVE day after that the balance is still negative counts.
     * A day where balance recovers to >= 0 resets the grace window — a LATER deficit starts its own fresh 1-day grace period.
     * Reads Account directly (the same daily ledger written to the .contract yaml) rather than a separate internal computeDailyBalance simulation.
     * @param {Array<Object>} account
     * @returns {Array<Object>} [{ "YYYY-MM": penaltyDayCount }, ..., { ALL: sum }], one bare-month-keyed entry per calendar month Account covers.
     */
    static computePenaltyDays(account) {
        console.info(`[Yamls.computePenaltyDays] 🟢 Starting...`);

        const entries = (Array.isArray(account) ? account : []).filter(e => !('ALL' in e));
        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;

        let deficitStreak = 0;
        const countByMonth = new Map();
        for (const entry of entries) {
            const [date, balance] = Object.entries(entry)[0];
            const month = date.slice(0, 7);
            if (!countByMonth.has(month)) countByMonth.set(month, 0);

            if (toAmount(balance) < 0) {
                deficitStreak++;
                // First day of a NEW deficit streak is the 1-day grace period — only the 2nd+ consecutive negative day counts.
                if (deficitStreak > 1) countByMonth.set(month, countByMonth.get(month) + 1);
            } else {
                deficitStreak = 0;
            }
        }

        const result = [...countByMonth.entries()].map(([month, count]) => ({ [month]: count }));
        const total = result.reduce((s, e) => s + Object.values(e)[0], 0);
        const withTotal = [...result, { ALL: total }];

        console.log(`computePenaltyDays: total=${total}`, withTotal);
        return withTotal;
    }

    /**
     * Penalty[month] = PenaltyDays[month] * PenaltyForDay (contract §21.1's fixed per-calendar-day rate, config.yml's Penalty.PerDay, default 50,000), capped at HALF that month's own PriceMaxMon amount.
     * A month whose straight PenaltyDays * PenaltyForDay figure would exceed PriceMaxMon[month] / 2 is clamped down to that half-PriceMax figure instead.
     * @param {Array<Object>} penaltyDays
     * @param {string|number} penaltyForDay
     * @param {Array<Object>} priceMaxMon
     * @returns {Array<Object>} [{ "YYYY-MM": penaltyAmount }, ..., { ALL: sum }], same key shape as PenaltyDays.
     */
    static computePenalty(penaltyDays, penaltyForDay, priceMaxMon) {
        console.info(`[Yamls.computePenalty] 🟢 Starting... penaltyForDay=${penaltyForDay}`);

        const rate = Number(String(penaltyForDay).replace(/,/g, '')) || 0;
        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;
        const priceMaxByMonth = new Map(
            (Array.isArray(priceMaxMon) ? priceMaxMon : [])
                .filter(e => !('ALL' in e))
                .map(e => Object.entries(e)[0])
                .map(([m, a]) => [m, toAmount(a)])
        );
        let total = 0;

        const result = (Array.isArray(penaltyDays) ? penaltyDays : []).filter(e => !('ALL' in e)).map(entry => {
            const [month, days] = Object.entries(entry)[0];
            const rawAmount = days * rate;
            const cap = (priceMaxByMonth.get(month) || 0) / 2;
            const amount = rawAmount > cap ? cap : rawAmount;
            total += amount;
            return { [month]: amount.toLocaleString('en-US') };
        });

        const withTotal = [...result, { ALL: total.toLocaleString('en-US') }];
        console.log(`computePenalty: total=${total}`, withTotal);
        return withTotal;
    }

    // The real incoming-cash columns among Excel.CellNames — Bank-OT (bank
    // transfer out from the tenant, i.e. IN to the landlord), Trans-OT
    // (direct transfer), Card-OT (card payment out from the tenant), and
    // BaaR-OT (BaaR ledger payment out from the tenant). EHF-IN is an
    // e-invoice record, not cash; Bank-IN/Card-IN/BaaR-IN are refunds BACK
    // to the tenant (see Returns, computed separately) — none of the -IN
    // keys count as rent paid.
    static actualPayments(yamlData) {
        console.info(`[Yamls.actualPayments] 🟢 Starting...`);

        const bankOT = Array.isArray(yamlData['Bank-OT']) ? yamlData['Bank-OT'] : [];
        const transOT = Array.isArray(yamlData['Trans-OT']) ? yamlData['Trans-OT'] : [];
        const cardOT = Array.isArray(yamlData['Card-OT']) ? yamlData['Card-OT'] : [];
        const baarOT = Array.isArray(yamlData['BaaR-OT']) ? yamlData['BaaR-OT'] : [];

        const payments = [...bankOT, ...transOT, ...cardOT, ...baarOT];
        console.log(`actualPayments: ${payments.length} entr(y/ies)`, payments);
        return payments;
    }

    // Merges several date-keyed arrays (each shaped like scanCellFolder's
    // own output — [{ "YYYY-MM-DD": amount }, ...]) into ONE flat array, one
    // entry per distinct date, summing amounts when the SAME date appears in
    // more than one source array (e.g. a Bank-OT and a Card-OT payment both
    // landing on the same day are added together, not kept as two entries).
    // Sorted by date. No "ALL" trailing total — callers append their own if
    // needed.
    static mergeDateKeyedArrays(...arrays) {
        console.info(`[Yamls.mergeDateKeyedArrays] 🟢 Starting...`);

        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;
        const totals = new Map();

        for (const arr of arrays) {
            if (!Array.isArray(arr)) continue;
            for (const entry of arr) {
                const [date, amount] = Object.entries(entry)[0];
                totals.set(date, (totals.get(date) || 0) + toAmount(amount));
            }
        }

        const merged = [...totals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, amount]) => ({ [date]: amount.toLocaleString('en-US') }));

        console.log(`mergeDateKeyedArrays: ${merged.length} distinct date(s)`, merged);
        return merged;
    }

    // Merges the WRITTEN Payment: and Returns: arrays (both flat,
    // date-keyed, already-merged views — never Accrual/Loaners) into ONE
    // flat date-keyed History array, one entry per distinct date: a
    // Payment amount is carried AS-IS (positive), a Returns amount is
    // NEGATED — a date present in both is summed with Returns already
    // negative, so a same-day payment+return nets out. Sorted by date. No
    // "ALL" trailing total.
    static computeHistory(payment, returns) {
        console.info(`[Yamls.computeHistory] 🟢 Starting...`);

        const toAmount = (v) => Number(String(v).replace(/,/g, '')) || 0;
        const totals = new Map();

        for (const entry of Array.isArray(payment) ? payment : []) {
            const [date, amount] = Object.entries(entry)[0];
            totals.set(date, (totals.get(date) || 0) + toAmount(amount));
        }

        for (const entry of Array.isArray(returns) ? returns : []) {
            const [date, amount] = Object.entries(entry)[0];
            totals.set(date, (totals.get(date) || 0) - toAmount(amount));
        }

        const history = [...totals.entries()]
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([date, amount]) => ({ [date]: amount.toLocaleString('en-US') }));

        console.log(`computeHistory: ${history.length} distinct date(s)`, history);
        return history;
    }

    // Writes/replaces the History: array block IN PLACE at its existing
    // position, or after Accrual: as a fallback anchor for a brand-new file
    // — the merged Payment+Returns view from computeHistory (Payment as-is,
    // Returns negated), one entry per distinct date. Sits directly after
    // Accrual:, before Payment: (see #writeChain/writePayment's own anchor).
    //   History:
    //     - '2026-04-21': '1,600,000'
    //     - '2026-04-25': '-10,000'
    static writeHistory(filePath, history) {
        console.info(`[Yamls.writeHistory] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'History', history, 'Accrual', [], true);
    }

    /**
     * Writes/replaces the Account: array block IN PLACE at its existing position, or after History: as a fallback anchor for a file that has never had this key before (see buildAccountEntries).
     * One entry per calendar day, "YYYY-MM-DD" key, the client's own running balance for that exact day.
     * @example
     *   Account:
     *     - 2026-01-19: 0
     *     - 2026-01-20: -50,000
     * @param {string} filePath
     * @param {Array<Object>} account
     */
    static writeAccount(filePath, account) {
        console.info(`[Yamls.writeAccount] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Account', account, 'History', [], true);
    }

    // Writes/replaces the Returns: array block IN PLACE at its existing
    // position, or after Penalty: as a fallback anchor for a brand-new file
    // — a flat, date-keyed merge of Bank-IN + Card-IN + BaaR-IN (money
    // returned BACK to the tenant), same-date entries summed. NOT chained
    // against Accrual — plain merge, same shape as a raw
    // scanCellFolder/Excel.CellNames array.
    //   Returns:
    //     - '2026-04-21': '1,600,000'
    static writeReturns(filePath, returns) {
        console.info(`[Yamls.writeReturns] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Returns', returns, 'Penalty', [], true);
    }

    // Writes/replaces the Accrual: array block IN PLACE at its existing
    // position; a file that has NEVER had an Accrual: key falls back to
    // inserting directly after the ComBase: line — ComBase is the last
    // static field before the chain in a brand-new template's layout
    // (ActDateEnd -> ContractDateEnd -> ComBase -> Accrual -> ... ->
    // Penalty -> Excel.CellNames keys), NOT ActDateEnd: itself —
    // ContractDateEnd/ComBase already sit between ActDateEnd and where the
    // chain belongs there, and anchoring on ActDateEnd would insert Accrual
    // BEFORE them on that first-ever write. An already-populated file's own
    // order (whatever it is) is never touched.
    //   Accrual:
    //     - 2026-03-01: 450,000
    //     - 2026-04-01: 450,000
    //     - ALL: 900,000
    static writeAccrual(filePath, accrual) {
        console.info(`[Yamls.writeAccrual] 🟢 Starting...`);
        // 'ComBase' is only the fallback anchor for a file that has NEVER
        // had an Accrual: key before — an already-existing block updates
        // strictly in place, at its own real position, per
        // writeYamlArraySection's order-preserving contract.
        this.writeYamlArraySection(filePath, 'Accrual', accrual, 'ComBase', ['Pricings', 'PriceHistory'], false);
    }

    // Writes/replaces the Payment: array block IN PLACE at its existing
    // position, or after History: as a fallback anchor for a brand-new file
    // — a flat, date-keyed merge of Bank-OT + Card-OT + BaaR-OT + Trans-OT
    // (money received FROM the tenant), same-date entries summed. NOT
    // chained/allocated against Accrual periods — plain merge, same shape as
    // Returns/a raw scanCellFolder array. (Loaners/Penalty no longer read
    // this written form — they're derived from the daily-balance ledger via
    // computeDailyBalance/computePenaltyDays instead; see replaceYaml.)
    //   Payment:
    //     - '2026-04-21': '1,600,000'
    static writePayment(filePath, payment) {
        console.info(`[Yamls.writePayment] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Payment', payment, 'History', [], true);
    }

    /**
     * Writes/replaces the Loaners: scalar line IN PLACE at its existing position, or after History: as a fallback anchor for a file that has never had this key before.
     * Value: the ABSOLUTE value of Account's own LAST entry — the outstanding debt (or surplus, if positive) at PeriodEnd.
     * A plain scalar, NOT an array — the array shape was retired once Account itself carried the full daily detail.
     * @example
     *   Loaners: 893,342
     * @param {string} filePath
     * @param {string|number} loanersTotal
     */
    static writeLoaners(filePath, loanersTotal) {
        console.info(`[Yamls.writeLoaners] 🟢 Starting...`);
        this.writeScalarSection(filePath, 'Loaners', loanersTotal, 'History');
    }

    /**
     * Writes/replaces the PenaltyDays: array block IN PLACE at its existing position, or after Faktura: as a fallback anchor for a brand-new file — per-month count of deficit-balance days (contract §21.1's fixed daily rate applies to each), Penalty is directly derived from this (Penalty[i] = PenaltyDays[i] * PenaltyForDay).
     * See Yamls.computePenaltyDays.
     * Anchor is Faktura, NOT Loaners — Loaners is now a plain scalar (see writeLoaners), and anchoring here avoids splitting the Account/Payment/Faktura group away from Loaners on a brand-new file's first-ever chain write.
     * @example
     *   PenaltyDays:
     *     - 2026-07: 3
     *     - 2026-08: 0
     *     - ALL: 3
     * @param {string} filePath
     * @param {Array<Object>} penaltyDays
     */
    static writePenaltyDays(filePath, penaltyDays) {
        console.info(`[Yamls.writePenaltyDays] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PenaltyDays', penaltyDays, 'Faktura', [], true);
    }

    // Writes/replaces the Penalty: array block IN PLACE at its existing
    // position, or after PenaltyDays: as a fallback anchor for a brand-new
    // file — a file that never had any of this chain's keys still gets the
    // whole Accrual->Payment->Faktura->Loaners->PenaltyDays->Penalty chain
    // written as one contiguous run anchored off ComBase (see writeAccrual);
    // an existing file's own key order/comments are never touched.
    //   Penalty:
    //     - 2026-07-01: 150,000
    //     - 2026-08-01: 0
    //     - ALL: 150,000
    static writePenalty(filePath, penalty) {
        console.info(`[Yamls.writePenalty] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Penalty', penalty, 'PenaltyDays', ['Punish'], true);
    }

    /**
     * Writes/replaces PriceMon: block in place, or after Penalty: as fallback anchor on first write (see buildPriceMonEntries).
     * Keyed by bare "YYYY-MM" (no day), one entry per Accrual period.
     * Strips a legacy PriceApp: block (the old key name, before the PriceApp -> PriceMon rename) — same in-place migration mechanism writeAccrual already uses for Pricings/PriceHistory.
     * @example
     *   PriceMon:
     *     - 2026-01: 1,620,000
     *     - 2026-02: 1,620,000
     * @param {string} filePath
     * @param {Array<Object>} priceMon
     */
    static writePriceMon(filePath, priceMon) {
        console.info(`[Yamls.writePriceMon] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PriceMon', priceMon, 'Penalty', ['PriceApp'], true);
    }

    /**
     * Writes/replaces PriceMaxMon: block in place, or after PriceMon: as fallback anchor on first write (see buildPriceMaxMonEntries).
     * Same bare "YYYY-MM" key as PriceMon.
     * Strips a legacy PriceMaxApp: block (the old key name) the same way writePriceMon strips PriceApp.
     * @example
     *   PriceMaxMon:
     *     - 2026-01: 1,620,000
     * @param {string} filePath
     * @param {Array<Object>} priceMaxMon
     */
    static writePriceMaxMon(filePath, priceMaxMon) {
        console.info(`[Yamls.writePriceMaxMon] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PriceMaxMon', priceMaxMon, 'PriceMon', ['PriceMaxApp'], true);
    }

    /**
     * Writes/replaces PriceDay: block in place, or after PriceMaxMon: as fallback anchor on first write (see buildPriceDayEntries).
     * Same bare "YYYY-MM" key as PriceMon.
     * @example
     *   PriceDay:
     *     - 2026-01: 52,258
     *     - 2026-02: 57,857
     * @param {string} filePath
     * @param {Array<Object>} priceDay
     */
    static writePriceDay(filePath, priceDay) {
        console.info(`[Yamls.writePriceDay] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PriceDay', priceDay, 'PriceMaxMon', [], true);
    }

    /**
     * Writes/replaces PriceMaxDay: block in place, or after PriceDay: as fallback anchor on first write (see buildPriceDayEntries, reused for PriceMaxDay too).
     * Same bare "YYYY-MM" key as PriceMon.
     * @example
     *   PriceMaxDay:
     *     - 2026-01: 52,258
     * @param {string} filePath
     * @param {Array<Object>} priceMaxDay
     */
    static writePriceMaxDay(filePath, priceMaxDay) {
        console.info(`[Yamls.writePriceMaxDay] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PriceMaxDay', priceMaxDay, 'PriceDay', [], true);
    }

    // Writes/replaces the Faktura: array block IN PLACE at its existing
    // position, or after Payment: as a fallback anchor for a brand-new file
    // — the real EHF-IN invoice sum distributed across the final Accrual
    // periods (see computeFaktura). Keyed by each period's own END date
    // (last day of month), NOT Accrual's start-date key.
    //   Faktura:
    //     - 2026-03-31: 450,000
    //     - 2026-04-30: 0
    //     - ALL: 450,000
    static writeFaktura(filePath, faktura) {
        console.info(`[Yamls.writeFaktura] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Faktura', faktura, 'Payment', [], true);
    }

    // Writes/replaces the FakturaSend: array block IN PLACE at its existing
    // position, or after Faktura: as a fallback anchor for a brand-new file
    // — per-period amount NOT YET invoiced (see computeFakturaSend). Same
    // end-date key as Faktura.
    //   FakturaSend:
    //     - 2026-01-31: 0
    //     - 2026-07-31: 1,620,000
    static writeFakturaSend(filePath, fakturaSend) {
        console.info(`[Yamls.writeFakturaSend] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'FakturaSend', fakturaSend, 'Faktura', [], true);
    }

    // Scans <folderALL>/<key>/ for dated subfolders (ported from
    // Excels.scanSubFolder + Excels.processFolders — same "YYYY-MM-DD amount"
    // naming, same numeric sort) and returns [{date, amount}], sorted, amount
    // re-formatted with a thousands comma (toLocaleString('en-US')) — same
    // shape as every other computed value this class writes (Accrual/
    // Payment/Returns/etc.), e.g. { '2026-03-31': '3,200,000' }, never a bare
    // unformatted '3200000'. Returns [] when the folder doesn't exist — this
    // is what lets a key be written as an empty array by default.
    //
    // The folder-name whitespace/comma formatting is NOT normalized on disk —
    // "2026-02-03 2,340,000" (single space), "2026-02-03  2,340,000" (double
    // space), and both with/without the thousands comma are all accepted by
    // the same regex (\s+ = one-or-more spaces, [\d,]+ = digits with optional
    // commas). But TWO differently-formatted folders for the SAME underlying
    // date+amount (e.g. a single- and a double-space variant of the same
    // payment, created by mistake) must never be double-counted as two
    // separate payments — the result is deduplicated by normalized
    // "date|amount" key, keeping the FIRST folder encountered in sorted
    // order.
    static scanCellFolder(folderALL, key) {
        console.info(`[Yamls.scanCellFolder] 🟢 Starting... key=${key}`);

        const folderPath = path.join(folderALL, key);
        if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
            return [];
        }

        const subFolders = fs.readdirSync(folderPath)
            .map(f => path.join(folderPath, f))
            .filter(f => fs.statSync(f).isDirectory());

        subFolders.sort((a, b) =>
            path.basename(a).localeCompare(path.basename(b), undefined, { numeric: true, sensitivity: 'base' })
        );

        const entries = [];
        const seen = new Set();
        for (const folder of subFolders) {
            const name = path.basename(folder);
            const match = name.match(/^(\d{4}-\d{2}-\d{2})\s+([\d,]+)$/);
            if (!match) continue;

            const date = match[1];
            const rawAmount = match[2].replace(/,/g, '').replace(/\s/g, '');

            const dedupeKey = `${date}|${rawAmount}`;
            if (seen.has(dedupeKey)) {
                console.warn(`⚠️ scanCellFolder: ${key} — duplicate date+amount folder for ${dedupeKey} ("${name}"), skipping.`);
                continue;
            }
            seen.add(dedupeKey);

            const amount = (Number(rawAmount) || 0).toLocaleString('en-US');
            entries.push({ [date]: amount });
        }

        console.log(`scanCellFolder: ${key} -> ${entries.length} entr(y/ies)`, entries);
        return entries;
    }

    // Writes every Excel.CellNames key (Bank-OT, Bank-IN, EHF-IN, Trans-OT,
    // BaaR-OT, BaaR-IN, Card-OT, Card-IN, Bonuses — the same set
    // Excels.generate reads via config.yml) into the .contract yaml as its own
    // array block, right after Returns: (which itself sits right after
    // Penalty:, which sits right after PenaltyDays:, which sits right after
    // Loaners:, which sits right after Faktura:, which sits right after
    // Payment: — see writePayment/writeFaktura/writeLoaners/writePenaltyDays/
    // writePenalty/writeReturns) — each populated from
    // scanCellFolder(folderALL, key) when that folder exists, or left as an
    // empty array ("KeyName: []") when it doesn't, so every key is always
    // present even with no data yet.
    static writeCellArrays(ymlFile, folderALL) {
        console.info(`[Yamls.writeCellArrays] 🟢 Starting...`);

        const cellNames = this.getConfig('Excel.CellNames', 'array', []);
        console.log('writeCellArrays: cellNames', cellNames);

        let afterKey = 'Returns';
        for (const key of cellNames) {
            const entries = this.scanCellFolder(folderALL, key);
            this.writeYamlArraySection(ymlFile, key, entries, afterKey, [], true);
            afterKey = key;
        }
    }

    static loadYamlWithDeps(ymlFile) {
        console.info(`[Yamls.loadYamlWithDeps] 🟢 Starting...`);

        console.log("Using ymlFile", ymlFile);
        let data = Yamls.loadAndParseYaml(ymlFile);
        console.log(data, 'data Yaml');


        if (Files.isEmpty(data.WhoAmI)) {
            console.warn("Using default bank", data.WhoAmI);
            data.WhoAmI = Yamls.getConfig('Contract.DefaultBank');
        }

        const whoAmIYaml = path.join(Files.currentDir(), 'conf', 'bank', data.WhoAmI + ".yaml")
        console.info("Using whoAmIYaml", whoAmIYaml);

        if (!existsSync(whoAmIYaml)) Dialogs.warningBox(whoAmIYaml, "whoAmIYaml file not found. .");

        let whoAmIYamlData = Yamls.loadAndParseYaml(whoAmIYaml);
        console.log(whoAmIYamlData, 'whoAmIYaml Yaml data');

        // merge arrays whoAmIYamlData and data
        data = { ...whoAmIYamlData, ...data };

        if (Files.isEmpty(data.Tariff)) {
            console.warn("Using default tariff", data.Tariff);
            data.Tariff = Yamls.getConfig('Contract.DefaultTariff');
        }

        const priceYaml = path.join(Files.currentDir(), 'conf', 'cost', data.Tariff + ".yaml")
        console.info("Using priceYaml", priceYaml);

        if (!existsSync(priceYaml)) Dialogs.warningBox(priceYaml, "priceYaml file not found. .");

        let priceYamlData = Yamls.loadAndParseYaml(priceYaml);
        console.log(priceYamlData, 'priceYamlData Yaml data');

        // merge arrays priceYamlData and data
        data = { ...priceYamlData, ...data };
        console.info("Merged data with priceYamlData:", data);


        return data;
    }


    // Load and parse YAML file with custom preprocessing
    static loadAndParseYaml(ymlFile) {
    console.info(`[Yamls.loadAndParseYaml] 🟢 Starting...`);
        const yamlOptions = {
            schema: yaml.JSON_SCHEMA,
            onWarning: (e) => { console.warn('YAML ogohlantirishi:', e); }
        };

        const ymlRaw = fs.readFileSync(ymlFile, 'utf8');

        const seenKeys = new Set();
        let skipMode = false;

        const ymlPatched = ymlRaw.split('\n').map(line => {
            const isTopLevel = /^[^\s]/.test(line);

            // Handle duplicate root-level mapping keys within the SAME file
            // When found, enter skipMode to comment out the entire duplicate block
            if (isTopLevel && line.includes(':') && !line.trim().startsWith('#')) {
                const idx = line.indexOf(':');
                let key = line.slice(0, idx);
                let cleanKey = key.trim();

                if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
                    cleanKey = cleanKey.slice(1, -1);
                }

                if (seenKeys.has(cleanKey)) {
                    skipMode = true;
                    return `# [SKIPPED DUPLICATE] ${line}`;
                } else {
                    seenKeys.add(cleanKey);
                    skipMode = false;
                }
            }

            if (skipMode) {
                return `# [SKIPPED] ${line}`;
            }

            if (!line.includes(':') || line.trim().startsWith('#')) return line;

            const idx = line.indexOf(':');
            let key = line.slice(0, idx);
            let value = line.slice(idx + 1).trim();

            let finalLine = line;

            if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
                let inner = value.slice(1, -1);
                // Clean already escaped to avoid double-escaping
                inner = inner.replace(/\\"/g, '"');
                // Escape all inner double quotes
                inner = inner.replace(/"/g, '\\"');
                return `${key}: "${inner}"`;
            }

            if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
                let inner = value.slice(1, -1);
                inner = inner.replace(/\\'/g, "'");
                inner = inner.replace(/'/g, "\\'");
                return `${key}: '${inner}'`;
            }

            if (value === 'null' || value === 'true' || value === 'false') {
                return finalLine;
            }

            if (value === '' || value.startsWith('#')) {
                return finalLine;
            }

            if (/^\d{1,}$/.test(value)) {
                return `${key}: "${value}"`;
            }

            if (/[",]/.test(value)) {
                // Escape internal double quotes
                const safeValue = value.replace(/"/g, '\\"');
                return `${key}: "${safeValue}"`;
            }

            return finalLine;
        }).join('\n');

        const data = yaml.load(ymlPatched, yamlOptions);
        // console.log(data);

        // iterate data and trim all values into new array
        const trimmedData = Object.entries(data).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? value.trim() : value;
            return acc;
        }, {});

        return trimmedData;
    }


    static extractFirstNumber(str) {
    console.info(`[Yamls.extractFirstNumber] 🟢 Starting...`);
        const match = str.match(/^(\d+)/);
        return match ? match[1] : null;
    }



    static async update(ymlFile) {
    console.info(`[Yamls.update] 🟢 Starting...`);
        const template = path.resolve(Yamls.getConfig('Templates.Yaml'));

        console.log("Using template", template);

        // ⚠️ Check template BEFORE any destructive backup/delete operations.
        // Files.exists() is async — must be awaited; missing await caused the
        // check to always pass (Promise is truthy), leading to the source
        // contract being deleted even when template did not exist.
        if (!await Files.exists(template)) {
            Dialogs.warningBox(`Template file not found: ${template}`, "Error");
            return;
        }

        if (!Word.initFolders(ymlFile))
            return false;

        let oldYaml = Files.backupFile(ymlFile, true);
        if (!oldYaml) return;

        let oldRest = Files.backupFolder(globalThis.folderRestAPI, true);
        if (!oldRest) return;

        let yamlData = Yamls.loadYamlWithDeps(oldYaml);
        console.log(yamlData, 'yamlData');

        // copy template file intop ymlFile only file
        await fs.promises.copyFile(template, ymlFile);

        if (existsSync(ymlFile))
            await this.fillYamlWithInfo(ymlFile, yamlData, false, true); // rewrite=true: backupFolder RestAPI ni o'chirdi, cache yo'q
        else
            Dialogs.warningBox(`ymlFile file not found: ${ymlFile}`, "Error");

    }

    static async fillYamlWithInfo(ymlFile, yamlData = null, backup = true, rewrite = true) {
    console.info(`[Yamls.fillYamlWithInfo] 🟢 Starting... rewrite=${rewrite}`);

        if (!ymlFile) {
            Dialogs.warningBox(`ymlFile is empty for TIN: ${ymlFile}`, ymlFile);
            return;
        }

        if (!Word.initFolders(ymlFile))
            return null;

        if (backup) Files.backupFile(ymlFile, false);

        if (!yamlData) yamlData = Yamls.loadYamlWithDeps(ymlFile);
        console.log(yamlData, 'yamlData');

        const jsonCachePath = path.join(globalThis.folderRestAPI, `ALL.json`);
        const cacheExists = existsSync(jsonCachePath);

        let companyInfo;

        if (!rewrite && cacheExists) {
            // ⚡ Cache rejimi: API chaqiriqlarini o'tkazib yuborish
            console.info(`[Yamls.fillYamlWithInfo] ⚡ rewrite=false, cache mavjud — API dan o'tkazib JSON cache o'qilmoqda: ${jsonCachePath}`);
            const raw = fs.readFileSync(jsonCachePath, 'utf8');
            companyInfo = JSON.parse(raw);
            console.log(companyInfo, 'companyInfo (from cache)');

            if (!companyInfo) {
                Dialogs.warningBox(`companyInfo cache bo'sh: ${jsonCachePath}`, jsonCachePath);
                return null;
            }
        } else {
            // 🌐 API rejimi: yangi ma'lumot olish va JSON ga yozish
            if (!rewrite && !cacheExists)
                console.warn(`[Yamls.fillYamlWithInfo] ⚠️ rewrite=false lekin cache topilmadi — API dan olinmoqda.`);

            // ComType is a starting-Variables field (filled by smarts-firm-docums from
            // the company's real registration documents: Statute, IP/YaTT certificate,
            // registry extract) — the human-confirmed legal form is the source of
            // truth for whether this company is a sole proprietor, replacing the old
            // automatic PINFL-vs-TIN-length inference (comTIN.length === 14). It also
            // decides which marker file comTIN resolves from: a Compan folder can
            // carry BOTH a 9-digit TIN marker and a 14-digit PINFL marker (the
            // director's/surety's own personal PINFL happens to live in the same
            // folder for an ordinary company, or the YaTT owner's ID marker for a
            // sole proprietor) — only ComType, never "which marker happens to exist",
            // decides which one IS this company's identity.
            const isYatt = yamlData.ComType === 'YaTT';
            console.info("Core isYatt (from ComType):", isYatt, yamlData.ComType);

            let comTIN = isYatt
                ? Files.getPINFLFromTXT(globalThis.folderCompan)
                : Files.getTINFromTXT(globalThis.folderCompan);
            console.info("comTIN (from ComType-selected marker):", comTIN, "isYatt:", isYatt);

            if (!comTIN) {
                Dialogs.warningBox(`comTIN is empty for TIN: ${ymlFile}`, ymlFile);
                return null;
            }

            if (isYatt)
                Files.saveInfoToFile(globalThis.folderALL, '#YaTT');

            companyInfo = await Didox.infoByTinPinfl(comTIN);
            console.log(companyInfo, 'companyInfo');

            if (!companyInfo) {
                Dialogs.warningBox(`companyInfo is empty for TIN: ${comTIN}`, comTIN);
                return null;
            }

            if (isYatt)
                companyInfo.directorPinfl = comTIN;

            let ceo = await Didox.infoByTinPinfl(companyInfo.directorPinfl, globalThis.folderDirector);
            console.log(ceo, 'ceo');

            if (ceo) {
                const person = path.join(globalThis.folderDirector, ceo.name);
                Files.saveInfoToFile(person, '#Director');

                companyInfo.ceo = ceo
            }

            if (!Files.isEmpty(yamlData.RepPINFL)) {
                let reps = await Didox.infoByTinPinfl(yamlData.RepPINFL, globalThis.folderPartners)
                console.log(reps, 'surety');
                companyInfo.reps = reps
            }

            if (!isYatt) {
                companyInfo.soliq = await MySoliq.companyInfo(comTIN);
                console.log(companyInfo.soliq, 'soliq');

                //     let vatInfo = await MySoliq.vatInfo(comTIN);
                //     console.log(vatInfo, 'vatInfo');
                //     companyInfo.vat = vatInfo

            } else {
                companyInfo.soliqYatt = await MySoliq.entrepreneurInfo(comTIN, yamlData.SurPassportSerial, yamlData.SurPassportNumber);
                console.log(companyInfo.soliqYatt, 'soliqYatt');
            }

            Files.writeJson(jsonCachePath, companyInfo)
            console.info(`[Yamls.fillYamlWithInfo] 💾 JSON cache yozildi: ${jsonCachePath}`);
        }

        // SurPINFL/surety derivation must run for BOTH the cache path and the API
        // path — companyInfo.directorPinfl/companyInfo.ceo are populated by both
        // (cache mode reads them straight from the persisted ALL.json). This used
        // to live only inside the API-only branch above, so a company processed
        // via the cache path (rewrite=false) never got its yamlData.SurPINFL
        // filled in, even when the cached companyInfo already had the correct
        // directorPinfl — the empty SurPINFL was then faithfully "confirmed" back
        // into the .contract file by replaceYaml's replaceTextLine pass.
        if (companyInfo.directorPinfl) {
            if (Files.isEmpty(yamlData.SurPINFL) || yamlData.SurPINFL === companyInfo.directorPinfl) {
                console.log("SurPINFL is empty, using companyInfo.directorPinfl", companyInfo.directorPinfl);
                yamlData.SurPINFL = companyInfo.directorPinfl
                companyInfo.surety = companyInfo.ceo
            } else {
                console.log("SurPINFL is not empty, using yamlData.SurPINFL", yamlData.SurPINFL);
                let surety = await Didox.infoByTinPinfl(yamlData.SurPINFL, globalThis.folderSureties)
                console.log(surety, 'surety');

                if (surety) {
                    companyInfo.surety = surety
                }
            }
        } else {
            console.warn(`directorPinfl is empty on companyInfo`)
        }

        Files.deleteInfo(globalThis.folderALL, `#From-`)
        Files.saveInfoToFile(globalThis.folderALL, `#From-${yamlData.MyCompany}`)

        Files.deleteInfo(globalThis.folderALL, `#Area-`)
        Files.saveInfoToFile(globalThis.folderALL, `#Area-${yamlData.Area}-kv`)

        Files.deleteInfo(globalThis.folderCompan, `-kv`)
        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.Area}-kv`)

        const filled = Yamls.replaceYaml(globalThis.ymlFile, yamlData, companyInfo);

        /*
        ContractDate is written into Compan/ as a DD.MM.YYYY marker (Didox format), mirroring the pre-existing DD.MM.YYYY marker Files.getDateFromTXT already reads from that folder.
        Written only after replaceYaml resolves ContractDate (auto-fill or manual) — never a stale value from before this run.
        */
        if (filled && Dates.isExcelDate(yamlData.ContractDate)) {
            const contractDateDidox = Dates.excelToDidox(yamlData.ContractDate);
            Files.deleteDateMarkers(globalThis.folderCompan);
            Files.saveInfoToFile(globalThis.folderCompan, contractDateDidox);
        }

        return filled;
    }


    /**
     * Prepay month count — yamlData.PrepayMonth, else config.yml Contract.PrepayMonth.
     * Returns null, never NaN, when neither resolves to non-negative integer.
     * NaN previously reached Dates.futureDateByMonth → "Invalid Date" PeriodEnd → empty chain, Penalty silently 0.
     * Caller treats null as fatal, warns.
     * @param {object} yamlData - Loaded .contract data.
     * @returns {number|null} Non-negative month count, or null when unresolvable.
     */
    static getPrepayMonth(yamlData) {
    console.info(`[Yamls.getPrepayMonth] 🟢 Starting...`);
        let prepay

        if (Files.isEmpty(yamlData.PrepayMonth)) {
            prepay = Yamls.getConfig('Contract.PrepayMonth')
            console.log(`prepayMonth from Yaml: ${prepay}`);
        }
        else {
            prepay = yamlData.PrepayMonth
            console.log(`prepayMonth from Main .Contract file: ${prepay}`);
        }

        const months = parseInt(prepay, 10);
        if (!Number.isInteger(months) || months < 0) {
            console.log(`prepayMonth is not a valid month count: ${prepay}`);
            return null;
        }

        return months;

    }

    static replaceYaml(ymlFile, yamlData, companyInfo) {
        console.info(`[Yamls.replaceYaml] 🟢 Starting...`);
        console.log(ymlFile, 'ymlFile');

        if (!yamlData || !companyInfo) {
            Dialogs.warningBox('yamlData or companyInfo is not defined!');
            return false;
        }

        console.log(yamlData, 'yamlData');
        console.log(companyInfo, 'companyInfo');

        /*
        Price is validated HERE, before the first marker file or yaml line is written.
        It is read much later as yamlData.Price.replaceAll(...), which throws on a missing or numeric Price — by then markers and yaml lines are already on disk, leaving the contract half-updated.
        */
        if (Files.isEmpty(yamlData.Price)) {
            Dialogs.warningBox(`Price is missing — fill it in the .contract yaml before filling this contract.`);
            return false;
        }

        Yamls.#resolveContractDate(yamlData, companyInfo);

        if (!Yamls.#resolveDates(yamlData)) return false;
        if (!Yamls.#resolveCompany(ymlFile, yamlData, companyInfo)) return false;

        Yamls.#writeChain(ymlFile, yamlData);
        return true;
    }

    /**
     * Auto-fill ContractDate when blank, in place — never overwrites a value already set.
     * Adolat MFY-registered street address (Latin or Cyrillic spelling) uses that company's real registration date (converted DD.MM.YYYY to YYYY-MM-DD); every other address falls back to today.
     * Runs BEFORE #resolveDates, since ContractDate is required there and #resolveCompany (which sets yamlData.ComAddress/ComRegDate) hasn't run yet — reads the raw companyInfo fields directly instead.
     * Address source is MySoliq's own streetName (companyInfo.soliq.company.streetName / companyInfo.soliqYatt.entrepreneurshipAddress.address), NOT Didox's address field — MySoliq's real Uzbek Cyrillic responses are where "Адолат МФЙ" actually shows up.
     * isYatt is read fresh from yamlData.ComType === 'YaTT' every call — never a cached companyInfo.isYatt, which can go stale on the fillYamlWithInfo cache path if ComType is corrected without a fresh API fetch.
     * @param {object} yamlData - Loaded .contract data, mutated in place.
     * @param {object} companyInfo - Resolved registry/Didox/MySoliq company record.
     */
    static #resolveContractDate(yamlData, companyInfo) {
        console.info(`[Yamls.#resolveContractDate] 🟢 Starting...`);

        if (!Files.isEmpty(yamlData.ContractDate)) return;

        const isYatt = yamlData.ComType === 'YaTT';

        const address = isYatt
            ? (companyInfo.soliqYatt?.entrepreneurshipAddress?.address ?? '')
            : (companyInfo.soliq?.company?.streetName ?? '');
        const isAdolatMFY = address.includes('Adolat MFY') || address.includes('Адолат МФЙ');
        console.log('address', address, 'isAdolatMFY', isAdolatMFY);

        if (isAdolatMFY) {
            const registrationDate = isYatt
                ? companyInfo.soliqYatt?.registrationDate
                : companyInfo.soliq?.company.registrationDate;

            yamlData.ContractDate = Dates.didoxToExcel(registrationDate);
            console.log('ContractDate from registrationDate (Adolat MFY)', yamlData.ContractDate);
        } else {
            yamlData.ContractDate = Dates.today();
            console.log('ContractDate from today', yamlData.ContractDate);
        }
    }

    /**
     * Resolve every date field on yamlData, in place.
     * Fills IjaraDateEnd/ContractDateEnd when blank, splits Day/Month/Year (+ End/Ijara twins), then derives PeriodStart/PeriodEnd.
     * Warns via Dialogs and returns false on the first unresolvable date, so the caller aborts before writing anything.
     * @param {object} yamlData - Loaded .contract data, mutated in place.
     * @returns {boolean} TRUE when every date resolved, FALSE when the caller must abort.
     */
    static #resolveDates(yamlData) {
        console.info(`[Yamls.#resolveDates] 🟢 Starting...`);

        /*
        Every contract date = bare-named YYYY-MM-DD key: ContractDate, ContractDateEnd, IjaraDateEnd, ActDateStart, ActDateEnd.
        All filled MANUALLY in ALL.contract.
        ContractDateEnd computed only when blank — ContractDate + Contract.AddDays.
        IjaraDateEnd falls back to config.yml Contract.IjaraDateEnd when blank.
        Day/Month/Year (+ End/Ijara twins) split off those values via Dates.splitExcelDate, never Word.extractDate (DD.MM.YYYY-only parser).
        */
        if (Files.isEmpty(yamlData.IjaraDateEnd)) {
            yamlData.IjaraDateEnd = Dates.didoxToExcel(Yamls.getConfig('Contract.IjaraDateEnd'));
            console.info('yamlData.IjaraDateEnd', yamlData.IjaraDateEnd);
        }

        if (Files.isEmpty(yamlData.ContractDateEnd)) {
            const addDays = Yamls.getConfig('Contract.AddDays');
            console.log(`addDays from Yaml: ${addDays}`);
            yamlData.ContractDateEnd = Dates.addDays(yamlData.ContractDate, addDays)
            console.info('yamlData.ContractDateEnd', yamlData.ContractDateEnd);
        }


        const comDate = Dates.splitExcelDate(yamlData.ContractDate);
        if (!comDate) {
            Dialogs.warningBox(`ContractDate is missing or invalid ("${yamlData.ContractDate}") — cannot fill Day/Month/Year. Fill it in the .contract yaml as YYYY-MM-DD.`);
            return false;
        }
        yamlData.Day = comDate.day;
        yamlData.Month = comDate.month;
        yamlData.Year = comDate.year;

        const comDateEnd = Dates.splitExcelDate(yamlData.ContractDateEnd);
        if (!comDateEnd) {
            Dialogs.warningBox(`ContractDateEnd is missing or invalid ("${yamlData.ContractDateEnd}") — cannot fill DayEnd/MonthEnd/YearEnd.`);
            return false;
        }
        yamlData.DayEnd = comDateEnd.day;
        yamlData.MonthEnd = comDateEnd.month;
        yamlData.YearEnd = comDateEnd.year;

        const comDateIjara = Dates.splitExcelDate(yamlData.IjaraDateEnd);
        if (!comDateIjara) {
            Dialogs.warningBox(`IjaraDateEnd is missing or invalid ("${yamlData.IjaraDateEnd}") — cannot fill DayIjara/MonthIjara/YearIjara. Check Contract.IjaraDateEnd in config.yml.`);
            return false;
        }
        yamlData.DayIjara = comDateIjara.day;
        yamlData.MonthIjara = comDateIjara.month;
        yamlData.YearIjara = comDateIjara.year;


        if (!yamlData.ActDateStart) {
            yamlData.PeriodStart = yamlData.ContractDate
            console.log('PeriodStart from ContractDate', yamlData.PeriodStart);
        }
        else {
            yamlData.PeriodStart = yamlData.ActDateStart
            console.log('PeriodStart from ActDateStart', yamlData.PeriodStart);
        }


        const prepayMonth = Yamls.getPrepayMonth(yamlData);
        console.log(prepayMonth, 'prepayMonth');
        yamlData.PrepayMon = prepayMonth ?? '';

        /*
        A null prepayMonth is fatal ONLY when PeriodEnd actually depends on it.
        With ActDateEnd filled, PeriodEnd comes straight off it and PrepayMonth is never read, so an unset PrepayMonth is legitimate there.
        */
        if (!yamlData.ActDateEnd && prepayMonth === null) {
            Dialogs.warningBox(`PrepayMonth is missing or not a whole month count — set it in the .contract yaml, or set Contract.PrepayMonth in config.yml, or fill ActDateEnd. Without it PeriodEnd cannot be computed and the whole Accrual/PenaltyDays/Penalty chain would silently read 0.`);
            return false;
        }

        if (!yamlData.ActDateEnd) {
            // futureDateByMonth(prepayMonth, false) returns the FIRST day of the target month — an EXCLUSIVE upper bound — so PeriodEnd is the last day of the month before it (e.g. today 2026-08-17, PrepayMonth=1 -> futureDateByMonth gives 2026-09-01 -> PeriodEnd = 2026-08-31).
            yamlData.PeriodEnd = Dates.getMinusOneDay(Dates.futureDateByMonth(prepayMonth, false))
            console.log('PeriodEnd from prepayMonth', yamlData.PeriodEnd);
        }
        else {
            // ActDateEnd is already a real, explicit end date (not an exclusive bound) — used as-is, no shift.
            yamlData.PeriodEnd = yamlData.ActDateEnd
            console.log('PeriodEnd from ActDateEnd', yamlData.PeriodEnd);
        }

        return true;
    }

    /**
     * Resolve every company/director/bank/VAT field on yamlData, in place, from companyInfo and the registry lookups.
     * Also derives ComCategory from the .contract file's own path and writes the Compan/ marker files.
     * isYatt is read fresh from yamlData.ComType === 'YaTT' every call — never a cached companyInfo.isYatt.
     * @param {string} ymlFile - Absolute path of the .contract file being filled.
     * @param {object} yamlData - Loaded .contract data, mutated in place.
     * @param {object} companyInfo - Resolved registry/Didox company record.
     * @returns {boolean} TRUE when resolution completed, FALSE when the caller must abort.
     */
    static #resolveCompany(ymlFile, yamlData, companyInfo) {
        console.info(`[Yamls.#resolveCompany] 🟢 Starting...`);

        const isYatt = yamlData.ComType === 'YaTT';


        // if ymlFileparh contains @ Weak folder - yamldata.ComCategory = Weak
        switch (true) {
            case ymlFile.includes("@ Weak"):
                yamlData.ComCategory = "Weak";
                break;

            case ymlFile.includes("@ Other"):
                yamlData.ComCategory = "Other";
                break;

            case ymlFile.includes("@ Bads"):
                yamlData.ComCategory = "Other";
                break;

            case ymlFile.includes("@ Dead"):
                yamlData.ComCategory = "Dead";
                break;

            default:
                yamlData.ComCategory = "ALL";
                break;
        }

        yamlData.ComINN = companyInfo.tin


        const price = String(yamlData.Price).replaceAll(',', '')

        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.ComINN}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.SurPINFL}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${price}`)

        yamlData.ComName = Word.cleanCompanyName(companyInfo.shortName)
        yamlData.IsYatt = isYatt

        yamlData.ComNameLong = companyInfo.name
        yamlData.ComNameShort = companyInfo.shortName


        if (!yamlData.ContractNumber)
            yamlData.ContractNum = Word.contractNumFromFormat(yamlData);
        else
            yamlData.ContractNum = yamlData.ContractNumber;

        Files.deleteInfo(globalThis.folderCompan, `RC-`)
        Files.saveInfoToFile(globalThis.folderCompan, yamlData.ContractNum)

        yamlData.ComAddress = companyInfo.address
        yamlData.ComAddressType = companyInfo.AddressType;

        Files.deleteInfo(globalThis.folderCompan, `${yamlData.ComAddressType}`)
        Files.saveInfoToFile(globalThis.folderCompan, yamlData.ComAddress);

        Files.deleteInfo(globalThis.folderCompan, `#Addr-`)
        Files.saveInfoToFile(globalThis.folderALL, `#Addr-${yamlData.ComAddressType}`);

        yamlData.ComOKED = companyInfo.oked
        if (!isYatt)
            yamlData.ComOKEDName = companyInfo?.soliq?.company?.okedDetail.name_uz_latn ?? ''
        else
            yamlData.ComOKEDName = companyInfo?.soliqYatt?.activityTypeName?.uz ?? ''

        yamlData.ComMFO = companyInfo.bankCode
        yamlData.ComRS = companyInfo.account
        yamlData.ComBankAccount = companyInfo.bankAccount

        yamlData.ComBankCode = companyInfo.bankCode
        const bank = Didox.bankByCode(companyInfo.bankCode);
        console.log(bank, 'bank');

        if (bank) {
            yamlData.ComBank = bank.name
        }

        yamlData.ComNs10Code = companyInfo.ns10Code
        const region = Didox.regionsByCode(companyInfo.ns10Code)
        console.log(region, 'region');

        if (!region) {
            console.warn(`Region not found for code: ${companyInfo.ns10Code}`)
            Dialogs.warningBox(`Region not found for code: ${companyInfo.ns10Code}`, yamlData.ComNameShort, 64)
        }

        yamlData.ComNs10Name = region.name;

        yamlData.ComNs11Code = companyInfo.ns11Code
        const district = Didox.districtsByCode(companyInfo.ns10Code, companyInfo.ns11Code);
        yamlData.ComNs11Name = district.name;

        yamlData.DirName = companyInfo.director
        Files.saveInfoToFile(globalThis.folderCompan, `Director  ${yamlData.DirName}`)

        if (!Files.isEmpty(yamlData.DirPINFL) && yamlData.DirPINFL !== companyInfo.directorPinfl) {
            Files.saveInfoToFile(globalThis.folderALL, `#CEO-Changed`)
            console.warn(`DirPINFL changed to: ${yamlData.DirPINFL}`)
            Dialogs.messageBox(`DirPINFL changed to: ${yamlData.DirPINFL}`, yamlData.ComNameShort);
        }

        yamlData.DirPINFL = companyInfo.directorPinfl
        yamlData.DirTIN = companyInfo.directorTin

        yamlData.AccName = companyInfo.accountant

        if (yamlData.SurEnable === true) {
            yamlData.SurName = companyInfo.surety?.fullName ?? ''
            yamlData.SurTIN = companyInfo.surety?.tin ?? ''
            yamlData.SurAddress = companyInfo.surety?.address ?? ''
            yamlData.SurNs10Code = companyInfo.surety?.ns10Code ?? ''
            yamlData.SurNs11Code = companyInfo.surety?.ns11Code ?? ''
            yamlData.SurPassport = `${yamlData.SurPassportSerial ?? ''} ${yamlData.SurPassportNumber ?? ''}`
        } else {
            yamlData.SurName = ''
            yamlData.SurTIN = ''
            yamlData.SurAddress = ''
            yamlData.SurNs10Code = ''
            yamlData.SurNs11Code = ''
            yamlData.SurPassport = ''
        }


        if (!Files.isEmpty(yamlData.RepPINFL) && yamlData.RepEnable === true) {
            yamlData.RepName = companyInfo.reps?.fullName ?? ''
            yamlData.RepTIN = companyInfo.reps?.tin ?? ''
            yamlData.RepAddress = companyInfo.reps?.address ?? ''
            yamlData.RepNs10Code = companyInfo.reps?.ns10Code ?? ''
            yamlData.RepNs11Code = companyInfo.reps?.ns11Code ?? ''
        } else {
            yamlData.RepName = ''
            yamlData.RepTIN = ''
            yamlData.RepAddress = ''
            yamlData.RepNs10Code = ''
            yamlData.RepNs11Code = ''
        }

        yamlData.ComNa1Code = companyInfo.na1Code
        yamlData.ComNa1Name = companyInfo.na1Name
        if (!isYatt)
            yamlData.ComNa1NameLat = companyInfo.soliq?.company.businessStructureDetail.name_uz_latn ?? ''
        else
            yamlData.ComNa1NameLat = companyInfo?.soliqYatt?.formName?.uz ?? ''

        if (!Files.isEmpty(yamlData.ComNa1NameLat)) {
            yamlData.ComNa1NameShort = yamlData.ComNa1NameLat.split(' ').map(word => word.charAt(0)).join('')
                .toUpperCase()
        }

        yamlData.ComStatusCode = companyInfo.statusCode
        yamlData.ComStatusName = companyInfo.statusName

        if (!isYatt) {
            yamlData.ComStatusNameLat = companyInfo.soliq?.company.statusDetail.name_uz_latn ?? ''
            yamlData.ComStatusGroup = companyInfo.soliq?.company.statusDetail.group ?? ''

            yamlData.ComStatusType = companyInfo.soliq?.company.statusType ?? ''
            yamlData.ComIsScammer = companyInfo.soliq?.IsScammer ?? ''

        }
        else {
            yamlData.ComStatusNameLat = companyInfo?.soliqYatt?.status?.name?.uz ?? ''

        }



        yamlData.ComPersonalNum = companyInfo.personalNum

        yamlData.ComIsItd = companyInfo.isItd
        if (isYatt) {
            if (companyInfo.isItd === true)
                Files.saveInfoToFile(globalThis.folderALL, '#YaTT-Active');
            else
                Files.saveInfoToFile(globalThis.folderALL, '#YaTT-Inactive');
        }

        yamlData.ComIsBudget = companyInfo.isBudget
        if (companyInfo.isBudget === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-Budget');

        yamlData.ComSelfEmployment = companyInfo.selfEmployment
        if (companyInfo.selfEmployment === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-SelfEmployment');

        yamlData.ComPrivateNotary = companyInfo.privateNotary
        if (companyInfo.privateNotary === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-PrivateNotary');

        yamlData.ComPeasantFarm = companyInfo.peasantFarm
        if (companyInfo.peasantFarm === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-PeasantFarm');


        if (!isYatt) {
            yamlData.ComOpf = companyInfo.soliq?.company.opf ?? ''
            yamlData.ComKfs = companyInfo.soliq?.company.kfs ?? ''
            yamlData.ComSoato = companyInfo.soliq?.company.soato ?? ''
            yamlData.ComSoogu = companyInfo.soliq?.company.soogu ?? ''
            yamlData.ComSooguRegistrator = companyInfo.soliq?.company.sooguRegistrator ?? ''

            yamlData.ComRegDate = companyInfo.soliq?.company.registrationDate ?? ''
            yamlData.ComRegNumber = companyInfo.soliq?.company.registrationNumber ?? ''

            yamlData.ComReRegDate = companyInfo.soliq?.company.reregistrationDate ?? ''

            yamlData.ComLiquidationDate = companyInfo.soliq?.company.liquidationDate ?? ''
            yamlData.ComLiquidationReason = companyInfo.soliq?.company.liquidationReason ?? ''

            yamlData.ComTaxMode = companyInfo.soliq?.company.taxMode ?? ''
            yamlData.ComTaxpayerType = companyInfo.soliq?.company.taxpayerType ?? ''
            yamlData.ComBusinessType = companyInfo.soliq?.company.businessType ?? ''

            // replace number with comma
            let fund = Number(companyInfo.soliq?.company.businessFund ?? 0)
            yamlData.ComBusinessFund = fund.toLocaleString("en-US")

            yamlData.ComSectorCode = companyInfo.soliq?.companyBillingAddress.sectorCode ?? ''
            yamlData.ComVillageCode = companyInfo.soliq?.company.villageCode ?? ''
            yamlData.ComVillageName = companyInfo.soliq?.company.villageName ?? ''

        }
        else {
            yamlData.ComRegDate = companyInfo.soliqYatt?.registrationDate ?? ''
            yamlData.ComRegNumber = companyInfo.soliqYatt?.registrationId ?? ''

            yamlData.ComLiquidationDate = companyInfo.soliqYatt?.liquidationDate ?? ''

            yamlData.ComTaxMode = companyInfo.soliqYatt?.taxMode ?? ''

            yamlData.ComSectorCode = companyInfo.soliqYatt?.entrepreneurshipAddress?.soatoCode ?? ''

        }



        // ###########################

        yamlData.ComVATRegCode = companyInfo.VATRegCode
        yamlData.ComVATRegStatus = companyInfo.VATRegStatus

        if (!isYatt) {
            yamlData.ComVATCompanyName = companyInfo.vat?.companyName ?? ''
            yamlData.ComVATDirectorName = companyInfo.vat?.directorFioLatn ?? ''

            yamlData.ComVATAddress = companyInfo.vat?.address ?? ''
            yamlData.ComVATDateReg = companyInfo.vat?.dateReg ?? ''
            yamlData.ComVATDateFrom = companyInfo.vat?.dateFrom ?? ''

            yamlData.ComVATStateId = companyInfo.vat?.stateId ?? ''
            yamlData.ComVATStateNameLat = companyInfo?.vat?.stateNameLat ?? '';

            yamlData.ComVATPkey = companyInfo?.vat?.pkey ?? '';
            yamlData.ComVATDateSys = companyInfo?.vat?.dateSys ?? '';

            yamlData.ComVATUpdatedAt = companyInfo?.vat?.updatedAt ?? '';
            yamlData.ComVATStatementId = companyInfo?.vat?.statementId ?? '';

        } else {

            yamlData.ComVATAddress = companyInfo.soliqYatt?.entrepreneurshipAddress?.address ?? ''
            yamlData.ComVATDateReg = companyInfo.soliqYatt?.vatRegDate ?? ''

            yamlData.ComVATStateId = companyInfo.soliqYatt?.vatStatusId ?? ''
            yamlData.ComVATStateNameLat = companyInfo?.soliqYatt?.vatStatusName ?? '';

            yamlData.ComVATUpdatedAt = companyInfo?.soliqYatt?.vatRegDate ?? '';
            yamlData.ComVATStatementId = companyInfo?.soliqYatt?.certificateDocNumber ?? '';
        }


        Files.deleteInfo(globalThis.folderALL, '#VAT')

        /*
        ContractDate is YYYY-MM-DD (parseDMYExcel); ComVATDateReg still arrives DD.MM.YYYY from the registry API (parseDMY).
        Both are validity-checked before comparing, because either parser yields an Invalid Date for blank/malformed input, and EVERY comparison against an Invalid Date is false.
        An unchecked compare therefore fell through to the else branch and asserted 'Нет' — a real answer invented from unparseable input, not a derived one.
        Unknown stays unknown instead: blank ComVATFromUs, no #VAT-From-Us marker.
        */
        const ContractDate = Dates.parseDMYExcel(yamlData.ContractDate);
        const ComVATDateReg = Dates.parseDMY(yamlData.ComVATDateReg);
        const comDateOk = ContractDate instanceof Date && !Number.isNaN(ContractDate.getTime());
        const vatDateOk = ComVATDateReg instanceof Date && !Number.isNaN(ComVATDateReg.getTime());

        // if ContractDate is greater than ComVATDateReg
        if (companyInfo.VATRegCode) {
            if (!comDateOk || !vatDateOk) {
                console.log('ComVATFromUs left blank — unparseable date', yamlData.ContractDate, yamlData.ComVATDateReg);
                yamlData.ComVATFromUs = ''
                Files.deleteInfo(globalThis.folderALL, '#VAT-From-Us')
            } else if (ContractDate < ComVATDateReg) {
                yamlData.ComVATFromUs = 'Да'
                Files.saveInfoToFile(globalThis.folderALL, '#VAT-From-Us')
            } else {
                yamlData.ComVATFromUs = 'Нет'
                Files.deleteInfo(globalThis.folderALL, '#VAT-From-Us')
            }
        } else {
            yamlData.ComVATFromUs = ''
        }

        yamlData.ComTaxModeVAT = yamlData.ComTaxMode === 1 ? 'Yes' : 'No'


        if (yamlData.ComTaxModeVAT === 'Yes' && Files.isEmpty(yamlData.ComVATRegCode)) {
            yamlData.ComCandidateVAT = 'Yes'
            Files.saveInfoToFile(globalThis.folderALL, '#VAT-Candidate')
        } else {
            yamlData.ComCandidateVAT = 'No'
            Files.deleteInfo(globalThis.folderALL, '#VAT-Candidate')
        }

        if (yamlData.ComTaxModeVAT === 'Yes') {
            Files.saveInfoToFile(globalThis.folderALL, '#VAT-Mode')
        }



        return true;
    }

    /**
     * Persist yamlData to the .contract file, then (re)write the whole money chain.
     * Writes every scalar key via replaceTextLine, then Accrual/Payment/Faktura/Loaners/PenaltyDays/Penalty/Returns and every Excel.CellNames block.
     * @param {string} ymlFile - Absolute path of the .contract file being written.
     * @param {object} yamlData - Fully resolved .contract data.
     * @returns {void}
     */
    static #writeChain(ymlFile, yamlData) {
        console.info(`[Yamls.#writeChain] 🟢 Starting...`);

        /* Iterate yamlData and write each SCALAR value via replaceTextLine. Array-valued keys (Accrual, History, Account, and the rest of the chain) are skipped here — each has its own dedicated writeYamlArraySection-based writer below (or, for a key like Account with no writer at all, is left exactly as loaded), never the generic key + ': ' + value scalar line, which stringifies an array into a broken "[object Object],[object Object]" that js-yaml can't re-parse. */
        for (const [key, value] of Object.entries(yamlData)) {
            if (Array.isArray(value)) continue;
            this.replaceTextLine(ymlFile, key, value);
        }

        /*
         * PrepayMon: the actual resolved PrepayMonth value the code uses — yamlData.PrepayMonth when set, else config.yml's Contract.PrepayMonth (see #resolveDates/getPrepayMonth).
         * Insert-if-missing, since a fresh .contract template doesn't carry this output field yet — the generic replaceTextLine loop above only updates an EXISTING line.
         */
        Yamls.writeScalarSection(ymlFile, 'PrepayMon', yamlData.PrepayMon, 'ContractDateEnd');

        /*
         * PeriodEndApp is retired — PeriodEnd itself now carries what PeriodEndApp used to compute (see #resolveDates).
         * Strip any stale PeriodEndApp: line still sitting in an older real file.
         * The generic loop above never writes it since #resolveDates no longer sets yamlData.PeriodEndApp.
         */
        Yamls.deleteScalarLine(ymlFile, 'PeriodEndApp');

        // Always record Accrual/Payment/Faktura/Loaners/PenaltyDays/Penalty/
        // Returns per calendar month across the contract's active period
        // (PeriodStart..PeriodEnd, both YYYY-MM-DD) — runs every time the
        // .contract is filled/updated, not only when an Excel report is
        // generated separately.
        //
        // Accrual starts every month at yamlData.Price (the on-time rate);
        // recomputeChain then re-prices any month with real-payment
        // shortfall at yamlData.PriceMax (from conf/cost/<Tariff>.yaml, NOT
        // written into the .contract yaml itself — only its EFFECT, the
        // re-priced Accrual figure, is persisted) and re-chains the real cash
        // payments (Bank-OT + Trans-OT + Card-OT + BaaR-OT, scanned fresh
        // from folderALL — not from yamlData, since a freshly-filled
        // contract has no in-memory payment history yet) across the
        // resulting periods to a fixed point, producing Loaners in lockstep
        // with Accrual — this internal chain drives Loaners/PriceMax
        // re-pricing ONLY; the Payment: key actually WRITTEN to the yaml is
        // a separate, flat date-keyed merge (see below), not this chain's
        // own per-period allocation.
        const bankOT = Yamls.scanCellFolder(globalThis.folderALL, 'Bank-OT');
        const transOT = Yamls.scanCellFolder(globalThis.folderALL, 'Trans-OT');
        const cardOT = Yamls.scanCellFolder(globalThis.folderALL, 'Card-OT');
        const baarOT = Yamls.scanCellFolder(globalThis.folderALL, 'BaaR-OT');
        const payments = [...bankOT, ...transOT, ...cardOT, ...baarOT];

        const { accrual, loaners } = Yamls.recomputeChain(
            yamlData.PeriodStart, yamlData.PeriodEnd, yamlData.Price, yamlData.PriceMax, payments
        );
        Yamls.writeAccrual(ymlFile, accrual);

        // Payment: WRITTEN form — flat date-keyed merge of Bank-OT + Card-OT
        // + BaaR-OT + Trans-OT (same-date entries from different sources
        // summed together), e.g. { '2026-04-21': '1,600,000' }. Distinct
        // from `payments` above (which feeds the internal debt chain).
        const paymentFlat = Yamls.mergeDateKeyedArrays(bankOT, cardOT, baarOT, transOT);

        // Returns: flat date-keyed merge of Bank-IN + Card-IN + BaaR-IN
        // (money refunded BACK to the tenant) — same shape/merge rule as
        // Payment:, Trans-IN intentionally excluded. Computed here (ahead of
        // its own written position after Penalty:) so History: below can
        // merge it together with Payment: — the written position of
        // Returns: itself is unaffected, only this computation moved
        // earlier.
        const bankIN = Yamls.scanCellFolder(globalThis.folderALL, 'Bank-IN');
        const cardIN = Yamls.scanCellFolder(globalThis.folderALL, 'Card-IN');
        const baarIN = Yamls.scanCellFolder(globalThis.folderALL, 'BaaR-IN');
        const returnsFlat = Yamls.mergeDateKeyedArrays(bankIN, cardIN, baarIN);

        // History: merges Payment: (as-is) and Returns: (negated) into one
        // flat date-keyed array — sits directly after Accrual:, before
        // Payment: (see writePayment's own anchor).
        const history = Yamls.computeHistory(paymentFlat, returnsFlat);
        Yamls.writeHistory(ymlFile, history);

        Yamls.writePayment(ymlFile, paymentFlat);

        // Faktura: the real EHF-IN invoice sum (scanned fresh from
        // folderALL, same as Bank-OT/Trans-OT/Card-OT/BaaR-OT above),
        // distributed across the FINAL, already-recomputeChain-settled
        // Accrual periods — once the whole EHF-IN sum is distributed, every
        // remaining period gets 0. Must run AFTER recomputeChain, against
        // its returned `accrual` (the fixed-point one, already re-priced at
        // PriceMax on any debt month), never the pre-recompute baseline.
        // Written directly after Payment:, before Loaners:/PenaltyDays:/
        // Penalty:.
        const ehfIn = Yamls.scanCellFolder(globalThis.folderALL, 'EHF-IN');
        const faktura = Yamls.computeFaktura(accrual, ehfIn);
        Yamls.writeFaktura(ymlFile, faktura);

        // FakturaSend: per-period amount not yet invoiced (Accrual minus
        // that period's own Faktura) — sits directly after Faktura:, same
        // end-date key.
        const fakturaSend = Yamls.computeFakturaSend(accrual, ehfIn);
        Yamls.writeFakturaSend(ymlFile, fakturaSend);

        /*
         * PriceMon: tariff's flat full-month rent per calendar month (Price, or PriceMax if Loaners > 0), never prorated.
         * PriceMaxMon: same flat full-month shape, but ALWAYS PriceMax regardless of debt — no Price-vs-PriceMax switch.
         * PriceDay/PriceMaxDay: each month's own Mon amount / its real day count, rounded to nearest whole so'm.
         * All four keyed bare "YYYY-MM", written directly after Penalty:, before Bonuses:, in this exact chained order: PriceMon -> PriceMaxMon -> PriceDay -> PriceMaxDay.
         */
        const priceMon = Yamls.buildPriceMonEntries(accrual, loaners, yamlData.Price, yamlData.PriceMax);
        Yamls.writePriceMon(ymlFile, priceMon);

        const priceMaxMon = Yamls.buildPriceMaxMonEntries(accrual, yamlData.PriceMax);
        Yamls.writePriceMaxMon(ymlFile, priceMaxMon);

        const priceDay = Yamls.buildPriceDayEntries(priceMon);
        Yamls.writePriceDay(ymlFile, priceDay);

        const priceMaxDay = Yamls.buildPriceDayEntries(priceMaxMon);
        Yamls.writePriceMaxDay(ymlFile, priceMaxDay);

        /*
         * Account: client's own running balance, one entry per calendar day from PeriodStart through PeriodEnd.
         * Every day debits off the previous day's balance, then adds that day's own History entry.
         * Debit rate: PriceDay (the prepay discount) when the previous day's balance was >= 0, PriceMaxDay (the full rate, no discount) when it was already negative.
         * Written directly after History:, before Loaners:.
         */
        const account = Yamls.buildAccountEntries(yamlData.PeriodStart, yamlData.PeriodEnd, history, priceDay, priceMaxDay);
        Yamls.writeAccount(ymlFile, account);

        /*
         * Loaners: the client's own outstanding debt (or surplus, if positive) at PeriodEnd — a plain scalar, the ABSOLUTE value of Account's own LAST entry.
         * No longer an array — Account itself now carries the full daily detail.
         */
        const lastAccountEntry = account.length ? Object.values(account[account.length - 1])[0] : '0';
        const loanersTotal = Math.abs(Number(String(lastAccountEntry).replace(/,/g, '')) || 0).toLocaleString('en-US');
        Yamls.writeLoaners(ymlFile, loanersTotal);

        /*
         * Penalty (§21.1 + §3.7/§1.20): every consecutive day (beyond the first, which is the 1-calendar-day grace period) Account's own balance stays negative counts as a penalty day, grouped by bare "YYYY-MM".
         * Penalty[month] = PenaltyDays[month] * PenaltyForDay, capped at HALF that month's own PriceMaxMon amount.
         * PenaltyForDay is yamlData.PenaltyPerDay (the per-contract override, blank by default like ContractNumber) when non-empty, else config.yml's global Penalty.PerDay.
         */
        const penaltyDays = Yamls.computePenaltyDays(account);
        Yamls.writePenaltyDays(ymlFile, penaltyDays);

        const penaltyForDay = Files.isEmpty(yamlData.PenaltyPerDay)
            ? Yamls.getConfig('Penalty.PerDay', 'number', 50000)
            : Number(String(yamlData.PenaltyPerDay).replace(/,/g, ''));
        const penalty = Yamls.computePenalty(penaltyDays, penaltyForDay, priceMaxMon);
        Yamls.writePenalty(ymlFile, penalty);

        Yamls.writeReturns(ymlFile, returnsFlat);

        // Every Excel.CellNames key (Bank-OT, Bank-IN, EHF-IN, Trans-OT,
        // BaaR-OT, BaaR-IN, Card-OT, Card-IN, Bonuses) — same folder-scan data
        // Excels.generate used to write only into the Excel report — is now
        // ALSO written straight into the .contract yaml on every fill, so the
        // yaml itself carries the real transaction history, not just Excel.
        Yamls.writeCellArrays(ymlFile, globalThis.folderALL);

    }

    static mergeYamlsInFolder(folderPath) {
        console.info(`[Yamls.mergeYamlsInFolder] 🟢 Starting...`);
        if (!fs.existsSync(folderPath)) {
            console.warn(`Folder not found: ${folderPath}`);
            return;
        }

        const appFolder = path.join(folderPath, 'App');
        if (!fs.existsSync(appFolder)) {
            fs.mkdirSync(appFolder, { recursive: true });
        }

        const yamlFiles = Files.findRecursiveFull(
            folderPath,
            (name) => {
                const ext = path.extname(name).toLowerCase();
                return ext === '.yaml' || ext === '.yml';
            },
            (name, fullPath) => {
                const lowerName = name.toLowerCase();
                // We use path.resolve to compare paths accurately, or just check string equality on fullPath
                if (path.resolve(fullPath) === path.resolve(appFolder)) return true;

                if (
                    lowerName === '- theory' ||
                    lowerName === 'all' ||
                    lowerName === 'app' ||
                    lowerName === 'add'
                ) return true;
                if (name.startsWith('@') || name.startsWith('_')) return true;
                return false;
            }
        );

        if (yamlFiles.length === 0) {
            console.warn('No YAML/YML files found to merge.');
            return;
        }

        let mergedData = null;

        for (const file of yamlFiles) {
            try {
                const data = Yamls.loadAndParseYaml(file);

                if (data === undefined || data === null) continue;

                if (mergedData === null) {
                    mergedData = Array.isArray(data) ? [] : {};
                }

                const isDataArray = Array.isArray(data);
                const isMergedArray = Array.isArray(mergedData);

                switch (true) {
                    case isDataArray && isMergedArray:
                        mergedData = mergedData.concat(data);
                        break;
                    case !isDataArray && !isMergedArray && typeof data === 'object':
                        for (const [key, value] of Object.entries(data)) {
                            if (key in mergedData) {
                                console.warn(`⏭️ Skipped duplicate key "${key}" from file: ${file}`);
                                continue; // Skip all next values, do not stop action
                            }
                            mergedData[key] = value;
                        }
                        break;
                    default:
                        console.warn(`Type mismatch or unsupported data in ${file}.`);
                        break;
                }
            } catch (err) {
                console.error(`Error parsing ${file}: ${err.message}`);
                Dialogs.warningBox(`Error parsing ${file}:\n${err.message}`, "YAML Parse Error");
                return; // Stop on parse errors too
            }
        }

        if (mergedData) {
            const dumpStr = Yamls.#stripUnnecessaryQuotes(
                yaml.dump(mergedData, { lineWidth: -1, schema: yaml.JSON_SCHEMA })
            );
            const baseFolder = path.basename(path.resolve(folderPath));
            const outPath = path.join(appFolder, `${baseFolder}.yml`);
            const finalOutPath = Files.incrementFileName(outPath);
            fs.writeFileSync(finalOutPath, dumpStr, 'utf8');
            console.log(`✅ Merged ${yamlFiles.length} files into ${finalOutPath}`);
        } else {
            console.log(`No valid YAML data found to merge.`);
        }
    }

    /**
     * Write a value at a nested dot-path into config.yml.
     * e.g. setConfig('ChoosedChars.Word', 'ABCabc')
     * Preserves all other keys in the file.
     *
     * @param {string} keyPath - Dot-notated key path, e.g. 'ChoosedChars.Word'
     * @param {*} value - Value to set
     */
    static setConfig(keyPath, value) {
    console.info(`[Yamls.setConfig] 🟢 Starting...`);
        const configPath = Files.currentDir() + '\\config.yml';
        if (!fs.existsSync(configPath)) {
            throw new Error(`Config file not found: ${configPath}`);
        }

        const doc = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) ?? {};

        // dot-prop sets the nested dot-path, auto-creating intermediate objects.
        setProperty(doc, keyPath, value);

        const dumpStr = Yamls.#stripUnnecessaryQuotes(
            yaml.dump(doc, { lineWidth: -1, quotingType: '"', schema: yaml.JSON_SCHEMA })
        );
        fs.writeFileSync(configPath, dumpStr, 'utf8');
        console.log(`✅ setConfig: ${keyPath} = ${value}`);
    }

}
