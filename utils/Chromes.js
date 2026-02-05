import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { existsSync } from 'fs';
import puppeteer from 'puppeteer';
import puppeteerCore from 'puppeteer-core';
import UserAgent from 'user-agents';
import { readFileSync } from 'fs';
import { Files } from './Files.js';
import { exec } from 'child_process';
import { Dialogs } from './Dialogs.js';
import { Yamls } from './Yamls.js';
import dns from 'dns';
import { fetch, Agent } from 'undici';



export class Chromes {

  static Duration = {
    Unlimited: 0,
    noCache: -1,
    Min1: 60,
    Min5: 60 * 5,
    Min10: 60 * 10,
    Min15: 60 * 15,
    Min20: 60 * 20,
    Min30: 60 * 30,
    Hour1: 60 * 60,
    Hour2: 60 * 60 * 2,
    Hour10: 60 * 60 * 10,
    Day1: 24 * 60 * 60,
    Day7: 7 * 24 * 60 * 60,
    Month1: 30 * 24 * 60 * 60,
    Year1: 365 * 24 * 60 * 60,
  }


  static async initFetcher() {

    const agent = new Agent({
      connect: {
        timeout: 30000 // 30 seconds
      }
    });
    
    setGlobalDispatcher(agent);

  }


  static async fetcher(url, options, duration = this.Duration.Hour10, replace = [], owner = null) {

    console.info(`Chrome fetch. URL ${url}, Options: `, options)

    dns.setDefaultResultOrder('ipv4first');



    console.info('url', url);
    if (!url) Dialogs.warningBox('No url', 'Warning fetch');

    console.info('options', options);
    if (!options) Dialogs.warningBox('No options', 'Warning fetch');

    console.info('duration', duration);
    console.info('replace', replace);

    // get domain from url
    const domain = url.split('/')[2];
    console.info(domain, 'domain');
    let domainPath;

    const cacheDir = Yamls.getConfig('Cache.Directory');

    if (owner) {
      domainPath = path.join(cacheDir, domain, owner);
    } else {
      domainPath = path.join(cacheDir, domain);
    }
    Files.mkdirIfNotExists(domainPath);

    let urlForPath = url
      .replace(domain, '')
      .replace('https', '')
      .replace('http', '')

    replace.forEach((item) => {
      urlForPath = urlForPath.replace(item, '');
    })

    console.info(urlForPath, 'urlForPath');

    const fileName = Files.cleanupFileName(urlForPath, '  ');
    console.info(fileName, 'fileName');

    const cacheFile = path.join(domainPath, `${fileName}.json`);



    if (existsSync(cacheFile) && duration !== Duration.noCache) {

      // get file changed date
      const fileStats = fs.statSync(cacheFile);
      const fileChangedDate = fileStats.mtime;
      console.info(fileChangedDate, 'fileChangedDate');

      // compare file changed date with current date
      const fileChangedDateInSec = (Date.now() - fileChangedDate) / 1000;
      console.info(fileChangedDateInSec, 'fileChangedDateInSec');

      if (fileChangedDateInSec < duration || duration === Duration.Unlimited) {
        const cacheData = Files.readJson(cacheFile);

        // get size of cacheData
        console.info('Fetching from Cache: ')
        const cacheLength = JSON.stringify(cacheData).length;
        console.info('Request body length from Cache: ', cacheLength);
        return cacheData;
      } else {
        console.info('Fetching from Internet Cache Outdated:');
        Files.backupFile(cacheFile, true)
      }

    }


    try {

      console.info('Fetching from Internet:')
      const response = await fetch(url, options);

      if (!response.ok)
        return Dialogs.warningBox(`Response error! status: ${response.status}. statusText: ${response.statusText}`, 'Warning fetch !response.ok');

      const body = await response.json();

      // get body length
      const bodyLength = JSON.stringify(body).length;
      console.info('Request body length from Internet: ', bodyLength);

      if (duration !== Duration.noCache)
        Files.writeJson(cacheFile, body);

      return body;

    } catch (error) {
      return Dialogs.errorBox(error, 'Error catch (error)');
    }


  }



