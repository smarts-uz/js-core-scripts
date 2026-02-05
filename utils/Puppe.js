
import puppeteer, { Dialog } from "puppeteer";
import { Files } from "./Files.js";
import path from "path";
import fs from "fs";
import { Chromes } from "./Chromes.js";
import { Dialogs } from "./Dialogs.js";
import { Dates } from "./Dates.js";
import { ES } from "./ES.js";
import { exit } from "process";
import { Phone } from "./Phone.js";
import { Yamls } from "./Yamls.js";

export class Puppe {
  constructor(parameters) {


    // create file inside Chromes.folder

    // get rate from

  }




  static async humanScroll() {

    const humanScrollStep = parseInt(Yamls.getConfig('humanScrollStep'));
    console.info('humanScrollStep', humanScrollStep);

    for (let i = 0; i < humanScrollStep; i++) {

      try {

        const humanScrollDeltaY = parseInt(Yamls.getConfig('humanScrollDeltaY'));
        console.info('humanScrollDeltaY', humanScrollDeltaY);

        const deltaY = Dates.randomIntOne(humanScrollDeltaY);
        console.info('deltaY', deltaY);

        await globalThis.page.mouse.wheel({ deltaY });
      } catch (err) {

        console.warn('humanScroll Failed:', err.message);
        break;
      }

      await Dates.sleep(400);
    }
  }



