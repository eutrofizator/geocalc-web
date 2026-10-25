# GEOkalkulus 1.0

[![GitHub Pages](https://github.com/eutrofizator/geocalc-web/actions/workflows/pages.yml/badge.svg)](https://github.com/eutrofizator/geocalc-web/actions/workflows/pages.yml)

**Élő változat (telepítés nélkül):** <https://eutrofizator.github.io/geocalc-web/>

A **GEOkalkulus 1.0** a valódi GeoCalc 3.5 földmérési program webes változata. A cél nem egy „modern
újraírás”, hanem az eredeti program **küllemének és működésének** követése: a felület a GeoCalc 3.5
Windows-alkalmazás szerkezete (menüsor a hat modullal, ikonsáv, bal oldali lenyitható modulpanel,
kékeszöld fejlécű munkalapok, dátumos-órás állapotsor), a bemenet és a kimenet pedig a valódi `.gcd`
nyelv, illetve a valódi `.PYX` / `.PYX2` / jegyzőkönyv-formátum.

A számítómag tiszta függvényekből áll (egy futás eredménye csak a bemenettől függ), ezért a
számítások nem keveredhetnek össze, és újraindítás sem kell.

## Használat

**Böngészőben:** <https://eutrofizator.github.io/geocalc-web/> – a GitHub Pages a `main` ág minden
változásánál újraépíti és közzéteszi az oldalt (lásd a „Közzététel” szakaszt).

**Duplakattintással:** nyisd meg a `dist/GEOkalkulus-1.0.html` fájlt (egyetlen önálló fájl, szerver és
telepítés nélkül, webfont és hálózat nélkül; `npm run build` készíti). Ugyanez a fájl a közzétett
oldalról is letölthető: <https://eutrofizator.github.io/geocalc-web/GEOkalkulus-1.0.html>.

## Felület (a valódi program szerkezete)

A felület a valódi GeoCalc 3.5 súgójába ágyazott képernyőképek alapján készült (a színeket, az
arányokat és a feliratokat ezekről mértük; a rajzolt elemek – ikonok, jelkép – saját rajzok).

- **Címsor** – `GEOkalkulus 1.0 – <munkaterület>`.
- **Menüsor** – a hat modul: Adatrögzítő · Geodéziai számítások · Hálózatkiegyenlítés · Térbeli
  transzformáció · Adatcsere · Beállítások. Minden modulmenü a modul részeit adja (mint a navigátor);
  a Geodéziai számítások menü a szerkesztő parancsait is (Új, Megnyitás, Mentés, Számítás, Kód
  beszúrása), a Beállítások menü a munkamenetet, a nyomtatást, a Súgót és a Névjegyet.
- **Ikonsáv** – a súgó 3. oldalán felsorolt **15 parancsikon**, ugyanabban a sorrendben és csoportokban.
- **Modulpanel (navigátor)** – bal oldalon a hat modul lenyitható csoportja a súgó 5–10. oldala szerinti
  részekkel (a Beállítások csoport fejléce sötét, mint a valódi programban); a csoportok egyenként
  összecsukhatók, az elválasztó kis nyilával a teljes panel elrejthető.
- **Munkalap** – egyszerre egy látszik, a fejléce kékeszöld sávban `Modul / Lap`. Ahol a valódi program
  egy modulrészt külön lapon kezel, de a webes változat egy közös munkalapon (pl. a hálózat
  Előzetes / Vízszintes / Magassági / Részletpontok része), a navigátor a megfelelő részhez görget.
- **Indulás** – a valódi programhoz hasonlóan a **Névjegy** lappal (az Általános beállításokban az
  utoljára használt munkalap vagy a Munkaterület is választható).
- **Állapotsor** – dátum, idő (élő), állapotüzenet, összegzés, az aktív munkalap neve.

### Munkalapok

| Munkalap | Állapot |
|---|---|
| Geodéziai számítások/Munkaterület | **működik** (kódolt bemenet, a valódi szerkesztő ikonsora és állapotsora, „Előkép” riportnézegető fejezetfával és nagyítással) |
| Geodéziai számítások/Adatleíró | **működik** (űrlapos adatbevitel, kódgenerálás, automatikus kódolás) |
| Geodéziai számítások/Változási vázrajz | **új, a valódi programban nincs** (terület-összevetés a 8/2018. AM rendelet hibahatáraival, területarányos ráosztás, területkimutatás, területosztás, DAT be- és kiolvasás, földhivatali ZIP/DXF beolvasás, ITR .lst lista, határpont-azonosítás, díjszámítás, kitűzési jegyzőkönyv, vázrajz és mérési vázlat, koordinátajegyzék, címkoordináták, rajzelemek, DXF, munkák és leadandó csomag) |
| Geodéziai számítások/Beállítások | **működik** (a jegyzőkönyv előlapja, `borito.ini` be/ki) |
| Adatrögzítő/Beállítások | **működik** (rögzítőtípus, távolságredukció, TVET.TXT, átlagok) |
| Hálózatkiegyenlítés/Munkaterület | **működik** (munkaállomány, koordináták betöltése és hozzáfűzése, GMJ, középelés) |
| Hálózatkiegyenlítés/Előzetes számítások | **működik** (álláspontok, ismert, további és felhasznált pontok listája, státusz, előzetes koordináták, sokszögvonal, előzetes tájékozás) |
| Hálózatkiegyenlítés/Vízszintes kiegyenlítés | **működik** (beillesztett és önálló; mérésenként javítás, hibahatár, statisztika, kizárás kattintással, hálózati dátum, mérési vázlat) |
| Hálózatkiegyenlítés/Magassági kiegyenlítés | **működik** (magasságkülönbségek, kihagyás kattintással, adott magasságú pontok, számítás élessége) |
| Hálózatkiegyenlítés/Részletpontok számítása | **működik** (számítandó álláspontok, koordináta export, munka koordináta-jegyzék) |
| Hálózatkiegyenlítés/Beállítások | **működik** (középhibák, súlyok, statisztikai próbák, hibahatár-előbeállítás, számítás élessége) |
| Térbeli transzformáció/Paraméterek számítása | **működik** (7 paraméteres illesztés, keresősugár, kétlépcsős módszer, **interpoláció**) |
| Térbeli transzformáció/Átszámítás | **működik** (megadott paraméterekkel, **interpolációval**, kimeneti formátumokkal) |
| Adatrögzítő/Mérési adatok - koordináták | **működik** (GeoCalc GMJ és Leica GSI beolvasás, Tvet és dM számítás, kihagyás, bal/jobb középelés, mentés GMJ-be, konvertálás a hálózatkiegyenlítéshez) |
| Adatcsere/Koordináta kezelő | **működik** (válogatás, mezők, feltétel, export) |
| Adatcsere/Földrajzi koordináták konvertálása | **működik** (áldecimális, tizedes fok, fok-perc-másodperc, WGS 84 X,Y,Z, UTM 33/34) |
| Adatcsere/Koordináta állomány készítése | **működik** (kézi jegyzék + GeoCalc-DB / .PYX / földrajzi kimenet) |
| Adatcsere/AKG jegyzőkönyv készítése | **működik** (parcellák, AKG_* leíró adatok, szöveges jegyzőkönyv) |
| Beállítások/Általános beállítások | **működik** (munkamenet, automatikus számítás, induló munkalap, tárolt adatok) |
| Beállítások/Névjegy | **működik** (induló kép) |
| Súgó | **működik** (a súgó kivonata) |

A menüsor, az ikonsáv és a munkalap-nevek a valódi program szerintiek; ahol a webes változat a súgó
képére vagy nem közölt részletre támaszkodik, a munkalap **fenntartást** ír ki (lásd a
„Megjegyzések” szakaszt).

### Gyorsbillentyűk, munkamenet és táblázatkezelői kimenet

- **Gyorsbillentyűk** – a menükben kiírt billentyűk működnek: `F5` vagy `Ctrl+Enter` (számítás
  futtatása), `Ctrl+N` (új munkaterület), `Ctrl+O` (megnyitás), `Ctrl+S` (mentés `.gcd` állományba),
  `Ctrl+P` (nyomtatás), `Ctrl+A` (minden kijelölése a szerkesztőben), `F1` (súgó), `F10` (menüsor),
  `Esc` (menü), a szerkesztőben `Insert` (beszúrás / átírás). A gépelést nem zavarják: a `Ctrl+A` csak
  a Munkaterület szerkesztőjében érvényesül.
- **Munkamenet (`.gcs`)** – a Beállítások menü „Munkamenet mentése…” parancsa a **teljes munkaterületet**
  (minden munkalap beállítását és tartalmát) egyetlen, önmagát leíró JSON-fájlba gyűjti; a
  „Munkamenet betöltése…” visszatölti és újratölti az oldalt. Így a munka hálózat és szerver nélkül
  átvihető másik böngészőbe vagy gépre.
- **Táblázatok (.csv)** – a számítási, hálózati, adatrögzítő és átszámítási munkalapok
  „Táblázatok (.csv)” gombja a jegyzőkönyv összes táblázatát táblázatkezelőbe adja: **pontosvesszős**
  elválasztás, **UTF-8 bájt-sorrendjel (BOM)** és idézőjeles mezők – így a magyar Excel is azonnal
  helyesen nyitja.
- **Sötét téma és angol felület** – a Beállítások menü „Sötét / világos téma” és „Nyelv: magyar /
  English” parancsa, illetve az Általános beállítások „Megjelenés és nyelv” csoportja (a téma a
  rendszer beállítását is követheti). Angolul a menük, munkalapok, gombok, súgószövegek és
  állapotüzenetek fordulnak; a generált jegyzőkönyvek és a felhasználói adatok magyarok maradnak.

### Változási vázrajz (8/2018. (VI. 29.) AM rendelet)

A GEOkalkulus saját munkalapja (a GeoCalc 3.5-ben nincs), a földrészlethatár-változással járó
változási vázrajz területszámításához:

- **Terület-összevetés (18. § (1))** – a műszaki terület a koordinátákból (Gauss-féle trapézképlet), a
  tulajdoni lapi területtel összevetve. A hibahatár a **8. melléklet** (EOTR térkép digitális
  átalakítása; 1:500–1:1 000, 1:2 000, 1:4 000) vagy a **9. melléklet** (EOTR előtti vetület; 1:1 000,
  1:2 000, 1:2 880, 1:4 000) értékének **másfélszerese**, alrészletnél, minőségi osztálynál, jognál és
  ténynél a **kétszerese**. A táblázatok a Nemzeti Jogszabálytár szövegéből; a sorok között lineáris
  interpoláció, a legkisebb táblázati terület alatt az első érték. A hibahatáron túli eltérés hibaként
  jelenik meg (területszámítási hiba vizsgálata).
- **Területarányos ráosztás (22. § (3))** – a változás utáni végleges területek a négyzetméterre
  kerekített műszaki területből, a változás előtti tulajdoni lapi összegre ráosztva (legnagyobb
  maradékok szerint), így a két oldal összege pontosan egyezik (22. § (1)). A program jelzi, ha a
  változás előtti és utáni földrészletek kerülete nem ugyanazt a területet fedi le.
- **Területkimutatás (12. §)** – változás előtti és utáni hrsz és terület, összesen sorral; mentés
  szövegként és táblázatkezelőbe (.csv).
- **Területosztás** – a kért területű rész leválasztása az A–B oldallal **párhuzamos** osztóvonallal
  (felezéses kereséssel), vagy egy **törésponton átmenő** osztóvonallal (zárt alakban). Az új pontok
  pontszámot kapnak (előtag + sorszám), az „Átvétel” a koordinátákhoz és a változás utáni
  földrészletek közé teszi őket (centiméterre kerekítve). Vázlat mutatja a földrészleteket és az új
  pontokat. `tests/parcel.test.ts`
- **Határpont-azonosítás (16–17. §, 7. melléklet)** – a mért pontokat (pontszám, Y, X, opcionálisan a
  rendűség) a koordináták azonos pontszámú pontjaival, a mindkét végén mért határvonalak hosszát a
  térképi hosszal veti össze. A megengedett eltérés az alaptérkép készítése szerint: digitális
  újfelmérés / felújítás – F) táblázat (R1–R4 rendűség, T11 belterület / T21 külterület); EOV vagy régi
  vetületi térkép digitális átalakítása – A) / B) táblázat (határvonal helyzete) és C) / D) táblázat
  (mérési vonal); szabatosan felmért terület – 16. § (1) a) (± 0,10 m megjelölt, ± 0,20 m meg nem
  jelölt határ); a hosszakra az E) táblázat (fekvés szerint). A mérési vonal hossza szerint 50–300 m
  között lineárisan interpolál. `tests/boundary-check.test.ts`
