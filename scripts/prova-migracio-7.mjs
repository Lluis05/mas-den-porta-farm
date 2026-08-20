/**
 * Proves de la migració 7 contra SQLite de debò.
 *
 *   node --experimental-strip-types --experimental-sqlite scripts/prova-migracio-7.mjs
 *
 * Mateix estil que prova-migracio-6.mjs: dos camins, un telèfon que ve de la
 * versió 6 i una instal·lació nova on l'esquema ja porta les columnes noves.
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

/** Igual que columnaExisteix() a src/db/index.ts. */
function columnaExisteix(db, taula, columna) {
  return columnes(db, taula).includes(columna);
}

/** El pas 7 sencer, tal com el fa l'app. */
function migracio7(db) {
  if (!columnaExisteix(db, 'entrega_pinso', 'medicat')) {
    db.exec('ALTER TABLE entrega_pinso ADD COLUMN medicat INTEGER NOT NULL DEFAULT 0');
  }
  if (!columnaExisteix(db, 'entrega_pinso', 'prescripcio')) {
    db.exec('ALTER TABLE entrega_pinso ADD COLUMN prescripcio TEXT');
  }
}

/**
 * L'esquema tal com era a la versió 6: sense medicat ni prescripcio. Es
 * treuen del SCHEMA_SQL d'ara per no mantenir una segona còpia.
 */
function esquemaV6() {
  return SCHEMA_SQL.replace(/^\s*medicat\s+INTEGER NOT NULL DEFAULT 0,\s*$/m, '')
    .replace(/^\s*prescripcio\s+TEXT,\s*$/m, '');
}

function tipusDeProva(db) {
  db.exec(`
    INSERT INTO tipus_pinso (id, codi, descripcio) VALUES
      ('t-gest', 'GESTACIO', 'Gestació'),
      ('t-lact', 'LACTACIO', 'Lactació');
  `);
}

// ---------------------------------------------------------------------------
console.log('\nTelèfon que ve de la versió 6');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(esquemaV6());
  tipusDeProva(db);

  comprova(
    'abans de migrar no hi ha la columna medicat',
    columnaExisteix(db, 'entrega_pinso', 'medicat'),
    false
  );

  // Dades que ja hi havia al telèfon: s'han de conservar.
  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg, albara)
    VALUES ('e1', '2026-08-06', 't-gest', 9004, '347425');
  `);

  migracio7(db);

  comprova(
    'després de migrar hi ha les columnes noves',
    columnaExisteix(db, 'entrega_pinso', 'medicat') &&
      columnaExisteix(db, 'entrega_pinso', 'prescripcio'),
    true
  );
  comprova(
    'les entregues d’abans es queden amb medicat=0',
    db.prepare('SELECT id, kg, medicat, prescripcio FROM entrega_pinso').all(),
    [{ id: 'e1', kg: 9004, medicat: 0, prescripcio: null }]
  );

  // Les vistes no haurien de patir res: ADD COLUMN no les toca.
  comprova(
    'v_consum_pinso segueix responent',
    typeof db.prepare('SELECT COUNT(*) AS n FROM v_consum_pinso').get().n,
    'number'
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nInstal·lació nova (l’esquema ja porta les novetats)');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  tipusDeProva(db);

  comprova(
    'l’esquema nou ja porta les columnes',
    columnaExisteix(db, 'entrega_pinso', 'medicat') &&
      columnaExisteix(db, 'entrega_pinso', 'prescripcio'),
    true
  );

  let error = null;
  try {
    migracio7(db);
  } catch (e) {
    error = e.message;
  }
  comprova('tornar a passar la migració 7 no peta', error, null);

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nUna entrega medicada es desa i es pot consultar');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  tipusDeProva(db);

  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg, albara, medicat, prescripcio)
    VALUES ('e1', '2026-08-06', 't-gest', 9004, '347425', 1, 'P-25-B425-703-2026');
  `);

  comprova(
    'es llegeix igual que s’ha desat',
    db.prepare('SELECT medicat, prescripcio FROM entrega_pinso WHERE id = ?').get('e1'),
    { medicat: 1, prescripcio: 'P-25-B425-703-2026' }
  );
  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg)
    VALUES ('e2', '2026-08-07', 't-gest', 5000);
  `);
  comprova(
    'entrega manual sense medicat surt en 0',
    db.prepare('SELECT medicat, prescripcio FROM entrega_pinso WHERE id = ?').get('e2'),
    { medicat: 0, prescripcio: null }
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
