# Lépésről lépésre – a négy munkafajta

Ez az útmutató végigvezet a négy földhivatali munkán: **kitűzés**, **telekalakítás**,
**épületfeltüntetés** és **művelési ág változás**. Mindegyiknél leírja, hogyan nevezd el a pontokat a
terepen, mit hová írj a programban, és mit kapsz a végén.

Minden munka a **Geodéziai számítások / Változási vázrajz** munkalapon készül. A mezők részletes
leírása a [Változási vázrajz útmutatóban](hasznalati-utmutato-valtozasi-vazrajz.md) van.

A példákban szereplő koordináták kitaláltak; a program *Minta* gombja ugyanezeket tölti be, így minden
példa kipróbálható.

---

## 0. Mielőtt bármihez hozzáfognál

### 0.1 Egyszer kell beállítani

*Geodéziai számítások / Beállítások* – az előlapon add meg a vállalkozásod nevét, a munkaszámot, a
települést, a fekvést (belterület / külterület) és a dátumot. Ezek kerülnek minden rajz fejlécébe.
Ugyanezek a mezők a *Változási vázrajz* munkalap **Munka adatai** részének tetején is megvannak
(a két hely ugyanazt az adatot mutatja). A települést és a fekvést a földkönyvi kivonatból a program
magától kitölti, ha még üres.

A *Változási vázrajz* munkalap **Vázrajz és jegyzékek** részében add meg a saját adataidat:
székhely, földmérő igazolvány száma, IRF minősítés száma, a készítés helye. Ezeket a böngésző
megjegyzi, nem kell minden munkánál újra beírni.

### 0.1a Minden munkát „Új munka” gombbal kezdj

Az ikonsáv első gombja (lapocska pluszjellel), illetve a *Beállítások* menü **Új munka (az előző
munka adatainak törlése)…** parancsa minden munkalapról kitörli az előző munka adatait: koordináták,
mérések, nyers mérés, földrészletek, megbízó, tulajdonosok, rajzszerkesztés, munkaszám,
munkaterület neve. Így két egymás utáni munka adatai nem keveredhetnek össze.

Megmaradnak a saját adataid és beállításaid: készítő (vállalkozás), logó, székhely, igazolványszám,
IRF minősítés, készítés helye, műszer és gyári szám, e-mail, telefon, a mérőállomás beállításai, a
téma és a nyelv.

Ha az előző munkára még szükséged lehet, előbb mentsd el: *Beállítások / Munkamenet mentése…*
(.gcs fájl). Később ugyanott a *Munkamenet betöltése…* paranccsal visszahozható.

### 0.2 A legfontosabb szabály: a pontszámok

A program **a pontszám alapján** dolgozik. Ezért mielőtt kimész a terepre, döntsd el, melyik pontnak
mi lesz a neve:

| Milyen pont | Milyen pontszámot adj neki |
|---|---|
| **Meglévő határpont**, amit azonosítasz vagy kitűzöl | **Pontosan ugyanazt**, ami a földhivatali koordináta-állományban szerepel (pl. `102`). |
| **Új pont** (új határpont, épületsarok, alrészlethatár) | **Új, egyedi** pontszámot, ami a földhivatali állományban **nem fordul elő** (pl. `U1`, `E1`, `M1`, vagy egy saját számtartomány, pl. `5001`-től). |

Két dologra figyelj:

- **Soha ne adj új pontnak olyan számot, ami már létezik.** Ha a *Koordináták* mezőben két sor
  ugyanazzal a pontszámmal szerepel, az utolsó érvényes – csendben felülírnád a földhivatali pontot
  (a program ilyenkor csak figyelmeztet).
- **Egy pont attól még nem lesz földrészlet, hogy beírod.** Földrészlet csak az, amit a *Változás
  előtti* vagy *Változás utáni földrészletek* mezőben felsorolsz. Az új épületsarkok tehát nem
  keverednek össze semmivel.

**Utótag a terepen.** Ha a kontroller mentéskor utótagot tesz a pontszám végére (`5001_01`,
`5001_02`), az nem baj: a program az aláhúzás utáni számot (legfeljebb három jegy) elhagyja, így az
`5001_01` az `5001`-es földhivatali pontnak számít. Ha ugyanazt a pontot többször mentetted
(`_01`, `_02`), a program a mérések átlagát veszi, és figyelmeztet, ha 5 cm-nél jobban eltérnek.

### 0.2a GNSS-mérés: koordináták TXT-ben

