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










## 👤 User

PenaltyON: nimaga kerak?

## 🤖 Assistant

`PenaltyON:` — Excel hisobotiga (sverka aktiga) penya summasini **chiqarish yoki yashirish** uchun kalit (flag).

### Qanday ishlaydi

- **`PenaltyON: true` bo'lsa:**
  - Hisoblangan [`Penalty`](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L1450) summalari Exceldagi `{Penalty}` ustuniga to'liq yoziladi.
  - Mijozga rasmiy aktda kechiktirilgan to'lovlar uchun penya hisoblab taqdim etiladi.
- **`PenaltyON: false` yoki bo'sh bo'lsa (default):**
  - Exceldagi `{Penalty}` katagi tozalanadi (bo'sh qoladi).
  - Mijozga beriladigan Excel hisobotida penya talab qilinmaydi.
- **Muhim jihatlari:**
  - [ALL.contract](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L1427-L1471) ichida `PenaltyDays` va `Penalty` baribir har doim avtomatik hisoblanib turadi.
  - `PenaltyDays` (kechikkan kunlar soni) bu bayroqchaga qaramasdan Excelga chiqadi.
  - `PenaltyON` faqat pul summasining Excelga tushishini boshqaradi.
- **Manba kodi:** [`Excels.processPenalty`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Excels.js#L240).










## 👤 User

hamma ALL.contract file larda default value true boladi. agar empty bolsa - kodda default true deb hisoblanadi

## 🤖 Assistant

I have launched the commit process via `commitBatch.mjs` and will wait for it to complete.

Barcha `ALL.contract` fayllari va kodda `PenaltyON` uchun default qiymat `true` qilib belgilandi.

### Qilingan ishlar

- [`Excels.processPenalty`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Excels.js#L240): `PenaltyON` bo'sh (`null`, `undefined`, `''`) bo'lsa yoki ko'rsatilmagan bo'lsa, avtomatik `true` deb olinadi; faqat `false` bo'lgandagina o'chiriladi.
- [`Yamls.adoptLegacyContractData`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js#L1547): shartnoma yuklanganda `PenaltyON` bo'sh bo'lsa, `true` qiymati beriladi.
- [templa/ALL.contract](file:///C:/Users/Administrator/.agents/skills/smarts-firm-docums/templa/ALL.contract#L97): shablon faylida `PenaltyON: true` deb yangilandi.
- [CODENOVA/ALL.contract](file:///d:/FSystem/ALL/Humans/Rentalls/Mamurjon/CODENOVA/ALL.contract#L1425): faylida `PenaltyON: true` holatiga keltirildi.
- Testlar yangilandi va tekshirildi:
  - [`tests/Excels.test.js`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/tests/Excels.test.js): `PenaltyON` bo'sh/yo'q bo'lganda ham penya yozilishi tekshirildi.
  - [`tests/Yamls.test.js`](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/tests/Yamls.test.js): `adoptLegacyContractData` da `true` default qilinishi test qilindi.
- Barcha testlar va lint 100% yashil o'tdi.
- Git commitlar push qilindi:
  - [`343ca4be`](https://github.com/smarts-uz/js-core-scripts/commit/343ca4be9d4de1e5fe35b2dd4d0492fe34bea43d) — `classes/Excels.js`
  - [`edff4090`](https://github.com/smarts-uz/js-core-scripts/commit/edff4090ad9cedfa2e436d900cbb8c05bcd853a2) — `classes/Yamls.js`
  - [`febc893d`](https://github.com/smarts-uz/js-core-scripts/commit/febc893d83c6a31fe6144589d26d0102e5ad0b3e) — `tests/Excels.test.js`
  - [`a2ed0063`](https://github.com/smarts-uz/js-core-scripts/commit/a2ed00635e9372d2ad7a4c8a31f4e131b694fdee) — `tests/Yamls.test.js`










