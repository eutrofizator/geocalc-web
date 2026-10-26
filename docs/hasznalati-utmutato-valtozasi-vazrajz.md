# Változási vázrajz – használati útmutató

A **Geodéziai számítások / Változási vázrajz** munkalapon készül el egy földhivatali munka minden
munkarésze: a területszámítás, a változási vázrajz, a mérési vázlat, a koordinátajegyzék, a DAT, a
területszámítási lista és a szöveges dokumentumok (adatigénylő lap, műszaki leírás, kérelem stb.).
A rajzok a 8/2018. (VI. 29.) AM rendelet mellékletmintáit követik.

A munkalap bal oldalán adod meg az adatokat, a jobb oldalon azonnal megjelenik a területkimutatás, a
vázlat és az esetleges hibaüzenet. Minden beírt adatot a böngésző megjegyez, így a munka a következő
megnyitáskor is megvan.

---

## 1. A munka menete röviden

1. **Állítsd be az előlapot** (egyszer): *Geodéziai számítások / Beállítások* – készítő (vállalkozás),
   munkaszám, település, fekvés, dátum. Ezek kerülnek a rajzok fejlécébe.
2. **Olvasd be a földhivatali adatokat** a *Földhivatali adatok…* vagy a *DAT beolvasása…* gombbal,
   vagy írd be kézzel a koordinátákat és a földrészleteket (2. fejezet).
3. **Add meg a változást**: írd be a változás utáni földrészleteket, vagy számoltasd ki a
   *Területosztás* résszel (3. fejezet).
4. **Írd be a mért pontokat** a *Határpont-azonosítás* részbe (4. fejezet).
5. **Válaszd ki a munka fajtáját** és töltsd ki a *Munka adatai* mezőit (6. fejezet).
6. **Rajzold meg a kiegészítéseket** (épület, alrészlet, felirat, méret, jelkulcsi jel) – szöveggel vagy
   egérrel a vázrajz előnézetén (7–8. fejezet).
7. **Nyomtass vagy ments**: *Munkarészek nyomtatása* (PDF) vagy *Leadandó csomag (.zip)* (9. fejezet).

---

## 2. Bemenő adatok

### 2.1 Földhivatali adatok beolvasása

A bal oldali fejléc gombjai:

| Gomb | Mit csinál |
|---|---|
| **Minta** | Betölt egy kitalált mintapéldát a kipróbáláshoz. |
| **Koordináták…** | Koordináta-állomány beolvasása (soronként: pontszám, Y, X). |
| **Földhivatali adatok…** | A földhivatali adatszolgáltatás ZIP csomagja, vagy egyszerre kijelölve a DXF térkép, a földrészlet-információ (Report.txt) és a földkönyvi kivonat. |
| **DAT beolvasása…** | A DAT adatcsere-állomány (pontok, földrészletek, alrészletek, épületek). |

Beolvasás után a program kitölti a *Koordináták*, a *Változás előtti földrészletek* és a *Változás
utáni földrészletek* mezőt. A DAT meglévő alrészletei és épületei a *Rajzelemek* mezőbe kerülnek, a
szomszédos földrészletek pedig a vázrajz környezeteként jelennek meg. A beolvasás eredményéről
(hány földrészlet, eltérő terület, pontszám nélküli töréspont) a jobb oldalon kapsz üzenetet.

### 2.2 Kézi bevitel

A mezőkben a `#` utáni rész megjegyzés, azt a program nem olvassa.

**Koordináták (pontszám, Y, X)** – soronként egy pont, szóközzel, vesszővel vagy pontosvesszővel
tagolva. Az esetleges 4. oszlop (Z) és 5. oszlop (pontkód) a koordinátajegyzékbe is átkerül.

```
101  650120.45  241230.18
102  650158.92  241236.71
```

**Változás előtti földrészletek** – helyrajzi szám ; tulajdoni lapi terület (m²) ; a pontok a kerület
mentén (a kezdőpontot nem kell megismételni):

```
123 ; 1524 ; 101 102 103 104
124 ; 1241 ; 102 105 106 103
```

**Változás utáni földrészletek** – helyrajzi szám ; pontok:

```
123/1 ; 101 U1 U2 104
123/2 ; U1 102 103 U2
```

A műszaki területet a program a koordinátákból számolja, a változás utáni végleges területeket a
22. § (3) szerinti területarányos ráosztással.

### 2.3 Hibahatár

A legfelső sor a területi eltérés megengedett értékéhez kell:

- **Hibahatár** – 8. melléklet (EOTR / EOV térkép) vagy 9. melléklet (EOTR előtti vetület);
- **A digitalizált térkép méretaránya**;
- **Terület fajtája** – földrészlet (1,5 ×) vagy alrészlet, minőségi osztály, jog, tény (2 ×).

