// AUTO-GENERATED self-contained runner — Olx.appThree.
// Feature: OLX App Three (phones+merge+count). Ported from the old cmd/js-scraper-olx.uz pipeline;
// calls Chromes/Puppe/Phone directly (no cmd script). Input: --app <data.mhtml>.
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('yargs');
const { hideBin } = await import('yargs/helpers');
const yargs = yargsMod.default;
const { Chromes } = await import('../../utils/Chromes.js');
const { Puppe } = await import('../../utils/Puppe.js');
const { Phone } = await import('../../utils/Phone.js');

async function main() {
    console.log('1️⃣ Olx appThree Start');
    const argv = yargs(hideBin(process.argv)).option('app', { describe: 'data.mhtml' }).help().parse();
    const app = argv.app;
    console.log('app:', app);

    Chromes.initFolders(app);
    await Puppe.appSavePhones();
    Phone.appMergePhones();
    Phone.appCalculateCountOnline();
    await Chromes.finish();

    console.log('3️⃣ Olx appThree Done');
}

main();
