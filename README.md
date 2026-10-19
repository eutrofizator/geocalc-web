# GEOkalkulus 1.0

A **GEOkalkulus 1.0** a valódi GeoCalc 3.5 földmérési program webes változata. A cél nem egy „modern
újraírás”, hanem az eredeti program **küllemének és működésének** követése: a felület egy klasszikus
Windows/Delphi alkalmazás (menüsor, ikonsáv, MDI munkalap-ablakok, állapotsor), a bemenet és a
kimenet pedig a valódi `.gcd` nyelv, illetve a valódi `.PYX` / `.PYX2` / jegyzőkönyv-formátum.

A számítómag tiszta függvényekből áll (egy futás eredménye csak a bemenettől függ), ezért a
számítások nem keveredhetnek össze, és újraindítás sem kell.

## Használat

**Duplakattintással:** nyisd meg a `dist/GEOkalkulus-1.0.html` fájlt (egyetlen önálló fájl, szerver és
telepítés nélkül, webfont és hálózat nélkül; `npm run build` készíti).

## Felület (a valódi program szerkezete)

- **Címsor** – `GEOkalkulus 1.0 – <munkaterület>`.
- **Menüsor** – Fájl · Szerkesztés · Számítás · Hálózat · Transzformáció · Adatcsere · Beállítások ·
  Ablak · Súgó.
- **Ikonsáv** – a súgó 3. oldalán felsorolt **15 parancsikon**, ugyanabban a sorrendben.
- **Munkaterület (MDI)** – a munkalapok önálló ablakokban nyílnak (nagyítva indulnak, visszaállítva
  áthelyezhetők, kaszkádba rendezhetők; az Ablak menü listázza őket).
- **Állapotsor** – állapotüzenet, összegzés, az aktív munkalap neve.

### Munkalapok

| Munkalap | Állapot |
|---|---|
| Geodéziai számítások/Munkaterület | **működik** (kódolt bemenet + jegyzőkönyv) |
| Geodéziai számítások/Adatleíró | **működik** (űrlapos adatbevitel, kódgenerálás, automatikus kódolás) |
| Geodéziai számítások/Beállítások | **működik** (a jegyzőkönyv előlapja, `borito.ini` be/ki) |
| Adatrögzítő/Beállítások | **működik** (rögzítőtípus, távolságredukció, TVET.TXT, átlagok) |
| Hálózatkiegyenlítés/Munkaterület | **működik** (vízszintes beillesztett és önálló, magassági, részletpontok, sokszögvonal-előzetes, mérési vázlat, hálózati dátum) |
| Hálózatkiegyenlítés/Beállítások | **működik** (középhibák, súlyok, statisztikai próbák, hibahatár-előbeállítás, számítás élessége) |
| Térbeli transzformáció/Paraméterek számítása | **működik** (7 paraméteres illesztés, keresősugár, kétlépcsős módszer, **interpoláció**) |
| Térbeli transzformáció/Átszámítás | **működik** (megadott paraméterekkel, **interpolációval**, kimeneti formátumokkal) |
| Mérési adatok és koordináták | **működik** (állományok + beolvasott pontok) |
| Adatcsere/Koordináta kezelő | **működik** (válogatás, mezők, feltétel, export) |
| Adatcsere/Koordináta állomány készítése | **működik** (kézi jegyzék + GeoCalc-DB / .PYX / földrajzi kimenet) |
| Adatcsere/AKG jegyzőkönyv készítése | **működik** (parcellák, AKG_* leíró adatok, szöveges jegyzőkönyv) |
| Súgó | **működik** (a súgó kivonata) |

A menüsor, az ikonsáv és a munkalap-nevek a valódi program szerintiek; ahol a webes változat a súgó
képére vagy nem közölt részletre támaszkodik, a munkalap **fenntartást** ír ki (lásd a
„Megjegyzések” szakaszt).

### Gyorsbillentyűk, munkamenet és táblázatkezelői kimenet