---

## 3. Területosztás

Ha a megosztás vonalát a programmal akarod kiszámíttatni:

1. **Földrészlet** – melyik földrészletet osztod.
2. **Osztóvonal** – *Párhuzamos az A–B oldallal*, vagy *Az A törésponton átmenő*.
3. **Leválasztandó terület [m²]**.
4. **A pont**, **B pont** (párhuzamos osztásnál az az oldal, amellyel párhuzamos lesz az osztóvonal).
5. **Új pontok előtagja** (pl. `U` → U1, U2), a **leválasztott** és a **maradék rész hrsz-a**.
6. **Osztás**, majd **Átvétel a változás utáni állapotba**: az új pontok a koordináták közé, a két rész
   a változás utáni földrészletek közé kerül.

Párhuzamos osztásnál a leválasztott rész az A–B egyenes mellett marad. Töréspontos osztásnál az
osztóvonal az A pontból indul, és a leválasztott rész a pontsorrend szerint az A pontot követő oldalak
felé esik. Az új pontok centiméterre kerekítve kerülnek a koordináták közé, ezért a rész területe
néhány dm²-rel eltérhet a kérttől.

---

## 4. Határpont-azonosítás (16–17. §)

Itt veti össze a program a mért pontokat a nyilvántartás koordinátáival.

- **Az alaptérkép készítése**, **Fekvés**, **Alapértelmezett rendűség** (R1–R4), és hogy a határ
  **szabatosan megjelölt**-e (± 0,10 m, különben ± 0,20 m).
- **Mért pontok (pontszám, Y, X [, R1–R4])** – a pontszám egyezzen a koordináták azonos pontjáéval.
  A sor végén pontonként más rendűség is megadható.
- **Kitűzési jegyzőkönyv (.txt)…** – a kitűzött pontok jegyzékét a mért pontok közé tölti.

A program pontonként és a mindkét végén mért határvonalak hosszára is kiírja az eltérést és azt, hogy
belefér-e a hibahatárba. A mérési vázlaton a mért pontok zölden jelennek meg.

---

## 5. Igazgatási szolgáltatási díjak

A *Díjszámítás a jegyzőkönyvben* bekapcsolásával a jegyzőkönyvbe bekerül a díj (1/2024. KTM
rendelet). Add meg **A változás jellegét**, az **Építmények számát**, az **Egyéb önálló ingatlanokat**,
az **Új alrészleteket**, és hogy **újrazáradékolás**-e, illetve kell-e az **adatszolgáltatás díja** is.
A földrészletek számát a program a változás előtti és utáni földrészletekből veszi. Az eredmény
tájékoztató jellegű.

---

## 6. Munka fajtája és adatai

**A munka fajtája**: *Kitűzés*, *Telekalakítás*, *Épületfeltüntetés* vagy *Művelési ág változás*.
Ettől függ a vázrajz és a vázlat felirata, a tárgymondat, a lábrész záradékai, a méretmegírás és a
leadandó csomag mappái.

A **Munka adatai** lenyitható részben adhatók meg a dokumentumokhoz szükséges adatok: megbízó neve
és címe, kormányhivatal, ügyfélkód, okmány, statisztikai számjel, e-mail, mérőműszer és gyári szám,
minőségtanúsító, a határpontok megjelölése, a munkavégzés időpontja, a szomszédos hrsz-ek és egyéb
feljegyzés.

---

## 7. Vázrajz és jegyzékek

### 7.1 A vázrajz adatai

- **Székhely**, **Adatszolgáltatás iktatószáma**, **A vázrajz megnevezése**;
- **Földmérő igazolvány száma**, **IRF minősítés száma**, **A készítés helye**;
- **Címkoordináták generálása** a változás utáni földrészletekhez (5411-es pontkód), a
  **Címkoordináta pontszám-előtagjával** (pl. `C`);
- **A vázrajz méretaránya** – *Automatikus* (a legnagyobb szabványos méretarány, amelyben a rajz a
  keretbe fér), vagy választható 1:100 és 1:10 000 között. Ha a választott méretarányban a rajz nem fér
  ki, az előnézet kiírja, legalább melyik kell.

### 7.2 Rajzelemek (szöveges megadás)

A **Rajzelemek** mezőben soronként egy elem, pontosvesszővel tagolva. A pontok a koordináták
pontszámai; a hely `@pontszám` vagy `Y X` alakban adható meg.