  static initFolders(app) {

    globalThis.app = app;
    console.info(globalThis.app, 'app globalThis');

    globalThis.saveDir = path.dirname(globalThis.app);
    console.info(globalThis.saveDir, 'saveDir globalThis');

    globalThis.mhtmlDir = path.join(globalThis.saveDir, '- Theory');
    console.info(globalThis.mhtmlDir, 'mhtmlDir globalThis');

    globalThis.mhtmlDirPage = path.join(globalThis.mhtmlDir, 'Page');
    console.info(globalThis.mhtmlDirPage, 'mhtmlDirPage globalThis');
    Files.mkdirIfNotExists(globalThis.mhtmlDirPage);

    globalThis.mhtmlDirPageAllJson = path.join(globalThis.mhtmlDirPage, 'ALL.json');
    console.info(globalThis.mhtmlDirPageAllJson, 'mhtmlDirPageAllJson globalThis');


    globalThis.mhtmlDirData = path.join(globalThis.mhtmlDir, 'Data');
    console.info(globalThis.mhtmlDirData, 'mhtmlDirData globalThis');
    Files.mkdirIfNotExists(globalThis.mhtmlDirData);

    globalThis.mhtmlDirDataAllJson = path.join(globalThis.mhtmlDirData, 'ALL.json');
    console.info(globalThis.mhtmlDirDataAllJson, 'mhtmlDirDataAllJson globalThis');


    globalThis.mhtmlDirPhone = path.join(globalThis.mhtmlDir, 'Phon');
    console.info(globalThis.mhtmlDirPhone, 'mhtmlDirPhone globalThis');
    Files.mkdirIfNotExists(globalThis.mhtmlDirPhone);

    globalThis.mhtmlDirPhoneHasJson = path.join(globalThis.mhtmlDirPhone, 'HasPhone.json');
    console.info(globalThis.mhtmlDirPhoneHasJson, 'mhtmlDirPhoneHasJson globalThis');

    globalThis.mhtmlDirPhoneHasNotJson = path.join(globalThis.mhtmlDirPhone, 'HasNotPhone.json');
    console.info(globalThis.mhtmlDirPhoneHasNotJson, 'mhtmlDirPhoneHasNotJson globalThis');


    globalThis.saveDirApp = path.join(globalThis.saveDir, '#APP');
    console.info(globalThis.saveDirApp, 'saveDirApp globalThis');
    Files.mkdirIfNotExists(globalThis.saveDirApp);

    globalThis.saveDirMht = path.join(globalThis.saveDir, '#MHT');
    console.info(globalThis.saveDirMht, 'saveDirMht globalThis');
    Files.mkdirIfNotExists(globalThis.saveDirMht);

    globalThis.saveDirUrl = path.join(globalThis.saveDir, '#URL');
    console.info(globalThis.saveDirUrl, 'saveDirUrl globalThis');
    Files.mkdirIfNotExists(globalThis.saveDirUrl);

  }


  static async finish() {
    await Chromes.closeBrowsers();
    console.log('2️⃣ End');
  }

  static async runBrowser(isCmdGo = false, hideChrome = false) {

    console.log('1️⃣ Run browser. isCmdGo: ', isCmdGo);
    globalThis.isCmdGo = isCmdGo;
    globalThis.hideChrome = hideChrome;

    if (isCmdGo) {
      await Chromes.closeBrowsers();
    } else {
      if (globalThis.browser) {
        return;
      }
    }

    globalThis.browser = await Chromes.runIxbrowser(isCmdGo);

    if (Yamls.getConfig('pageCloseBeforeGo') !== "true") {

      globalThis.page = await globalThis.browser.newPage();
      await Chromes.pageSetup();

      if (hideChrome || Yamls.getConfig('hideChrome') === 'true')
        await Chromes.hideChrome();
    }

  }


