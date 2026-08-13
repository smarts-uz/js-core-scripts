import fs from "fs";
import { existsSync } from "fs";

import yaml from "js-yaml";
import path from "path";
import { getProperty, setProperty } from "dot-prop";
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

        const doc = yaml.load(fs.readFileSync(filePath, "utf8"));

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

    // Generic writer for a single top-level "Key:" array block in a .contract
    // yaml — inserts/replaces it directly after the line matching `afterKey`
    // (e.g. "ActDateEnd" or "Accrual"), stripping any of `legacyKeys` (old
    // names this key used to have) so a re-run never duplicates it and an
    // old-format file converges to the current key/shape. An empty `entries`
    // array is still written as "Key: []" when allowEmpty is true (the
    // default) — the caller decides whether "no data yet" should still leave
    // the key present (empty) or be skipped entirely.
    //
    // Blank-line convention: exactly ONE blank line always separates every
    // top-level block from its neighbors (never zero, never two+) — this is
    // enforced on every write, both around the inserted/replaced block and
    // for any pre-existing consecutive-blank-line runs elsewhere in the file
    // (collapsed to one), so repeated calls (writeAccrual, writePayment,
    // writeFaktura, writeLoaners, writePenalty, writeCellArrays' own N keys,
    // all chained on top of each other in one replaceYaml run) never
    // accumulate stray blank lines or squash the separators away entirely.
    static writeYamlArraySection(filePath, key, entries, afterKey, legacyKeys = [], allowEmpty = true) {
        console.info(`[Yamls.writeYamlArraySection] 🟢 Starting... key=${key}`);

        if (!Array.isArray(entries)) entries = [];
        if (entries.length === 0 && !allowEmpty) {
            console.warn(`writeYamlArraySection: ${key} is empty and allowEmpty=false, nothing to write for ${filePath}.`);
            return;
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        const block = yaml.dump({ [key]: entries }, { lineWidth: -1 }).trimEnd().split('\n');

        const keysToStrip = [key, ...legacyKeys].map(k => new RegExp(`^${k}:`));
        const stripped = [];
        let skipping = false;
        for (const line of lines) {
            if (keysToStrip.some(re => re.test(line))) {
                skipping = true;
                continue;
            }
            if (skipping) {
                if (/^\s/.test(line)) continue; // still inside the old block
                skipping = false; // first non-indented line ends the block
            }
            stripped.push(line);
        }

        const afterIdx = stripped.findIndex(line => new RegExp(`^${afterKey}:`).test(line));

        if (afterIdx === -1) {
            console.warn(`writeYamlArraySection: "${afterKey}:" line not found in ${filePath}; appending ${key} at end of file.`);
            if (stripped.length > 0 && stripped[stripped.length - 1] !== '') stripped.push('');
            stripped.push(...block);
        } else {
            // Insert after the WHOLE afterKey block, not just its own key
            // line — skip past every indented child line (its array items)
            // first, so a chained insertion (Bank-OT after Accrual, Bonuses
            // after Bank-OT, ...) lands after each key's own data, never
            // splitting a block apart. Any blank line(s) immediately
            // following the afterKey block belong to the SEPARATOR after our
            // own newly-inserted block, not before it — so they are skipped
            // here too (consumed below) rather than left sitting between
            // afterKey and the new block.
            let insertIdx = afterIdx + 1;
            while (insertIdx < stripped.length && /^\s/.test(stripped[insertIdx]) && stripped[insertIdx] !== '') {
                insertIdx++;
            }
            let afterBlankRun = insertIdx;
            while (afterBlankRun < stripped.length && stripped[afterBlankRun] === '') {
                afterBlankRun++;
            }

            const toInsert = ['', ...block];
            // Only add a trailing separator blank line when something follows
            // (avoid a dangling blank line at end-of-file).
            if (afterBlankRun < stripped.length) toInsert.push('');

            stripped.splice(insertIdx, afterBlankRun - insertIdx, ...toInsert);
        }

        // Collapse any run of 2+ consecutive blank lines anywhere in the file
        // down to exactly one — repairs stray accumulation left over from
        // earlier buggy writes, and keeps every future write from drifting.
        const normalized = [];
        for (const line of stripped) {
            if (line === '' && normalized.length > 0 && normalized[normalized.length - 1] === '') continue;
            normalized.push(line);
        }

        fs.writeFileSync(filePath, normalized.join('\n'));

        console.log(`File ${filePath} has been updated with ${key}.`, entries);
    }

    // Builds the Accrual: entries for every calendar month across the
    // contract's active period (StartDate..FutureDate, both YYYY-MM-DD) —
    // one "start#end": amount date-interval mapping per month, amount at the
    // tariff's normal Price for a month paid on time. A month is re-priced at
    // PriceMax by Yamls.applyPriceMaxToDebtMonths below, once the real
    // payment chain (Loaners) for that month is known — this function alone
    // only produces the Price-rate baseline.
    //
    // The first period is prorated by real day count within its own calendar
    // month, then rounded UP to the nearest 1,000 (never left fractional,
    // never plain-rounded) — e.g. a 23-of-31-day first month at 390,000/mo
    // is ceil(23/31*390000/1000)*1000 = 290,000.
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
                : Math.ceil((daysInPeriod / daysInMonth) * priceNum / 1000) * 1000;

            return { [`${start}#${end}`]: amount.toLocaleString('en-US') };
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
            const [intervalKey, amount] = Object.entries(entry)[0];
            const debt = Number(String(loanersByKey.get(intervalKey) ?? '0').replace(/,/g, '')) || 0;
            if (debt <= 0) return { [intervalKey]: amount };

            const [start, end] = intervalKey.split('#');
            const daysInPeriod = Dates.daysBetween(start, end) + 1;
            const daysInMonth = Dates.daysInMonth(start);
            const isFullMonth = daysInPeriod === daysInMonth;

            const newAmount = isFullMonth
                ? priceMaxNum
                : Math.ceil((daysInPeriod / daysInMonth) * priceMaxNum / 1000) * 1000;

            return { [intervalKey]: newAmount.toLocaleString('en-US') };
        });
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

    // Distributes the real EHF-IN invoice amounts across the FINAL (already
    // recomputeChain-settled) Accrual periods, same "start#end" shape as
    // Payment — chains the total invoiced sum across accrual's periods in
    // order via computePaymentChain, keeping only its `payment` half (a
    // month's own Loaners-vs-invoice split has no meaning here, EHF-IN is a
    // document, not cash). Once the whole EHF-IN sum is exhausted, every
    // remaining period gets 0 — computePaymentChain already produces exactly
    // that once its running `remaining` pool hits zero.
    //
    // Returns [{ "monthStart#monthEnd": amount }, ..., { ALL: sum }], same
    // order/shape as Payment/Loaners (accrual's own trailing { ALL } entry is
    // skipped — computePaymentChain expects bare period entries).
    static computeFaktura(accrual, ehfIn) {
        console.info(`[Yamls.computeFaktura] 🟢 Starting...`);

        const periods = accrual.filter(e => !('ALL' in e));
        const { payment: faktura } = Yamls.computePaymentChain(periods, ehfIn);

        const sum = faktura.reduce((s, e) => s + (Number(String(Object.values(e)[0]).replace(/,/g, '')) || 0), 0);
        const result = [...faktura, { ALL: sum.toLocaleString('en-US') }];

        console.log(`computeFaktura: sum=${sum}`, result);
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
        // FutureDate collapsing to dayjs's literal "Invalid Date" string) —
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

    // Contract §21.1 — a fixed PerDay penalty for each calendar day the
    // client's running balance stays negative BEYOND the 1-calendar-day
    // grace period (§3.7/§1.20: first/each prepayment due within 1 day) —
    // the first day a deficit appears is grace, never itself a penalty day;
    // every CONSECUTIVE day after that the balance is still negative counts.
    // A day where balance recovers to >= 0 resets the grace window — a LATER
    // deficit starts its own fresh 1-day grace period.
    //
    // Returns [{ "monthStart#monthEnd": penaltyDayCount }, ..., { ALL: sum }]
    // — one entry per Accrual period (same order/shape as Payment/Loaners).
    static computePenaltyDays(accrual, ledger) {
        console.info(`[Yamls.computePenaltyDays] 🟢 Starting...`);

        const periods = accrual.filter(e => !('ALL' in e)).map(e => {
            const [intervalKey] = Object.entries(e)[0];
            const [start, end] = intervalKey.split('#');
            return { intervalKey, start, end };
        });

        let deficitStreak = 0;
        const penaltyDaysByDate = new Map();
        for (const { date, balance } of ledger) {
            if (balance < 0) {
                deficitStreak++;
                // First day of a NEW deficit streak is the 1-day grace
                // period — only the 2nd+ consecutive negative day counts.
                if (deficitStreak > 1) penaltyDaysByDate.set(date, true);
            } else {
                deficitStreak = 0;
            }
        }

        const result = periods.map(({ intervalKey, start, end }) => {
            let count = 0;
            for (const date of penaltyDaysByDate.keys()) {
                if (date >= start && date <= end) count++;
            }
            return { [intervalKey]: count };
        });

        const total = result.reduce((s, e) => s + Object.values(e)[0], 0);
        const withTotal = [...result, { ALL: total }];

        console.log(`computePenaltyDays: total=${total}`, withTotal);
        return withTotal;
    }

    // Penalty[month] = PenaltyDays[month] * PenaltyForDay (contract §21.1's
    // fixed per-calendar-day rate, config.yml's Penalty.PerDay, default
    // 50,000) — no cap, no CapRatio; every late day costs the same fixed
    // amount, straight multiplication.
    //
    // Returns [{ "monthStart#monthEnd": penaltyAmount }, ..., { ALL: sum }],
    // same order/shape as PenaltyDays.
    static computePenalty(penaltyDays, penaltyForDay) {
        console.info(`[Yamls.computePenalty] 🟢 Starting... penaltyForDay=${penaltyForDay}`);

        const rate = Number(String(penaltyForDay).replace(/,/g, '')) || 0;
        let total = 0;

        const result = penaltyDays.filter(e => !('ALL' in e)).map(entry => {
            const [intervalKey, days] = Object.entries(entry)[0];
            const amount = days * rate;
            total += amount;
            return { [intervalKey]: amount.toLocaleString('en-US') };
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

    // Writes/replaces the Returns: array block directly after Penalty: —
    // a flat, date-keyed merge of Bank-IN + Card-IN + BaaR-IN (money
    // returned BACK to the tenant), same-date entries summed. NOT chained
    // against Accrual — plain merge, same shape as a raw
    // scanCellFolder/Excel.CellNames array.
    //   Returns:
    //     - '2026-04-21': '1,600,000'
    static writeReturns(filePath, returns) {
        console.info(`[Yamls.writeReturns] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Returns', returns, 'Penalty', [], true);
    }

    // Writes/replaces the Accrual: array block directly after the
    // ComBase: line in the .contract yaml — ComBase is the last static field
    // before the chain in the confirmed-correct real file layout (ActDateEnd
    // -> ComDateEnd -> ComBase -> Accrual -> ... -> PenaltyON -> Penalty ->
    // Excel.CellNames keys), NOT ActDateEnd: itself — ComDateEnd/ComBase
    // already sit between ActDateEnd and where the chain belongs, and
    // anchoring on ActDateEnd would insert Accrual BEFORE them, corrupting
    // the field order every time replaceYaml runs against a fresh file.
    //   Accrual:
    //     - 2026-03-01#2026-03-31: 450,000
    //     - 2026-04-01#2026-04-30: 450,000
    //     - ALL: 900,000
    static writeAccrual(filePath, accrual) {
        console.info(`[Yamls.writeAccrual] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Accrual', accrual, 'ComBase', ['Pricings', 'PriceHistory'], false);
    }

    // Writes/replaces the Payment: array block directly after Accrual: — a
    // flat, date-keyed merge of Bank-OT + Card-OT + BaaR-OT + Trans-OT
    // (money received FROM the tenant), same-date entries summed. NOT
    // chained/allocated against Accrual periods — plain merge, same shape as
    // Returns/a raw scanCellFolder array. (Loaners/Penalty no longer read
    // this written form — they're derived from the daily-balance ledger via
    // computeDailyBalance/computePenaltyDays instead; see replaceYaml.)
    //   Payment:
    //     - '2026-04-21': '1,600,000'
    static writePayment(filePath, payment) {
        console.info(`[Yamls.writePayment] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Payment', payment, 'Accrual', [], true);
    }

    // Writes/replaces the Loaners: array block directly after Faktura: —
    // per-period outstanding debt (the mirror of Payment).
    //   Loaners:
    //     - 2026-03-01#2026-03-31: 0
    //     - 2026-04-01#2026-04-30: 450,000
    //     - ALL: 450,000
    static writeLoaners(filePath, loaners) {
        console.info(`[Yamls.writeLoaners] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Loaners', loaners, 'Faktura', [], true);
    }

    // Writes/replaces the PenaltyDays: array block directly after Loaners: —
    // per-period count of late-payment days (contract §21.1's fixed daily
    // rate applies to each of these), the input Penalty is directly derived
    // from (Penalty[i] = PenaltyDays[i] * PenaltyForDay). See
    // computeDailyBalance/computePenaltyDays.
    //   PenaltyDays:
    //     - 2026-07-01#2026-07-31: 3
    //     - 2026-08-01#2026-08-31: 0
    //     - ALL: 3
    static writePenaltyDays(filePath, penaltyDays) {
        console.info(`[Yamls.writePenaltyDays] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'PenaltyDays', penaltyDays, 'Loaners', [], true);
    }

    // Writes/replaces the Penalty: array block directly after PenaltyDays: —
    // the WHOLE Accrual->Payment->Faktura->Loaners->PenaltyDays->Penalty
    // chain is always written as one contiguous run of blocks anchored off
    // ComBase (see writeAccrual); the static PenaltyON: toggle field (never
    // touched by any write*Section call) is repositioned SEPARATELY, by
    // repositionPenaltyOn below, to sit between Loaners and PenaltyDays
    // afterward — never by anchoring a chain write directly on PenaltyON's
    // OWN current position, which drifts.
    //   Penalty:
    //     - 2026-07-01#2026-07-31: 150,000
    //     - 2026-08-01#2026-08-31: 0
    //     - ALL: 150,000
    static writePenalty(filePath, penalty) {
        console.info(`[Yamls.writePenalty] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Penalty', penalty, 'PenaltyDays', ['Punish'], true);
    }

    // Repositions the static PenaltyON: toggle field (never itself written
    // by writeAccrual/writePayment/writeFaktura/writeLoaners/writePenaltyDays/
    // writePenalty — those only ever touch the
    // Accrual/Payment/Faktura/Loaners/PenaltyDays/Penalty array blocks) to
    // sit directly between Loaners: and Penalty: (i.e. directly before
    // PenaltyDays:, which writePenaltyDays anchors right after Loaners) —
    // the confirmed-correct real file layout (Accrual -> Payment -> Faktura
    // -> Loaners -> PenaltyON -> PenaltyDays -> Penalty -> Returns ->
    // Excel.CellNames keys). Because
    // PenaltyON is static, its position never moves on its own; only the
    // surrounding chain blocks move (per replaceYaml re-running the whole
    // chain), so this must run AFTER the whole chain is (re)written, every
    // time, to keep PenaltyON from drifting to wherever it happened to land
    // relative to the chain's own insertion points. A no-op (with a warning)
    // when PenaltyON: is missing from the file entirely.
    static repositionPenaltyOn(filePath) {
        console.info(`[Yamls.repositionPenaltyOn] 🟢 Starting...`);

        const lines = fs.readFileSync(filePath, 'utf8').split('\n');

        const penaltyOnIdx = lines.findIndex(line => /^PenaltyON:/.test(line));
        if (penaltyOnIdx === -1) {
            console.warn(`repositionPenaltyOn: "PenaltyON:" line not found in ${filePath}; leaving file as-is.`);
            return;
        }

        const loanersIdx = lines.findIndex(line => /^Loaners:/.test(line));
        const penaltyIdx = lines.findIndex(line => /^Penalty:/.test(line));
        if (loanersIdx === -1 || penaltyIdx === -1) {
            console.warn(`repositionPenaltyOn: "Loaners:"/"Penalty:" not both found in ${filePath}; leaving PenaltyON as-is.`);
            return;
        }

        // Already correctly positioned (PenaltyON sits after Loaners' own
        // block and before Penalty) — nothing to do.
        if (penaltyOnIdx > loanersIdx && penaltyOnIdx < penaltyIdx) {
            console.log('repositionPenaltyOn: already correctly positioned, no-op.');
            return;
        }

        // Pull the PenaltyON: line out of its current position, plus its
        // OWN trailing blank-line separator only — the leading blank line
        // stays put, since it now becomes the separator between whatever
        // precedes PenaltyON and whatever follows it once PenaltyON itself
        // is gone (removing both sides would fuse two unrelated blocks
        // together with zero blank line between them).
        let removeEnd = penaltyOnIdx + 1;
        if (lines[removeEnd] === '') removeEnd++;
        const penaltyOnLine = lines[penaltyOnIdx];
        const withoutPenaltyOn = [...lines.slice(0, penaltyOnIdx), ...lines.slice(removeEnd)];

        // Re-locate Loaners:' own block end (skip its indented children)
        // against the line array with PenaltyON already removed.
        const newLoanersIdx = withoutPenaltyOn.findIndex(line => /^Loaners:/.test(line));
        let insertAt = newLoanersIdx + 1;
        while (insertAt < withoutPenaltyOn.length && /^\s/.test(withoutPenaltyOn[insertAt]) && withoutPenaltyOn[insertAt] !== '') {
            insertAt++;
        }
        while (insertAt < withoutPenaltyOn.length && withoutPenaltyOn[insertAt] === '') insertAt++;

        withoutPenaltyOn.splice(insertAt, 0, penaltyOnLine, '');

        const normalized = [];
        for (const line of withoutPenaltyOn) {
            if (line === '' && normalized.length > 0 && normalized[normalized.length - 1] === '') continue;
            normalized.push(line);
        }

        fs.writeFileSync(filePath, normalized.join('\n'));
        console.log(`repositionPenaltyOn: moved PenaltyON: to sit between Loaners: and Penalty: in ${filePath}.`);
    }

    // Writes/replaces the Faktura: array block directly after Payment: — the
    // real EHF-IN invoice sum distributed across the final Accrual periods
    // (see computeFaktura), same shape as Payment.
    //   Faktura:
    //     - 2026-03-01#2026-03-31: 450,000
    //     - 2026-04-01#2026-04-30: 0
    //     - ALL: 450,000
    static writeFaktura(filePath, faktura) {
        console.info(`[Yamls.writeFaktura] 🟢 Starting...`);
        this.writeYamlArraySection(filePath, 'Faktura', faktura, 'Payment', [], true);
    }

    // Scans <folderALL>/<key>/ for dated subfolders (ported from
    // Excels.scanSubFolder + Excels.processFolders — same "YYYY-MM-DD amount"
    // naming, same numeric sort) and returns [{date, amount}], sorted, amount
    // stripped of commas/spaces. Returns [] when the folder doesn't exist —
    // this is what lets a key be written as an empty array by default.
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
            const amount = match[2].replace(/,/g, '').replace(/\s/g, '');

            const dedupeKey = `${date}|${amount}`;
            if (seen.has(dedupeKey)) {
                console.warn(`⚠️ scanCellFolder: ${key} — duplicate date+amount folder for ${dedupeKey} ("${name}"), skipping.`);
                continue;
            }
            seen.add(dedupeKey);

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

            companyInfo.isYatt = isYatt;

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

        Yamls.replaceYaml(globalThis.ymlFile, yamlData, companyInfo);
    }


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

        return prepay;

    }

    static replaceYaml(ymlFile, yamlData, companyInfo) {
        console.info(`[Yamls.replaceYaml] 🟢 Starting...`);
        console.log(ymlFile, 'ymlFile');

        if (!yamlData || !companyInfo)
            return Dialogs.warningBox('yamlData or companyInfo is not defined!');

        console.log(yamlData, 'yamlData');
        console.log(companyInfo, 'companyInfo');

        // Every "_"-suffixed key ALWAYS holds a DD.MM.YYYY date (ComDate_,
        // ComDateEnd_, ComDateIjara_, ActDate_, ActDateEnd_); the matching
        // bare-named key (no "_", formerly the "*Excel" suffix) ALWAYS holds
        // the same date converted to YYYY-MM-DD (ComDate, ComDateEnd,
        // ComDateIjara, ActDate, ActDateEnd, plus the derived StartDate/
        // FutureDate/FutureDateApp). The "_" suffix exists ONLY to free up the
        // bare name for the YYYY-MM-DD counterpart — both forms of the same
        // date are always kept in sync below.
        if (Files.isEmpty(yamlData.ComDate_)) {
            let comDateFromTxt = Files.getDateFromTXT(globalThis.folderCompan)
            if (comDateFromTxt) {
                yamlData.ComDate_ = comDateFromTxt
            } else {
                const regDate = companyInfo.isYatt
                    ? companyInfo.soliqYatt?.registrationDate
                    : companyInfo.soliq?.company.registrationDate
                // registrationDate can come back as YYYY-MM-DD (soliq API) or
                // already DD.MM.YYYY (Didox) — normalize to Didox's DD.MM.YYYY,
                // which every downstream date helper (Dates.addDays, Word.extractDate) expects.
                yamlData.ComDate_ = Dates.excelToDidox(regDate) || regDate
            }
        } else {
            Files.saveInfoToFile(globalThis.folderCompan, yamlData.ComDate_)
        }

        if (Files.isEmpty(yamlData.ComDateIjara_)) {
            yamlData.ComDateIjara_ = Yamls.getConfig('Contract.ComDateIjara');
            console.info('yamlData.ComDateIjara_', yamlData.ComDateIjara_);
        }

        const addDays = Yamls.getConfig('Contract.AddDays');
        console.log(`addDays from Yaml: ${addDays}`);
        yamlData.ComDateEnd_ = Dates.addDays(yamlData.ComDate_, addDays)
        console.info('yamlData.ComDateEnd_', yamlData.ComDateEnd_);


        const comDate = Word.extractDate(yamlData.ComDate_);
        if (!comDate)
            return Dialogs.warningBox(`ComDate_ is missing or invalid ("${yamlData.ComDate_}") — cannot fill Day/Month/Year. Fill it in the .contract yaml or add a DD.MM.YYYY marker file in Compan/.`);
        yamlData.Day = comDate.day;
        yamlData.Month = comDate.month;
        yamlData.Year = comDate.year;

        const comDateEnd = Word.extractDate(yamlData.ComDateEnd_);
        if (!comDateEnd)
            return Dialogs.warningBox(`ComDateEnd_ is missing or invalid ("${yamlData.ComDateEnd_}") — cannot fill DayEnd/MonthEnd/YearEnd.`);
        yamlData.DayEnd = comDateEnd.day;
        yamlData.MonthEnd = comDateEnd.month;
        yamlData.YearEnd = comDateEnd.year;

        const comDateIjara = Word.extractDate(yamlData.ComDateIjara_);
        if (!comDateIjara)
            return Dialogs.warningBox(`ComDateIjara_ is missing or invalid ("${yamlData.ComDateIjara_}") — cannot fill DayIjara/MonthIjara/YearIjara. Check Contract.ComDateIjara in config.yml.`);
        yamlData.DayIjara = comDateIjara.day;
        yamlData.MonthIjara = comDateIjara.month;
        yamlData.YearIjara = comDateIjara.year;


        yamlData.ActDate = Dates.didoxToExcel(yamlData.ActDate_);
        yamlData.ActDateEnd = Dates.didoxToExcel(yamlData.ActDateEnd_);

        yamlData.ComDate = Dates.didoxToExcel(yamlData.ComDate_);
        yamlData.ComDateEnd = Dates.didoxToExcel(yamlData.ComDateEnd_);
        yamlData.ComDateIjara = Dates.didoxToExcel(yamlData.ComDateIjara_);

        if (!yamlData.ActDate_) {
            yamlData.StartDate = yamlData.ComDate
            console.log('StartDate from ComDate', yamlData.StartDate);
        }
        else {
            yamlData.StartDate = Dates.didoxToExcel(yamlData.ActDate_)
            console.log('StartDate from ActDate_', yamlData.StartDate);
        }


        const prepayMonth = Yamls.getPrepayMonth(yamlData);
        console.log(prepayMonth, 'prepayMonth');

        if (!yamlData.ActDateEnd_) {
            yamlData.FutureDate = Dates.futureDateByMonth(prepayMonth, false)
            console.log('FutureDate from prepayMonth', yamlData.FutureDate);
        }
        else {
            yamlData.FutureDate = Dates.didoxToExcel(yamlData.ActDateEnd_)
            console.log('FutureDate from ActDateEnd_', yamlData.FutureDate);
        }

        yamlData.FutureDateApp = Dates.getMinusOneDay(yamlData.FutureDate)
        console.log(yamlData.FutureDateApp, 'yamlData.FutureDateApp');





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


        const price = yamlData.Price.replaceAll(',', '')

        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.ComINN}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.SurPINFL}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${price}`)

        yamlData.ComName = Word.cleanCompanyName(companyInfo.shortName)
        yamlData.IsYatt = companyInfo.isYatt

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
        if (!companyInfo.isYatt)
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
        if (!companyInfo.isYatt)
            yamlData.ComNa1NameLat = companyInfo.soliq?.company.businessStructureDetail.name_uz_latn ?? ''
        else
            yamlData.ComNa1NameLat = companyInfo?.soliqYatt?.formName?.uz ?? ''

        if (!Files.isEmpty(yamlData.ComNa1NameLat)) {
            yamlData.ComNa1NameShort = yamlData.ComNa1NameLat.split(' ').map(word => word.charAt(0)).join('')
                .toUpperCase()
        }

        yamlData.ComStatusCode = companyInfo.statusCode
        yamlData.ComStatusName = companyInfo.statusName

        if (!companyInfo.isYatt) {
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
        if (companyInfo.isYatt) {
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


        if (!companyInfo.isYatt) {
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

        if (!companyInfo.isYatt) {
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

        const ComDate = Dates.parseDMY(yamlData.ComDate_);
        const ComVATDateReg = Dates.parseDMY(yamlData.ComVATDateReg);

        // if ComDate is greater than ComVATDateReg 
        if (companyInfo.VATRegCode) {
            if (ComDate < ComVATDateReg) {
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



        // iterate yamldata and write via reoplacetextline func
        for (const [key, value] of Object.entries(yamlData)) {
            this.replaceTextLine(ymlFile, key, value);
        }

        // Always record Accrual/Payment/Faktura/Loaners/PenaltyDays/Penalty/
        // Returns per calendar month across the contract's active period
        // (StartDate..FutureDate, both YYYY-MM-DD) — runs every time the
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
            yamlData.StartDate, yamlData.FutureDate, yamlData.Price, yamlData.PriceMax, payments
        );
        Yamls.writeAccrual(ymlFile, accrual);

        // Payment: WRITTEN form — flat date-keyed merge of Bank-OT + Card-OT
        // + BaaR-OT + Trans-OT (same-date entries from different sources
        // summed together), e.g. { '2026-04-21': '1,600,000' }. Distinct
        // from `payments` above (which feeds the internal debt chain).
        const paymentFlat = Yamls.mergeDateKeyedArrays(bankOT, cardOT, baarOT, transOT);
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

        Yamls.writeLoaners(ymlFile, loaners);

        // Returns: flat date-keyed merge of Bank-IN + Card-IN + BaaR-IN
        // (money refunded BACK to the tenant) — same shape/merge rule as
        // Payment:, Trans-IN intentionally excluded.
        const bankIN = Yamls.scanCellFolder(globalThis.folderALL, 'Bank-IN');
        const cardIN = Yamls.scanCellFolder(globalThis.folderALL, 'Card-IN');
        const baarIN = Yamls.scanCellFolder(globalThis.folderALL, 'BaaR-IN');
        const returnsFlat = Yamls.mergeDateKeyedArrays(bankIN, cardIN, baarIN);

        // Penalty (§21.1 + §3.7/§1.20): a prepaid running-balance simulation
        // — Accrual debited daily (pro-rated), Payment credits/Returns
        // debits the balance on their own dates. Every consecutive day
        // (beyond the first, which is the 1-calendar-day grace period) the
        // balance stays negative counts as a penalty day; Penalty[month] =
        // PenaltyDays[month] * PenaltyForDay, no cap — replaces the old
        // CapRatio-of-Accrual model entirely. PenaltyForDay is
        // yamlData.PenaltyPerDay (the per-contract override, blank by
        // default like ContractNumber) when non-empty, else config.yml's
        // global Penalty.PerDay.
        const ledger = Yamls.computeDailyBalance(yamlData.StartDate, yamlData.FutureDate, accrual, paymentFlat, returnsFlat);
        const penaltyDays = Yamls.computePenaltyDays(accrual, ledger);
        Yamls.writePenaltyDays(ymlFile, penaltyDays);

        const penaltyForDay = Files.isEmpty(yamlData.PenaltyPerDay)
            ? Yamls.getConfig('Penalty.PerDay', 'number', 50000)
            : Number(String(yamlData.PenaltyPerDay).replace(/,/g, ''));
        const penalty = Yamls.computePenalty(penaltyDays, penaltyForDay);
        Yamls.writePenalty(ymlFile, penalty);

        Yamls.writeReturns(ymlFile, returnsFlat);

        // PenaltyON is a static field the write*Section chain above never
        // touches — reposition it to sit between Loaners: and PenaltyDays:
        // now that the whole chain has (re)written itself, so it never
        // drifts to wherever the chain's own insertion points happened to
        // land it.
        Yamls.repositionPenaltyOn(ymlFile);

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
            const dumpStr = yaml.dump(mergedData, { lineWidth: -1 });
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

        const doc = yaml.load(fs.readFileSync(configPath, 'utf8')) ?? {};

        // dot-prop sets the nested dot-path, auto-creating intermediate objects.
        setProperty(doc, keyPath, value);

        fs.writeFileSync(configPath, yaml.dump(doc, { lineWidth: -1, quotingType: '"' }), 'utf8');
        console.log(`✅ setConfig: ${keyPath} = ${value}`);
    }

}
