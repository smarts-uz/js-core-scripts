import fs, { existsSync } from 'fs';
import path from 'path';
import { exec, execSync } from "child_process";
import dotenv from 'dotenv';

export class Dates {

  static parseDMY(dateStr) {
    const [day, month, year] = dateStr.split('.').map(Number);
    return new Date(year, month - 1, day);
  }

  static parseDMYExcel(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  static getMinusOneDay(dateStr) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const prevMonth = new Date(year, month - 1, 0);
    let date = new Date(prevMonth.getFullYear(), prevMonth.getMonth(), prevMonth.getDate());

    // convert to 2023-08-10 format
    // return date.toISOString().slice(0, 10); // convert to 2023-08-10 format
    //
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");

    return `${y}-${m}-${d}`;

  }

  static didoxToExcel(date) {
    if (!date) return "";
    // convert 10.08.2023 format to 2023-08-10 format
    return date.replace(/(\d{2})\.(\d{2})\.(\d{4})/, '$3-$2-$1');
  }

  static excelToDidox(date) {
    if (!date) return "";
    // convert 2023-08-10 format to 10.08.2023 format
    return date.replace(/(\d{4})-(\d{2})-(\d{2})/, '$3.$2.$1');
  }


  // static func get date of last day of future moths
  static futureDateByMonth(months, prevMonthLastDate = false) {

    console.log("futureDateByMonth", months);
    months = parseInt(months);
    const today = new Date();
    let futureDate
    if (prevMonthLastDate) {
      futureDate = new Date(today.getFullYear(), today.getMonth() + months, 0);
    } else {
      futureDate = new Date(today.getFullYear(), today.getMonth() + months, 1);
    }
    // return in format 2025-11-06
    //  return futureDate.toISOString().slice(0, 10); // return in format 2025-11-06
    const dateString = `${new Intl.DateTimeFormat('en-CA').format(futureDate)}`;
    return dateString;
  }


  static sleep(ms) {

    console.log(`Sleeping for ${ms} milliseconds...`);
    setTimeout(() => {
      process.exit(0);
    }, ms);

    //  return new Promise(resolve => setTimeout(resolve, ms));
  }

  static sleepPro = (ms) => new Promise((res) => setTimeout(res, ms));

  // umumiy kanditat regex (turli separatorlarni oladi)


  static normalizeUzAccordingToRule(raw) {
    if (!raw || typeof raw !== "string") return null;
    let digits = raw.replace(/\D/g, "");
    if (digits.length < 9) return null; // juda qisqa -> rad

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

    if (digits.length !== 12 || !digits.startsWith("998")) return null;

    const p1 = digits.slice(3, 5);
    const p2 = digits.slice(5, 8);
    const p3 = digits.slice(8, 10);
    const p4 = digits.slice(10, 12);

    return `+998-${p1}-${p2}-${p3}-${p4}`;
  }


  static compareDatesDMY(a, b) {
    const da = this.parseDMY(a);
    const db = this.parseDMY(b);
    return da.getTime() - db.getTime(); // <0 = before, 0 = equal, >0 = after
  }

  static run() {

    const d1 = Dates.parseDMY("03.11.2011");
    const d2 = Dates.parseDMY("28.12.2018");

    if (d1 < d2) console.log("d1 is before d2");
    else if (d1 > d2) console.log("d1 is after d2");
    else console.log("same date");

    console.log(compareDatesDMY("03.11.2011", "28.12.2018")); // → negative (a < b)



  }

}
