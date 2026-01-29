// add functikon infoByTinPinfl

import fs from "fs";
import path from "path";
import { Files } from './Files.js';
import { Contracts } from './Contracts.js';
import { Dialogs } from "./Dialogs.js";
import { File } from "buffer";
import { Yamls } from "./Yamls.js";

export class MySoliq {




    static async entrepreneurInfoAPI(pinfl, passportSeries, passportNumber) {

        const myHeaders = new Headers();

        myHeaders.append("X-API-KEY", Yamls.getConfig('My3Api.SRental'));

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        try {

            console.warn(`Fetching entrepreneurInfoAPI for ${pinfl}`);

            const url = `https://My3.soliq.uz/api/remote-access-api/entrepreneur/info/${pinfl}?passportSeries=${passportSeries}&passportNumber=${passportNumber}`;

            console.log('url', url);

            const response = await fetch(url, requestOptions)

            if (response.ok) {
                const result = await response.json();
                // 

                return result;

            } else {
                console.warn(`Warning entrepreneurInfoAPI for ${pinfl}: ${response.status}, ${response.statusText}`);
                Dialogs.messageBoxAx(`Warning entrepreneurInfoAPI for ${pinfl}: ${response.status}, ${response.statusText}`, 'Warning');
                return null;
            }


        } catch (error) {
            console.error(`Error entrepreneurInfoAPI for ${pinfl}`, error);
            Dialogs.messageBoxAx(`Error entrepreneurInfoAPI for ${pinfl}`, 'Error');
            return null;
        }







    }