GNSS-szel nincs nyers mérés, csak koordináták. A kontrollerből exportáld a pontokat szöveges
fájlba (TXT vagy CSV), és a *Változási vázrajz* munkalap **Határpont-azonosítás** részében töltsd
be a **GNSS pontok / GSI koordináták…** gombbal. A Leica GSI koordinátaállományt (11-es pontszám,
81–83-as koordinátaszavak) ugyanez a gomb olvassa.

- Az elválasztó lehet vessző, pontosvessző, tabulátor vagy szóköz, lehet benne fejlécsor és
  tizedesvessző is.
- Az oszlopok sorrendje mindegy: a program az EOV tartományokból (Y 400 000–950 000, X 30 000–
  400 000 m) felismeri, melyik az Y és melyik az X. A felismert sorrendet kiírja (pl. „pontszám, X,
  Y, Z, kód”) – ezt érdemes egy pillantással ellenőrizni.
- Ahol a pontszám (utótag nélkül) már szerepel a *Koordináták* között (földhivatali vagy kitűzendő
  pont), a pont a **Mért pontok** közé kerül, azonosításra vagy a kitűzés ellenőrzésére.
- A többi, **új pont** (új határpont, épületsarok) a **Koordináták** végére kerül, utótag nélkül.
- Több fájl egymás után is betölthető (pl. két nap mérése): az azonos pontszámú régi sort az új
  váltja.

**A pont szerepe a kódja szerint** (a sor utolsó, szöveges oszlopa):

| Kód | Jelentés | Hová kerül |
|---|---|---|
| `ap` | alappont (pl. GNSS-szel meghatározott, erről mérsz vagy tűzöl ki) | *Koordináták*, a sor végén `AP` jellel |
| `fix` | a földhivatali (terv) koordináta | *Koordináták*, ha még nincs ott |
| `kit` | a kitűzött, bemért pont (pl. `5001_1`) | *Mért pontok*, a földhivatali pontszámmal |

A `fix` és a `kit` pont akkor sem átlagolódik, ha a pontszámuk ugyanaz: a kettő különbsége a kitűzés
ellenőrzése. Az **alappontok** a mérési vázlaton a felmérési alappont jelével (DAT1-M2 JKDATA22) és a
pontszámukkal jelennek meg, a koordinátajegyzékben külön csoportban, a mérési jegyzőkönyvben a
„Felhasznált alappontok” táblázatban a jelükkel.

**Ellenőrző mérés:** a betűs utótag (pl. `1001_E`) a pont ellenőrző mérése. Nem átlagolódik, a
program kiírja az eltérését. Ha egy már meglévő alappontot újra bemértél, az is ellenőrzésként
jelenik meg, nem kerül a *Mért pontok* közé.

**Messzi pont:** a munkaterülettől 2 km-nél távolabbi pontot (pl. a műszer tájékozatlan kezdő
álláspontját) a program kihagyja, és szól róla.

**Tájékozás, mérési jegyzőkönyv:** ezekhez a műszer **nyers mérése** kell (irány, zenitszög,
távolság – GSI-ben a 21, 22, 31-es szavak). Ha a *Nyers mérés* gombbal olyan GSI-t töltesz be,
amelyben csak koordináták vannak, a program szól, és a pontokat koordinátaként veszi át.

Ha a nyers mérést betöltötted (*Nyers mérés* gomb), a mérési jegyzőkönyvbe álláspontonként bekerül:

- a **tájékozás**: a tájékozó irányok (az alappontokra – ha nincs `AP` jelű pont, a többi ismert
  pontra – mért irányok) irányszöge, tájékozási szöge, javítása (″) és ennek lineáris megfelelője
  (mm), a mért és a koordinátákból számított távolság különbsége, valamint a tájékozás
  **középhibája**;
- ha az álláspont koordinátája ismert, a program **szabad álláspontként** is kiszámolja, és kiírja
  az eltérést (1 cm fölött figyelmeztet); ha nem ismert, legalább két ismert pontra mért távolsággal
  szabad álláspontot számol;
- a **részletpontok számítása** poláris pontként, és az eltérésük a koordináták között már meglévő
  ugyanilyen pontszámú ponttól.