- **Gyorsbillentyűk** – a menükben kiírt billentyűk működnek: `F5` vagy `Ctrl+Enter` (számítás
  futtatása), `Ctrl+N` (új munkaterület), `Ctrl+O` (megnyitás), `Ctrl+S` (mentés `.gcd` állományba),
  `Ctrl+P` (nyomtatás), `Ctrl+A` (minden kijelölése a szerkesztőben), `F10` (menüsor), `Esc` (menü).
  A gépelést nem zavarják: a `Ctrl+A` csak a szerkesztőben és a menükben érvényesül.
- **Munkamenet (`.gcs`)** – a Fájl menü „Munkamenet mentése…” parancsa a **teljes munkaterületet**
  (minden munkalap beállítását és tartalmát) egyetlen, önmagát leíró JSON-fájlba gyűjti; a
  „Munkamenet betöltése…” visszatölti és újratölti az oldalt. Így a munka hálózat és szerver nélkül
  átvihető másik böngészőbe vagy gépre.
- **Táblázatok (.csv)** – a számítási, hálózati, adatrögzítő és átszámítási munkalapok
  „Táblázatok (.csv)” gombja a jegyzőkönyv összes táblázatát táblázatkezelőbe adja: **pontosvesszős**
  elválasztás, **UTF-8 bájt-sorrendjel (BOM)** és idézőjeles mezők – így a magyar Excel is azonnal
  helyesen nyitja.

### Adatleíró (súgó 44. o.)

A kódolás helyett űrlaposan lehet előkészíteni a számításokat. A bal oldalon a három oszlop
(**AP** – álláspont, **ID**, **IP** – irányzott pont) a bevitt mérésekből épül fel: az álláspont
kiválasztása után az arról mért irányok jelennek meg, „ismert”/„szabad”, illetve „ismert”/„új”
jelöléssel aszerint, hogy a pont szerepel-e a koordináta-állományban.

- **Mérési adatok** – kézzel felvehető táblázat (álláspont, irányzott pont, irány `FOK.PPMMSS`,
  távolság), illetve „Mérési jegyzőkönyv…” (soronként `álláspont, pont, irány[, távolság]`) és
  „Koordináta állomány…” beolvasása.
- **Számítás típusa** – TJ, PO, KP, VP, ET, SV, SM; a „Kód előállítása” a kijelölt álláspontból és
  irányzott pontokból a választott típus **azonnal futtatható** kódblokkját adja (a súgó 44. oldala
  szerinti fejezet- és mezőrenddel). A típushoz tartozó extra mezők (új pont, kezdő irány, központra
  mért irány és külpontosság) csak akkor látszanak, ha kellenek.
- **Automatikus kódolás** – beállítható az álláspont számítási kódja (TJ – ismert ponton állunk fel,
  vagy VP – szabad álláspont) és a tájékozó irányok száma; ezekből álláspontonként előbb a tájékozás
  (TJ/VP), majd a többi irányból a poláris pontszámítás (PO) készül.
- **Konverzió** – a kód a Munkaterületre kerül és lefut; **Mentés** `.gcd` állományba írja.

### Koordináta kezelő (Adatcsere, súgó 72. o.)

A GeoCalc adatbázis koordinátáinak **SQL `select` logikájú** válogatása és konvertálása. Adatforrás az
utolsó futás összes pontja, vagy egy beolvasott `.PYX`/`.PYX2`/szöveg adatbázis.

- **Mezők megadása** – a kimenet oszlopai (Pontszám, Y, X, M, Kód): ki-/bekapcsolhatók, a ▲▼ nyilakkal
  átrendezhetők, a „Mező(k)” gomb az alapértelmezett helyzetet állítja vissza.
- **Feltétel (WHERE)** – mező + logikai művelet (`=`, `≠`, `<`, `>`, `≤`, `≥`, „tartalmazza”,
  „ezzel kezdődik”, „ezzel végződik”) + keresett érték; több feltétel **AND** vagy **OR**
  kapcsolattal fűzhető össze. A számmezőket számszerűen, a szövegmezőket szövegesen hasonlítja.
- **Mezőjellemzők** – elválasztó (szóköz, vessző, vessző és szóköz, pontosvessző, tab), tizedesek
  száma, mezőnkénti hossz, „Üres helyeket levágni” (a beállított hossztól függetlenül), valamint
  „Számított jelző oszlop” (a `K>` kimenet utolsó mezője).
