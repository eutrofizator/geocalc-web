# Design System Master File – GEOkalkulus 1.0

> **FONTOS – irányváltás.** Ez a fájl eredetileg a `ui-ux-pro-max` generátor kimenete volt
> (Minimalism & Swiss, Outfit/Work Sans webfontok, 8 px-es lekerekítés). A felhasználó döntése
> szerint a felület **a valódi GeoCalc 3.5 Windows/Delphi alkalmazást követi**, ezért a generált
> modern javaslat **hatályát veszti**: helyette az alábbi Win32-tokenek és komponensek érvényesek.
> A generátor eredeti kimenete csak történeti hivatkozás.

**Project:** GEOkalkulus 1.0
**Irány:** klasszikus Win32 / Delphi VCL (a valódi program külleme)
**Utolsó frissítés:** 2026-10-19

> **Névhasználat:** a program neve **GEOkalkulus 1.0**; a kimeneti fájl `dist/GEOkalkulus-1.0.html`.
> Az eredeti **formátumneveket** (GeoCalc adatbázis / GeoCalc-DB, `.PYX`, `.PYX2`, `FOK.PPMMSS`,
> GeoCalc-AR) szándékosan megtartjuk – a valódi program ezeken a neveken ismeri őket.

---

## Miért nem a generált javaslat

| Elem | A generátor javaslata | Helyette | Miért |
|---|---|---|---|
| Stílus | Minimalism & Swiss (nagy fehér terek) | Win32 3D-s keretek, sűrű rács | A cél a valódi program küllemének követése. |
| Szín | navy `#1E3A5F` + zöld `#059669` | `--face` `#d4d0c8`, `--title-1` `#0a246a` | A klasszikus Windows gomb- és címsorszínei. |
| Betűtípus | Outfit / Work Sans (Google Fonts) | Tahoma / Segoe UI (rendszerbetű) | Az app egyetlen önálló fájl, hálózat nélkül; webfont nem használható. |
| Lekerekítés | `border-radius: 8–16px` | `border-radius: 0` | A Win32 vezérlők derékszögűek. |
| Árnyék | `box-shadow`-alapú mélység | `inset`/`outset` 3D keretek | A klasszikus Windows mélységet keretpárokkal adja. |
| Gomb hover | `transform: translateY(-1px)` | keret + háttér váltás | Nincs elmozdulás (layout-shifting hover tiltva). |
| Mozgás | GSAP scroll reveal | nincs animáció | Eszköz; a tartalom nem jelenhet meg késleltetve. |
| Oldalminta | Hero + Features + CTA | menüsor + ikonsáv + MDI ablakok + állapotsor | Alkalmazás-héj, nem landoló oldal. |

---

## Tokenek (`src/style.css`)

| Token | Érték | Szerep |
|---|---|---|
| `--face` | `#d4d0c8` | gomb/ablak alap (klasszikus) |
| `--face-hi` | `#ffffff` | 3D-s keret világos éle |
| `--face-sh` | `#808080` | 3D-s keret sötét éle |
| `--face-sh2` | `#404040` | 3D-s keret legkülső sötét éle |
| `--field` | `#ffffff` | beviteli mező háttere |
| `--text` / `--text-dim` | `#000000` / `#4a4a4a` | szöveg / másodlagos szöveg |
| `--disabled` | `#808080` | letiltott szöveg |
| `--select` / `--select-text` | `#000080` / `#ffffff` | kijelölés (menü, lista) |
| `--title-1/2/3` | `#0a246a` / `#3a6ea5` / `#6f9fd0` | aktív címsor színátmenete |
| `--mdi-bg` | `#808080` | MDI munkaterület háttere |
| `--font` | `Tahoma, "Segoe UI", Verdana, sans-serif` | alap betűtípus, 11 px |
| `--mono` | `Consolas, "Lucida Console", monospace` | szerkesztő és kód |

**3D-s keret (kiemelés):** `border: 1px solid; border-color: #fff #404040 #404040 #fff;`
**3D-s keret (besüllyesztés):** `border-color: #404040 #fff #fff #404040;`

---

## Komponensek

### Ablak és címsor
`.window` (függőleges flex) → `.titlebar` (navy színátmenet, fehér félkövér szöveg, `– □ ✕` gombok,
a bezárás piros) → tartalom → `.statusbar`.

### Menüsor
`.menubar` + `.menu-btn` (hover/open esetén keret, illetve `--select` háttér).
A lenyíló `.menu-drop` 240 px, 2 px belső margó, 3D keret, árnyék.
`.menu-item` hoverre `--select`/`--select-text`; `.menu-sep` 1 px sötét + 1 px világos vonal;
`.menu-accel` jobbra igazított gyorsgomb; `.menu-sub` almenü (a „Kód beszúrása” 18 elemmel).