- **Kitűzési jegyzőkönyv (.txt)** – a „Kitűzési jegyzőkönyv (.txt)…” a kitűzött pontok jegyzékét
  (pontszám, Y, X [, Z], pl. az ITR-ből mentett `…_kituzott.txt`) a mért pontok közé tölti, így a
  határpont-azonosítás azonnal kiértékeli a kitűzés eltéréseit a 7. melléklet szerint. A koordinátamezők
  az ITR koordinátajegyzékét (pontszám, Y, X, Z, pontkód, középhiba) és a címkoordináta CSV-t is
  olvassák, a fejlécsorokat kihagyják.
- **Változási vázrajz és mérési vázlat (8/2018. AM rendelet 10., 11., 15., 17., 19., 27–28. melléklet)** –
  nyomtatható A4 oldal (Nyomtatás / PDF, SVG) a földhivatal által közzétett mellékletminták elrendezésében:
  bal felül a vállalkozás neve, székhelye és a munkaszám, jobb felül a település, a fekvés és az
  adatszolgáltatás iktatószáma; középen a felirat, a tárgymondat (pl. „a 100 helyrajzi számú földrészlet
  megosztásáról”, „…egyesítéséről”, „…telekhatár-rendezéséről”, „…földrészleten lévő épület
  feltüntetéséhez”, „…művelési ág változásáról”, „…kitűzéséről”) és az „M= 1:500” méretarány; keret
  nélküli térképi kivágat szabványos méretarányban (a megszűnő határ áthúzva, a megszűnő helyrajzi szám
  áthúzva, az új határ és az új helyrajzi szám vastagon, a pontszámok, a címkoordináták jele és
  helyrajzi számonkénti „Címkoordináták … hrsz” táblázata, északjel), „A vázrajz méretek levételére nem
  alkalmas.”; a területkimutatás a minták táblázatával („Változás előtti / utáni állapot”, Hrsz,
  alrészlet jel, művelési ág, minőségi osztály, terület ha.m²-ben, AK; telekalakításnál és művelési
  ágnál „Szolgalmi és egyéb jogok” és „Megjegyzés” – 14 oszlop –, épületfeltüntetésnél „Jegyzet” – 13
  oszlop –, oszlopszámozással, alrészletenként, „Összesen” sorral); a lábrész a minták szövegeivel
  („A változás akaratunknak megfelelően történt:”, „Készítés helye, időpontja:”, „Készítő: … földmérő
  ig. száma:”, „Minőséget tanúsító: … Ing.rend.min.sz.:”, „Szükség esetén:” keret, a 30. § (2)–(3)
  szerinti földminősítési záradék kerete, az 51. § (1) vagy (2) szerinti záradék helye). A mérési
  vázlat a 11. melléklet színeivel készül: a mért pontszám és a mért távolság zöld, dőlt, aláhúzott; az
  új (kitűzött) pontszám és a kitűzési méret piros, aláhúzott; a lábrészen „A … sz. záradékolt munkából
  átvett méretek.” és „A változással érintett földrészlet új határpontjait …-val jelöltem meg.”. A
  töréspont beszúrásával kettévált, de nem változott határvonalat nem jelöli változásként.
