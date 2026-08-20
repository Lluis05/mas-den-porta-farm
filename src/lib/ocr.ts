/**
 * Pont amb el mòdul natiu que llegeix text d'una foto (`expo-mlkit-ocr`,
 * Google ML Kit v2). Tot passa dins del telèfon: no puja cap foto enlloc, que
 * és el que ens cal perquè a la granja no sempre hi ha connexió.
 *
 * Aquest fitxer només fa dues coses: dir si el mòdul hi és, i convertir el
 * que torna en la llista plana de paraules que espera `albara.ts`. Tota la
 * feina de entendre l'albarà és allà, en codi pur que es pot provar sense
 * telèfon.
 *
 * Important: el mòdul NO existeix ni a Expo Go ni al web. És natiu, i per
 * tant només va en una development build. Per això res d'aquí no peta si
 * falta: `ocrDisponible()` retorna false i la pantalla ho diu.
 */

import { Platform } from 'react-native';

import type { ParaulaOCR } from './albara';

type Caixa = { x: number; y: number; width: number; height: number };
type Element = { text: string; boundingBox: Caixa };
type Linia = { text: string; boundingBox: Caixa; elements: Element[] };
type Bloc = { text: string; boundingBox: Caixa; lines: Linia[] };
type Resultat = { text: string; blocks: Bloc[] };

type Modul = {
  recognizeText: (uri: string) => Promise<Resultat>;
  isSupported: () => boolean;
};

let modul: Modul | null | undefined;

function carrega(): Modul | null {
  if (modul !== undefined) return modul;
  if (Platform.OS === 'web') {
    modul = null;
    return modul;
  }
  try {
    // require i no import: si el mòdul natiu no hi és (Expo Go), volem que
    // falli aquí dins i prou, no que peti tota la pantalla en carregar-se.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    modul = require('expo-mlkit-ocr') as Modul;
  } catch {
    modul = null;
  }
  return modul;
}

/** Si en aquest aparell es pot llegir text d'una foto. */
export function ocrDisponible(): boolean {
  const m = carrega();
  if (!m) return false;
  try {
    return m.isSupported();
  } catch {
    // El paquet JS hi és però el natiu no: som a Expo Go.
    return false;
  }
}

/**
 * Aplana el resultat del mòdul a una llista de paraules amb posició.
 *
 * Fem servir el nivell d'`elements` (paraula) i no el de `lines`, perquè per
 * saber si un número és de la columna de quilos o de la de preu ens cal saber
 * on cau cada paraula, no on cau la línia sencera.
 */
export function aParaules(resultat: Resultat): ParaulaOCR[] {
  const paraules: ParaulaOCR[] = [];

  for (const bloc of resultat.blocks ?? []) {
    for (const linia of bloc.lines ?? []) {
      const elements = linia.elements ?? [];
      if (elements.length > 0) {
        for (const el of elements) {
          if (el.text?.trim()) paraules.push({ text: el.text, caixa: el.boundingBox });
        }
      } else if (linia.text?.trim()) {
        // Alguns aparells no donen el detall per paraula. Millor la línia
        // sencera que res.
        paraules.push({ text: linia.text, caixa: linia.boundingBox });
      }
    }
  }

  return paraules;
}

/** Llegeix una foto i en torna les paraules amb la seva posició. */
export async function llegeixFoto(uri: string): Promise<ParaulaOCR[]> {
  const m = carrega();
  if (!m) {
    throw new Error(
      'Aquesta versió de l’app no sap llegir fotos. Cal la development build.'
    );
  }
  return aParaules(await m.recognizeText(uri));
}