A nyers mérésből számolt **koordináták a Koordináták mezőbe is bekerülnek**: a szabad álláspontok
`SZA`, a részletpontok `SZ` jellel (ezeket a program mindig újra a mérésből számolja, és nem
használja tájékozó pontként), ha a pontszámuk még nem szerepel ott. Így az épületsarkok koordinátáit nem kell külön beírni. Ha az
álláspont pontszáma (pl. `101`) a koordináták között már egy másik pontot jelöl, a program szól –
ilyenkor az egyiket érdemes átnevezni.

A **mérési vázlaton** megjelennek az alappontok – az `AP` jelűek és azok, amelyekre a nyers
mérésben tájékoztál – a felmérési alappont jelével és a pontszámukkal (ha a választott
méretarányban kilógnának, a keret szélén, a valódi irányukba mutató nyíllal)
és a műszer-álláspontok (háromszöggel), valamint az épületek oldalainak méretei. A változási
vázrajzra az alappontok és az álláspontok nem kerülnek rá.

A GSI álláspont-blokkjait (41–43-as szavak) a program felismeri: ha a 41-es szó (kódszám) minden
blokkban ugyanaz, a 42-es az álláspont, a 43-as a műszermagasság.

A *DXF megjelenítő* **Pontok állományból…** gombja ugyanezt a fájlt olvassa.

### 0.3 Hová kerül melyik pont

A munkalapon két külön pontmező van, ezeket ne keverd:

| Mező | Mi kerül bele |
|---|---|
| **Koordináták** (fent) | A **végleges** koordináták: a földhivatali pontok **és** az új pontjaid. Ebből rajzol és számol a program. |
| **Mért pontok** (a *Határpont-azonosítás* részben) | A **meglévő határpontok terepen mért** koordinátái, a földhivatali pontszámmal. Ezeket veti össze a program a *Koordináták* azonos nevű pontjaival. |

### 0.4 A földhivatali adatok betöltése

Minden munka így kezdődik:

1. Kattints a **Földhivatali adatok…** gombra, és válaszd ki a földhivataltól kapott ZIP-et (vagy a
   DXF-et a Report.txt-vel együtt). A DXF nélküli, DAT-ot tartalmazó ZIP is így tölthető be (lásd
   lent). Egyetlen DAT fájlhoz a **DAT beolvasása…** gombot is használhatod.
2. A program kitölti:
   - a **Koordináták** mezőt a földhivatali pontokkal,
   - a **Változás előtti földrészletek** mezőt (hrsz ; tulajdoni lapi terület ; pontok),
   - a **Változás utáni földrészletek** mezőt – kezdetben ugyanazokkal, mint előtte.
3. Nézd meg a jobb oldali üzeneteket: hány földrészletet talált, és van-e eltérő terület vagy
   pontszám nélküli töréspont (ezek `DXF1`, `DXF2`… nevet kapnak).

Ha a ZIP-ben a környék több földrészlete is benne van, a *Változás előtti / utáni* mezőkből töröld ki
azokat, amelyeket a munka nem érint – a vázrajzon környezetként úgyis megjelennek.

**Ha a ZIP-ben nincs DXF, csak DAT.** Egyes földhivatalok DXF helyett DAT állományokat adnak, például:
`<ügyszám>.dat` (a munka földrészlete), `szomszed_(…)_<ügyszám>.dat` (a földrészlet és a
szomszédai), `foldm_foldk-…-szomsz.txt` (földkönyvi kivonat) és egy PDF. Ezt a ZIP-et is egyben a
**Földhivatali adatok…** gombbal töltsd be, nem kell kicsomagolni:

- a munka tárgya a fő DAT földrészlete (a fenti példában egy földrészlet), ez kerül a *Változás
  előtti / utáni* mezőkbe;
- a pontszámok és a határ a „szomszed” DAT-ból jönnek, a szomszédos földrészletek és az épületeik a
  vázrajzon környezetként látszanak;
- a **tulajdoni lapi terület a földkönyvi kivonatból** jön. Ha a DAT-ban tárolt terület ettől eltér
  (pl. 500 m² a földkönyvben, 506 m² a DAT-ban), a program figyelmeztet, és a tulajdoni lapival
  számol;
- a DAT-ban lévő **meglévő címkoordináták** (T_OBJ_ATTRAD) megmaradnak: a változás utáni
  földrészletbe eső összes régi címkoordinátát átveszi – a földrészletét és az épületekét is (egy
  hrsz-en így kettő vagy több is lehet) –, csak ahol egy sincs, ott generál újat. A DAT-ba
  visszaírva az épületbe eső címkoordináta az épület, a többi a földrészlet geokódpontja lesz;
