/**
 * Lectura d'un albarà de pinso a partir del text que en treu l'OCR.
 *
 * Tot aquest fitxer és lògica pura: entren paraules amb la seva posició dins
 * la foto i en surt un albarà estructurat. No toca ni la base de dades ni cap
 * mòdul natiu, així que es pot provar amb `node scripts/prova-albara.mjs`.
 *
 * Per què cal la posició i no només el text
 * ----------------------------------------
 * L'albarà és una taula. Un número tot sol no diu res: segons la columna on
 * cau és quilos, preu o import. Per això `recognizeText()` ens dóna la caixa
 * de cada paraula i aquí la fem servir per reconstruir files i columnes.
 *
 * Què NO podem donar per fet (comprovat amb una foto real, `docs/pinso-example.jpeg`):
 *  - Les capçaleres ("Quantitat", "Article/Lot") sovint no es llegeixen: el
 *    paper és fluix i la foto surt cremada. No podem localitzar la columna
 *    pel títol.
 *  - La fila "Totals" tampoc s'hi veu sempre. Serveix per comprovar, no per
 *    calcular.
 *  - Un número es parteix en dos trossos ("9.000," + "00"), i els dos trossos
 *    poden tenir la y una mica diferent perquè el paper està arrugat.
 */

export type Caixa = { x: number; y: number; width: number; height: number };

/** Una paraula solta tal com surt de l'OCR, amb on cau dins la foto. */
export type ParaulaOCR = { text: string; caixa: Caixa };

export type LiniaAlbara = {
  /** Codi d'article del proveïdor: `PTCGD`, `PPDGD`… No és el nostre codi. */
  codiArticle: string;
  /** Quilos llegits, o null si a la fila no hi hem sabut trobar la quantitat. */
  kg: number | null;
  /** El que hi hagi entre el codi i la quantitat (sitja, lot). Informatiu. */
  lot: string | null;
  /**
   * `true` si sota d'aquesta línia hi diu "Complement medicamentós" o hi ha
   * una prescripció. Alguns pinsos venen amb medicació inclosa per recepta
   * veterinària, imprès just sota la línia de l'article, no com una línia
   * pròpia amb el seu propi codi.
   */
  medicat: boolean;
  /** El codi de la prescripció ("P-25-B425-703-2026"), si s'ha llegit. */
  prescripcio: string | null;
};

export type AlbaraLlegit = {
  numero: string | null;
  /** ISO `YYYY-MM-DD`, com tota la resta de dates de l'app. */
  data: string | null;
  linies: LiniaAlbara[];
  /** El total imprès a l'albarà, si s'ha pogut llegir. */
  total: number | null;
  /**
   * `true` només si hem llegit el total I coincideix amb la suma de les
   * línies. És el senyal de confiança que ensenyem a la pantalla; si és
   * `false` no vol dir que estigui malament, només que no ho hem pogut
   * comprovar.
   */
  quadra: boolean;
};

/** Un article del proveïdor: lletres majúscules, de vegades amb xifres. */
const CODI_ARTICLE = /^[A-Z][A-Z0-9]{2,9}$/;
const DATA_DMA = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/;
const MEDICAMENT = /MEDICAMENT/i;
const PRESCRIPCIO = /PRESCRIPCI/i;

/**
 * Quilos que ens creiem d'una línia d'albarà. Un camió de pinso porta entre
 * un parell de tones i dotze; fora d'aquest marge quasi segur que hem agafat
 * el número d'una altra columna (un preu, un lot, un número de comanda).
 */
const KG_MIN = 100;
const KG_MAX = 40000;

/**
 * Passa "9.000,00" → 9000. Format d'aquí: el punt separa milers i la coma
 * decimals. Retorna null si no sembla un número.
 */
