/**
 * Llegeix l'Excel dels pares i en treu un fitxer JSON que l'app pot carregar.
 *
 *   npm run importar
 *   npm run importar -- "/ruta/a/un/altre.xlsm"
 *
 * No toca l'Excel: només el llegeix. El resultat va a assets/import/granja.json.
 *
 * Abast acordat (resposta F6): l'any en curs + TOT l'històric de pinso, que és
 * el que fa falta per calcular la previsió.
 *
 * El que no entengui NO se l'inventa: ho apunta a `avisos` i ho deixa fora.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import XLSX from 'xlsx';

const AQUI = dirname(fileURLToPath(import.meta.url));
const ARREL = resolve(AQUI, '..');
const ORIGEN = process.argv[2] ?? `${process.env.HOME}/Documents/estat granja.xlsm`;
const DESTI = resolve(ARREL, 'assets/import/granja.json');

/** Any en curs a importar (tot el pinso s'importa igualment). */
const ANY = 2026;

const avisos = [];
const avisa = (msg) => avisos.push(msg);

// ---------------------------------------------------------------------------
// Utilitats
// ---------------------------------------------------------------------------

const llibre = XLSX.readFile(ORIGEN, { cellDates: true });

const full = (nom) =>
  llibre.Sheets[nom]
    ? XLSX.utils.sheet_to_json(llibre.Sheets[nom], {
        header: 1,
        raw: true,
        defval: null,
      })
    : null;

/**
 * Data d'Excel -> "2026-08-10". Torna null si no és una data raonable.
 *
 * SheetJS (amb cellDates: true) construeix el Date fent servir els
 * mètodes LOCALS de la màquina que llegeix el fitxer (equivalent a
 * `new Date(any, mes, dia, ...)`, no `Date.UTC(...)`). Per tant s'ha de
 * llegir amb els getters locals (getFullYear/getMonth/getDate), no els
 * UTC: usar els UTC va fer que, en una màquina per davant de UTC (com
 * Espanya), tota data quedés un dia enrere (p.ex. Cens24 fila 8, banda 1,
 * és "9/24/21" a l'Excel i es guardava "2021-09-23"). Descobert 2026-08-22.
 */
function data(v) {
  if (!(v instanceof Date) || Number.isNaN(v.getTime())) return null;
  const any = v.getFullYear();
  if (any < 2015 || any > 2100) return null;
  const m = String(v.getMonth() + 1).padStart(2, '0');
  const d = String(v.getDate()).padStart(2, '0');
  return `${any}-${m}-${d}`;
}