- **Munkák és leadandó munkarészek** – a „Munka” csoportban a munka fajtája: **kitűzés**,
  **telekalakítás**, **épületfeltüntetés**, **művelési ág változás**. Ez szabja meg a rajzok feliratát
  és lábrészét a 8/2018. AM rendelet szerint (kitűzés: KITŰZÉSI VÁZLAT / VÁZRAJZ, 27–28. melléklet, a
  43. § (3) felirata, a kitűzött földrészlet kitűzési méretei; telekalakítás: 15. melléklet, „A változás
  akaratunknak megfelelően történt:”; épületfeltüntetés: 17. melléklet, 51. § (2) záradék, a vázlaton az
  új épület méretei; művelési ág: 19. melléklet, mezőgazdász-záradék, a megszűnő alrészlet áthúzva, az
  új vastagon). A „Munka adatai” (megbízó, kormányhivatal, ügyfélkód, műszer, megjelölés, időpont…)
  kitöltik a szöveges munkarészeket: **adatigénylő lap** (1. melléklet), **térképmásolat-megrendelő**
  (3.), **műszaki leírás** (29.), **vizsgálat és záradékolás iránti kérelem** (30.), **helyszíni
  jegyzőkönyv** a kitűzésről (25.), **értesítés a munkavégzésről**, **tartalomjegyzék**. A
  „Munkarészek nyomtatása” mindet egy nyomtatásban adja (PDF-be menthető), a „Leadandó csomag (.zip)” a
  leadott munkák mappaszerkezetében (pl. `02_Változási vázrajz`, `05_Területszámítás`, `06_DAT állomány`)
  menti a rajzokat (HTML, SVG, DXF), a DAT-ot, a ve/vu.lst-t, a koordinátajegyzéket, a
  címkoordinátákat és a dokumentumokat. `tests/package.test.ts`, `tests/jobs.test.ts`