- a közös határponttal érintkező földrészletek a *Szomszédos hrsz-ek* mezőbe kerülnek (ha üres) – a
  kitűzési jegyzőkönyvhöz és az értesítésekhez.

A tulajdonosok nevét és címét a program nem veszi át a földkönyvi kivonatból: azokat a
*Tulajdonosok* mezőbe neked kell beírni. A PDF-et a program nem olvassa.

---

## 1. Kitűzés

**Mit csinálsz:** egy földrészlet határpontjait a földhivatali koordináták alapján kiteszed a terepre,
és bemérve ellenőrzöd.

**Mit kapsz:** kitűzési vázlat (27. melléklet), kitűzési vázrajz (28. melléklet), helyszíni jegyzőkönyv,
értesítés a munkavégzésről, koordinátajegyzék, területszámítás.

### 1.1 Pontszámok a terepen

A kitűzött pontokat **ugyanazzal a pontszámmal** mérd be, ami a földhivatali állományban van. Ha a
földhivatali állományban `105` és `106` a két kitűzendő sarok, a kitűzési jegyzőkönyvedben is `105` és
`106` legyen.

### 1.2 A programban

1. Töltsd be a földhivatali adatokat (0.4).
2. A **Változás előtti** és a **Változás utáni földrészletek** mezőben **csak a kitűzendő földrészlet**
   maradjon, mindkettőben ugyanúgy:
   ```
   # előtte
   124 ; 1241 ; 102 105 106 103
   # utána
   124 ; 102 105 106 103
   ```
3. **Munka** rész → **A munka fajtája**: **Kitűzés**.
4. Nyisd le a **Munka adatai** részt, és töltsd ki legalább:
   - *A határpontok megjelölése* (pl. `fakaróval`) – ez kerül a vázrajzra: „A kitűzött földrészlet
     határpontjait … jelöltem meg.”
   - *A munkavégzés (kitűzés) időpontja*, *A munkavégzés helyszíne (cím)*, *E-mail-cím*,
     *Telefonszám* – ezek kerülnek az értesítésre.
   - *A munkát végzők (név, ig. szám)* – ha üresen hagyod, a készítő neve kerül az értesítésre.
   - megbízó neve, címe, kormányhivatal.
5. Ugyanitt, a **Tulajdonosok** mezőbe írd be soronként a tulajdonosokat: `név ; lakcím ; hrsz`.
   ```
   Kiss Anna ; 1111 Kisváros, Fő u. 1. ; 124
   Nagy Béla ; 1111 Kisváros, Fő u. 3. ; 125
   ```
   - Akinek a hrsz-a a kitűzött földrészleté (itt `124`), az a **kitűzött földrészlet tulajdonosa** –
     a neve bekerül a helyszíni jegyzőkönyvbe.
   - A többiek a **szomszédok** – a helyszíni jegyzőkönyvben mindegyikük kap egy nyilatkozat- és
     aláíráshelyet.
   - **Mindenki kap egy saját értesítést**, a nevére és címére címezve.
6. **Határpont-azonosítás** rész → **Kitűzési jegyzőkönyv (.txt)…**: töltsd be a műszerből kimentett
   kitűzött pontokat (pontszám, Y, X). A pontok a **Mért pontok** mezőbe kerülnek. Kézzel is
   beírhatod:
   ```
   105  650190.42  241242.03
   106  650184.10  241280.42
   ```
7. Ugyanitt a **Nyers mérés (.MES, GSI…)…** gombbal töltsd be a műszer **nyers mérési állományát**
   (pl. a FOIF `.MES` fájlt). Ebből készül a **mérési jegyzőkönyv**: álláspontonként a mért irányok,
   zenitszögek, távolságok, jelmagasság, vetületi távolság és magasságkülönbség. Az eredeti fájl is
   bekerül a csomagba. (A program a FOIF MES, Leica GSI, GeoCalc, Sokkia SDR, Topcon, RW5 és Geodimeter
   formátumot ismeri fel.)
8. A jobb oldalon pontonként látod, mennyire tér el a kitűzött pont a földhivatali koordinátától, és
   belefér-e a hibahatárba.

### 1.3 A rajzok

- **Változási vázrajz** gomb → a **kitűzési vázrajz**: a földrészlet minden oldalán a méret, alul a
  „Nyilvántartásba véve” záradék helye.
- **Mérési vázlat** gomb → a **kitűzési vázlat** színesen: a kitűzési méret **piros, aláhúzva**, alatta a
  bemért méret **zöld, dőlt, aláhúzva**.

