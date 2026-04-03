import { exec } from "child_process";
import fs from "fs";
import { existsSync } from "fs";
import dayjs from "dayjs";

import yaml from "js-yaml";
import path from "path";
import { Files } from "./Files.js";
import { Word } from "./Word.js";
import { Didox } from "./didox.js";
import { MySoliq } from "./MySoliq.js";
import { Dates } from "./Dates.js";
import { Dialogs } from "./Dialogs.js";
import LinesAndColumns from "lines-and-columns";



export class Yamls {



    static getConfig(keyPath, type = null, defaultValue = null) {
        const config = Files.currentDir() + '\\config.yml';
        if (!fs.existsSync(config)) {
            throw new Error(`YAML Core Config file not found: ${config}`);
        }

        if (!keyPath) {
            throw new Error(`Key path is required`);
        }

        const value = this.getYamlValue(config, keyPath, defaultValue)

        console.log(`Key: ${keyPath}, Value: ${value}`);

        if (Files.isEmpty(value)) {
            console.warn(`Key: ${keyPath}, Value is Empty: ${value}`);
            return defaultValue;
        }

        switch (type) {
            case 'string':
                return value.toString();
            case 'number':
                return Number(value);
            case 'boolean':
                return Boolean(value);
            case 'array':
                return Array.isArray(value) ? value : [value];
            case 'object':
                return typeof value === 'object' && !Array.isArray(value) ? value : {};
            default:
                return value;
        }

    }

