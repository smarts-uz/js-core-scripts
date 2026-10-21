// AUTO-GENERATED self-contained runner — Yamls.contractUpdate.
// Feature: Yaml Contract Update. Single --yaml or batch --all; calls Yamls/Yamls directly.
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('#yargs');
const { hideBin } = await import('#yargs-helpers');
const yargs = yargsMod.default;
const { Files } = await import('../../classes/Files.js');
const { Yamls } = await import('../../classes/Yamls.js');
const { Dates } = await import('../../classes/Dates.js');
const { Dialogs } = await import('../../classes/Dialogs.js');

// Per-contract step: archive, copy fresh template, and re-process.
async function processOne(ymlFile) {
    console.warn('Processing contract:', ymlFile);
    await Yamls.update(ymlFile);
}

async function main() {
    console.log('1️⃣ Yamls contractUpdate Start');
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
            const failed = [];
            let index = 0;
            for (const f of ymlFiles) {
                index++;
                console.log(`\n================== [${index}/${ymlFiles.length}] ==================`);
                try {
                    await processOne(f);
                } catch (err) {
                    console.error(`❌ Error processing ${f}:`, err);
                    failed.push({ file: f, error: err.message || String(err) });
                }
            }
            if (failed.length > 0) {
                console.error(`\n⚠️ Finished with ${failed.length} failures out of ${ymlFiles.length}:`, failed);
            } else {
                console.log(`\n✅ All ${ymlFiles.length} contracts processed successfully!`);
            }
        } else if (!Files.isEmpty(ymlFile)) {
            await processOne(ymlFile);
        } else {
            console.warn('No --yaml or --all provided.');
        }
    };

    if (Yamls.getConfig('CmdLine.TryCatch') === 'true') {
        try { await run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout'))); }
        catch (error) { console.error('❌ Error:', error); Dialogs.warningBox(String(error && error.message || error), 'Yamls contractUpdate Error'); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeoutError'))); }
    } else {
        await run(); Dates.sleep(Number(Yamls.getConfig('CmdLine.ExitTimeout')));
    }

    console.log('3️⃣ Yamls contractUpdate Done');
}

main();
