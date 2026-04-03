import path from 'path';
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
import { request, fetch, Agent, setGlobalDispatcher } from 'undici';




export class Chromes {

  static Duration = {
    Unlimited: 0,
    noCache: -1,
    Sec1: 1,
    Sec5: 5,
    Sec10: 10,
    Sec15: 15,
    Sec30: 30,
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
    Week1: 7 * 24 * 60 * 60,
    Week2: 14 * 24 * 60 * 60,
    Week4: 28 * 24 * 60 * 60,
    Month1: 30 * 24 * 60 * 60,
    Month2: 60 * 24 * 60 * 60,
    Month3: 90 * 24 * 60 * 60,
    Month6: 180 * 24 * 60 * 60,
    Year1: 365 * 24 * 60 * 60,
    Year2: 730 * 24 * 60 * 60,
  }



  static async fetcher(url, options, owner, duration = this.Duration.Hour10, replace = []) {

    console.info(`Chrome fetch. URL ${url}, Options: `, options)

    console.info('url:', url);
    if (!url) Dialogs.warningBox('No url', 'Warning fetch');

    console.info('options:', options);
    if (!options) Dialogs.warningBox('No options', 'Warning fetch');

    console.info('owner:', owner);
    if (!owner) Dialogs.warningBox('No owner', 'Warning fetch');

    console.info('duration:', duration);
    console.info('replace:', replace);

    // get domain from url
    const domain = url.split('/')[2];
    console.info(domain, 'domain');
    let domainPath;

    const cacheDir = Yamls.getConfig('Cache.Directory');

    domainPath = path.join(cacheDir, domain, owner);
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

    if (existsSync(cacheFile) && duration !== this.Duration.noCache) {

      // get file changed date
      const fileStats = fs.statSync(cacheFile);
      const fileChangedDate = fileStats.mtime;
      console.info(fileChangedDate, 'fileChangedDate');

      // compare file changed date with current date
      const fileChangedDateInSec = (Date.now() - fileChangedDate) / 1000;
      console.info(fileChangedDateInSec, 'fileChangedDateInSec');

      if (fileChangedDateInSec < duration || duration === this.Duration.Unlimited) {
        const cacheData = Files.readJson(cacheFile);

        // get size of cacheData
        console.info('Fetching from Cache >> ', cacheFile)
        const cacheLength = JSON.stringify(cacheData).length;
        console.info('Request body length from Cache: ', cacheLength);
        return cacheData;
      } else {
        console.info('Fetching from Internet Cache Outdated:');
        Files.backupFile(cacheFile, true)
      }

    }


    try {

      console.info('Fetching from Internet >>', url)


      dns.setDefaultResultOrder('ipv4first');

      const agent = new Agent({
        connect: {
          timeout: Yamls.getConfig('Cache.FetchTimeout')
        }
      });

      setGlobalDispatcher(agent);

      const response = await fetch(url, options);

      if (!response.ok)
        return Dialogs.warningBox(`Response error! status: ${response.status}. statusText: ${response.statusText}`, 'Warning fetch !response.ok');

      const body = await response.json();

      // get body length
      const bodyLength = JSON.stringify(body).length;
      console.info('Request body length from Internet: ', bodyLength);

      if (duration !== this.Duration.noCache) {
        console.info('Writing to Cache: ', cacheFile)
        Files.writeJson(cacheFile, body);

      }

      return body;

    } catch (error) {
      return Dialogs.errorBox(error, 'Error catch (error)');
    }


  }



