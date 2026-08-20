/**
 * Proves de la migració 6 contra SQLite de debò.
 *
 *   node --experimental-strip-types --experimental-sqlite scripts/prova-migracio-6.mjs
 *
 * Aquí no hi ha telèfon ni Expo: només l'SQL, executat sobre bases de dades
 * de joguina. En aquest projecte tots els errors de veritat (la vista que
 * atribuïa malament els cicles, l'UNIQUE que xocava amb l'esborrat, la
 * migració que deixava la base de dades a mitges) han sortit d'aquí i cap
 * d'ells del `tsc`.
 *
 * Es proven els dos camins, que és on ha petat sempre:
 *  - un telèfon que ve de la versió 5 i s'ha d'actualitzar,
 *  - i una instal·lació nova, on l'esquema ja porta les novetats i la
 *    migració es torna a passar per sobre.
 */

import { DatabaseSync } from 'node:sqlite';

import { SCHEMA_SQL } from '../src/db/schema.ts';

// Còpia exacta de l'SQL de la migració 6 a src/db/index.ts. La comprovació de
// si la columna ja hi és la fa el codi de l'app; aquí la simulem.
const MIGRACIO_6_TAULA = `
  CREATE TABLE IF NOT EXISTS article_proveidor (
    id               TEXT PRIMARY KEY,
    codi             TEXT NOT NULL,
    proveidor        TEXT,
    tipus_pinso_id   TEXT NOT NULL REFERENCES tipus_pinso(id),
    creat_el         TEXT NOT NULL DEFAULT (datetime('now')),
    modificat_el     TEXT NOT NULL DEFAULT (datetime('now')),
    esborrat_el      TEXT,
    sincronitzat_el  TEXT,
    importacio_id    TEXT
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_article_codi
    ON article_proveidor(codi) WHERE esborrat_el IS NULL;

  CREATE INDEX IF NOT EXISTS idx_entrega_albara ON entrega_pinso(albara);
`;

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

function peta(nom, fn) {
  try {
    fn();
    malament++;
    console.log(`  ✗ ${nom} — havia de fallar i no ha fallat`);
  } catch {
    ok++;
    console.log(`  ✓ ${nom}`);
  }
}

function columnes(db, taula) {
  return db.prepare(`PRAGMA table_info(${taula})`).all().map((c) => c.name);
}

/** Igual que columnaExisteix() a src/db/index.ts. */
function columnaExisteix(db, taula, columna) {
  return columnes(db, taula).includes(columna);
}

/** El pas 6 sencer, tal com el fa l'app. */
function migracio6(db) {
  if (!columnaExisteix(db, 'entrega_pinso', 'albara')) {
    db.exec('ALTER TABLE entrega_pinso ADD COLUMN albara TEXT');
  }
  db.exec(MIGRACIO_6_TAULA);
}

/**
 * L'esquema tal com era a la versió 5: sense la columna albara i sense la
 * taula d'articles. Es treuen del SCHEMA_SQL d'ara per no haver de mantenir
 * una segona còpia que se'ns quedaria antiga.
 */
function esquemaV5() {
  return SCHEMA_SQL.replace(/^\s*albara\s+TEXT,\s*$/m, '')
    .replace(/CREATE TABLE IF NOT EXISTS article_proveidor[\s\S]*?\);/, '')
    .replace(/CREATE UNIQUE INDEX IF NOT EXISTS idx_article_codi[\s\S]*?;/, '')
    .replace(/CREATE INDEX IF NOT EXISTS idx_entrega_albara[\s\S]*?;/, '');
}

function tipusDeProva(db) {
  db.exec(`
    INSERT INTO tipus_pinso (id, codi, descripcio) VALUES
      ('t-gest', 'GESTACIO', 'Gestació'),
      ('t-lact', 'LACTACIO', 'Lactació');
  `);
}