- **Alrészletek és művelési ágak** – az `alrészlet` / `új alrészlet` rajzelemek a területkimutatásban
  (12. §) a földrészlet területére ráosztva (22. § (6)), a DAT-ban T_OBJ_ATTRBE rekordként (a művelési
  ág a T_MUVEL_AG kód szerint); az új épület T_OBJ_ATTRCA rekordként (az obj_fels kód a rajzelem 4.
  mezője, alapértelmezésben CA01). A DAT beolvasásakor a meglévő alrészletek és épületek
  rajzelemként kerülnek a munkalapra. `tests/subparcels.test.ts`
- **Rajzelemek és DXF a földhivatali rétegrenddel** – a „Rajzelemek” mezőben soronként: `épület ; új |
  lakó | gazdasági | üdülő | megszűnő | falsík ; pontok`, `alrészlet ; betűjel ; művelési ág ; pontok`,
  `új alrészlet ; …`, `vonal ; kerítés | fal | szolgalmi ; pontok`, `felirat ; házszám | utcanév |
  dűlőnév | objektum | egyéb ; szöveg ; @pontszám vagy Y X [; forgatás]`. A rajzelemek a vázrajzon
  megjelennek (az új épület vastagon, a felirat a helyén, a művelési ág a 18. § (2) rövidítésével), a
  „DXF (földhivatali rétegek)” pedig R12 DXF-et ír (ANSI_1250, DXF X = EOV Y, DXF Y = EOV X) a leadott
  rajzok rétegeivel, színeivel és vonaltípusaival (pl. `Földrészlet határ`, `Előzetes földrészlet vonal`,
  `Megszűnő földrészlet vonal`, `Helyrajziszám`, `Új épület (bármilyen)`, `Lakóépület`,
  `Gazdasági és melléképület`, `Alrészlet határ`, `Alrészlet betűjel`, `Alrészlet művelési ág`,
  `Házszám`, `Utcanév`, `Címkoordináta`, `Pontszám (mért)`). A DAT és a földhivatali DXF beolvasásakor a
  szomszédos földrészletek és épületek (T_OBJ_ATTRCA, illetve az épületfóliák) a vázrajz környezete
  lesznek. A helyrajzi szám és az alrészlet felirata a földrészleten belül az épületektől legtávolabbi
  pontra kerül. Ellenőrizve: a kimenetet az `ezdxf` hiba nélkül olvassa. `tests/drawing.test.ts`
- **Koordinátajegyzék (46. § (1) i))** – csoportonként (alappontok, részletpontok, címkoordináták)
  számsorrendben, az EOV koordináták cm, a címkoordináták m élességgel; a pontkód (4. melléklet) a
  koordinátasor 5. oszlopából, Windows-1250 kódolású szövegként.
- **Címkoordináták (11. § (17), 4. melléklet)** – generált címkoordináta (pontkód 5411) a változás utáni
  földrészleteken belül, méterre kerekítve, helyrajzi szám szerinti táblázatban. `tests/plan.test.ts`
