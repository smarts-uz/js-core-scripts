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


  /**
   * Add calendar days to date, PRESERVING input format.
   * YYYY-MM-DD in → YYYY-MM-DD out; DD.MM.YYYY in → DD.MM.YYYY out.
   * Keeps standalone runner and every DD.MM.YYYY caller working unchanged.
   * @param {string} dateStr - Date in YYYY-MM-DD or DD.MM.YYYY.
   * @param {number} days - Calendar days to add.
   * @returns {string} Shifted date, same format as input.
   */
  static addDays(dateStr, days) {
      console.info(`[Dates.addDays] 🟢 Starting...`);

    console.log("addDays dateStr", dateStr, "days", days);

    const format = Dates.isExcelDate(dateStr) ? 'YYYY-MM-DD' : 'DD.MM.YYYY';
    console.log("addDays format", format);

    const formatted = dayjs(dateStr, format).add(days, 'day').format(format);

    console.log("addDays formatted", formatted);

    return formatted;
  }

  /**
   * TRUE only for strict YYYY-MM-DD string.
   * @param {*} date - Value to test.
   * @returns {boolean} TRUE when YYYY-MM-DD.
   */
  static isExcelDate(date) {
    console.info(`[Dates.isExcelDate] 🟢 Starting...`);
    return /^\d{4}-\d{2}-\d{2}$/.test(String(date ?? '').trim());
  }

  /**
   * Split YYYY-MM-DD into {year, month, day} string parts.
   * Replaces Word.extractDate, which only ever parsed DD.MM.YYYY.
   * Returns null for non-YYYY-MM-DD input, so caller warns instead of writing undefined into contract.
   * @param {string} date - Date in YYYY-MM-DD.
   * @returns {{year: string, month: string, day: string}|null} Parts, or null when invalid.
   */
  static splitExcelDate(date) {
    console.info(`[Dates.splitExcelDate] 🟢 Starting...`);

    if (!Dates.isExcelDate(date)) return null;

    const [year, month, day] = String(date).trim().split('-');
    console.log("splitExcelDate", { year, month, day });

    return { year, month, day };
  }

  static excelToDidox(date) {
    console.info(`[Dates.excelToDidox] 🟢 Starting...`);
    if (!date) return "";
    // convert 2023-08-10 format to 10.08.2023 format
    return date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1');
  }

  /**
   * Current calendar date as YYYY-MM-DD.
   * @returns {string} Today's date, Excel-format.
   */
  static today() {
    console.info(`[Dates.today] 🟢 Starting...`);
    return dayjs().format('YYYY-MM-DD');
  }


  // Every calendar-month {start, end} date range ('YYYY-MM-DD' each) from
  // startExcel through endExcel, inclusive — one entry per month. Only the
  // FIRST entry's start is clamped to the real startExcel (never forced back
  // to the 1st of that month); every entry's end — including the first and
  // the last — always runs through the full last day of its own calendar
  // month, never clamped to the real endExcel. Used to build a per-month
  // price history entry across a contract's full active period.
  static monthsBetween(startExcel, endExcel) {
    console.info(`[Dates.monthsBetween] 🟢 Starting...`);
    console.log("monthsBetween startExcel", startExcel, "endExcel", endExcel);

    if (!startExcel || !endExcel) return [];

    const realStart = dayjs(startExcel, 'YYYY-MM-DD');
    const realEnd = dayjs(endExcel, 'YYYY-MM-DD');

    let cursor = realStart.startOf('month');
    const lastMonth = realEnd.startOf('month');

    const ranges = [];
    while (cursor.isBefore(lastMonth) || cursor.isSame(lastMonth)) {
      const isFirst = cursor.isSame(realStart, 'month');

      const start = isFirst ? realStart : cursor.startOf('month');
      const end = cursor.endOf('month');

      ranges.push({ start: start.format('YYYY-MM-DD'), end: end.format('YYYY-MM-DD') });
      cursor = cursor.add(1, 'month');
    }

    console.log("monthsBetween ranges", ranges);
    return ranges;
  }

  // Number of calendar days in the month containing 'YYYY-MM-DD' dateExcel.
  static daysInMonth(dateExcel) {
    console.info(`[Dates.daysInMonth] 🟢 Starting...`);
    const d = dayjs(dateExcel, 'YYYY-MM-DD');
    const days = d.daysInMonth();
    console.log("daysInMonth days", days);
    return days;
  }

  // Last calendar day ('YYYY-MM-DD') of month containing 'YYYY-MM-DD'
  // dateExcel — e.g. '2026-01-19' -> '2026-01-31'. Re-derives period's own
  // end when only bare start date carried (Accrual's key, every chain
  // block synced to it).
  static monthEnd(dateExcel) {
    console.info(`[Dates.monthEnd] 🟢 Starting...`);
    const end = dayjs(dateExcel, 'YYYY-MM-DD').endOf('month').format('YYYY-MM-DD');
    console.log("monthEnd end", end);
    return end;
  }

  // Whole calendar days between two 'YYYY-MM-DD' dates (end - start). Negative
  // when end is before start; 0 when equal. Used to turn a payment-delay
  // date range into a day count for a fixed-per-day penalty (пеня/неустойка).
  static daysBetween(startExcel, endExcel) {
    console.info(`[Dates.daysBetween] 🟢 Starting...`);
    console.log("daysBetween startExcel", startExcel, "endExcel", endExcel);

    if (!startExcel || !endExcel) return 0;

    const start = dayjs(startExcel, 'YYYY-MM-DD');
    const end = dayjs(endExcel, 'YYYY-MM-DD');

    const days = end.diff(start, 'day');
    console.log("daysBetween days", days);
    return days;
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