- **Előnézet** – a szűrt, pontszám szerint rendezett tábla; az „Állomány készítése” a beállított
  formátumban tölti le.

### Adatrögzítő (súgó 12–15. és 62–63. o.)

A terepi adatrögzítők feldolgozásának beállításai és a mért adatok redukciója.

- **Adatrögzítő típusa** – a súgó 15. oldalán felsorolt tíz formátum (GeoCalc-AR, Geodimeter UDS,
  GeoMAX, GeoProfi MJK, Leica GSI-8, Leica GSI-16, Leica TC/TPS, Sokkia SDR alfanumerikus és
  numerikus, Topcon).
- **Hiányzó távolságok** – „mérésekből átveszi” vagy „koordinátákból számolja” (a súgó 44. oldala).
- **Távolságredukció** – nincs / külső program / vetületi. A vetületi redukció képlete:
  `Tv = Tf · sin(Zi) · (1 − M/R) · k · (1 + d²/(2R²))`, ahol `M` az átlagos magasság, `d` a redukciós
  koordináta eltérése a kezdőértéktől, `k` a vetületi méretarány és `R` a redukciós sugár. A súgó
  szerint az **EOV**-nál `k = 0.99993`, `R = 6379743.001` és a redukciós koordináta az **X**, a HÉR,
  HKR, HDR és sztereografikus vetületnél `R = 6378512.966` és az **Y**; a méretarány, a sugár és a
  tengely felülírható.
- **Átlagok** – kézzel, vagy az „Átlagok koordináta-állományból…” gombbal egy `.eov`/`.pyx` állomány
  pontjaiból. A súgó 62. oldali mintapéldája a `Pelda/Kiegyenlítés/minta_felm.eov` öt pontja:
  **Y = 602147.734 m, X = 204807.646 m, M = 43.838 m**, az átlagos magasságot pedig kézzel 110 m-re
  kell állítani (ez a minta be van építve a „Minta” gomb mögé).
- **TVET.TXT** – a külső redukáló program adatcseréje: a *bemenet* menthető (`sorszám, magassági
  szög, ferde távolság`), az *eredmény* beolvasható (`sorszám, vetületi távolság, magasságkülönbség`),
  és a redukciót automatikusan erre váltja.
- **Mérési adatok (kézi bevitel)** – **táblázatban**, soronként: a `#` (üresen hagyható, a program
  sorszámoz), a `Hz` (vízszintes szög), a `Zi` (magassági szög), a `Tf` (ferde távolság), a `Mj`, az
  `Mm` és a `Pkód`. A szögek a GeoCalc `FOK.PPMMSS` alakjában értendők, és a beírás alatt rögtön
  megjelenik az emberi alak is (`91.2345` → `91°23′45″`). A **`Tv` (vízszintes távolság) és a `dM`
  (magasságkülönbség) oszlopot a program számolja** – zöld háttérrel, a beírás mellett azonnal –, és
  ugyanezek az értékek kerülnek a jegyzőkönyvbe is. A képlet: `dM = Tf · cos(Zi) + Mm − Mj`; a sor
  számolt cellájára állva a számítás lépései is látszanak.
  Hibás mezőnél a cella piros keretet kap, a program a hibát kiírja, a többi sor pedig feldolgozható
  marad. Új sor a „+ Mérési sor”, törlés a sor végén a `×` gombbal. A **szöveges bevitel**
  (beillesztéshez) a táblázat tükörképe: a beillesztett sorok azonnal átkerülnek a táblázatba, és
  fordítva, a táblázat tartalma mindig látszik szövegként is. A szögek a jegyzőkönyvben is `FOK.PPMMSS`
  alakban jelennek meg (ugyanúgy, ahogy beírtad).
- **Redukált mérések (.txt)** – a teljes méréslista ugyanabban a `sorszám, Hz, Zi, Tf, Tv, dM, Mj, Mm,
  Pkód` alakban (a szögek hat tizedesjegyű `FOK.PPMMSS`-ként), ezért a fájl **változatlanul
  visszatölthető** a táblázatba.

