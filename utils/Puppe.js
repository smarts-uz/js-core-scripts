
import puppeteer, { Dialog } from "puppeteer";
import { Files } from "./Files.js";
import path from "path";
import fs from "fs";
import { Chromes } from "./Chromes.js";
import { Dialogs } from "./Dialogs.js";
import { Dates } from "./Dates.js";
import { ES } from "./ES.js";
import { exit } from "process";

export class Puppe {
  constructor(parameters) {


    // create file inside Chromes.folder

    // get rate from

  }




  static async humanScroll(page) {
    const steps = 15;

    for (let i = 0; i < steps; i++) {
      if (!page || page.isClosed()) break;

      try {
        await page.mouse.wheel({ deltaY: 120 });
      } catch (err) {
        console.warn('humanScroll Failed:', err.message);
        break;
      }

      await Dates.sleep(400);
    }
  }



  static async autoScrollOld(page, distance = 300, setIntervalTime = 50) {
    if (!page || page.isClosed()) return;
    await page.evaluate(
      async ({ distance, setIntervalTime }) => {
        await new Promise((resolve) => {
          let totalHeight = 0;
          const timer = setInterval(() => {
            const scrollHeight = document.body.scrollHeight;
            window.scrollBy(0, distance);
            totalHeight += distance;

            if (totalHeight >= scrollHeight - window.innerHeight) {
              clearInterval(timer);
              resolve();
            }
          }, setIntervalTime);
        });
      },
      { distance, setIntervalTime } // <-- paramlar browserga uzatilyapti
    );
  }


  static async autoScroll(page, step = 400, delay = 150) {
    if (!page || page.isClosed()) return;

    await page.evaluate(
      async (step, delay) => {
        await new Promise(resolve => {
          let total = 0;
          const timer = setInterval(() => {
            const height = document.body.scrollHeight;
            window.scrollBy(0, step);
            total += step;

            if (total >= height) {
              clearInterval(timer);
              resolve();
            }
          }, delay);
        });
      },
      step,
      delay
    );
  }


  static async scrollUntilSelector(
    page,
    selector,
    {
      step = 500,
      delay = 300,
      maxScrolls = 30
    } = {}
  ) {
    for (let i = 0; i < maxScrolls; i++) {
      const found = await page.$(selector);
      if (found) return true;

      await page.evaluate((step) => {
        window.scrollBy(0, step);
      }, step);

      await page.waitForTimeout(delay);
    }

    return false;
  }

  /**
   * Saves all ads from a search page, including pagination
   */
  static async extractOffers(page) {
    if (!page || page.isClosed()) return;

    let adLinks = await page.$$eval(
      'a[href*="/obyavlenie/"], a[href*="/offer/"]',
      (els) =>
        els
          .map((el) => el.getAttribute("href"))
          .filter(Boolean)
          .map((href) =>
            href.startsWith("http") ? href : "https://www.olx.uz" + href
          )
    );

    // Убираем дубликаты
    adLinks = [...new Set(adLinks)];

    console.info(`📌 Найдено ${adLinks.length} объявлений на этой странице.`);
    console.info(`adLinks`, adLinks);

    return adLinks

  }



  /**
   * Auto scroll static
   */