- **Igazgatási szolgáltatási díjak (1/2024. (I. 30.) KTM rendelet)** – tájékoztató díjszámítás a
  jegyzőkönyvben: telekalakítás engedélyezése (10. §), a változási vázrajz vizsgálata (12–15. §:
  földrészlethatár a változás utáni földrészletek száma szerint, építmény, társasház, művelési ág, jog és
  tény, közigazgatási/fekvéshatár, használati megosztás és kitűzés), újrazáradékolás 50% (16. §), és az
  adatszolgáltatás (4. melléklet 41–42. tétel: terület szerint, a legnagyobb földrészletre 100%, a többire
  50% / 20%, 100 ha fölött arányosan). A földrészletek számát és területét a munkalapról veszi. A
  „…-tól földrészletenként további” díj a sáv első földrészletétől számít – így illeszkednek a sávok
  (pl. 15 földrészlet: 96 000 + 10 · 16 000 = 256 000 Ft, a következő sáv alapja). `tests/fees.test.ts`
- **DAT adatcsere** (DAT Szabályzat, DAT-M1 melléklet, G Függelék; MSZ 7772-1) – a „DAT beolvasása…” a
  `.dat` állományból a pontokat (T_PONT, a pontszám a T_OBJ_ATTRAA/AB/AC táblázatból) és a
  földrészleteket (T_OBJ_ATTRBC/BD: helyrajzi szám, nyilvántartott terület) tölti a munkalapra; a
  földrészlet határát a felület → határ → határvonal → pont láncból fűzi össze (irányváltással, a belső
  határok területét levonva; az ITR által kétszer kiírt földrészletet egyszer veszi). Valódi, ITR 5 DAT
  7.1.0-val készült leadott állományokon ellenőrizve (telekalakítás, épületfeltüntetés, művelési ág
  változás, 3773 pontos / 258 földrészletes adatbázis): a számolt területek a tárolttal egyeznek.
  A „Mentés DAT-ba” **az ITR kimenetének szerkezetében** ír: ITR-féle címrekord, T_PONT (a beolvasott
  pontok pontossági osztályával), élenként egy T_HATARVONAL (a szomszédos földrészletek közös éle egyszer,
  a T_HATAR-ban „–” irányváltással), az óramutató járásával egyező határ, T_FELULET, T_OBJ_ATTRAC
  (pontszámok; az új pont a leggyakoribb osztályt kapja), T_OBJ_ATTRBC/BD (a beolvasott, illetve a
  „szülő” földrészlet attribútumaival) és földrészletenként egy geokódpont; **Windows-1250** kódolás,
  CTRL-Z nélkül. Egy valódi telekalakítás DAT-ját visszaírva a határvonalak, határok és felületek száma
  és a területek pontosan egyeznek az ITR-ével. Nem írja újra a T_OBJ_ATTRBF (minőségi osztály),
  T_FELIRAT és T_OBJ_ATTRAD (címkoordináta) táblázatokat – ezeket a leadás előtt az ITR-ben kell
  pótolni. `tests/dat.test.ts`
- **Területszámítás (.lst)** – a változás előtti (`ve.lst`) és utáni (`vu.lst`) területszámítási lista
  az ITR .lst szerkezetében (hrsz, felirathely, pontok oldalhosszal, terület 6 tizedessel, „AK=0.00”),
  Windows-1250 kódolással; egy valódi telekalakítás vu.lst-jével soronként egyező értékek.
  `tests/lst.test.ts`
- **Földhivatali adatszolgáltatás** – a „Földhivatali adatok…” gomb a földhivataltól kapott **ZIP
  csomagot** (vagy annak állományait együtt) olvassa: az ingatlan-nyilvántartási térkép **DXF**-jéből a
  földrészleteket (zárt vonallánc a `*_FRSZ` fóliákon, a benne álló `HRSZ` felirattal) és a
  határpontokat (`BHP` blokk, a pontszám a `BHP_SZ` feliratból), a **földrészlet-információból**
  (Report.txt: terület, műszaki terület, geometria) és a **földkönyvi kivonatból** (ha.m2 terület) a
  nyilvántartott területet. Csak a szöveges kimenetekben szereplő földrészletek kerülnek a munkalapra (a
  tulajdonosi adatokat nem olvassa be). Egy valódi budapesti adatszolgáltatáson ellenőrizve: a DXF-ből
  számolt terület a földhivatali „műszaki terület”-tel 0,001 m²-re egyezik. `tests/land-office.test.ts`

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

### Adatrögzítő / Mérési adatok - koordináták (súgó 11–12. és 17. o.)

A terepi mérési jegyzőkönyv munkaterülete, a valódi program táblázatával (`#`, Pontszám, Hz, Zi, Tf,
Tv, Tvet, dM, Mj, Mm, Pontkód; sárga az álláspont, szürke a kihagyott mérés, piros a középelt bal/jobb
irány).

