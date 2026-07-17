import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat.js';
dayjs.extend(customParseFormat);

export class Dates {

  static parseDMY(dateStr) {
    console.info(`[Dates.parseDMY] 🟢 Starting...`);
    const [day, month, year] = dateStr.split('.').map(Number);
    return new Date(year, month - 1, day);
  }

  static parseDMYExcel(dateStr) {
    console.info(`[Dates.parseDMYExcel] 🟢 Starting...`);
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  static getMinusOneDay(dateStr) {
    console.info(`[Dates.getMinusOneDay] 🟢 Starting...`);
    // Last day of the month preceding dateStr's month (e.g. 2025-11-06 → 2025-10-31).
    const result = dayjs(dateStr, 'YYYY-MM-DD').startOf('month').subtract(1, 'day').format('YYYY-MM-DD');
    console.log("getMinusOneDay result", result);
    return result;
  }

  static didoxToExcel(date) {
    console.info(`[Dates.didoxToExcel] 🟢 Starting...`);
    if (!date) return "";
    // convert 10.08.2023 format to 2023-08-10 format
    return date.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1');
  }

  // add 2 years to current date. get last date (31 dec) of this year
  static addYearsGetLastDate(dateStr, years) {
      console.info(`[Dates.addYearsGetLastDate] 🟢 Starting...`);
    console.log("addYearsGetLastDate dateStr", dateStr, "years", years);

    const formatted = dayjs(dateStr, 'DD.MM.YYYY').add(years, 'year').endOf('year').format('DD.MM.YYYY');

    console.log("addYearsGetLastDate formatted", formatted);
    return formatted;
  }


  // add 363 days into date
  static addDays(dateStr, days) {
      console.info(`[Dates.addDays] 🟢 Starting...`);

    console.log("addDays dateStr", dateStr, "days", days);

    const formatted = dayjs(dateStr, 'DD.MM.YYYY').add(days, 'day').format('DD.MM.YYYY');

    console.log("addDays formatted", formatted);

    return formatted;
  }

  static excelToDidox(date) {
    console.info(`[Dates.excelToDidox] 🟢 Starting...`);
    if (!date) return "";
    // convert 2023-08-10 format to 10.08.2023 format
    return date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1');
  }


  // static func get date of last day of future moths
  static futureDateByMonth(months, prevMonthLastDate = false) {
      console.info(`[Dates.futureDateByMonth] 🟢 Starting...`);

    console.log("futureDateByMonth", months);
    months = parseInt(months);
    // First day of the month `months` ahead, or the last day of the month before it.
    const base = dayjs().add(months, 'month').startOf('month');
    const formatted = (prevMonthLastDate ? base.subtract(1, 'day') : base).format('YYYY-MM-DD');
    console.log("futureDateByMonth formatted", formatted);
    return formatted;
  }


  static sleepSync(ms) {
      console.info(`[Dates.sleepSync] 🟢 Starting...`);

    console.log(`Sleeping for ${ms} milliseconds...`);
    setTimeout(() => {
      console.log("Wake up: ", ms);
    }, ms);

    //  return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
 * Berilgan minimum (min) va maksimum (max) qiymatlar oralig'ida
 * tasodifiy butun sonni hosil qiladi (min va max o'z ichiga olgan holda).
 *
 * @param {number} min - Kiritilishi mumkin bo'lgan eng kichik butun son.
 * @param {number} max - Kiritilishi mumkin bo'lgan eng katta butun son.
 * @returns {number} Tasodifiy butun son.
 */
  static randomInt(min, max) {
    console.info(`[Dates.randomInt] 🟢 Starting...`);
    // Argumentlarning butun son ekanligini ta'minlash
    min = Math.ceil(min);
    max = Math.floor(max);

    // Math.random() [0, 1) oralig'ida son beradi
    // (max - min + 1) oralig'ining hajmini beradi (masalan, 1 dan 10 gacha 10 ta son)
    // Math.floor() butun songa aylantiradi
    // + min natijani kerakli diapazonga siljitadi

    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  static randomIntOne(value) {
    console.info(`[Dates.randomIntOne] 🟢 Starting...`);
    const half = Math.floor(value * 3 / 4);
    const random = this.randomInt(half, value);
    console.log(`random: ${random}`);
    return random;
  }



  static async sleep(ms, random = true) {
      console.info(`[Dates.sleep] 🟢 Starting...`);

    if (random) {
      ms = this.randomIntOne(ms);
    }

    console.log(`Sleeping for ${ms} milliseconds... Random: ${random}`);

    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static sleepOne = (ms) => new Promise((res) => setTimeout(res, ms));
  // umumiy kanditat regex (turli separatorlarni oladi)


  static normalizeUzAccordingToRule(raw) {
    console.info(`[Dates.normalizeUzAccordingToRule] 🟢 Starting...`);
    if (!raw || typeof raw !== "string") return raw;
    let digits = raw.replace(/\D/g, "");
    if (digits.length < 9) return raw; // juda qisqa -> rad

    // ANIQ QOIDALAR:
    if (digits.length === 9) {
      // bevosita 9 ta -> 998 + that
      digits = "998" + digits;
    } else if (digits.length === 11) {
      // 11 ta: agar 8 bilan boshlasa 8 ni tashlab qolganidan oxirgi 9 olamiz;
      // aks holda ham xavfsizlik uchun oxirgi 9 olamiz
      if (digits.startsWith("8")) {
        // 8XXXXXXXXXX -> olib tashla 8, oxirgi 9 ol
        digits = "998" + digits.slice(1).slice(-9);
      } else {
        // boshqa 11 -> oxirgi 9 olamiz
        digits = "998" + digits.slice(-9);
      }
    } else if (digits.length === 10) {
      // 0XXXXXXXXX yoki 9XXXXXXXXX: agar 0 bilan boshlangan bo'lsa 0ni tashlab oldik
      if (digits.startsWith("0")) digits = "998" + digits.slice(1);
      else digits = "998" + digits.slice(-9);
    } else if (digits.length >= 12) {
      // katta stringlar: agar oxirgi 12 "998..." bilan boshlasa saqlaymiz,
      // aks holda oxirgi 9 olamiz
      const last12 = digits.slice(-12);
      if (last12.startsWith("998")) digits = last12;
      else digits = "998" + digits.slice(-9);
    } else {
      // boshqa hollarda (masalan 9 dan katta lekin yuqorida ko'rsatilmagan) oxirgi 9 olamiz
      digits = "998" + digits.slice(-9);
    }

    if (digits.length !== 12 || !digits.startsWith("998")) return raw;

    const p1 = digits.slice(3, 5);
    const p2 = digits.slice(5, 8);
    const p3 = digits.slice(8, 10);
    const p4 = digits.slice(10, 12);

    return `+998-${p1}-${p2}-${p3}-${p4}`;
  }


  static compareDatesDMY(a, b) {
    console.info(`[Dates.compareDatesDMY] 🟢 Starting...`);
    const da = this.parseDMY(a);
    const db = this.parseDMY(b);
    return da.getTime() - db.getTime(); // <0 = before, 0 = equal, >0 = after
  }

  static run() {
    console.info(`[Dates.run] 🟢 Starting...`);

    const d1 = Dates.parseDMY("03.11.2011");
    const d2 = Dates.parseDMY("28.12.2018");

    if (d1 < d2) console.log("d1 is before d2");
    else if (d1 > d2) console.log("d1 is after d2");
    else console.log("same date");

    console.log(compareDatesDMY("03.11.2011", "28.12.2018")); // → negative (a < b)



  }

}
