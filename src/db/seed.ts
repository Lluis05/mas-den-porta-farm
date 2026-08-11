import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

/**
 * Dades fixes de la granja: l'estructura física i les llistes tancades.
 * Això no ho ha d'escriure ningú a mà des de l'app.
 */

/** 27 sales d'engreix (resposta A2), 132 places cadascuna (A5). */
const NUM_SALES = 27;
const CAPACITAT_SALA = 132;

/** 12 corrals per sala: 6 a l'esquerra i 6 a la dreta, numerats 1-6 dins de cada meitat. */
const MEITATS = ['E', 'D'] as const;
const CORRALS_PER_MEITAT = 6;
const CAPACITAT_CORRAL = 11;

/** 7 bandes, deslletament cada 3 setmanes (resposta B1). */
const NUM_BANDES = 7;

/** Ubicacions de reproducció (resposta A3). No són sales numerades. */
const UBICACIONS: { tipus: 'inseminacio' | 'gestacio'; codi: string }[] = [
  { tipus: 'inseminacio', codi: 'L1' },
  { tipus: 'inseminacio', codi: 'L2' },
  { tipus: 'inseminacio', codi: 'L3' },
  { tipus: 'inseminacio', codi: 'L4' },
  { tipus: 'gestacio', codi: 'Benestar esquerra' },
  { tipus: 'gestacio', codi: 'Benestar dreta' },
  { tipus: 'gestacio', codi: 'Automàtic mascle' },
];

/**
 * Els 9 tipus de pinso (columnes C-K del full Pinso).
 * Les capacitats de sitja només les sabem de dos tipus (resposta G4);
 * la resta queden NULL fins que ens ho diguin.
 */
const TIPUS_PINSO: {
  codi: string;
  descripcio: string;
  capacitat_sitja_kg: number | null;
}[] = [
  { codi: 'H10', descripcio: 'Porcells de parideres', capacitat_sitja_kg: null },
  { codi: 'STARTER', descripcio: 'Starter', capacitat_sitja_kg: null },
  { codi: 'ENTRADES', descripcio: 'Entrades', capacitat_sitja_kg: null },
  { codi: 'CREIXEMENT', descripcio: 'Creixement', capacitat_sitja_kg: null },
  { codi: 'ENGREIX', descripcio: 'Engreix', capacitat_sitja_kg: null },
  { codi: '82', descripcio: 'Finalitzadors', capacitat_sitja_kg: null },
  { codi: 'GESTACIO', descripcio: 'Gestació', capacitat_sitja_kg: 25000 },
  { codi: 'LACTACIO', descripcio: 'Lactació (parideres)', capacitat_sitja_kg: 12000 },
  { codi: 'LLAVORES', descripcio: 'Pinso de les primales', capacitat_sitja_kg: null },
];

export async function seedDatabase(db: SQLiteDatabase): Promise<void> {
  // Idempotent: si ja hi ha sales, no tornem a sembrar.
  const jaHiEs = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) AS n FROM sala'
  );
  if (jaHiEs && jaHiEs.n > 0) return;

  // Sense transacció pròpia: sempre es crida des de la migració 1, que ja
  // n'obre una. Una transacció dins d'una altra petava a wa-sqlite (web).
  for (let numSala = 1; numSala <= NUM_SALES; numSala++) {
    const salaId = Crypto.randomUUID();
    await db.runAsync(
      'INSERT INTO sala (id, numero, capacitat) VALUES (?, ?, ?)',
      salaId,
      numSala,
      CAPACITAT_SALA
    );

    for (const meitat of MEITATS) {
      for (let numCorral = 1; numCorral <= CORRALS_PER_MEITAT; numCorral++) {
        await db.runAsync(
          'INSERT INTO corral (id, sala_id, meitat, numero, capacitat) VALUES (?, ?, ?, ?, ?)',
          Crypto.randomUUID(),
          salaId,
          meitat,
          numCorral,
          CAPACITAT_CORRAL
        );
      }
    }
  }

  for (let numBanda = 1; numBanda <= NUM_BANDES; numBanda++) {
    await db.runAsync(
      'INSERT INTO banda (id, numero) VALUES (?, ?)',
      Crypto.randomUUID(),
      numBanda
    );
  }

  for (const u of UBICACIONS) {
    await db.runAsync(
      'INSERT INTO ubicacio_reproduccio (id, tipus, codi) VALUES (?, ?, ?)',
      Crypto.randomUUID(),
      u.tipus,
      u.codi
    );
  }

  for (const t of TIPUS_PINSO) {
    await db.runAsync(
      'INSERT INTO tipus_pinso (id, codi, descripcio, capacitat_sitja_kg) VALUES (?, ?, ?, ?)',
      Crypto.randomUUID(),
      t.codi,
      t.descripcio,
      t.capacitat_sitja_kg
    );
  }
}
