/**
 * Funcions pures sobre corrals: repartir porcs i escriure el codi de sala
 * en la mateixa notació que fan servir els pares a l'Excel.
 *
 * No toquen la base de dades ni React: es poden provar soles.
 */

export type Meitat = 'E' | 'D';

/** Un corral identificat com el veu l'usuari: mitat + número dins la meitat. */
export type CorralRef = { meitat: Meitat; numero: number };

/**
 * Reparteix `total` porcs entre `parts` corrals de la manera més igualada
 * possible. El sobrant va als primers corrals, d'un en un.
 *
 * reparteix(100, 4) -> [25, 25, 25, 25]
 * reparteix(102, 4) -> [26, 26, 25, 25]
 */
export function reparteix(total: number, parts: number): number[] {
  if (parts <= 0 || total < 0) return [];
  const base = Math.floor(total / parts);
  const resta = total - base * parts;
  return Array.from({ length: parts }, (_, i) => base + (i < resta ? 1 : 0));
}

/**
 * Reparteix `total` porcs que surten entre corrals que tenen quantitats
 * diferents, proporcionalment al que hi ha a cada un.
 *
 * A diferència de `reparteix`, aquí els corrals no són iguals: un pot tenir 11
 * porcs i un altre 3. Mai en treu més dels que hi ha, i si es demanen més dels
 * que hi ha a tot arreu, els buida tots.
 *
 * reparteixProporcional(30, [11, 11, 11, 11]) -> [8, 8, 7, 7]
 * reparteixProporcional(10, [11, 3])          -> [8, 2]
 */
export function reparteixProporcional(total: number, disponibles: number[]): number[] {
  const suma = disponibles.reduce((s, d) => s + d, 0);
  if (total <= 0 || suma <= 0) return disponibles.map(() => 0);
  if (total >= suma) return [...disponibles];

  // Part sencera de cada proporció, i ens quedem la part decimal per després.
  const exactes = disponibles.map((d) => (total * d) / suma);
  const resultat = exactes.map((e) => Math.floor(e));
  let assignats = resultat.reduce((s, r) => s + r, 0);

  // El que sobra va als corrals amb la part decimal més gran (mètode del
  // residu més gran), sense passar-se mai del que hi ha disponible.
  const ordre = exactes
    .map((e, i) => ({ i, decimal: e - Math.floor(e) }))
    .sort((a, b) => b.decimal - a.decimal);

  let volta = 0;
  while (assignats < total && volta < ordre.length * 2) {
    let s_ha_afegit = false;
    for (const { i } of ordre) {
      if (assignats >= total) break;
      if (resultat[i] < disponibles[i]) {
        resultat[i]++;
        assignats++;
        s_ha_afegit = true;
      }
    }
    if (!s_ha_afegit) break;
    volta++;
  }

  return resultat;
}

export type LiniaTrasllat = { corralId: string; num: number };
export type ParellTrasllat = {
  corralOrigenId: string;
  corralDestiId: string;
  numPorcs: number;
};

/**
 * Un moviment és sempre d'UN corral a UN altre (`moviment` a schema.ts), però
 * a la pantalla es pot triar més d'un corral d'origen i més d'un de destí.
 * Aquí es converteix "aquests corrals en treuen tants, aquests altres en
 * reben tants" en la llista de parelles que cal desar.
 *
 * No importa quin origen concret queda aparellat amb quin destí concret: són
 * porcs sense marcar, no se'n fa un seguiment individual. Només cal que el
 * que surt de cada origen i el que entra a cada destí sumin bé.
 *
 * aparellaTrasllats([{corralId:'a', num:5}], [{corralId:'x', num:3}, {corralId:'y', num:2}])
 *   -> [{corralOrigenId:'a', corralDestiId:'x', numPorcs:3},
 *       {corralOrigenId:'a', corralDestiId:'y', numPorcs:2}]
 */
export function aparellaTrasllats(
  origens: LiniaTrasllat[],
  destins: LiniaTrasllat[]
): ParellTrasllat[] {
  const o = origens.filter((l) => l.num > 0).map((l) => ({ ...l }));
  const d = destins.filter((l) => l.num > 0).map((l) => ({ ...l }));
  const resultat: ParellTrasllat[] = [];

  let i = 0;
  let j = 0;
  while (i < o.length && j < d.length) {
    const n = Math.min(o[i].num, d[j].num);
    if (n > 0) {
      resultat.push({
        corralOrigenId: o[i].corralId,
        corralDestiId: d[j].corralId,
        numPorcs: n,
      });
    }
    o[i].num -= n;
    d[j].num -= n;
    if (o[i].num === 0) i++;
    if (d[j].num === 0) j++;
  }

  return resultat;
}

const CORRALS_PER_MEITAT = 6;

