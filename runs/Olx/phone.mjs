// AUTO-GENERATED self-contained runner — Olx.phone.
// Feature: OLX Phone (save phones). Runs the scraper pipeline by calling Chromes/Puppe/Phone
// directly. Input: --app <data.mhtml>.
import path from 'node:path';
process.argv[1] = path.resolve(import.meta.dirname, '..', '..', 'runner.js');

const yargsMod = await import('yargs');
const { hideBin } = await import('yargs/helpers');
const yargs = yargsMod.default;
const { Chromes } = await import('../../utils/Chromes.js');
const { Puppe } = await import('../../utils/Puppe.js');
const { Phone } = await import('../../utils/Phone.js');

async function main() {
    console.log('1️⃣ Olx phone Start');
    const argv = yargs(hideBin(process.argv)).option('app', { describe: 'data.mhtml' }).help().parse();
    const app = argv.app;
    console.log('app:', app);

    Chromes.initFolders(app);
    await Puppe.appSavePhones();
    await Chromes.finish();

    console.log('3️⃣ Olx phone Done');
}

main();
