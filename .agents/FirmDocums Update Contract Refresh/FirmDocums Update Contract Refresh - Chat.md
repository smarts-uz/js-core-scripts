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










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\ErdunShi\ELECTROSILK\ALL.contract bu eski formatdagi ALL.contract

Yamls.update va Yamls.fillYamlWithInfo qilganda eski format dagi ALL.contract dag i valuelarni moslab, adopt qilib yangi formatga kriitib qoyish kerak. masalan: tariff, ComDate:-> ContractDate:, ComDateEnd: -> ActDateEnd: va h.k.,
agar eski formatdagi biror value ni convert qilishni bilmasang - AskUserQuestion da  so'ra!

## 🤖 Assistant

(no text)










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\AnvarIkr\SUVPROM DRILLER\ALL.contract
d:\Develop\Projects\ALL\ALL\- Theory\CN SRental 20.contract

shunaqa formatdagi eski contract file larni ham support qilsin.

Yamls.update va Yamls.fillYamlWithInfo da

## 🤖 Assistant

(no text)










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\Perfects\ZHONGYA HONGTAO GLOBAL\ALL.contract
d:\FSystem\ALL\Humans\Rentalls\OnOffice\LOWVOLTAGE\ALL.contract

## 🤖 Assistant

(no text)










## 👤 User

@[Quote] hunaqa formatdagi eski contract file larni ham support qilsin.

Yamls.update va Yamls.fillYamlWithInfo da

## 🤖 Assistant

(no text)










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\Otabek\Adgent Tech\ALL.contract

hunaqa formatdagi eski contract file larni ham support qilsin.

Yamls.update va Yamls.fillYamlWithInfo da

## 🤖 Assistant

(no text)










## 👤 User

d:\FSystem\ALL\Humans\Rentalls\Sunnat\NATURE ECO WOOD\ALL.contract bularni ham support qilsin

## 🤖 Assistant

(no text)










## 👤 User

Savollaring bo'lsa ber!

## 🤖 Assistant

Eski formatdagi fayllarni moslashtirish bo'yicha quyidagi savollar mavjud:

