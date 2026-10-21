# Update ALL.contract Tariff Format

## 👤 User

d:\FSystem\ALL\Humans\Rentalls\Mamurjon\CODENOVA\ALL.contract

Tariff

buni date emas month yoziladi. 
Tariff:
  - 2025-03: 20-1800k
  - 2025-10: 20-1680k

shu formatda

## 🤖 Assistant

(no text)










## 👤 User

tariff ni 1-value si contract date yoki ActDateStart date dan month extract qilib keyin yoziladi.
keyin PriceMon: va PriceMaxMon: aynan shu tariff dan xisoblanadi.

## 🤖 Assistant

(no text)










## 👤 User

Tariff:
  - 2025-03-20: 20-1800k
  - 2025-10: 20-1680k

tariff 1- value ga ham - contractdate tyoki actdatestart ni ozi emas, balki ularni month ga convert qilib keyin 2025-03 formatda yozish kerak

## 🤖 Assistant

`Tariff` formati va narxlar muvaffaqiyatli yangilandi.

### Natijalar

- [ALL.contract](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon\CODENOVA\ALL.contract#L23-L26) faylida `Tariff` oyi `YYYY-MM` formatiga o'tkazildi:
  ```yaml
  Tariff:
    - 2025-03: 20-1800k
    - 2025-10: 20-1680k
  ```
- [`PriceMon`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon\CODENOVA\ALL.contract#L45-L66) va [`PriceMaxMon`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon\CODENOVA\ALL.contract#L68-L89) yangi jadval asosida qayta hisoblandi:
  - `2025-03` dan `2025-09` gacha: oylik `1,800,000` so'mdan.
  - `2025-10` dan `2026-10` gacha: oylik `1,680,000` so'mdan.
  - `ALL` jami: `34,440,000` so'm.
- [`Yamls.js`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L1220-L1266) metodlari yangilandi:
  - [`Yamls.normalizeTariff`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L1220): 1-qiymat va keyingi qiymatlarni `YYYY-MM` oy formatiga normalize qiladi.
  - [`Yamls.buildPriceMonEntries`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L525) va [`Yamls.buildPriceMaxMonEntries`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L559): tarif jadvalini oylar bo'yicha taqqoslab narxni almashtiradi.
- Testlar tekshirildi:
  - [`Yamls.test.js`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/tests/Yamls.test.js): 27 ta test yashil (0 xato).
  - Lint tekshiruvi: 0 xato.
- O'zgarishlar commit qilindi: [`0bebd01`](https://github.com/asror-z/js_ai_category/commit/0bebd014fc85cfccdba2806ff8a4cbc215c5393e).










## 👤 User

History:
  - 2025-03-20: 10,080,000
  - 2025-07-04: 6,720,000
  - 2025-08-27: 1,680,000
  - 2025-10-06: 1,680,000
  - ALL: 20,160,000
bu nima? umujmiu tolovlarmi

## 🤖 Assistant

Ha, bu mijoz tomonidan amalga oshirilgan **haqiqiy sof (netto) to'lovlar tarixi**.

### Tafsilotlar

- **Asosiy mantiq:** `History = Payment - Returns` (tushgan to'lovlar minus qaytarilgan summa).
- **2025-07-04 sanasi misoli:**
  - [`Payment`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L1324): `17,520,000` so'm tushgan.
  - [`Returns`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L1349): `10,800,000` so'm qaytarilgan (`Card-IN`).
  - [`History`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L692): sof tushum `6,720,000` so'm qolgan.
- **`ALL: 20,160,000`:**
  - Jami tushgan sof to'lovlar summasi (`30,960,000` to'lov minus `10,800,000` qaytarish).
- **Qayerda ishlatiladi:**
  - [`Loaners`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L699) hisobida: `Accrual.ALL (32,252,903.29) - History.ALL (20,160,000) = 12,092,903.29` so'm (mijozning amaldagi qarzi).
  - [`Account`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L701) kunlik balansida: tushum bo'lgan kunlarda balansga qo'shiladi.
- **Manba funksiyasi:** [`Yamls.computeHistory`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L1080).










