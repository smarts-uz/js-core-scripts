// add functikon infoByTinPinfl

import fs from "fs";
import path from "path";
import { Files } from './Files.js';
import { Contracts } from './Contracts.js';
import { Dialogs } from "./Dialogs.js";
import { File } from "buffer";
import { Chromes } from "./Chromes.js";
import { Yamls } from "./Yamls.js";

export const RentType = {
    IN: 2,
    Out: 1,
}

export const KapitalState = {
    Conducted: 2,
    Delayed: -1,
    Entered: 1,
    InProgress: 3,
}


export class KapitalBank {



    static async testing() {
        console.log('testing');

        //      KapitalBank.payments(KapitalState.Conducted, 1, 10)
        KapitalBank.payments(KapitalState.Conducted, 1, 10)
    }



    static async payments(state, page = 1, size = 500) {

        console.log(page, 'page');
        console.log(size, 'size');

        const { kapitalSRental } = process.env;

        const bearer = kapitalSRental;
        console.log(bearer, 'bearer');

        const options = {
            method: "GET",
            redirect: "follow",
            headers: {
                "accept": "application/json, text/plain, */*",
                "accept-language": "en-US",
                "authorization": `Bearer ${bearer}`,
                "cache-control": "no-cache",
                "content-language": "en",
                "dnt": "1",
                "origin": "https://b2b.kapitalbank.uz",
                "pragma": "no-cache",
                "priority": "u=1, i",
                "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
                "x-api-version": "4.0",
                "x-device-info": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 a019e07bc150e3b0af4053203c8780df",
                "x-user-app": "name=Uzum Business;version=2.23.0",
                "x-user-os": "name=Windows;version=10",
            }
        };

        try {

            const url = `https://b2b-api.kapitalbank.uz/api/business/07209920/01158/paymentOrders/inBank?pageSize=${size}&pageNumber=${page}&state=${state}`;

            const body = await Chromes.fetch(url, options, 10 * 60 * 60, [
                'api/business',
                'paymentOrders/inBank',
            ])

            if (!body) {
                console.error('No body in response');
                return null
            }

            if (!body.result) {
                console.error('No result in response');
            }

            if (body.result.totalCount === 0) {
                console.error('No Items in result');
            }

            console.log(body.result.totalCount, 'totalCount');
            console.log(body.result.totalPages, 'totalPages');

            //   const itemsArr = body.result.items.map(item => Object.values(item));
            const itemsArr = Array.from(body.result.items);
            console.log('itemsArr: ', itemsArr);

            return itemsArr;
        } catch (error) {
            console.error('Error fetching payments:', error);
            throw error;
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








    static async entrepreneurInfo(pinfl, passportSeries, passportNumber) {

        console.log(pinfl, passportSeries, passportNumber, 'entrepreneurInfo');

        if (!pinfl) {
            Dialogs.warningBox('No pinfl', 'Warning');
            console.error('No pinfl');
            return null;
        }

        if (!passportSeries) {
            Dialogs.warningBox('No passportSeries', 'Warning');
            console.error('No passportSeries');
            return null;
        }

        if (!passportNumber) {
            Dialogs.warningBox('No passportNumber', 'Warning');
            console.error('No passportNumber');
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


