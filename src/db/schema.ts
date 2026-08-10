/**
 * Esquema de la base de dades local (SQLite al dispositiu).
 *
 * Deriva de `docs/model-dades.md`. Si canvia allà, canvia aquí.
 *
 * Tres regles que travessen tot l'esquema:
 *  1. Res s'esborra: `esborrat_el` marca la fila com esborrada, no es fa DELETE.
 *  2. El que es pot calcular no s'escriu: columnes GENERATED i vistes.
 *  3. Els `id` són UUID generats al dispositiu, perquè dos mòbils sense connexió
 *     mai generin el mateix identificador.
 */

/**
 * Columnes que porten totes les taules de dades.
 * `sincronitzat_el` és NULL mentre la fila no ha pujat al servidor.
 */
const COMUNES = `
  creat_el         TEXT NOT NULL DEFAULT (datetime('now')),
  modificat_el     TEXT NOT NULL DEFAULT (datetime('now')),
  esborrat_el      TEXT,
  sincronitzat_el  TEXT,
  importacio_id    TEXT
`;

/**
 * Totes les taules de dades porten les columnes de `COMUNES`.
 * La llista serveix per a les migracions que hi han d'afegir una columna.
 */
export const TAULES_DE_DADES = [
  'sala',
  'corral',
  'ubicacio_reproduccio',
  'banda',
  'deslletament',
  'cens_truges',
  'entrada_llavores',
  'transicio',
  'cicle_engreix',
  'ocupacio_corral',
  'moviment',
  'baixa',
  'carrega_escorxador',
  'linia_carrega',
  'decomis',
  'tipus_pinso',
  'factura_pinso',
  'entrega_pinso',
  'tractament',
];

/**
 * Aquesta vista va a part perquè una migració la pugui tornar a crear
 * sense refer tot l'esquema.
 */
export const VISTA_CICLE_RESUM = `
-- Resum d'un cicle d'engreix. Aquí és on es dedueixen les baixes,
-- que segueix sent la font de veritat (resposta C5).
DROP VIEW IF EXISTS v_cicle_resum;
CREATE VIEW v_cicle_resum AS
SELECT
  ce.id,
  ce.banda_id,
  b.numero                AS banda,
  ce.data_entrada,
  ce.porcs_entrada,
  ce.porcs_sobrants,
  COALESCE(s.porcs_sortida, 0)  AS porcs_sortida,
  ce.porcs_entrada - COALESCE(s.porcs_sortida, 0) - ce.porcs_sobrants AS baixes,
  CASE WHEN (ce.porcs_entrada - ce.porcs_sobrants) > 0
    THEN (ce.porcs_entrada - COALESCE(s.porcs_sortida, 0) - ce.porcs_sobrants) * 1.0
         / (ce.porcs_entrada - ce.porcs_sobrants)
  END                     AS pct_baixes,
  s.data_primera_venda,
  s.data_ultima_sortida,
  CASE WHEN s.data_primera_venda IS NOT NULL
    THEN 9 + (julianday(s.data_primera_venda) - julianday(ce.data_entrada)) / 7.0
  END                     AS edat_primera_venda,
  CASE WHEN s.data_ultima_sortida IS NOT NULL
    THEN 9 + (julianday(s.data_ultima_sortida) - julianday(ce.data_entrada)) / 7.0
  END                     AS edat_ultima_venda
FROM cicle_engreix ce
JOIN banda b ON b.id = ce.banda_id
LEFT JOIN (
  SELECT
    oc.cicle_id,
    SUM(lc.num_porcs)          AS porcs_sortida,
    MIN(ca.data_carrega)       AS data_primera_venda,
    MAX(ca.data_carrega)       AS data_ultima_sortida
  FROM linia_carrega lc
  JOIN carrega_escorxador ca ON ca.id = lc.carrega_id
  -- Un corral s'omple cicle rere cicle. Una sortida s'ha d'atribuir al cicle
  -- que hi havia en aquell moment: l'últim que hi va entrar abans de la
  -- càrrega. Sense això, una sortida del cicle nou també comptaria al vell.
  JOIN ocupacio_corral oc
    ON oc.corral_id = lc.corral_id
   AND oc.esborrat_el IS NULL
   AND oc.data_entrada <= ca.data_carrega
   AND oc.data_entrada = (
     SELECT MAX(oc2.data_entrada) FROM ocupacio_corral oc2
     WHERE oc2.corral_id = lc.corral_id
       AND oc2.esborrat_el IS NULL
       AND oc2.data_entrada <= ca.data_carrega
   )
  WHERE lc.esborrat_el IS NULL AND ca.esborrat_el IS NULL
  GROUP BY oc.cicle_id
) s ON s.cicle_id = ce.id
WHERE ce.esborrat_el IS NULL;
`;