  static async download(url, options, owner, fileType, duration = this.Duration.Hour10, replace = []) {

    console.info(`Chrome fetch. URL ${url}, Options: `, options)

    console.info('url', url);
    if (!url) Dialogs.warningBox('No url', 'Warning fetch');

    console.info('options', options);
    if (!options) Dialogs.warningBox('No options', 'Warning fetch');

    console.info('owner', owner);
    if (!owner) Dialogs.warningBox('No owner', 'Warning fetch');

    console.info('fileType', fileType);
    if (!fileType) Dialogs.warningBox('No fileType', 'Warning fetch');

    console.info('duration', duration);
    console.info('replace', replace);

    // get domain from url
    const domain = url.split('/')[2];
    console.info(domain, 'domain');
    let domainPath;

    const cacheDir = Yamls.getConfig('Cache.Directory');

    domainPath = path.join(cacheDir, domain, owner);
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

    const cacheFile = path.join(domainPath, `${fileName}.${fileType}`);

    if (existsSync(cacheFile) && duration !== this.Duration.noCache) {

      // get file changed date
      const fileStats = fs.statSync(cacheFile);
      const fileChangedDate = fileStats.mtime;
      console.info(fileChangedDate, 'fileChangedDate');

      // compare file changed date with current date
      const fileChangedDateInSec = (Date.now() - fileChangedDate) / 1000;
      console.info(fileChangedDateInSec, 'fileChangedDateInSec');

      if (fileChangedDateInSec < duration || duration === this.Duration.Unlimited) {

        // get size of cacheData
        console.info('Fetching from Cache >> ', cacheFile)
        const cacheLength = fs.statSync(cacheFile).size;
        console.info('File size from Cache: ', cacheLength);
        return cacheFile;
      } else {
        console.info('Fetching from Internet Cache Outdated:');
        Files.backupFile(cacheFile, true)
      }

    }


    try {

      console.info('Fetching from Internet >>', url)


      dns.setDefaultResultOrder('ipv4first');

      const agent = new Agent({
        connect: {
          timeout: Yamls.getConfig('Cache.FetchTimeout')
        }
      });

      setGlobalDispatcher(agent);


      const response = await fetch(url, options);

      if (!response.ok)
        return Dialogs.warningBox(response.statusText, 'Failed to download file', 'Warning');

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      if (buffer.length === 0)
        return Dialogs.warningBox('Downloaded file is empty', 'Warning');

      console.info('Request body length from Internet: ', buffer.length);

      console.info('Writing to Cache: ', cacheFile)
      fs.writeFileSync(cacheFile, buffer);

      return cacheFile;

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

  // add function to get url from mht file using getUrlFromFile and clean it
  static getUrlFromFileClean(filePath) {
    let url = this.getUrlFromFile(filePath);
    url = url
      .replace('https://', '')
      .replace('http://', '')
      .replace('www.', '')

    // remove last / if exists
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }

    url = Files.cleanUrl(url);

    return url;
  }

    


  static getUrlFromFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const urlMatch = content.match(/Snapshot-Content-Location:\s*(.*)/i);
    let url = urlMatch ? urlMatch[1].trim() : null;

    if (!url) {
      const contentLocationMatch = content.match(/Content-Location:\s*(.*)/i);
      url = contentLocationMatch ? contentLocationMatch[1].trim() : null;
    }

    if (url) {
      url = url.replace('<!--', '').replace('-->', '').trim();
    }

    if (!url) {
      console.error(`Could not extract URL from: ${filePath}`);
      return null;
    }
    return url;
  }



  static async processPathsToClipboard(paths) {
    if (!Array.isArray(paths)) {
      paths = [paths];
    }

    const isMhtmlHtml = (name) => {
      const ext = path.extname(name).toLowerCase();
      return ['.mhtml', '.mht', '.html', '.htm'].includes(ext);
    };

    let allFiles = [];

    for (const p of paths) {
      if (!fs.existsSync(p)) {
        console.warn(`Path not found: ${p}`);
        continue;
      }

      const stats = fs.statSync(p);
      if (stats.isDirectory()) {
        console.log(`📂 Scanning folder for URLs: ${p}`);
        const filesInFolder = Files.findRecursiveFull(
          p, 
          isMhtmlHtml,
          (name) => name === '- Theory' || name.startsWith('@')
        );
        allFiles = allFiles.concat(filesInFolder);
      } else if (isMhtmlHtml(p)) {
        allFiles.push(p);
      }
    }

    if (allFiles.length === 0) {
      Dialogs.warningBox("No MHTML or HTML files found in selection.", "URL to Clipboard Error");
      return;
    }

    const urls = [];
    for (const filePath of allFiles) {
      const url = this.getUrlFromFile(filePath);
      if (url) urls.push(url);
    }

    if (urls.length === 0) {
      Dialogs.warningBox("No URLs found.", "URL to Clipboard Error");
      return;
    }

    const textToCopy = urls.join('\n');
    
    try {
      const { spawnSync } = await import('child_process');
      spawnSync('clip', { input: textToCopy });
      console.log(`✅ Copied ${urls.length} URL(s) to clipboard.`);
    } catch (err) {
      console.error("❌ Failed to copy to clipboard:", err);
      Dialogs.warningBox("Failed to copy to clipboard:\n" + err.message, "URL to Clipboard Error");
    }
  }