    static async entrepreneurInfo(pinfl, passportSeries, passportNumber) {

        console.log(pinfl, passportSeries, passportNumber, 'entrepreneurInfo');

        if (!pinfl)
            return Dialogs.warningBox('No pinfl', 'Warning');

        if (!passportSeries)
            return Dialogs.warningBox('No passportSeries', 'Warning');

        if (!passportNumber)
            return Dialogs.warningBox('No passportNumber', 'Warning');

        const file = path.join(globalThis.folderRestAPI, 'PINFL Soliq ' + pinfl + '.json');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`entrepreneurInfo already exists in ${file}`);
            returns = Files.readJson(file);
        } else {

            returns = await MySoliq.entrepreneurInfoAPI(pinfl, passportSeries, passportNumber);

            if (returns) {
                Files.writeJson(file, returns);
                console.log(`Info saved to ${file}`);
            }

        }


        console.log(returns, 'returns entrepreneurInfoAPI');
        if (!returns) return null;

        Files.saveInfoToFile(globalThis.folderCompan, 'RegDate ' + returns.registrationDate);

        if (returns.suspensionDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'SuspDate ' + returns.suspensionDate);

        if (returns.liquidationDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'LiquiDate ' + returns.liquidationDate);


        if (returns.vatNumber)
            Files.saveInfoToFile(globalThis.folderCompan, 'VatNumber ' + returns.vatNumber);

        return returns;

    }




    static async vatInfoAPI(tin) {
        const myHeaders = new Headers();

        const { My3SRental } = process.env;

        myHeaders.append("referer", "https://My3.soliq.uz/vat-payer-registration/vat-payers");
        myHeaders.append("user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36");

        myHeaders.append("Authorization", `Bearer ${My3SRental}`);

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        try {

            console.warn(`Fetching vatInfo for ${tin}`);

            const url = `https://My3.soliq.uz/api/nds-api/api/certificate/grid?search=${tin}&page=1`;
            console.log('url', url);

            const response = await fetch(url, requestOptions);

            if (response.ok) {
                const result = await response.json();


                // count json count
                console.info(`Count: ${result.recordsTotal}`);

                if (result.recordsTotal === 0) {
                    console.warn(`Warning vatInfo for ${tin}: No data found`);
                }

                return result.data;

            } else {
                console.error(`Error vatInfo for ${tin}: ${response.status}, ${response.statusText}`);
                Dialogs.messageBoxAx(`Error vatInfo for ${tin}: ${response.status}, ${response.statusText}`, 'Error');
                return null;
            }


        } catch (error) {
            console.error(`Error vatInfo for ${tin}`, error);
            Dialogs.messageBoxAx(`Error vatInfo for ${tin}`, 'Error');
            return null;
        }
    }


    static async companyInfoAPI(tin) {

        const myHeaders = new Headers();

        myHeaders.append("X-API-KEY", Yamls.getConfig('My3Api.SRental'));

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        try {

            console.warn(`Fetching сompanyInfo for ${tin}`);

            const url = `https://My3.soliq.uz/api/remote-access-api/company/info/${tin}?type=full`;
            console.log('url', url);

            const response = await fetch(url, requestOptions);

            if (response.ok) {
                const result = await response.json();
                // 


                return result;

            } else {
                console.warn(`Warning companyInfoAPI for ${tin}: ${response.status}, ${response.statusText}`);
                Dialogs.messageBoxAx(`Warning companyInfoAPI for ${tin}: ${response.status}, ${response.statusText}`, 'Warning');
                return null;
            }


        } catch (error) {
            console.error(`Error companyInfoAPI for ${tin}`, error);
            Dialogs.messageBoxAx(`Error companyInfoAPI for ${tin}`, 'Error');
            return null;
        }



    }


    static async entrepreneurInfoAPI(pinfl, passportSeries, passportNumber) {

        const myHeaders = new Headers();

        myHeaders.append("X-API-KEY", Yamls.getConfig('My3Api.SRental'));

        const requestOptions = {
            method: "GET",
            headers: myHeaders,
            redirect: "follow"
        };

        try {

            console.warn(`Fetching entrepreneurInfoAPI for ${pinfl}`);

            const url = `https://My3.soliq.uz/api/remote-access-api/entrepreneur/info/${pinfl}?passportSeries=${passportSeries}&passportNumber=${passportNumber}`;

            console.log('url', url);

            const response = await fetch(url, requestOptions)

            if (response.ok) {
                const result = await response.json();
                // 

                return result;

            } else {
                console.warn(`Warning entrepreneurInfoAPI for ${pinfl}: ${response.status}, ${response.statusText}`);
                Dialogs.messageBoxAx(`Warning entrepreneurInfoAPI for ${pinfl}: ${response.status}, ${response.statusText}`, 'Warning');
                return null;
            }


        } catch (error) {
            console.error(`Error entrepreneurInfoAPI for ${pinfl}`, error);
            Dialogs.messageBoxAx(`Error entrepreneurInfoAPI for ${pinfl}`, 'Error');
            return null;
        }







    }

    static async vatInfo(tin) {

        const file = path.join(globalThis.folderRestAPI, 'INN VAT ' + tin + '.json');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`vatInfo already exists in ${file}`);
            returns = Files.readJson(file);
        } else {

            returns = await MySoliq.vatInfoAPI(tin);

            if (returns) {
                Files.writeJson(file, returns);
                console.log(`Info saved to ${file}`);
            }

        }

        console.log(returns, 'returns vatInfo');

        if (returns) {

            returns = returns[0] ?? null
            console.log(returns, 'returns IN vatInfo');
            if (returns) {

                Files.saveInfoToFile(globalThis.folderForNDS, Contracts.cleanCompanyName(returns.companyName));
                Files.saveInfoToFile(globalThis.folderForNDS, returns.address);
                Files.saveInfoToFile(globalThis.folderForNDS, String(returns.id));
                Files.saveInfoToFile(globalThis.folderForNDS, returns.stateNameLat);
                Files.saveInfoToFile(globalThis.folderForNDS, returns.directorFioUz);
                Files.saveInfoToFile(globalThis.folderForNDS, returns.dateReg);

            }
        }

        return returns;


    }



    static async companyInfo(tin) {

        const file = path.join(globalThis.folderRestAPI, 'INN Soliq ' + tin + '.json');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`companyInfo already exists in ${file}`);
            returns = Files.readJson(file);
        } else {

            returns = await MySoliq.companyInfoAPI(tin);

            if (returns) {
                Files.writeJson(file, returns);
                console.log(`Info saved to ${file}`);
            }

        }


        console.log(returns, 'returns сompanyInfo');
        if (!returns) return null;

        Files.saveInfoToFile(globalThis.folderCompan, returns.company.statusType);

        if (returns.company.statusType === 'CASHED_OUT') {
            returns.IsScammer = 'Да'
            Files.saveInfoToFile(globalThis.folderALL, '#Scam');
            Dialogs.messageBox(`${returns.company.name} is a scammer!`);
        } else
            returns.IsScammer = 'Нет'

        Files.saveInfoToFile(globalThis.folderCompan, 'RegDate ' + returns.company.registrationDate);

        if (returns.company.reregistrationDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'ReRegDate ' + returns.company.reregistrationDate);

        if (returns.company.liquidationDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'LiquiDate ' + returns.company.liquidationDate);

        if (returns.company.vatNumber)
            Files.saveInfoToFile(globalThis.folderCompan, 'VatNumber ' + returns.company.vatNumber);

        return returns;


    }


    static async entrepreneurInfo(pinfl, passportSeries, passportNumber) {

        console.log(pinfl, passportSeries, passportNumber, 'entrepreneurInfo');

        if (!pinfl) {
            Dialogs.warningBox('No pinfl', 'Warning');
            return null;
        }

        if (!passportSeries) {
            Dialogs.warningBox('No passportSeries', 'Warning');
            return null;
        }

        if (!passportNumber) {
            Dialogs.warningBox('No passportNumber', 'Warning');
            return null;
        }

        const file = path.join(globalThis.folderRestAPI, 'PINFL Soliq ' + pinfl + '.json');

        let returns;

        if (fs.existsSync(file)) {
            console.log(`entrepreneurInfo already exists in ${file}`);
            returns = Files.readJson(file);
        } else {

            returns = await MySoliq.entrepreneurInfoAPI(pinfl, passportSeries, passportNumber);

            if (returns) {
                Files.writeJson(file, returns);
                console.log(`Info saved to ${file}`);
            }

        }


        console.log(returns, 'returns entrepreneurInfoAPI');
        if (!returns) return null;

        Files.saveInfoToFile(globalThis.folderCompan, 'RegDate ' + returns.registrationDate);

        if (returns.suspensionDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'SuspDate ' + returns.suspensionDate);

        if (returns.liquidationDate)
            Files.saveInfoToFile(globalThis.folderCompan, 'LiquiDate ' + returns.liquidationDate);


        if (returns.vatNumber)
            Files.saveInfoToFile(globalThis.folderCompan, 'VatNumber ' + returns.vatNumber);

        return returns;


    }





}