/**
 * Les vistes van a part de les taules perquè una migració que hagi de
 * refer una taula les pugui esborrar abans i tornar-les a crear després.
 * Sense això, un ALTER TABLE ... RENAME peta: SQLite torna a llegir tot
 * l'esquema i troba les vistes apuntant a una taula que ja no hi és.
 */
export const VISTES_SQL = `
-- ---------------------------------------------------------------------------
-- 6. Vistes: tot això es calcula, mai s'escriu
-- ---------------------------------------------------------------------------

-- Porcs que hi ha ara mateix a cada corral:
-- els que van entrar, menys els que han sortit a escorxador, menys les baixes
-- apuntades a mà, més/menys els trasllats.
DROP VIEW IF EXISTS v_ocupacio_actual;
CREATE VIEW v_ocupacio_actual AS
SELECT
  c.id                AS corral_id,
  s.numero            AS sala,
  c.meitat            AS meitat,
  c.numero            AS corral,
  c.capacitat         AS capacitat,
  COALESCE(oc.entrats, 0)
    - COALESCE(lc.sortits, 0)
    - COALESCE(b.baixes, 0)
    - COALESCE(mo.sortits, 0)
    + COALESCE(mi.entrats, 0)  AS porcs
FROM corral c
JOIN sala s ON s.id = c.sala_id
LEFT JOIN (
  SELECT corral_id, SUM(porcs_entrada) AS entrats
  FROM ocupacio_corral WHERE esborrat_el IS NULL AND data_sortida IS NULL
  GROUP BY corral_id
) oc ON oc.corral_id = c.id
LEFT JOIN (
  SELECT corral_id, SUM(num_porcs) AS sortits
  FROM linia_carrega WHERE esborrat_el IS NULL GROUP BY corral_id
) lc ON lc.corral_id = c.id
LEFT JOIN (
  SELECT corral_id, SUM(num_porcs) AS baixes
  FROM baixa WHERE esborrat_el IS NULL GROUP BY corral_id
) b ON b.corral_id = c.id
LEFT JOIN (
  SELECT corral_origen_id AS corral_id, SUM(num_porcs) AS sortits
  FROM moviment WHERE esborrat_el IS NULL GROUP BY corral_origen_id
) mo ON mo.corral_id = c.id
LEFT JOIN (
  SELECT corral_desti_id AS corral_id, SUM(num_porcs) AS entrats
  FROM moviment WHERE esborrat_el IS NULL GROUP BY corral_desti_id
) mi ON mi.corral_id = c.id
WHERE c.esborrat_el IS NULL;

${VISTA_CICLE_RESUM}

-- Ritme de consum per tipus de pinso, per a la previsió d'esgotament.
-- El consum real no es mesura: s'estima a partir del ritme d'entregues.
DROP VIEW IF EXISTS v_consum_pinso;
CREATE VIEW v_consum_pinso AS
SELECT
  tp.id                                   AS tipus_pinso_id,
  tp.codi,
  tp.capacitat_sitja_kg,
  COUNT(ep.id)                            AS num_entregues,
  SUM(ep.kg)                              AS kg_total,
  MIN(ep.data)                            AS primera_entrega,
  MAX(ep.data)                            AS ultima_entrega,
  CASE WHEN julianday(MAX(ep.data)) > julianday(MIN(ep.data))
    THEN SUM(ep.kg) / (julianday(MAX(ep.data)) - julianday(MIN(ep.data)))
  END                                     AS kg_per_dia
FROM tipus_pinso tp
LEFT JOIN entrega_pinso ep
  ON ep.tipus_pinso_id = tp.id AND ep.esborrat_el IS NULL
WHERE tp.esborrat_el IS NULL
GROUP BY tp.id;
`;