> **Fenntartás:** a vetületi redukció képletét a súgó 62–63. oldala **képként** közli (a
> `gc35_help.exe`-ből nem kinyerhető), ezért a webes változat a szabványos magassági és vetületi
> redukciót alkalmazza a súgóban megadott állandókkal; a **bájtos egyezés nem igazolt**. A jegyzőkönyv
> ezt a megjegyzést mindig kiírja.

### Térbeli transzformáció/Paraméterek számítása (súgó 65–69. o.)

A közös pontokból illesztett **hét paraméteres hasonlósági transzformáció** (WGS 84 geocentrikus
`X, Y, Z`, illetve EOV `Y, X, M`), a paraméterek középhibaival, a pontonkénti javításokkal, a
**keresősugárral** (a közös pontok kiválasztása térbeli távolság alapján) és a **kétlépcsős
módszerrel** (a közös pontok listájának bővítése egy kijelölt pont átszámítása után).

- **Interpoláció** – bekapcsolva a súgó 65. oldala szerint a közös pontok javításaiból az
  átszámítandó ponthoz **legközelebb eső három közös pont** pontra rögzített topocentrikus
  rendszerében **komponensenként külön síkot** illeszt, és a sík értékét adja a pont transzformált
  geocentrikus koordinátáihoz. A jegyzőkönyv pontonként kiírja az alkalmazott `vX, vY, vZ` javítást
  és a felhasznált közös pontokat. A paraméterszámításnál az interpoláció bekapcsolása a kiválasztott
  közös pontokat is átadja az átszámítás munkalapnak. Keresősugárral együtt nem alkalmazható (a
  felület erről tájékoztat), és 3-nál kevesebb közeli pontnál a **súlypont** (nulla javítással)
  fiktív pontként vesz részt az illesztésben; ha a pontok egy egyenesbe esnek, a javítások átlaga
  kerül a korrekcióba.

> **Fenntartás:** a súgó 68. oldali mintapéldáján az `A` pont javítása és interpolált koordinátája
> **pontosan** adódik (`604155.242 213879.061 177.085`), a `B` pont közölt értéke viszont a
> dokumentált eljárással nem reprodukálható (a webes változat `612902.435 212831.043 160.053`-t ad a
> súgó `612902.442 212831.092 160.084` értéke helyett); a `tests/interpolate.test.ts` mindkettőt
> rögzíti.

### Térbeli transzformáció/Átszámítás (súgó 63–64. o.)

A kiszámított (vagy kézzel megadott) hét paraméterrel végzi a pontok átszámítását.

- **Paraméterek átvétele** – közvetlenül a „Térbeli transzformáció/Paraméterek számítása” munkalap
  utolsó illesztéséből (rendszer, vetület jellege, hét paraméter). Keresősugaras módszernél nincs mit
  átvenni (pontonként más paraméter), ezt a munkalap jelzi.
- **Paraméterek kézi megadása** – eltolás [m], forgatás [″], méretarány [mm/km], pozíció-vektor
  értelmezéssel: `X′ = T + (1 + s)·(X + R × X)`. A **Leica SKI** jelölőnégyzet a súgó szerint a
  három forgatási szöget fordított előjellel veszi (az eltolás és a méretarány azonos).
- **Kimenet** – Koordináta (szöveges), Földrajzi (szöveges) vagy GeoCalc-DB (`.pyx`), illetve
  jegyzőkönyv nyomtatása/PDF-be.
- **Hozzáadás a közös pontokhoz** – a **kétlépcsős módszer**: az átszámított pont a paraméterszámítás
  mindkét közös-pont listájára rákerül, így a számítás az új ponttal bővülve fut újra.

A beépített minta a valódi `Pelda/Transzformacio/minta_tr.*`: a hat közös pontból illesztett
paraméterekkel az `A` pont `604155.249 / 213879.069` értéket ad, a valódi `minta_tr_ab.eov`
`604155.24 / 213879.06` értékével szemben (**1 cm** eltérés) – ezt a `tests/apply.test.ts` és a
böngészős végpróba is rögzíti.

### Koordináta állomány készítése (súgó 74. o.)

