
import puppeteer, { Dialog } from "puppeteer";
import { Files } from "./Files.js";
import path from "path";
import fs from "fs";
import { Chromes } from "./Chromes.js";
import { Dialogs } from "./Dialogs.js";
import { Dates } from "./Dates.js";

export class Puppe {
  constructor(parameters) {

  }




  static async autoScroll(page, distance = 300, setIntervalTime = 50) {
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


  /**
   * Saves all ads from a search page, including pagination
   */
  static async extractOffers(page) {

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

    const offerURLPath = path.join(globalThis.saveDirALL, `${slug}.url`);
    console.info(`Offer URL Path: ${offerURLPath}`);

    if (fs.existsSync(offerURLPath)) {
      console.info(`⚠️ Offer already exists: ${offerURLPath}`);
      return;
    }

    await Dates.sleepPro(1000)

    Chromes.saveUrlFile(offerURLPath, url);


    console.info(`➡️ Loading Olx Post: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await Puppe.autoScroll(globalThis.page, process.env.distance, process.env.setIntervalTime);
    console.info(`domcontentloaded`);

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
      const text = await Puppe.extractApp(pattern, page);
      if (text) {
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
    
    await globalThis.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await Puppe.autoScroll(globalThis.page, process.env.distanceGo, process.env.setIntervalTimeGo);

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
    } else {
      await Chromes.runBrowser(true, false)
      Files.saveInfoToFile(userIdPath, '#PhoneError');
      await Dates.sleepPro(1000)
    }

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

  }


  static async scrapeUser(url, userIdPath, match) {

    const userIdALLMhtml = path.join(userIdPath, `User ${match}.mhtml`);
    console.info(`User Id ALL Mhtml: ${userIdALLMhtml}`);

    if (fs.existsSync(userIdALLMhtml)) {
      console.info(`⚠️ User already exists: ${userIdALLMhtml}`);
      return;
    }

    console.info(`➡️ Loading Olx Post: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await Puppe.autoScroll(globalThis.page, process.env.distance, process.env.setIntervalTime);

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
      const text = await Puppe.extractApp(pattern, page);
      if (text) {
        Files.saveInfoToFile(userIdPath, text);
      }
    }



  }



  static async scrapePages(url) {


    console.info(`➡️ Loading Catalog: ${url}`);
    await globalThis.page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    await Puppe.autoScroll(globalThis.page, process.env.distancePage, process.env.setIntervalTimePage);
    console.info(`domcontentloaded`);

    const title = await Puppe.pageTitle(globalThis.page);

    let adLinks = await Puppe.extractOffers(globalThis.page)
    console.info(`adLinks`, adLinks)

    const filePathJson = path.join(globalThis.mhtmlDataDir, `${title}.json`);
    Files.writeJson(filePathJson, adLinks)

    const filePathMhtml = path.join(globalThis.mhtmlPageDir, `${title}.mhtml`);
    await Puppe.saveAsMhtml(page, filePathMhtml);


  }



  static async savePagination(browser) {


    await globalThis.page.setViewport({ width: 1280, height: 900 });
    console.info(`📖 Загружаю главную страницу для получения пагинации: ${globalThis.mhtmlUrl}`);
    await globalThis.page.goto(globalThis.mhtmlUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    // Прокручиваем вниз для загрузки пагинации
    await Puppe.autoScroll(page, process.env.distancePage, process.env.setIntervalTimePage);

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
        //   await Puppe.sleep(1500); // Wait for page to load
        attempts++;
      }
    }

    // Scroll back to top to ensure we can see all pagination
    await globalThis.page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    //   await Puppe.sleep(1000);

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
    paginationUrls.push(globalThis.mhtmlUrl);

    if (maxPageNumber > 0) {
      const currentUrl = globalThis.page.url();
      const urlObj = new URL(currentUrl);

      // Generate URLs for all pages from 2 to maxPageNumber
      for (let i = 2; i <= maxPageNumber; i++) {
        urlObj.searchParams.set('page', i.toString());
        paginationUrls.push(urlObj.toString());
      }
    }

    // Also try multiple approaches to get pagination URLs as fallback
    const fallbackUrls = await globalThis.page.evaluate(() => {
      // Get all pagination links, not just from ul.pagination-list
      const elements = Array.from(document.querySelectorAll('ul.pagination-list a, .pager a'));
      return elements
        .map(el => {
          // Try href attribute first, then href property
          return el.getAttribute('href') || el.href;
        })
        .filter(url => url && !url.includes('javascript:') && !url.includes('#') && url.trim() !== '')
        .map(url => {
          // Make sure URLs are absolute
          if (url.startsWith('/')) {
            const baseUrl = window.location.origin;
            return baseUrl + url;
          }
          return url;
        });
    });

    // Also check for data-page attributes or other pagination patterns
    const additionalUrls = await globalThis.page.evaluate(() => {
      const urls = [];
      const baseUrl = window.location.origin;

      // Look for data-page attributes
      const pageElements = document.querySelectorAll('[data-page]');
      pageElements.forEach(el => {
        const page = el.getAttribute('data-page');
        if (page && !isNaN(page)) {
          // Try to construct URL - this is heuristic-based
          const currentUrl = new URL(window.location.href);
          currentUrl.searchParams.set('page', page);
          urls.push(currentUrl.toString());
        }
      });

      return urls;
    });

    // Combine all found URLs
    const allUrls = [...paginationUrls, ...fallbackUrls, ...additionalUrls];

    // Remove duplicates and current page
    const uniqueUrls = [...new Set(allUrls)].filter(url => {
      try {
        const currentUrl = new URL(window.location.href);
        const checkUrl = new URL(url);
        // Filter out current page
        return checkUrl.searchParams.get('page') !== currentUrl.searchParams.get('page') ||
          (checkUrl.searchParams.get('page') === null && currentUrl.searchParams.get('page') === null && url !== window.location.href);
      } catch {
        return true;
      }
    });

    console.info(`📑 Найдено ${paginationUrls.length} страниц пагинации`);

    // save paginationUrls to file as json to 

    Files.writeJson(globalThis.mhtmlPageDirAllJson, paginationUrls)

    return paginationUrls;

  }