  static async pageGo(url, params = { waitUntil: "networkidle2" }, hideChrome = false) {

    if (!globalThis.browser) {
      await Chromes.runBrowser(globalThis.isCmdGo, hideChrome);
    }

    if (Yamls.getConfig('pageCloseBeforeGo') === "true") {

      if (globalThis.page) {
        console.log('Close existing page', globalThis.page.url());
        await globalThis.page.close();
      }

      globalThis.page = await globalThis.browser.newPage();
      await Chromes.pageSetup();
    }

    try {
      await globalThis.page.goto(url, params);
    } catch (error) {
      console.error('Error going to URL:', error);
      await Chromes.runBrowser(globalThis.isCmdGo, hideChrome);
    }

    if (Yamls.getConfig('pageCloseBeforeGo') === "true" && (hideChrome || Yamls.getConfig('hideChrome') === 'true'))
      await Chromes.hideChrome();

  }


  static async pageSetup() {
    globalThis.page.setViewport({ width: 1280, height: 900 });
    globalThis.page.setDefaultTimeout(Number(Yamls.getConfig('setDefaultTimeout')));
    globalThis.page.setDefaultNavigationTimeout(Number(Yamls.getConfig('setDefaultNavigationTimeout')));

    if (Yamls.getConfig('debugMode') === "true") {
      globalThis.page.on('console', m => console.log('PAGE:', m.text()));
      globalThis.page.on('pageerror', e => console.error('PAGE ERROR:', e));
      globalThis.page.on('requestfailed', r => console.log('REQUEST NO:', r.url(), r.failure && r.failure().errorText));
    }

  }


  static async cleanCache() {
    const client = await globalThis.page.target().createCDPSession();
    await client.send("Network.clearBrowserCache");
    await client.send("Storage.clearDataForOrigin", {
      origin: globalThis.page.url(),
      storageTypes: "all"
    });

    /*

    await client.send("Network.enable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: true });

    await client.send("Network.disable");
    await client.send("Network.setCacheDisabled", { cacheDisabled: false });
    */


  }


  static async pageMetrics() {

    const metrics = await globalThis.page.metrics();
    console.log(metrics);
  }

  static async closeBrowsers() {

    // close all pages
    /*    
       if (globalThis.page) {
         await globalThis.page.close();
       }
  
    */
    console.warn('1️⃣ Close browsers');

    if (globalThis.browser) {
      await globalThis.browser.close();
    }

  }