    /**
     * Load YAML and return value by dot-notated path
     * @param {string} filePath - path to yaml file
     * @param {string} keyPath - e.g. "Contract.Format"
     * @param {*} defaultValue - optional fallback
     */
    static getYamlValue(filePath, keyPath, defaultValue = undefined) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`YAML file not found: ${filePath}`);
        }

        const doc = yaml.load(fs.readFileSync(filePath, "utf8"));

        return keyPath
            .split(".")
            .reduce((obj, key) => obj?.[key], doc) ?? defaultValue;
    }

    // Read text file and find text line which contains the given text
    static findTextLine(filePath, text) {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');

        for (const line of lines) {
            if (line.includes(text)) {
                return line;
            }
        }

        return null;
    }

    // Replace found line with new text
    static replaceTextLine(filePath, key, value) {

        if (Files.isEmpty(value)) {
            console.log('null value', key, value);
            value = ''
        }

        const fileContent = fs.readFileSync(filePath, 'utf8');
        const lines = fileContent.split('\n');
        let foundLine = null;

        for (let i = 0; i < lines.length; i++) {

            // find line using regex from search from start of string
            const regex = new RegExp(`^${key}:.*`);

            if (regex.test(lines[i])) {
                console.info('Found line:', lines[i], 'Index:', i);

                if (typeof value === "string" && (value.includes('{') || value.includes('}'))) {
                    lines[i] = key + ': "' + value + '"';
                } else {
                    lines[i] = key + ': ' + value;
                }

                foundLine = lines[i];
            }
        }

        if (!foundLine) {
            console.warn(`Line with key "${key}" not found in file ${filePath}.`);
            return;
        }

        fs.writeFileSync(filePath, lines.join('\n'));

        console.log(`File ${filePath} has been updated.`, value);
    }

    static loadYamlWithDeps(ymlFile) {

        console.log("Using ymlFile", ymlFile);
        let data = Yamls.loadAndParseYaml(ymlFile);
        console.log(data, 'data Yaml');


        if (Files.isEmpty(data.WhoAmI)) {
            console.warn("Using default bank", data.WhoAmI);
            data.WhoAmI = Yamls.getConfig('Contract.DefaultBank');
        }

        const whoAmIYaml = path.join(Files.currentDir(), 'bank', data.WhoAmI + ".yaml")
        console.info("Using whoAmIYaml", whoAmIYaml);

        if (!existsSync(whoAmIYaml)) Dialogs.warningBox(whoAmIYaml, "whoAmIYaml file not found. .");

        let whoAmIYamlData = Yamls.loadAndParseYaml(whoAmIYaml);
        console.log(whoAmIYamlData, 'whoAmIYaml Yaml data');

        // merge arrays whoAmIYamlData and data
        data = { ...whoAmIYamlData, ...data };

        if (Files.isEmpty(data.Tariff)) {
            console.warn("Using default tariff", data.Tariff);
            data.Tariff = Yamls.getConfig('Contract.DefaultTariff');
        }

        const priceYaml = path.join(Files.currentDir(), 'cost', data.Tariff + ".yaml")
        console.info("Using priceYaml", priceYaml);

        if (!existsSync(priceYaml)) Dialogs.warningBox(priceYaml, "priceYaml file not found. .");

        let priceYamlData = Yamls.loadAndParseYaml(priceYaml);
        console.log(priceYamlData, 'priceYamlData Yaml data');

        // merge arrays priceYamlData and data
        data = { ...priceYamlData, ...data };
        console.info("Merged data with priceYamlData:", data);


        return data;
    }


    // Load and parse YAML file with custom preprocessing
    static loadAndParseYaml(ymlFile) {
        const yamlOptions = {
            schema: yaml.JSON_SCHEMA,
            onWarning: (e) => { console.warn('YAML ogohlantirishi:', e); }
        };

        const ymlRaw = fs.readFileSync(ymlFile, 'utf8');

        const seenKeys = new Set();
        let skipMode = false;

        const ymlPatched = ymlRaw.split('\n').map(line => {
            const isTopLevel = /^[^\s]/.test(line);

            // Handle duplicate root-level mapping keys within the SAME file
            // When found, enter skipMode to comment out the entire duplicate block
            if (isTopLevel && line.includes(':') && !line.trim().startsWith('#')) {
                const idx = line.indexOf(':');
                let key = line.slice(0, idx);
                let cleanKey = key.trim();

                if ((cleanKey.startsWith('"') && cleanKey.endsWith('"')) || (cleanKey.startsWith("'") && cleanKey.endsWith("'"))) {
                    cleanKey = cleanKey.slice(1, -1);
                }

                if (seenKeys.has(cleanKey)) {
                    skipMode = true;
                    return `# [SKIPPED DUPLICATE] ${line}`;
                } else {
                    seenKeys.add(cleanKey);
                    skipMode = false;
                }
            }

            if (skipMode) {
                return `# [SKIPPED] ${line}`;
            }

            if (!line.includes(':') || line.trim().startsWith('#')) return line;

            const idx = line.indexOf(':');
            let key = line.slice(0, idx);
            let value = line.slice(idx + 1).trim();

            let finalLine = line;

            if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
                let inner = value.slice(1, -1);
                // Clean already escaped to avoid double-escaping
                inner = inner.replace(/\\"/g, '"');
                // Escape all inner double quotes
                inner = inner.replace(/"/g, '\\"');
                return `${key}: "${inner}"`;
            }

            if (value.startsWith("'") && value.endsWith("'") && value.length >= 2) {
                let inner = value.slice(1, -1);
                inner = inner.replace(/\\'/g, "'");
                inner = inner.replace(/'/g, "\\'");
                return `${key}: '${inner}'`;
            }

            if (value === 'null' || value === 'true' || value === 'false') {
                return finalLine;
            }

            if (value === '' || value.startsWith('#')) {
                return finalLine;
            }

            if (/^\d{1,}$/.test(value)) {
                return `${key}: "${value}"`;
            }

            if (/[",]/.test(value)) {
                // Escape internal double quotes
                const safeValue = value.replace(/"/g, '\\"');
                return `${key}: "${safeValue}"`;
            }

            return finalLine;
        }).join('\n');

        const data = yaml.load(ymlPatched, yamlOptions);
        // console.log(data);

        // iterate data and trim all values into new array
        const trimmedData = Object.entries(data).reduce((acc, [key, value]) => {
            acc[key] = typeof value === 'string' ? value.trim() : value;
            return acc;
        }, {});

        return trimmedData;
    }


    static extractFirstNumber(str) {
        const match = str.match(/^(\d+)/);
        return match ? match[1] : null;
    }



    static async update(ymlFile) {
        const template = path.resolve(Yamls.getConfig('Templates.Yaml'));

        console.log("Using template", template);

        if (!Files.exists(template)) {
            Dialogs.warningBox(`Template file not found: ${template}`, "Error");
            return;
        }

        if (!Word.initFolders(ymlFile))
            return false;

        let oldYaml = Files.backupFile(ymlFile, true);
        if (!oldYaml) return;

        let oldRest = Files.backupFolder(globalThis.folderRestAPI, true);
        if (!oldRest) return;

        let yamlData = Yamls.loadYamlWithDeps(oldYaml);
        console.log(yamlData, 'yamlData');

        // copy template file intop ymlFile only file
        await fs.promises.copyFile(template, ymlFile);

        if (existsSync(ymlFile))
            await this.fillYamlWithInfo(ymlFile, yamlData, false);
        else
            Dialogs.warningBox(`ymlFile file not found: ${ymlFile}`, "Error");

    }

    static async fillYamlWithInfo(ymlFile, yamlData = null, backup = true) {

        if (!ymlFile) {
            Dialogs.warningBox(`ymlFile is empty for TIN: ${ymlFile}`, ymlFile);
            return;
        }

        if (!Word.initFolders(ymlFile))
            return null;

        if (backup) Files.backupFile(ymlFile, false);

        if (!yamlData) yamlData = Yamls.loadYamlWithDeps(ymlFile);
        console.log(yamlData, 'yamlData');


        let comTIN = Files.getTINFromTXT(globalThis.folderCompan);
        console.info("comTIN:", comTIN);

        let isYatt = false;

        if (!comTIN) {
            comTIN = Files.getPINFLFromTXT(globalThis.folderCompan);
            console.info("comTIN ComPINFL:", comTIN);
        }

        if (!comTIN) {
            Dialogs.warningBox(`comTIN is empty for TIN: ${ymlFile}`, ymlFile);
            return null;
        }

        if (comTIN.length === 14) {
            Files.saveInfoToFile(globalThis.folderALL, '#YaTT');
            isYatt = true;
        }

        let companyInfo = await Didox.infoByTinPinfl(comTIN);
        console.log(companyInfo, 'companyInfo');

        if (!companyInfo) {
            Dialogs.warningBox(`companyInfo is empty for TIN: ${comTIN}`, comTIN);
            return null;
        }

        console.info("Core isYatt:", isYatt);
        companyInfo.isYatt = isYatt;

        if (isYatt)
            companyInfo.directorPinfl = comTIN;

        let ceo = await Didox.infoByTinPinfl(companyInfo.directorPinfl, globalThis.folderDirector);
        console.log(ceo, 'ceo');

        if (ceo) {
            const person = path.join(globalThis.folderDirector, ceo.name);
            Files.saveInfoToFile(person, '#Director');

            companyInfo.ceo = ceo
        }

        if (companyInfo.directorPinfl) {
            if (Files.isEmpty(yamlData.SurPINFL) || yamlData.SurPINFL === companyInfo.directorPinfl) {
                console.log("SurPINFL is empty, using companyInfo.directorPinfl", companyInfo.directorPinfl);
                yamlData.SurPINFL = companyInfo.directorPinfl
                companyInfo.surety = ceo
            } else {
                console.log("SurPINFL is not empty, using yamlData.SurPINFL", yamlData.SurPINFL);
                let surety = await Didox.infoByTinPinfl(yamlData.SurPINFL, globalThis.folderSureties)
                console.log(surety, 'surety');

                if (surety) {
                    companyInfo.surety = surety
                }
            }
        } else {
            console.warn(`directorPinfl is empty for TIN: ${comTIN}`)
        }

        if (!Files.isEmpty(yamlData.RepPINFL)) {
            let reps = await Didox.infoByTinPinfl(yamlData.RepPINFL, globalThis.folderPartners)
            console.log(reps, 'surety');
            companyInfo.reps = reps
        }

        if (!isYatt) {
            companyInfo.soliq = await MySoliq.companyInfo(comTIN);
            console.log(companyInfo.soliq, 'soliq');

            //     let vatInfo = await MySoliq.vatInfo(comTIN);
            //     console.log(vatInfo, 'vatInfo');
            //     companyInfo.vat = vatInfo

        } else {
            companyInfo.soliqYatt = await MySoliq.entrepreneurInfo(comTIN, yamlData.SurPassportSerial, yamlData.SurPassportNumber);
            console.log(companyInfo.soliqYatt, 'soliqYatt');
        }

        Files.deleteInfo(globalThis.folderALL, `#From-`)
        Files.saveInfoToFile(globalThis.folderALL, `#From-${yamlData.MyCompany}`)

        Files.deleteInfo(globalThis.folderALL, `#Area-`)
        Files.saveInfoToFile(globalThis.folderALL, `#Area-${yamlData.Area}-kv`)

        Files.deleteInfo(globalThis.folderCompan, `-kv`)
        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.Area}-kv`)

        Files.writeJson(path.join(globalThis.folderRestAPI, `ALL.json`), companyInfo)

        Yamls.replaceYaml(globalThis.ymlFile, yamlData, companyInfo);
    }


    static getPrepayMonth(yamlData) {
        let prepay

        if (Files.isEmpty(yamlData.prepayMonth)) {
            prepay = Yamls.getConfig('Contract.PrepayMonth')
            console.log(`prepayMonth from Yaml: ${prepay}`);
        }
        else {
            prepay = yamlData.prepayMonth
            console.log(`prepayMonth from ENV: ${prepay}`);
        }

        return prepay;

    }

    static replaceYaml(ymlFile, yamlData, companyInfo) {
        console.log(ymlFile, 'ymlFile');

        if (!yamlData || !companyInfo)
            return Dialogs.warningBox('yamlData or companyInfo is not defined!');

        console.log(yamlData, 'yamlData');
        console.log(companyInfo, 'companyInfo');

        if (Files.isEmpty(yamlData.ComDate)) {
            let comDateFromTxt = Files.getDateFromTXT(globalThis.folderCompan)
            if (comDateFromTxt) {
                yamlData.ComDate = comDateFromTxt
            } else {
                yamlData.ComDate = companyInfo.regDate
            }
        } else {
            Files.saveInfoToFile(globalThis.folderCompan, yamlData.ComDate)
        }

        if (Files.isEmpty(yamlData.ComDateIjara)) {
            yamlData.ComDateIjara = Yamls.getConfig('Contract.ComDateIjara');
            console.info('yamlData.ComDateIjara', yamlData.ComDateIjara);
        }

        const addDays = Yamls.getConfig('Contract.AddDays');
        console.log(`addDays from Yaml: ${addDays}`);
        yamlData.ComDateEnd = Dates.addDays(yamlData.ComDate, addDays)
        console.info('yamlData.ComDateEnd', yamlData.ComDateEnd);


        const comDate = Word.extractDate(yamlData.ComDate);
        yamlData.Day = comDate.day;
        yamlData.Month = comDate.month;
        yamlData.Year = comDate.year;

        const comDateEnd = Word.extractDate(yamlData.ComDateEnd);
        yamlData.DayEnd = comDateEnd.day;
        yamlData.MonthEnd = comDateEnd.month;
        yamlData.YearEnd = comDateEnd.year;

        const comDateIjara = Word.extractDate(yamlData.ComDateIjara);
        yamlData.DayIjara = comDateIjara.day;
        yamlData.MonthIjara = comDateIjara.month;
        yamlData.YearIjara = comDateIjara.year;


        yamlData.ActDateExcel = Dates.didoxToExcel(yamlData.ActDate);
        yamlData.ActDateEndExcel = Dates.didoxToExcel(yamlData.ActDateEnd);

        yamlData.ComDateExcel = Dates.didoxToExcel(yamlData.ComDate);
        yamlData.ComDateEndExcel = Dates.didoxToExcel(yamlData.ComDateEnd);
        yamlData.ComDateIjaraExcel = Dates.didoxToExcel(yamlData.ComDateIjara);

        if (!yamlData.ActDate) {
            yamlData.StartDateExcel = yamlData.ComDateExcel
            console.log('StartDateExcel from ComDateExcel', yamlData.StartDateExcel);
        }
        else {
            yamlData.StartDateExcel = Dates.didoxToExcel(yamlData.ActDate)
            console.log('StartDateExcel from ActDate', yamlData.StartDateExcel);
        }


        const prepayMonth = Yamls.getPrepayMonth(yamlData);
        console.log(prepayMonth, 'prepayMonth');

        if (!yamlData.ActDateEnd) {
            yamlData.FutureDateExcel = Dates.futureDateByMonth(prepayMonth, false)
            console.log('FutureDateExcel from prepayMonth', yamlData.FutureDateExcel);
        }
        else {
            yamlData.FutureDateExcel = Dates.didoxToExcel(yamlData.ActDateEnd)
            console.log('FutureDateExcel from ActDateEnd', yamlData.FutureDateExcel);
        }

        yamlData.FutureDateAppExcel = Dates.getMinusOneDay(yamlData.FutureDateExcel)
        console.log(yamlData.FutureDateAppExcel, 'yamlData.FutureDateAppExcel');





        // if ymlFileparh contains @ Weak folder - yamldata.ComCategory = Weak
        switch (true) {
            case ymlFile.includes("@ Weak"):
                yamlData.ComCategory = "Weak";
                break;

            case ymlFile.includes("@ Other"):
                yamlData.ComCategory = "Other";
                break;

            case ymlFile.includes("@ Bads"):
                yamlData.ComCategory = "Other";
                break;

            case ymlFile.includes("@ Dead"):
                yamlData.ComCategory = "Dead";
                break;

            default:
                yamlData.ComCategory = "ALL";
                break;
        }

        yamlData.ComINN = companyInfo.tin


        const price = yamlData.Price.replaceAll(',', '')

        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.ComINN}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${yamlData.SurPINFL}`)
        Files.saveInfoToFile(globalThis.folderCompan, `${price}`)

        yamlData.ComName = Word.cleanCompanyName(companyInfo.shortName)
        yamlData.IsYatt = companyInfo.isYatt

        yamlData.ComNameLong = companyInfo.name
        yamlData.ComNameShort = companyInfo.shortName


        if (!yamlData.ContractNumber)
            yamlData.ContractNum = Word.contractNumFromFormat(yamlData);
        else
            yamlData.ContractNum = yamlData.ContractNumber;

        Files.deleteInfo(globalThis.folderCompan, `RC-`)
        Files.saveInfoToFile(globalThis.folderCompan, yamlData.ContractNum)

        yamlData.ComAddress = companyInfo.address
        yamlData.ComAddressType = companyInfo.AddressType;

        Files.deleteInfo(globalThis.folderCompan, `${yamlData.ComAddressType}`)
        Files.saveInfoToFile(globalThis.folderCompan, yamlData.ComAddress);

        Files.deleteInfo(globalThis.folderCompan, `#Addr-`)
        Files.saveInfoToFile(globalThis.folderALL, `#Addr-${yamlData.ComAddressType}`);

        yamlData.ComOKED = companyInfo.oked
        if (!yamlData.isYatt)
            yamlData.ComOKEDName = companyInfo?.soliq?.company?.okedDetail.name_uz_latn ?? ''
        else
            yamlData.ComOKEDName = companyInfo?.soliqYatt?.activityTypeName?.uz ?? ''

        yamlData.ComMFO = companyInfo.bankCode
        yamlData.ComRS = companyInfo.account
        yamlData.ComBankAccount = companyInfo.bankAccount

        yamlData.ComBankCode = companyInfo.bankCode
        const bank = Didox.bankByCode(companyInfo.bankCode);
        console.log(bank, 'bank');

        if (bank) {
            yamlData.ComBank = bank.name
        }

        yamlData.ComNs10Code = companyInfo.ns10Code
        const region = Didox.regionsByCode(companyInfo.ns10Code)
        console.log(region, 'region');

        if (!region) {
            console.warn(`Region not found for code: ${companyInfo.ns10Code}`)
            Dialogs.warningBox(`Region not found for code: ${companyInfo.ns10Code}`, yamlData.ComNameShort, 64)
        }

        yamlData.ComNs10Name = region.name;

        yamlData.ComNs11Code = companyInfo.ns11Code
        const district = Didox.districtsByCode(companyInfo.ns10Code, companyInfo.ns11Code);
        yamlData.ComNs11Name = district.name;

        yamlData.DirName = companyInfo.director
        Files.saveInfoToFile(globalThis.folderCompan, `Director  ${yamlData.DirName}`)

        if (!Files.isEmpty(yamlData.DirPINFL) && yamlData.DirPINFL !== companyInfo.directorPinfl) {
            Files.saveInfoToFile(globalThis.folderALL, `#CEO-Changed`)
            console.warn(`DirPINFL changed to: ${yamlData.DirPINFL}`)
            Dialogs.messageBox(`DirPINFL changed to: ${yamlData.DirPINFL}`, yamlData.ComNameShort);
        }

        yamlData.DirPINFL = companyInfo.directorPinfl
        yamlData.DirTIN = companyInfo.directorTin

        yamlData.AccName = companyInfo.accountant

        if (yamlData.SurEnable === true) {
            yamlData.SurName = companyInfo.surety?.fullName ?? ''
            yamlData.SurTIN = companyInfo.surety?.tin ?? ''
            yamlData.SurAddress = companyInfo.surety?.address ?? ''
            yamlData.SurNs10Code = companyInfo.surety?.ns10Code ?? ''
            yamlData.SurNs11Code = companyInfo.surety?.ns11Code ?? ''
            yamlData.SurPassport = `${yamlData.SurPassportSerial ?? ''} ${yamlData.SurPassportNumber ?? ''}`
        } else {
            yamlData.SurName = ''
            yamlData.SurTIN = ''
            yamlData.SurAddress = ''
            yamlData.SurNs10Code = ''
            yamlData.SurNs11Code = ''
            yamlData.SurPassport = ''
        }


        if (!Files.isEmpty(yamlData.RepPINFL) && yamlData.RepEnable === true) {
            yamlData.RepName = companyInfo.reps?.fullName ?? ''
            yamlData.RepTIN = companyInfo.reps?.tin ?? ''
            yamlData.RepAddress = companyInfo.reps?.address ?? ''
            yamlData.RepNs10Code = companyInfo.reps?.ns10Code ?? ''
            yamlData.RepNs11Code = companyInfo.reps?.ns11Code ?? ''
        } else {
            yamlData.RepName = ''
            yamlData.RepTIN = ''
            yamlData.RepAddress = ''
            yamlData.RepNs10Code = ''
            yamlData.RepNs11Code = ''
        }

        yamlData.ComNa1Code = companyInfo.na1Code
        yamlData.ComNa1Name = companyInfo.na1Name
        if (!yamlData.isYatt)
            yamlData.ComNa1NameLat = companyInfo.soliq?.company.businessStructureDetail.name_uz_latn ?? ''
        else
            yamlData.ComNa1NameLat = companyInfo?.soliqYatt?.formName?.uz ?? ''

        if (!Files.isEmpty(yamlData.ComNa1NameLat)) {
            yamlData.ComNa1NameShort = yamlData.ComNa1NameLat.split(' ').map(word => word.charAt(0)).join('')
                .toUpperCase()
        }

        yamlData.ComStatusCode = companyInfo.statusCode
        yamlData.ComStatusName = companyInfo.statusName

        if (!yamlData.isYatt) {
            yamlData.ComStatusNameLat = companyInfo.soliq?.company.statusDetail.name_uz_latn ?? ''
            yamlData.ComStatusGroup = companyInfo.soliq?.company.statusDetail.group ?? ''

            yamlData.ComStatusType = companyInfo.soliq?.company.statusType ?? ''
            yamlData.ComIsScammer = companyInfo.soliq?.IsScammer ?? ''

        }
        else {
            yamlData.ComStatusNameLat = companyInfo?.soliqYatt?.status?.name?.uz ?? ''

        }



        yamlData.ComPersonalNum = companyInfo.personalNum

        yamlData.ComIsItd = companyInfo.isItd
        if (yamlData.isYatt) {
            if (companyInfo.isItd === true)
                Files.saveInfoToFile(globalThis.folderALL, '#YaTT-Active');
            else
                Files.saveInfoToFile(globalThis.folderALL, '#YaTT-Inactive');
        }

        yamlData.ComIsBudget = companyInfo.isBudget
        if (companyInfo.isBudget === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-Budget');

        yamlData.ComSelfEmployment = companyInfo.selfEmployment
        if (companyInfo.selfEmployment === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-SelfEmployment');

        yamlData.ComPrivateNotary = companyInfo.privateNotary
        if (companyInfo.privateNotary === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-PrivateNotary');

        yamlData.ComPeasantFarm = companyInfo.peasantFarm
        if (companyInfo.peasantFarm === true)
            Files.saveInfoToFile(globalThis.folderALL, '#Is-PeasantFarm');


        if (!yamlData.isYatt) {
            yamlData.ComOpf = companyInfo.soliq?.company.opf ?? ''
            yamlData.ComKfs = companyInfo.soliq?.company.kfs ?? ''
            yamlData.ComSoato = companyInfo.soliq?.company.soato ?? ''
            yamlData.ComSoogu = companyInfo.soliq?.company.soogu ?? ''
            yamlData.ComSooguRegistrator = companyInfo.soliq?.company.sooguRegistrator ?? ''

            yamlData.ComRegDate = companyInfo.soliq?.company.registrationDate ?? ''
            yamlData.ComRegNumber = companyInfo.soliq?.company.registrationNumber ?? ''

            yamlData.ComReRegDate = companyInfo.soliq?.company.reregistrationDate ?? ''

            yamlData.ComLiquidationDate = companyInfo.soliq?.company.liquidationDate ?? ''
            yamlData.ComLiquidationReason = companyInfo.soliq?.company.liquidationReason ?? ''

            yamlData.ComTaxMode = companyInfo.soliq?.company.taxMode ?? ''
            yamlData.ComTaxpayerType = companyInfo.soliq?.company.taxpayerType ?? ''
            yamlData.ComBusinessType = companyInfo.soliq?.company.businessType ?? ''

            // replace number with comma
            let fund = Number(companyInfo.soliq?.company.businessFund ?? 0)
            yamlData.ComBusinessFund = fund.toLocaleString("en-US")

            yamlData.ComSectorCode = companyInfo.soliq?.companyBillingAddress.sectorCode ?? ''
            yamlData.ComVillageCode = companyInfo.soliq?.company.villageCode ?? ''
            yamlData.ComVillageName = companyInfo.soliq?.company.villageName ?? ''

        }
        else {
            yamlData.ComRegDate = companyInfo.soliqYatt?.registrationDate ?? ''
            yamlData.ComRegNumber = companyInfo.soliqYatt?.registrationId ?? ''

            yamlData.ComLiquidationDate = companyInfo.soliqYatt?.liquidationDate ?? ''

            yamlData.ComTaxMode = companyInfo.soliqYatt?.taxMode ?? ''

            yamlData.ComSectorCode = companyInfo.soliqYatt?.entrepreneurshipAddress?.soatoCode ?? ''

        }



        // ###########################

        yamlData.ComVATRegCode = companyInfo.VATRegCode
        yamlData.ComVATRegStatus = companyInfo.VATRegStatus

        if (!yamlData.isYatt) {
            yamlData.ComVATCompanyName = companyInfo.vat?.companyName ?? ''
            yamlData.ComVATDirectorName = companyInfo.vat?.directorFioLatn ?? ''

            yamlData.ComVATAddress = companyInfo.vat?.address ?? ''
            yamlData.ComVATDateReg = companyInfo.vat?.dateReg ?? ''
            yamlData.ComVATDateFrom = companyInfo.vat?.dateFrom ?? ''

            yamlData.ComVATStateId = companyInfo.vat?.stateId ?? ''
            yamlData.ComVATStateNameLat = companyInfo?.vat?.stateNameLat ?? '';

            yamlData.ComVATPkey = companyInfo?.vat?.pkey ?? '';
            yamlData.ComVATDateSys = companyInfo?.vat?.dateSys ?? '';

            yamlData.ComVATUpdatedAt = companyInfo?.vat?.updatedAt ?? '';
            yamlData.ComVATStatementId = companyInfo?.vat?.statementId ?? '';

        } else {

            yamlData.ComVATAddress = companyInfo.soliqYatt?.entrepreneurshipAddress?.address ?? ''
            yamlData.ComVATDateReg = companyInfo.soliqYatt?.vatRegDate ?? ''

            yamlData.ComVATStateId = companyInfo.soliqYatt?.vatStatusId ?? ''
            yamlData.ComVATStateNameLat = companyInfo?.soliqYatt?.vatStatusName ?? '';

            yamlData.ComVATUpdatedAt = companyInfo?.soliqYatt?.vatRegDate ?? '';
            yamlData.ComVATStatementId = companyInfo?.soliqYatt?.certificateDocNumber ?? '';
        }


        Files.deleteInfo(globalThis.folderALL, '#VAT')

        const ComDate = Dates.parseDMY(yamlData.ComDate);
        const ComVATDateReg = Dates.parseDMY(yamlData.ComVATDateReg);

        // if ComDate is greater than ComVATDateReg 
        if (companyInfo.VATRegCode) {
            if (ComDate < ComVATDateReg) {
                yamlData.ComVATFromUs = 'Да'
                Files.saveInfoToFile(globalThis.folderALL, '#VAT-From-Us')
            } else {
                yamlData.ComVATFromUs = 'Нет'
                Files.deleteInfo(globalThis.folderALL, '#VAT-From-Us')
            }
        } else {
            yamlData.ComVATFromUs = ''
        }

        yamlData.ComTaxModeVAT = yamlData.ComTaxMode === 1 ? 'Yes' : 'No'


        if (yamlData.ComTaxModeVAT === 'Yes' && Files.isEmpty(yamlData.ComVATRegCode)) {
            yamlData.ComCandidateVAT = 'Yes'
            Files.saveInfoToFile(globalThis.folderALL, '#VAT-Candidate')
        } else {
            yamlData.ComCandidateVAT = 'No'
            Files.deleteInfo(globalThis.folderALL, '#VAT-Candidate')
        }

        if (yamlData.ComTaxModeVAT === 'Yes') {
            Files.saveInfoToFile(globalThis.folderALL, '#VAT-Mode')
        }



        // iterate yamldata and write via reoplacetextline func
        for (const [key, value] of Object.entries(yamlData)) {
            this.replaceTextLine(ymlFile, key, value);
        }


    }

    static mergeYamlsInFolder(folderPath) {
        if (!fs.existsSync(folderPath)) {
            console.warn(`Folder not found: ${folderPath}`);
            return;
        }

        const appFolder = path.join(folderPath, 'App');
        if (!fs.existsSync(appFolder)) {
            fs.mkdirSync(appFolder, { recursive: true });
        }

        const yamlFiles = Files.findRecursiveFull(
            folderPath,
            (name) => {
                const ext = path.extname(name).toLowerCase();
                return ext === '.yaml' || ext === '.yml';
            },
            (name, fullPath) => {
                const lowerName = name.toLowerCase();
                // We use path.resolve to compare paths accurately, or just check string equality on fullPath
                if (path.resolve(fullPath) === path.resolve(appFolder)) return true;

                if (
                    lowerName === '- theory' ||
                    lowerName === 'all' ||
                    lowerName === 'app' ||
                    lowerName === 'add'
                ) return true;
                if (name.startsWith('@') || name.startsWith('_')) return true;
                return false;
            }
        );

        if (yamlFiles.length === 0) {
            console.warn('No YAML/YML files found to merge.');
            return;
        }

        let mergedData = null;

        for (const file of yamlFiles) {
            try {
                const data = Yamls.loadAndParseYaml(file);

                if (data === undefined || data === null) continue;

                if (mergedData === null) {
                    mergedData = Array.isArray(data) ? [] : {};
                }

                const isDataArray = Array.isArray(data);
                const isMergedArray = Array.isArray(mergedData);

                switch (true) {
                    case isDataArray && isMergedArray:
                        mergedData = mergedData.concat(data);
                        break;
                    case !isDataArray && !isMergedArray && typeof data === 'object':
                        for (const [key, value] of Object.entries(data)) {
                            if (key in mergedData) {
                                console.warn(`⏭️ Skipped duplicate key "${key}" from file: ${file}`);
                                continue; // Skip all next values, do not stop action
                            }
                            mergedData[key] = value;
                        }
                        break;
                    default:
                        console.warn(`Type mismatch or unsupported data in ${file}.`);
                        break;
                }
            } catch (err) {
                console.error(`Error parsing ${file}: ${err.message}`);
                Dialogs.warningBox(`Error parsing ${file}:\n${err.message}`, "YAML Parse Error");
                return; // Stop on parse errors too
            }
        }

        if (mergedData) {
            const dumpStr = yaml.dump(mergedData, { lineWidth: -1 });
            const baseFolder = path.basename(path.resolve(folderPath));
            const outPath = path.join(appFolder, `${baseFolder}.yml`);
            const finalOutPath = Files.incrementFileName(outPath);
            fs.writeFileSync(finalOutPath, dumpStr, 'utf8');
            console.log(`✅ Merged ${yamlFiles.length} files into ${finalOutPath}`);
        } else {
            console.log(`No valid YAML data found to merge.`);
        }
    }

}