  static async saveAllPages() {

    console.info(globalThis.mhtmlPageDirAllJson, 'mhtmlPageDirAllJson globalThis');

    // read this json. globalThis.mhtmlPageDirAllJson iterate through all pages and save them as mhtml files

    if (fs.existsSync(globalThis.mhtmlPageDirAllJson)) {

      const mhtmlPageDirAllJson = JSON.parse(fs.readFileSync(globalThis.mhtmlPageDirAllJson, 'utf8'));

      for (const pageUrl of mhtmlPageDirAllJson) {
        console.info(`➡️ Loading Olx Catalog Page: ${pageUrl}`);
        await Puppe.scrapePages(pageUrl);
      }

      Files.combineJsonFiles(globalThis.mhtmlDataDir);
    }

  }


  static async saveAllPhones() {

    // get parent path of appolxPath

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file => 
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() && 
      !file.includes('ALL') && 
      !file.includes('App') &&
      file !== '- Theory'
    );

    let foldersToScan = [];

    for (const folder of folders) {

      // scan in folder not recursive for +998.*.app files in not exists push this folder path to new array
      const files = fs.readdirSync(path.join(globalThis.saveDir, folder)).filter(file => file.includes('+998') && file.includes('.app'));
      if (files.length !== 0) {
        console.info(`⚠️ Folder ${folder} already has phone number`);
      } else {
        console.info(`➡️ Adding Olx Appolx Folder: ${folder}`);
        foldersToScan.push(path.join(globalThis.saveDir, folder));
      }

    }

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

      // make full path for 
      const mainMhtml = path.join(folderApp, 'ALL.mhtml');
      console.info(`OLX Offer MHTML found: ${mainMhtml}`);
      
      const url = await Chromes.getUrlFromMht(mainMhtml);
      console.info(`OLX Offer URL found: ${url}`);

      await Puppe.scrapePhone(url, folderToScan);
      await Dates.sleepPro(1000)
    }


  }



  static async saveAllOffers() {

    console.info(globalThis.mhtmlDataDirAllJson, 'mhtmlDataDirAllJson globalThis');

    // read this json. globalThis.mhtmlPageDirAllJson iterate through all pages and save them as mhtml files

    if (fs.existsSync(globalThis.mhtmlDataDirAllJson)) {

      const mhtmlDataDirAllJson = JSON.parse(fs.readFileSync(globalThis.mhtmlDataDirAllJson, 'utf8'));

      for (const pageUrl of mhtmlDataDirAllJson) {
        console.info(`➡️ Loading Olx Post: ${pageUrl}`);
        await Puppe.scrapeOffers(pageUrl);

      }

    }

  }


  static async pageTitle(page) {
    // Safe file naming
    let title = await page.title();

    title = Files.cleanupFileName(title);

    title = title.replace(" на Olx", "");
    console.info(`💾 title: ${title}`);

    return title;
  }


  static async scrollAds(page) {

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