  static async killChrome() {

    const commandKill = `nircmd win kill ititle "chromium"`;
    console.log(`Executing command commandKill: ${commandKill}`);

    exec(commandKill, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

  }


  static async closeChrome() {

    const commandClose = `nircmd win close ititle "chromium"`;
    console.log(`Executing command: ${commandClose}`);

    exec(commandClose, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

  }



  static async hideChrome() {

    // execute this command nircmd win hide ititle "Chromium"
    const command = `nircmd win hide ititle "Chromium"`;
    console.log(`Executing command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

  }



  static async showChrome() {

    // execute this command nircmd win hide ititle "Chromium"
    const command = `nircmd win show ititle "Chromium"`;
    console.log(`Executing command: ${command}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error executing command: ${error}`);
        return;
      }
      console.log(`stdout: ${stdout}`);
      console.error(`stderr: ${stderr}`);
    });

  }



  static userAgent() {

    const userAgent = new UserAgent([/Chrome/, { deviceCategory: 'desktop' }]);
    console.info(userAgent.toString());
    console.info(JSON.stringify(userAgent.data, null, 2));

  }


  static getUrlFromMht(filePath) {

    // Read MHTML file and extract URL
    const mhtmlContent = fs.readFileSync(filePath, "utf-8");
    const urlMatch = mhtmlContent.match(/Snapshot-Content-Location:\s*(.*)/i);
    const extractedUrl = urlMatch ? urlMatch[1].trim() : null;

    if (!extractedUrl) {
      console.error("Could not extract URL from MHTML file.");
      return null;
    } else {
      return extractedUrl;
    }
  }




  static saveUrlFile(filePath, url) {

    const urlFileContent = `[InternetShortcut]
URL=${url}`;
    console.log(`Saving URL to file: ${filePath}. URL: ${url}`);

    fs.writeFileSync(filePath, urlFileContent);

  }


  static saveUrlFileFromMht(mhtPath, filePath) {

    const url = Chromes.getUrlFromMht(mhtPath);
    const urlFileContent = `[InternetShortcut]
URL=${url}`;
    console.log(`Saving URL to file: ${filePath}. URL: ${url}`);

    fs.writeFileSync(filePath, urlFileContent);

  }

  static randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static getRandomFloat(min, max) {
    return Math.random() * (max - min) + min;
  }





  static async runIxbrowser(isCmdGo = false) {

    const suffix = (isCmdGo) ? "cmdGo" : "cmd";

    const folderPath = path.join(Files.currentDir(), suffix);
    console.info("folderPath:", folderPath);

    const txtPath = Files.pickRandomFile(folderPath, ".txt");
    console.info(`✅ Chrome konfiguratsiya fayli: ${txtPath}`);

    // Faylni o‘qish
    const lines = readFileSync(txtPath, "utf8")
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);

    const fullLine = lines.find(l => l.startsWith("[FULL]"));
    let argsText = fullLine ? fullLine.replace("[FULL]", "").trim() : lines.join(" ");

    // .exe joylashuvini topamiz
    const exeMatch = argsText.match(/([A-Z]:\\[^\s"]+chrome\.exe)/i);
    if (!exeMatch) throw new Error("❌ chrome.exe topilmadi!");

    const executablePath = exeMatch[1].replace(/\\/g, "\\");
    console.info("🧭 Chrome executable:", executablePath);

    const regex = /"([^"]+)"|(\S+)/g;
    const args = [];
    let match;
    while ((match = regex.exec(argsText)) !== null) {
      args.push(match[1] || match[2]);
    }

    const filteredArgs = args
      .filter(a => !a.includes("chrome.exe"))
      .map(a => a.includes(":\\") ? Files.cleanPath(a) : a);


    // console.info("⚙️ Chrome args:", filteredArgs);clear
    let extPath;
    extPath = filteredArgs.find(a => a.startsWith("--load-extension"));
    extPath = extPath ? extPath.split("=")[1] : null;
    if (!extPath) throw new Error("❌ Extension .crx fayli topilmadi!");
    // Puppeteer ishga tushurish

    const argsApp = [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-sandbox',
      '--no-zygote',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--ignore-certificate-errors',
      '--disable-blink-features=AutomationControlled',
      '--js-flags=--max-old-space-size=20000',
      '--enable-gpu',
      '--disable-background-networking',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-software-rasterizer',
      '--mute-audio',
      '--disable-features=site-per-process',
      '--no-first-run',
      ...filteredArgs.filter(a => !a.startsWith("--load-extension"))
    ]
    console.info("⚙️ Chrome argsApp:", argsApp);

    const headless = (isCmdGo) ? Yamls.getConfig('HeadlessGo') === 'true' : Yamls.getConfig('Headless') === 'true';

    const browser = await puppeteerCore.launch({
      executablePath,
      headless: headless,
      enableExtensions: true,
      ignoreDefaultArgs: ['--enable-automation'],
      args: argsApp,
      protocolTimeout: Number(Yamls.getConfig('protocolTimeout'))
    })

    console.info("✅ Puppeteer ishga tushdi! isCmdGo:", isCmdGo);

    return browser;

  }






}