### Ikonsáv
`.toolbar` + `.tb-btn` (26×25 px, `border: 1px solid transparent`; hoverre kiemelkedő keret,
lenyomásra besüllyesztett). `.tb-sep` csoportelválasztó. Az ikonok SVG-sprite-ból (`<use href>`),
16 px, 1,75 px vonalvastagság, `stroke: currentColor`.

### MDI munkalap-ablak
`.mdiwin` (abszolút, 3D keret, árnyék; `.maximized` esetén `inset: 0`, árnyék nélkül).
`.mdiwin-title` – inaktívan szürke, aktívan navy színátmenet; a `.mdiwin-buttons` három gombja
(`data-act="min|max|close"`). Az ablak húzással mozgatható (csak visszaállított méretben).

### Elrendezés a munkalapon
`.split` (bal oldali `.sidepanel` + jobb oldali `.panes`), `.panes` (két `.pane` egymás mellett),
`.pane-head` (cím + műveletek). 1000 px alatt minden függőlegesen tördel.

### Beviteli mezők
`.form input/select/textarea` – fehér háttér, besüllyesztett 3D keret, `font-weight: 400`,
fókusznál 1 px navy belső körvonal.

### Eredmény (jegyzőkönyv)
`.results` szürke „nyomtatási vászon”, rajta `.card` (fehér lap, navy fejlécsáv, `.table-wrap`
görgethető, ragadós fejléc és első oszlop, `tabular-nums`). A `.card .footer` a lábjegyzetek.

### Jegyzőkönyv-előlap (`.cover`)
A jegyzőkönyv első kártyája (`data-role="cover"`), a valódi program előlapjának mintájára:
`.cover-head` (balra a `.cover-logo` – 96×96 px, benne a beépített geodéziai jelkép, illetve a
feltöltött céglogó; jobbra a
`.cover-msz` és a `.cover-country`), `.cover-title` (navy, 16 px), `.cover-subtitle` (dőlt,
a munkaterület neve), `.cover-fields` (Készítette / dátum / település / fekvés / munkaszám),
`.cover-foot` (a lábléc: „by_safi01”). Nyomtatásban az előlap után oldaltörés (`break-after: page`).

### Kimeneti formátumok (`.downloads`, `.fmt-note`)
A `>` direktívák fájljai a `.downloads` sávban jelennek meg (gomb + `title`), mindegyik mellett egy
`.fmt-note` sor a formátum leírásával és forrásával. A `W>`/`G>`/`L>`/`M>` nyilvános műszerformátumot
követ (a súgó nem közli a bájtos elrendezést), ezt a megjegyzés jelzi.

### Beállítások munkalap (`.form .grid2`)
Kétoszlopos űrlap a jegyzőkönyv-előlap adataihoz és a céglogóhoz; a `.logo-preview` a feltöltött
logót mutatja. Az adatok a `borito.ini` `[JKV]` formátumában menthetők/betölthetők.

### Adatleíró munkalap (`.picklist`, `.obs-table`)

A bal oldali `.sidepanel`-ben két `.picklist`: az álláspontok (AP/ID) és a kijelölt álláspont
irányzott pontjai (IP). A `.pick` egy teljes szélességű, vízszintes gombsor (`aria-pressed`), a kijelölt
sor `--title-1` hátterű; a `.pick-tag` kis címke („ismert”/„szabad”, illetve „ismert”/„új”).
A jobb oldali `section.descriptor-obs` a mérési táblázat (`.obs-table`, a `.table-wrap` első oszlopa itt
nem ragadós, a sorok `input` mezői a `.form` stílusát követik); a `section.descriptor-form` a
típusválasztó, a típusfüggő extra mezők, az előállított kód `textarea`-ja és az „Automatikus kódolás”
`.settings` blokkja.

### Koordináta kezelő munkalap (`.mini`, `.cond`, `.widths`)

A bal oldali `.sidepanel`-ben a „Mezők megadása” `.mini` táblázat (jelölőnégyzet + név + ▲▼
sorrendezés), a „Feltétel (WHERE)” `.cond` blokkok (a `.cond-kw` a WHERE/AND/OR kulcsszó, alatta a
mező- és műveletválasztó, valamint a keresett érték), a `.mode` a kapcsolat-választó. A jobb oldalon a
`.form.inline-form` a kimenet jellemzői (elválasztó, tizedesek, „Üres helyeket levágni”, jelző oszlop,
`.widths` a mezőnkénti hosszhoz), alatta a `.results` előnézet. A `.glyph` a keskeny ▲▼/+/− gombok
stílusa.

