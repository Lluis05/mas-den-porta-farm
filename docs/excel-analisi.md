# Anàlisi de l'Excel "estat granja.xlsm"

Fitxer original: `~/Documents/estat granja.xlsm` (macro-enabled, 42 fulls).
Data d'anàlisi: 2026-08-09. Idioma del fitxer: català.

Aquest document és la font de veritat sobre **què conté l'Excel dels pares** i
**quines preguntes queden obertes**. Actualitzar-lo a mesura que es responen.

---

## 1. Mapa dels fulls

| Full | Estat | Què és |
|---|---|---|
| `Cens24` | visible | **Full mestre.** Un registre per cada deslletament (banda). Històric 2021→2026. |
| `Pinso 24` / `Pinso 25` / `Pinso 26` | 24 visible, 25 ocult, 26 visible | Entregues de pinso per any. |
| `Porcs escorxador 24` / `25` / `26` | visibles | Sortides a l'escorxador per any. |
| `0` … `33` | 0–22 ocults (excepte 0), 23–33 visibles | **Un full per cicle d'engreix** d'una banda. Numeració rotativa reutilitzable. |
| `Hoja2` | ocult | Bastida buida de resums anuals. Sense dades. |

Hi ha `xl/vbaProject.bin` (macros VBA) — sembla que només fa `Sheets("...")`,
probablement per navegar/amagar fulls. No sembla contenir lògica de dades.

---

## 2. `Cens24` — el full mestre (una fila = una banda deslletada)

Capçaleres a la fila 7, dades des de la fila 8 (2021-09-24) fins la 97 (2026-08).

| Col | Capçalera | Tipus | Notes |
|---|---|---|---|
| A | Nº banda | entrada | 1–7, cíclic |
| B | Truges criades | entrada | |
| C | Data desmamat | entrada | cada 3 setmanes per banda |
| D | Truges desmamades | entrada | |
| E | Porcs vius a la setmana vida | entrada | |
| F | %baixes parideres | **fórmula** `=(E-G)/E` | |
| G | Porcs desmamats | entrada | |
| H | Mitja porcs truja desmamats | **fórmula** `=G/B` | |
| I | Total | entrada | truges cobertes/inseminades? (pendent) |
| J | Repetidores | entrada | |
| K | Primales | entrada | |
| L | Plenes | entrada | |
| M | % plenes | **fórmula** `=L/I` | |
| N | Porcs engreix | entrada | |
| O | % baixes destete | **fórmula** `=(G-N)/G` | |
| P | Porcs sales | entrada, text | llista de sales, p.ex. `17-18-19-21`, `26 E+5-6-D` |
| Q | Identificador | entrada | només valors 1–5 en 5 files (2024). Pendent |
| R | Data entrada | entrada | entrada a engreix |
| S | data primera venta | entrada | |
| T | edat primera venta (setmanes) | **fórmula** `=9+((S-R)/7)` | assumeix 9 setmanes d'edat a l'entrada |
| U | data buidat ultima sala | entrada | |
| V | edat ultima venta (setmanes) | **fórmula** | |
| W | observacions | entrada | vacunes: `vac pyrss 15/4/25`, `draxin`, `tiro`, `1enro` |
| X | posicio inseminar | entrada | `L1`, `L2 + L4`, `L3`… |
| Y | posició gestació | entrada | `Benestar esquerra`, `Benestar dreta`, `Autom mascle` |

**Bloc AA1:AO3** — càlcul auxiliar "Últims 7": `COUNTA` de cada columna −7 +
`OFFSET(...,7,1)` per fer mitjanes mòbils de les 7 últimes bandes. Les files
AA5:AO11 semblen dades residuals enganxades, no fórmules.

