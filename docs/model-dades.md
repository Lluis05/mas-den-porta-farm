# Model de dades de l'app

Data: 2026-08-10. Deriva de [`excel-analisi.md`](excel-analisi.md) (§7 respostes,
§8 conseqüències). **Si canvia una resposta d'allà, cal revisar aquest document.**

Aquest document diu **quines coses guarda l'app i com es relacionen**, abans
d'escriure gens de codi. Està escrit per poder-lo llegir sense saber programar:
cada "taula" és bàsicament **una llista de fitxes totes amb els mateixos camps**
(com una pestanya d'Excel, però ben feta).

---

## 0. Tres regles que travessen tot el model

1. **Res s'esborra ni es sobreescriu mai** (resposta C2). Quan s'esmena una dada,
   es guarda el canvi, no es perd el que hi havia. A la pràctica: cada fitxa porta
   `creat_el`, `modificat_el` i `esborrat_el` (marcar com esborrat ≠ esborrar).
2. **Una dada s'escriu en un sol lloc.** Si una xifra es pot calcular, no s'escriu
   a mà. Això és el que arregla el dolor principal de l'Excel (respostes E4/F2).
3. **Offline primer.** Tota fitxa es crea al mòbil amb un identificador propi
   (UUID) perquè dos dispositius sense connexió mai xoquin, i puja al servidor
   quan hi ha cobertura.

**Convenció d'aquest document:** `entrada` = s'escriu a mà · **`calculat`** = ho fa
l'app sola · `opcional` = es pot deixar en blanc.

---

## 1. Estructura física (dades fixes, es configuren un cop)

### `sala`
Les 27 sales d'engreix (resposta A2).

| Camp | Tipus | Notes |
|---|---|---|
| `id` | UUID | |
| `numero` | 1–27 | |
| `capacitat` | 132 | = 12 corrals × 11 (A5, G3) |
| `activa` | sí/no | per si algun dia se'n tanca una |

### `corral`
**12 per sala, 11 places cadascun, tots iguals** (A4, G3). Total: 324 corrals.
És el nivell mínim al qual ha d'arribar l'app.

⚠️ La numeració **es reinicia a cada meitat**: hi ha 6 corrals a l'esquerra (1E–6E)
i 6 a la dreta (1D–6D). **No van del 1 al 12.** Per tant un corral s'identifica
sempre amb **sala + meitat + número**.

| Camp | Tipus | Notes |
|---|---|---|
| `id` | UUID | |
| `sala_id` | → `sala` | |
| `meitat` | `E` / `D` | esquerra o dreta |
| `numero` | **1–6** | dins de la seva meitat |
| `capacitat` | 11 | |

#### Com llegir els codis de sales de l'Excel (columna `P` de `Cens24`)
Amb la regla de dalt, la notació dels pares queda completament desxifrada:

| Codi | Vol dir | Corrals |
|---|---|---|
| `22` | sala sencera plena | els 12 |
| `21D` | només la meitat dreta | 1D–6D (6) |
| `11 1-2-3-4E` | corrals 1 a 4 de l'esquerra de la sala 11 | 4 |
| `15 1D` | un sol corral | 1 |
| `20 1-2-3-4-6-D` | corrals 1,2,3,4 i 6 de la dreta — **el 5 no** | 5 |
| `26 E+5-6-D` | tota l'esquerra **+** corrals 5 i 6 de la dreta, **de la mateixa sala 26** | 8 |
| `13-E+5-6D` | igual: esquerra sencera + 5D i 6D de la sala 13 | 8 |

Dues coses que se'n dedueixen i que el model ha de suportar:
1. **La selecció de corrals no és contínua** (`1-2-3-4-6`): cal poder triar-los
   solts, no per rang.
2. Els codis amb `+` **no són dues sales**, són una sala amb les dues meitats
   ocupades de manera desigual. (Corregeix el que suposàvem a `excel-analisi.md` §3.)

### `ubicacio_reproduccio`
Les posicions d'inseminació i gestació (resposta A3), que **no són sales numerades**.

| Camp | Valors |
|---|---|
| `tipus` | `inseminacio` / `gestacio` |
| `codi` | `L1`, `L2`, `L3`, `L4` / `Benestar esquerra`, `Benestar dreta`, `Automàtic mascle` |

---

## 2. El cicle reproductiu

### `banda`
Les 7 bandes (B1). Només `id` + `numero` (1–7).

### `deslletament`
**El cor del sistema.** Una fitxa = una banda deslletada = **una fila del full
`Cens24`**. Cada 3 setmanes per banda, ~17 l'any.

| Camp | Tipus | Origen a l'Excel |
|---|---|---|
| `banda_id` | → `banda` | col. A |
| `data_desmamat` | data | col. C |
| `truges_criades` | entrada | col. B |
| `truges_desmamades` | entrada | col. D |
| `porcs_vius_1a_setmana` | entrada | col. E |
| `porcs_desmamats` | entrada | col. G |
| `posicio_inseminar_id` | → `ubicacio_reproduccio` | col. X |
| `posicio_gestacio_id` | → `ubicacio_reproduccio` | col. Y |
| `observacions` | text, opcional | col. W (vacunes: `vac pyrss`, `draxin`…) |
| **`pct_baixes_parideres`** | **calculat** `(vius1a − desmamats) / vius1a` | col. F |
| **`mitjana_porcs_truja`** | **calculat** `desmamats / criades` | col. H |

**S'omple en dos moments diferents** (resposta B3), per això aquests camps van a part
i es poden deixar buits al principi:

| Camp | Quan s'omple |
|---|---|
| `data_inseminacio` | en inseminar |
| `insem_total` | en inseminar (col. I) |
| `repetidores` | en inseminar (col. J) — truges que van quedar buides en una banda anterior |
| `primales` | en inseminar (col. K) — truges noves |
| `plenes` | **més tard**, quan es detecta la gestació (col. L) |
| **`pct_plenes`** | **calculat** `plenes / insem_total` (col. M) |

### `cens_truges`
Recompte de truges a la granja en una data (resposta B6). `data` + `num_truges`.

### `entrada_llavores`
⚠️ Truges de reposició que **entren** a la granja. A l'Excel estan al full
*Porcs escorxador*, però **són compres, no vendes** (resposta G2).

`data`, `unitats`, `kg`, `promig_kg` (**calculat**), `total_factura`, `preu_kg`.

---

## 3. Transició i engreix

### `transicio`
La transició es fa **en una altra granja** (respostes B4, G1). No en controlem
l'interior; només les dues xifres que permeten deduir-ne les baixes.

| Camp | Notes |
|---|---|
| `deslletament_id` | → `deslletament` |
| `porcs_sortida` | = `porcs_desmamats`, els que marxen d'aquí |
| `porcs_retorn` | els que surten de la granja de transició cap a engreix (col. N) |
| **`baixes_transicio`** | **calculat** `porcs_sortida − porcs_retorn` |
| **`pct_baixes`** | **calculat** (col. O) |

### `cicle_engreix`
Substitueix els **fulls numerats 0–33**. Un cicle = una banda que entra a engreix.
A diferència de l'Excel, **no es reutilitza mai un número: l'històric és complet** (C2).

| Camp | Notes |
|---|---|
| `banda_id`, `deslletament_id` | d'on ve |
| `data_entrada` | col. R |
| `porcs_entrada` | = `porcs_retorn` de la transició |
| `porcs_sobrants` | porcs que no han crescut prou i es traslladen (C3) |
| **`data_primera_venda`** | **calculat**: primera càrrega d'aquest cicle (col. S) |
| **`data_ultima_sortida`** | **calculat**: última càrrega (col. U) |
| **`edat_primera_venda`** | **calculat** `9 + (data_1a_venda − data_entrada)/7` setmanes |
| **`edat_ultima_venda`** | **calculat**, igual |
| **`baixes`** | **calculat** `entrada − sortides − sobrants` ⭐ (C5) |
| **`pct_baixes`** | **calculat** `baixes / (entrada − sobrants)` |

### `ocupacio_corral`
On és cada cicle. Substitueix la columna `P` de text (`26 E+5-6-D`) i els 6 blocs
de sala dels fulls numerats.

`cicle_id`, `corral_id`, `data_entrada`, `porcs_entrada`, `data_sortida` (opcional).

#### Com s'introdueix (decidit 2026-08-10)
Els porcs **no es reparteixen sempre per tota la sala**, així que el nombre no es
pot donar per suposat. Però tampoc cal teclejar 12 números per sala. El compromís:

1. **Es tria la sala** i s'escriu **quants porcs hi entren** (com el `Nº porc sala`
   de l'Excel — una sola xifra).
2. **Es toquen els corrals ocupats** en una graella de 6 esquerra + 6 dreta.
   Res de teclejar números de corral: es marquen.
3. L'app **reparteix la xifra entre els corrals marcats** i ho desa a nivell de
   corral. Si algun corral va diferent de la resta, es pot ajustar a mà; per
   defecte no cal.

Així s'escriu el mateix que ara a l'Excel, però la informació queda guardada amb
detall de corral en comptes d'un text tipus `20 1-2-3-4-6-D` que després ningú pot
calcular.

### `moviment`
Trasllats de porcs entre corrals — els "sobrants" de C3. **No és una baixa.**

`data`, `corral_origen_id`, `corral_desti_id`, `num_porcs`, `motiu`.

### `baixa` *(opcional)*
Registre manual de morts (resposta C5). **No és la font de veritat** — el número bo
segueix sent el calculat per diferència al `cicle_engreix`. Serveix per tenir-ne
detall quan algú el vulgui apuntar.

`data`, `corral_id`, `num_porcs`, `motiu` (opcional).

---

## 4. Sortides a escorxador

Aquí és on l'app **elimina la feina duplicada** (E4, F2). A l'Excel la mateixa
sortida s'apunta dos cops: per camió al full *Porcs escorxador* i per sala al full
numerat. A l'app és **una sola entrada dividida en dues taules**.

### `carrega_escorxador` — el camió / la factura
S'introdueix **un cop**, normalment al despatx.

| Camp | Notes |
|---|---|
| `data_carrega` | |
| `tipus` | `porcs_engreix` / `truges_rebuig` |
| `unitats` | nombre de porcs del camió |
| `kg`, `kg_canal` | |
| **`rendiment`** | **calculat** `kg_canal / kg` |
| **`promig_kg`** | **calculat** `kg / unitats` ← el "pes mitjà" |
| `total_factura`, `preu_kg` | |
| `preu_referencia` | Mercolleida (porcs) o preu Lleida (truges) — resposta E3 |
| **`diferencia`** | **calculat** `preu_kg − preu_referencia` |

### `linia_carrega` — el desglossament per corral
A la nau **només s'apunta quants porcs surten de cada corral**. La data i el pes
mitjà els posa l'app des de la `carrega_escorxador` (resposta E4).

`carrega_id`, `corral_id`, `num_porcs`. I prou.

### `decomis`
Porcs que no es cobren (resposta E2).

`carrega_id`, `codi` (`D4` = rebutjat per l'escorxador · `D5` = mort al transport),
`num_porcs`.

---

## 5. Pinso

### `tipus_pinso`
Els 9 tipus de les columnes C–K del full *Pinso*.

| Codi | Què és | Capacitat sitja |
|---|---|---|
| `H10` | porcells de parideres (D1) | |
| `STARTER` | | |
| `ENTRADES` | | |
| `CREIXEMENT` | | |
| `ENGREIX` | | |
| `82` | finalitzadors (D1) | |
| `GESTACIO` | | **~25.000 kg** (G4) |
| `LACTACIO` | parideres | **~12.000 kg** (G4) |
| `LLAVORES` | pinso de les **primales** (D2) | |

### `entrega_pinso`
Una fila = una entrega (camió sitja). **Es guarda al total de granja, no per sala**
(resposta D4).

`data`, `tipus_pinso_id`, `kg`, `factura_id` (opcional).

> Nota: a l'Excel una fila barreja 2–3 tipus en columnes diferents. Aquí es
> desglossa: una entrega de 27.000 kg en 3 tipus = 3 fitxes.

### `factura_pinso`
**Les factures són setmanals i agrupen diverses entregues** (resposta D3). Per això
va separat de l'entrega — és el que a l'Excel deixava files amb import 0.

`data`/`setmana`, `import_pinso`, `import_medicaments`,
`import_medicaments_sense_iva`, **`total_factura`** (calculat).

### `tractament` *(opcional)*
No existeix a l'Excel; el pare vol l'opció de registrar-ho (resposta D5). Encaixa
amb el "quadern de tractaments" que potser caldrà en un futur (F7).

`data`, `sala_id` o `corral_id`, `producte`, `dosi` (opcional), `motiu` (opcional).

---

## 6. Previsió de pinso (la feature de "alimentació")

Resposta F4: calcular amb l'històric i **avisar uns dies abans que s'acabi**.
Es fa **per tipus de pinso** (G4).

Com que **el consum real no es mesura** (només es coneixen les entregues), el
càlcul és una estimació honesta a partir del ritme d'entregues:

1. Ritme de consum = kg entregats d'aquell tipus ÷ dies del període (històric
   d'un any; per això s'importa tot l'històric de pinso — resposta F6).
2. Estoc estimat = kg de l'última entrega − (ritme × dies transcorreguts).
3. Dies restants = estoc estimat ÷ ritme.
4. **Notificació** quan `dies restants < llindar` (configurable, p. ex. 5 dies).

Prioritat als tipus **`GESTACIO`** i **`LACTACIO`**, que són els que preocupen
(F4) i els que tenen sitja gran i cens estable, o sigui els més previsibles.

> ⬜ **Pendent de validar amb el pare**: aquesta estimació serveix, o cal poder
> apuntar el nivell real de la sitja de tant en tant per corregir-la?

---

## 7. Què s'importa de l'Excel

Abast acordat (resposta F6): **any en curs + tot l'històric de pinso**.

| Full de l'Excel | On va |
|---|---|
| `Cens24` (files del 2026) | `deslletament` + `transicio` |
| `Cens24` col. P + fulls numerats actius | `cicle_engreix` + `ocupacio_corral` |
| Fulls numerats: taules de sortides | `carrega_escorxador` + `linia_carrega` |
| `Pinso 24/25/26` **sencers** | `entrega_pinso` + `factura_pinso` |
| `Porcs escorxador 26`, blocs PORCS i TRUGES REBUIG | `carrega_escorxador` |
| `Porcs escorxador 26`, bloc LLAVORES | `entrada_llavores` ⚠️ (són entrades) |
| `Porcs escorxador 26`, col. DECOMISOS | `decomis` |
| `Cens24` col. Q (`Identificador`) | ❌ no s'importa (en desús, B5) |
| `Hoja2`, bloc "sala22" del full 12 | ❌ no s'importa (C6) |

**Durant la importació cal corregir** les errades ja detectades (secció 2 de
`excel-analisi.md`): dates mal escrites (`C81`, `C83`), sales que Excel va
convertir en dates (`P40`, `P48`, `P53`, `P76`, `P81`), fórmules `#REF!` i els
negatius de `T`/`V`. El script d'importació ha de **llistar** el que no entengui
en comptes d'inventar-s'ho.

---

## 8. Resum visual

```
banda (1-7)
  └── deslletament ──── transicio (altra granja) ──── cicle_engreix
        · truges              · baixes                      │
        · porcells            · deduïdes                    ├── ocupacio_corral ──> corral ──> sala
        · inseminació                                       ├── moviment (sobrants)
                                                            ├── baixa (opcional)
                                                            └── linia_carrega ──> carrega_escorxador
                                                                                       └── decomis
granja (global, sense sala)
  ├── entrega_pinso ──> factura_pinso   ──> previsió + avís
  ├── cens_truges
  ├── entrada_llavores
  └── tractament (opcional)
```

---

## 9. Pendents abans de programar

- ✅ Numeració dels corrals: **1–6 a cada meitat** (secció 1). Resolt 2026-08-10.
- ✅ Magatzem local: **Expo SQLite**. Decidit 2026-08-10 — SQL normal i corrent, es
  pot llegir i entendre, i la sincronització amb Supabase la fem nosaltres.
- ⬜ La previsió de pinso per ritme d'entregues és prou bona, o cal apuntar nivell
  de sitja de tant en tant (secció 6)?