### Állapotsor
`.sb-panel` – besüllyesztett panel; `white-space: nowrap` + `text-overflow: ellipsis`
(csonkít, nem tördel). `.sb-grow` a rugalmas első panel, `.sb-grip` a jobb alsó fogantyú.

### Hálózati nézet – önálló hálózat, hálózati dátum, sokszögvonal-előzetes

A „Hálózatkiegyenlítés” munkalapon a `.check` „Önálló hálózat” jelölőnégyzet a szabad kiegyenlítést
kapcsolja (a megadott koordináták közelítő értékké válnak). Alatta a `#net-datum-row` `.grid2` a
hálózati dátum mezői (horgonypont, kívánt Y/X, forgatás, illetve második pont + kívánt irányszög),
a `#net-traverse` szöveges mező pedig a sokszögvonal-pontok sorrendjét várja (szóközzel, vesszővel
vagy pontosvesszővel elválasztva; ha az utolsó pontszám megegyezik az elsővel, zárt poligon).
Mindhárom vezérlő ugyanazt a `.form` stílust és a beszúrt `input`-mezőket használja, mint a többi
beviteli mező, ezért nem igényel új CSS-t. A „Mintapélda” gomb a `net-traverse` mezőt is kitölti.

### Jegyzőkönyv-szakaszok (hálózat)

A hálózati jegyzőkönyv új szakaszai a meglévő `.rep-table` táblázat-stílust használják: `net-datum`
(önálló hálózat elhelyezése), `net-placed` (a hálózati dátum utáni koordináták és az eltolás/forgatás),
`traverse-vertices` (Hátra/Előre/dHZ/T(1)/T(2)/Irányszög/Hossz) és `traverse-points` (előzetes
koordináták). A `Section.footer` sorai a záróhibákat és a fenntartásokat közlik.

### Adatrögzítő munkalap (`.form`, `.obs-table`, `.rc-table`)

A bal oldali `.form` a beállításokat tartalmazza: `.grid2` a rögzítőtípus, a hiányzó távolságok és a
távolságredukció választójának; a vetület kiválasztása mellett a **méretarány, a redukciós sugár és a
redukciós tengely** mezői, valamint az átlagos **Y/X/M** értékek az „Átlagok koordináta-állományból…”
gombbal. A jobb oldali `section`-ben a `.results` a jegyzőkönyv kártyáit adja, a `.downloads` sáv
pedig a redukált mérések és a jegyzőkönyv mentését kínálja.

**A kézi mérési bevitel `.rc-table`** (a `.obs-table` kiterjesztése, 2026-10): a tízoszlopos táblázat
soronként a `#`, `Hz`, `Zi`, `Tf`, `Mj`, `Mm`, `Pkód` mezőt veszi fel, a **számolt `Tv` és `dM`** pedig
ugyanabban a sorban, kizárólag olvasható `.rc-calc` cellaként jelenik meg. A `th > span` a fejléc
második sorát adja (magyar név + mértékegység/formátum), a `.rc-dms` a szög **emberi (fok-perc-másodperc)
alakját** írja a beírás alá (`91.2345` → `91°23′45″`), a `.rc-out` a számolt értéket (üresen `–`), a
`.rc-invalid` a hibás mezőt (piros mező és keret). A `.rc-table` a `.obs-table input` mintáját követi
(fejszín mező, besüllyesztett 3D keret, `font-weight: 400`); a `#` és a számmezők `.rc-num`
osztálya jobbra igazít és monospace betűt használ. A sorvégi `×` a `.glyph` gomb. A `.btnrow` a
`+ Mérési sor` / `Összes törlése` / `TVET.TXT (eredmény) beolvasása…` műveleteket fogja össze; a lenyitható
**szöveges bevitel** a táblázat szöveges tükörképe (beillesztéshez), ugyanazzal a `.form .settings`
megjelenéssel.

### Térbeli transzformáció/Átszámítás munkalap (`.form .grid2`, `.dims`)

A `.form` a hét paramétert (`Eltolás X/Y/Z [m]`, `Forgatás X/Y/Z [″]`, `Méretarány [mm/km]`) a
`.grid2` rácson veszi fel, a súgó szerinti pontossággal (4, illetve 2 tizedes). A vetület jellegét a
`.dims` mezőcsoport `3D`/`2D` választója adja, mellette a **Leica SKI** `.check` jelölőnégyzet és a
**„Paraméterek átvétele”** gomb. Alatta a `textarea` az átszámítandó pontokat, a kimeneti formátumot
`.grid2`, a **„Hozzáadás a közös pontokhoz”** (kétlépcsős módszer) blokk pedig a pont azonosítóját
várja. Az eredmény a `.results` három kártyája (paraméterek, átszámított pontok, földrajzi értékek).

