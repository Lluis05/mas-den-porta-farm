import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_SQL } from './schema';
import { seedDatabase } from './seed';

export const DATABASE_NAME = 'granja.db';

/**
 * Versió actual de l'esquema.
 *
 * Com funcionen les migracions: SQLite guarda un número a `PRAGMA user_version`.
 * Quan obrim la base de dades comparem aquell número amb aquest d'aquí i
 * apliquem només els passos que falten. Així el mòbil d'una persona que fa
 * setmanes que no obre l'app es posa al dia sol, sense perdre res.
 *
 * Per canviar l'esquema més endavant: puja aquest número i afegeix el pas nou
 * a `migracions`. No toquis mai un pas ja publicat.
 */
const VERSIO_ESQUEMA = 1;

type Migracio = (db: SQLiteDatabase) => Promise<void>;

const migracions: Record<number, Migracio> = {
  /** v1: esquema inicial + dades fixes de la granja. */
  1: async (db) => {
    await db.execAsync(SCHEMA_SQL);
    await seedDatabase(db);
  },
};

/**
 * Es crida un sol cop, quan s'obre la base de dades.
 * Va lligat a `SQLiteProvider` a `src/app/_layout.tsx`.
 */
export async function initDatabase(db: SQLiteDatabase): Promise<void> {
  // WAL: fa que llegir i escriure alhora no es bloquegin. Recomanat per Expo.
  await db.execAsync('PRAGMA journal_mode = WAL');
  // SQLite no comprova les claus foranes si no li ho demanes explícitament.
  await db.execAsync('PRAGMA foreign_keys = ON');

  const fila = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version'
  );
  let versio = fila?.user_version ?? 0;

  if (versio >= VERSIO_ESQUEMA) return;

  while (versio < VERSIO_ESQUEMA) {
    const seguent = versio + 1;
    const migracio = migracions[seguent];
    if (!migracio) {
      throw new Error(`Falta la migració a la versió ${seguent}`);
    }
    await migracio(db);
    versio = seguent;
  }

  // PRAGMA no accepta paràmetres, però `versio` és un número nostre, no de fora.
  await db.execAsync(`PRAGMA user_version = ${versio}`);
}