- **Beolvasás** új munkaterületként vagy **hozzáfűzéssel** (különböző műszerek adatai összefűzhetők):
  - **GeoCalc-AR / GMJ** – a súgó 17. oldala szerinti 14 mező (`ADR_ID, PSZ, HZ, ZI, TF, TV, DM, PKOD,
    MM, MJ, TVET, AP1, AP2, AP3`), vesszővel vagy szóközzel; a GeoCalc 3.5 által mentett GMJ is (a nem
    mért zenitszöget a GeoCalc `0.0000`-ként írja: ez hiányzó adat).
  - **Leica GSI-8 / GSI-16** (és a **GeoMAX**): 11 pontszám, 21 Hz, 22 zenitszög, 31/32 ferde/vízszintes
    távolság, 33 magasságkülönbség, 87 jelmagasság, 88 műszermagasság, 84–86 álláspont; a szög- és
    távolságegységek a szavak egységjelzője szerint. A **Leica TC-600** kódblokkos álláspont-létesítése
    (súgó 16. o.: Cod = álláspont, In1 = műszermagasság, In2 = azonosító) is.
  - **Sokkia SDR2x / SDR33** (a Sokkia „SDR Electronic Field Book” formátumleírása szerint): 02 álláspont
    (műszermagassággal), 03 jelmagasság, 09 F1/F2/MD/MC mérés; a 4 jegyű és a 16 karakteres pontszámú
    változat, a fejléc szögegysége (fok, gon, mil) és az INSTR rekord magassági-szög beállítása.
  - **Geodimeter** (címke=érték): 2= álláspont, 3= műszermagasság, 5= pont, 4= kód, 6= jelmagasság,
    7= Hz, 8= V, 9= ferde, 11= vízszintes távolság.
  - **Topcon GTS-7**: UNITS, STN, BS/FS/SS, SD/HD/HV rekordok.
  - **FOIF MES** – a FOIF műszer nyers mérési állománya (.MES): álláspont (A: pontszám, X, Y, H,
    műszermagasság) és mérés (F: irány, magassági szög, vízszintes és ferde távolság, jelmagasság); a
    szögek egysége 1/7200 fok, a magassági szög 360° − zenitszög alakú. Egy valódi kitűzési
    állományon ellenőrizve: az irány a koordinátákból számolt irányszöggel, a vízszintes távolság a
    koordinátákból számolt távolsággal egyezik.
  - **FOIF** (a FOIF műszereken futó FieldGenius és SurvCE nyers állománya) és **Carlson/TDS RW5**:
    MO (szög- és távolságegység), OC, LS (HI, HR), BK, SS/TR/BD/BR/FD/FR (AR, ZE, SD/HD).
  - A **szögegység** választható azokhoz a formátumokhoz, amelyek nem jelölik (Geodimeter, UNITS nélküli
    GTS-7): FOK.PPMMSS, tizedes fok, gon, mil.
  - A formátumot a program a tartalomból is felismeri. A **GeoProfi MJK** formátumáról nem található
    nyilvános leírás, ehhez valódi mintaállomány kell; ilyenkor a program erre figyelmeztet.
- **Távolságredukció (Tvet)** az Adatrögzítő/Beállítások szerint, **magasságkülönbség (dM)**, a külső
  program eredményének (TVET.TXT) átvétele, **mérés kihagyása / visszavétele**, **bal/jobb (-b/-j)
  irányok középelése**, a cellák javítása dupla kattintással.
- **Két távcsőállás (I+II) középelése** – a külön GCAR_2T program helyett, közvetlenül a munkalapon:
  álláspontonként és célpontonként (azonos pontszám) a II. állású irányból 180°-ot levonva a két
  irány középértéke, a zenitszög `(ZiI + 360° − ZiII) / 2`, a távolságok átlaga. A II. állást a 180°
  fölötti zenitszög jelzi (zenitszög nélkül a ~180°-kal eltérő Hz). Az eredeti irányok pirosak, a
  középelt dőlt; az állapotsor a legnagyobb indexhiba-kétszerest is kiírja, a középelés visszavonható.
  A GCAR_2T két mintapéldájának kimenetével 1″-en belül egyezik (`tests/two-face.test.ts`).
- **Mentés GMJ-be** (14 mező), **mérési jegyzőkönyv nyomtatása**, **Konvertálás**: a jegyzőkönyv (a
  kihagyott és a középelés előtti irányok nélkül, a Tvet-tel) és a beolvasott koordináta-állomány a
  Hálózatkiegyenlítés munkaterületére kerül.

### Adatrögzítő/Beállítások (súgó 12–15. és 62–63. o.)

A terepi adatrögzítők feldolgozásának beállításai és a mért adatok redukciója.

- **Adatrögzítő típusa** – a súgó 15. oldalán felsorolt tíz formátum (GeoCalc-AR, Geodimeter UDS,
  GeoMAX, GeoProfi MJK, Leica GSI-8, Leica GSI-16, Leica TC/TPS, Sokkia SDR alfanumerikus és
  numerikus, Topcon).