### 1.4 Leadás

**Leadandó csomag (.zip)** – mappánként:

| Mappa | Mi van benne |
|---|---|
| 01_Tartalomjegyzék | a tartalomjegyzék, mappánként a benne lévő fájlok nevével |
| 02_Adatigénylő lap | adatigénylő lap |
| 03_Térképmásolat megrendelő | térképmásolat-megrendelő |
| 04_Műszaki leírás | műszaki leírás |
| 05_Mérési jegyzőkönyv | **mérési jegyzőkönyv** (a nyers mérésből), az **eredeti nyers fájl** (pl. `.MES`), a **kitűzési jegyzőkönyv** (terv és kitűzött koordináta, eltérés), a kitűzött pontok jegyzéke |
| 06_Kitűzési vázlat | kitűzési vázlat (HTML, SVG, DXF) |
| 07_Kitűzési vázrajz | kitűzési vázrajz (HTML, SVG, DXF) |
| 08_Helyszíni jegyzőkönyv | helyszíni jegyzőkönyv a tulajdonosok nevével |
| 09_Koordináta jegyzék | koordinátajegyzék szövegként, Excelbe (`.csv`) és nyomtathatóan (`.html`) |
| 10_Területszámítás | területszámítás (`.lst`) |
| 11_Értesítés kitűzési munkavégzésről | **értesítés tulajdonosonként** (minden tulajdonosnak külön oldal) |

A HTML fájlokat a böngészőben megnyitva **Nyomtatás → Mentés PDF-be** paranccsal PDF készíthető
belőlük. A **Munkarészek nyomtatása** gomb az egészet egyben nyomtatja.

---

## 2. Telekalakítás (megosztás, egyesítés, telekhatár-rendezés)

**Mit csinálsz:** egy vagy több földrészlet határát megváltoztatod – a leggyakoribb a **megosztás**:
egy telekből kettő lesz.

**Mit kapsz:** változási vázrajz (15. melléklet) területkimutatással, mérési vázlat (10/A. melléklet),
koordinátajegyzék, területszámítás, DAT, műszaki leírás, záradékolási kérelem.

### 2.1 Pontszámok a terepen

- A **meglévő határpontokat**, amelyeket azonosítasz: **a földhivatali pontszámmal** (pl. `101`,
  `102`, `103`, `104`).
- Az **új határpontokat** (az osztóvonal végei): **új, egyedi** pontszámmal, pl. `U1`, `U2`.

### 2.2 A programban – ha a program számolja ki az osztóvonalat

Példa: a 123 hrsz-ú telekből (101 102 103 104) leválasztunk 600 m²-t, párhuzamosan a 101–104 oldallal.

1. Töltsd be a földhivatali adatokat (0.4).
2. **A munka fajtája**: **Telekalakítás**.
3. **Területosztás** rész:
   - *Földrészlet*: `123`
   - *Osztóvonal*: `Párhuzamos az A–B oldallal`
   - *Leválasztandó terület [m²]*: `600`
   - *A pont*: `101`, *B pont*: `104` (ezzel az oldallal lesz párhuzamos az osztóvonal, és a leválasztott
     rész ennek az oldalnak a felén lesz)
   - *Új pontok előtagja*: `U` → a két új pont `U1` és `U2` lesz
   - *A leválasztott rész hrsz-a*: `123/1`, *A maradék rész hrsz-a*: `123/2`
4. Kattints az **Osztás** gombra, nézd meg az eredményt, majd az **Átvétel a változás utáni
   állapotba** gombra. A program:
   - az `U1`, `U2` pontot a **Koordináták** közé írja,
   - a **Változás utáni földrészletek** közé a `123/1` és `123/2` sort írja.
5. Ezekkel a koordinátákkal mész ki kitűzni az új pontokat.

### 2.3 A programban – ha a terepen mérted be az új határt

Ha az új határpontokat (pl. kerítés mentén) a terepen mérted:

1. Írd az új pontokat a **Koordináták** végére:
   ```
   U1  650139.70  241233.46
   U2  650133.12  241271.79
   ```
2. Írd át a **Változás utáni földrészletek** mezőt:
   ```
   123/1 ; 101 U1 U2 104
   123/2 ; U1 102 103 U2
   ```
3. A végleges területeket a program a tulajdoni lapi területből ráosztással számolja (22. § (3)).

### 2.4 A meglévő határpontok azonosítása