| Elem | Sor alakja | Példa |
|---|---|---|
| Épület | `épület ; új \| lakó \| gazdasági \| üdülő \| megszűnő \| falsík ; pontok [; CA01…CA10]` | `épület ; új ; E1 E2 E3 E4` |
| Meglévő alrészlet | `alrészlet ; betűjel ; művelési ág ; pontok [; minőségi osztály]` | `alrészlet ; a ; szántó ; 101 102 103 104 ; 4` |
| Kialakuló alrészlet | `új alrészlet ; betűjel ; művelési ág ; pontok [; minőségi osztály]` | `új alrészlet ; b ; kivett, lakóház, udvar ; 101 U1 U2 104` |
| Vonal | `vonal ; kerítés \| fal \| szolgalmi \| egyéb ; pontok` | `vonal ; kerítés ; 101 E5` |
| Felirat | `felirat ; házszám \| utcanév \| dűlőnév \| objektum \| egyéb ; szöveg ; hely [; forgatás°]` | `felirat ; utcanév ; Petőfi utca ; 650140 241225` |
| Méret | `méret ; pontszám pontszám [; szöveg]` | `méret ; 101 102` |
| Jelkulcsi jel | `jel ; név vagy JKDAT-kód ; hely [; forgatás°] [; megírás]` | `jel ; villanyoszlop ; @105` |

Megjegyzések:

- A **minőségi osztály** (1–8) a területkimutatás 4. és 10. oszlopába kerül; kivett területnél üres.
- A **méret** szöveg nélkül a számított távolságot írja ki; szöveggel azt (pl. átvett méretnél).
- A **jel** forgatás nélkül a jelkulcs szerint áll (lásd 8.3). A megírást (pl. `Ak` a kúthoz) az ötödik
  mezőben lehet felülírni; a forgatás mezőt ilyenkor üresen kell hagyni: `jel ; kút ; @105 ; ; Ak`.
- Hibás sornál a jobb oldalon a sor számával együtt jelenik meg az üzenet.

### 7.3 Rajzok és jegyzékek

| Gomb | Mit készít |
|---|---|
| **Változási vázrajz** | A vázrajz nyomtatható előnézete (15., 17., 19., 28. melléklet a munka fajtája szerint). |
| **Mérési vázlat** | A mérési vázlat előnézete a 11. melléklet színeivel (mért: zöld, új / kitűzési: piros, átvett: kék). |
| **DXF (földhivatali rétegek)** | A vázrajz rajza DXF-ben, a földhivatali rétegrenddel. |
| **Koordinátajegyzék (.txt)** | A pontok csoportonként, számsorrendben. |

Az előnézet fölött: **Nyomtatás / PDF**, **SVG mentése**, **Bezár**.

---

## 8. Szerkesztés a rajzon

Az előnézet fölötti **Szerkesztés** sorral egérrel is rajzolhatsz. Minden lépés egy új sor lesz a
*Rajzelemek* mezőben, így utána szöveggel is javítható, és bekerül a nyomtatásba, az SVG-be és a
DXF-be is.

### 8.1 Eszközök

| Eszköz | Használat |
|---|---|
| **Felirat** | Írd be a szöveget a *Szöveg* mezőbe, válaszd ki a *Fajtát* (egyéb, utcanév, dűlőnév, házszám, objektum), ha kell, a *Forgatást*, majd kattints a rajzon oda, ahová a feliratot szánod. |
| **Méret** | Kattints az első pontra, majd a másodikra. A kattintás a legközelebbi pontra ugrik (kb. 4 mm-en belül a rajzlapon). |
| **Jel** | Válaszd ki a *Jelkulcsi jel* listából, és kattints a helyére. |
| **Mozgatás** | Fogd meg a kézzel felvett feliratot vagy jelet, és húzd a helyére. |
| **Törlés** | Kattints a kézzel felvett feliratra, méretre vagy jelre. |
| **Visszavonás** | Az utolsó szerkesztés visszavonása (többször is nyomható). |

Az eszközgomb újbóli megnyomása kikapcsolja az eszközt. A **100%–300%** választóval az előnézet
nagyítható; nagyításnál a rajz görgethető dobozban látszik, így pontosabban lehet kattintani.

Csak a kézzel felvett elemek mozgathatók és törölhetők. A program által elhelyezett feliratok
(helyrajzi szám, pontszám, alrészlet-betű) helyét nem lehet áthúzni.

### 8.2 Példa: utcanév és méret

1. Kattints a **Változási vázrajz** gombra.
2. Kattints a **Felirat** eszközre, a *Szöveg* mezőbe írd: `Kossuth utca`, *Fajta*: `utcanév`.
3. Kattints a rajzon az utca helyére. A *Rajzelemek* mezőben megjelenik:
   `felirat ; utcanév ; Kossuth utca ; 650154.92 241220.67`