**Errors de dades detectats** (probables errades de tecleig):
- `C81` = 2012-12-05 (hauria de ser ~2025-12-04)
- `C83` = 2025-01-16 (fora d'ordre; hauria de ser 2026-01-16)
- `P40`, `P48`, `P53`, `P76`, `P81` contenen **dates** en comptes de llista de sales
  (Excel ha interpretat `9-11-13-14` com a data)
- `T85:T90`, `V68:V77` donen números negatius grans (fórmula sobre cel·la buida)
- `B49`/`C1` etc. de `Pinso 25/26` i `Porcs escorxador 26` tenen `#REF!` — fórmules trencades
- `B49` de `Pinso 26` posa any 2025 enmig del 2026

---

## 3. Fulls numerats `0`–`33` — cicles d'engreix

Cada full = **un cicle d'engreix d'una banda**. El número de full és un
**comptador rotatiu** (s'han reutilitzat; 0, 32 i 33 estan buits = següents a omplir).

Es lliguen a `Cens24` per la columna P (llista de sales) + data d'entrada.
Exemple verificat: full `6` (banda 1, entrada 400, sales 17-18-19-21, data 2025-01-17)
= fila 64 de `Cens24`.

Estructura: fins a **6 blocs de sala** en horitzontal, cadascun amb:
- `SALA` → identificador de sala
- `Data entrada`
- `Nº porc sala` → nº de porcs que hi entren
- Taula de fins a **10 sortides**: `Numero sortida`, `Data`, `Nº porcs`, `Pes`
- Total de sortides = `SUM()` de la columna Nº porcs

Bloc resum al peu:
- `Numero banda`
- `Nº porcs entrada` (manual)
- `Nº porcs sortida` = suma dels 6 blocs
- `Nº baixes` = `entrada − sortida − sobrants` ← **les baixes NO es registren, es dedueixen**
- `Data entrada`, `Data ultima sortida`, `Nº PORCS SOBRANTS`
- `% de baixes` = `baixes / (entrada − sobrants)`

### Identificadors de sala observats
Sales numerades **1–27**. Es poden subdividir:
- Sufix `E` / `D` = esquerra / dreta (`23E`, `5D`, `27-D`, `21 E`)
- Corrals concrets: `11 1-2-3-4E`, `20 1-2-3-4-6-D`, `12 1-2-3-4D`, `15 1D`, `1/1-2E`
- ~~Combinacions de dues sales en un bloc~~: `13-E+5-6D`, `26 E+5-6-D`, `11D+5-6E`
  ⚠️ **Corregit 2026-08-10: no són dues sales.** És **una sola sala** amb les dues
  meitats ocupades de manera desigual (p. ex. `26 E+5-6-D` = sala 26, tota
  l'esquerra + els corrals 5 i 6 de la dreta).

**Gramàtica completa d'aquests codis** (resolta 2026-08-10): els corrals es
numeren **1–6 dins de cada meitat**, no 1–12. Vegeu la taula de descodificació a
[`model-dades.md` §1](model-dades.md).

Extra no explicat: full `12` té un bloc solt a `Q30:R34` titulat `sala22` amb
dates i números.

---

## 4. `Pinso 24/25/26` — entregues de pinso

Capçaleres a la fila 7, dades des de la fila 8. Una fila = una entrega.

| Col | Capçalera |
|---|---|
| B | DATA |
| C | H10 |
| D | STARTER |
| E | ENTRADES |
| F | CREIXEMENT |
| G | ENGREIX |
| H | 82 |
| I | GESTACIÓ |
| J | LACTACIÓ |
| K | LLAVORES |
| L | KG (total de la fila) |
| M | IMPORT PINSO |
| N | IMPORT MEDICAMENTS |
| O | TOTAL FACTURA |
| P | Import medicament sense iva |

C–K són **tipus de pinso**, en kg. Les entregues normals fan ~27.000 kg repartits
en 2–3 tipus (camió sitja). Les de tipus `H10` són petites (~1.100–1.520 kg).

Files 1–6: totals per trimestre (1T–4T), % per tipus i totals anuals.

No hi ha **cap assignació de pinso a sala ni a banda** — només el total de granja.

---

## 5. `Porcs escorxador 24/25/26` — sortides a l'escorxador

Tres blocs en horitzontal, amb columnes lleugerament diferents segons l'any:

1. **PORCS** (engreix): `DATA`, `KG`, `KG CANAL`, `RENDIMENT` (=canal/viu),
   `UNITATS`, `PROMIG KG`, `TOTAL FACTURA`, `PREU KG`, `PREU MER`, `DIF`, i una
   columna sense capçalera (≈ € per porc)
2. **LLAVORES**: `DATA`, `KG`, `UNITATS`, `PROMIG KG`, `TOTAL FACTURA`, `PREU KG`
   ⚠️ **Malgrat estar en aquest full, NO són sortides a escorxador: són ENTRADES**
   (compra de truges de reposició que entren en producció). Vegeu G2 a la secció 8.4.
3. **TRUGES REBUIG**: `DATA`, `KG`, `KG CANAL`, `UNITATS`, `PROMIG KG`,
   `TOTAL FACTURA`, `PREU KG`, `PREU LLEIDA`

Columna A: `DECOMISOS`, amb valors com `1 D5`, `1 D4`, `2 D4`, `1 D4 2 D5`, `3 D4`.

Files 1–8: totals per trimestre i any.

Nota: les sortides surten **duplicades** aquí i als fulls numerats (per sala).
A `Porcs escorxador` és per camió/factura; als fulls numerats, desglossat per sala.

---

## 6. Volums (per dimensionar l'app)

- ~7 bandes × ~17 deslletaments/any ≈ **17 files/any** a `Cens24` (90 files en 5 anys)
- ~34 cicles d'engreix guardats simultàniament, ~6 sales cadascun
- ~65–75 entregues de pinso/any
- ~40 camions a escorxador/any + ~6 de llavores + ~10 de truges rebuig
- Sales físiques: **1–27**, subdivisibles en meitats i corrals

---

## 7. Preguntes obertes → respostes

Estat: ⬜ pendent · ✅ respost · 🔜 ajornat

Respostes donades pel pare el **2026-08-10**. Text original a
[`respostes-pare.md`](respostes-pare.md).

### A. Estructura física
- ✅ A1. Quantes granjes/emplaçaments físics hi ha?
  → **Una sola explotació.** (Però vegeu B4: la transició es fa en una granja diferent.)
- ✅ A2. Les sales 1–27 són totes d'engreix?
  → **Sí, de la 1 a la 27 són totes d'engreix.** La resta de sales no són importants.
- ✅ A3. Què són `posicio inseminar` i `posició gestació`?
  → **Sí, són ubicacions físiques.** Inseminar: `L1`–`L4`. Gestació: `Benestar esquerra`,
  `Benestar dreta` i `Automàtic mascle`.
- ✅ A4. Quants corrals té una sala? Fins a quin nivell ha d'arribar l'app?
  → **12 corrals per sala. L'app ha d'arribar a nivell de corral.** ⭐
- ✅ A5. Capacitat màxima de cada sala?
  → **132 porcs per sala** (= 11 per corral).

### B. Sistema de bandes
- ✅ B1. 7 bandes, deslletament cada 3 setmanes. → **Correcte.**
- ✅ B2. `Truges criades` (B) vs `Truges desmamades` (D)?
  → La diferència són truges que **han mort durant la lactació o van a escorxador**.
- ✅ B3. `Total` (I), `Repetidores` (J), `Primales` (K), `Plenes` (L)?
  → **Repetidores** = truges que s'introdueixen a la banda havent quedat buides en una
  banda anterior. **Primales** = truges noves. `Total`, `repetidores` i `primales`
  s'anoten **quan s'insemina**; `plenes` **quan s'ha detectat la gestació**.
- ✅ B4. `Porcs desmamats` (G) vs `Porcs engreix` (N)?
  → La diferència són **baixes de transició**. La transició es fa en **granges diferents**
  (fora d'aquesta explotació).
- ✅ B5. Columna `Identificador` (Q)? → **En desús, no s'utilitzarà.**
- ✅ B6. Valors solts a `I2:O3` / `K4`?
  → **Nombre de truges per cens a la granja** a la data indicada.
- ✅ B7. Els errors de data són errades de tecleig? → **Sí.**

### C. Cicles d'engreix (fulls numerats)
- ✅ C1. Full = un cicle d'engreix d'una banda, numeració rotativa. → **Correcte.**
- ✅ C2. Es reescriuen els cicles antics?
  → **No hauria de passar: tot ha de quedar en un històric sense sobreescriure res.** ⭐
- ✅ C3. Què són els `Nº PORCS SOBRANTS`?
  → Porcs que **canvien de sala** perquè no han crescut prou ràpid i es necessita l'espai.
- ✅ C4. `Pes` a les sortides = pes mitjà per porc del camió. → **Correcte.**
- ✅ C5. Registrar cada baixa o deduir-la per diferència?
  → **Les dues coses.** El càlcul segueix sent **per diferència** (font de veritat), però
  hi ha d'haver **l'opció** de registrar baixes manualment sense que el sistema en depengui.
- ✅ C6. Bloc solt "sala22" del full 12? → **Ignorar.** Un cicle pot tenir **fins a 6 sales**.
- ✅ C7. `Nº porc sala` sovint buit? → **S'hauria d'omplir sempre**, però hi pot haver despistes.

### D. Pinso
- ✅ D1. Tipus `H10` i `82`?
  → **`H10`** = pinso per als porcells de **parideres**. **`82`** = **finalitzadors**.
- ✅ D2. `LLAVORES` (pinso) = truges de reposició? → **No, és el pinso de les primales.**
- ✅ D3. La factura cobreix diverses entregues?
  → **Sí. Les factures són setmanals** i durant la setmana hi pot haver més d'una entrega.
- ✅ D4. El pinso s'assigna a sala/banda? → **No, només al total de la granja.**
- ✅ D5. `IMPORT MEDICAMENTS` = medicació dins el pinso?
  → **No, són medicaments entregats durant la setmana.** El registre de tractaments
  per sala/animal **no existeix però s'hauria de poder fer** → afegir-hi l'opció.

### E. Escorxador
- ✅ E1. `LLAVORES` vs `TRUGES REBUIG`?
  → **Llavores** = truges **per entrar en producció**. **Truges rebuig** = truges que
  **acaben el cicle productiu**.
- ✅ E2. `DECOMISOS` (`1 D5`, `2 D4`…)?
  → Són **porcs que no es paguen**. **`D5`** = baixes durant el **transport**.
  **`D4`** = porcs **rebutjats per l'escorxador**. El número davant = **quantitat de porcs
  d'aquell codi en aquell viatge**.
- ✅ E3. `PREU MER` = Mercolleida, `DIF` = diferència, `PREU LLEIDA` = referència truges.
  → **Correcte les tres.**
- ✅ E4. Sortides duplicades (camió vs sala)?
  → A la sala **només s'apunta el nombre de porcs de sortida**; l'app ha de posar
  **la data de càrrega i el pes mitjà** automàticament. ⭐

### F. Ús diari i abast de l'app
- ✅ F1. Qui introdueix les dades i on?
  → De moment **al despatx**, però **també hi ha d'haver l'opció de fer-ho des del mòbil**.
- ✅ F2. Què molesta més de l'Excel actual?
  → **Duplicar la informació de data de càrrega i pes mitjà** (vegeu E4).
- ✅ F3. Registre d'animals malalts?
  → **No hi ha cap control i no fa falta per l'app.** ⭐ (Canvia l'abast inicial.)
- ✅ F4. Què vol dir "alimentació" a l'app?
  → Que amb **l'històric es calculi el consum** (sobretot **gestants i parideres**) i
  surti una **notificació uns dies abans que s'acabi el pinso**. ⭐
- ✅ F5. Identificació individual de truges (cròtal)? → **Existeix però no la fan servir.**
- ✅ F6. Quant històric importar?
  → **L'any en curs** + **l'històric de pinso** (necessari per al càlcul de F4).
- ✅ F7. Altres registres fora de l'Excel?
  → **De moment no**; potser en un futur el **quadern de tractaments**.

---

## 8. Conseqüències per al model de dades i l'abast

Derivat de les respostes de la secció 7. Això és el que canvia respecte del que
assumíem:

### 8.1 Canvis d'abast importants
1. **Granularitat fins a corral** (A4/A5). No n'hi ha prou amb sala: 27 sales × 12 corrals
   = **324 corrals**, 132 porcs/sala. Els identificadors tipus `11 1-2-3-4E` de l'Excel
   passen a ser una llista de corrals reals.
2. **La salut individual surt de l'abast inicial** (F3). L'Excel no ho porta i el pare diu
   que no cal. El que sí que cal és **l'opció de registrar tractaments** (D5) i **baixes
   manuals** (C5), les dues com a *opcionals*, no obligatòries.
3. **"Alimentació" = previsió de pinso, no repartiment** (F4). La funció real és:
   calcular el consum amb l'històric (gestants i parideres sobretot) i **avisar abans que
   s'acabi**. Això és una feature de càlcul + notificació, no d'entrada de dades.
4. **Res s'esborra mai** (C2). El model ha de ser append-only / històric complet; la
   numeració rotativa de fulls de l'Excel és una limitació d'Excel, no un requisit.
5. **Eliminar la duplicació camió ↔ sala** (E4/F2). És *el* dolor principal de l'Excel i
   per tant la primera victòria visible de l'app.

### 8.2 Entitats que es dibuixen
- **Sala** (1–27, totes d'engreix) → **Corral** (12 per sala, ~11 places).
  Les meitats `E`/`D` són agrupacions de corrals, no un nivell separat.
- **Ubicacions de reproducció** a part de les sales d'engreix (A3): posicions d'inseminació
  `L1`–`L4` i de gestació (`Benestar esquerra`, `Benestar dreta`, `Automàtic mascle`).
- **Banda** (1–7) i **Deslletament** (una fila de `Cens24`, cada 3 setmanes per banda).
- **Cicle d'engreix**: banda + entrada a sales + sortides. Substitueix els fulls numerats.
- **Càrrega a escorxador** (camió/factura) amb **línies per sala/corral**. Una sola entrada:
  el camió porta data i pes mitjà, la línia de sala només porta el nombre de porcs.
- **Decomís**: línia de la càrrega amb codi (`D4` rebutjat a l'escorxador / `D5` mort al
  transport) i quantitat.
- **Entrega de pinso** (data, tipus, kg) + **Factura setmanal** que n'agrupa diverses (D3).
  El pinso és **de granja, no de sala** (D4).
- **Moviment de porcs entre sales** (els "sobrants" de C3): no és una baixa, és un trasllat.
- **Cens de truges** a una data (B6).

### 8.3 Càlculs derivats (no s'introdueixen a mà)
- `% baixes parideres`, `mitja porcs/truja`, `% plenes`, `% baixes destete`
- `edat primera/última venda` (setmanes)
- **Baixes d'engreix** = entrada − sortides − sobrants (C5)
- **Previsió d'esgotament de pinso** a partir de l'històric de consum (F4)

### 8.5 El que ha aparegut en importar de debò → respostes (2026-08-10)

- ✅ H1. **Sales amb més de 132 porcs** (146, 200, 204 el 2026).
  → **Quan els porcs són petits n'hi caben més per corralina**, i per tant n'hi
  ha més a la sala. ⭐ Les 11 places per corralina són la mesura amb els porcs
  ja grans, **no un màxim**. L'app no ha d'avisar per passar-ne a l'entrada.
- ✅ H2. Entregues de pinso amb dates impossibles (2020-08-19, 2027-08-15, i una
  del 2025 al full del 2026).
  → **Són errades de tecleig.** L'importador hi posa **l'any del full** i deixa
  el dia i el mes, i ho avisa.
- ✅ H3. Fulls numerats amb el `Nº porc sala` buit.
  → **Quan no hi ha res, se suposa que la sala anava plena: 132 porcs.**
  A més, si d'una sala en van sortir més porcs dels que hi consten d'entrada,
  l'entrada es puja fins al que va sortir: els porcs venuts hi eren per força
  (i encaixa amb H1).

### 8.4 Preguntes noves → respostes (2026-08-10)
- ✅ G1. La transició es fa en una altra granja. Què registrem?
  → **Les dues xifres**: els porcs desmamats que marxen a transició i els que **surten de
  la granja de transició cap a l'engreix**. La diferència dona les **baixes de transició**.
  (= columnes G i N de `Cens24`.)
- ✅ G2. Les `LLAVORES` del full d'escorxador?
  → ⚠️ **No són vendes, són entrades.** Les llavores són truges que **sempre entren**
  (compra de reposició), encara que estiguin apuntades al full d'escorxador.
  **Corregeix la secció 5 d'aquest document.**
- ✅ G3. Capacitat dels corrals? → **Tots iguals: 11 porcs** (12 × 11 = 132 per sala).
- ✅ G4. Previsió de pinso per sitja o per tipus?
  → **Per tipus de pinso.** Capacitats de referència: **parideres ≈ 12.000 kg**,
  **gestants ≈ 25.000 kg**.