Kézzel begépelt pontok jegyzéke. A **típus** oszlopban `Y, X, M`; `X, Y, Z` (WGS 84 geocentrikus)
vagy **földrajzi** koordináták adhatók meg. A földrajzi bevitel „áldecimális”: a `19° 18′ 22.31643″`
értéket **`19.182231643`** alakban kell írni (a másodperc tizedespontja a bevitelből kimarad). A
jegyzék három formátumban menthető: **GeoCalc adatbázis** (`.pyx2`), **`.PYX`** (fix szélességű,
csak `Y, X, M` pontokból) és **földrajzi szöveges**. Betöltéskor a `.PYX`/`.PYX2` és a szöveges
állományok is értelmezhetők.

### AKG jegyzőkönyv (súgó 75. o.)

A 61/2009. (V. 14.) FVM rendelet szerinti mérési és számítási jegyzőkönyv.

- **Adatforrás** – koordináta-állomány (`PSZ, Y, X` sorok) és **AMS leíró állomány**
  (parcellánként a sarokpontok `#` … `;;` között). A webes változat a súgóban leírt kézi utat
  dolgozza fel (GIS adatbázisok helyett).
- **Parcellák** – vetületi (shoelace) terület m²-ben és hektárban, kerület, súlypont; a **parcella
  választóval** parcellánként adhatók meg az `AKG_ID`, `AKG_BLOKK`, `AKG_REGSZ`, `AKG_FOLDH`,
  `AKG_CELPRG`, `AKG_CELPRGSZOVEG`, `AKG_JELOLOPONT` és `AKG_KIVETT` adatok (a megadott értékek
  parcellánként megmaradnak).
- **Célprogram azonosítója** – a súgó szerint elég üres hellyel beírni: az `a ad 1` bevitelből a
  „kiegészítés” gomb **`a) ad) 1.`** alakot készít (a betűjelek `)`, a számok `.` jelet kapnak).
- **Kimenet** – a jegyzőkönyv (közös adatok, parcellák, sarokpontok, AKG_* adatlap, a generált
  állományok nevei), a parcellák sarokpontjainak listája, valamint az `AKG_REGSZ_AKG_BLOKK_AKG_ID`
  nevű `PDF`/`SHP`/`_P.shp` állományok **neveinek** kiírása.

> **Fenntartás:** a PDF és a SHP kimenet (a `gc35.ini` `[AKG]` `SHPDIR`/`PDFDIR`/`RELPATH`
> beállításaival) a valódi programot igényli; az `AKG_CELPRGSZOVEG` rendelet szerinti szövege nem
> generálható, ezért kézzel adható meg.

### Hálózatkiegyenlítés/Munkaterület (súgó 42. o.)

A kiegyenlítés a **mérések kizárása** táblázatból vezérelhető: minden irány és távmérés egy-egy
jelölőnégyzetes sor (`álláspont>célzott pont:dir`, illetve `:dist`), a durva hiba miatt kihagyott
mérések bejelölve, de zárolva jelennek meg. A **„Minden mérés kizárása”** és **„Minden mérés
visszavétele”** gombok a teljes listát állítják, a kiegyenlítés pedig azonnal újrafut. A számított
eredmények (jegyzőkönyv, `Táblázatok (.csv)`, nyomtatás) a kizárásokat is tartalmazzák.

### Hálózatkiegyenlítés/Beállítások (súgó 62. o.)

A középhibák, súlyok és statisztikai beállítások a Munkaterülettel **közösek**. Új elem a
**hibahatár-előbeállítás** (szabatos fősokszögvonal, V. rendű hibahatár, felmérési alaphálózat,
mikrohálózat), amely egy gombra beállítja az irány- és távmérés középhibáját, valamint a durva hiba
küszöbeit, továbbá a **számítás élessége** (cm / mm / tized mm) a jegyzőkönyvi koordinátákhoz.

> **Fenntartás:** a súgó 62. oldali mintapéldájából csak az **V. rendű hibahatár** igazolt
> (10″ irány- és 5 mm távmérés-középhiba); a többi rendűség értéke a webes változat **becslése**, és
> a felületen „– becsült” jelölést kap.

## Fejlesztés

