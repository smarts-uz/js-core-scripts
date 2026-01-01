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


export class Chromes {

  constructor(chromeVersion = process.env.CHROME_VERSION) {
    if (!chromeVersion) {
      throw new Error('❌ CHROME_VERSION belgilanmagan (env orqali).');
    }
    this.chromeVersion = chromeVersion;
    this.win = path.win32;
  }


  static async initFolders(app) {

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


    globalThis.saveDirApp = path.join(globalThis.saveDir, 'App');
    console.info(globalThis.saveDirApp, 'saveDirApp globalThis');
    Files.mkdirIfNotExists(globalThis.saveDirApp);

  }


  static async runBrowser(isCmdGo = false, hideChrome = false) {

    await Chromes.closeBrowsers();

    globalThis.browser = await Chromes.runIxbrowser(isCmdGo);
    globalThis.page = await globalThis.browser.newPage();
    globalThis.page.setViewport({ width: 1280, height: 900 });
    globalThis.page.setDefaultTimeout(Number(process.env.setDefaultTimeout));
    globalThis.page.setDefaultNavigationTimeout(Number(process.env.setDefaultNavigationTimeout));

    if (process.env.debugMode === "true") {
      globalThis.page.on('console', m => console.log('PAGE:', m.text()));
      globalThis.page.on('pageerror', e => console.error('PAGE ERROR:', e));
      globalThis.page.on('requestfailed', r => console.log('REQUEST NO:', r.url(), r.failure && r.failure().errorText));
    }

    if (hideChrome || process.env.hideChrome === 'true')
      await Chromes.hideChrome();
  }

  static async closeBrowsers() {

    // close all pages
    /*    
       if (globalThis.page) {
         await globalThis.page.close();
       }
  
    */
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

  static getRandomInt(min, max) {
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
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      /*  '--renderer-process-limit=3',
       '--js-flags=--max-old-space-size=12536',
       '--disable-gpu',
       '--single-process',
       '--disk-cache-size=0',
       '--media-cache-size=0',
       '--disable-background-networking',
       '--disable-background-timer-throttling',
       '--disable-renderer-backgrounding',
       '--disable-software-rasterizer',
       '--mute-audio', */
      '--no-first-run',
      '--no-zygote',
      ...filteredArgs.filter(a => !a.startsWith("--load-extension"))
    ]
    console.info("⚙️ Chrome argsApp:", argsApp);

    const headless = (isCmdGo) ? process.env.HeadlessGo === 'true' : process.env.Headless === 'true';

    const browser = await puppeteerCore.launch({
      executablePath,
      headless: headless,
      args: argsApp,
      protocolTimeout: Number(process.env.protocolTimeout)
    })

    console.info("✅ Puppeteer ishga tushdi! CmdGo", isCmdGo);

    return browser;

  }






}