A **Mért pontok** mezőbe írd a meglévő határpontok terepen mért koordinátáit, **földhivatali
pontszámmal**:
```
101  650120.47  241230.16
102  650158.90  241236.74
```
A jobb oldalon pontonként látod az eltérést és a hibahatárt (16–17. §). Az új pontokat (`U1`, `U2`)
**ne** írd ide.

### 2.5 A rajzok és a leadás

- **Változási vázrajz**: a megszűnő határ áthúzva, az új határ vastagon, a megszűnő helyrajzi szám
  áthúzva, az új vastagon, alul a területkimutatás. A tárgymondat magától alakul: egy telekből több
  lesz → „megosztásáról”, többől egy → „egyesítéséről”, egyébként „telekhatár-rendezéséről”.
- **Mérési vázlat**: a mért pontok zölden, az új pontok és határ pirosan, a méretekkel.
- **Telekalakítási helyszínrajz** gomb (csak telekalakításnál látszik): a telekalakítási eljáráshoz
  kért helyszínrajz – az új határ méreteivel, a címkoordinátákkal, alul „A változás akaratunknak
  megfelelően történt” aláírási hellyel és a záradék helyével („A helyrajzi számozás és a
  területszámítás helyes. Ez a záradék a keltezéstől számított egy évig hatályos.”).
- **Leadandó csomag (.zip)**, mappánként: 01 adatigénylő lap (és térképmásolat-megrendelő),
  02 változási vázrajz, 03 mérési vázlat (és ha betöltötted, a mérési jegyzőkönyv a nyers fájllal),
  **04 telekalakítási helyszínrajz**, 05 koordinátajegyzék (`.txt`, `.csv`, `.html`),
  06 területszámítás (`ve.lst`, `vu.lst`), 07 DAT, 08 műszaki leírás, 09 záradékolási kérelem.

---

## 3. Épületfeltüntetés

**Mit csinálsz:** egy új épületet felvezetsz a térképre.

**Mit kapsz:** változási vázrajz (17. melléklet), mérési vázlat (10/B. melléklet), koordinátajegyzék,
címkoordináta, ellenőrző területszámítás, műszaki leírás, záradékolási kérelem, DAT.

### 3.1 Pontszámok a terepen

- Az **épület sarkai**: **új, egyedi** pontszámmal, pl. `E1`, `E2`, `E3`, `E4`. Egy második épületnél
  folytasd: `E5`, `E6`…
- Ha a földrészlet **határpontjait is azonosítod**: **a földhivatali pontszámmal**.

### 3.2 A programban

Példa: a 123 hrsz-ú telken új, négysarkú lakóház.

1. Töltsd be a földhivatali adatokat (0.4). A földrészlet határa nem változik: a *Változás előtti* és
   *utáni* mezőben ugyanaz a földrészlet maradjon:
   ```
   # előtte
   123 ; 1524 ; 101 102 103 104
   # utána
   123 ; 101 102 103 104
   ```
2. **A munka fajtája**: **Épületfeltüntetés**.
3. Írd az épület sarkait a **Koordináták** végére (és **ne** a *Mért pontok* közé):
   ```
   E1  650125.00  241240.00
   E2  650140.00  241242.50
   E3  650138.00  241254.00
   E4  650123.00  241251.50
   ```
4. **Vázrajz és jegyzékek** rész → **Rajzelemek** mező: rajzold meg az épületet, a sarkokat körbe
   sorolva:
   ```
   épület ; új ; E1 E2 E3 E4
   ```
   Ha nem lakóépület, a sor végén add meg a DAT-kódot, pl. gazdasági épületnél:
   `épület ; új ; E1 E2 E3 E4 ; CA06`.
5. A **címkoordináták** épületfeltüntetésnél és telekalakításnál maguktól bekapcsolnak, amikor a
   munka fajtáját kiválasztod (*Címkoordináták generálása a változás utáni földrészletekhez* jelölő a
   *Vázrajz és jegyzékek* részben). A pontszám előtagja alapból `C`. Lásd még: 5.1.
6. Ha a meglévő határpontokat is bemérted, azok a **Mért pontok** mezőbe kerülnek a földhivatali
   pontszámmal (2.4).

### 3.3 Ha az épület több sarkú, vagy van bontott épület

- Több sarok: egyszerűen sorold tovább: `épület ; új ; E1 E2 E3 E4 E5 E6`.
- Lebontott, megszűnő épület (ha a térképen még rajta van):
  `épület ; megszűnő ; 371362 371363 371365 371364` – a földhivatali pontszámokkal. Ez a vázrajzon
  áthúzva jelenik meg.