```
npm install
npm run dev      # fejlesztői szerver
npm test         # 403 automatikus teszt (a súgó mintapéldái, valódi GeoCalc-kimenetek, a felület regisztere)
npm run build    # éles változat a dist/ mappába (önálló HTML)
```

### Böngészős végpróba

A kész, önálló fájl valódi böngészőben is végigmegy **212 ellenőrzésen** (menük, munkalapok,
állapotsor, jegyzőkönyv, a letöltött `.gcd` / `.gcs` / `.csv` fájlok tartalma, hibakezelés,
gyorsbillentyűk). Ehhez egy futó, fejlesztői porttal indított Chrome kell:

```
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\geocalc-chrome about:blank
npm run build
npm run browser-check     # 1-es kilépési kód, ha bármelyik ellenőrzés elbukik
```

## Mit tud a számítómag

- **Geodéziai számítások** (a valódi `.gcd` bemenettel): IT, PO, EM, EB, ET, KM, DK, TE, TO, ZK, TJ,
  SV (nyitott, beillesztett, tájékozatlan és kétoldalt tájékozott), SM, KP, VP, EK, AF, HE.
- **Hálózatkiegyenlítés** (GMJ jegyzőkönyvből): vízszintes hálózat (**beillesztett vagy önálló**;
  irány- és távmérés, előzetes koordináták, durva hibák kiszűrése, súlyozás, statisztikai próbák,
  hibaellipszis, a mérések kézi kizárása a jegyzőkönyv jelölőnégyzetével – súgó 42. o.), trigonometrikus magassági hálózat
  (beillesztett vagy önálló), részletpontok számítása, **sokszögvonal-előzetes** (nyitott, beillesztett
  és zárt poligon a hátra-/előreirányokból, szög- és vonalas záróhibával) és **hálózati dátum**
  (az önálló hálózat eltolása és forgatása). Új pont: a koordináta nélküli állomás vagy a megadott
  „további pont”; a többi koordináta nélküli irányzott pont részletpont. A nyers, kétállásos (I. és
  II. távcsőállású) jegyzőkönyv középelését is elvégzi (a GeoCalc GCAR_2T átalakítójának képleteivel,
  annak hibáit javítva), naplóval.
- **Térbeli transzformáció**: EOV, UTM 33/34 és WGS 84 (X, Y, Z / φ, λ, h) közötti átszámítás közös
  pontokból számított 7 paraméteres hasonlósági transzformációval (a paraméterek középhibaival és a
  javításokkal), **keresősugárral** (a közös pontok kiválasztása térbeli távolság alapján), a
  **kétlépcsős módszerrel** (a közös pontok listájának bővítése egy kijelölt pont átszámítása után),
  **interpolációval** (a legközelebbi három közös pont javításaiból illesztett sík a pontban),
  valamint **átszámítás megadott paraméterekkel** (kézi megadás vagy átvétel a paraméterszámításból,
  Leica SKI előjellel) Koordináta / Földrajzi / GeoCalc-DB kimenettel.
- **Adatrögzítő**: a tíz rögzítőtípus beállítása, a **vetületi távolságredukció**
  (`Tv = Tf · sin(Zi) · (1 − M/R) · k · (1 + d²/(2R²))`), az átlagos Y, X, M értékek kézzel vagy
  koordináta-állományból, valamint a **TVET.TXT** adatcsere külső redukáló programmal. A mérések
  **kézzel, táblázatban** vehetők fel (Hz, Zi, Tf, Mj, Mm, Pkód), a számolt **Tv** és **dM**
  ugyanabban a sorban, azonnal látszik, a szögek emberi (fok-perc-másodperc) alakjával együtt.
- **Adatcsere**: Koordináta kezelő (SQL `select` logika), **koordináta állomány készítése**
  (`Y, X, M` / `X, Y, Z` / földrajzi pontokkal; GeoCalc-DB, `.PYX` és földrajzi kimenet) és
  **AKG jegyzőkönyv** (parcellák az AMS leíróból, terület/kerület/súlypont, `AKG_*` leíró adatok).
