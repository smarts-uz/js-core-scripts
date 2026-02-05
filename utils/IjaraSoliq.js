// add functikon infoByTinPinfl

import fs from "fs";
import path from "path";
import { Files } from './Files.js';
import { Contracts } from './Contracts.js';
import { Dialogs } from "./Dialogs.js";
import { File } from "buffer";
import { Chromes } from "./Chromes.js";
import { Owner, Yamls } from "./Yamls.js";

export const RentType = {
    IN: 2,
    Out: 1,
}

export const IjaraState = {
    Confirmed: 20,
    Outdated: 50,
    Rejected: 15,
    Waiting: 10,
}



export class IjaraSoliq {

    static async testing() {
        console.log('testing');

        //   IjaraSoliq.contracts(RentType.IN, IjaraState.Confirmed, Owner.SRental)
        IjaraSoliq.contracts(Owner.SRental, RentType.IN, IjaraState.Confirmed)

        // IjaraSoliq.download(Owner.SRental, 3617512, '09.01.2026', '31.12.2028')

        // 3617512 / 09.01.2026 / 31.12.2028 ? tin = 30707906750015

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

            const body = await Chromes.fetcher(url, options, Chromes.Duration.Min5, [
                'api/rent/client/contract/get-list/by-params',
            ], owner)

            if (!body) return Dialogs.warningBox('No body in response', 'Warning');

            return body;
        } catch (error) {
            return Dialogs.errorBox(error.message, 'Error fetching contracts');
        }

    }

    static async download(owner, docId, startDate, endDate) {

        console.log(owner, 'owner');
        if (!owner) return Dialogs.warningBox('No owner', 'Warning');

        console.log(docId, 'docId');
        if (!docId) return Dialogs.warningBox('No docId', 'Warning');

        console.log(startDate, 'startDate');
        if (!startDate) return Dialogs.warningBox('No startDate', 'Warning');

        console.log(endDate, 'endDate');
        if (!endDate) return Dialogs.warningBox('No endDate', 'Warning');

        const options = {
            method: "GET",
            redirect: "follow"
        };

        try {
            const url = `https://ijara.soliq.uz/api/rent/client/file/download-file/${docId}/${startDate}/${endDate}`;
            console.log(url, 'url');

            const response = await fetch(url, options);

            if (!response.ok)
                return Dialogs.warningBox(response.statusText, 'Failed to download file', 'Warning');

            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);

            if (buffer.length === 0)
                return Dialogs.warningBox('Downloaded file is empty', 'Warning');

            const pdfFolder = path.join(Yamls.getConfig('Cache.Directory'), 'ijara.soliq.uz PDF', tin);
            Files.mkdirIfNotExists(pdfFolder);

            const fileName = `${docId}  ${startDate}  ${endDate}.pdf`;
            const filePath = path.join(pdfFolder, fileName);

            fs.writeFileSync(filePath, buffer);
            console.log('File saved successfully:', filePath);

            return filePath;
        } catch (error) {
            console.error('Error fetching contracts:', error);
            throw error;
        }

    }




}


