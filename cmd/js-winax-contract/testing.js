

import { Files } from './utils/Files.js';
import { Yamls } from './utils/Yamls.js';
import fs from 'fs';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { MySoliq } from './utils/MySoliq.js';
import { Dialogs } from './utils/Dialogs.js';
import { Dates } from './utils/Dates.js';
import { IjaraSoliq, IjaraState, RentType } from './utils/IjaraSoliq.js';
import { KapitalBank } from './utils/KapitalBank.js';



// Main async function (runs sequentially)
async function main() {
    console.log('1️⃣ Start');


    const argv = yargs(hideBin(process.argv))
        .option('yaml', {
            alias: 'y',
            type: 'string',
            describe: 'Path to YAML configuration file'
        })
        .help()
        .parse();


    let ymlFile = argv.yaml;

   // Dialogs.errorBox('Error', 'Error');


    // //       // //     IjaraSoliq.testing()
    KapitalBank.testing()


}


main()

