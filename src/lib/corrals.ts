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
