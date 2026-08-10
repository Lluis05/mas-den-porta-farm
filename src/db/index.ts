import type { SQLiteDatabase } from 'expo-sqlite';

import { SCHEMA_SQL, VISTA_CICLE_RESUM, VISTES_SQL } from './schema';
import { seedDatabase } from './seed';

async function taulaExisteix(db: SQLiteDatabase, nom: string): Promise<boolean> {
  const fila = await db.getFirstAsync<{ n: number }>(
    "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?",
    nom
  );
  return (fila?.n ?? 0) > 0;
}

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
const VERSIO_ESQUEMA = 3;

type Migracio = (db: SQLiteDatabase) => Promise<void>;

const migracions: Record<number, Migracio> = {
  /** v1: esquema inicial + dades fixes de la granja. */
  1: async (db) => {
    await db.execAsync(SCHEMA_SQL);
    await seedDatabase(db);
  },

  /**
   * v2: arregla v_cicle_resum. Un mateix corral s'utilitza cicle rere cicle,
   * i la versió anterior atribuïa una sortida a TOTS els cicles que havien
   * passat per aquell corral, no només al que hi havia en aquell moment.
   * Només canvia la vista: cap dada s'ha de tocar.
   */
  2: async (db) => {
    await db.execAsync(VISTA_CICLE_RESUM);
  },

  /**
   * v3: la restricció UNIQUE(cicle_id, corral_id) d'ocupacio_corral impedia
   * editar un cicle: en refer l'ocupació, la fila nova xocava amb l'antiga
   * marcada com esborrada. Es canvia per un índex únic PARCIAL, que només
   * mira les files vives.
   *
   * SQLite no sap treure una restricció d'una taula, així que s'ha de refer
   * la taula sencera copiant-hi les dades.
   */
  3: async (db) => {
    // Les vistes s'han d'esborrar ABANS de tocar la taula. ALTER TABLE fa que
    // SQLite torni a llegir tot l'esquema, i si alguna vista apunta a una
    // taula que en aquell moment no existeix, tot peta.
    await db.execAsync(`
      DROP VIEW IF EXISTS v_ocupacio_actual;
      DROP VIEW IF EXISTS v_cicle_resum;
      DROP VIEW IF EXISTS v_consum_pinso;
    `);

    const teVella = await taulaExisteix(db, 'ocupacio_corral');
    const teNova = await taulaExisteix(db, 'ocupacio_corral_nova');

    // Si la taula vella ja no hi és i la nova sí, som a mig camí d'un intent
    // anterior que va fallar: només falta el canvi de nom.
    if (teVella) {
      if (teNova) await db.execAsync('DROP TABLE ocupacio_corral_nova');
      await db.execAsync(`
      CREATE TABLE ocupacio_corral_nova (
        id               TEXT PRIMARY KEY,
        cicle_id         TEXT NOT NULL REFERENCES cicle_engreix(id),
        corral_id        TEXT NOT NULL REFERENCES corral(id),
        data_entrada     TEXT NOT NULL,
        porcs_entrada    INTEGER NOT NULL,
        data_sortida     TEXT,
        creat_el         TEXT NOT NULL DEFAULT (datetime('now')),
        modificat_el     TEXT NOT NULL DEFAULT (datetime('now')),
        esborrat_el      TEXT,
        sincronitzat_el  TEXT
      );

      INSERT INTO ocupacio_corral_nova
        (id, cicle_id, corral_id, data_entrada, porcs_entrada, data_sortida,
         creat_el, modificat_el, esborrat_el, sincronitzat_el)
      SELECT
         id, cicle_id, corral_id, data_entrada, porcs_entrada, data_sortida,
         creat_el, modificat_el, esborrat_el, sincronitzat_el
      FROM ocupacio_corral;

      DROP TABLE ocupacio_corral;
      `);
    }

    if (await taulaExisteix(db, 'ocupacio_corral_nova')) {
      await db.execAsync(
        'ALTER TABLE ocupacio_corral_nova RENAME TO ocupacio_corral'
      );
    }

    await db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_ocupacio_corral ON ocupacio_corral(corral_id);
      CREATE INDEX IF NOT EXISTS idx_ocupacio_cicle ON ocupacio_corral(cicle_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_ocupacio_unica
        ON ocupacio_corral(cicle_id, corral_id) WHERE esborrat_el IS NULL;
    `);

    // I ara les vistes, ja amb la taula al seu lloc.
    await db.execAsync(VISTES_SQL);
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

    // Cada migració va dins d'una transacció, junt amb el número de versió:
    // o s'aplica sencera o no s'aplica gens. Si petés a mitges, la base de
    // dades quedaria en un estat impossible d'arreglar des de l'app.
    await db.withTransactionAsync(async () => {
      await migracio(db);
      // PRAGMA no accepta paràmetres, però aquest número és nostre, no de fora.
      await db.execAsync(`PRAGMA user_version = ${seguent}`);
    });

    versio = seguent;
  }
}