### 3.4 A rajzok

- **Változási vázrajz**: az új épület vastag vonallal, a 13 oszlopos területkimutatás „Jegyzet”
  oszloppal, az 51. § (2) szerinti záradék helye.
- **Mérési vázlat**: az új épület oldalain a méretek.
- Ha egy méretet vagy feliratot még rá szeretnél tenni (pl. házszám, utcanév), az előnézeten a
  **Felirat** és **Méret** eszközzel kattintva megteheted (lásd a Változási vázrajz útmutató 8.
  fejezetét).

### 3.5 Leadás

**Leadandó csomag (.zip)**, mappánként: 01 adatigénylő lap, 02 változási vázrajz, 03 mérési vázlat (és
ha betöltötted, a mérési jegyzőkönyv a nyers fájllal), 04 koordinátajegyzék (`.txt`, `.csv` és
nyomtatható `.html` pontlista), **05 címkoordináták** (`.txt` és nyomtatható `.html`), **06 ellenőrző
területszámítás** (a földrészlet `.lst` és **az új épület területe**: töréspontok, terület m²-ben és
négyzetméterre kerekítve), 07 műszaki leírás, 08 záradékolási kérelem, 09 DAT.

---

## 4. Művelési ág változás

**Mit csinálsz:** egy földrészlet egy részének (vagy egészének) megváltozik a művelési ága, pl. a
szántó egy részéből kivett (lakóház, udvar) lesz.

**Mit kapsz:** változási vázrajz (19. melléklet) a mezőgazdász-záradék helyével, mérési vázlat,
koordinátajegyzék, területszámítás, DAT, műszaki leírás, záradékolási kérelem.

### 4.1 Pontszámok a terepen

- Az **új alrészlethatár pontjai**: **új, egyedi** pontszámmal, pl. `M1`, `M2`.
- A földrészlet **határpontjai** (ha azonosítod): **a földhivatali pontszámmal**.

### 4.2 Hogyan gondolkodik a program

A földrészlet határa **nem változik**, csak a belsejében lévő **alrészletek**. Ezért:

- a *Változás előtti* és *utáni földrészletek* mezőben **ugyanaz** a földrészlet marad;
- az alrészleteket a **Rajzelemek** mezőben adod meg:
  - `alrészlet` – a **jelenlegi** állapot (ami a térképen most van),
  - `új alrészlet` – a **változás utáni** állapot.

Az alrészletek területét a program a földrészlet területére osztja rá, így összegük mindig pontosan a
földrészlet területe.

### 4.3 A programban

Példa: a 123 hrsz-ú telek ma egészében szántó (4. minőségi osztály). A nyugati fele kivett (lakóház,
udvar) lesz, a keleti fele szántó marad.

1. Töltsd be a földhivatali adatokat (0.4). Ha DAT-ot olvastál be, a meglévő alrészletek maguktól
   bekerülnek a *Rajzelemek* mezőbe.
2. A *Változás előtti* és *utáni* mezőben ugyanaz a földrészlet maradjon:
   ```
   # előtte
   123 ; 1524 ; 101 102 103 104
   # utána
   123 ; 101 102 103 104
   ```
3. **A munka fajtája**: **Művelési ág változás**.
4. Írd az új alrészlethatár pontjait a **Koordináták** végére:
   ```
   M1  650139.69  241233.45
   M2  650133.13  241271.78
   ```
5. **Rajzelemek** mező – a mostani és az új állapot:
   ```
   alrészlet ; a ; szántó ; 101 102 103 104 ; 4
   új alrészlet ; a ; kivett, lakóház, udvar ; 101 M1 M2 104
   új alrészlet ; b ; szántó ; M1 102 103 M2 ; 4
   ```
   A sorok felépítése: `új alrészlet ; betűjel ; művelési ág ; pontok körbe ; minőségi osztály`.
   - A **betűjel** kisbetű (`a`, `b`, `c`…).
   - A **művelési ág**: szántó, rét, szőlő, kert, gyümölcsös, legelő, nádas, erdő, kivett, halastó,
     fásított terület. Kivett területnél a hasznosítás is írható: `kivett, lakóház, udvar`.
   - A **minőségi osztály** 1–8; **kivett területnél hagyd el**.