4. Kattints a **Méret** eszközre, majd a 101-es és a 102-es pontra:
   `méret ; 101 102` – a rajzon a két pont között megjelenik a távolság.

### 8.3 Jelkulcsi jelek

A jelek a **DAT1-M2. A digitális alaptérkép jelkulcsai** szabályzatmelléklet (FM 24.459/1996.)
méreteivel készülnek, a rajz méretarányától függetlenül ugyanakkorák. A listában csoportosítva:

| Csoport | Jelek |
|---|---|
| Geodéziai pontok, határjelek | ötödrendű alappont, kőalappont, felmérési alappont, magassági alappont, határkő, határpont, határdomb, határdomb kővel, határdomb faoszloppal |
| Határok | kapcsolójel |
| Épületek, tereptárgyak | épület jel, négyzetes pillér, kerek pillér, fényakna, fedett fényakna, tűlevelű fa, lombos fa, akna, dögkút, kereszt, sír |
| Vezetékek | alapozott oszlop, villanyoszlop, nagyfeszültség nyíl, földelő kút, oszloptrafó, trafóház |
| Vizek, kutak, aknák | tűzcsap, forrás, közkút, gémeskút, szökőkút, kút, aknafedlap, szögletes aknafedlap |
| Domborzat | kótált pont |

**Tájolás.** Ha a *Forgatás* 0, a jel a melléklet szerint áll:

- a legtöbb jel északi irányú (nem forgatható);
- a **kapcsolójel** merőlegesen áll a legközelebbi vonalra (földrészlethatár, épület, alrészlet);
- a **fényakna**, az **épület jel**, a **négyzetes pillér**, az **alapozott oszlop** és a **szögletes
  aknafedlap** a legközelebbi vonallal párhuzamos.

Ha más irányt szeretnél, adj meg forgatást (fokban, az óramutatóval ellentétesen). A **nagyfeszültség
nyíl** irányát mindig kézzel kell a vezetékhez forgatni.

**Megírás.** Ahol a melléklet előírja, a program a jel mellé, tőle jobbra 0,7 mm-re kiírja a
rövidítést: *Akna*, *sír*, *Vk* (közkút), *k* (kút), *dögk.* (dögkút).

**Szöveggel** a jel a nevével vagy a T_JELKULCS kódjával is megadható, ékezet nélkül is:
`jel ; kapcsolojel ; 650152 241281`, `jel ; JKDATC21 ; @104`.

A DXF-ben a jelek a **Jelkulcsi jel** rétegre kerülnek.

---

## 9. Mentés és leadás

A jobb oldali fejléc gombjai:

| Gomb | Mit ment |
|---|---|
| **Jegyzőkönyv (.txt)** | A területszámítás jegyzőkönyve. |
| **Területszámítás (.lst)** | A változás előtti (ve.lst) és utáni (vu.lst) területszámítási lista. |
| **Mentés DAT-ba** | A változás utáni földrészletek DAT adatcsere-állományban. |
| **Táblázatok (.csv)** | A jobb oldali táblázatok táblázatkezelőbe. |

A *Munka* részben:

- **Munkarészek nyomtatása** – a munka összes szöveges munkarésze és rajza egy nyomtatásban (PDF-be
  menthető).
- **Leadandó csomag (.zip)** – a munkarészek a munka fajtája szerinti mappaszerkezetben (pl.
  telekalakításnál: adatigénylő lap, változási vázrajz, mérési vázlat, koordinátajegyzék,
  területszámítás, DAT, műszaki leírás, záradékolási kérelem).

---

## 10. Gyakori kérdések

**Miért 1:1000 a rajz?** Automatikus méretaránynál a program a legnagyobb szabványos méretarányt
választja, amelyben a rajz a keretbe fér. Más méretarányt a *Vázrajz és jegyzékek* részben, *A vázrajz
méretaránya* mezőben lehet választani.

**Nem jelenik meg a felirat, amit beírtam.** Ellenőrizd a jobb oldali hibaüzeneteket: a sor számával
együtt jelzik, ha egy pont nem létezik vagy a sor alakja hibás. A felirat a rajz keretén kívül nem
látszik – lehet, hogy a megadott hely kívül esik a kivágaton.

**A Méret eszköz nem fogja meg a pontot.** Kattints közvetlenül a pont jelére, vagy nagyíts rá a
*100%–300%* választóval. A kattintás csak kb. 4 mm-en (rajzlapon mérve) belüli pontra ugrik.

**Hogyan javítom egy kézi elem helyét pontosan?** A *Rajzelemek* mezőben írd át a sor Y X koordinátáit.