export function llegeixNumero(text: string): number | null {
  // Estricte a posta. Si només tragués les xifres, "07-08-2026" passaria a ser
  // 7.082.026 i la matrícula "R4952BDM" a ser 4.952, i totes dues han acabat
  // fent-se passar per una línia d'albarà en una foto real.
  const net = text
    .trim()
    .replace(/^(?:kg|KG|Kg)\s*/, '')
    .replace(/\s*(?:kg|KG|Kg)\.?$/, '');
  if (!/^\d[\d.,]*$/.test(net)) return null;

  const teComa = net.includes(',');
  const tePunt = net.includes('.');

  let normalitzat: string;
  if (teComa && tePunt) {
    // Els dos: l'últim que aparegui és el decimal.
    normalitzat =
      net.lastIndexOf(',') > net.lastIndexOf('.')
        ? net.replace(/\./g, '').replace(',', '.')
        : net.replace(/,/g, '');
  } else if (teComa) {
    const darrer = net.split(',').pop() ?? '';
    // "9,000" amb tres xifres al darrere són milers; "9,5" és decimal.
    normalitzat =
      darrer.length === 3 && net.split(',').length > 1 && !/^0/.test(darrer)
        ? net.replace(/,/g, '')
        : net.replace(',', '.');
  } else if (tePunt) {
    const trossos = net.split('.');
    const darrer = trossos[trossos.length - 1];
    normalitzat =
      trossos.length > 1 && darrer.length === 3 ? trossos.join('') : net;
  } else {
    normalitzat = net;
  }

  const n = Number(normalitzat);
  return Number.isFinite(n) ? n : null;
}

function centreY(c: Caixa): number {
  return c.y + c.height / 2;
}

function dreta(c: Caixa): number {
  return c.x + c.width;
}

function mediana(valors: number[]): number {
  if (valors.length === 0) return 0;
  const ordenats = [...valors].sort((a, b) => a - b);
  const mig = Math.floor(ordenats.length / 2);
  return ordenats.length % 2
    ? ordenats[mig]
    : (ordenats[mig - 1] + ordenats[mig]) / 2;
}

/**
 * Agrupa les paraules en files. No podem partir per y exacta: el paper està
 * arrugat i dins d'una mateixa fila la y es belluga (a la foto real, fins a
 * 30 px amb lletres de 60). Comparem contra el centre mitjà de la fila que
 * estem muntant, amb una tolerància treta de l'alçada de la lletra.
 */
export function agrupaFiles(paraules: ParaulaOCR[]): ParaulaOCR[][] {
  const netes = paraules.filter((p) => p.text.trim().length > 0);
  if (netes.length === 0) return [];

  const tolerancia = mediana(netes.map((p) => p.caixa.height)) * 0.7;
  const ordenades = [...netes].sort(
    (a, b) => centreY(a.caixa) - centreY(b.caixa)
  );

  const files: ParaulaOCR[][] = [];
  let actual: ParaulaOCR[] = [ordenades[0]];
  let suma = centreY(ordenades[0].caixa);

  for (const p of ordenades.slice(1)) {
    const c = centreY(p.caixa);
    if (Math.abs(c - suma / actual.length) <= tolerancia) {
      actual.push(p);
      suma += c;
    } else {
      files.push(actual);
      actual = [p];
      suma = c;
    }
  }
  files.push(actual);

  return files.map((f) => f.sort((a, b) => a.caixa.x - b.caixa.x));
}

/**
 * Torna a enganxar els números que l'OCR ha partit. A la foto real "9.000,00"
 * surt com a dues paraules, "9.000," i "00", i fins i tot amb les caixes
 * encavalcades.
 *
 * La regla és estreta a posta: només enganxem quan el tall cau just on hi ha
 * un separador decimal. Si ho féssim per proximitat, ajuntaríem la sitja amb
 * el lot ("1" + "660986" → "1660986"), que a la mateixa foto queden a 67 px.
 */