- **Hiányzó távolságok** – „mérésekből átveszi” vagy „koordinátákból számolja” (a súgó 44. oldala).
- **Távolságredukció** – nincs / külső program / vetületi; **alapból nincs** (a hálózatnál a számított
  koordináták átlagából kérhető, lásd a Vízszintes kiegyenlítést). A vetületi redukció képlete:
  `Tv = Tf · sin(Zi) · (1 − M/R) · k · (1 + d²/(2R²))`, ahol `M` az átlagos magasság, `d` a redukciós
  koordináta eltérése a kezdőértéktől, `k` a vetületi méretarány és `R` a redukciós sugár. A súgó
  szerint az **EOV**-nál `k = 0.99993`, `R = 6379743.001`, a redukciós koordináta az **X**, a kezdőérték
  pedig a vetület középvonala, **X = 200 000 m** (a méretarány ettől mért távolsággal nő), a HÉR,
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

> **Igazolva:** az EOV vetületi redukció a valódi GeoCalc 3.5 kimenetével egyezik (Tv → Tvet, pl.
> `1605.323 → 1605.2003`, `1570.84 → 1570.7199`; EOV, átlag X = 204 807, M = 43; ±0.1 mm a 4 tizedesre
> kerekítésen belül), ezt a `tests/recorder.test.ts` és a böngészős végpróba is rögzíti. A korábbi
> változat két hibát tartalmazott: az EOV kezdőértékét 0-nak vette (ezért lett a vetületi távolság
> nagyobb a ferdénél), és a magassági redukciót alapból kikapcsolta; mindkettő javítva, a régi mentett
> beállítások betöltéskor is. A HÉR, HKR, HDR és a sztereografikus vetület állandói a súgó szerintiek.

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

### Földrajzi koordináták konvertálása (Adatcsere, súgó 9. o.)

A kézi, navigációs célú GPS-vevők és más programok koordinátáinak átírása. Bemenet és kimenet:
**áldecimális** (`19.182231643` = `19° 18′ 22.31643″`, a súgó példája), **tizedes fok**,
**fok-perc-másodperc** (jelekkel – `47°30′12.3″` – vagy három számmal, égtájbetűvel is), **WGS 84
geocentrikus X, Y, Z**, **UTM 33/34** és **EOV**. Az átszámítás a WGS 84 ellipszoidon pontos. Az **EOV ↔
WGS 84 / ETRS89** átszámítás az EOV vetülettel (EPSG:23700) és az országos 7 paraméteres
transzformációval (MSZ 7222, EPSG 1449: HD72 → ETRS89) kb. ± 1 m pontosságú; a PROJ 9.8.1 ugyanezen
paraméterekkel számolt értékeivel milliméterre egyezik (`tests/eov-wgs84.test.ts`). A magasság (M)
geoidmodell nélkül változatlanul megy át; centiméteres átszámításhoz a Térbeli transzformáció modul (közös
pontok, interpoláció) vagy a GNSS Szolgáltató Központ EHT² szolgáltatása kell. A hibás sor kimarad, a többi feldolgozható; a „Bemenet ⇄
kimenet” gomb az eredményt teszi vissza bemenetnek (oda-vissza ellenőrzés). A `tests/geo-convert.test.ts`
rögzíti a súgó példáját és az UTM-egyezést a transzformáció moduljával.

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

### Hálózatkiegyenlítés – az öt lépés (súgó 50–54. o.)

A valódi programhoz hasonlóan a hálózatkiegyenlítés öt munkalapon halad; a jobb alsó kék nyíl a
következő lépésre visz, a bal alsó zöld nyíl a munkalap kijelöléseit állítja alaphelyzetbe. A teljes
számítási jegyzőkönyv a dokumentum-ikonokkal nyíló **Előkép** ablakban látható (fejezetfával,
nyomtatással és letöltésekkel), a lépés szakaszánál nyitva.

1. **Munkaterület** – a munkaállomány neve, a koordináta-jegyzék betöltése vagy **hozzáfűzése**, a GMJ
   mérési jegyzőkönyv, középelés; a „Mérési adatok” gomb az Adatrögzítőt, a „Részletmérés” a
   részletpontokat nyitja.
2. **Előzetes számítások** – az Álláspont(ok), Ismert pont(ok), További pont(ok), Összes pont és
   Felhasznált pontok listája (a sárga vonallal kihagyás, a ← nyíllal további pont felvétele). A
   táblázatban az új pontok sárgák; a **Státusz** jelölőnégyzettel az ismert pont új pontra, az új pont
   – a látható vagy beírt koordinátájával – adottra állítható (önálló hálózat). **Sokszögvonal** (az
   álláspontokra duplán kattintva is bővíthető) és **Előzetes tájékozás** (a bevont irányok típusa:
   ismert / számolt pontok; Zk, Zi, e″ hibakereséshez).
3. **Vízszintes kiegyenlítés** – irányonként AP, IP, Hz, Tvet, valamint az irány- és távmérés javítása,
   hibahatára és statisztikája. A **javítás cellájára kattintva** a mérés logikailag törlődik (piros),
   újabb kattintás visszaveszi; a durva hiba miatt automatikusan kihagyott mérés rózsaszín. A
   „Mérések kizárása” táblázat jelölőnégyzetei a jegyzőkönyvben ugyanezt teszik. **Vetületi
   távolságredukció a számított koordinátákból**: a mérések alapból redukció nélkül kerülnek a
   kiegyenlítésbe; a program a kiegyenlített és az ismert pontokból kiírja az átlagos Y, X, M értéket és
   a redukció szorzóját, és a jelölőnégyzettel kérhető, hogy a kiegyenlítés a redukált (vetületi)
   távolságokkal fusson újra (a vetület választható, az átlagos M kézzel felülírható). Hálózati dátum
   (önálló hálózat eltolása és forgatása), mérési vázlat, valamint **poligon záróhiba** („Ellenőrzés –
   poligonzárás”): az álláspontokra duplán kattintva előírt zárt poligon (a kezdőpont ismétlése nélkül,
   a sorrend a nyilakkal állítható) hátra- és előreirányai, törésszögei, oda-vissza távolságai, a
   szögzáró hiba és a vonalas zárás – ismert koordináta nélkül is.
