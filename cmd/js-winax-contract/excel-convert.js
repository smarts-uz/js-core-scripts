
import path from 'path';
import fs   from 'fs';

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';

import { Excels }  from './utils/Excels.js';
import { Dialogs } from './utils/Dialogs.js';
import { Dates }   from './utils/Dates.js';
import { Yamls }   from './utils/Yamls.js';



// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log('1️⃣  excel-convert: start');

    const argv = yargs(hideBin(process.argv))
        .usage('Usage: node excel-convert.js --input <file.xltx> [--output <file.xlsx>]')
        .option('input', {
            alias:       'i',
            describe:    'Path to the source .xltx template file',
            type:        'string',
            demandOption: true,
        })
        .option('output', {
            alias:       'o',
            describe:    'Path for the output .xlsx file (optional; defaults to same dir/name as input)',
            type:        'string',
        })
        .help()
        .parse();


    const inputPath = argv.input;

    if (!fs.existsSync(inputPath)) {
        Dialogs.warningBox(`Input file not found:\n${inputPath}`, 'excel-convert Error');
        process.exit(1);
    }

    try {
        let outputPath;

        if (argv.output) {
            outputPath = Excels.convertXltxToXlsx(inputPath, argv.output);
        } else {
            outputPath = Excels.convertXltxToXlsxAuto(inputPath);
        }

        console.log(`✅  Conversion complete → ${outputPath}`);

        // Move the original .xltx file to the '@' folder
        const sourceDir = path.dirname(inputPath);
        const atFolder = path.join(sourceDir, '@');
        
        if (!fs.existsSync(atFolder)) {
            fs.mkdirSync(atFolder, { recursive: true });
        }
        
        const backupXltxPath = path.join(atFolder, path.basename(inputPath));
        
        // Remove existing backup if any
        if (fs.existsSync(backupXltxPath)) {
            try { fs.unlinkSync(backupXltxPath); } catch (e) {}
        }
        
        // Move the file
        fs.renameSync(inputPath, backupXltxPath);
        console.log(`✅  Moved original .xltx to → ${backupXltxPath}`);

        Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout') ?? 3000));

    } catch (error) {
        console.error('❌  Conversion failed:', error.message);
        Dialogs.warningBox(error.message, 'excel-convert Error');
        Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError') ?? 30000));
        process.exit(1);
    }

    console.log('3️⃣  excel-convert: done');
}


main();
