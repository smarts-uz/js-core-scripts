import fs from "fs";
import path from "path";
import { Files } from "./Files.js";
import { ES } from "./ES.js";
import { Puppe } from "./Puppe.js";





export class Phone {
  constructor() {

  }






  static phoneToFolder(phones) {
    // phones is an array of strings like ['+998-20-001-33-14.app', '+998-33-999-96-99.app']

    let cleanedPhones = phones.map(phone => {
      // For each 'phone' string in the array, apply the cleaning chain:
      return this.phoneToFolderItem(phone);
    });

    // implode  cleanedPhones with ,
    cleanedPhones = cleanedPhones.join(', ');
    return cleanedPhones;
  }

  static phoneToFolderItem(phone) {

    /**
     * @typedef {String} phone
     */
    if (!phone.startsWith('+998-88'))
      phone = phone.replace('+998-', '');

    phone = phone
      .replace('.app', ''); // Removes the suffix

    return phone;
  }



  static isPhone(file) {
    return file.includes('+998') && file.endsWith('.app') && file.length === 21;
  }

  static isPhoneStatus(file) {
    return file.includes('#PhoneOK') || file.includes('#PhoneError');
  }

  static isRegion(file) {
    return file.includes('район');
  }

  static getPhones(userDir, fullPath = false) {
    let files = fs.readdirSync(userDir).filter(file => Phone.isPhone(file));

    console.info(`Found ${files.length} phones`, files);

    if (fullPath) {
      files = files.map(file => `${userDir}\\${file}`)
    }

    return files

  }

  static getPhoneStatus(userDir, fullPath = false) {
    let files = fs.readdirSync(userDir).filter(file => Phone.isPhoneStatus(file));

    console.info(`Found ${files.length} phone status`, files);

    if (fullPath) {
      files = files.map(file => `${userDir}\\${file}`)
    }

    return files

  }



  static getRegions(userDir, fullPath = false) {
    let files = fs.readdirSync(userDir).filter(file => Phone.isRegion(file));

    console.info(`Found ${files.length} regions`, files);

    if (fullPath) {
      files = files.map(file => `${userDir}\\${file}`)
    }

    return files

  }

