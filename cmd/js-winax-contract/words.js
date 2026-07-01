import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { Word } from './utils/Word.js';
import { Files } from './utils/Files.js';
import { Dates } from './utils/Dates.js';
import { Dialogs } from './utils/Dialogs.js';
import { Yamls } from './utils/Yamls.js';


// Main async function (runs sequentially)
async function main() {
    console.log('1️⃣ Start');

    const argv = yargs(hideBin(process.argv))
        .option('yaml', {
            alias: 'y',
            type: 'string',
            describe: 'Path to YAML configuration file'
        })
        .option('open', {
            alias: 'o',
            type: 'boolean',
            default: false,
            describe: 'Open generated file after processing'
        })
        .option('all', {
            alias: 'a',
            type: 'string',
            describe: 'Path to ALL index YAML file for batch processing'
        })
        .help()
        .parse();



    let ymlFile = argv.yaml;
    console.log('ymlFile:', ymlFile)

    const open = argv.open;
    console.log('open:', open)

    let allFile = argv.all;
    console.log('allFile:', allFile)




    switch (true) {

        case !Files.isEmpty(allFile):
            console.warn('Processing all YAML files in the current directory...', 'allFile:', allFile);

            if (!fs.existsSync(allFile))
                Dialogs.warningBox(`ALL Index file not found: ${allFile}`, 'ALL Index File not found');
            else
                console.log(`ALL Index file found: ${allFile}`);

            const ymlFiles = Files.findAllContractFiles(allFile);

            console.log(`Found ${ymlFiles.length} contracts`);

            if (Yamls.getConfig('cmdline.TryCatch') === 'true') {
                try {

                    for (const ymlFile of ymlFiles) {
                        console.warn(`\n Processing Contract file: ${ymlFile} \n`);
                        await Yamls.fillYamlWithInfo(ymlFile, null, true, false);
                        Word.makeContract(ymlFile);
                    }
                    Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
                } catch (error) {
                    console.error('Error:', error);
                    Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError')));
                }
            }
            else {


                for (const ymlFile of ymlFiles) {
                    console.warn(`\n Processing Contract file: ${ymlFile} \n`);
                    await Yamls.fillYamlWithInfo(ymlFile, null, true, false);
                    Word.makeContract(ymlFile);
                }
                Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
            }


            break;


        case !Files.isEmpty(ymlFile):
            console.warn(`Processing YAML file: ${ymlFile}`);

            if (!fs.existsSync(ymlFile))
                Dialogs.warningBox(`YAML file not found: ${ymlFile}`, 'YAML File not found');
            else
                console.log(`YAML file found: ${ymlFile}`);

            if (Yamls.getConfig('cmdline.TryCatch') === 'true') {
                try {
                    await Yamls.fillYamlWithInfo(ymlFile, null, true, false);
                    Word.makeContract(ymlFile);
                    if (open) Files.openFile(outputPdfPath)

                    Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
                } catch (error) {
                    console.error('Error:', error);
                    Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError')));
                }
            }
            else {
                await Yamls.fillYamlWithInfo(ymlFile, null, true, false);
                Word.makeContract(ymlFile);
                if (open) Files.openFile(outputPdfPath)
                Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
            }
            break;

        default:
            console.warn('Where are CMD Args?');

            break;
    }


    console.log('3️⃣ Done');

}


main()





