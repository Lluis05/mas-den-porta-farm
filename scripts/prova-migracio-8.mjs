/**
 * Proves de la migració 8 (cens de truges) contra SQLite de debò.
 *
 *   node --experimental-strip-types --experimental-sqlite scripts/prova-migracio-8.mjs
 */

import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL, VISTES_SQL } from '../src/db/schema.ts';

let ok = 0;
let malament = 0;

function comprova(nom, obtingut, esperat) {
  const a = JSON.stringify(obtingut);
  const b = JSON.stringify(esperat);
  if (a === b) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    malament++;
    console.log(`  ✗ ${nom}\n      esperat: ${b}\n      obtingut: ${a}`);
  }
}

function taulaExisteix(db, nom) {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(nom).n > 0
  );
}

/** L'esquema tal com era a la v7: sense baixa_truja ni la vista nova. */
function esquemaV7() {
  const senseVista = SCHEMA_SQL.replace(
    /-- Total de truges ara mateix[\s\S]*?\) br ON 1 = 1;\n/,
    ''
  );
  return senseVista.replace(
    /-- Baixes de truges[\s\S]*?CREATE TABLE IF NOT EXISTS baixa_truja \([\s\S]*?\);\n\n/,
    ''
  );
}

/** El pas 8 sencer, tal com el fa l'app. */
function migracio8(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS baixa_truja (
      id               TEXT PRIMARY KEY,
      data             TEXT NOT NULL,
      num_truges       INTEGER NOT NULL,
      motiu            TEXT,
      creat_el         TEXT NOT NULL DEFAULT (datetime('now')),
      modificat_el     TEXT NOT NULL DEFAULT (datetime('now')),
      esborrat_el      TEXT,
      sincronitzat_el  TEXT,
      importacio_id    TEXT
    );
  `);
  db.exec(VISTES_SQL);
}

function bandaITipus(db) {
  db.exec(`
    INSERT INTO banda (id, numero) VALUES ('b1', 1);
    INSERT INTO ubicacio_reproduccio (id, tipus, codi) VALUES ('u1', 'inseminacio', 'L1');
  `);
}

// ---------------------------------------------------------------------------
console.log('\nTelèfon que ve de la versió 7');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const v7 = esquemaV7();
  comprova('l’esquema v7 de prova no conté baixa_truja', v7.includes('baixa_truja'), false);
  db.exec(v7);
  bandaITipus(db);

  comprova('abans de migrar no existeix baixa_truja', taulaExisteix(db, 'baixa_truja'), false);

  migracio8(db);

  comprova('després de migrar existeix baixa_truja', taulaExisteix(db, 'baixa_truja'), true);
  comprova(
    'v_cens_truges_actual respon (sense files, cap recompte encara)',
    db.prepare('SELECT * FROM v_cens_truges_actual').all(),
    []
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nInstal·lació nova (l’esquema ja porta la taula i la vista)');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  bandaITipus(db);

  comprova('l’esquema nou ja porta baixa_truja', taulaExisteix(db, 'baixa_truja'), true);

  let error = null;
  try {
    migracio8(db);
  } catch (e) {
    error = e.message;
  }
  comprova('tornar a passar la migració 8 no peta', error, null);

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nEl total es calcula bé: recompte + altes − baixes');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  bandaITipus(db);

  // Recompte manual el dia 1.
  db.exec(`INSERT INTO cens_truges (id, data, num_truges) VALUES ('c1', '2026-01-01', 100)`);

  comprova(
    'sense altes ni baixes, el total és el recompte',
    db.prepare('SELECT total FROM v_cens_truges_actual').get().total,
    100
  );

  // Alta: una banda inseminada el dia 10, 5 primales.
  db.exec(`
    INSERT INTO deslletament
      (id, banda_id, data_desmamat, data_inseminacio, primales)
    VALUES ('d1', 'b1', '2026-01-05', '2026-01-10', 5)
  `);
  // Alta abans del recompte: no hauria de comptar.
  db.exec(`
    INSERT INTO deslletament
      (id, banda_id, data_desmamat, data_inseminacio, primales)
    VALUES ('d0', 'b1', '2025-12-01', '2025-12-20', 999)
  `);
  // Inseminació encara no feta: no compta (primales NULL).
  db.exec(`
    INSERT INTO deslletament (id, banda_id, data_desmamat)
    VALUES ('d2', 'b1', '2026-01-12')
  `);

  comprova(
    'les primales inseminades després del recompte sumen; les d’abans i les pendents no',
    db.prepare('SELECT total, altes FROM v_cens_truges_actual').get(),
    { total: 105, altes: 5 }
  );

  // Baixa per mort el dia 15.
  db.exec(`
    INSERT INTO baixa_truja (id, data, num_truges, motiu) VALUES ('bt1', '2026-01-15', 2, 'malaltia')
  `);
  comprova(
    'la mort resta del total',
    db.prepare('SELECT total, baixes_mort FROM v_cens_truges_actual').get(),
    { total: 103, baixes_mort: 2 }
  );

  // Venda a escorxador com a truges de rebuig el dia 20.
  db.exec(`
    INSERT INTO carrega_escorxador (id, data_carrega, tipus, unitats)
    VALUES ('ce1', '2026-01-20', 'truges_rebuig', 3)
  `);
  comprova(
    'el rebuig també resta',
    db.prepare('SELECT total, baixes_rebuig FROM v_cens_truges_actual').get(),
    { total: 100, baixes_rebuig: 3 }
  );

  // Un segon recompte manual reinicia la base.
  db.exec(`INSERT INTO cens_truges (id, data, num_truges) VALUES ('c2', '2026-02-01', 90)`);
  comprova(
    'un recompte nou i posterior es converteix en la nova base, ignorant l’històric',
    db.prepare('SELECT total, data_recompte FROM v_cens_truges_actual').get(),
    { total: 90, data_recompte: '2026-02-01' }
  );

  // Esborrat tou: una baixa esborrada no ha de comptar.
  db.exec(`
    INSERT INTO baixa_truja (id, data, num_truges, esborrat_el)
    VALUES ('bt2', '2026-02-05', 50, datetime('now'))
  `);
  comprova(
    'una baixa esborrada tova no afecta el total',
    db.prepare('SELECT total FROM v_cens_truges_actual').get().total,
    90
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