  static actualizePhoneFolder(paths) {

    // recursive scan for path. filter, include +998 and .app
    // Recursively find all files under 'path' that include '+998' and '.app'

    let results = Files.findRecursive(paths, function (file) {
      return Phone.isPhone(file)
    });
    console.info(`Found ${results.length} files`, results);

    // remove duplicates
    results = [...new Set(results)];
    console.info(`Found ${results.length} files. After duplicates removal`, results);

    let resultsFullPaths = Files.findRecursiveFull(paths, function (file) {
      return Phone.isPhone(file)
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
    const phoneFolder = Phone.phoneToFolder(results);
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


  static getNoPhones() {
    // get parent path of appolxPath

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&

      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    let foldersHasPhone = [];
    let foldersHasNotPhone = [];

    for (const folder of folders) {

      const userDir = path.join(globalThis.saveDir, folder);
      console.info(`Scanning ${userDir} for folders`);

      // scan in folder not recursive for +998.*.app files in not exists push this folder path to new array
      const files = Phone.getPhones(userDir);
      if (files.length !== 0) {
        console.info(`⚠️ Folder ${folder} already has phone number`);
        foldersHasPhone.push(userDir);
      } else {
        console.info(`➡️ Adding Olx Appolx Folder: ${folder}`);
        foldersHasNotPhone.push(userDir);
      }

    }

    console.info(`Found Folders has Number ${foldersHasPhone.length}`, foldersHasPhone);
    Files.backupFile(globalThis.mhtmlDirPhoneHasJson)
    Files.writeJson(globalThis.mhtmlDirPhoneHasJson, foldersHasPhone)

    console.info(`Found Folders has not Number ${foldersHasNotPhone.length}`, foldersHasNotPhone);
    Files.backupFile(globalThis.mhtmlDirPhoneHasNotJson)
    Files.writeJson(globalThis.mhtmlDirPhoneHasNotJson, foldersHasNotPhone)

    return foldersHasNotPhone

  }



  static appFindPhones() {

    // get parent path of appolxPath

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&

      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    let clonesCount = 0;

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
      } else {
        console.info(`Found clones: ${clones.length}`, clones);
        Files.saveInfoToFile(userDir, '#HasClone');
        clonesCount += clones.length;
      }

      // iterate clones
      for (const clone of clones) {
        console.info(`Clone Name: ${clone}`);

        const phone = Phone.getPhones(clone, true);
        const phoneParent = Phone.getPhones(path.dirname(clone), true);
        const phoneStatus = Phone.getPhoneStatus(clone, true);
        const regions = Phone.getRegions(clone, true);

        console.info(`Phone: ${phone}`);
        console.info(`Phone Parent: ${phoneParent}`);
        console.info(`Phone Status: ${phoneStatus}`);
        console.info(`Regions: ${regions}`);

        const files = [...phone, ...phoneParent, ...phoneStatus];

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

    console.info(`ALL Clones Count: ${clonesCount}`);

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



  static appMergePhones() {

    console.info(`Scanning ${globalThis.saveDir} for folders`);

    // scan appolxPathParent for folders, exclude - Theory and  ALL and App folders
    const folders = fs.readdirSync(globalThis.saveDir).filter(file =>
      fs.statSync(path.join(globalThis.saveDir, file)).isDirectory() &&
      !file.includes('@') &&
      !file.includes('#') &&
      file !== '- Theory'
    );

    for (const folder of folders) {
      Phone.itemMergePhones(folder);
    }

  }



  static appCalculateCountOnline() {

    let results = Files.findRecursiveFull(globalThis.saveDirApp, function (file) {
      return file.includes('#OfferCount');
    });
    console.info(`Found ${results.length} files`, results);

    if (results.length > 0) {
      for (const result of results) {
        console.info(`Remove file: ${result}`);
        fs.unlinkSync(result);
      }
    }

    const folders = fs.readdirSync(globalThis.saveDirApp).filter(file =>
      fs.statSync(path.join(globalThis.saveDirApp, file)).isDirectory()
    );

    for (const name of folders) {

      // if is absolute path name
      let folder;
      if (!path.isAbsolute(name)) {
        folder = path.join(globalThis.saveDirApp, name);
      } else {
        folder = name;
      }

      Phone.itemCalculateCountOnline(folder);
      Phone.collectRegions(folder);
    }

  }

  static collectRegions(folder) {
    console.info(`Collect regions: ${folder}`);

    let regions = Files.findRecursiveFull(folder, function (file) {
      return file.includes('район');
    }, );

    console.info(`Regions: ${regions.length}`);

    for (const region of regions) {
      console.info(`Region: ${region}`);
      // copy them to folder
      const dest = path.join(folder, path.basename(region));

      fs.copyFileSync(region, dest);
      console.info(`Copied ${region} to ${dest}`);
    }
  }

  static itemCalculateCountOnline(folder) {

    console.info(`Calculate count online: ${folder}`);

    let offerCounts = Files.findRecursive(folder, function (file) {
      return file.includes('Мы нашли');
    });

    if (offerCounts.length > 0) {
      console.info(`Offers Count: ${offerCounts.length}`);

      let sum = 0;
      for (const offerCount of offerCounts) {
        console.info(`Offers Count: ${offerCount}`);

        // exterct number from Мы нашли 407 объявлений.app
        const number = offerCount.match(/\d+/)[0];
        console.info(`Number: ${number}`);
        sum += parseInt(number);
      }

      console.info(`Sum: ${sum}`);
      Files.saveInfoToFile(folder, `#OfferCount ${sum}`);


    }

    let lastSeens = Files.findRecursive(folder, function (file) {
      return file.includes('Онлайн');
    });

    if (lastSeens.length > 0) {
      console.info(`Last Seen: ${lastSeens.length}`);

      for (const lastSeen of lastSeens) {
        console.info(`Last Seen: ${lastSeen}`);
      }
    }

  }



  static itemRemoveCountOnline(name) {
    console.info(`Remove count online: ${name}`);

    // if is absolute path name
    let folder;
    if (!path.isAbsolute(name)) {
      folder = path.join(globalThis.saveDirApp, name);
    } else {
      folder = name;
    }

    console.info(`Folder: ${folder}`);

    let results = Files.findRecursiveFull(folder, function (file) {
      return file.includes('Мы нашли') || file.includes('Онлайн');
    });
    console.info(`Found ${results.length} files`, results);

    if (results.length === 0) {
      console.info(`⚠️ No files found`);
      return;
    }

    for (const result of results) {
      console.info(`Remove file: ${result}`);
      fs.unlinkSync(result);
    }


  }

  static itemMergePhones(folder) {

    console.info(`Folder: ${folder}`);

    const userDir = path.join(globalThis.saveDir, folder);
    console.info(`Scanning ${userDir} for folders`);

    // scan in folder not recursive for +998.*.app files in not exists push this folder path to new array
    const files = Phone.getPhones(userDir);

    // iterate files as file, get phoneToFolderItem
    for (const file of files) {

      const phoneFolderItem = Phone.phoneToFolderItem(file);
      console.info(`phoneFolderItem IN`, phoneFolderItem);

      // scan globalThis.saveDirApp for phoneFolderItem usibng readdirSync  

      const found = fs.readdirSync(globalThis.saveDirApp).filter(file =>
        fs.statSync(path.join(globalThis.saveDirApp, file)).isDirectory() &&
        file.includes(phoneFolderItem)
      );
      console.info(`Found ${found.length} folders with such phone IN`, found);

      if (found.length === 0) {
        console.warn(`No folders found with such phone IN`);
        continue
      }

      Phone.innerMovePhoneFolder(userDir, found[0]);

    }


    const phoneFolder = Phone.phoneToFolder(files);
    console.info(`phoneFolder`, phoneFolder);
    //+998-33-212-95-20.app
    if (!phoneFolder) {
      console.warn(`phoneFolder is null, ${userDir}`);
      return false
    }

    Phone.innerMovePhoneFolder(userDir, phoneFolder);

  }

  static innerMovePhoneFolder(userDir, phoneFolder) {

    if (!fs.existsSync(userDir)) {
      console.warn(`UserDir Not existsSync, ${userDir}`);
      return false
    }

    const parentMovedFolder = path.join(globalThis.saveDirApp, phoneFolder);
    console.info(`parentMovedFolder IN`, parentMovedFolder);
    Files.mkdirIfNotExists(parentMovedFolder);

    const userDirTargetName = path.basename(userDir);
    console.info(`userDirTargetName`, userDirTargetName);

    const userDirTarget = path.join(parentMovedFolder, userDirTargetName);
    console.info(`Moving ${userDir} to ${userDirTarget}`);

    if (fs.existsSync(userDirTarget)) {
      console.info(`Folder ${userDirTarget} movedFolderPath already exists`);
      Phone.itemRemoveCountOnline(userDirTarget);
    }

    console.info(`Moving IN ${userDir} to ${userDirTarget}`);

    Files.moveFolder(userDir, userDirTarget);

    if (!fs.existsSync(userDirTarget)) {
      console.error(`Error IN with Move, ${userDir} to ${userDirTarget}`);
      return false
    }
    else {
      console.info(`Moved IN ${userDir} to ${userDirTarget}`); // Changed from Moved to Moved IN
      Phone.actualizePhoneFolder(parentMovedFolder);
      return true
    }
  }


}