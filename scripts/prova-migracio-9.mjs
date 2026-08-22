/**
 * Proves de la migració 9 (posicions múltiples d'inseminar/gestació)
 * contra SQLite de debò.
 *
 *   node --experimental-strip-types --experimental-sqlite scripts/prova-migracio-9.mjs
 */

import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL } from '../src/db/schema.ts';

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

function columnes(db, taula) {
  return db.prepare(`PRAGMA table_info(${taula})`).all().map((c) => c.name);
}

function columnaExisteix(db, taula, columna) {
  return columnes(db, taula).includes(columna);
}

function taulaExisteix(db, nom) {
  return (
    db
      .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(nom).n > 0
  );
}

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/** El pas 9 sencer, tal com el fa l'app (versió síncrona per node:sqlite). */
function migracio9(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS deslletament_posicio (
      id               TEXT PRIMARY KEY,
      deslletament_id  TEXT NOT NULL REFERENCES deslletament(id),
      ubicacio_id      TEXT NOT NULL REFERENCES ubicacio_reproduccio(id),
      creat_el         TEXT NOT NULL DEFAULT (datetime('now')),
      modificat_el     TEXT NOT NULL DEFAULT (datetime('now')),
      esborrat_el      TEXT,
      sincronitzat_el  TEXT,
      importacio_id    TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_deslpos_deslletament
      ON deslletament_posicio(deslletament_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_deslpos_unica
      ON deslletament_posicio(deslletament_id, ubicacio_id) WHERE esborrat_el IS NULL;
  `);

  if (columnaExisteix(db, 'deslletament', 'posicio_inseminar_id')) {
    const files = db
      .prepare(
        'SELECT id, posicio_inseminar_id, posicio_gestacio_id, importacio_id FROM deslletament'
      )
      .all();

    const insereix = db.prepare(
      `INSERT INTO deslletament_posicio (id, deslletament_id, ubicacio_id, importacio_id)
       VALUES (?, ?, ?, ?)`
    );
    for (const f of files) {
      for (const ubicacioId of [f.posicio_inseminar_id, f.posicio_gestacio_id]) {
        if (!ubicacioId) continue;
        insereix.run(uuid(), f.id, ubicacioId, f.importacio_id);
      }
    }

    db.exec('ALTER TABLE deslletament DROP COLUMN posicio_inseminar_id');
    db.exec('ALTER TABLE deslletament DROP COLUMN posicio_gestacio_id');
  }
}

/** L'esquema tal com era a la v8: amb les dues columnes soles. */
function esquemaV8() {
  return SCHEMA_SQL.replace(
    /  porcs_vius_1a_setmana  INTEGER,\n  porcs_desmamats        INTEGER,\n  observacions           TEXT,/,
    `  porcs_vius_1a_setmana  INTEGER,
  porcs_desmamats        INTEGER,
  posicio_inseminar_id   TEXT REFERENCES ubicacio_reproduccio(id),
  posicio_gestacio_id    TEXT REFERENCES ubicacio_reproduccio(id),
  observacions           TEXT,`
  ).replace(
    /-- Posicions d'inseminar\/gestació[\s\S]*?WHERE esborrat_el IS NULL;\n\n/,
    ''
  );
}

function bandaIUbicacions(db) {
  db.exec(`INSERT INTO banda (id, numero) VALUES ('b1', 1)`);
  db.exec(`
    INSERT INTO ubicacio_reproduccio (id, tipus, codi) VALUES
      ('u-l1', 'inseminacio', 'L1'),
      ('u-l2', 'inseminacio', 'L2'),
      ('u-l4', 'inseminacio', 'L4'),
      ('u-be', 'gestacio', 'Benestar esquerra'),
      ('u-bd', 'gestacio', 'Benestar dreta');
  `);
}

// ---------------------------------------------------------------------------
console.log('\nTelèfon que ve de la versió 8, amb dades a les columnes velles');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  const v8 = esquemaV8();
  comprova('l’esquema v8 de prova no té deslletament_posicio', v8.includes('deslletament_posicio'), false);
  db.exec(v8);
  bandaIUbicacions(db);

  db.exec(`
    INSERT INTO deslletament
      (id, banda_id, data_desmamat, posicio_inseminar_id, posicio_gestacio_id)
    VALUES ('d1', 'b1', '2026-01-05', 'u-l1', 'u-be')
  `);

  migracio9(db);

  comprova('després de migrar existeix deslletament_posicio', taulaExisteix(db, 'deslletament_posicio'), true);
  comprova(
    'les columnes velles han desaparegut',
    columnaExisteix(db, 'deslletament', 'posicio_inseminar_id') ||
      columnaExisteix(db, 'deslletament', 'posicio_gestacio_id'),
    false
  );
  comprova(
    'les dades velles s’han migrat a la taula pont',
    db
      .prepare(
        'SELECT ubicacio_id FROM deslletament_posicio WHERE deslletament_id = ? ORDER BY ubicacio_id'
      )
      .all('d1')
      .map((r) => r.ubicacio_id),
    ['u-be', 'u-l1']
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nInstal·lació nova (l’esquema ja porta la taula pont)');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  bandaIUbicacions(db);

  comprova('l’esquema nou ja porta deslletament_posicio', taulaExisteix(db, 'deslletament_posicio'), true);
  comprova(
    'l’esquema nou NO té les columnes velles',
    columnaExisteix(db, 'deslletament', 'posicio_inseminar_id'),
    false
  );

  let error = null;
  try {
    migracio9(db);
  } catch (e) {
    error = e.message;
  }
  comprova('tornar a passar la migració 9 no peta', error, null);

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nUn deslletament amb dues posicions d’inseminar a la vegada');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  bandaIUbicacions(db);

  db.exec(`INSERT INTO deslletament (id, banda_id, data_desmamat) VALUES ('d1', 'b1', '2026-01-05')`);
  const insereix = db.prepare(
    'INSERT INTO deslletament_posicio (id, deslletament_id, ubicacio_id) VALUES (?, ?, ?)'
  );
  insereix.run('p1', 'd1', 'u-l2');
  insereix.run('p2', 'd1', 'u-l4');

  comprova(
    'les dues posicions d’inseminar es llegeixen totes dues',
    db
      .prepare(
        `SELECT u.codi FROM deslletament_posicio dp
         JOIN ubicacio_reproduccio u ON u.id = dp.ubicacio_id
         WHERE dp.deslletament_id = ? AND dp.esborrat_el IS NULL
         ORDER BY u.codi`
      )
      .all('d1')
      .map((r) => r.codi),
    ['L2', 'L4']
  );

  // Reeditar: s'esborren totes les velles i es desen les noves (patró de l'app).
  db.exec(
    `UPDATE deslletament_posicio SET esborrat_el = datetime('now') WHERE deslletament_id = 'd1'`
  );
  insereix.run('p3', 'd1', 'u-l1');
  comprova(
    'reeditar la selecció substitueix les posicions, no les acumula',
    db
      .prepare(
        `SELECT u.codi FROM deslletament_posicio dp
         JOIN ubicacio_reproduccio u ON u.id = dp.ubicacio_id
         WHERE dp.deslletament_id = ? AND dp.esborrat_el IS NULL`
      )
      .all('d1')
      .map((r) => r.codi),
    ['L1']
  );

  // Únic parcial: no es pot duplicar la mateixa posició viva dues vegades.
  let errorDuplicat = null;
  try {
    insereix.run('p4', 'd1', 'u-l1');
  } catch (e) {
    errorDuplicat = e.message;
  }
  comprova('l’índex únic parcial rebutja un duplicat viu', errorDuplicat != null, true);

  db.close();
}

// ---------------------------------------------------------------------------
console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