4. **Magassági kiegyenlítés** – a felkínált magasságkülönbségek (#, AP, IP, dM, javítás, hibahatár,
   statisztika); kattintással kihagyhatók. A **piros** sorokban a mérésnek nincs távolsága (magaspontok,
   egyirányú mérések): ezeket a program alapértelmezésben nem vonja be, kattintással bevonhatók – a
   távolságot a koordinátákból, a magasságkülönbséget a zenitszögből számolja (a GMJ nulla távolsággal
   készült dM-je helyett), a jegyzőkönyv `*`-gal jelöli. A **számítás élessége** cm / mm / 0.1 mm, a
   paraméterek (átlagos távolság, középhiba, súlyozás, önálló hálózat) és az **adott magasságú pontok**
   kiválasztása. **Trigonometriai magassági vonalak**: a pontokra duplán kattintva előírt vonal(ak)
   oda-vissza magasságkülönbségei, a záróhiba, a súgó szerinti hibahatár (15·√t mm, t km-ben) és a
   vonal hossza; zárt poligonnál a végpont a kezdőpont. Az „Új vonal előírása” elteszi a vonalat, a
   jegyzőkönyv minden vonalat tartalmaz.
5. **Részletpontok számítása** – a számítandó álláspontok (→ hozzáadás, ✕ törlés), a koordináta
   export típus szerint (minden / kiinduló / kiegyenlített / részletpontok, vesszővel tagolt `.txt`
   vagy GeoCalc-DB `.PYX2`) és a **munka koordináta-jegyzék** (magasság kijelzése, élesség), a többször
   mért részletpontok kimutatásával.

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
npm test         # 581 automatikus teszt (a súgó mintapéldái, valódi GeoCalc-kimenetek, a felület regisztere)
npm run build    # éles változat a dist/ mappába (önálló HTML)
```

### Böngészős végpróba

A kész, önálló fájl valódi böngészőben is végigmegy **358 ellenőrzésen** (menük, navigátor,
munkalapok, állapotsor, jegyzőkönyv, a letöltött `.gcd` / `.gcs` / `.csv` fájlok tartalma,
hibakezelés, gyorsbillentyűk). Ehhez egy futó, fejlesztői porttal indított Chrome (vagy Edge) kell:

```
chrome.exe --headless=new --remote-debugging-port=9222 --user-data-dir=%TEMP%\geocalc-chrome about:blank
npm run build
npm run browser-check     # 1-es kilépési kód, ha bármelyik ellenőrzés elbukik
```

A közzétett oldal ugyanezzel a próbával ellenőrizhető (a helyi fájl helyett a megadott címet tölti be):

```
GEOKALKULUS_URL=https://eutrofizator.github.io/geocalc-web/ npm run browser-check
```

## Közzététel (GitHub Pages)

A `.github/workflows/pages.yml` minden `main` ágra került változtatásnál (és kézi indításra is)
lefuttatja a típusellenőrzést és a teszteket, újraépíti az önálló HTML-t, majd közzéteszi:

- <https://eutrofizator.github.io/geocalc-web/> – a program (`index.html`),
- <https://eutrofizator.github.io/geocalc-web/GEOkalkulus-1.0.html> – ugyanaz a fájl letöltésre.

A workflow a közzététel előtt ellenőrzi, hogy a fájl **nem tartalmaz külső hivatkozást**, ezért a
közzétett oldal hálózat és webfont nélkül is működik; a `_site` könyvtárba a `.nojekyll` is bekerül.

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
| `src/` | felület (`main.ts`, `shell.ts`, `about-view.ts`, `general-settings-view.ts`, `geo-convert-view.ts`, `report-view.ts`, `network-view.ts`, `net-settings-view.ts`, `transform-view.ts`, `transform-apply-view.ts`, `transform-store.ts`, `descriptor-view.ts`, `exchange-view.ts`, `exchange-file-view.ts`, `recorder-view.ts`, `akg-view.ts`, `ui.ts`, `style.css`) |
| `src/shell.ts` | a GeoCalc 3.5-hű burok: menüsor, ikonsáv, modulpanel (navigátor), munkalapváltás, állapotsor, munkalap-regiszter |
| `tests/` | 51 tesztfájl: a súgó mintapéldái, valódi kimenetek, a felület regisztere |
| `scripts/` | a build beágyazója (`inline.mjs`) és a böngészős végpróba (`browser-check.mjs`) |
| `.github/workflows/` | a GitHub Pages közzététel (`pages.yml`): típusellenőrzés, tesztek, build, deploy |
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