// ---------------------------------------------------------------------------
console.log('\nTelèfon que ve de la versió 5');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(esquemaV5());
  tipusDeProva(db);

  comprova(
    'abans de migrar no hi ha la columna albara',
    columnaExisteix(db, 'entrega_pinso', 'albara'),
    false
  );

  // Dades que ja hi havia al telèfon: s'han de conservar.
  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg)
    VALUES ('e1', '2026-07-01', 't-gest', 24000);
  `);

  migracio6(db);

  comprova(
    'després de migrar hi ha la columna albara',
    columnaExisteix(db, 'entrega_pinso', 'albara'),
    true
  );
  comprova(
    'les entregues d’abans segueixen allà',
    db.prepare('SELECT id, kg, albara FROM entrega_pinso').all(),
    [{ id: 'e1', kg: 24000, albara: null }]
  );
  comprova(
    'la taula d’articles existeix',
    db
      .prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='article_proveidor'"
      )
      .get().n,
    1
  );

  // Les vistes han de seguir funcionant: ADD COLUMN no les hauria de tocar,
  // però és exactament el que va petar a la migració 3.
  comprova(
    'v_consum_pinso segueix responent',
    typeof db.prepare('SELECT COUNT(*) AS n FROM v_consum_pinso').get().n,
    'number'
  );
  comprova(
    'v_ocupacio_actual segueix responent',
    typeof db.prepare('SELECT COUNT(*) AS n FROM v_ocupacio_actual').get().n,
    'number'
  );
  comprova(
    'v_cicle_resum segueix responent',
    typeof db.prepare('SELECT COUNT(*) AS n FROM v_cicle_resum').get().n,
    'number'
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nInstal·lació nova (l’esquema ja porta les novetats)');
{
  // Aquest és el cas que va petar amb la migració 5: l'esquema nou ja crea la
  // columna, i la migració la tornava a afegir → "duplicate column name".
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  tipusDeProva(db);

  comprova(
    'l’esquema nou ja porta la columna albara',
    columnaExisteix(db, 'entrega_pinso', 'albara'),
    true
  );

  let error = null;
  try {
    migracio6(db);
  } catch (e) {
    error = e.message;
  }
  comprova('tornar a passar la migració 6 no peta', error, null);

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nÍndex únic parcial dels codis d’article');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  tipusDeProva(db);

  db.exec(
    `INSERT INTO article_proveidor (id, codi, tipus_pinso_id)
     VALUES ('a1', 'PTCGD', 't-gest')`
  );

  peta('el mateix codi dos cops estant viu es rebutja', () => {
    db.exec(
      `INSERT INTO article_proveidor (id, codi, tipus_pinso_id)
       VALUES ('a2', 'PTCGD', 't-lact')`
    );
  });

  // Trampa coneguda del projecte: amb un UNIQUE normal, després d'esborrar
  // (que aquí vol dir marcar) no es podria tornar a donar d'alta el codi.
  db.exec(`UPDATE article_proveidor SET esborrat_el = datetime('now') WHERE id = 'a1'`);
  let error = null;
  try {
    db.exec(
      `INSERT INTO article_proveidor (id, codi, tipus_pinso_id)
       VALUES ('a2', 'PTCGD', 't-lact')`
    );
  } catch (e) {
    error = e.message;
  }
  comprova('després d’esborrar-lo es pot tornar a donar d’alta', error, null);

  comprova(
    'només en queda un de viu',
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM article_proveidor
          WHERE codi = 'PTCGD' AND esborrat_el IS NULL`
      )
      .get().n,
    1
  );

  peta('el tipus de pinso ha d’existir', () => {
    db.exec(
      `INSERT INTO article_proveidor (id, codi, tipus_pinso_id)
       VALUES ('a3', 'PPDGD', 'no-existeix')`
    );
  });

  db.close();
}

// ---------------------------------------------------------------------------
console.log('\nNo apuntar dos cops el mateix albarà');
{
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  tipusDeProva(db);

  // Les tres línies de docs/pinso-example.jpeg, com les desaria la pantalla.
  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg, albara) VALUES
      ('e1', '2026-08-07', 't-gest', 9000, '347570'),
      ('e2', '2026-08-07', 't-lact', 8995, '347570'),
      ('e3', '2026-08-07', 't-gest', 9009, '347570');
  `);

  // La consulta exacta d'albaraJaApuntat().
  const jaHiEs = (numero) =>
    db
      .prepare(
        `SELECT data, SUM(kg) AS kg FROM entrega_pinso
          WHERE albara = ? AND esborrat_el IS NULL`
      )
      .get(numero);

  comprova('un albarà apuntat es detecta, amb el total', jaHiEs('347570'), {
    data: '2026-08-07',
    kg: 27004,
  });
  comprova('un albarà que no hi és torna kg nul', jaHiEs('999999').kg, null);

  // Si s'esborra l'entrega, l'albarà s'ha de poder tornar a apuntar.
  db.exec(`UPDATE entrega_pinso SET esborrat_el = datetime('now')`);
  comprova('un cop esborrades, l’albarà ja no consta', jaHiEs('347570').kg, null);

  // Les entregues apuntades a mà no porten albarà i no s'han de creuar.
  db.exec(`
    INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg)
    VALUES ('e4', '2026-08-09', 't-gest', 5000);
  `);
  comprova(
    'les entregues sense albarà no es confonen entre elles',
    jaHiEs(null).kg,
    null
  );

  db.close();
}

// ---------------------------------------------------------------------------
console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