- Bemenet: `.gcd` (szöveges vagy RTF), koordináta-állományok feltöltése. Kimenet: `.PYX` (fix
  szélességű), `.PYX2` (vesszős), szöveges jegyzőkönyv, nyomtatás/PDF.

### A kimenet hűsége

A `.PYX` és `.PYX2` író a **valódi GeoCalc-kimenetekhez** igazodik
(`Pelda/Szamitasok/ek.PYX`, `ek.PYX2`, `Névtelen.PYX`, `Névtelen.PYX2`), és ezt a `tests/export.test.ts`
rögzíti:

- `.PYX` – a jelleg (kód) előtti rész mindig pontosan **48 karakter**: pontszám, Y (12), X (15), M + 1
  szóköz, balra igazítva. Példa: ``1              3817.292    7339.727       0.000 ``.
- `.PYX2` – `pontszám, Y, X, M, jelleg, jelző`, ahol a jelző 1, ha a pont a futás során keletkezett.
  Példa: `1, 3817.292, 7339.727, 0.000, , 1`.
- A jelleg a pont **kódja**. A kód nélküli pontot a program belül `0`-ként tárolja, de a
  kimenetben **üres** jelleg-mezőt ad (a riport „Kód” oszlopa viszont `0`-t mutat).
- A jegyzőkönyv **előlappal** indul: a „Geodéziai számítások/Beállítások” munkalapon megadott
  adminisztratív adatokkal (a valódi `borito.ini` `[JKV]` szakasza), a **jelképpel** (amíg nincs
  feltöltött céglogó, a beépített, saját geodéziai jelkép jelenik meg) és a valódi
  lábléccel („by_safi01”).
  Az előlap a szöveges jegyzőkönyvben (`reportToText`) is megjelenik.
- A koordináta-szakasz címe a valódi jegyzőkönyv szerinti: **`Felhasznált koordináták :`** (a
  kettőspont előtt szóközzel).

### Kimeneti formátumok („Egyéb azonosítók”, súgó 23. o.)

A `.gcd` nyelv `>` direktívái a koordinátákat más formátumban írják ki. A `run` mindet támogatja, a
kiterjesztést a megadott névből veszi (az `A>` esetén mindig `.dxf`):

| Direktíva | Formátum | Elrendezés | Forrás |
|---|---|---|---|
| `K>` | GeoCalc DB (vesszős) | `pontszám, Y, X, M, jelleg, jelző` | valódi `ek.PYX2` (igazolt) |
| `U>` | fix szélességű | 48 karakteres, balra igazított sor | valódi `ek.PYX` (igazolt) |
| `A>` | AutoCAD DXF | R12 DXF: `POINT` (X=Y, Y=X, Z=M) + `TEXT` a pontszámmal | súgó 72. o. (igazolt) |
| `L>` | Leica GSI-16 | 16 karakteres szavak (`11`/`81`/`82`/`83`) | nyilvános GSI-16 szabvány |
| `M>` | GeoMAX GSI-16 | a Leica GSI-16 szóelrendezése | nyilvános GSI-16 szabvány |
| `W>` | Wild (GSI-16) | mint a GSI-16, de `*` rekordjelzővel | nyilvános GSI-16 szabvány |
| `G>` | Geodimeter | `pontszám,Y,X,M` (vesszős) | nyilvános Geodimeter koordináta-lista |

> **Fontos:** a `W>`/`G>`/`L>`/`M>` **bájtos elrendezését a súgó nem közli**, és a programhoz nem
> érkezett valódi minta, ezért e négy a nyilvánosan dokumentált **műszerformátumot** követi (a
> bájt-egyezést nem tudtuk ellenőrizni) – **ez a döntés jóváhagyva**. A felületen minden ilyen fájl
> mellett megjelenik ez a megjegyzés. A `K>`, `U>` és `A>` valódi `ek.PYX`/`ek.PYX2`, illetve a súgó
> 72. oldala alapján igazolt.

## Szerkezet

