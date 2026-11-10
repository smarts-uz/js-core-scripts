// add functikon infoByTinPinfl

import banks from "../conf/data/banks.json" with { type: "json" };
import districts from "../conf/data/districts.json" with { type: "json" };
import regions from "../conf/data/regions.json" with { type: "json" };

import fs from "fs";
import path from "path";
import { ofetch } from "#ofetch";
import { Files } from './Files.js';
import { Dialogs } from "./Dialogs.js";
import { Yamls } from "./Yamls.js";
import { Secrets } from "./Secrets.js";
import { Dates } from "./Dates.js";
import { Eimzo } from "./Eimzo.js";

const MONTHS_RU = [
    'январь', 'февраль', 'март', 'апрель', 'май', 'июнь',
    'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь',
];

// Non-secret Didox base URL lives in config.yml (Didox.BaseURL), stored bare
// (e.g. "api-partners.didox.uz"); normalize to a full https:// origin.
function didoxBaseURL() {
    const raw = String(Yamls.getConfig('Didox.BaseURL') ?? 'api-partners.didox.uz').trim().replace(/\/+$/, '');
    const url = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    console.debug(`[Didox.didoxBaseURL] ${raw} -> ${url}`);
    return url;
}

function firstNonEmpty(values) {
    for (const raw of values) {
        const trimmed = String(raw ?? '').trim();
        if (trimmed) {
            return trimmed;
        }
    }
    return '';
}

// Firm whose Didox credentials the shared client sends (keys.yml didox.<kind>.<firm>).
const DIDOX_FIRM = 'SRental';

function didoxUserKey() {
    return firstNonEmpty([Secrets.get('didox', 'user_key', DIDOX_FIRM)]);
}

function didoxPartnerKey() {
    return firstNonEmpty([Secrets.get('didox', 'partner_key', DIDOX_FIRM)]);
}

function resolveDidoxHeaders(callerName) {
    const userKey = didoxUserKey();
    const partnerAuth = didoxPartnerKey();

    switch (true) {
        case !userKey: {
            const msg = `[Didox.${callerName}] Missing didox.user_key.${DIDOX_FIRM} in keys.yml (user-key header is required)`;
            console.error(msg);
            Dialogs.messageBox(msg, 'Error');
            return null;
        }
        case !partnerAuth: {
            const msg = `[Didox.${callerName}] Missing didox.partner_key.${DIDOX_FIRM} in keys.yml (Partner-Authorization header is required)`;
            console.error(msg);
            Dialogs.messageBox(msg, 'Error');
            return null;
        }
        default: {
            const headers = new Headers();
            headers.append('user-key', userKey);
            headers.append('Partner-Authorization', partnerAuth);
            return headers;
        }
    }
}

// Shared client for the Didox Partner API: one place for the base URL and the
// auth headers that every reference-data call below previously rebuilt by hand
// (a `new Headers()` + two appends + a requestOptions object, repeated ~15x).
//
// Built LAZILY on first call — not at module top-level. didox.js and Yamls.js
// form an import cycle (didox.js imports Yamls, Yamls.js imports Didox), so
// touching Yamls.getConfig()/Secrets.get() during module evaluation crashes with
// "Cannot access 'Yamls' before initialization" (TDZ). Deferring to first use
// lets both modules finish initializing before any config/secret is read.
let _didoxClient = null;
function didoxApi(...args) {
    if (!_didoxClient) {
        _didoxClient = ofetch.create({
            baseURL: didoxBaseURL(),
            headers: {
                "user-key": didoxUserKey(),
                "Partner-Authorization": didoxPartnerKey(),
            },
            onRequest({ options }) {
                const reqHeaders = new Headers(options.headers);
                const liveUserKey = didoxUserKey();
                const livePartnerAuth = didoxPartnerKey();
                if (liveUserKey) {
                    reqHeaders.set("user-key", liveUserKey);
                }
                if (livePartnerAuth) {
                    reqHeaders.set("Partner-Authorization", livePartnerAuth);
                }
                options.headers = reqHeaders;
            },
        });
    }
    return _didoxClient(...args);
}


export class Didox {