export const SCHEMA_SQL = `
-- ---------------------------------------------------------------------------
-- 0. Registre d'importacions de l'Excel
-- ---------------------------------------------------------------------------

-- Una fila per cada importació feta. Quan es desfà, la fila s'esborra de
-- debò (és paperassa nostra, no dades de la granja) i les files que havia
-- creat es marquen com esborrades sense perdre'n el rastre.
CREATE TABLE IF NOT EXISTS importacio (
  id         TEXT PRIMARY KEY,
  generat    TEXT NOT NULL UNIQUE,
  origen     TEXT,
  fet_el     TEXT NOT NULL,
  problemes  INTEGER NOT NULL DEFAULT 0
);

-- ---------------------------------------------------------------------------
-- 1. Estructura física
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS sala (
  id          TEXT PRIMARY KEY,
  numero      INTEGER NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 27),
  capacitat   INTEGER NOT NULL DEFAULT 132,
  activa      INTEGER NOT NULL DEFAULT 1 CHECK (activa IN (0, 1)),
  ${COMUNES}
);

-- Els corrals es numeren 1-6 DINS DE CADA MEITAT, no 1-12.
-- Un corral són sempre sala + meitat + número.
CREATE TABLE IF NOT EXISTS corral (
  id          TEXT PRIMARY KEY,
  sala_id     TEXT NOT NULL REFERENCES sala(id),
  meitat      TEXT NOT NULL CHECK (meitat IN ('E', 'D')),
  numero      INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 6),
  capacitat   INTEGER NOT NULL DEFAULT 11,
  ${COMUNES},
  UNIQUE (sala_id, meitat, numero)
);

CREATE INDEX IF NOT EXISTS idx_corral_sala ON corral(sala_id);

CREATE TABLE IF NOT EXISTS ubicacio_reproduccio (
  id          TEXT PRIMARY KEY,
  tipus       TEXT NOT NULL CHECK (tipus IN ('inseminacio', 'gestacio')),
  codi        TEXT NOT NULL UNIQUE,
  ${COMUNES}
);

-- ---------------------------------------------------------------------------
-- 2. Cicle reproductiu
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS banda (
  id          TEXT PRIMARY KEY,
  numero      INTEGER NOT NULL UNIQUE CHECK (numero BETWEEN 1 AND 7),
  ${COMUNES}
);

-- Una fila = una banda deslletada = una fila del full Cens24.
CREATE TABLE IF NOT EXISTS deslletament (
  id                     TEXT PRIMARY KEY,
  banda_id               TEXT NOT NULL REFERENCES banda(id),
  data_desmamat          TEXT NOT NULL,
  truges_criades         INTEGER,
  truges_desmamades      INTEGER,
  porcs_vius_1a_setmana  INTEGER,
  porcs_desmamats        INTEGER,
  posicio_inseminar_id   TEXT REFERENCES ubicacio_reproduccio(id),
  posicio_gestacio_id    TEXT REFERENCES ubicacio_reproduccio(id),
  observacions           TEXT,

  -- S'omplen més tard, en inseminar (resposta B3)
  data_inseminacio       TEXT,
  insem_total            INTEGER,
  repetidores            INTEGER,
  primales               INTEGER,
  -- I això encara més tard, quan es detecta la gestació
  plenes                 INTEGER,

  -- Calculades: no s'escriuen mai a mà
  pct_baixes_parideres   REAL GENERATED ALWAYS AS (
    CASE WHEN porcs_vius_1a_setmana > 0
      THEN (porcs_vius_1a_setmana - porcs_desmamats) * 1.0 / porcs_vius_1a_setmana
    END) VIRTUAL,
  mitjana_porcs_truja    REAL GENERATED ALWAYS AS (
    CASE WHEN truges_criades > 0
      THEN porcs_desmamats * 1.0 / truges_criades
    END) VIRTUAL,
  pct_plenes             REAL GENERATED ALWAYS AS (
    CASE WHEN insem_total > 0
      THEN plenes * 1.0 / insem_total
    END) VIRTUAL,

  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_deslletament_data ON deslletament(data_desmamat);
CREATE INDEX IF NOT EXISTS idx_deslletament_banda ON deslletament(banda_id);

CREATE TABLE IF NOT EXISTS cens_truges (
  id          TEXT PRIMARY KEY,
  data        TEXT NOT NULL,
  num_truges  INTEGER NOT NULL,
  ${COMUNES}
);

-- Truges de reposició que ENTREN. A l'Excel estan al full d'escorxador,
-- però són compres, no vendes (resposta G2).
CREATE TABLE IF NOT EXISTS entrada_llavores (
  id             TEXT PRIMARY KEY,
  data           TEXT NOT NULL,
  unitats        INTEGER,
  kg             REAL,
  total_factura  REAL,
  preu_kg        REAL,
  promig_kg      REAL GENERATED ALWAYS AS (
    CASE WHEN unitats > 0 THEN kg / unitats END) VIRTUAL,
  ${COMUNES}
);

-- ---------------------------------------------------------------------------
-- 3. Transició i engreix
-- ---------------------------------------------------------------------------

-- La transició es fa en una altra granja: només en guardem les dues xifres
-- que permeten deduir-ne les baixes (resposta G1).
CREATE TABLE IF NOT EXISTS transicio (
  id                TEXT PRIMARY KEY,
  deslletament_id   TEXT NOT NULL UNIQUE REFERENCES deslletament(id),
  porcs_sortida     INTEGER,
  porcs_retorn      INTEGER,
  baixes_transicio  INTEGER GENERATED ALWAYS AS (
    porcs_sortida - porcs_retorn) VIRTUAL,
  pct_baixes        REAL GENERATED ALWAYS AS (
    CASE WHEN porcs_sortida > 0
      THEN (porcs_sortida - porcs_retorn) * 1.0 / porcs_sortida
    END) VIRTUAL,
  ${COMUNES}
);

CREATE TABLE IF NOT EXISTS cicle_engreix (
  id               TEXT PRIMARY KEY,
  banda_id         TEXT NOT NULL REFERENCES banda(id),
  deslletament_id  TEXT REFERENCES deslletament(id),
  data_entrada     TEXT NOT NULL,
  porcs_entrada    INTEGER NOT NULL,
  porcs_sobrants   INTEGER NOT NULL DEFAULT 0,
  observacions     TEXT,
  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_cicle_banda ON cicle_engreix(banda_id);

CREATE TABLE IF NOT EXISTS ocupacio_corral (
  id             TEXT PRIMARY KEY,
  cicle_id       TEXT NOT NULL REFERENCES cicle_engreix(id),
  corral_id      TEXT NOT NULL REFERENCES corral(id),
  data_entrada   TEXT NOT NULL,
  porcs_entrada  INTEGER NOT NULL,
  data_sortida   TEXT,
  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_ocupacio_corral ON ocupacio_corral(corral_id);
CREATE INDEX IF NOT EXISTS idx_ocupacio_cicle ON ocupacio_corral(cicle_id);

-- Un corral només pot constar un cop per cicle, però NOMÉS entre les files
-- vives: editar un cicle deixa enrere files marcades com esborrades i el
-- mateix corral hi ha de poder tornar a entrar.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ocupacio_unica
  ON ocupacio_corral(cicle_id, corral_id) WHERE esborrat_el IS NULL;

-- Trasllat de porcs entre corrals (els "sobrants"). NO és una baixa.
CREATE TABLE IF NOT EXISTS moviment (
  id                TEXT PRIMARY KEY,
  data              TEXT NOT NULL,
  corral_origen_id  TEXT NOT NULL REFERENCES corral(id),
  corral_desti_id   TEXT NOT NULL REFERENCES corral(id),
  num_porcs         INTEGER NOT NULL,
  motiu             TEXT,
  ${COMUNES},
  CHECK (corral_origen_id <> corral_desti_id)
);

-- Registre manual de baixes: OPCIONAL i no és la font de veritat.
-- El número bo segueix sent el calculat per diferència a v_cicle_resum.
CREATE TABLE IF NOT EXISTS baixa (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  corral_id  TEXT NOT NULL REFERENCES corral(id),
  num_porcs  INTEGER NOT NULL,
  motiu      TEXT,
  ${COMUNES}
);

-- ---------------------------------------------------------------------------
-- 4. Sortides a escorxador
-- ---------------------------------------------------------------------------

-- El camió/factura. S'introdueix UN COP: aquí van la data i el pes mitjà.
CREATE TABLE IF NOT EXISTS carrega_escorxador (
  id                TEXT PRIMARY KEY,
  data_carrega      TEXT NOT NULL,
  tipus             TEXT NOT NULL CHECK (tipus IN ('porcs_engreix', 'truges_rebuig')),
  unitats           INTEGER,
  kg                REAL,
  kg_canal          REAL,
  total_factura     REAL,
  preu_kg           REAL,
  preu_referencia   REAL,
  rendiment         REAL GENERATED ALWAYS AS (
    CASE WHEN kg > 0 THEN kg_canal / kg END) VIRTUAL,
  promig_kg         REAL GENERATED ALWAYS AS (
    CASE WHEN unitats > 0 THEN kg / unitats END) VIRTUAL,
  diferencia        REAL GENERATED ALWAYS AS (preu_kg - preu_referencia) VIRTUAL,
  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_carrega_data ON carrega_escorxador(data_carrega);

-- El desglossament per corral. A la nau NOMÉS s'apunta el nombre de porcs:
-- la data i el pes mitjà surten de carrega_escorxador (resposta E4).
CREATE TABLE IF NOT EXISTS linia_carrega (
  id          TEXT PRIMARY KEY,
  carrega_id  TEXT NOT NULL REFERENCES carrega_escorxador(id),
  corral_id   TEXT NOT NULL REFERENCES corral(id),
  num_porcs   INTEGER NOT NULL,
  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_linia_carrega ON linia_carrega(carrega_id);
CREATE INDEX IF NOT EXISTS idx_linia_corral ON linia_carrega(corral_id);

-- Porcs que no es cobren. D4 = rebutjat per l'escorxador, D5 = mort al transport.
CREATE TABLE IF NOT EXISTS decomis (
  id          TEXT PRIMARY KEY,
  carrega_id  TEXT NOT NULL REFERENCES carrega_escorxador(id),
  codi        TEXT NOT NULL CHECK (codi IN ('D4', 'D5')),
  num_porcs   INTEGER NOT NULL,
  ${COMUNES}
);

-- ---------------------------------------------------------------------------
-- 5. Pinso
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS tipus_pinso (
  id                   TEXT PRIMARY KEY,
  codi                 TEXT NOT NULL UNIQUE,
  descripcio           TEXT,
  capacitat_sitja_kg   REAL,
  ${COMUNES}
);

CREATE TABLE IF NOT EXISTS factura_pinso (
  id                             TEXT PRIMARY KEY,
  data                           TEXT NOT NULL,
  import_pinso                   REAL,
  import_medicaments             REAL,
  import_medicaments_sense_iva   REAL,
  total_factura                  REAL GENERATED ALWAYS AS (
    COALESCE(import_pinso, 0) + COALESCE(import_medicaments, 0)) VIRTUAL,
  ${COMUNES}
);

-- Una fila = una entrega d'un tipus. El pinso és de granja, no de sala (D4).
CREATE TABLE IF NOT EXISTS entrega_pinso (
  id              TEXT PRIMARY KEY,
  data            TEXT NOT NULL,
  tipus_pinso_id  TEXT NOT NULL REFERENCES tipus_pinso(id),
  kg              REAL NOT NULL,
  factura_id      TEXT REFERENCES factura_pinso(id),
  ${COMUNES}
);

CREATE INDEX IF NOT EXISTS idx_entrega_data ON entrega_pinso(data);
CREATE INDEX IF NOT EXISTS idx_entrega_tipus ON entrega_pinso(tipus_pinso_id);

-- No existeix a l'Excel. Opcional (resposta D5).
CREATE TABLE IF NOT EXISTS tractament (
  id         TEXT PRIMARY KEY,
  data       TEXT NOT NULL,
  sala_id    TEXT REFERENCES sala(id),
  corral_id  TEXT REFERENCES corral(id),
  producte   TEXT NOT NULL,
  dosi       TEXT,
  motiu      TEXT,
  ${COMUNES}
);

${VISTES_SQL}
`;