  static async saveHtmlFromMht(mhtPath, deleteMht = true) {
    if (!fs.existsSync(mhtPath)) {
        Dialogs.warningBox(`MHTML file not found:\n${mhtPath}`, 'mhtmls Error');
        return null;
    }

    const url = this.getUrlFromFile(mhtPath);
    if (!url) {
      console.warn("No URL found in MHT: " + mhtPath);
      return null;
    }

    let htmlPath = mhtPath;
    if (htmlPath.toLowerCase().endsWith('.mhtml')) {
        htmlPath = htmlPath.slice(0, -6) + '.html';
    } else if (htmlPath.toLowerCase().endsWith('.mht')) {
        htmlPath = htmlPath.slice(0, -4) + '.html';
    } else {
        htmlPath += '.html';
    }

    // Download using fetch (urllib is not available in package.json)
    console.info("Downloading HTML from: " + url);
    
    const response = await fetch(url, { method: 'GET', redirect: 'follow' });
    let htmlText = await response.text();

    if (htmlText.includes('Incapsula')) {
        Dialogs.warningBox(`Access blocked by Incapsula WAF!\n\nURL: ${url}`, 'Incapsula Block Detected');
        return null;
    }

    // The first line of HTML file should be <!-- Content-Location: {PageURL} -->
    htmlText = `<!-- Content-Location: ${url} -->\n` + htmlText;

    const parsedUrl = new URL(url);
    const originBase = parsedUrl.origin + '/';
    const fullBase = url;

    // 1. img src="..." -> prepend hostname (origin)
    htmlText = htmlText.replace(/<img\s[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, p1) => {
        if (p1.startsWith('data:') || p1.startsWith('http://') || p1.startsWith('https://')) return match;
        try {
            const absUrl = new URL(p1, originBase).href;
            return match.replace(p1, absUrl);
        } catch (e) { return match; }
    });

    // 2. css url("...") -> prepend hostname (origin)
    htmlText = htmlText.replace(/url\((['"]?)([^'"()]+)\1\)/gi, (match, quote, p2) => {
        if (p2.startsWith('data:') || p2.startsWith('http://') || p2.startsWith('https://')) return match;
        try {
            const absUrl = new URL(p2, originBase).href;
            return `url(${quote}${absUrl}${quote})`;
        } catch (e) { return match; }
    });

    // 3. a href="..." -> prepend URL Path (fullBase)
    htmlText = htmlText.replace(/<a\s[^>]*href=["']([^"']+)["'][^>]*>/gi, (match, p1) => {
        if (p1.startsWith('javascript:') || p1.startsWith('mailto:') || p1.startsWith('tel:') || p1.startsWith('#') || p1.startsWith('http://') || p1.startsWith('https://')) return match;
        try {
            const absUrl = new URL(p1, fullBase).href;
            return match.replace(p1, absUrl);
        } catch (e) { return match; }
    });

    fs.writeFileSync(htmlPath, htmlText, 'utf-8');
    console.log(`✅ HTML saved to ${htmlPath}`);

    if (deleteMht) {
        if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 1024) {
            fs.unlinkSync(mhtPath);
            console.log(`🗑️ Deleted source MHT: ${mhtPath}`);
        }
    }

    return htmlPath;
  }

  static async mhtToHtmConvert(mhtPath, deleteMht = true) {
    if (!fs.existsSync(mhtPath)) {
        Dialogs.warningBox(`MHTML file not found:\n${mhtPath}`, 'mhtmls Error');
        return null;
    }

    const url = this.getUrlFromFile(mhtPath);

    let htmlPath = mhtPath;
    if (htmlPath.toLowerCase().endsWith('.mhtml')) {
        htmlPath = htmlPath.slice(0, -6) + '.html';
    } else if (htmlPath.toLowerCase().endsWith('.mht')) {
        htmlPath = htmlPath.slice(0, -4) + '.html';
    } else {
        htmlPath += '.html';
    }

    // Read as binary so we can safely decode quoted-printable bytes
    const mhtmlContent = fs.readFileSync(mhtPath, "binary");

    // Extract boundary string
    const boundaryMatch = mhtmlContent.match(/boundary="?([^"\r\n]+)"?/i);
    if (!boundaryMatch) {
       console.warn("Could not find boundary in MHTML: " + mhtPath);
       return null;
    }
    const boundary = boundaryMatch[1];
    
    // Split by boundary
    const parts = mhtmlContent.split(new RegExp(`--${boundary}`));
    
    let htmlPart = null;
    let encoding = null;

    for (const part of parts) {
        if (part.includes('Content-Type: text/html')) {
            htmlPart = part;
            const encMatch = part.match(/Content-Transfer-Encoding:\s*([^\r\n]+)/i);
            if (encMatch) encoding = encMatch[1].trim().toLowerCase();
            break;
        }
    }

    if (!htmlPart) {
       console.warn("Could not find HTML part in MHTML: " + mhtPath);
       return null;
    }

    // Separate headers from body
    const headerSplit = htmlPart.split(/\r?\n\r?\n/);
    headerSplit.shift(); // remove the headers part
    let rawHtml = headerSplit.join('\n\n'); 
    // remove trailing boundary hyphens or empty lines
    rawHtml = rawHtml.replace(/\s*--\s*$/, '');

    let decodedHtml = rawHtml;
    if (encoding === 'quoted-printable') {
        decodedHtml = decodedHtml.replace(/=\r?\n/g, '');
        const buffer = Buffer.alloc(decodedHtml.length);
        let bufIndex = 0;
        for (let i = 0; i < decodedHtml.length; i++) {
            if (decodedHtml[i] === '=' && i + 2 < decodedHtml.length && /^[0-9a-fA-F]{2}$/.test(decodedHtml.substring(i+1, i+3))) {
                buffer[bufIndex++] = parseInt(decodedHtml.substring(i+1, i+3), 16);
                i += 2;
            } else {
                buffer[bufIndex++] = decodedHtml.charCodeAt(i) & 0xff;
            }
        }
        decodedHtml = buffer.slice(0, bufIndex).toString('utf8');
    } else if (encoding === 'base64') {
        decodedHtml = Buffer.from(decodedHtml, 'base64').toString('utf8');
    } else {
        // utf-8 or 8bit
        decodedHtml = Buffer.from(decodedHtml, 'binary').toString('utf8');
    }

    let htmlText = decodedHtml;

    if (url) {
        htmlText = `<!-- Content-Location: ${url} -->\n` + htmlText;

        const parsedUrl = new URL(url);
        const originBase = parsedUrl.origin + '/';
        const fullBase = url;

        htmlText = htmlText.replace(/<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi, (match, p1) => {
            if (p1.startsWith('data:') || p1.startsWith('http://') || p1.startsWith('https://') || p1.startsWith('cid:')) return match;
            try { return match.replace(p1, new URL(p1, originBase).href); } catch (e) { return match; }
        });

        htmlText = htmlText.replace(/url\((['"]?)([^'"()]+)\1\)/gi, (match, quote, p2) => {
            if (p2.startsWith('data:') || p2.startsWith('http://') || p2.startsWith('https://') || p2.startsWith('cid:')) return match;
            try { return `url(${quote}${new URL(p2, originBase).href}${quote})`; } catch (e) { return match; }
        });

        htmlText = htmlText.replace(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>/gi, (match, p1) => {
            if (p1.startsWith('javascript:') || p1.startsWith('mailto:') || p1.startsWith('tel:') || p1.startsWith('#') || p1.startsWith('http://') || p1.startsWith('https://') || p1.startsWith('cid:')) return match;
            try { return match.replace(p1, new URL(p1, fullBase).href); } catch (e) { return match; }
        });
    }

    fs.writeFileSync(htmlPath, htmlText, 'utf-8');
    console.log(`✅ Offline HTML saved to ${htmlPath}`);

    if (deleteMht) {
        if (fs.existsSync(htmlPath) && fs.statSync(htmlPath).size > 1024) {
            fs.unlinkSync(mhtPath);
            console.log(`🗑️ Deleted source MHT: ${mhtPath}`);
        }
    }

    return htmlPath;
  }

  static async convertFolderMhtToHtm(folderPath, deleteMht = true) {
    if (!fs.existsSync(folderPath) || !fs.statSync(folderPath).isDirectory()) {
      Dialogs.warningBox(`Folder not found or is not a directory:\n${folderPath}`, 'mhtmls Error');
      return;
    }

    console.log(`📂 Scanning folder for MHTML files: ${folderPath}`);
    const mhtmlFiles = Files.findRecursiveFull(
      folderPath, 
      (name) => name.toLowerCase().endsWith('.mhtml')
    );
    
    console.log(`🔍 Found ${mhtmlFiles.length} MHTML files.`);

    for (const mhtmlPath of mhtmlFiles) {
      console.log(`🔄 Converting: ${mhtmlPath}`);
      try {
        await this.mhtToHtmConvert(mhtmlPath, deleteMht);
      } catch (err) {
        console.error(`❌ Failed to convert ${mhtmlPath}:`, err.message);
      }
    }

    console.log(`✅ Folder conversion done.`);
  }

  static saveUrlFile(filePath, url) {

    const urlFileContent = `[InternetShortcut]
URL=${url}`;
    console.log(`Saving URL to file: ${filePath}. URL: ${url}`);

    fs.writeFileSync(filePath, urlFileContent);

  }


  static saveUrlFileFromMht(mhtPath, filePath) {

    const url = Chromes.getUrlFromFile(mhtPath);
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
