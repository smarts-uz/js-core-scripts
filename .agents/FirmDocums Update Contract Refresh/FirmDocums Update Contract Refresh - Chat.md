# FirmDocums Update Contract Refresh

## 👤 User

update chaqirilganda company root dagi ALL.contract data ni read qilib keyin ozini - Theory ga archvie qilib keyin c:\Users\Administrator\.agents\skills\smarts-firm-docums\templa\ALL.contract ni company rootga copy qilib read qilingan datani toliq priocess qilib company rootdagi ALL.contract ga  yozib qoyishi kerka

## 🤖 Assistant

(no text)










## 👤 User

hozir qanaqa ishlamoqda>?

## 🤖 Assistant

`update` action yo'q hali — avval mavjud `contract-dot-create` action ni o'qiyman.










## 👤 User

update deganda "d:\Develop\Projects\DevApp\Execute\JS\Sources\scripts\Yamls\contractUpdate.mjs" --yaml "%1" ni aytyapman

## 🤖 Assistant

(no text)










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\Mamurjon\CODENOVA\ALL.contract

Tariff: 1-450k ni ham huddi PriceMon: ga oxshab aRRAY qilish kerak. array key: date boladi. 1 - array key doim agar ActDateStart: mavjud bolsa unga, agar yoq bolsa ContractDate:  ga teng boladi. array value esa 1-450k KABi d:\Develop\Projects\DevApp\Execute\JS\Sources\conf\cost\ dan olinadigan narxlar bolaid.
bu feature nega kerak: firmalar yangi shartnoma qilganda 1 ta tarifda (masalan 1-450k), keyin bir necha oydan keyin boshqa tarifga otishi mumkin. keyin yil tugaganda tarifni narxlari ozgarishi mumkin,.

## 🤖 Assistant

- Jest test suite ishga tushirildi.
- Test natijasi kutilmoqda.










## 👤 User

(no prose)

## 🤖 Assistant

- To'liq Jest test suite ishga tushirildi.
- Tugashi kutilmoqda.

- `Yamls.contractUpdate.mjs` ishlash tartibi:
- `Yamls.update` chaqiriladi.
- Root dagi `ALL.contract` `- Theory\ALL <sana>.contract` ga arxivlanadi, rootdagi fayl o'chiriladi.
- `RestAPI` papkasi arxivlanadi.
- Arxivlangan eski fayldan barcha parametrlar o'qiladi.
- `C:\Users\Administrator\.agents\skills\smarts-firm-docums\templa\ALL.contract` rootga `ALL.contract` qilib ko'chiriladi.
- `Yamls.fillYamlWithInfo` orqali yangi shablonga ma'lumotlar to'liq qayta hisoblab yoziladi.

- `Tariff` array tizimi:
- `Tariff` `PriceMon` kabi date-keyed array formatiga o'tkazildi.
- 1-kalit qoidasi: `ActDateStart` bo'lsa unga, bo'lmasa `ContractDate` ga teng.
- Qiymat `conf\cost\<Tariff>.yaml` fayllari bilan bog'landi.
- Shartnoma davomida tarif o'zgarsa, `PriceMon` va `PriceMaxMon` har bir oy uchun tegishli tarif narxini oladi.

- Amalga oshirilgan ishlar:
- `classes/Yamls.js` ichida `normalizeTariff`, `writeTariff` va `buildPriceMonEntries`/`buildPriceMaxMonEntries` multi-tariff funksiyalari qo'shildi.
- `scripts/Yamls/contractUpdate.mjs` to'g'ridan-to'g'ri `Yamls.update` chaqiradigan qilib sozlandi.
- `CODENOVA\ALL.contract` faylida `contractUpdate` ishlatilib, `Tariff: 1-450k` `Tariff:\n  - 2025-03-20: 1-450k` holatiga yangilandi.
- Jest testlari to'liq o'tdi (1119 ta test muvaffaqiyatli).
- O'zgarishlar git ga commit qilindi: [40b8acf2](https://github.com/smarts-config-git/commit/40b8acf2e99e1b4c94e64594602dfe84aa249094).










## 👤 User

Yamls.update va Yamls.fillYamlWithInfo da agar Tariff  oddiy string bolsa - uni value sini olib, tariff ni array ga convert qilib yuqoridagi string dan olingan value ni arrayni item value si qilib yozib qoyish kerak!

## 🤖 Assistant

- `Yamls.update` va `Yamls.fillYamlWithInfo` ichida string `Tariff` ni array ga konvertatsiya qilish qo'shildi.
- String qiymati olinib, array elementi qiymatiga o'tkaziladi (`[ { [sana]: 'string-qiymat' } ]`).
- Kalit: `ActDateStart` mavjud bo'lsa unga, bo'lmasa `ContractDate` ga teng.
- `tests/Yamls.test.js` ichiga har ikkala metod uchun testlar qo'shildi, barcha 173 ta test muvaffaqiyatli o'tdi.
- Git commit yaratildi: [1e4b642f](https://github.com/smarts-config-git/commit/1e4b642f2bd7a629218bfccae56afac948ea5e1a).










## 👤 User

c:\Users\Administrator\.agents\skills\smarts-firm-docums\templa\ALL.contract ni firm-docums templa update qilvor.

## 🤖 Assistant

Testlar ishga tushirildi. Natijani kutyapman.










