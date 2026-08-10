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