### Koordináta állomány készítése munkalap (`.obs-table`, `.form.inline-form`)

A pontjegyzék a jobb oldali `.obs-table` (soronként: típus `select`, pontszám és három koordináta
mező, `×` törlés `.glyph` gombbal), a kimeneti beállítások a `.form.inline-form`, az előnézet pedig a
`.results` kártyái. A típusváltás (`.xf-kind`) az oszlopfeliratokat is átírja (`Y/X/M`, `X/Y/Z`,
`φ/λ/h`), és a nem `Y, X, M` pontok a `.PYX` kimenetből kimaradnak.

### AKG jegyzőkönyv munkalap (`.obs-table`, `.card`)

A koordináta-állomány és az AMS leíró `textarea`-ja a bal oldali panelben, fölötte a **parcella
választó** (`select`), amellyel az `AKG_ID`, `AKG_BLOKK`, `AKG_REGSZ`, `AKG_FOLDH`, `AKG_CELPRG`,
`AKG_JELOLOPONT`, `AKG_KIVETT` és a rendelet szerinti szöveg **parcellánként** adható meg (a
beírt értékek parcellaváltásnál megmaradnak). A jegyzőkönyv a `.results` öt kártyája; a
`data-role="cover"` előlap és a `.card .footer` fenntartásai itt is érvényesek.

### Hálózatkiegyenlítés/Beállítások munkalap (`.form .grid2`, `.settings`)

A Munkaterület beállításai (irány-/távmérés középhibája, súlyozás, statisztikai próbák, durva hiba
küszöbei) **közös elem-azonosítókkal** élnek a Munkaterület nézetével, ezért az áthelyezés nem
duplikálja a mezőket. Új elem a `.form .settings` **hibahatár-előbeállítás** (`select` + gomb, a
„– becsült” jelöléssel) és a **számítás élessége** választó (cm / mm / tized mm), valamint az
`#ns-status` állapotsor, amely az alkalmazott előbeállítást és annak forrását írja ki.

---

## Akadálymentesség és korlátok

- Kontraszt: minden szöveg ≥ 4,5:1 (a fekete a `#d4d0c8`-on ~13:1), a 3D keretek ≥ 3:1.
- Fókusz: minden interaktív elemen látható (`:focus-visible` pontozott körvonal, illetve fókuszált
  menüponton `--select` háttér).
- A menüsor és az ikonsáv `role="menubar"` / `role="toolbar"`, a menüpontok `role="menuitem"`,
  az Ablak menü elemei `role="menuitemradio"` + `aria-checked`.
- A munkalap-ablakok `aria-label`-lel rendelkeznek; megnyitáskor a `[data-autofocus]` (a szerkesztő),
  egyébként az első fókuszálható elem kapja a fókuszt.
- Nyomtatás: csak a jegyzőkönyv marad (a burok, az űrlapok és a szerkesztő elrejtve), fehér alapon.
- Ismert hiány: a hálózati nézetben a mérés kizárása **csak egérrel** működik; a valódi programban
  ezt jelölőnégyzet végzi.

## Tiltott minták (a generátorból megtartva)

- ❌ Emoji ikonként – helyette SVG (Lucide ihletésű, egységes vonalvastagság).
- ❌ Elrendezést mozgató hover (scale/translate).
- ❌ 4,5:1 alatti szövegkontraszt.
- ❌ Láthatatlan fókusz.
- ❌ Webfont (a fájl önálló és offline).

## Átvétel előtti ellenőrzés

- [x] Nincs emoji ikonként; egységes SVG-készlet.
- [x] Látható fókusz minden interaktív elemen.
- [x] Kontraszt ≥ 4,5:1 szövegre, ≥ 3:1 nem szöveges elemre.
- [x] `prefers-reduced-motion` figyelembe véve.
- [x] 1280 és 1440 px szélességen ellenőrizve; 1000 px alatt függőleges tördelés.
- [x] Nyomtatási nézet.
- [x] Az önálló `dist/GEOkalkulus-1.0.html` 0 külső hivatkozást tartalmaz.
- [x] Az 5. csomag munkalapjai (Adatrögzítő, Átszámítás, Koordináta állomány, AKG,
  Hálózatkiegyenlítés/Beállítások) a **176 ellenőrzéses** böngészős végpróbán (0 kezeletlen kivétel,
  0 konzolhiba) hibátlanul működnek.
- [x] Az Adatrögzítő kézi beviteli táblázata (`.rc-table`): a számolt `Tv`/`dM` azonnal a sor mellett,
  a szög emberi alakja, a hibás mező jelölése és az élő szöveges tükör a végpróbán igazolva; a
  jegyzőkönyv a szögeket a beírt `FOK.PPMMSS` alakban közli.