/** Número o null. Descarta els #REF! i els textos. */
function num(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

const enter = (v) => {
  const n = num(v);
  return n == null ? null : Math.round(n);
};

// ---------------------------------------------------------------------------
// Pinso: totes les fulles, tots els anys
// ---------------------------------------------------------------------------

/** Ordre de les columnes de tipus de pinso a les fulles "Pinso NN". */
const TIPUS_PINSO = [
  'H10',
  'STARTER',
  'ENTRADES',
  'CREIXEMENT',
  'ENGREIX',
  '82',
  'GESTACIO',
  'LACTACIO',
  'LLAVORES',
];

function importaPinso() {
  const entregues = [];
  const factures = [];

  for (const nom of ['Pinso 24', 'Pinso 25', 'Pinso 26']) {
    const f = full(nom);
    if (!f) {
      avisa(`No hi ha el full "${nom}".`);
      continue;
    }
    // El full "Pinso 24" hauria de contenir dates del 2024. Quan no és així,
    // gairebé sempre és una errada de tecleig, i una data equivocada espatlla
    // la previsió de pinso. No la canviem: l'avisem.
    const anyDelFull = 2000 + Number(nom.slice(-2));

    // Capçaleres a la fila 7 (índex 6), dades a partir de la 8.
    // El rang comença a la columna B, així que l'índex 0 és DATA.
    let pendents = [];

    for (const fila of f.slice(7)) {
      if (!fila) continue;
      const dia = data(fila[0]);
      if (!dia) continue;

      // Una entrega en un full que no és del seu any és una errada de tecleig
      // (resposta H2). Es corregeix l'any i es deixa la resta de la data:
      // el full és més fiable que el número tecleat.
      let diaBo = dia;
      const anyFila = Number(dia.slice(0, 4));
      if (anyFila !== anyDelFull) {
        diaBo = `${anyDelFull}${dia.slice(4)}`;
        avisa(
          `${nom}: entrega amb data ${dia} (${num(fila[10]) ?? '?'} kg) en un full del ${anyDelFull}. Corregida a ${diaBo}.`
        );
      }

      const desglossat = [];
      TIPUS_PINSO.forEach((codi, i) => {
        const kg = num(fila[1 + i]);
        if (kg != null && kg > 0) desglossat.push({ codi, kg });
      });

      for (const d of desglossat) {
        const entrega = { data: diaBo, tipus: d.codi, kg: d.kg };
        entregues.push(entrega);
        pendents.push(entrega);
      }

      if (desglossat.length === 0 && num(fila[10]) > 0) {
        avisa(`${nom}: fila del ${diaBo} amb ${fila[10]} kg però sense tipus de pinso.`);
      }

      // Les factures són setmanals i cobreixen les entregues anteriors
      // (resposta D3). La fila que porta import tanca el grup.
      const importPinso = num(fila[11]);
      if (importPinso != null && importPinso > 0) {
        const factura = {
          data: diaBo,
          importPinso,
          importMedicaments: num(fila[12]),
          importMedicamentsSenseIva: num(fila[14]),
          entregues: pendents.length,
        };
        factures.push(factura);
        for (const e of pendents) e.factura = factures.length - 1;
        pendents = [];
      }
    }

    if (pendents.length > 0) {
      avisa(
        `${nom}: ${pendents.length} entregues al final sense cap factura que les tanqui.`
      );
    }
  }

  return { entregues, factures };
}

// ---------------------------------------------------------------------------
// Cens24: deslletaments de l'any en curs
// ---------------------------------------------------------------------------

/** Els números de sala que hi ha dins d'un text com "12-13-10-8-14" o "2 3 7". */
function salesDelText(text) {
  if (text == null) return [];
  return [...String(text).matchAll(/\d{1,2}/g)]
    .map((m) => Number(m[0]))
    .filter((n) => n >= 1 && n <= 27);
}

function importaCens() {
  const f = full('Cens24');
  if (!f) {
    avisa('No hi ha el full "Cens24".');
    return { deslletaments: [], perLligar: [] };
  }

  const deslletaments = [];
  /** Totes les files amb data d'entrada, de qualsevol any: només per lligar-hi els cicles. */
  const perLligar = [];

  for (const fila of f.slice(7)) {
    if (!fila) continue;
    const bandaFila = enter(fila[0]);
    const entradaFila = data(fila[17]);
    const dataDesmamat = data(fila[2]);
    if (bandaFila != null && entradaFila) {
      perLligar.push({
        banda: bandaFila,
        dataEntrada: entradaFila,
        // Per poder lligar el cicle a la fila exacta de Cens24 d'on ve,
        // no només a la banda (resposta pendent, veure trobaBanda).
        dataDesmamat,
        sales: salesDelText(fila[15]),
      });
    }

    if (!dataDesmamat || !dataDesmamat.startsWith(String(ANY))) continue;

    const banda = bandaFila;
    if (banda == null || banda < 1 || banda > 7) {
      avisa(`Cens24: fila del ${dataDesmamat} amb banda "${fila[0]}", no s'importa.`);
      continue;
    }

    deslletaments.push({
      banda,
      dataDesmamat,
      trugesCriades: enter(fila[1]),
      trugesDesmamades: enter(fila[3]),
      porcsVius1aSetmana: enter(fila[4]),
      porcsDesmamats: enter(fila[6]),
      insemTotal: enter(fila[8]),
      repetidores: enter(fila[9]),
      primales: enter(fila[10]),
      plenes: enter(fila[11]),
      porcsEngreix: enter(fila[13]),
      observacions: typeof fila[22] === 'string' ? fila[22].trim() : null,
      posicioInseminar: typeof fila[23] === 'string' ? fila[23].trim() : null,
      posicioGestacio: typeof fila[24] === 'string' ? fila[24].trim() : null,
      // Per lligar-hi el cicle d'engreix
      dataEntrada: data(fila[17]),
      salesText: fila[15] == null ? null : String(fila[15]).trim(),
    });
  }

  return { deslletaments, perLligar };
}

/**
 * Lliga un full numerat amb la seva banda I amb la fila exacta de `Cens24`
 * d'on ve (per poder desar cicle_engreix.deslletament_id): els fulls no
 * diuen de quina banda són, així que es busca la fila de `Cens24` amb la
 * data d'entrada més propera i que comparteixi sales. Si cap encaixa prou,
 * val més no importar el cicle que endevinar-ne la banda.
 */
function trobaBanda(cicle, perLligar) {
  const salesCicle = new Set(
    cicle.sales.map((s) => analitzaSala(s.codi)).filter((n) => n != null)
  );

  let millor = null;
  for (const fila of perLligar) {
    const dies =
      Math.abs(Date.parse(fila.dataEntrada) - Date.parse(cicle.dataEntrada)) /
      86400000;
    if (dies > 30) continue;
    const comunes = fila.sales.filter((n) => salesCicle.has(n)).length;
    if (comunes === 0) continue;
    // Primer com més sales compartides, i a igualtat, com més a prop la data.
    const punts = comunes * 100 - dies;
    if (!millor || punts > millor.punts) millor = { ...fila, punts, dies, comunes };
  }

  if (!millor) {
    avisa(
      `Full "${cicle.full}" (entrada ${cicle.dataEntrada}): no s'ha trobat la banda a Cens24. El cicle no s'importa.`
    );
    return null;
  }
  if (millor.dies > 0) {
    avisa(
      `Full "${cicle.full}": lligat a la banda ${millor.banda} amb ${millor.dies.toFixed(0)} dies de diferència a la data d'entrada.`
    );
  }
  return { banda: millor.banda, dataDesmamat: millor.dataDesmamat ?? null };
}

/** Només el número de sala d'un codi, per comparar. */
function analitzaSala(codi) {
  const m = /^(\d{1,2})/.exec(String(codi).trim());
  const n = m ? Number(m[1]) : null;
  return n != null && n >= 1 && n <= 27 ? n : null;
}

// ---------------------------------------------------------------------------
// Fulls numerats: cicles d'engreix, sala per sala
// ---------------------------------------------------------------------------

/** Cada full numerat té fins a 6 blocs de sala, de 5 columnes, a partir de B. */
const BLOCS = 6;
/** Porcs que se suposen quan el "Nº porc sala" és buit (resposta H3). */
const SALA_PLENA = 132;
const AMPLADA = 5;
const PRIMERA = 1;

function importaCicles() {
  const cicles = [];

  for (let n = 0; n <= 33; n++) {
    const f = full(String(n));
    if (!f) continue;

    const sales = [];

    for (let b = 0; b < BLOCS; b++) {
      const c = PRIMERA + b * AMPLADA;

      const codiSala = f[1]?.[c + 2];
      const dataEntrada = data(f[4]?.[c + 1]);
      const porcs = enter(f[5]?.[c + 1]);
      if (codiSala == null || dataEntrada == null) continue;

      // Sortides: files 10-19 (índexs 9-18), capçalera a la 9.
      const sortides = [];
      for (let r = 9; r <= 18; r++) {
        const dia = data(f[r]?.[c + 1]);
        const quants = enter(f[r]?.[c + 2]);
        const pes = num(f[r]?.[c + 3]);
        if (dia && quants != null && quants > 0) {
          sortides.push({ data: dia, porcs: quants, pes });
        }
      }

      // Quan el "Nº porc sala" és buit, es dona per fet que la sala anava
      // plena: 132 porcs (resposta H3).
      let porcsBons = porcs ?? SALA_PLENA;
      if (porcs == null) {
        avisa(
          `Full "${n}", sala ${codiSala}: falta el "Nº porc sala". S'hi posen ${SALA_PLENA} porcs (sala plena).`
        );
      }

      // Si d'una sala n'han sortit més porcs dels que hi consta que van entrar,
      // el número d'entrada es queda curt: els porcs venuts hi eren per força.
      // Passa perquè quan són petits n'hi caben més de 132 (resposta H1).
      const totalSortides = sortides.reduce((t, x) => t + x.porcs, 0);
      if (totalSortides > porcsBons) {
        avisa(
          `Full "${n}", sala ${codiSala}: hi consten ${porcsBons} porcs d'entrada però en van sortir ${totalSortides}. S'hi posen ${totalSortides}.`
        );
        porcsBons = totalSortides;
      }

      sales.push({
        codi: String(codiSala).trim(),
        dataEntrada,
        porcs: porcsBons,
        suposat: porcs == null,
        sortides,
      });
    }

    if (sales.length === 0) continue;

    // Ens interessen els cicles ACTIUS durant l'any, no només els que hi
    // comencen: un cicle que va entrar el novembre passat encara treu porcs
    // aquest any, i sense ell els camions de gener no quadrarien amb cap sala.
    const totesLesDates = [
      ...sales.map((s) => s.dataEntrada),
      ...sales.flatMap((s) => s.sortides.map((x) => x.data)),
    ];
    if (!totesLesDates.some((d) => d.startsWith(String(ANY)))) continue;

    const primera = sales.map((s) => s.dataEntrada).sort()[0];

    // Els fulls numerats es reciclen (resposta C2), i els més antics poden tenir
    // dades a mitges: sortides d'un cicle i entrades ja sobreescrites. Si tot i
    // suposar les sales plenes en surten més dels que hi han entrat, el full ja
    // no és de fiar i val més deixar-lo fora que omplir l'app de números falsos.
    const entren = sales.reduce((t, s) => t + (s.porcs ?? 0), 0);
    const surten = sales.reduce(
      (t, s) => t + s.sortides.reduce((u, x) => u + x.porcs, 0),
      0
    );
    if (entren === 0 || surten > entren) {
      avisa(
        `Full "${n}" (entrada ${primera}): hi entren ${entren} porcs i en surten ${surten}. El full està sobreescrit a mitges; el cicle no s'importa.`
      );
      continue;
    }

    cicles.push({ full: String(n), dataEntrada: primera, sales });
  }

  return cicles;
}

// ---------------------------------------------------------------------------
// Porcs escorxador: camions, decomisos i entrades de llavores
// ---------------------------------------------------------------------------

function importaEscorxador() {
  const carregues = [];
  const llavores = [];

  // Llegim també l'any anterior: un cicle que ve del desembre encara té
  // sortides apuntades allà, i sense el camió ens l'inventaríem.
  for (const any of [ANY - 1, ANY]) {
  const f = full(`Porcs escorxador ${String(any).slice(2)}`);
  if (!f) {
    if (any === ANY) avisa(`No hi ha el full "Porcs escorxador ${String(ANY).slice(2)}".`);
    continue;
  }

  for (const fila of f.slice(9)) {
    if (!fila) continue;

    // Bloc 1: porcs d'engreix
    const dataPorcs = data(fila[1]);
    if (dataPorcs) {
      carregues.push({
        any,
        data: dataPorcs,
        tipus: 'porcs_engreix',
        kg: num(fila[2]),
        kgCanal: num(fila[3]),
        unitats: enter(fila[5]),
        totalFactura: num(fila[7]),
        preuKg: num(fila[8]),
        preuReferencia: num(fila[9]),
        decomisos: analitzaDecomisos(fila[0]),
      });
    }

    // Bloc 2: llavores. Malgrat el full, són ENTRADES (resposta G2).
    const dataLlavores = data(fila[12]);
    if (dataLlavores) {
      llavores.push({
        any,
        data: dataLlavores,
        kg: num(fila[13]),
        unitats: enter(fila[14]),
        totalFactura: num(fila[16]),
        preuKg: num(fila[17]),
      });
    }

    // Bloc 3: truges de rebuig
    const dataTruges = data(fila[19]);
    if (dataTruges) {
      carregues.push({
        any,
        data: dataTruges,
        tipus: 'truges_rebuig',
        kg: num(fila[20]),
        kgCanal: num(fila[21]),
        unitats: enter(fila[22]),
        totalFactura: num(fila[24]),
        preuKg: num(fila[25]),
        preuReferencia: num(fila[26]),
        decomisos: [],
      });
    }
  }
  }

  return { carregues, llavores };
}

/** "1 D5", "2 D4", "1 D4 2 D5" -> [{codi, numPorcs}] (resposta E2). */
function analitzaDecomisos(text) {
  if (typeof text !== 'string') return [];
  const trobats = [...text.toUpperCase().matchAll(/(\d+)\s*(D4|D5)/g)];
  if (trobats.length === 0 && text.trim() !== '') {
    avisa(`Decomís que no s'entén: "${text}".`);
    return [];
  }
  return trobats.map((m) => ({ codi: m[2], numPorcs: Number(m[1]) }));
}

// ---------------------------------------------------------------------------

const pinso = importaPinso();
const { deslletaments, perLligar } = importaCens();
const carregues = [];
const cicles = importaCicles()
  .map((c) => {
    const trobat = trobaBanda(c, perLligar);
    return trobat
      ? { ...c, banda: trobat.banda, deslletamentData: trobat.dataDesmamat }
      : { ...c, banda: null, deslletamentData: null };
  })
  .filter((c) => c.banda != null);

const escorxador = importaEscorxador();
carregues.push(...escorxador.carregues);
// Les llavores són entrades de truges: només les de l'any en curs.
const llavores = escorxador.llavores.filter((l) => l.any === ANY);

/**
 * Les sortides apuntades als fulls numerats són les MATEIXES que les del full
 * d'escorxador, apuntades dos cops (el problema que l'app arregla). Aquí es
 * tornen a ajuntar: el camió posa la data i el pes, la sala només el nombre.
 */
function lligaSortides() {
  const perData = new Map();
  for (const c of carregues) {
    if (c.tipus !== 'porcs_engreix') continue;
    if (!perData.has(c.data)) perData.set(c.data, c);
  }

  let lligades = 0;
  let orfes = 0;

  for (const cicle of cicles) {
    for (const sala of cicle.sales) {
      for (const sortida of sala.sortides) {
        const carrega = perData.get(sortida.data);
        if (!carrega) {
          // La sortida existeix al full de la sala però no hi ha cap camió
          // aquell dia: creem la càrrega amb el que sabem.
          const nova = {
            data: sortida.data,
            tipus: 'porcs_engreix',
            kg: null,
            kgCanal: null,
            unitats: null,
            totalFactura: null,
            preuKg: null,
            preuReferencia: null,
            decomisos: [],
            linies: [],
            nomesDeSala: true,
          };
          carregues.push(nova);
          perData.set(sortida.data, nova);
          orfes++;
          nova.linies.push({ codi: sala.codi, porcs: sortida.porcs });
          continue;
        }
        carrega.linies ??= [];
        carrega.linies.push({ codi: sala.codi, porcs: sortida.porcs });
        lligades++;
      }
    }
  }

  if (orfes > 0) {
    avisa(
      `${orfes} sortides apuntades a un full de sala sense cap camió aquell dia al full d'escorxador. S'han creat com a càrregues sense dades de factura.`
    );
  }
  return lligades;
}

const sortidesLligades = lligaSortides();

// Els camions de l'any anterior només interessen si alguna sala hi va portar
// porcs; la resta són de l'any passat i no toquen.
for (let i = carregues.length - 1; i >= 0; i--) {
  const c = carregues[i];
  if (c.any === ANY - 1 && (!c.linies || c.linies.length === 0)) carregues.splice(i, 1);
}

const dades = {
  generat: new Date().toISOString(),
  origen: ORIGEN,
  any: ANY,
  pinso,
  deslletaments,
  cicles,
  carregues,
  llavores,
  avisos,
};

mkdirSync(dirname(DESTI), { recursive: true });
writeFileSync(DESTI, JSON.stringify(dades, null, 2));

console.log(`Llegit: ${ORIGEN}`);
console.log(`Escrit: ${DESTI}\n`);
console.log(`  entregues de pinso : ${pinso.entregues.length}`);
console.log(`  factures de pinso  : ${pinso.factures.length}`);
console.log(`  deslletaments ${ANY} : ${deslletaments.length}`);
console.log(`  cicles d'engreix   : ${cicles.length}`);
console.log(`  càrregues          : ${carregues.length}`);
console.log(`  sortides per sala  : ${sortidesLligades} lligades al seu camió`);
console.log(`  entrades llavores  : ${llavores.length}`);
if (avisos.length > 0) {
  console.log(`\n  ${avisos.length} avisos:`);
  for (const a of avisos) console.log(`   · ${a}`);
}