  static async extractUserId(page) {
    if (!page || page.isClosed()) return;
    const selector = 'a[data-testid="user-profile-link"]'

    let matches = await page.$eval(selector, a => {
      const href = a.getAttribute('href') || '';
      console.info('href', href);


      let match = href.match(/\/list\/user\/([^.]+?)\//);
      console.info('match User', match);

      if (!match) {
        match = href.match(/https?:\/\/([^.]+)\.olx\.uz/);;   // → "bitovayatexnikalg"
        console.info("match Host:", match);
      }

      return { href, match }; // regex match is an array of strings or null

    }).catch(() => {
      console.warn('No user ID found');
      return null;
    });

    console.info('matches', matches);
    let { href, match } = matches

    if (!href.includes('https://'))
      href = `https://olx.uz${href}`


    if (match && match.length > 0) {
      match = decodeURIComponent(match[1]);
      console.info('match', match);
    }

    const returns = { href, match }
    console.info('returns', returns);

    return returns;

  }



  static async extractContent(page) {
    if (!page || page.isClosed()) return;
    const description = await page.$eval(
      '[data-cy="ad_description"] > div:last-child',
      el => el.textContent.trim()
    );

    //  console.info('description', description);

    return description;

  }


  static extractUzbekPhones(text) {

    const CANDIDATE_RE = /(?:\+?998|998|8|0)?[-.\s()]*\d{2}[-.\s()]*\d{3}[-.\s()]*\d{2}[-.\s()]*\d{2}|\b\d{9}\b/g;

    if (!text || typeof text !== "string") return [];
    const found = text.match(CANDIDATE_RE) || [];
    const seen = new Set();
    const out = [];

    for (const f of found) {
      if (f && !seen.has(f)) {
        seen.add(f);
        out.push(f);
      }
    }
    console.info('uzbekPhones', out);

    return out;
  }



  static async extractApp(pattern, page) {

    try {
      const username = await page.$eval(
        pattern,
        el => el.textContent.trim()
      );

      console.log(username); // "ibrohim"

      return username;
    } catch (error) {
      return null
    }

  }

  static async extractAppPhone(pattern, page) {

    try {
      const username = await page.$eval(
        pattern,
        el => el.getAttribute("href").replace("tel:", "")
      );

      console.log(username); // "ibrohim"

      return username;
    } catch (error) {
      return null
    }

  }


  static async extractID(page) {
    if (!page || page.isClosed()) return;
    let id = await page.$eval(
      '[data-testid="ad-footer-bar-section"]',
      el => {
        const m = el.textContent.match(/ID:\s*(\d+)/);
        return m ? m[1] : null;
      }
    );

    id = `ID-${id}`

    console.log(id); // → 48768780

    return id;

  }


  static async showPhone(page) {
    // await Puppe.scrollAds(page);

    if (!page || page.isClosed()) return;
    // ✅ Handle phone number display\
    let phone;
    try {
      const phoneButtons = await page.$$('button[data-testid="show-phone"]');
      for (const btn of phoneButtons) {
        const visible = await btn.isVisible?.() || await btn.evaluate(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        if (visible) {
          console.info('📞 Found visible phone button, clicking...');
          await btn.click();

          const timeout = Number(process.env.phoneClickTimeout) || 5000;
          console.info(`Waiting for phone number to appear (${timeout}ms)...`);

          await page.waitForSelector('[data-testid="contact-phone"]', { timeout: timeout });
          phone = await page.$eval(
            'a[data-testid="contact-phone"]',
            el => el.getAttribute("href").replace("tel:", "")
          );

          if (phone) {
            console.info('✅ Phone number displayed!', phone);
            break;
          } else {
            console.warn('❌ No phone number found');
            Dialogs.warningBox(`No phone number found`, 'No phone number found');
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Phone handling error: ${err.message}`);
    }

    return phone;

  }


  static async saveAsMhtml(page, filePath) {
    if (!page || page.isClosed()) return;
    try {
      console.info("🧩 Capturing MHTML snapshot...");
      const cdp = await page.createCDPSession();
      await cdp.send("Page.enable");

      // Wait a bit to let dynamic content settle
      await new Promise(resolve => setTimeout(resolve, 100));

      try {
        const { data } = await cdp.send("Page.captureSnapshot", { format: "mhtml" });
        fs.writeFileSync(filePath, data);
        console.info(`💾 Saved (MHTML): ${filePath}`);
      } catch (mhtmlErr) {
        // More specific error handling for MHTML capture
        if (
          mhtmlErr.message &&
          mhtmlErr.message.includes("Protocol error (Page.captureSnapshot): Failed  to generate MHTML")
        ) {
          console.error(
            `❌ Failed to capture MHTML for ${page.url()}: The page may contain resources or frames that prevent MHTML generation.`
          );
        } else {
          console.error(`â ï¸ Failed to capture MHTML for ${page.url()}: ${mhtmlErr.message}`);
        }
      }
    } catch (err) {
      console.error(`⚠️ Unexpected error during MHTML capture for ${page.url()}: ${err.message}`);
    }
  }


  static async scrapeOffers(url) {

    const slugApp = url.match(/\/obyavlenie\/([^\/]+)-ID/i);
    const slug = slugApp?.[1];
    console.info(`Safe Name: ${slug}`);

    const offerURLPath = path.join(globalThis.saveDirAzk, `${slug}.url`);
    console.info(`Offer URL Path: ${offerURLPath}`);

    if (fs.existsSync(offerURLPath)) {
      console.info(`⚠️ Offer already exists: ${offerURLPath}`);
      return;
    }

    await Dates.sleep(1000)

    Chromes.saveUrlFile(offerURLPath, url);


    console.info(`➡️ Loading Olx Post: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "networkidle2" });

    await Puppe.humanScroll(globalThis.page);
    console.info(`networkidle2`);

    const { href, match } = await Puppe.extractUserId(globalThis.page);

    if (!match)
      Dialogs.warningBox(
        `⚠️ Failed to extract user ID from ${url}. Please check the URL and try again.`
      );


    const userIdPath = path.join(globalThis.saveDir, match);
    console.info(`User ID Path: ${userIdPath}`);

    const title = await Puppe.pageTitle(page);
    if (!title)
      title = slug

    const offerPath = path.join(userIdPath, `${title}`);
    console.info(`Offer Path: ${offerPath}`);


    if (!fs.existsSync(userIdPath)) {
      Files.mkdirIfNotExists(userIdPath);

    }



    Files.mkdirIfNotExists(offerPath);

    const filePathContent = path.join(offerPath, `ALL.txt`);
    const content = await Puppe.extractContent(page);
    if (content) {
      fs.writeFileSync(filePathContent, content);

      const phones = await Puppe.extractUzbekPhones(content);
      if (phones) {
        for (const phone of phones) {
          const phoneApp = Dates.normalizeUzAccordingToRule(phone);
          console.info(`Phone App: ${phoneApp}`);

          Files.saveInfoToFile(userIdPath, phoneApp);
        }
      }

    }

    const ID = await Puppe.extractID(page);
    if (ID)
      Files.saveInfoToFile(offerPath, ID);

    const patterns = [
      '[data-testid="ad-price-container"] h3',
      '[data-testid="ad-price-container"] p',
      '[data-cy="offer_title"] h4',
      '[data-cy="ad-posted-at"]',
      '.header-content div section div:nth-child(1) div p:nth-child(1)',
      '.header-content div section div:nth-child(1) div p:nth-child(2)',
      '[data-testid="user-profile-user-name"]',
    ];

    for (const pattern of patterns) {
      let text = await Puppe.extractApp(pattern, page);
      if (text) {
        text = Dates.normalizeUzAccordingToRule(text);
        console.info(`Text: ${text}`);
        Files.saveInfoToFile(offerPath, text);
      }
    }

    const filePathMhtml = path.join(offerPath, `ALL.mhtml`);
    if (!fs.existsSync(filePathMhtml)) {
      console.info(`Saving ${filePathMhtml}`);
      await Puppe.saveAsMhtml(page, filePathMhtml);
    }

    await Puppe.scrapeUser(href, userIdPath, match)


  }


  static async scrapePhone(url, userIdPath) {

    console.info(`➡️ Loading Olx Post: ${url}`);

    await globalThis.page.goto(url, { waitUntil: "networkidle2" });
    await Dates.sleep(500)

    await Puppe.humanScroll(globalThis.page);

    const phone = await Puppe.showPhone(globalThis.page);
    console.info(`Phone: ${phone}`);

    if (phone) {
      const phoneApp = Dates.normalizeUzAccordingToRule(phone);
      console.info(`Phone App: ${phoneApp}`);

      const phoneError = path.join(userIdPath, `#PhoneError.txt`);

      // remove previous phone error
      if (fs.existsSync(phoneError)) {
        fs.unlinkSync(phoneError);
        console.info(`Removed previous phone error: ${phoneError}`);
      }

      Files.saveInfoToFile(userIdPath, '#PhoneOK');
      Files.saveInfoToFile(userIdPath, phoneApp);

      const patternsPhone = [
        //    '[data-testid="other-contacts"] ul li:nth-child(1) p a',
        //    '[data-testid="other-contacts"] ul li:nth-child(2) p a',
        //    '[data-testid="other-contacts"] ul li:nth-child(3) p a',
        //    '[data-testid="other-contacts"] ul li:nth-child(4) p a',
        '[data-testid="phones-container"] div div a:nth-child(1)',
        '[data-testid="phones-container"] div div a:nth-child(2)',
        '[data-testid="phones-container"] div div a:nth-child(3)',
        '[data-testid="phones-container"] div div a:nth-child(4)',
      ]

      for (const pattern of patternsPhone) {
        const text = await Puppe.extractAppPhone(pattern, globalThis.page);
        if (text) {
          const phoneApp = Dates.normalizeUzAccordingToRule(text);
          Files.saveInfoToFile(userIdPath, phoneApp);
        }
      }

      return true

    } else {
      await Dates.sleep(1000)
      await Chromes.runBrowser(true, false)
      Files.saveInfoToFile(userIdPath, '#PhoneError');
      return false
    }


  }


  static async scrapeUser(url, userIdPath, match) {

    const userIdALLMhtml = path.join(userIdPath, `User ${match}.mhtml`);
    console.info(`User Id ALL Mhtml: ${userIdALLMhtml}`);

    if (fs.existsSync(userIdALLMhtml)) {
      console.info(`⚠️ User already exists: ${userIdALLMhtml}`);
      return;
    }

    console.info(`➡️ Loading Olx User: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "networkidle2" });

    await Puppe.humanScroll(globalThis.page);

    Puppe.saveAsMhtml(globalThis.page, userIdALLMhtml);

    const filePathURL = path.join(userIdPath, `User ${match}.url`);
    Chromes.saveUrlFile(filePathURL, url);

    const patternsPhone = [

      // 1. Telefon raqami
      '.header-content div:nth-child(1) div:nth-child(1) div:nth-child(2) div:nth-child(1) div h4',
      '.header-content div:nth-child(1) div:nth-child(1) div:nth-child(2) div:nth-child(1) p',
      '.header-content div:nth-child(1) div:nth-child(1) div:nth-child(2) div:nth-child(2) p span',
      '.header-content div:nth-child(1) div:nth-child(1) div:nth-child(2) div:nth-child(2) div p span',
      '[data-testid="results-counter"]',
    ]

    for (const pattern of patternsPhone) {
      let text = await Puppe.extractApp(pattern, page);
      if (text) {
        text = Dates.normalizeUzAccordingToRule(text);
        console.info(`Text: ${text}`);
        Files.saveInfoToFile(userIdPath, text);
      }
    }



  }

  static async offersCount(fullPath) {
    // scan fullPath for folders using fs
    let folders = Files.findPhonesRecFull(fullPath, function (file) {
      return file.includes('Мы нашли') && file.includes('объявлений')
    });
    console.info(`Found ${folders.length} folders`, folders);

  }


  static async actualizePhoneFolder(paths) {

    // recursive scan for path. filter, include +998 and .app
    // Recursively find all files under 'path' that include '+998' and '.app'

    let results = Files.findPhonesRec(paths, function (file) {
      return file.includes('+998') && file.includes('.app') && file.length === 21
    });
    console.info(`Found ${results.length} files`, results);

    // remove duplicates
    results = [...new Set(results)];
    console.info(`Found ${results.length} files. After duplicates removal`, results);

    let resultsFullPaths = Files.findPhonesRecFull(paths, function (file) {
      return file.includes('+998') && file.includes('.app') && file.length === 21
    });
    console.info(`Found ${resultsFullPaths.length} files`, resultsFullPaths);

    // copy all of these files to path 
    for (const file of resultsFullPaths) {
      // copy file to path
      const fileName = path.basename(file);
      const dest = path.join(paths, fileName);

      if (!fs.existsSync(dest)) {
        fs.copyFileSync(file, dest);
        console.info(`Copied ${file} to ${dest}`);
      }
      else {
        console.info(`File ${dest} already exists`);
      }
    }

    // rename path to phoneFolder
    const phoneFolder = Files.phoneToFolder(results);
    console.info(`phoneFolder`, phoneFolder);

    // get parent path of paths
    const parentPath = path.dirname(paths);

    const newPath = path.join(parentPath, phoneFolder);
    if (!fs.existsSync(newPath)) {
      fs.renameSync(paths, newPath);
      console.info(`Renamed ${paths} to ${newPath}`);
      return newPath;
    }
    else {
      console.info(`File ${newPath} already exists`);
      return paths;
    }
  }

  static async scrapePages(url) {


    console.info(`➡️ Loading Catalog: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "networkidle2" });

    //  await Puppe.humanScroll(globalThis.page);

    console.info(`networkidle2`);

    const title = await Puppe.pageTitle(globalThis.page);

    let adLinks = await Puppe.extractOffers(globalThis.page)
    console.info(`adLinks`, adLinks)

    const filePathJson = path.join(globalThis.mhtmlDirData, `${title}.json`);
    Files.writeJson(filePathJson, adLinks)

    const filePathMhtml = path.join(globalThis.mhtmlDirPage, `${title}.mhtml`);
    await Puppe.saveAsMhtml(page, filePathMhtml);


  }


  static async appSavePagination() {
    console.info(globalThis.mhtmlDir, 'mhtmlDir globalThis');

    // scan globalThis.mhtmlDir for *.mhtml files
    console.info(`Scanning ${globalThis.mhtmlDir} for *.mhtml files`);
    let files = await fs.promises.readdir(globalThis.mhtmlDir, { withFileTypes: true });
    files = files.filter(file => file.isFile() && file.name.endsWith('.mhtml'));
    console.info(`Found ${files.length} files`);
    console.info(`Found ${files.length} files in ${globalThis.mhtmlDir}`);

    for (const file of files) {
      console.info(`File: ${file.name}`);
      const filePath = path.join(globalThis.mhtmlDir, file.name);
      const url = Chromes.getUrlFromMht(filePath);
      console.info(`URL: ${url}`);
      await Puppe._appSavePaginationItem(url);

    }

    Files.combineJsonFiles(globalThis.mhtmlDirPage);



  }


  static async _appSavePaginationItem(url) {


    console.info(`📖 Загружаю главную страницу для получения пагинации: ${url}`);

    await globalThis.page.setViewport({ width: 1280, height: 900 });
    await globalThis.page.goto(url, { waitUntil: "networkidle2" });

    const title = await Puppe.pageTitle(globalThis.page);
    console.info(`Title: ${title}`);

    // Прокручиваем вниз для загрузки пагинации
    await Puppe.humanScroll(globalThis.page);

    // Wait for pagination elements to load
    await globalThis.page.waitForSelector('ul.pagination-list', { timeout: 10000 }).catch(() => { });

    // Scroll to pagination area to ensure all elements are loaded
    await globalThis.page.evaluate(() => {
      const paginationContainer = document.querySelector('ul.pagination-list');
      if (paginationContainer) {
        paginationContainer.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    });


    // Try to click "next" button multiple times to load all pagination links
    let clicked = true;
    let attempts = 0;
    const maxAttempts = 200;

    while (clicked && attempts < maxAttempts) {
      clicked = await globalThis.page.evaluate(() => {
        const nextButton = Array.from(document.querySelectorAll('ul.pagination-list li a'))
          .find(el => el.textContent.trim().toLowerCase() === 'next' || el.textContent.trim() === '»');

        if (nextButton && !nextButton.parentElement.classList.contains('active')) {
          nextButton.click();
          return true;
        }
        return false;
      });

      if (clicked) {
        await Dates.sleep(500); // Wait for page to load
        attempts++;
      }
    }

    // Scroll back to top to ensure we can see all pagination
    await globalThis.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await Dates.sleep(500);

    // Get maximum page number from data-testid attributes
    const maxPageNumber = await globalThis.page.evaluate(() => {
      let maxPage = 0;
      const pageElements = document.querySelectorAll('[data-testid^="pagination-link-"]');

      pageElements.forEach(el => {
        const testId = el.getAttribute('data-testid');
        if (testId) {
          const pageNumber = parseInt(testId.replace('pagination-link-', ''));
          if (!isNaN(pageNumber) && pageNumber > maxPage) {
            maxPage = pageNumber;
          }
        }
      });

      return maxPage;
    });

    // Generate pagination URLs based on page numbers
    const paginationUrls = [];

    // add serachurl to paginationUrls
    const currentUrl = globalThis.page.url();
    console.info(`Current URL: ${currentUrl}`);
    console.info(`maxPageNumber: ${maxPageNumber}`);


    let urlObj = new URL(currentUrl);
    
    if (urlObj.searchParams.has('page')) {
      urlObj.searchParams.delete('page');
    }

    paginationUrls.push(urlObj.toString());

    if (maxPageNumber > 0) {

      const urlObjApp = new URL(currentUrl);

      // Generate URLs for all pages from 2 to maxPageNumber
      for (let i = 2; i <= maxPageNumber; i++) {
        urlObjApp.searchParams.set('page', i.toString());
        paginationUrls.push(urlObjApp.toString());
      }

    }

    console.info(`📑 Найдено ${paginationUrls.length} страниц пагинации`, paginationUrls);

    // read globalThis.mhtmlDirPageAllJson to array
    //  paginationUrls = paginationUrls.concat(Files.readUrlsFromDirectory(globalThis.mhtmlDirPageAllJson));

    const filePathJson = path.join(globalThis.mhtmlDirPage, `${title}.json`);
    Files.writeJson(filePathJson, paginationUrls)

    return paginationUrls;

  }


  static async appSavePages() {


    console.info(globalThis.mhtmlDirPageAllJson, 'mhtmlDirPageAllJson globalThis');

    // read this json. globalThis.mhtmlDirPageAllJson iterate through all pages and save them as mhtml files

    if (fs.existsSync(globalThis.mhtmlDirPageAllJson)) {

      const mhtmlDirPageAllJson = JSON.parse(fs.readFileSync(globalThis.mhtmlDirPageAllJson, 'utf8'));

      for (const pageUrl of mhtmlDirPageAllJson) {
        console.info(`➡️ Loading Olx Catalog Page: ${pageUrl}`);
        await Puppe.scrapePages(pageUrl);
      }

      Files.combineJsonFiles(globalThis.mhtmlDirData);


    }

  }

  static async appMergePhones() {

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&
      !file.includes('ALL') &&
      !file.includes('App') &&
      !file.includes('Azk') &&
      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    for (const folder of folders) {

      const userDir = path.join(globalThis.saveDir, folder);
      console.info(`Scanning ${userDir} for folders`);

      await Puppe._appMergePhonesItem(userDir, folder);

    }

  }


  static async _appMergePhonesItem(userDir, folder) {

    console.info(`Scanning ${userDir} for folders`);
    console.info(`Folder: ${folder}`);


    // scan in folder not recursive for +998.*.app files in not exists push this folder path to new array
    // +998-33-212-95-20.app
    const files = ES.getPhones(userDir);

    let phoneExists = false

    // iterate files as file, get phoneToFolderItem
    for (const file of files) {

      const phoneFolderItem = Files.phoneToFolderItem(file);
      console.info(`phoneFolderItem IN`, phoneFolderItem);

      // scan globalThis.saveDirApp for phoneFolderItem usibng readdirSync  

      const found = fs.readdirSync(globalThis.saveDirApp).filter(file =>
        fs.statSync(path.join(globalThis.saveDirApp, file)).isDirectory() &&
        file.includes(phoneFolderItem)
      );
      console.info(`Found ${found.length} folders with such phone IN`, found);

      if (found.length !== 0) {
        const parentMovedFolder = path.join(globalThis.saveDirApp, found[0]);
        console.info(`parentMovedFolder IN`, parentMovedFolder);
        Files.mkdirIfNotExists(parentMovedFolder);

        const movedFolderPath = path.join(parentMovedFolder, folder);
        if (!fs.existsSync(userDir)) {
          console.warn(`UserDir IN Not existsSync, ${userDir} to ${movedFolderPath}`);
          continue
        }

        console.info(`Moving IN ${userDir} to ${movedFolderPath}`);

        // move folder using fs

        Files.moveWithCommas(userDir, movedFolderPath);
        if (!fs.existsSync(movedFolderPath)) {
          console.error(`Error IN with Move, ${userDir} to ${movedFolderPath}`);
        }
        else {
          console.info(`Moved IN ${userDir} to ${movedFolderPath}`); // Changed from Moved to Moved IN
          await Puppe.actualizePhoneFolder(parentMovedFolder);
          phoneExists = true
          continue
        }

      }


    }

    if (phoneExists) {
      console.info(`phone Moved from ${userDir}`);
      return false
    }

    if (!fs.existsSync(userDir)) {
      console.warn(`UserDir Not existsSync, ${userDir} to ${movedFolderPath}`);
      return false
    }

    const phoneFolder = Files.phoneToFolder(files);
    console.info(`phoneFolder`, phoneFolder);
    //+998-33-212-95-20.app
    if (!phoneFolder) {
      console.warn(`phoneFolder is null, ${userDir}`);
      return false
    }

    const parentMovedFolder = path.join(globalThis.saveDirApp, phoneFolder);
    console.info(`parentMovedFolder`, parentMovedFolder);
    Files.mkdirIfNotExists(parentMovedFolder);

    const movedFolderPath = path.join(parentMovedFolder, folder);
    console.info(`Moving ${userDir} to ${movedFolderPath}`);

    // move folder using fs
    Files.moveWithCommas(userDir, movedFolderPath);
    if (!fs.existsSync(movedFolderPath)) {
      console.error(`Error with Move, ${userDir} to ${movedFolderPath}`);
    }
    else {
      await Puppe.actualizePhoneFolder(parentMovedFolder);
      console.info(`Moved ${userDir} to ${movedFolderPath}`);
    }


  }








  static async appFindPhones() {

    // get parent path of appolxPath

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&
      !file.includes('ALL') &&
      !file.includes('App') &&
      !file.includes('Azk') &&
      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    let foldersToScan = [];

    for (const folder of folders) {

      console.info(`\r\nFolder Name: ${folder}`);

      const userDir = path.join(globalThis.saveDir, folder);
      console.info(`Scanning ${userDir} for folders`);

      let clones = ES.find(folder)
      //  console.info(`Found ${clones.length} clones`, clones);

      clones = clones.filter(clone => clone.toLowerCase() !== userDir.toLowerCase());
      console.info(`Filtered ${clones.length} clones`, clones);

      if (clones.length === 0) {
        console.info(`⚠️ Folder ${folder} has no clones`);
        continue
      }

      // iterate clones
      for (const clone of clones) {
        console.info(`Clone Name: ${clone}`);
        const files = ES.getPhones(clone, true);

        if (files.length === 0) {
          console.info(`⚠️ Folder ${folder} has no phone files`);
          continue
        }

        console.info(`Found ${files.length} phone files`, files);
        // copy all files into userDir
        for (const file of files) {
          const fileName = path.basename(file);
          const dest = path.join(userDir, fileName);
          console.info(`Dest File:  ${file} to ${dest}`);
          if (!fs.existsSync(dest)) {
            fs.copyFileSync(file, dest);
            console.info(`Copied ${file} to ${dest}`);
          }
          else {
            console.info(`File ${dest} already exists`);
          }
        }


      }



    }



  }

  static async getNoPhones() {
    // get parent path of appolxPath

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&
      !file.includes('ALL') &&
      !file.includes('App') &&
      !file.includes('Azk') &&
      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    let foldersToScan = [];

    for (const folder of folders) {

      const userDir = path.join(globalThis.saveDir, folder);
      console.info(`Scanning ${userDir} for folders`);

      // scan in folder not recursive for +998.*.app files in not exists push this folder path to new array
      const files = ES.getPhones(userDir);
      if (files.length !== 0) {
        console.info(`⚠️ Folder ${folder} already has phone number`);
      } else {
        console.info(`➡️ Adding Olx Appolx Folder: ${folder}`);

        foldersToScan.push(path.join(globalThis.saveDir, folder));
      }

    }

    const noPhoneJson = path.join(globalThis.mhtmlDir, 'NoPhone.json');
    console.info(`NoPhoneJson: ${noPhoneJson}`);

    Files.writeJson(noPhoneJson, foldersToScan)

    console.info(`Scanned ${foldersToScan.length} folders for +998.*.app files`);
    console.info(`Folders to scan: ${foldersToScan}`);
    return noPhoneJson
  }

  static async appSavePhones() {

    const noPhoneJson = await Puppe.getNoPhones();
    const foldersToScan = Files.readJson(noPhoneJson);

    console.info(`Scanned ${foldersToScan.length} folders for +998.*.app files`);
    console.info(`Folders to scan: ${foldersToScan}`);

    // iterate through foldersToScan. scan for folders inside folder
    for (const folderToScan of foldersToScan) {

      let folderApp;
      // scan folder for folders
      const folders = fs.readdirSync(folderToScan).filter(file => fs.statSync(path.join(folderToScan, file)).isDirectory());
      for (const folder of folders) {
        console.info(`OLX Offer Folder found: ${folder}`);
        folderApp = path.join(folderToScan, folder);
        continue
      }

      if (!folderApp || !fs.existsSync(folderApp)) {
        console.info(`⚠️ folderApp not found: ${folderApp}`);
        continue;
      }

      // make full path for 
      const mainMhtml = path.join(folderApp, 'ALL.mhtml');
      if (!fs.existsSync(mainMhtml)) {
        console.info(`⚠️ MHTML file not found: ${mainMhtml}`);
        continue;
      }


      console.info(`OLX Offer MHTML found: ${mainMhtml}`);

      const url = await Chromes.getUrlFromMht(mainMhtml);
      console.info(`OLX Offer URL found: ${url}`);

      const isPhone = await Puppe.scrapePhone(url, folderToScan);
      if (isPhone) {
        await Puppe.saveAsMhtml(globalThis.page, path.join(folderApp, `ALL.mhtml`));
      }
      await Dates.sleep(1000)
    }

    await Puppe.getNoPhones();

  }




  static async appSaveOffers() {

    console.info(globalThis.mhtmlDirDataAllJson, 'mhtmlDirDataAllJson globalThis');

    try {
      if (fs.existsSync(globalThis.mhtmlDirDataAllJson)) {

        // read this json. globalThis.mhtmlDirPageAllJson iterate through all pages and save them as mhtml files
        let mhtmlDirDataAllJson = JSON.parse(fs.readFileSync(globalThis.mhtmlDirDataAllJson, 'utf8'));

        for (const pageUrl of mhtmlDirDataAllJson) {
          console.info(`➡️ Loading Olx Post: ${pageUrl}`);
          await Puppe.scrapeOffers(pageUrl);

          // remove pageUrl from mhtmlDirDataAllJson
          mhtmlDirDataAllJson = mhtmlDirDataAllJson.filter(url => url !== pageUrl);

        }
        console.info(`Remaining pages: ${mhtmlDirDataAllJson.length}`);
        Files.writeJson(globalThis.mhtmlDirDataAllJson, mhtmlDirDataAllJson);

      }
    } catch (error) {
      console.error(error);

      console.info(`⚠️ Code: ${error.code} Message: ${error.message}`);
      //    Dialogs.messageBoxAx(`⚠️ Code: ${error.code} Message: ${error.message}`, 'Error');

      await Chromes.runBrowser();

      await this.appSaveOffers();
    }


  }


  static async pageTitle(page) {
    if (!page || page.isClosed()) return;
    // Safe file naming
    let title = await page.title();

    title = Files.cleanupFileName(title);

    title = title.replace(" на Olx", "");
    console.info(`💾 title: ${title}`);

    return title;
  }


  static async scrollAds(page) {
    if (!page || page.isClosed()) return;
    const Wait_Min = process.env.Wait_Min || 5;
    const Wait_Max = process.env.Wait_Max || 30;
    const Scroll_Count_Min = process.env.Scroll_Count_Min || 2;
    const Scroll_Count_Max = process.env.Scroll_Count_Max || 5;

    // Random waiting and scrolling to simulate human behavior
    const waitTime = Chromes.getRandomInt(parseInt(Wait_Min), parseInt(Wait_Max));
    const scrollCount = Chromes.getRandomInt(parseInt(Scroll_Count_Min), parseInt(Scroll_Count_Max));

    console.info(`⏳ Waiting for ${waitTime}s with ${scrollCount} random scrolls...`);

    const timePerScroll = waitTime / (scrollCount + 1);
    const pageHeight = await page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const maxScroll = pageHeight - viewportHeight;

    // Initial wait before first scroll
    await new Promise(resolve => setTimeout(resolve, timePerScroll * 1000));

    for (let i = 0; i < scrollCount; i++) {
      const scrollPosition = Chromes.getRandomInt(0, maxScroll);
      console.info(`🖱️ Scroll ${i + 1}/${scrollCount}: Scrolling to ${scrollPosition}px...`);
      await page.evaluate(pos => window.scrollTo(0, pos), scrollPosition);
      const scrollDelay = Chromes.getRandomFloat(0.5, 2.5);
      await new Promise(resolve => setTimeout(resolve, scrollDelay * 1000));
    }

    const finalScrollPosition = Chromes.getRandomInt(0, maxScroll);
    console.info(`🖱️ Final scroll to ${finalScrollPosition}px before checking phone...`);
    await page.evaluate(pos => window.scrollTo(0, pos), finalScrollPosition);


  }



}