| Mappa | Tartalom |
|---|---|
| `src/core/` | értelmező, motor, geodéziai modulok (`modules/`), térbeli transzformáció (`geo/`), export, jegyzőkönyv-előlap (`report.ts`), Adatleíró (`descriptor.ts`), adatcsere (`exchange.ts`), **adatrögzítő (`recorder.ts`)**, **koordináta-állomány (`coords-file.ts`)**, **AKG (`akg.ts`)**, hálózat (`network/`, benne `limits.ts`) |
| `src/` | felület (`main.ts`, `shell.ts`, `report-view.ts`, `network-view.ts`, `net-settings-view.ts`, `transform-view.ts`, `transform-apply-view.ts`, `transform-store.ts`, `descriptor-view.ts`, `exchange-view.ts`, `exchange-file-view.ts`, `recorder-view.ts`, `akg-view.ts`, `ui.ts`, `style.css`) |
| `src/shell.ts` | a Windows-hű burok: menüsor, ikonsáv, MDI-ablakkezelő, állapotsor, munkalap-regiszter |
| `tests/` | 32 tesztfájl: a súgó mintapéldái, valódi kimenetek, a felület regisztere |
| `scripts/` | a build beágyazója (`inline.mjs`) és a böngészős végpróba (`browser-check.mjs`) |
| `docs/sugo_geocalc35.txt` | a régi program súgójának kinyert szövege (4791 sor, ez a hiteles specifikáció) |

## Megjegyzések

- A program neve **GEOkalkulus 1.0** (a kimeneti fájl `dist/GEOkalkulus-1.0.html`, a jegyzőkönyv
  lábléce `by_safi01`). Az **eredeti formátumneveket szándékosan megtartottuk** – „GeoCalc adatbázis" /
  „GeoCalc-DB" (`.PYX`, `.PYX2`), a GeoCalc `FOK.PPMMSS` szögformátum, a „GeoCalc-AR" rögzítőtípus –,
  mert a valódi program ezeken a neveken ismeri őket, és így a fájlok más programokban is
  felismerhetők.
- A szögek formátuma `FOK.PPMMSS` (104.5900 = 104°59'00"); Y = kelet, X = észak.
- A kimenet a régi program értékeivel egyezik, kivéve a dokumentált eltéréseket: a KP ismeretlen
  pontjának központosítása pontos geometriával számol (a régi program közelítése nagy külpontosságnál
  méteres hibát adott), az EB eredménye ~3 mm-re tér el a súgótól (kerekítés), az EK/VP ≤3 mm-re.
- A megengedett lineáris zárási hiba képlete (`0.048 + 0.00012·L`) két közölt értékre illesztett
  összefüggés.
- A hálózatkiegyenlítés a GeoCalc saját kimenetével (egy valódi projekt) minden közölt számban
  egyezik: új pontok ±1 cm, tájékozási szögek ±1″, javítások ±1″ / ±1 mm, `Stat.`, `f`, középhibák; a
  hibahatár-képletek tájékoztató (empirikus) értékek, a globális próba alsó határa a χ² eloszlásból
  adódik (a GeoCalc alsó határa eltér).
- Nem támogatott: Gauss–Krüger, HDR, HÉR, HKR, sztereografikus, VNR rendszerek; a hálózati vázlat
  GIS-forrásból (a webes változat a súgóban leírt kézi utat dolgozza fel).
- **Interpoláció:** a súgó 68. oldali mintapéldájából az `A` pont javítása pontosan adódik, a `B`
  pont közölt értéke azonban a dokumentált eljárással nem reprodukálható (lásd a „Térbeli
  transzformáció/Paraméterek számítása” szakasz fenntartását).
- A **hálózati beállítások** a Munkaterülettel közösek. A hibahatár-előbeállítások közül csak az
  **V. rendű** igazolt a súgó 62. oldali mintapéldájából (10″ / 5 mm), a többi érték becsült, és a
  felületen „– becsült” jelölést kap. A **számítás élessége** (cm / mm / tized mm) a jegyzőkönyvi
  koordináták tizedeseit szabályozza.
- Az **EOV** vetületi redukciójánál a redukciós koordináta az **X** (észak), nem az Y: a súgó
  62. oldali mintapéldája a `minta_felm.eov` öt pontjából **X = 204807.646 m**, **Y = 602147.734 m**,
  **M = 43.838 m** átlagot ad, és a súgó az átlagos magasságot kézzel 110 m-re állítja.