1. `CN SRental 20.contract` kabi juda eski fayllarda `Tariff:` qatori yo'q, lekin `Area:` va `Price1:` mavjud. Tariff qanday aniqlansin?
- (Recommended) Auto-detect from Area and Price1 (masalan: Area: 20 va Price1: 1,800,000 bo'lsa -> 20-1800k)
- Har doim config.yml dagi DefaultTariff (1-450k) ga tushsin

2. Eski faylda `Sur*` bloki umuman bo'lmasa, lekin `DirPassport` (masalan: AD1542521) mavjud va kafil direktorning o'zi bo'lsa:
- (Recommended) DirPassport dan oling (seriya va raqamga ajratib SurPassportSerial va SurPassportNumber ga yozilsin)
- SurPassportSerial va SurPassportNumber bo'sh qoldirilsin

3. `NATURE ECO WOOD/ALL.contract` faylida `Loaners: 266,666.64` qatori ostida birdaniga `- 2026-08-04...` array qatorlari yozilgan (YAML xatosi chiqaradi). Bu holatda nima qilinsin?
- (Recommended) Skalyar qiymatni (266,666.64) qoldirib, uning ostidagi qolib ketgan array elementlarini avtomatik tozalash/e'tiborsiz qoldirish
- Loaners ni array sifatida o'qishga harakat qilish

Eski formatdagi 7 ta faylni tekshirish boshlandi. Natijani kutyapman.










## 👤 User

eng oxirida d:\FSystem\ALL\Humans\Rentalls\ ichidagi hamma ALL.contract lar ni recursive read qilib yuqoriadi update.mjs scirpt bilan process qil va oxirida ozing yaxshilab tekshir ! xatolar bolsa fix qilib ket!

## 🤖 Assistant

Testlar fon rejimida ishga tushirildi, natija kutilmoqda.

Testlar to'plami bajarilmoqda. Natija chiqqach darhol xabar beriladi.










## 👤 User

(no prose)

## 🤖 Assistant

Barcha `ALL.contract` fayllarini yangilash fon rejimida boshlandi.
Jarayon yakunlanishi bilan to'liq hisobot taqdim etiladi.










## 👤 User

(no prose)

## 🤖 Assistant

Yamls testlari tekshirilmoqda. Natija kutilmoqda.

JINFENG shartnomasi tekshirilmoqda. Natija kutilmoqda.

To'liq testlar to'plami tekshirilmoqda. Natija kutilmoqda.

Testlar to'plami bajarilmoqda. Natija chiqishi bilan darhol ma'lumot beriladi.










## 👤 User

(no prose)

## 🤖 Assistant

Barcha eski formatdagi `ALL.contract` fayllarini qo'llab-quvvatlash va yangilash to'liq yakunlandi.

### Bajarilgan ishlar:
- [Yamls.js](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js) ga `Yamls.adoptLegacyContractData` integratsiya qilindi.
- `Tariff`: string qiymat `[{ 'YYYY-MM': 'value' }]` massiv formatiga avtomatik o'tkaziladi.
- `Area` va `Price1` bo'lsa, mavjud bo'lmagan `Tariff` avtomatik hisoblab topiladi.
- Eski sana kalitlari (`ComDate`, `ComDateEnd`, `ComDateIjara`, `ActDate`, `Year+Month+Day`) yangi `ContractDate`, `ActDateEnd`, `IjaraDateEnd`, `ActDateStart` formatlariga moslashtirildi.
- `TelegramGroupID`/`TelegramTopicID` mos ravishda `TgGroupID`/`TgTopicID` ga o'tkazildi.
- `SurPassport` seriya va raqamga ajratildi, grek/kirill o'xshash harflari normallashtirildi, mavjud bo'lmaganda `DirPassport` dan olindi.
- Ruscha `ComType` shakllari (`ООО` -> `MChJ`, `ИП` -> `YaTT`, `ЧП` -> `XK` va boshqalar) hamda `ComOpf`/nom bo'yicha aniqlash qo'shildi.
- [Yamls.loadAndParseYaml](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Yamls.js) da skalyar ostidagi yetim ro'yxat qatorlari tozalash mexanizmi kiritildi.
- [Didox.js](file:///d:/Develop/Projects/DevApp/Execute/JS/Sources/classes/Didox.js) da `address` bo'sh kelganda xatolik bermaslik tuzatildi.
- `conf/bank` da ko'rsatilgan bank fayli bo'lmaganda `DefaultBank` ga xavfsiz o'tish ta'minlandi.
- [c:\Users\Administrator\.agents\skills\smarts-firm-docums\templa\ALL.contract](file:///c:/Users/Administrator/.agents/skills/smarts-firm-docums/templa/ALL.contract) andozasi sinxronlandi.

### Tekshiruv natijalari:
- Foydalanuvchi ko'rsatgan barcha fayllar (`ELECTROSILK`, `SUVPROM DRILLER`, `CN SRental 20`, `ZHONGYA HONGTAO GLOBAL`, `LOWVOLTAGE`, `Adgent Tech`, `NATURE ECO WOOD`) yangilandi va tekshirildi.
- `d:\FSystem\ALL\Humans\Rentalls\` papkasidagi barcha 289 ta `ALL.contract` fayllari to'liq yangilandi (289 / 289 muvaffaqiyatli).
- Barcha testlar yashil: 27/27 test suite, 1133/1133 test o'tdi.
- Kod lint tekshiruvidan o'tdi (0 xato).
- O'zgarishlar commit qilindi va push qilindi: [`96666ebf`](https://github.com/smarts-uz/js-core-scripts/commit/96666ebf775300c32bbec36fcc88688d73fafc1d).










