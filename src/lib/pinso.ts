/**
 * Previsió d'esgotament del pinso (resposta F4).
 *
 * Aquí no es mesura res: el consum real de la granja NO es coneix, només se
 * saben les entregues. Tot això és una estimació feta a partir del ritme amb
 * què arriba el pinso, i la pantalla ho ha de dir clarament.
 *
 * La idea, en una línia: el pinso que va arribar entre la primera i l'última
 * entrega ja s'ha menjat, així que dividint-lo pels dies transcorreguts surt
 * el consum diari. Amb això i el que va portar l'últim camió, s'estima quants
 * dies queden.
 *
 * Funcions pures, sense base de dades ni React: es poden provar soles.
 */

export type EntregaPinso = { data: string; kg: number };

export type Previsio = {
  /** Ritme de consum estimat, en kg/dia. Null si no hi ha prou entregues. */
  kgPerDia: number | null;
  /** Dies que falten perquè s'acabi, comptant des d'avui. Null si no se sap. */
  diesRestants: number | null;
  /** Data en què s'estima que s'acabarà. */
  dataEsgotament: string | null;
  /** Kg que es calcula que queden ara mateix. */
  kgRestants: number | null;
  ultimaEntrega: string | null;
  kgUltimaEntrega: number | null;
  /** Dies que solen passar entre entrega i entrega. */
  intervalMitja: number | null;
  /** Entregues que s'han fet servir per al càlcul. */
  entreguesUsades: number;
};

const DIA = 86400000;

const aData = (s: string) => Date.parse(`${s}T12:00:00Z`);
const diesEntre = (a: string, b: string) => (aData(b) - aData(a)) / DIA;

function sumaDies(data: string, dies: number): string {
  const d = new Date(aData(data) + dies * DIA);
  return d.toISOString().slice(0, 10);
}

const buida: Previsio = {
  kgPerDia: null,
  diesRestants: null,
  dataEsgotament: null,
  kgRestants: null,
  ultimaEntrega: null,
  kgUltimaEntrega: null,
  intervalMitja: null,
  entreguesUsades: 0,
};

/**
 * @param finestraDies Només es miren les entregues d'aquest últim tram. El
 * consum d'ara fa temps no diu res del d'avui: el cens de truges canvia i els
 * porcs d'engreix creixen. Mig any és prou llarg per no dependre d'un camió
 * concret i prou curt per reflectir la granja d'ara.
 */
export function calculaPrevisio(
  entregues: EntregaPinso[],
  avui: string,
  finestraDies = 180
): Previsio {
  if (entregues.length === 0) return buida;

  const ordenades = [...entregues].sort((a, b) => a.data.localeCompare(b.data));
  const ultima = ordenades[ordenades.length - 1];

  const base: Previsio = {
    ...buida,
    ultimaEntrega: ultima.data,
    kgUltimaEntrega: ultima.kg,
    entreguesUsades: 0,
  };

  // Ens quedem amb el tram recent; si hi ha massa poques entregues, fem servir
  // tot l'històric abans que no donar cap previsió.
  let finestra = ordenades.filter(
    (e) => diesEntre(e.data, ultima.data) <= finestraDies
  );
  if (finestra.length < 3) finestra = ordenades;
  if (finestra.length < 2) return base;

  const primera = finestra[0];
  const span = diesEntre(primera.data, ultima.data);
  if (span <= 0) return base;

  // El pinso de l'última entrega encara no s'ha menjat: no compta per calcular
  // el ritme, però sí que és el que queda al sitja.
  const consumit = finestra
    .slice(0, -1)
    .reduce((s, e) => s + e.kg, 0);
  if (consumit <= 0) return base;

  const kgPerDia = consumit / span;
  const intervalMitja = span / (finestra.length - 1);

  const diesDesDeUltima = diesEntre(ultima.data, avui);
  const kgRestants = ultima.kg - kgPerDia * diesDesDeUltima;
  const diesRestants = kgRestants / kgPerDia;

  return {
    kgPerDia,
    diesRestants,
    dataEsgotament: sumaDies(avui, diesRestants),
    kgRestants,
    ultimaEntrega: ultima.data,
    kgUltimaEntrega: ultima.kg,
    intervalMitja,
    entreguesUsades: finestra.length,
  };
}

/**
 * Detecta si el que passa és que falten entregues per apuntar.
 *
 * Si fa temps que no s'apunta res, tots els tipus surten com a esgotats i
 * l'avís deixa de voler dir res: el problema no és que la granja s'hagi quedat
 * sense pinso de nou tipus alhora, és que ningú ha apuntat les entregues.
 *
 * El llindar no és un número inventat: es calcula amb el ritme real. Si el
 * pinso que arriba més sovint ve cada 6 dies i fa 12 que no s'apunta res,
 * és que falten dades. Es limita entre una i quatre setmanes per no disparar-se
 * amb una granja de ritme molt ràpid ni callar amb una de molt lent.
 */
export function dadesEndarrerides(
  entreguesPerTipus: EntregaPinso[][],
  avui: string
): { dies: number; llindar: number; endarrerit: boolean } | null {
  const totes = entreguesPerTipus.flat();
  if (totes.length === 0) return null;

  const ultima = totes.map((e) => e.data).reduce((a, b) => (a > b ? a : b));
  const dies = diesEntre(ultima, avui);

  const intervals = entreguesPerTipus
    .map((e) => calculaPrevisio(e, avui).intervalMitja)
    .filter((i): i is number => i != null && i > 0);

  const mesFreqüent = intervals.length > 0 ? Math.min(...intervals) : 7;
  const llindar = Math.min(28, Math.max(7, mesFreqüent * 2));

  return { dies, llindar, endarrerit: dies > llindar };
}

export type Urgencia = 'esgotat' | 'aviat' | 'atencio' | 'be' | 'desconegut';

/** Llindar per avisar, en dies (resposta F4: «uns dies abans»). */
export const DIES_AVIS = 5;

export function urgencia(p: Previsio): Urgencia {
  if (p.diesRestants == null) return 'desconegut';
  if (p.diesRestants <= 0) return 'esgotat';
  if (p.diesRestants <= DIES_AVIS) return 'aviat';
  if (p.diesRestants <= DIES_AVIS * 2) return 'atencio';
  return 'be';
}
