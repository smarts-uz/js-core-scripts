// AUTO-GENERATED self-contained runner — Excels.contractConvert.
// Feature: Excel Contract Convert (.xltx→.xlsx); calls Excels.convertXltxToXlsx(Auto).
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('yargs');
const { hideBin } = await import('yargs/helpers');
const yargs = yargsMod.default;
const { Excels } = await import('../../utils/Excels.js');
const { Yamls } = await import('../../utils/Yamls.js');
const { Dates } = await import('../../utils/Dates.js');
const { Dialogs } = await import('../../utils/Dialogs.js');

async function main() {
    console.log('1️⃣ Excels contractConvert Start');
    const argv = yargs(hideBin(process.argv))
        .option('input', { alias: 'i', demandOption: true, describe: '.xltx template' })
        .option('output', { alias: 'o', describe: '.xlsx output (optional)' })
        .help().parse();

    const input = argv.input;
    const output = argv.output;
    console.log('input:', input, '| output:', output);

    const run = () => {
        if (output) Excels.convertXltxToXlsx(input, output);
        else Excels.convertXltxToXlsxAuto(input);
    };

    if (Yamls.getConfig('CmdLine.TryCatch') === 'true') {
        try { run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout'))); }
        catch (error) { console.error('❌ Error:', error); Dialogs.warningBox(String(error && error.message || error), 'Excels contractConvert Error'); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError'))); }
    } else {
        run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
    }

    console.log('3️⃣ Excels contractConvert Done');
}

main();