    static saveMeasures() {
    console.info(`[Didox.saveMeasures] 🟢 Starting...`);
        didoxApi("/v1/measures/all", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static getRegionInfo() {
    console.info(`[Didox.getRegionInfo] 🟢 Starting...`);
        didoxApi("/v1/utils/waybills/districts?regionId=6", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveDistricts() {
    console.info(`[Didox.saveDistricts] 🟢 Starting...`);
        didoxApi("/v1/districts/all", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveRegions() {
    console.info(`[Didox.saveRegions] 🟢 Starting...`);
        didoxApi("/v1/regions/all", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveBanks() {
    console.info(`[Didox.saveBanks] 🟢 Starting...`);
        didoxApi("/v1/banks/all", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveRegionsTTN() {
    console.info(`[Didox.saveRegionsTTN] 🟢 Starting...`);
        didoxApi("/v1/utils/waybills/regions", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveRailwayStations() {
    console.info(`[Didox.saveRailwayStations] 🟢 Starting...`);
        didoxApi("/v1/utils/stations", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static fraudsByTin(tin) {
    console.info(`[Didox.fraudsByTin] 🟢 Starting...`);
        didoxApi("/v1/utils/non-conformity-goods-companies/ru?tin=311506035", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static frauds() {
    console.info(`[Didox.frauds] 🟢 Starting...`);
        didoxApi("/v1/utils/non-conformity-goods-companies/ru?page=1&size=100&tin", { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static profileIKPUCodes() {
    console.info(`[Didox.profileIKPUCodes] 🟢 Starting...`);
        didoxApi("/v1/profile/productClassCodes/ru?page=&size=&search=", {
            responseType: "text",
            headers: { "Content-Type": "application/json", "Accept-Language": "ru" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static documentList() {
    console.info(`[Didox.documentList] 🟢 Starting...`);
        didoxApi("/v2/documents?page=1&size=100&doctype=000,010&partner=312261753&owner=1", {
            responseType: "text",
            headers: { "Accept-Language": "ru", "Content-Type": "application/json" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static documentPDF(docId) {
    console.info(`[Didox.documentPDF] 🟢 Starting...`);
        didoxApi(`/v1/documents/view/${docId}/pdf/ru`, { responseType: "text" })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static searchIKPUCode(text) {
    console.info(`[Didox.searchIKPUCode] 🟢 Starting...`);
        didoxApi("/v1/profile/productClasses/search?text=Лапша&lang=uz", {
            responseType: "text",
            headers: { "Accept-Language": "ru", "Content-Type": "application/json" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static profileInfo() {
    console.info(`[Didox.profileInfo] 🟢 Starting...`);
        didoxApi("/v1/profile/", {
            responseType: "text",
            headers: { "Content-Type": "application/json", "Accept-Language": "ru" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static vatRegStatus(tin, date) {
    console.info(`[Didox.vatRegStatus] 🟢 Starting...`);
        didoxApi("/v1/profile/vatRegStatus/312261753?document_date=13.01.2024", {
            responseType: "text",
            headers: { "Accept-Language": "ru", "Content-Type": "application/json" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static getTaxpayerType() {
    console.info(`[Didox.getTaxpayerType] 🟢 Starting...`);
        didoxApi("/v1/profile/taxpayerType/312261753/uz?date=", {
            responseType: "text",
            headers: { "Accept-Language": "ru", "Content-Type": "application/json" },
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static login() {
    console.info(`[Didox.login] 🟢 Starting...`);
        didoxApi("/v1/auth/311958304/password/ru", {
            method: "POST",
            body: { password: Secrets.get("didox", "login_password", DIDOX_FIRM) ?? "" },
            headers: { "Accept-Language": "ru" },
            responseType: "text",
        })
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }
    static bankByCode(code) {
    console.info(`[Didox.bankByCode] 🟢 Starting...`);
        if (!code) return null;
        try {
            const bank = banks.find(b => String(b.bankId) === String(code));
            console.log(bank, 'bank');
            return bank || null;
        } catch (err) {
            console.error("Failed to read banks.json:", err);
            return null;
        }
    }

    static regionsByCode(code) {
    console.info(`[Didox.regionsByCode] 🟢 Starting...`);
        if (!code) return null;
        try {
            const region = regions.find(r => String(r.regionId) === String(code));
            console.log(region, 'region');
            return region || null;
        } catch (err) {
            console.error("Failed to read regions.json:", err);
            return null;
        }
    }

    static districtsByCode(regionId, districtCode) {
    console.info(`[Didox.districtsByCode] 🟢 Starting...`);
        if (!regionId) return null;
        if (!districtCode) return null;

        try {
            const district = districts.find(d => String(d.districtCode) === String(districtCode) && String(d.regionId) === String(regionId));
            console.log(district, 'district');
            return district || null;
        } catch (err) {
            console.error("Failed to read districts.json:", err);
            return null;
        }
    }


    static async contracts(owner, rentType, state, page = 0, size = 1000) {
        console.info(`[Didox.contracts] 🟢 Starting...`);

        console.log(owner, 'owner');
        if (!owner) return Dialogs.warningBox('No owner', 'Warning');

        console.log(rentType, 'rentType');
        if (!rentType) return Dialogs.warningBox('No rentType', 'Warning');

        console.log(state, 'state');
        if (!state) return Dialogs.warningBox('No state', 'Warning');

        let bearer = Secrets.get('ijara', 'token', owner);
        if (!bearer) return Dialogs.warningBox('No bearer', 'Warning');

        const options = {
            method: 'GET',
            headers: {
                'accept': '*/*',
                'accept-language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7,zh-CN;q=0.6,zh;q=0.5',
                'authorization': `Bearer ${bearer}`,
                'cache-control': 'no-cache',
                'pragma': 'no-cache',
                'referer': `https://ijara.soliq.uz/estate-list?myRentType=${rentType}&state=${state}`,
                'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36'
            }
        };

        try {
            const url = `https://ijara.soliq.uz/api/rent/client/contract/get-list/by-params?myRentType=${rentType}&state=${state}&page=${page}&size=${size}`;

            const body = await Chromes.fetch(url, options, 10 * 60 * 60, [
                'api/rent/client/contract/get-list/by-params',
            ], owner)

            if (!body) return Dialogs.warningBox('No body in response', 'Warning');

            return body;
        } catch (error) {
            return Dialogs.errorBox(error, 'Error fetching contracts');
        }

    }

    static async infoByTinPinfl(tin, personFolder = globalThis.folderDirector) {
    console.info(`[Didox.infoByTinPinfl] 🟢 Starting...`);

        const tinStr = String(tin ?? '').trim();
        if (!tinStr) return null;

        let prefix;

        // if string len of tin more than 9
        if (tinStr.length > 9) {
            prefix = 'PINFL Didox ';
        } else {
            prefix = 'INN Didox ';
        }

        const file = path.join(globalThis.folderRestAPI, prefix + tinStr + '.json');
        const baseURL = didoxBaseURL();
        const maxAgeDays = Yamls.getCacheMaxAgeDays();
        const cached = Files.readJsonCache(file);
        let returns;

        if (Files.isCacheFresh(file, maxAgeDays)) {
            console.log(`infoByTinPinfl cache is fresh, using ${file}`);
            returns = cached;
        } else {
            console.log(`infoByTinPinfl cache missing or expired (${maxAgeDays} day(s)), fetching ${tinStr}`);

            const myHeaders = resolveDidoxHeaders('infoByTinPinfl');

            if (!myHeaders) {
                returns = cached;
            } else {
                const requestOptions = {
                    method: "GET",
                    headers: myHeaders,
                    redirect: "follow"
                };

                try {
                    console.warn(`Fetching infoByTinPinfl for ${tinStr}`);

                    const response = await fetch(`${baseURL}/v1/utils/info/${encodeURIComponent(tinStr)}`, requestOptions);

                    if (response.ok) {
                        const result = await response.json();

                        switch (true) {
                            case Files.saveJsonCache(file, result): {
                                console.log(`infoByTinPinfl saved to ${file}`);
                                returns = result;
                                break;
                            }
                            default: {
                                // Empty/invalid answer — the existing cache file is left untouched.
                                returns = cached;
                                console.error(`infoByTinPinfl for ${tinStr}: fetched JSON carries no data, old cache kept`);
                                Dialogs.messageBox(`infoByTinPinfl for ${tinStr}: bo'sh javob keldi, eski kesh ishlatilmoqda`, 'Warning');
                                break;
                            }
                        }
                    } else {
                        returns = cached;
                        switch (response.status) {
                            case 401: {
                                console.error(`Error infoByTinPinfl for ${tinStr}: 401 ${response.statusText} (invalid or expired didox.user_key / didox.partner_key in keys.yml)`);
                                Dialogs.messageBox(`Error infoByTinPinfl for ${tinStr}: 401 ${response.statusText} — didox.user_key eskirgan yoki noto'g'ri (keys.yml ni yangilang)`, 'Error');
                                break;
                            }
                            default: {
                                console.error(`Error infoByTinPinfl for ${tinStr}: ${response.status}, ${response.statusText}`);
                                Dialogs.messageBox(`Error infoByTinPinfl for ${tinStr}: ${response.status} ${response.statusText}`, 'Error');
                                break;
                            }
                        }
                    }


                } catch (error) {
                    console.error(`Error infoByTinPinfl for ${tinStr}`, error);
                    Dialogs.messageBox(`Error infoByTinPinfl for ${tinStr}: ${error.message}`, 'Error', 16);
                    returns = cached;
                }
            }

        }

        console.info(returns, 'returns infoByTinPinfl');
        if (!returns) return null;

        let person
        if (returns.personalNum) {
            returns.name = Files.normalizeApostrophe(returns.name);
            person = path.join(personFolder, returns.name);

            Files.mkdirIfNotExists(person);
            Files.saveInfoToFile(person, returns.address);
            Files.saveInfoToFile(person, returns.personalNum);
            Files.saveInfoToFile(person, returns.tin);

            //    await this.carInfoByPinfl(tin)

        } else {
            const addr = String(returns.address ?? '');
            switch (true) {
                case addr.includes('Anorzor'):
                    returns.AddressType = 'Anorzor';
                    break;
                case addr.includes('Adolat MFY'):
                    returns.AddressType = 'Adolat';
                    break;

                default:
                    returns.AddressType = 'Others';
                    break;
            }

        }

        return returns;

    }


    // ===== E-IMZO signing + auth (Didox docs "01. Работа с E-IMZO") =====================
    // Nothing below runs unless a caller asks: Eimzo talks to the LOCAL E-IMZO service,
    // everything else goes to the Didox Partner API.

    // POST /v1/dsvs/timestamp — attach a trusted timestamp to an E-IMZO signature.
    static async timestamp(pkcs764, signatureHex) {
        console.info(`[Didox.timestamp] 🟢 Starting...`);
        const reply = await didoxApi('/v1/dsvs/timestamp', {
            method: 'POST',
            body: { pkcs7: pkcs764, signatureHex },
            headers: { 'Accept-Language': 'ru', 'Content-Type': 'application/json' },
        });
        switch (Boolean(reply?.timeStampTokenB64)) {
            case false:
                throw new Error(`Didox timestamp failed: ${JSON.stringify(reply)}`);
        }
        return reply.timeStampTokenB64;
    }

    // E-IMZO signature of base64 data + Didox timestamp -> timeStampTokenB64
    // (the value every "signature" body field below expects).
    static async signData(dataBase64, tin) {
        console.info(`[Didox.signData] 🟢 Starting...`);
        const signed = await Eimzo.sign(dataBase64, tin);
        return Didox.timestamp(signed.pkcs7_64, signed.signature_hex);
    }

    // Log in as the company by E-IMZO: sign base64(TIN) -> POST /v1/auth/{tin}/token/{locale}.
    // The token is kept in this process only (Secrets._set -> didox.user_key), never written to disk.
    static async authToken(tin, locale = 'ru') {
        console.info(`[Didox.authToken] 🟢 Starting...`);
        const tinStr = String(tin ?? '').trim();
        const signature = await Didox.signData(Eimzo.toBase64(tinStr), tinStr);
        const reply = await didoxApi(`/v1/auth/${tinStr}/token/${locale}`, {
            method: 'POST',
            body: { signature },
            headers: { 'Accept-Language': locale, 'Content-Type': 'application/json' },
        });
        switch (Boolean(reply?.token)) {
            case false:
                throw new Error(`Didox login failed for ${tinStr}: ${JSON.stringify(reply)}`);
        }
        Secrets._set('didox', 'user_key', DIDOX_FIRM, reply.token);
        return reply.token;
    }

    // POST /v1/documents/{docType}/create/{locale} — draft document, returns the API reply (`_id` = doc id).
    static async documentCreate(docType, body, locale = 'ru') {
        console.info(`[Didox.documentCreate] 🟢 Starting...`);
        return didoxApi(`/v1/documents/${docType}/create/${locale}`, {
            method: 'POST',
            body,
            headers: { 'Accept-Language': locale, 'Content-Type': 'application/json' },
        });
    }

    // True when an outgoing document with exactly this number already exists (idempotency guard).
    static async documentExists(number, docType = '002') {
        console.info(`[Didox.documentExists] 🟢 Starting...`);
        const reply = await didoxApi(
            `/v2/documents?page=1&size=50&owner=1&doctype=${docType}&name=${encodeURIComponent(number)}`,
            { headers: { 'Accept-Language': 'ru' } }
        );
        const rows = Array.isArray(reply?.data) ? reply.data : [];
        return rows.some((row) => String(row?.name ?? '').trim() === String(number).trim());
    }

    // Sign (= send) an outgoing draft: GET its json, sign base64(json), POST /v1/documents/{id}/sign.
    static async documentSign(docId, tin) {
        console.info(`[Didox.documentSign] 🟢 Starting...`);
        const document = await didoxApi(`/v1/documents/${docId}?owner=1`);
        const json = document?.data?.json;
        switch (Boolean(json)) {
            case false:
                throw new Error(`Didox document ${docId} has no data.json: ${JSON.stringify(document)}`);
        }
        const signature = await Didox.signData(Eimzo.toBase64(JSON.stringify(json)), tin);
        const reply = await didoxApi(`/v1/documents/${docId}/sign`, {
            method: 'POST',
            body: { signature },
            headers: { 'Accept-Language': 'ru', 'Content-Type': 'application/json' },
        });
        return reply?.data === true;
    }

    // Package (unit) of a catalog code, matched by name: GET /v1/profile/{tin}/productClasses/check/{code}/{lang}.
    static async productPackage(tin, catalogCode, packageName, locale = 'ru') {
        console.info(`[Didox.productPackage] 🟢 Starting...`);
        const list = await didoxApi(`/v1/profile/${tin}/productClasses/check/${catalogCode}/${locale}`, {
            headers: { 'Accept-Language': locale },
        });
        const wanted = String(packageName).trim().toLowerCase();
        const found = (Array.isArray(list) ? list : []).find((item) => String(item?.name ?? '').trim().toLowerCase() === wanted);
        switch (Boolean(found)) {
            case false:
                throw new Error(`Didox package "${packageName}" not offered for catalog ${catalogCode}: ${JSON.stringify(list)}`);
        }
        return { code: String(found.code), name: String(found.name) };
    }

    // Registry card of a company (GET /v1/utils/info/{tin}): cached file first; the network is
    // touched only when `online` and nothing is cached. Returns null when unknown offline.
    static async partyInfo(tin, cacheFile, online = false) {
        console.info(`[Didox.partyInfo] 🟢 Starting...`);
        const cached = Files.readJsonCache(cacheFile);
        switch (Boolean(cached)) {
            case true:
                return cached;
        }
        switch (online) {
            case false:
                return null;
        }
        const info = await didoxApi(`/v1/utils/info/${tin}`, { headers: { 'Accept-Language': 'ru' } });
        Files.writeJson(cacheFile, info);
        return info;
    }

    // ===== Faktura (счет-фактура, doctype 002) from the contract's FakturaSend block ======
    // FakturaSend = one `YYYY-MM-DD: amount` entry per billing period still to be invoiced;
    // the date is the period END, which is also the invoice date. The invoice names its
    // period (month, or an explicit range for a partial period) in the product line.

    static fakturaSettings() {
        console.info(`[Didox.fakturaSettings] 🟢 Starting...`);
        const read = (key, fallback) => Yamls.getConfig(`Faktura.${key}`, null, fallback) ?? fallback;
        return {
            docType: String(read('DocType', '002')),
            locale: String(read('Locale', 'ru')),
            numberFormat: String(read('NumberFormat', '{ContractNo}-{M}')),
            productName: String(read('ProductName', 'Аренда нежилого помещения согласно Договору Аренды')),
            catalogCode: String(read('CatalogCode', '10701001001000000')),
            catalogName: String(read('CatalogName', 'Услуги по аренде зданий и сооружений')),
            packageName: String(read('PackageName', 'месяц')),
            packageCode: String(read('PackageCode', '')),
            origin: Number(read('Origin', 3)),
        };
    }

    // Pending invoices: FakturaSend entries with amount > 0 whose period already ended
    // (key <= today), optionally narrowed to one period-end `date`. Each entry carries the
    // period start, taken from the matching Accrual `start#end` interval (month start otherwise).
    static fakturaEntries(yamlData, date = '', today = Dates.today()) {
        console.info(`[Didox.fakturaEntries] 🟢 Starting...`);
        const starts = new Map();
        for (const accrual of Array.isArray(yamlData?.Accrual) ? yamlData.Accrual : []) {
            const [start, end] = String(Object.keys(accrual ?? {})[0] ?? '').split('#');
            starts.set(end, start);
        }

        const entries = [];
        for (const item of Array.isArray(yamlData?.FakturaSend) ? yamlData.FakturaSend : []) {
            const key = String(Object.keys(item ?? {})[0] ?? '');
            const amount = Number(String(item?.[key] ?? '').replace(/[,\s]/g, ''));
            const wanted = date ? key === date : true;
            const eligible = [Dates.isExcelDate(key), amount > 0, wanted, key <= today];
            switch (eligible.every(Boolean)) {
                case true:
                    entries.push({ date: key, amount, start: starts.get(key) ?? `${key.slice(0, 8)}01` });
                    break;
                default:
                    console.log(`[Didox.fakturaEntries] skip ${key}: ${item?.[key]}`);
            }
        }
        return entries;
    }

    // Didox contract of the invoices: ContractNumber (+ ContractDate) when typed into the
    // .contract, else the newest `<No> от DD.MM.YYYY` folder under Contract/. null = none found.
    static fakturaContract(folderContract, yamlData = {}) {
        console.info(`[Didox.fakturaContract] 🟢 Starting...`);
        const typed = String(yamlData?.ContractNumber ?? '').trim();
        switch (typed) {
            case '':
                break;
            default:
                return { no: typed, date: String(yamlData.ContractDate ?? '').trim() };
        }

        switch (fs.existsSync(folderContract)) {
            case false:
                return null;
        }

        const found = [];
        for (const entry of fs.readdirSync(folderContract, { withFileTypes: true })) {
            const match = entry.isDirectory() ? /^(.+?) от (\d{2})\.(\d{2})\.(\d{4})$/.exec(entry.name) : null;
            switch (match) {
                case null:
                    continue;
            }
            found.push({ no: match[1].trim(), date: `${match[4]}-${match[3]}-${match[2]}` });
        }
        found.sort((a, b) => a.date.localeCompare(b.date));
        return found.at(-1) ?? null;
    }

    // "{ContractNo}-{M}" + RC26-3-25 + 2026-04-30 -> "RC26-3-25-4"
    static fakturaNumber(format, contractNo, date) {
        const [year, month] = String(date).split('-');
        const tokens = { ContractNo: contractNo, YYYY: year, MM: month, M: String(Number(month)) };
        return String(format).replace(/\{(\w+)\}/g, (whole, name) => tokens[name] ?? whole);
    }

    // Product line naming its period: "<base> за апрель 2026", or for a partial period
    // "<base> за период 20.03.2025 - 31.03.2025".
    static fakturaName(base, start, end) {
        const [startYear, startMonth, startDay] = String(start).split('-');
        const [endYear, endMonth, endDay] = String(end).split('-');
        const whole = [startDay === '01', Dates.monthEnd(start) === end].every(Boolean);
        const label = whole
            ? `${MONTHS_RU[Number(startMonth) - 1]} ${startYear}`
            : `период ${startDay}.${startMonth}.${startYear} - ${endDay}.${endMonth}.${endYear}`;
        return `${base} за ${label}`;
    }

    // Seller / Buyer block. `own` (contract yaml values) wins over the registry card `info`.
    static fakturaParty(info, own = {}) {
        const pick = (...values) => firstNonEmpty(values);
        const status = pick(own.vatRegStatus, info?.VATRegStatus);
        return {
            Name: pick(info?.shortName, info?.shortname, own.name),
            BranchCode: '',
            BranchName: '',
            VatRegCode: pick(own.vatRegCode, info?.VATRegCode),
            Account: pick(own.account, info?.account, info?.bankAccount),
            BankId: pick(own.bankId, info?.mfo, info?.bankCode),
            Address: pick(info?.address, own.address),
            Director: pick(info?.director),
            Accountant: pick(info?.accountant),
            VatRegStatus: status === '' ? null : Number(status),
        };
    }

    // The doctype-002 create body (VAT-free rental service, one line, FacturaType 0 = standard).
    static fakturaPayload(ctx) {
        const money = (Math.round(Number(ctx.amount) * 100) / 100).toFixed(2);
        return {
            Version: 1,
            WaybillLocalIds: [],
            HasMarking: false,
            HasRent: false,
            FacturaRentDoc: null,
            FacturaType: 0,
            ProductList: {
                HasCommittent: false,
                HasLgota: false,
                Tin: ctx.sellerTin,
                HasExcise: false,
                HasVat: false,
                Products: [
                    {
                        OrdNo: 1,
                        LgotaId: null,
                        CommittentName: '',
                        CommittentTin: '',
                        CommittentVatRegCode: '',
                        CommittentVatRegStatus: '',
                        Name: ctx.name,
                        CatalogCode: ctx.catalogCode,
                        CatalogName: ctx.catalogName,
                        Marks: '',
                        Barcode: '',
                        MeasureId: null,
                        PackageCode: ctx.packageCode,
                        PackageName: ctx.packageName,
                        Count: '1',
                        Summa: money,
                        DeliverySum: money,
                        VatRate: '0',
                        VatSum: '0.00',
                        ExciseRate: 0,
                        ExciseSum: 0,
                        DeliverySumWithVat: money,
                        WithoutVat: true,
                        WithoutExcise: true,
                        LgotaType: null,
                        LgotaName: null,
                        LgotaVatSum: 0,
                        WarehouseId: null,
                        Origin: ctx.origin,
                    },
                ],
            },
            FacturaDoc: { FacturaNo: ctx.number, FacturaDate: ctx.date },
            ContractDoc: { ContractNo: ctx.contractNo, ContractDate: ctx.contractDate },
            ContractId: '',
            LotId: '',
            OldFacturaDoc: { OldFacturaDate: '', OldFacturaNo: '', OldFacturaId: '' },
            SellerTin: ctx.sellerTin,
            Seller: ctx.seller,
            ItemReleasedDoc: { ItemReleasedPinfl: ctx.releasedPinfl, ItemReleasedFio: ctx.seller.Director },
            BuyerTin: ctx.buyerTin,
            Buyer: ctx.buyer,
            FacturaInvestmentObjectDoc: { ObjectId: '', ObjectName: '' },
            FacturaEmpowermentDoc: { EmpowermentNo: '', EmpowermentDateOfIssue: '', AgentFio: '', AgentTin: '' },
            ForeignCompany: { CountryId: '', Name: '', Address: '', Bank: '', Account: '' },
        };
    }

    // Send every pending FakturaSend invoice of ONE .contract.
    //   dry = true  (default) -> builds and returns the payloads; ZERO network, E-IMZO untouched.
    //   dry = false           -> E-IMZO login, then per invoice: skip if the number exists, create
    //                            the draft, sign it (signing sends it). One failure never stops the rest.
    //   date                  -> only the period ending that YYYY-MM-DD (default: all pending).
    static async fakturaSend(ymlFile, dry = true, date = '') {
        console.info(`[Didox.fakturaSend] 🟢 Starting...`);
        const online = dry === false;
        const settings = Didox.fakturaSettings();
        const yamlData = Yamls.loadYamlWithDeps(ymlFile);
        const folderALL = path.dirname(ymlFile);

        const entries = Didox.fakturaEntries(yamlData, date);
        switch (entries.length) {
            case 0:
                console.warn(`[Didox.fakturaSend] nothing pending in FakturaSend: ${ymlFile}`);
                return [];
        }

        const folderContract = path.join(folderALL, 'Contract');
        const contract = Didox.fakturaContract(folderContract, yamlData);
        switch (contract) {
            case null:
                throw new Error(`Didox contract folder "<No> от DD.MM.YYYY" not found in ${folderContract} (or fill ContractNumber)`);
        }

        const sellerTin = String(yamlData.MyINN ?? '').trim();
        const buyerTin = String(yamlData.ComINN ?? '').trim();
        const absent = [['MyINN', sellerTin], ['ComINN', buyerTin]].filter(([, value]) => value === '');
        switch (absent.length) {
            case 0:
                break;
            default:
                throw new Error(`Missing ${absent.map(([key]) => key).join(', ')} in ${ymlFile}`);
        }

        switch (online) {
            case true:
                await Didox.authToken(sellerTin, settings.locale);
                break;
        }

        const sellerCache = path.join(String(Yamls.getConfig('Cache.Directory', null, 'c:\\Cache') ?? 'c:\\Cache'), 'Didox', `INN Didox ${sellerTin}.json`);
        const buyerCache = path.join(folderALL, 'RestAPI', `INN Didox ${buyerTin}.json`);
        const seller = Didox.fakturaParty(await Didox.partyInfo(sellerTin, sellerCache, online), {
            account: yamlData.MyRS,
            bankId: yamlData.MyMFO,
        });
        const buyer = Didox.fakturaParty(await Didox.partyInfo(buyerTin, buyerCache, online), {
            name: yamlData.ComNameShort,
            account: yamlData.ComRS,
            bankId: yamlData.ComMFO,
            vatRegCode: yamlData.ComVATRegCode,
            vatRegStatus: yamlData.ComVATRegStatus,
            address: yamlData.ComAddress,
        });

        let pack = { code: settings.packageCode, name: settings.packageName };
        switch (online) {
            case true:
                pack = settings.packageCode === ''
                    ? await Didox.productPackage(sellerTin, settings.catalogCode, settings.packageName, settings.locale)
                    : pack;
                break;
        }

        const unresolved = [
            ...Object.entries({ seller, buyer }).flatMap(([side, party]) =>
                ['Name', 'Address', 'Account', 'BankId', 'Director'].filter((key) => party[key] === '').map((key) => `${side}.${key}`)
            ),
            ...(pack.code === '' ? ['PackageCode (resolved from Didox at send time)'] : []),
        ];
        unresolved.forEach((field) => console.warn(`[Didox.fakturaSend] unresolved: ${field}`));

        const results = [];
        for (const entry of entries) {
            const number = Didox.fakturaNumber(settings.numberFormat, contract.no, entry.date);
            const name = Didox.fakturaName(settings.productName, entry.start, entry.date);
            const payload = Didox.fakturaPayload({
                number,
                date: entry.date,
                contractNo: contract.no,
                contractDate: contract.date,
                sellerTin,
                seller,
                buyerTin,
                buyer,
                name,
                amount: entry.amount,
                catalogCode: settings.catalogCode,
                catalogName: settings.catalogName,
                packageCode: pack.code,
                packageName: pack.name,
                origin: settings.origin,
                releasedPinfl: String(yamlData.MyPINFL ?? '').trim(),
            });
            const result = { number, date: entry.date, amount: entry.amount, name, sent: false };

            switch (online) {
                case false:
                    results.push({ ...result, dry: true, unresolved, payload });
                    continue;
            }

            try {
                const exists = await Didox.documentExists(number, settings.docType);
                switch (exists) {
                    case true:
                        results.push({ ...result, skipped: 'already exists in Didox' });
                        continue;
                }
                const created = await Didox.documentCreate(settings.docType, payload, settings.locale);
                result.id = created?._id;
                switch (Boolean(result.id)) {
                    case false:
                        throw new Error(`create returned no _id: ${JSON.stringify(created)}`);
                }
                result.sent = await Didox.documentSign(result.id, sellerTin);
            } catch (error) {
                console.error(`[Didox.fakturaSend] ❌ ${number}: ${error.message}`);
                result.error = error.message;
            }
            results.push(result);
        }

        console.log(`[Didox.fakturaSend] ${online ? 'sent' : 'dry-run'}:`, results.map((r) => `${r.number} ${r.date} ${r.amount}`).join(' | '));
        return results;
    }

    // fakturaSend for every .contract found under an ALL index file/folder (batch menu).
    static async fakturaSendAll(all, dry = true, date = '') {
        console.info(`[Didox.fakturaSendAll] 🟢 Starting...`);
        const results = [];
        for (const ymlFile of Files.findAllContractFiles(all)) {
            results.push({ ymlFile, results: await Didox.fakturaSend(ymlFile, dry, date) });
        }
        return results;
    }

    static async carInfoByPinfl(tin) {
    console.info(`[Didox.carInfoByPinfl] 🟢 Starting...`);

        const tinStr = String(tin ?? '').trim();
        if (!tinStr) return null;

        let prefix;

        // if string len of tin more than 9
        prefix = 'CAR Didox ';

        const file = path.join(globalThis.folderRestAPI, prefix + tinStr + '.json');
        const baseURL = didoxBaseURL();
        const maxAgeDays = Yamls.getCacheMaxAgeDays();
        const cached = Files.readJsonCache(file);

        let returns;

        if (Files.isCacheFresh(file, maxAgeDays)) {
            console.log(`carInfoByPinfl cache is fresh, using ${file}`);
            returns = cached;
        } else {
            console.log(`carInfoByPinfl cache missing or expired (${maxAgeDays} day(s)), fetching ${tinStr}`);

            const myHeaders = resolveDidoxHeaders('carInfoByPinfl');

            if (!myHeaders) {
                returns = cached;
            } else {
                const requestOptions = {
                    method: "GET",
                    headers: myHeaders,
                    redirect: "follow"
                };

                try {
                    console.warn(`Fetching carInfoByPinfl for ${tinStr}`);

                    const response = await fetch(`${baseURL}/v1/utils/waybills/transport?tinOrPinfl=${encodeURIComponent(tinStr)}`, requestOptions);

                    if (response.ok) {
                        const result = await response.json();

                        switch (true) {
                            case Files.saveJsonCache(file, result): {
                                console.log(`carInfoByPinfl saved to ${file}`);
                                returns = result;
                                break;
                            }
                            default: {
                                // Empty/invalid answer — the existing cache file is left untouched.
                                returns = cached;
                                console.error(`carInfoByPinfl for ${tinStr}: fetched JSON carries no data, old cache kept`);
                                Dialogs.messageBox(`carInfoByPinfl for ${tinStr}: bo'sh javob keldi, eski kesh ishlatilmoqda`, 'Warning');
                                break;
                            }
                        }
                    } else {
                        returns = cached;
                        switch (response.status) {
                            case 401: {
                                console.error(`Error carInfoByPinfl for ${tinStr}: 401 ${response.statusText} (invalid or expired didox.user_key / didox.partner_key in keys.yml)`);
                                Dialogs.messageBox(`Error carInfoByPinfl for ${tinStr}: 401 ${response.statusText} — didox.user_key eskirgan yoki noto'g'ri (keys.yml ni yangilang)`, 'Error');
                                break;
                            }
                            default: {
                                console.error(`Error carInfoByPinfl for ${tinStr}: ${response.status}, ${response.statusText}`);
                                Dialogs.messageBox(`Error carInfoByPinfl for ${tinStr}: ${response.status} ${response.statusText}`, 'Error');
                                break;
                            }
                        }

                    }


                } catch (error) {
                    console.error(`Error carInfoByPinfl for ${tinStr}`, error);
                    Dialogs.messageBox(`Error carInfoByPinfl for ${tinStr}: ${error.message}`, 'Error', 16);
                    returns = cached;
                }
            }

        }

        return returns;

    }




}
