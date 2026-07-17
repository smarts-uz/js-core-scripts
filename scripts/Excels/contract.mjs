// AUTO-GENERATED self-contained runner — Excels.contract.
// Feature: Excel Contract (generate .xlsx from yaml). Single --yaml or batch --all; calls Excels/Yamls directly.
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('yargs');
const { hideBin } = await import('yargs/helpers');
const yargs = yargsMod.default;
const { Files } = await import('../../utils/Files.js');
const { Yamls } = await import('../../utils/Yamls.js');
const { Dates } = await import('../../utils/Dates.js');
const { Dialogs } = await import('../../utils/Dialogs.js');
const { Excels } = await import('../../utils/Excels.js');

// Per-contract step: fill yaml with info, then the action.
async function processOne(ymlFile) {
    console.warn('Processing contract:', ymlFile);
    await Yamls.fillYamlWithInfo(ymlFile, null, true, false);
    Excels.generate(ymlFile);
}

async function main() {
    console.log('1️⃣ Excels contract Start');
    const argv = yargs(hideBin(process.argv))
        .option('yaml', { alias: 'y', describe: 'single contract yaml' })
        .option('all', { alias: 'a', describe: 'ALL index for batch' })
        .help().parse();

    const ymlFile = argv.yaml;
    const allFile = argv.all;
    console.log('yaml:', ymlFile, '| all:', allFile);

    const run = async () => {
        if (!Files.isEmpty(allFile)) {
            const ymlFiles = Files.findAllContractFiles(allFile);
            console.log(`Found ${ymlFiles.length} contracts`);
            for (const f of ymlFiles) await processOne(f);
        } else if (!Files.isEmpty(ymlFile)) {
            await processOne(ymlFile);
        } else {
            console.warn('No --yaml or --all provided.');
        }
    };

    if (Yamls.getConfig('CmdLine.TryCatch') === 'true') {
        try { await run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout'))); }
        catch (error) { console.error('❌ Error:', error); Dialogs.warningBox(String(error && error.message || error), 'Excels contract Error'); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError'))); }
    } else {
        await run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
    }

    console.log('3️⃣ Excels contract Done');
}

main();