export function ajuntaTrossos(fila: ParaulaOCR[]): ParaulaOCR[] {
  const sortida: ParaulaOCR[] = [];

  for (const p of fila) {
    const previ = sortida[sortida.length - 1];
    // La forma del tall: un dels dos costats acaba (o comença) al separador.
    const forma =
      previ &&
      ((/[.,]$/.test(previ.text) && /^\d/.test(p.text)) ||
        (/\d$/.test(previ.text) && /^[.,]\d/.test(p.text)));
    // ...i han de ser realment de costat. Sense aquesta comprovació, "S.L."
    // del nom del client s'enganxava amb la data que hi ha a 1.700 px a la
    // dreta, i llavors ni es llegia la data ni el número d'albarà.
    const aprop =
      previ &&
      p.caixa.x - dreta(previ.caixa) <=
        0.8 * Math.max(previ.caixa.height, p.caixa.height);

    if (previ && forma && aprop) {
      const x = Math.min(previ.caixa.x, p.caixa.x);
      const y = Math.min(previ.caixa.y, p.caixa.y);
      sortida[sortida.length - 1] = {
        text: previ.text + p.text,
        caixa: {
          x,
          y,
          width: Math.max(dreta(previ.caixa), dreta(p.caixa)) - x,
          height:
            Math.max(
              previ.caixa.y + previ.caixa.height,
              p.caixa.y + p.caixa.height
            ) - y,
        },
      };
    } else {
      sortida.push(p);
    }
  }

  return sortida;
}

type Candidat = { valor: number; x: number; text: string };

/**
 * Tria quina columna de números són els quilos.
 *
 * Sense capçaleres, el que ens salva és que els números d'una mateixa columna
 * estan alineats entre files. Busquem grups alineats verticalment i ens
 * quedem amb el que sembli quilos. Si hem llegit el total de l'albarà, mana
 * ell: la columna bona és la que suma el total.
 */
function triaColumna(
  filesArticle: { candidats: Candidat[] }[],
  total: number | null,
  ampladaFoto: number
): number | null {
  const tolerancia = Math.max(ampladaFoto * 0.03, 40);

  const columnes: { x: number; valors: Candidat[] }[] = [];
  for (const fila of filesArticle) {
    for (const c of fila.candidats) {
      const trobada = columnes.find((col) => Math.abs(col.x - c.x) <= tolerancia);
      if (trobada) {
        trobada.valors.push(c);
        trobada.x = (trobada.x * (trobada.valors.length - 1) + c.x) /
          trobada.valors.length;
      } else {
        columnes.push({ x: c.x, valors: [c] });
      }
    }
  }

  if (columnes.length === 0) return null;

  // Si tenim el total imprès, la columna bona és la que hi quadra.
  if (total !== null) {
    const quadra = columnes.find((col) => {
      if (col.valors.length !== filesArticle.length) return false;
      const suma = col.valors.reduce((s, v) => s + v.valor, 0);
      return Math.abs(suma - total) < 1;
    });
    if (quadra) return quadra.x;
  }

  // Si no: la columna que surt a més files (una paraula solta que sembla un
  // pes, com un codi de client, no ho és de veritat perquè només surt un cop);
  // entre empats, la més a la dreta.
  const plausibles = columnes
    .filter((col) => col.valors.every((v) => v.valor >= KG_MIN && v.valor <= KG_MAX))
    .sort((a, b) => b.valors.length - a.valors.length || b.x - a.x);

  return plausibles[0]?.x ?? null;
}

/**
 * Llegeix un albarà a partir de les paraules que ha trobat l'OCR.
 *
 * `ampladaFoto` només s'utilitza per escalar les toleràncies, perquè el mateix
 * codi funcioni amb una foto de 12 Mpx i amb una de retallada.
 */
