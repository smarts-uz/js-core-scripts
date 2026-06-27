// add functikon infoByTinPinfl

import banks from "../data/banks.json" with { type: "json" };
import districts from "../data/districts.json" with { type: "json" };
import regions from "../data/regions.json" with { type: "json" };

import fs from "fs";
import path from "path";
import { ofetch } from "ofetch";
import { Files } from './Files.js';
import { Dialogs } from "./Dialogs.js";
import { Yamls } from "./Yamls.js";
import { Secrets } from "./Secrets.js";

// Shared client for the Didox Partner API: one place for the base URL and the
// auth headers that every reference-data call below previously rebuilt by hand
// (a `new Headers()` + two appends + a requestOptions object, repeated ~15x).
const didoxApi = ofetch.create({
    baseURL: Secrets.env("DIDOX_BASE_URL") ?? "https://api-partners.didox.uz",
    headers: {
        "user-key": Secrets.env("DIDOX_USER_KEY") ?? "",
        "Partner-Authorization": Secrets.env("DIDOX_PARTNER_AUTHORIZATION") ?? "",
    },
});


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
            body: { password: Secrets.env("DIDOX_LOGIN_PASSWORD") ?? "" },
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

        let bearer = Secrets.get('Ijara', owner);
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

        if (!tin) return null;

        let prefix;

        // if string len of tin more than 9
        if (tin.length > 9) {
            prefix = 'PINFL Didox ';
        } else {
            prefix = 'INN Didox ';
        }

        const file = path.join(globalThis.folderRestAPI, prefix + tin + '.json');
        const baseURL = Secrets.get('Didox.BaseURL');
        let returns;

        if (fs.existsSync(file)) {
            console.log(`infoByTinPinfl already exists in ${file}`);
            returns = Files.readJson(file);
        } else {
            console.log(`infoByTinPinfl not exists in ${file}`);

            const myHeaders = new Headers();
            myHeaders.append("Partner-Authorization", Secrets.get('Didox', 'SRental'));

            const requestOptions = {
                method: "GET",
                headers: myHeaders,
                redirect: "follow"
            };

            try {
                console.warn(`Fetching infoByTinPinfl for ${tin}`);

                const response = await fetch(`https://${baseURL}/v1/utils/info/${tin}`, requestOptions);

                if (response.ok) {
                    const result = await response.json();

                    Files.writeJson(file, result);
                    console.log(`infoByTinPinfl saved to ${file}`);
                    returns = result;
                } else {
                    returns = null
                    console.error(`Error infoByTinPinfl for ${tin}: ${response.status}, ${response.statusText}`);
                    Dialogs.messageBox(`Error infoByTinPinfl for ${tin}`, 'Error');
                }


            } catch (error) {
                console.error(`Error infoByTinPinfl for ${tin}`, error);
                Dialogs.messageBox(`Error infoByTinPinfl for ${tin}`, 'Error', 16);
                returns = null
            }

        }

        console.info(returns, 'returns infoByTinPinfl');
        if (!returns) return null;

        let person
        if (returns.personalNum) {
            person = path.join(personFolder, returns.name);

            Files.mkdirIfNotExists(person);
            Files.saveInfoToFile(person, returns.address);
            Files.saveInfoToFile(person, returns.personalNum);
            Files.saveInfoToFile(person, returns.tin);

            //    await this.carInfoByPinfl(tin)

        } else {


            switch (true) {
                case returns.address.includes('Anorzor'):
                    returns.AddressType = 'Anorzor';
                    break;
                case returns.address.includes('Adolat MFY'):
                    returns.AddressType = 'Adolat';
                    break;

                default:
                    returns.AddressType = 'Others';
                    break;
            }

        }

        return returns;

    }


    static async carInfoByPinfl(tin) {
    console.info(`[Didox.carInfoByPinfl] 🟢 Starting...`);

        if (!tin) return null;

        let prefix;

        // if string len of tin more than 9
        prefix = 'CAR Didox ';

        const file = path.join(globalThis.folderRestAPI, prefix + tin + '.json');
        const baseURL = Secrets.get('Didox.BaseURL');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`infoByTinPinfl already exists in ${file}`);
            returns = Files.readJson(file);
        } else {
            console.log(`infoByTinPinfl not exists in ${file}`);

            const myHeaders = new Headers();

            myHeaders.append("user-key", Secrets.env("DIDOX_USER_KEY"));
            myHeaders.append("Partner-Authorization", Secrets.env("DIDOX_PARTNER_AUTHORIZATION"));

            const requestOptions = {
                method: "GET",
                headers: myHeaders,
                redirect: "follow"
            };

            try {
                console.warn(`Fetching carInfoByPinfl for ${tin}`);

                const response = await fetch(`https://${baseURL}/v1/utils/waybills/transport?tinOrPinfl=${tin}`, requestOptions);

                if (response.ok) {
                    const result = await response.json();

                    // if result json is not empty
                    fs.writeFileSync(file, JSON.stringify(result, null, 2));
                    console.log(`infoByTinPinfl saved to ${file}`);

                    returns = result;
                } else {
                    returns = null
                    console.error(`Error carInfoByPinfl for ${tin}: ${response.status}, ${response.statusText}`);
                    Dialogs.messageBox(`Error carInfoByPinfl for ${tin}`, 'Error');

                }


            } catch (error) {
                console.error(`Error carInfoByPinfl for ${tin}`, error);
                returns = null
                Dialogs.messageBox(`Error carInfoByPinfl for ${tin}`, 'Error', 16);
            }

        }

        return returns;

    }




}
