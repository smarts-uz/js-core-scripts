// add functikon infoByTinPinfl

import banks from "../data/banks.json" with { type: "json" };
import districts from "../data/districts.json" with { type: "json" };
import regions from "../data/regions.json" with { type: "json" };

import fs from "fs";
import path from "path";
import { Files } from './Files.js';
import { Dialogs } from "./Dialogs.js";
import { Yamls } from "./Yamls.js";


export class Didox {



    static saveMeasures() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/measures/all", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }


    static getRegionInfo() {


        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/utils/waybills/districts?regionId=6", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveDistricts() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/districts/all", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static saveRegions() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/regions/all", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static saveBanks() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/banks/all", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }
    static saveRegionsTTN() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/utils/waybills/regions", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static saveRailwayStations() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/utils/stations", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static fraudsByTin(tin) {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/utils/non-conformity-goods-companies/ru?tin=311506035", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static frauds() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/utils/non-conformity-goods-companies/ru?page=1&size=100&tin", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }

    static profileIKPUCodes() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Accept-Language", "ru");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/profile/productClassCodes/ru?page=&size=&search=", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }


    static documentList() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Accept-Language", "ru");
        myHeaders.append("Content-Type", "application/json");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v2/documents?page=1&size=100&doctype=000,010&partner=312261753&owner=1", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static documentPDF(docId) {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch(`https://api-partners.didox.uz/v1/documents/view/${docId}/pdf/ru`, requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static searchIKPUCode(text) {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Accept-Language", "ru");
        myHeaders.append("Content-Type", "application/json");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/profile/productClasses/search?text=Лапша&lang=uz", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }



    static profileInfo() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Accept-Language", "ru");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/profile/", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static vatRegStatus(tin, date) {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Accept-Language", "ru");
        myHeaders.append("Content-Type", "application/json");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/profile/vatRegStatus/312261753?document_date=13.01.2024", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));

    }

    static getTaxpayerType() {
        const myHeaders = new Headers();
        myHeaders.append("user-key", "d8cb70db-5e17-4b57-80dc-2786ff800372");
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Accept-Language", "ru");
        myHeaders.append("Content-Type", "application/json");

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/profile/taxpayerType/312261753/uz?date=", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }


    static login() {
        const myHeaders = new Headers();
        myHeaders.append("Partner-Authorization", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjMzLCJzdGF0dXMiOiJBQ1RJVkUiLCJuYW1lIjoiXCJLQU5TTEVSXCIgTUNISiIsInJvbGUiOiJQQVJUTkVSIiwidGluIjoiMzA0MTQ0OTI1IiwiaWF0IjoxNzYwNTE4ODY3fQ.nXUUDDyUGIXwSlsK9aV3fkLMAnaBYYS71VMNKiM-bCw");
        myHeaders.append("Content-Type", "application/json");
        myHeaders.append("Accept-Language", "ru");

        const raw = JSON.stringify({
            "password": "4beruniave"
        });

        const requestOptions = {
            method: "POST",
            headers: myHeaders,
            body: raw,
            redirect: "follow"
        };

        fetch("https://api-partners.didox.uz/v1/auth/311958304/password/ru", requestOptions)
            .then((response) => response.text())
            .then((result) => console.log(result))
            .catch((error) => console.error(error));
    }
    static bankByCode(code) {
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

        console.log(owner, 'owner');
        if (!owner) return Dialogs.warningBox('No owner', 'Warning');

        console.log(rentType, 'rentType');
        if (!rentType) return Dialogs.warningBox('No rentType', 'Warning');

        console.log(state, 'state');
        if (!state) return Dialogs.warningBox('No state', 'Warning');

        let bearer = Yamls.getConfig('Ijara.' + owner);
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
            return Dialogs.errorBox(error.message, 'Error fetching contracts');
        }

    }

    static async infoByTinPinfl(tin, personFolder = globalThis.folderDirector) {

        if (!tin) return null;

        let prefix;

        // if string len of tin more than 9
        if (tin.length > 9) {
            prefix = 'PINFL Didox ';
        } else {
            prefix = 'INN Didox ';
        }

        const file = path.join(globalThis.folderRestAPI, prefix + tin + '.json');
        const baseURL = Yamls.getConfig('Didox.BaseURL');
        let returns;

        if (fs.existsSync(file)) {
            console.log(`infoByTinPinfl already exists in ${file}`);
            returns = Files.readJson(file);
        } else {
            console.log(`infoByTinPinfl not exists in ${file}`);

            const myHeaders = new Headers();
            myHeaders.append("Partner-Authorization", Yamls.getConfig('Didox.SRental'));

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
                    Dialogs.messageBoxAx(`Error infoByTinPinfl for ${tin}`, 'Error', 16);
                }


            } catch (error) {
                console.error(`Error infoByTinPinfl for ${tin}`, error);
                Dialogs.messageBoxAx(`Error infoByTinPinfl for ${tin}`, 'Error', 16);
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

        if (!tin) return null;

        let prefix;

        // if string len of tin more than 9
        prefix = 'CAR Didox ';

        const file = path.join(globalThis.folderRestAPI, prefix + tin + '.json');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`infoByTinPinfl already exists in ${file}`);
            returns = Files.readJson(file);
        } else {
            console.log(`infoByTinPinfl not exists in ${file}`);

            const myHeaders = new Headers();

            const { PARTNER_AUTHORIZATION, USER_KEY, baseURL } = process.env;

            myHeaders.append("user-key", USER_KEY);
            myHeaders.append("Partner-Authorization", PARTNER_AUTHORIZATION);

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
                    Dialogs.messageBoxAx(`Error carInfoByPinfl for ${tin}`, 'Error', 16);

                }


            } catch (error) {
                console.error(`Error carInfoByPinfl for ${tin}`, error);
                returns = null
                Dialogs.messageBoxAx(`Error carInfoByPinfl for ${tin}`, 'Error', 16);
            }

        }

        return returns;

    }




}