6. A jobb oldalon az **Alrészletek és művelési ágak** táblázatban látod a változás előtti és utáni
   alrészleteket a területükkel és a minőségi osztállyal.

### 4.4 A rajzok

- **Változási vázrajz**: az új alrészlethatár szaggatott vastag vonallal, az új alrészlet betűje és
  művelési ága vastagon, a megszűnő felirat áthúzva; a területkimutatásban az alrészletek a művelési
  ággal és a minőségi osztállyal; a lábrészben a földminősítési záradék helye.
- **Mérési vázlat**: az új alrészlethatár oldalain a méretek.

---

## 5. Minden munka végén

1. **Rajzold meg a kiegészítéseket**, ha kell: utcanév, házszám, méret, jelkulcsi jel (pl.
   villanyoszlop, kút, kapcsolójel). Ezt a **Változási vázrajz** előnézetén egérrel teheted meg a
   **Felirat**, **Méret** és **Jel** eszközzel.
2. **Ellenőrizd a méretarányt** – a *Vázrajz és jegyzékek* részben *A vázrajz méretaránya* mezőben
   választhatsz, ha az automatikus nem jó.
3. **Nézd át** a jobb oldali hibaüzeneteket – piros hibával ne add le a munkát.
4. **Munkarészek nyomtatása** (PDF) vagy **Leadandó csomag (.zip)**.

### 5.1 A digitális leadás: DAT és címkoordináták

A földhivatalnak a változást digitálisan, **DAT adatcsere-formátumban** (DAT Szabályzat, DAT-M1
melléklet, MSZ 7772-1) is le kell adni. Ezt a program magától elkészíti:

- **Leadandó csomag (.zip)**: a DAT mappájában (telekalakításnál 07, épületfeltüntetésnél 09,
  művelési ág változásnál 06) a `DAT.dat` fájl. Kitűzésnél nincs DAT, mert a nyilvántartás nem
  változik.
- **Mentés DAT-ba** gomb (a *Változási vázrajz* munkalap jobb oldalán, a *Területkimutatás*
  fejlécében): csak a DAT fájlt menti, `…_valtozas.dat` néven.

A DAT a változás utáni állapotot tartalmazza: a pontokat (T_PONT), a földrészleteket a
területükkel (T_OBJ_ATTRBC / BD), az alrészleteket a művelési ággal (T_OBJ_ATTRBE) és az új
épületeket (T_OBJ_ATTRCA), a határvonalakkal együtt. Windows-1250 kódolású, ahogy az ITR is írja.
Ha a földhivatali DAT-ot olvastad be, a meglévő földrészletek adatait (fekvés, tulajdoni jelleg
stb.) onnan veszi át.

**Hol vannak a címkoordináták?**

- a *Vázrajz és jegyzékek* részben a *Címkoordináták generálása…* jelölő kapcsolja be őket
  (telekalakításnál és épületfeltüntetésnél magától bekapcsol);
- a **változási vázrajzon** jobb oldalt, „Címkoordináták … hrsz” táblázatban és a rajzon a
  jelükkel;
- a **Koordinátajegyzékben** külön csoportban (méter élességgel, 5411-es pontkóddal);
- a **csomagban**: épületfeltüntetésnél a `05_Címkoordináta` mappában (`cimkoordinatak.txt` és
  nyomtatható `.html`), a többi munkánál a koordinátajegyzékben;
- a **DAT-ban**: ez a földrészlet geokódpontja (a földrészlet rekordjának `pont_id` mezője).

A generált címkoordináta (5411) a földrészleten belüli pont, méterre kerekítve.

---

## 6. Gyors összefoglaló

| Munka | Új pontok neve (példa) | Hová kerülnek | Mit írsz a *Rajzelemek* mezőbe | Változás utáni földrészletek |
|---|---|---|---|---|
| Kitűzés | – (a földhivatali pontszám) | kitűzött pontok → *Mért pontok* | semmit | ugyanaz, mint előtte |
| Telekalakítás | `U1`, `U2` | *Koordináták* | semmit (vagy feliratot) | az új telkek, az új pontokkal |
| Épületfeltüntetés | `E1`…`E4` | *Koordináták* | `épület ; új ; E1 E2 E3 E4` | ugyanaz, mint előtte |
| Művelési ág változás | `M1`, `M2` | *Koordináták* | `alrészlet …` és `új alrészlet …` | ugyanaz, mint előtte |

**És mindig:** a meglévő, azonosított határpontok → *Mért pontok*, a **földhivatali pontszámmal**.