/**
 * Construeix el codi de sala tal com s'escriu a l'Excel.
 *
 *   sala sencera         -> "22"
 *   una meitat sencera   -> "21D"
 *   corrals solts        -> "11 1-2-3-4E"
 *   les dues meitats     -> "26 E+5-6D"
 *
 * Serveix perquè els pares reconeguin d'un cop d'ull el que sempre han escrit.
 */
export function codiSala(sala: number, corrals: CorralRef[]): string {
  if (corrals.length === 0) return `${sala}`;

  const ordena = (m: Meitat) =>
    corrals
      .filter((c) => c.meitat === m)
      .map((c) => c.numero)
      .sort((a, b) => a - b);

  const esquerra = ordena('E');
  const dreta = ordena('D');

  if (esquerra.length === CORRALS_PER_MEITAT && dreta.length === CORRALS_PER_MEITAT) {
    return `${sala}`;
  }

  const tros = (nums: number[], m: Meitat): string | null => {
    if (nums.length === 0) return null;
    if (nums.length === CORRALS_PER_MEITAT) return m;
    return `${nums.join('-')}${m}`;
  };

  const trossos = [tros(esquerra, 'E'), tros(dreta, 'D')].filter(
    (t): t is string => t !== null
  );

  // Una sola meitat sencera s'escriu enganxada: "21D"
  if (trossos.length === 1 && (trossos[0] === 'E' || trossos[0] === 'D')) {
    return `${sala}${trossos[0]}`;
  }

  return `${sala} ${trossos.join('+')}`;
}

/**
 * L'invers de `codiSala`: llegeix un codi escrit a mà a l'Excel i en treu la
 * sala i els corrals. Serveix per importar les hojas numerades.
 *
 * Accepta les formes que fan servir els pares, amb separadors i espais
 * irregulars:
 *   "22"              -> sala 22, els 12 corrals
 *   "21D" / "27-D"    -> sala 21, els 6 de la dreta
 *   "11 1-2-3-4E"     -> sala 11, corrals 1E-4E
 *   "20 1-2-3-4-6-D"  -> sala 20, corrals 1D,2D,3D,4D,6D
 *   "26 E+5-6-D"      -> sala 26, tota l'esquerra + 5D i 6D
 *   "1/1-2E"          -> sala 1, corrals 1E i 2E
 *
 * Torna null si no ho entén: el que importa és no inventar-se dades.
 */
export function analitzaCodiSala(
  entrada: string | number
): { sala: number; corrals: CorralRef[] } | null {
  const text = String(entrada).trim().toUpperCase();
  if (text === '') return null;

  // Sala sencera: només un número.
  const nomesNumero = /^(\d{1,2})$/.exec(text);
  if (nomesNumero) {
    const sala = Number(nomesNumero[1]);
    return { sala, corrals: totsElsCorrals(sala) };
  }

  // La sala és el primer número; la resta descriu els corrals.
  const capdavant = /^(\d{1,2})\s*[-/\s]?\s*(.*)$/.exec(text);
  if (!capdavant) return null;
  const sala = Number(capdavant[1]);
  const resta = capdavant[2].trim();
  if (resta === '') return { sala, corrals: totsElsCorrals(sala) };

  const corrals: CorralRef[] = [];
  // Els trossos separats per "+" són meitats diferents de la mateixa sala.
  for (const tros of resta.split('+')) {
    const net = tros.trim();
    if (net === '') continue;

    const meitat: Meitat | null = net.includes('E')
      ? 'E'
      : net.includes('D')
        ? 'D'
        : null;
    if (!meitat) return null;

    const numeros = net
      .replace(/[ED]/g, '')
      .split(/[-\s/]+/)
      .map((n) => n.trim())
      .filter((n) => n !== '')
      .map(Number);

    if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > 6)) return null;

    // Sense números: la meitat sencera ("26 E+5-6-D" -> "E").
    if (numeros.length === 0) {
      for (let n = 1; n <= 6; n++) corrals.push({ meitat, numero: n });
    } else {
      for (const n of numeros) corrals.push({ meitat, numero: n });
    }
  }

  if (corrals.length === 0) return null;

  // Fora duplicats, per si el codi repeteix un corral.
  const vistos = new Set<string>();
  const unics = corrals.filter((c) => {
    const clau = `${c.meitat}${c.numero}`;
    if (vistos.has(clau)) return false;
    vistos.add(clau);
    return true;
  });

  return { sala, corrals: unics };
}

function totsElsCorrals(_sala: number): CorralRef[] {
  const corrals: CorralRef[] = [];
  for (const meitat of ['E', 'D'] as const)
    for (let n = 1; n <= CORRALS_PER_MEITAT; n++) corrals.push({ meitat, numero: n });
  return corrals;
}
