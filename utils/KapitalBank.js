// add functikon infoByTinPinfl

import fs from "fs";
import path from "path";
import { Files } from './Files.js';

import { Dialogs } from "./Dialogs.js";
import { File } from "buffer";
import { Chromes } from "./Chromes.js";
import { Yamls } from "./Yamls.js";
import { IjaraSoliq } from "./IjaraSoliq.js";



export class KapitalBank {


    static KapitalState = {
        Conducted: 2,
        Delayed: -1,
        Entered: 1,
        InProgress: 3,
    }

    static async testing() {
        console.log('testing');

        //      KapitalBank.payments(KapitalState.Conducted, 1, 10)
        KapitalBank.payments(IjaraSoliq.Owner.SRental, 1, 100)
    }


    static async payments(owner = IjaraSoliq.Owner.SRental, page = 1, size = 1000, state = this.KapitalState.Conducted) {

        console.log(owner, 'owner');
        if (!owner) return Dialogs.warningBox('No owner', 'Warning');
        
        console.log(page, 'page');
        if (!page) return Dialogs.warningBox('No page', 'Warning');

        console.log(size, 'size');
        if (!size) return Dialogs.warningBox('No size', 'Warning');

        let bearer = Yamls.getConfig('Kapital.' + owner);
        if (!bearer) return Dialogs.warningBox('No bearer', 'Warning');

        let kapitalId = Yamls.getConfig('KapitalId.' + owner, 'string', '');
        if (!kapitalId) return Dialogs.warningBox('No kapitalId', 'Warning');


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
            }
        };


        try {


            // https://b2b-api.kapitalbank.uz/api/business/07209920/01158/paymentOrders/inBank?pageSize=10&pageNumber=1

            // https://b2b-api.kapitalbank.uz/api/business/07209920/01158/paymentOrders/inBank?pageSize=500&pageNumber=1&state=2"
            const url = `https://b2b-api.kapitalbank.uz/api/business/${kapitalId}/01158/paymentOrders/inBank?pageSize=${size}&pageNumber=${page}&state=${state}`;

            const body = await Chromes.fetcher(url, options, owner, Chromes.Duration.Sec1, [
                'api/business',
                'paymentOrders/inBank',
            ])

            if (!body) return Dialogs.warningBox('No body in response', 'Warning');

            if (!body.result) return Dialogs.warningBox('No result in response', 'Warning');

            if (body.result.totalCount === 0) return Dialogs.warningBox('No Items in result', 'Warning');

            console.log(body.result.totalCount, 'totalCount');
            console.log(body.result.totalPages, 'totalPages');

            //   const itemsArr = body.result.items.map(item => Object.values(item));
            const itemsArr = Array.from(body.result.items);
        //    console.log('itemsArr: ', itemsArr);

            return itemsArr;


        } catch (error) {
            return Dialogs.errorBox(error, 'Error fetching contracts');
        }

    }









}


