# DXF megjelenítő – használati útmutató

Az **Adatcsere / DXF megjelenítő** munkalapon a földhivatali adatszolgáltatás DXF térképe (vagy
bármilyen ASCII DXF rajz) tekinthető meg, és rátehetők a saját mért pontjaid. A program minden saját
ponthoz megkeresi a legközelebbi pontot a DXF-ben, és kiírja az eltérést – így terepen mért pontjaidat
gyorsan összevetheted a nyilvántartással.

A munkalapot a bal oldali navigátorban vagy az *Adatcsere* menüben találod.

---

## 1. A munka menete röviden

1. **DXF megnyitása…** – válaszd ki a DXF-et vagy a földhivatali ZIP csomagot.
2. **Saját pontok** – írd be, olvasd be állományból, vagy vedd át a Változási vázrajz munkalapról.
3. Nézd meg a térképen a piros pontokat, és a táblázatban az eltéréseket.

---

## 2. A DXF megnyitása

Kattints a **DXF megnyitása…** gombra, és válaszd ki:

- a **DXF** állományt, vagy
- a földhivatali adatszolgáltatás **ZIP** csomagját – a program kikeresi belőle a DXF-et.

Megnyitás után a gomb alatti sor kiírja az állomány nevét, az elemek és a fóliák számát, valamint a
számozott határpontok számát.

A program ezeket az elemeket rajzolja ki:

| DXF elem | Megjelenés |
|---|---|
| LINE, LWPOLYLINE, POLYLINE | vonal, vonallánc |
| CIRCLE, ARC | kör, körív |
| TEXT, MTEXT | felirat (helyrajzi szám, pontszám stb.) |
| INSERT, POINT | pont (a nagyítástól független méretű pötty) |

Amit nem rajzol ki (pl. HATCH sraffozás, méretvonal), arról a jobb oldalon üzenet jelzi, hány elem
maradt ki. A vonalláncok íves szakaszai egyenesként jelennek meg.

A DXF koordinátái a földhivatali térképek szerint értendők: a DXF X az EOV Y (kelet), a DXF Y az
EOV X (észak).

---

## 3. Saját pontok

A **Saját pontok (pontszám Y X)** mezőbe soronként egy pont kerül:

```
# pontszám  Y  X
101  650012.34  240001.02
102  650040.11  240000.87
```

A pontokat háromféleképpen adhatod meg:

| Gomb / mód | Mit csinál |
|---|---|
| beírás | A mezőbe közvetlenül írod vagy bemásolod a pontokat. |
| **Pontok állományból…** | Szöveges koordináta-állomány (pontszám Y X) beolvasása; a térkép a pontokra nagyít. |
| **A Változási vázrajz pontjai** | Átveszi a *Változási vázrajz* munkalap mért pontjait; ha ott nincs mért pont, a koordinátákat. |

A saját pontok **pirossal**, pontszámmal jelennek meg a térképen. A beírt pontokat a böngésző
megjegyzi.

---

## 4. A térkép kezelése

| Művelet | Hogyan |
|---|---|
| Nagyítás / kicsinyítés | Egérgörgő (a kurzor körül), vagy a **+** és **−** gomb. |
| Mozgatás | Húzd a térképet az egérrel. |
| Teljes rajz | **Teljes nézet** gomb. |
| A saját pontok | **Saját pontokra** gomb – a pontjaidra nagyít. |
| Koordináta leolvasása | A kurzor Y és X koordinátája a fejlécben látszik. |

### Fóliák

A **Fóliák** listában a DXF minden fóliája szerepel, a színével és az elemszámával. A jelölőnégyzettel
egyenként ki-be kapcsolhatók; a **Mind** és az **Egyik sem** gomb mindet egyszerre. A **A DXF feliratai**
jelölővel a DXF szövegei kapcsolhatók ki, ha zavaróak.

A kikapcsolt fóliákat a böngésző megjegyzi.

---

## 5. Eltérések a DXF-től

A **Saját pontok és a legközelebbi DXF pont** táblázat minden saját ponthoz kiírja:

| Oszlop | Jelentés |
|---|---|
| Pontszám, Y, X | a saját pont |
| DXF pont | a legközelebbi DXF pont pontszáma, vagy „töréspont”, ha nincs pontszáma |
| dY, dX | az eltérés összetevői (saját pont − DXF pont), méterben |
| Eltérés | a két pont távolsága, méterben |

A **Keresési sugár a legközelebbi DXF ponthoz** (0,1 m – 10 m) mondja meg, milyen messze keressen a
program. Ha ezen belül nincs DXF pont, a sorban „nincs … m-en belül” áll.

A program ezek között keres:

- a **számozott határpontok** – a pontjel és mellette a „_SZ” végű fólia felirata (pl. a BHP fólia
  pontja és a BHP_SZ fólia pontszáma, 2 m-en belül);
- a többi **pontjel** (INSERT, POINT);
- a vonalak és vonalláncok **töréspontjai** (a körök és ívek pontjai nem számítanak).

A térképen szaggatott piros vonal köti össze a saját pontot a hozzá talált DXF ponttal.

**Kattints egy sorra**, és a térkép arra a pontra nagyít. A **Táblázatok (.csv)** gombbal a táblázat
táblázatkezelőbe menthető.

---

## 6. Példa: mért határpontok összevetése

1. Nyisd meg a földhivatali ZIP-et a **DXF megnyitása…** gombbal.
2. A *Változási vázrajz* munkalapon már beírtad a mért pontokat – kattints **A Változási vázrajz
   pontjai** gombra.
3. Állítsd a keresési sugarat **1 m**-re.
4. A táblázatban nézd meg az *Eltérés* oszlopot. Ahol nagy az eltérés, kattints a sorra, és a térképen
   megnézheted, melyik DXF ponthoz viszonyít a program.
5. Ha a legközelebbi pont csak „töréspont”, kapcsold ki a felesleges fóliákat (pl. épületek), és
   ellenőrizd, hogy a határpont pontszáma szerepel-e a DXF-ben.

A határpont-azonosítás hivatalos vizsgálatát (16–17. §, hibahatárokkal) a *Változási vázrajz* munkalap
*Határpont-azonosítás* része végzi; a DXF megjelenítő a szemrevételezést és a gyors ellenőrzést
szolgálja.

---

## 7. Gyakori kérdések

**Nem jelenik meg semmi a megnyitás után.** Nézd meg a jobb oldali üzenetet: lehet, hogy a DXF bináris
(nem ASCII), vagy nincs benne ENTITIES szakasz. A ZIP-ben a program az első DXF-et keresi meg.

**A saját pontjaim messze vannak a rajztól.** Ellenőrizd, hogy a pontok Y X sorrendben vannak-e
(Y = kelet, ~650 000; X = észak, ~240 000), és hogy ugyanabban a vetületi rendszerben (EOV) vannak-e,
mint a DXF.

**A DXF pont oszlopban csak „töréspont” áll.** A DXF-ben az adott helyen nincs pontszámmal ellátott
pontjel, vagy a pontszám nem a pontjel fóliájának „_SZ” párján van. Az eltérés ettől még helyes.

**A térkép lassú.** Kapcsold ki a sok elemet tartalmazó fóliákat vagy a DXF feliratait.