export function analitzaAlbara(
  paraules: ParaulaOCR[],
  ampladaFoto?: number
): AlbaraLlegit {
  const buit: AlbaraLlegit = {
    numero: null,
    data: null,
    linies: [],
    total: null,
    quadra: false,
  };
  if (paraules.length === 0) return buit;

  const amplada =
    ampladaFoto ?? Math.max(...paraules.map((p) => dreta(p.caixa)));

  const files = agrupaFiles(paraules).map(ajuntaTrossos);

  // --- Data -----------------------------------------------------------------
  let data: string | null = null;
  let caixaData: Caixa | null = null;
  for (const fila of files) {
    for (const p of fila) {
      const m = DATA_DMA.exec(p.text.trim());
      if (!m) continue;
      const dia = Number(m[1]);
      const mes = Number(m[2]);
      let any = Number(m[3]);
      if (m[3].length === 2) any += any < 70 ? 2000 : 1900;
      if (dia < 1 || dia > 31 || mes < 1 || mes > 12) continue;
      data = `${any}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
      caixaData = p.caixa;
      break;
    }
    if (data) break;
  }

  // --- Files d'article ------------------------------------------------------
  const filesArticle: {
    codi: string;
    xCodi: number;
    candidats: Candidat[];
    y: number;
    medicat: boolean;
    prescripcio: string | null;
  }[] = [];

  // Text de després dels ":" en una fila (per treure el codi de la
  // prescripció d'una fila "Prescripció : P-25-B425-703-2026").
  function textDespresDeDosPunts(fila: ParaulaOCR[]): string | null {
    const iDosPunts = fila.findIndex((p) => p.text.trim() === ':');
    const trossos = (iDosPunts === -1 ? fila : fila.slice(iDosPunts + 1)).map(
      (p) => p.text.trim()
    );
    const text = trossos.join(' ').trim();
    return text || null;
  }

  for (const fila of files) {
    // El codi d'article és sempre la primera columna de la taula: si el que
    // hi ha en majúscules no és la primera paraula de la fila, no és un codi,
    // és una altra paraula del full (un municipi, "TRANSPORT", "CODI CLIENT")
    // que resulta que també és tota en majúscules. En una foto de la pàgina
    // sencera n'hi ha moltes: capçaleres de logo, adreces, etc.
    if (!CODI_ARTICLE.test(fila[0].text.trim())) continue;
    const iCodi = 0;

    const candidats: Candidat[] = [];
    for (const p of fila.slice(iCodi + 1)) {
      const valor = llegeixNumero(p.text);
      if (valor === null) continue;
      candidats.push({ valor, x: p.caixa.x, text: p.text.trim() });
    }
    // Un codi sense cap número al costat no és una línia d'albarà: és una
    // paraula qualsevol del full que resulta que va en majúscules.
    if (candidats.length === 0) continue;

    filesArticle.push({
      codi: fila[iCodi].text.trim(),
      xCodi: fila[iCodi].caixa.x,
      candidats,
      y: centreY(fila[iCodi].caixa),
      medicat: fila.some((p) => MEDICAMENT.test(p.text)),
      prescripcio: fila.some((p) => PRESCRIPCIO.test(p.text))
        ? textDespresDeDosPunts(fila)
        : null,
    });
  }

  // --- Avisos de medicació ----------------------------------------------------
  // "Complement medicamentós" i "Prescripció: ..." no surten sempre a la
  // mateixa fila que l'article: a la foto real (`medicated.jpg`) l'albarà
  // imprimeix la línia de l'article i, just a sota, dues línies més petites
  // amb l'avís i el número de recepta, abans de l'article següent. S'associen
  // a l'última línia d'article per sobre seu.
  for (const fila of files) {
    // Si la fila comença amb un codi ja s'ha mirat com a possible fila
    // d'article, més amunt (i si en tenia, l'avís ja hi és enganxat).
    if (CODI_ARTICLE.test(fila[0].text.trim())) continue;
    const teMedicat = fila.some((p) => MEDICAMENT.test(p.text));
    const tePrescripcio = fila.some((p) => PRESCRIPCIO.test(p.text));
    if (!teMedicat && !tePrescripcio) continue;

    const y = centreY(fila[0].caixa);
    // La línia d'article vigent és la de sota seu més propera.
    const linia = filesArticle
      .filter((f) => f.y <= y)
      .sort((a, b) => b.y - a.y)[0];
    if (!linia) continue;

    linia.medicat = true;
    if (tePrescripcio && !linia.prescripcio) {
      linia.prescripcio = textDespresDeDosPunts(fila);
    }
  }

  // --- Total imprès ---------------------------------------------------------
  // Es busca a les files SENSE codi d'article que quedin per sota de l'última
  // línia: és on va la fila "Totals".
  const yUltima = filesArticle.length
    ? Math.max(...filesArticle.map((f) => f.y))
    : 0;
  let total: number | null = null;

  for (const fila of files) {
    if (fila.some((p) => CODI_ARTICLE.test(p.text.trim()))) continue;
    if (centreY(fila[0].caixa) <= yUltima) continue;

    const teParaulaTotal = fila.some((p) => /^totals?$/i.test(p.text.trim()));
    const numeros = fila
      .map((p) => ({ valor: llegeixNumero(p.text), x: p.caixa.x }))
      .filter((n): n is { valor: number; x: number } => n.valor !== null);
    if (numeros.length === 0) continue;

    const gran = numeros.sort((a, b) => b.valor - a.valor)[0];
    if (teParaulaTotal || (gran.valor >= KG_MIN && gran.valor <= KG_MAX * 5)) {
      total = gran.valor;
      if (teParaulaTotal) break;
    }
  }

  // --- Quilos de cada línia -------------------------------------------------
  const xColumna = triaColumna(filesArticle, total, amplada);
  const tolerancia = Math.max(amplada * 0.03, 40);

  const ambKg = filesArticle.map((f) => {
    const encert =
      xColumna === null
        ? undefined
        : f.candidats.find((c) => Math.abs(c.x - xColumna) <= tolerancia);
    return {
      ...f,
      kg: encert ? encert.valor : null,
      // Entre el codi i la quantitat hi ha la sitja i el lot. Ni ho fem servir
      // ni ho desem, però ensenyar-ho ajuda a reconèixer la fila a la foto.
      lot:
        f.candidats
          .filter((c) => (encert ? c.x < encert.x : true))
          .map((c) => c.text)
          .join(' ') || null,
    };
  });

  // Els codis d'article van tots en columna. Un cop sabem quines files han
  // donat quilos, sabem on cau aquella columna i podem tirar les que hi han
  // entrat de rebot (una adreça en majúscules seguida d'un codi postal, per
  // exemple). Les files sense quilos es queden si estan ben alineades: pot ser
  // simplement que aquella quantitat no s'hagi llegit.
  const xCodis = ambKg.filter((f) => f.kg !== null).map((f) => f.xCodi);
  const xArticle = xCodis.length > 0 ? mediana(xCodis) : null;

  const linies: LiniaAlbara[] = ambKg
    .filter((f) => xArticle === null || Math.abs(f.xCodi - xArticle) <= tolerancia)
    .map((f) => ({
      codiArticle: f.codi,
      kg: f.kg,
      lot: f.lot,
      medicat: f.medicat,
      prescripcio: f.prescripcio,
    }));

  // --- Número d'albarà ------------------------------------------------------
  // Va just a sobre de la data i alineat amb ella (a la foto real, a 2 px).
  // Buscar "el primer número de 6 xifres" sense més enganxaria el telèfon del
  // proveïdor o el CIF.
  let numero: string | null = null;
  if (caixaData) {
    const candidats = paraules
      .filter((p) => /^\d{4,8}$/.test(p.text.trim()))
      .filter((p) => centreY(p.caixa) < centreY(caixaData))
      .filter((p) => Math.abs(p.caixa.x - caixaData.x) <= tolerancia)
      .sort((a, b) => centreY(b.caixa) - centreY(a.caixa));
    numero = candidats[0]?.text.trim() ?? null;
  }

  const sumaLinies = linies.reduce((s, l) => s + (l.kg ?? 0), 0);
  const quadra =
    total !== null &&
    linies.length > 0 &&
    linies.every((l) => l.kg !== null) &&
    Math.abs(sumaLinies - total) < 1;

  return { numero, data, linies, total, quadra };
}