  static async autoScroll(step = 400, delay = 150) {

    await globalThis.page.evaluate(
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
    selector,
    {
      step = 500,
      delay = 300,
      maxScrolls = 30
    } = {}
  ) {
    for (let i = 0; i < maxScrolls; i++) {
      const found = await globalThis.page.$(selector);
      if (found) return true;

      await globalThis.page.evaluate((step) => {
        window.scrollBy(0, step);
      }, step);

      await globalThis.page.waitForTimeout(delay);
    }

    return false;
  }

  /**
   * Saves all ads from a search page, including pagination
   */
  static async extractOffers() {

    let adLinks = await globalThis.page.$$eval(
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





  static async extractUserId() {
    const selector = 'a[data-testid="user-profile-link"]'

    let matches = await globalThis.page.$eval(selector, a => {
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

    const description = await globalThis.page.$eval(
      '[data-cy="ad_description"] > div:last-child',
      el => el.textContent.trim()
    );

    //  console.info('description', description);

    return description;

  }






  static async extractApp(pattern, page) {

    console.info('extractApp pattern: ', pattern);

    try {
      const username = await globalThis.page.$eval(
        pattern,
        el => el.textContent.trim()
      );

      console.info('extractApp Extracted:', username);

      return username;
    } catch (error) {
      return null
    }

  }

  static async extractAppPhone(pattern, page) {

    try {
      const username = await globalThis.page.$eval(
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

    let id = await globalThis.page.$eval(
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


  static async showPhone() {
    // await Puppe.scrollAds(page);


    // ✅ Handle phone number display\
    let phone;
    try {
      const phoneButtons = await globalThis.page.$$('button[data-testid="show-phone"]');
      console.info(`Found phoneButtons ${phoneButtons.length} phone buttons`, phoneButtons);

      if (phoneButtons.length === 0) {
        console.warn(`⚠️ No phone buttons found`);
        return false;
      }


      for (const btn of phoneButtons) {
        const visible = await btn.isVisible?.() || await btn.evaluate(el => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length));
        if (visible) {
          console.info('📞 Found visible phone button, clicking...');
          await btn.click();

          const timeout = Number(Yamls.getConfig('phoneClickTimeout')) || 5000;
          console.info(`Waiting for phone number to appear (${timeout}ms)...`);

          await globalThis.page.waitForSelector('[data-testid="contact-phone"]', { timeout: timeout });
          phone = await globalThis.page.$eval(
            'a[data-testid="contact-phone"]',
            el => el.getAttribute("href").replace("tel:", "")
          );

          if (phone) {
            console.info('✅ Phone number displayed!', phone);
            return phone;
          } else {
            console.warn('❌ No phone number found');
          }
        }
      }
    } catch (err) {
      console.warn(`⚠️ Phone handling error: ${err.message}`);
      return null
    }

    return null

  }


  static async saveAsMhtml(filePath) {
    try {
      console.info("🧩 Capturing MHTML snapshot...");
      const cdp = await globalThis.page.createCDPSession();
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
            `❌ Failed to capture MHTML for ${globalThis.page.url()}: The page may contain resources or frames that prevent MHTML generation.`
          );
        } else {
          console.error(`â ï¸ Failed to capture MHTML for ${globalThis.page.url()}: ${mhtmlErr.message}`);
        }


      }
    } catch (err) {
      console.error(`⚠️ Unexpected error during MHTML capture for ${globalThis.page.url()}: ${err.message}`);
    }
  }


  static async scrapeOffers(url) {


    console.info(`➡️ Loading Olx Post scrapeOffers: ${url}`);

    await Chromes.pageGo(url, { waitUntil: "networkidle2" });

    await Puppe.humanScroll();
    console.info(`networkidle2`);

    const slugApp = url.match(/\/obyavlenie\/([^\/]+)-ID/i);
    const slug = slugApp?.[1];
    console.info(`Safe Name: ${slug}`);

    const { href, match } = await Puppe.extractUserId();

    if (!match)
      Dialogs.warningBox(
        `⚠️ Failed to extract user ID from ${url}. Please check the URL and try again.`
      );


    const userIdPath = path.join(globalThis.saveDir, match);
    console.info(`User ID Path: ${userIdPath}`);

    const title = await Puppe.pageTitle();
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

      const phones = Phone.extractUzbekPhones(content);
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
      '[data-nx-name="P2"] span',
      '[data-testid="distance-field"]',
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
    console.info(`Saving ${filePathMhtml}`);
    await Puppe.saveAsMhtml(filePathMhtml);

    const offerMhtmlPath = path.join(globalThis.saveDirMht, `${title}.mhtml`);
    console.info(`Copying to ${offerMhtmlPath}`);
    fs.copyFileSync(filePathMhtml, offerMhtmlPath);

    const offerUrlPath = path.join(globalThis.saveDirUrl, `${slug}.url`);
    console.info(`Saving ${offerUrlPath}`);
    Chromes.saveUrlFileFromMht(offerMhtmlPath, offerUrlPath);

    await Puppe.scrapeUser(href, userIdPath, match)

    if (fs.existsSync(offerMhtmlPath))
      return true;

    return false;

  }


  static async scrapePhone(url, userIdPath) {

    console.info(`➡️ Loading Olx Post scrapePhone: ${url}`);

    await Chromes.pageGo(url, { waitUntil: "networkidle2" });

    await Puppe.humanScroll();

    const phone = await Puppe.showPhone();
    console.info(`Phone: ${phone}`);

    switch (phone) {
      case false:
        return false

      case null:
        Files.saveInfoToFile(userIdPath, '#PhoneError');
        await Dates.sleep(500)
        await Chromes.runBrowser(true, false)
        await Puppe.scrapePhone(url, userIdPath)
        return false

      default:
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
    await Chromes.pageGo(url, { waitUntil: "networkidle2" });

    await Puppe.humanScroll();

    await Puppe.saveAsMhtml(userIdALLMhtml);

    // remove all files in userIdPath which end with .app
    Files.removeFilesWithExtension(userIdPath, '.app');

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
    let folders = Files.findRecursiveFull(fullPath, function (file) {
      return file.includes('Мы нашли') && file.includes('объявлений')
    });
    console.info(`Found ${folders.length} folders`, folders);

  }


  static async scrapePages(url) {


    console.info(`➡️ Loading Catalog: ${url}`);
    await Chromes.pageGo(url, { waitUntil: "networkidle2" });

    //  await Puppe.humanScroll();

    console.info(`networkidle2`);

    const title = await Puppe.pageTitle();

    let adLinks = await Puppe.extractOffers()
    console.info(`adLinks`, adLinks)

    const filePathJson = path.join(globalThis.mhtmlDirData, `${title}.json`);
    Files.writeJson(filePathJson, adLinks)

    const filePathMhtml = path.join(globalThis.mhtmlDirPage, `${title}.mhtml`);
    await Puppe.saveAsMhtml(filePathMhtml);


  }


  static async appSavePagination() {

    await Chromes.runBrowser(false, false)

    console.info(globalThis.mhtmlDir, 'mhtmlDir globalThis');

    Files.backupFolderZip(globalThis.mhtmlDirPage);

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
      await Puppe.itemSavePagination(url);

    }

    Files.combineJsonFiles(globalThis.mhtmlDirPage);

  }


  static async itemSavePagination(url) {


    console.info(`📖 Загружаю главную страницу для получения пагинации: ${url}`);

    await Chromes.pageGo(url, { waitUntil: "networkidle2" });

    const title = await Puppe.pageTitle();
    console.info(`Title: ${title}`);

    // Прокручиваем вниз для загрузки пагинации
    await Puppe.humanScroll();

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

    await Chromes.runBrowser(false, false)

    Files.backupFolderZip(globalThis.mhtmlDirData);

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



  static async appSavePhones() {

    const foldersToScan = Phone.getNoPhones();

    if (foldersToScan.length === 0) {
      console.warn(`⚠️ No folders to scan`);
      return;
    }

    await Chromes.runBrowser(true, false)


    // iterate through foldersToScan. scan for folders inside folder
    for (const folderToScan of foldersToScan) {

      let folderApp;
      // scan folder for folders
      const folders = fs.readdirSync(folderToScan).filter(file => fs.statSync(path.join(folderToScan, file)).isDirectory());
      console.info(`OLX Offer Folders: ${folders.length}`, folders);

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
        await Puppe.saveAsMhtml(path.join(folderApp, `ALL.mhtml`));
      }
      Phone.getNoPhones();
      await Dates.sleep(500)
    }


  }




  static async appSaveOffers() {

    console.info(globalThis.mhtmlDirDataAllJson, 'mhtmlDirDataAllJson globalThis');

    try {
      if (fs.existsSync(globalThis.mhtmlDirDataAllJson)) {

        // read this json. globalThis.mhtmlDirPageAllJson iterate through all pages and save them as mhtml files

        let mhtmlDirDataAllJson = Files.readJson(globalThis.mhtmlDirDataAllJson);

        if (mhtmlDirDataAllJson.length === 0) {
          console.info(`No pages found in ${globalThis.mhtmlDirDataAllJson}`);
          return;
        }

        await Chromes.runBrowser(false, false)

        for (const pageUrl of mhtmlDirDataAllJson) {
          const status = await Puppe.scrapeOffers(pageUrl);

          if (status) {
            // remove pageUrl from mhtmlDirDataAllJson
            mhtmlDirDataAllJson = mhtmlDirDataAllJson.filter(url => url !== pageUrl);

            console.info(`Remaining pages: ${mhtmlDirDataAllJson.length}`);
            Files.backupFile(globalThis.mhtmlDirDataAllJson);
            Files.writeJson(globalThis.mhtmlDirDataAllJson, mhtmlDirDataAllJson);
          }

        }


      }
    } catch (error) {
      console.error(error);

      console.info(`⚠️ Code: ${error.code} Message: ${error.message}`);
      //    Dialogs.messageBoxAx(`⚠️ Code: ${error.code} Message: ${error.message}`, 'Error');

      await Dates.sleep(500)

      await Chromes.runBrowser(false, false)

      await this.appSaveOffers();
    }


  }


  static async pageTitle() {
    // Safe file naming
    let title = await globalThis.page.title();

    title = Files.cleanupFileName(title);

    title = title.replace(" на Olx", "");
    console.info(`💾 title: ${title}`);

    return title;
  }


  static async scrollAds() {
    const Wait_Min = Yamls.getConfig('Wait_Min') || 5;
    const Wait_Max = Yamls.getConfig('Wait_Max') || 30;
    const Scroll_Count_Min = Yamls.getConfig('Scroll_Count_Min') || 2;
    const Scroll_Count_Max = Yamls.getConfig('Scroll_Count_Max') || 5;

    // Random waiting and scrolling to simulate human behavior
    const waitTime = Chromes.randomInt(parseInt(Wait_Min), parseInt(Wait_Max));
    const scrollCount = Chromes.randomInt(parseInt(Scroll_Count_Min), parseInt(Scroll_Count_Max));

    console.info(`⏳ Waiting for ${waitTime}s with ${scrollCount} random scrolls...`);

    const timePerScroll = waitTime / (scrollCount + 1);
    const pageHeight = await globalThis.page.evaluate(() => document.body.scrollHeight);
    const viewportHeight = await globalThis.page.evaluate(() => window.innerHeight);
    const maxScroll = pageHeight - viewportHeight;

    // Initial wait before first scroll
    await new Promise(resolve => setTimeout(resolve, timePerScroll * 1000));

    for (let i = 0; i < scrollCount; i++) {
      const scrollPosition = Chromes.randomInt(0, maxScroll);
      console.info(`🖱️ Scroll ${i + 1}/${scrollCount}: Scrolling to ${scrollPosition}px...`);
      await globalThis.page.evaluate(pos => window.scrollTo(0, pos), scrollPosition);
      const scrollDelay = Chromes.getRandomFloat(0.5, 2.5);
      await new Promise(resolve => setTimeout(resolve, scrollDelay * 1000));
    }

    const finalScrollPosition = Chromes.randomInt(0, maxScroll);
    console.info(`🖱️ Final scroll to ${finalScrollPosition}px before checking phone...`);
    await globalThis.page.evaluate(pos => window.scrollTo(0, pos), finalScrollPosition);


  }



}


