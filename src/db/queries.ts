import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import { reparteix, type Meitat } from '@/lib/corrals';

/**
 * Totes les consultes viuen aquí, no dins de les pantalles.
 * Així una pantalla només s'ocupa de mostrar coses, i si canvia l'esquema
 * només s'ha de tocar aquest fitxer.
 */

export type Banda = { id: string; numero: number };
export type Sala = { id: string; numero: number; capacitat: number };
export type Corral = {
  id: string;
  sala_id: string;
  meitat: Meitat;
  numero: number;
  capacitat: number;
};

export async function llistaBandes(db: SQLiteDatabase): Promise<Banda[]> {
  return db.getAllAsync<Banda>(
    'SELECT id, numero FROM banda WHERE esborrat_el IS NULL ORDER BY numero'
  );
}

export async function llistaSales(db: SQLiteDatabase): Promise<Sala[]> {
  return db.getAllAsync<Sala>(
    `SELECT id, numero, capacitat FROM sala
     WHERE esborrat_el IS NULL AND activa = 1 ORDER BY numero`
  );
}

/** Tots els corrals de la granja, ordenats per sala i amb l'esquerra primer. */
export async function llistaCorrals(db: SQLiteDatabase): Promise<Corral[]> {
  return db.getAllAsync<Corral>(
    `SELECT c.id, c.sala_id, c.meitat, c.numero, c.capacitat
     FROM corral c JOIN sala s ON s.id = c.sala_id
     WHERE c.esborrat_el IS NULL
     ORDER BY s.numero, c.meitat DESC, c.numero`
  );
}

// ---------------------------------------------------------------------------
// Crear un cicle d'engreix
// ---------------------------------------------------------------------------

export type SalaDelCicle = {
  /** Corrals on han entrat porcs, en l'ordre que es mostren. */
  corralIds: string[];
  /** Porcs que entren a aquesta sala. Es reparteixen entre els corrals. */
  porcs: number;
};

export type NouCicle = {
  bandaId: string;
  dataEntrada: string;
  observacions?: string;
  sales: SalaDelCicle[];
};

/**
 * Crea el cicle i l'ocupació de cada corral d'una tacada.
 *
 * L'usuari escriu els porcs **per sala** i marca els corrals; aquí es
 * reparteix la xifra entre els corrals marcats i es desa a nivell de corral.
 * Si alguna cosa falla, la transacció ho desfà tot: mai queda un cicle a mitges.
 */
export async function creaCicle(
  db: SQLiteDatabase,
  dades: NouCicle
): Promise<string> {
  const cicleId = Crypto.randomUUID();
  const totalPorcs = dades.sales.reduce((suma, s) => suma + s.porcs, 0);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO cicle_engreix
         (id, banda_id, data_entrada, porcs_entrada, observacions)
       VALUES (?, ?, ?, ?, ?)`,
      cicleId,
      dades.bandaId,
      dades.dataEntrada,
      totalPorcs,
      dades.observacions ?? null
    );

    for (const sala of dades.sales) {
      const repartiment = reparteix(sala.porcs, sala.corralIds.length);
      for (let i = 0; i < sala.corralIds.length; i++) {
        await db.runAsync(
          `INSERT INTO ocupacio_corral
             (id, cicle_id, corral_id, data_entrada, porcs_entrada)
           VALUES (?, ?, ?, ?, ?)`,
          Crypto.randomUUID(),
          cicleId,
          sala.corralIds[i],
          dades.dataEntrada,
          repartiment[i]
        );
      }
    }
  });

  return cicleId;
}

// ---------------------------------------------------------------------------
// Consultar cicles
// ---------------------------------------------------------------------------

/**
 * Un cicle amb porcs ja sortits no es pot tocar: si es canviés l'ocupació,
 * les càrregues ja desades apuntarien a corrals que ja no quadren.
 * Primer s'han d'esborrar les càrregues.
 */
export async function cicleTeSortides(
  db: SQLiteDatabase,
  cicleId: string
): Promise<boolean> {
  const fila = await db.getFirstAsync<{ porcs_sortida: number }>(
    'SELECT porcs_sortida FROM v_cicle_resum WHERE id = ?',
    cicleId
  );
  return (fila?.porcs_sortida ?? 0) > 0;
}

/** Els valors d'un cicle per tornar a omplir el formulari. */
export type CicleEditable = {
  banda_id: string;
  data_entrada: string;
  observacions: string | null;
  corrals: { corral_id: string; sala_id: string; porcs_entrada: number }[];
};

export async function ciclePerEditar(
  db: SQLiteDatabase,
  cicleId: string
): Promise<CicleEditable | null> {
  const cap = await db.getFirstAsync<{
    banda_id: string;
    data_entrada: string;
    observacions: string | null;
  }>(
    `SELECT banda_id, data_entrada, observacions FROM cicle_engreix
     WHERE id = ? AND esborrat_el IS NULL`,
    cicleId
  );
  if (!cap) return null;

  const corrals = await db.getAllAsync<{
    corral_id: string;
    sala_id: string;
    porcs_entrada: number;
  }>(
    `SELECT oc.corral_id, c.sala_id, oc.porcs_entrada
     FROM ocupacio_corral oc
     JOIN corral c ON c.id = oc.corral_id
     WHERE oc.cicle_id = ? AND oc.esborrat_el IS NULL`,
    cicleId
  );

  return { ...cap, corrals };
}

/**
 * Desa els canvis d'un cicle. L'ocupació es refà sencera: s'esborren les
 * files antigues (marcant-les, no es perden) i s'escriuen les noves.
 */
export async function actualitzaCicle(
  db: SQLiteDatabase,
  cicleId: string,
  dades: NouCicle
): Promise<void> {
  const totalPorcs = dades.sales.reduce((suma, s) => suma + s.porcs, 0);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE cicle_engreix SET
         banda_id = ?, data_entrada = ?, porcs_entrada = ?, observacions = ?,
         modificat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      dades.bandaId,
      dades.dataEntrada,
      totalPorcs,
      dades.observacions ?? null,
      cicleId
    );

    await db.runAsync(
      `UPDATE ocupacio_corral
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE cicle_id = ? AND esborrat_el IS NULL`,
      cicleId
    );

    for (const sala of dades.sales) {
      const repartiment = reparteix(sala.porcs, sala.corralIds.length);
      for (let i = 0; i < sala.corralIds.length; i++) {
        await db.runAsync(
          `INSERT INTO ocupacio_corral
             (id, cicle_id, corral_id, data_entrada, porcs_entrada)
           VALUES (?, ?, ?, ?, ?)`,
          Crypto.randomUUID(),
          cicleId,
          sala.corralIds[i],
          dades.dataEntrada,
          repartiment[i]
        );
      }
    }
  });
}

/** Esborrat tou: la fila es marca, mai es perd (regla del model de dades). */
export async function esborraCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE ocupacio_corral
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE cicle_id = ? AND esborrat_el IS NULL`,
      cicleId
    );
    await db.runAsync(
      `UPDATE cicle_engreix
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      cicleId
    );
  });
}

export type CicleLlista = {
  id: string;
  banda: number;
  data_entrada: string;
  porcs_entrada: number;
  porcs_sortida: number;
  queden: number;
  num_corrals: number;
};

export async function llistaCicles(
  db: SQLiteDatabase,
  limit?: number
): Promise<CicleLlista[]> {
  return db.getAllAsync<CicleLlista>(
    `SELECT
       r.id, r.banda, r.data_entrada, r.porcs_entrada,
       r.porcs_sortida,
       r.porcs_entrada - r.porcs_sortida AS queden,
       (SELECT COUNT(*) FROM ocupacio_corral oc
         WHERE oc.cicle_id = r.id AND oc.esborrat_el IS NULL) AS num_corrals
     FROM v_cicle_resum r
     ORDER BY r.data_entrada DESC, r.banda
     LIMIT ?`,
    limit ?? -1
  );
}

export type CicleResum = {
  id: string;
  banda: number;
  data_entrada: string;
  porcs_entrada: number;
  porcs_sortida: number;
  porcs_sobrants: number;
  baixes: number;
  pct_baixes: number | null;
  data_primera_venda: string | null;
  data_ultima_sortida: string | null;
  edat_primera_venda: number | null;
  edat_ultima_venda: number | null;
};

export async function resumCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<CicleResum | null> {
  return db.getFirstAsync<CicleResum>(
    'SELECT * FROM v_cicle_resum WHERE id = ?',
    cicleId
  );
}

export type OcupacioFila = {
  sala: number;
  meitat: Meitat;
  corral: number;
  porcs_entrada: number;
  porcs_ara: number;
};

/** Els corrals d'un cicle, amb els porcs que hi van entrar i els que hi ha ara. */
export async function ocupacioDelCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<OcupacioFila[]> {
  return db.getAllAsync<OcupacioFila>(
    `SELECT
       s.numero AS sala, c.meitat, c.numero AS corral,
       oc.porcs_entrada,
       COALESCE(v.porcs, 0) AS porcs_ara
     FROM ocupacio_corral oc
     JOIN corral c ON c.id = oc.corral_id
     JOIN sala s ON s.id = c.sala_id
     LEFT JOIN v_ocupacio_actual v ON v.corral_id = oc.corral_id
     WHERE oc.cicle_id = ? AND oc.esborrat_el IS NULL
     ORDER BY s.numero, c.meitat DESC, c.numero`,
    cicleId
  );
}

export type BaixaDelCicle = {
  id: string;
  data: string;
  num_porcs: number;
  sala: number;
  meitat: Meitat;
  corral: number;
  motiu: string | null;
};

/**
 * Baixes atribuïdes a aquest cicle. Un corral es reutilitza cicle rere cicle,
 * així que una baixa s'atribueix al cicle que hi havia en aquell moment: el
 * mateix criteri que fa servir v_cicle_resum per a les sortides a escorxador
 * (l'última ocupació del corral amb data d'entrada anterior o igual a la
 * baixa). Sense això, una baixa d'un cicle nou també comptaria al vell.
 */
export async function baixesDelCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<BaixaDelCicle[]> {
  return db.getAllAsync<BaixaDelCicle>(
    `SELECT b.id, b.data, b.num_porcs, s.numero AS sala, c.meitat, c.numero AS corral, b.motiu
     FROM baixa b
     JOIN corral c ON c.id = b.corral_id
     JOIN sala s ON s.id = c.sala_id
     JOIN ocupacio_corral oc
       ON oc.corral_id = b.corral_id
      AND oc.esborrat_el IS NULL
      AND oc.data_entrada <= b.data
      AND oc.data_entrada = (
        SELECT MAX(oc2.data_entrada) FROM ocupacio_corral oc2
        WHERE oc2.corral_id = b.corral_id
          AND oc2.esborrat_el IS NULL
          AND oc2.data_entrada <= b.data
      )
     WHERE oc.cicle_id = ? AND b.esborrat_el IS NULL
     ORDER BY b.data DESC`,
    cicleId
  );
}

export type MovimentDelCicle = {
  id: string;
  data: string;
  num_porcs: number;
  motiu: string | null;
  /** 'surt' si el corral d'origen és d'aquest cicle, 'entra' si és el de destí. */
  sentit: 'surt' | 'entra';
  sala_origen: number;
  meitat_origen: Meitat;
  corral_origen: number;
  sala_desti: number;
  meitat_desti: Meitat;
  corral_desti: number;
};

/**
 * Moviments d'aquest cicle, tant els que en surten com els que hi entren
 * (d'una altra sala que no s'havia apuntat al cicle en un principi). Mateix
 * criteri d'atribució per data que baixesDelCicle().
 */
export async function movimentsDelCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<MovimentDelCicle[]> {
  return db.getAllAsync<MovimentDelCicle>(
    `SELECT
       m.id, m.data, m.num_porcs, m.motiu,
       CASE WHEN ocO.cicle_id = ? THEN 'surt' ELSE 'entra' END AS sentit,
       so.numero AS sala_origen, co.meitat AS meitat_origen, co.numero AS corral_origen,
       sd.numero AS sala_desti, cd.meitat AS meitat_desti, cd.numero AS corral_desti
     FROM moviment m
     JOIN corral co ON co.id = m.corral_origen_id
     JOIN sala so ON so.id = co.sala_id
     JOIN corral cd ON cd.id = m.corral_desti_id
     JOIN sala sd ON sd.id = cd.sala_id
     LEFT JOIN ocupacio_corral ocO
       ON ocO.corral_id = m.corral_origen_id
      AND ocO.esborrat_el IS NULL
      AND ocO.data_entrada <= m.data
      AND ocO.data_entrada = (
        SELECT MAX(oc2.data_entrada) FROM ocupacio_corral oc2
        WHERE oc2.corral_id = m.corral_origen_id
          AND oc2.esborrat_el IS NULL
          AND oc2.data_entrada <= m.data
      )
     LEFT JOIN ocupacio_corral ocD
       ON ocD.corral_id = m.corral_desti_id
      AND ocD.esborrat_el IS NULL
      AND ocD.data_entrada <= m.data
      AND ocD.data_entrada = (
        SELECT MAX(oc2.data_entrada) FROM ocupacio_corral oc2
        WHERE oc2.corral_id = m.corral_desti_id
          AND oc2.esborrat_el IS NULL
          AND oc2.data_entrada <= m.data
      )
     WHERE (ocO.cicle_id = ? OR ocD.cicle_id = ?) AND m.esborrat_el IS NULL
     ORDER BY m.data DESC`,
    cicleId,
    cicleId,
    cicleId
  );
}

export type CorralPerMoviment = {
  corral_id: string;
  sala: number;
  meitat: Meitat;
  corral: number;
  capacitat: number;
  porcs: number;
};

/** Tots els corrals de la granja amb els porcs que hi ha ara, per triar el destí d'un moviment. */
export async function corralsPerMoviment(
  db: SQLiteDatabase
): Promise<CorralPerMoviment[]> {
  return db.getAllAsync<CorralPerMoviment>(
    `SELECT c.id AS corral_id, s.numero AS sala, c.meitat, c.numero AS corral,
            c.capacitat, COALESCE(v.porcs, 0) AS porcs
     FROM corral c
     JOIN sala s ON s.id = c.sala_id
     LEFT JOIN v_ocupacio_actual v ON v.corral_id = c.id
     WHERE c.esborrat_el IS NULL
     ORDER BY s.numero, c.meitat DESC, c.numero`
  );
}

/**
 * Apunta un o més trasllats de porcs entre corrals (poden ser de sales
 * diferents), tots amb la mateixa data i motiu. Poden ser diverses parelles
 * perquè a la pantalla es pot triar més d'un corral d'origen i més d'un de
 * destí — `aparellaTrasllats()` a `lib/corrals.ts` ja les ha convertit en
 * parelles concretes abans de cridar aquí.
 */
export async function creaMoviments(
  db: SQLiteDatabase,
  dades: {
    data: string;
    parells: { corralOrigenId: string; corralDestiId: string; numPorcs: number }[];
    motiu?: string | null;
  }
): Promise<void> {
  await db.withTransactionAsync(async () => {
    for (const p of dades.parells) {
      if (p.numPorcs <= 0) continue;
      await db.runAsync(
        `INSERT INTO moviment (id, data, corral_origen_id, corral_desti_id, num_porcs, motiu)
         VALUES (?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        dades.data,
        p.corralOrigenId,
        p.corralDestiId,
        p.numPorcs,
        dades.motiu ?? null
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Càrregues a escorxador
// ---------------------------------------------------------------------------

export type TipusCarrega = 'porcs_engreix' | 'truges_rebuig';

export type CorralAmbPorcs = {
  corral_id: string;
  sala: number;
  meitat: Meitat;
  corral: number;
  porcs: number;
};

/** Corrals d'un cicle que ARA tenen porcs: d'aquí es carrega el camió. */
export async function corralsAmbPorcsDelCicle(
  db: SQLiteDatabase,
  cicleId: string
): Promise<CorralAmbPorcs[]> {
  return db.getAllAsync<CorralAmbPorcs>(
    `SELECT v.corral_id, v.sala, v.meitat, v.corral, v.porcs
     FROM v_ocupacio_actual v
     JOIN ocupacio_corral oc ON oc.corral_id = v.corral_id
     WHERE oc.cicle_id = ? AND oc.esborrat_el IS NULL AND v.porcs > 0
     ORDER BY v.sala, v.meitat DESC, v.corral`,
    cicleId
  );
}

/** Tots els corrals que ARA tenen porcs, siguin del cicle que siguin. */
export async function corralsAmbPorcsAra(
  db: SQLiteDatabase
): Promise<CorralAmbPorcs[]> {
  return db.getAllAsync<CorralAmbPorcs>(
    `SELECT corral_id, sala, meitat, corral, porcs
     FROM v_ocupacio_actual
     WHERE porcs > 0
     ORDER BY sala, meitat DESC, corral`
  );
}

/**
 * Apunta una baixa: tants porcs menys en un o més corrals. Es diu "baixa" a
 * l'app (com al full del pare), tot i que la taula es diu igual.
 *
 * És OPCIONAL i no és la font de veritat: v_cicle_resum ja calcula els morts
 * per diferència. Això només ho fa explícit i treu porcs de
 * v_ocupacio_actual de seguida, sense esperar la següent càrrega.
 */
export async function creaBaixa(
  db: SQLiteDatabase,
  dades: { data: string; linies: { corralId: string; numPorcs: number }[]; motiu?: string | null }
): Promise<void> {
  const linies = dades.linies.filter((l) => l.numPorcs > 0);
  await db.withTransactionAsync(async () => {
    for (const linia of linies) {
      await db.runAsync(
        `INSERT INTO baixa (id, data, corral_id, num_porcs, motiu)
         VALUES (?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        dades.data,
        linia.corralId,
        linia.numPorcs,
        dades.motiu ?? null
      );
    }
  });
}

export type DadesFactura = {
  unitats?: number | null;
  kg?: number | null;
  kgCanal?: number | null;
  totalFactura?: number | null;
  preuKg?: number | null;
  preuReferencia?: number | null;
};

export type NovaCarrega = {
  dataCarrega: string;
  tipus: TipusCarrega;
  /** Porcs que surten de cada corral. Els zeros no es desen. */
  linies: { corralId: string; numPorcs: number }[];
  factura?: DadesFactura;
  decomisos?: { codi: 'D4' | 'D5'; numPorcs: number }[];
};

/**
 * Desa la càrrega sencera: el camió, el desglossament per corral i els
 * decomisos, tot en una transacció.
 *
 * Aquí és on desapareix la feina duplicada de l'Excel: la data i el pes mitjà
 * viuen només al camió, i les sales només aporten el nombre de porcs.
 *
 * `unitats` es posa sol amb la suma de les línies si no ve de la factura;
 * si ve i no coincideix, es desa igualment i la diferència es veu a la fitxa.
 */
export async function creaCarrega(
  db: SQLiteDatabase,
  dades: NovaCarrega
): Promise<string> {
  const carregaId = Crypto.randomUUID();
  const linies = dades.linies.filter((l) => l.numPorcs > 0);
  const sumaLinies = linies.reduce((s, l) => s + l.numPorcs, 0);
  const f = dades.factura ?? {};

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO carrega_escorxador
         (id, data_carrega, tipus, unitats, kg, kg_canal,
          total_factura, preu_kg, preu_referencia)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      carregaId,
      dades.dataCarrega,
      dades.tipus,
      f.unitats ?? sumaLinies,
      f.kg ?? null,
      f.kgCanal ?? null,
      f.totalFactura ?? null,
      f.preuKg ?? null,
      f.preuReferencia ?? null
    );

    for (const linia of linies) {
      await db.runAsync(
        `INSERT INTO linia_carrega (id, carrega_id, corral_id, num_porcs)
         VALUES (?, ?, ?, ?)`,
        Crypto.randomUUID(),
        carregaId,
        linia.corralId,
        linia.numPorcs
      );
    }

    for (const d of dades.decomisos ?? []) {
      if (d.numPorcs <= 0) continue;
      await db.runAsync(
        `INSERT INTO decomis (id, carrega_id, codi, num_porcs) VALUES (?, ?, ?, ?)`,
        Crypto.randomUUID(),
        carregaId,
        d.codi,
        d.numPorcs
      );
    }
  });

  return carregaId;
}

/** Omplir les dades de la factura més tard, des del despatx. */
export async function actualitzaFactura(
  db: SQLiteDatabase,
  carregaId: string,
  f: DadesFactura
): Promise<void> {
  await db.runAsync(
    `UPDATE carrega_escorxador SET
       unitats = ?, kg = ?, kg_canal = ?,
       total_factura = ?, preu_kg = ?, preu_referencia = ?,
       modificat_el = datetime('now'), sincronitzat_el = NULL
     WHERE id = ?`,
    f.unitats ?? null,
    f.kg ?? null,
    f.kgCanal ?? null,
    f.totalFactura ?? null,
    f.preuKg ?? null,
    f.preuReferencia ?? null,
    carregaId
  );
}

export type CarregaLlista = {
  id: string;
  data_carrega: string;
  tipus: TipusCarrega;
  unitats: number | null;
  porcs_linies: number;
  promig_kg: number | null;
};

export async function llistaCarregues(
  db: SQLiteDatabase,
  limit?: number
): Promise<CarregaLlista[]> {
  return db.getAllAsync<CarregaLlista>(
    `SELECT
       c.id, c.data_carrega, c.tipus, c.unitats, c.promig_kg,
       COALESCE((SELECT SUM(l.num_porcs) FROM linia_carrega l
                 WHERE l.carrega_id = c.id AND l.esborrat_el IS NULL), 0) AS porcs_linies
     FROM carrega_escorxador c
     WHERE c.esborrat_el IS NULL
     ORDER BY c.data_carrega DESC, c.creat_el DESC
     LIMIT ?`,
    limit ?? -1
  );
}

export type CarregaDetall = {
  id: string;
  data_carrega: string;
  tipus: TipusCarrega;
  unitats: number | null;
  kg: number | null;
  kg_canal: number | null;
  total_factura: number | null;
  preu_kg: number | null;
  preu_referencia: number | null;
  rendiment: number | null;
  promig_kg: number | null;
  diferencia: number | null;
};

export async function detallCarrega(
  db: SQLiteDatabase,
  carregaId: string
): Promise<CarregaDetall | null> {
  return db.getFirstAsync<CarregaDetall>(
    'SELECT * FROM carrega_escorxador WHERE id = ?',
    carregaId
  );
}

export type LiniaCarrega = {
  sala: number;
  meitat: Meitat;
  corral: number;
  num_porcs: number;
};

export async function liniesDeCarrega(
  db: SQLiteDatabase,
  carregaId: string
): Promise<LiniaCarrega[]> {
  return db.getAllAsync<LiniaCarrega>(
    `SELECT s.numero AS sala, c.meitat, c.numero AS corral, l.num_porcs
     FROM linia_carrega l
     JOIN corral c ON c.id = l.corral_id
     JOIN sala s ON s.id = c.sala_id
     WHERE l.carrega_id = ? AND l.esborrat_el IS NULL
     ORDER BY s.numero, c.meitat DESC, c.numero`,
    carregaId
  );
}

export type Decomis = { codi: 'D4' | 'D5'; num_porcs: number };

export async function decomisosDeCarrega(
  db: SQLiteDatabase,
  carregaId: string
): Promise<Decomis[]> {
  return db.getAllAsync<Decomis>(
    `SELECT codi, num_porcs FROM decomis
     WHERE carrega_id = ? AND esborrat_el IS NULL ORDER BY codi`,
    carregaId
  );
}

export type CorralEditableCarrega = {
  corral_id: string;
  sala: number;
  meitat: Meitat;
  corral: number;
  /** Porcs que aquesta càrrega es va endur d'aquest corral. */
  num_porcs: number;
  /** Porcs que hi hauria si aquesta càrrega no existís: és el màxim editable. */
  disponible: number;
};

/**
 * Els corrals que va tocar una càrrega, amb quants porcs hi hauria si la
 * càrrega no existís. Sense sumar-hi el que ja es va endur, editar-la sempre
 * semblaria que no queden porcs.
 */
export async function corralsPerEditarCarrega(
  db: SQLiteDatabase,
  carregaId: string
): Promise<CorralEditableCarrega[]> {
  return db.getAllAsync<CorralEditableCarrega>(
    `SELECT
       l.corral_id,
       s.numero AS sala, c.meitat, c.numero AS corral,
       l.num_porcs,
       COALESCE(v.porcs, 0) + l.num_porcs AS disponible
     FROM linia_carrega l
     JOIN corral c ON c.id = l.corral_id
     JOIN sala s ON s.id = c.sala_id
     LEFT JOIN v_ocupacio_actual v ON v.corral_id = l.corral_id
     WHERE l.carrega_id = ? AND l.esborrat_el IS NULL
     ORDER BY s.numero, c.meitat DESC, c.numero`,
    carregaId
  );
}

/** Els valors d'una càrrega per tornar a omplir el formulari. */
export type CarregaEditable = {
  data_carrega: string;
  tipus: TipusCarrega;
  factura: DadesFactura;
  linies: { corral_id: string; sala: number; num_porcs: number }[];
  decomisos: Decomis[];
};

export async function carregaPerEditar(
  db: SQLiteDatabase,
  carregaId: string
): Promise<CarregaEditable | null> {
  const cap = await db.getFirstAsync<CarregaDetall>(
    'SELECT * FROM carrega_escorxador WHERE id = ? AND esborrat_el IS NULL',
    carregaId
  );
  if (!cap) return null;

  const linies = await db.getAllAsync<{
    corral_id: string;
    sala: number;
    num_porcs: number;
  }>(
    `SELECT l.corral_id, s.numero AS sala, l.num_porcs
     FROM linia_carrega l
     JOIN corral c ON c.id = l.corral_id
     JOIN sala s ON s.id = c.sala_id
     WHERE l.carrega_id = ? AND l.esborrat_el IS NULL`,
    carregaId
  );

  return {
    data_carrega: cap.data_carrega,
    tipus: cap.tipus,
    factura: {
      unitats: cap.unitats,
      kg: cap.kg,
      kgCanal: cap.kg_canal,
      totalFactura: cap.total_factura,
      preuKg: cap.preu_kg,
      preuReferencia: cap.preu_referencia,
    },
    linies,
    decomisos: await decomisosDeCarrega(db, carregaId),
  };
}

/**
 * Desa els canvis d'una càrrega. Les línies i els decomisos es refan sencers,
 * marcant els antics com esborrats.
 */
export async function actualitzaCarrega(
  db: SQLiteDatabase,
  carregaId: string,
  dades: NovaCarrega
): Promise<void> {
  const linies = dades.linies.filter((l) => l.numPorcs > 0);
  const sumaLinies = linies.reduce((s, l) => s + l.numPorcs, 0);
  const f = dades.factura ?? {};

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE carrega_escorxador SET
         data_carrega = ?, tipus = ?, unitats = ?, kg = ?, kg_canal = ?,
         total_factura = ?, preu_kg = ?, preu_referencia = ?,
         modificat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      dades.dataCarrega,
      dades.tipus,
      f.unitats ?? sumaLinies,
      f.kg ?? null,
      f.kgCanal ?? null,
      f.totalFactura ?? null,
      f.preuKg ?? null,
      f.preuReferencia ?? null,
      carregaId
    );

    await db.runAsync(
      `UPDATE linia_carrega SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE carrega_id = ? AND esborrat_el IS NULL`,
      carregaId
    );
    await db.runAsync(
      `UPDATE decomis SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE carrega_id = ? AND esborrat_el IS NULL`,
      carregaId
    );

    for (const linia of linies) {
      await db.runAsync(
        `INSERT INTO linia_carrega (id, carrega_id, corral_id, num_porcs)
         VALUES (?, ?, ?, ?)`,
        Crypto.randomUUID(),
        carregaId,
        linia.corralId,
        linia.numPorcs
      );
    }
    for (const d of dades.decomisos ?? []) {
      if (d.numPorcs <= 0) continue;
      await db.runAsync(
        `INSERT INTO decomis (id, carrega_id, codi, num_porcs) VALUES (?, ?, ?, ?)`,
        Crypto.randomUUID(),
        carregaId,
        d.codi,
        d.numPorcs
      );
    }
  });
}

/**
 * Esborrat tou d'una càrrega. En marcar-la, els porcs de les seves línies
 * tornen a comptar als corrals: v_ocupacio_actual només mira les files vives.
 */
export async function esborraCarrega(
  db: SQLiteDatabase,
  carregaId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE linia_carrega SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE carrega_id = ? AND esborrat_el IS NULL`,
      carregaId
    );
    await db.runAsync(
      `UPDATE decomis SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE carrega_id = ? AND esborrat_el IS NULL`,
      carregaId
    );
    await db.runAsync(
      `UPDATE carrega_escorxador SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      carregaId
    );
  });
}

// ---------------------------------------------------------------------------
// Pinso
// ---------------------------------------------------------------------------

export type TipusAmbEntregues = {
  id: string;
  codi: string;
  descripcio: string | null;
  capacitat_sitja_kg: number | null;
  entregues: { data: string; kg: number }[];
};

/**
 * Cada tipus de pinso amb el seu històric d'entregues, per calcular la
 * previsió. Són poques files (uns centenars) i el càlcul es fa a
 * `src/lib/pinso.ts`, que és codi provable.
 */
export async function tipusPinsoAmbEntregues(
  db: SQLiteDatabase
): Promise<TipusAmbEntregues[]> {
  const tipus = await db.getAllAsync<{
    id: string;
    codi: string;
    descripcio: string | null;
    capacitat_sitja_kg: number | null;
  }>(
    `SELECT id, codi, descripcio, capacitat_sitja_kg FROM tipus_pinso
     WHERE esborrat_el IS NULL ORDER BY codi`
  );

  const entregues = await db.getAllAsync<{
    tipus_pinso_id: string;
    data: string;
    kg: number;
  }>(
    `SELECT tipus_pinso_id, data, kg FROM entrega_pinso
     WHERE esborrat_el IS NULL ORDER BY data`
  );

  const perTipus = new Map<string, { data: string; kg: number }[]>();
  for (const e of entregues) {
    const llista = perTipus.get(e.tipus_pinso_id);
    if (llista) llista.push({ data: e.data, kg: e.kg });
    else perTipus.set(e.tipus_pinso_id, [{ data: e.data, kg: e.kg }]);
  }

  return tipus.map((t) => ({ ...t, entregues: perTipus.get(t.id) ?? [] }));
}

export async function creaEntregaPinso(
  db: SQLiteDatabase,
  dades: {
    data: string;
    tipusPinsoId: string;
    kg: number;
    albara?: string | null;
    medicat?: boolean;
    prescripcio?: string | null;
  }
): Promise<void> {
  await db.runAsync(
    `INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg, albara, medicat, prescripcio)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    Crypto.randomUUID(),
    dades.data,
    dades.tipusPinsoId,
    dades.kg,
    dades.albara ?? null,
    dades.medicat ? 1 : 0,
    dades.prescripcio ?? null
  );
}

// ---------------------------------------------------------------------------
// Albarans del proveïdor
// ---------------------------------------------------------------------------

export type ArticleProveidor = {
  codi: string;
  tipus_pinso_id: string;
  tipus_codi: string;
};

/**
 * L'equivalència entre els codis d'article del proveïdor i els nostres tipus
 * de pinso. Comença buida i s'omple sola: cada codi nou es pregunta un cop.
 */
export async function articlesProveidor(
  db: SQLiteDatabase
): Promise<ArticleProveidor[]> {
  return db.getAllAsync<ArticleProveidor>(
    `SELECT ap.codi, ap.tipus_pinso_id, tp.codi AS tipus_codi
       FROM article_proveidor ap
       JOIN tipus_pinso tp ON tp.id = ap.tipus_pinso_id
      WHERE ap.esborrat_el IS NULL
      ORDER BY ap.codi`
  );
}

/** Desa (o canvia) a quin tipus de pinso correspon un codi del proveïdor. */
export async function desaArticleProveidor(
  db: SQLiteDatabase,
  codi: string,
  tipusPinsoId: string
): Promise<void> {
  const existent = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM article_proveidor WHERE codi = ? AND esborrat_el IS NULL`,
    codi
  );

  if (existent) {
    await db.runAsync(
      `UPDATE article_proveidor
          SET tipus_pinso_id = ?, modificat_el = datetime('now'), sincronitzat_el = NULL
        WHERE id = ?`,
      tipusPinsoId,
      existent.id
    );
    return;
  }

  await db.runAsync(
    `INSERT INTO article_proveidor (id, codi, tipus_pinso_id) VALUES (?, ?, ?)`,
    Crypto.randomUUID(),
    codi,
    tipusPinsoId
  );
}

/**
 * Si aquest albarà ja s'ha apuntat. La foto del mateix paper es pot fer dos
 * cops sense adonar-se'n, i com que aquí no s'esborra mai res, una entrega
 * repetida inflaria l'estoc de pinso i espatllaria la previsió.
 */
export async function albaraJaApuntat(
  db: SQLiteDatabase,
  numero: string
): Promise<{ data: string; kg: number } | null> {
  const fila = await db.getFirstAsync<{ data: string; kg: number }>(
    `SELECT data, SUM(kg) AS kg FROM entrega_pinso
      WHERE albara = ? AND esborrat_el IS NULL`,
    numero
  );
  return fila && fila.kg != null ? fila : null;
}

/** Porcs que hi ha ara mateix a tota la granja. */
export async function porcsALaGranja(db: SQLiteDatabase): Promise<number> {
  const fila = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(porcs), 0) AS total FROM v_ocupacio_actual'
  );
  return fila?.total ?? 0;
}

/** Corrals que ja tenen porcs, per avisar abans de tornar-hi a ficar. */
export async function corralsOcupats(db: SQLiteDatabase): Promise<Set<string>> {
  const files = await db.getAllAsync<{ corral_id: string }>(
    'SELECT corral_id FROM v_ocupacio_actual WHERE porcs > 0'
  );
  return new Set(files.map((f) => f.corral_id));
}

// ---------------------------------------------------------------------------
// Entrades de llavores (truges de reposició que ENTREN, resposta G2)
// ---------------------------------------------------------------------------

export type EntradaLlavoresLlista = {
  id: string;
  data: string;
  unitats: number | null;
  kg: number | null;
  promig_kg: number | null;
};

export async function llistaEntradesLlavores(
  db: SQLiteDatabase,
  limit?: number
): Promise<EntradaLlavoresLlista[]> {
  return db.getAllAsync<EntradaLlavoresLlista>(
    `SELECT id, data, unitats, kg, promig_kg
     FROM entrada_llavores
     WHERE esborrat_el IS NULL
     ORDER BY data DESC, creat_el DESC
     LIMIT ?`,
    limit ?? -1
  );
}

export type EntradaLlavoresDetall = {
  id: string;
  data: string;
  unitats: number | null;
  kg: number | null;
  total_factura: number | null;
  preu_kg: number | null;
  promig_kg: number | null;
};

export async function detallEntradaLlavores(
  db: SQLiteDatabase,
  entradaId: string
): Promise<EntradaLlavoresDetall | null> {
  return db.getFirstAsync<EntradaLlavoresDetall>(
    'SELECT * FROM entrada_llavores WHERE id = ? AND esborrat_el IS NULL',
    entradaId
  );
}

export type DadesEntradaLlavores = {
  data: string;
  unitats: number | null;
  kg: number | null;
  totalFactura: number | null;
  preuKg: number | null;
};

export async function creaEntradaLlavores(
  db: SQLiteDatabase,
  dades: DadesEntradaLlavores
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    `INSERT INTO entrada_llavores (id, data, unitats, kg, total_factura, preu_kg)
     VALUES (?, ?, ?, ?, ?, ?)`,
    id,
    dades.data,
    dades.unitats,
    dades.kg,
    dades.totalFactura,
    dades.preuKg
  );
  return id;
}

export async function actualitzaEntradaLlavores(
  db: SQLiteDatabase,
  entradaId: string,
  dades: DadesEntradaLlavores
): Promise<void> {
  await db.runAsync(
    `UPDATE entrada_llavores SET
       data = ?, unitats = ?, kg = ?, total_factura = ?, preu_kg = ?,
       modificat_el = datetime('now'), sincronitzat_el = NULL
     WHERE id = ?`,
    dades.data,
    dades.unitats,
    dades.kg,
    dades.totalFactura,
    dades.preuKg,
    entradaId
  );
}

/** Esborrat tou: la fila es marca, mai es perd (regla del model de dades). */
export async function esborraEntradaLlavores(
  db: SQLiteDatabase,
  entradaId: string
): Promise<void> {
  await db.runAsync(
    `UPDATE entrada_llavores
     SET esborrat_el = datetime('now'), sincronitzat_el = NULL
     WHERE id = ?`,
    entradaId
  );
}

// ---------------------------------------------------------------------------
// Resum trimestral (equivalent als totals per trimestre del full
// "Porcs escorxador" de l'Excel, docs/excel-analisi.md §... totals per 1T-4T)
// ---------------------------------------------------------------------------

export type ResumTipus = {
  kg: number | null;
  kgCanal: number | null;
  unitats: number | null;
  totalFactura: number | null;
  /** kg / unitats. */
  promigKg: number | null;
  /** kg_canal / kg. Només té sentit per porcs d'engreix. */
  rendiment: number | null;
  /** total_factura / kg: preu mitjà ponderat, no la mitjana simple de preu_kg. */
  preuKg: number | null;
};

export type ResumTrimestre = {
  any: number;
  trimestre: number;
  porcs: ResumTipus | null;
  truges: ResumTipus | null;
  llavores: ResumTipus | null;
};

function calculaResumTipus(fila: {
  kg: number | null;
  kg_canal: number | null;
  unitats: number | null;
  total_factura: number | null;
}): ResumTipus {
  const { kg, kg_canal, unitats, total_factura } = fila;
  return {
    kg,
    kgCanal: kg_canal,
    unitats,
    totalFactura: total_factura,
    promigKg: kg != null && unitats ? kg / unitats : null,
    rendiment: kg_canal != null && kg ? kg_canal / kg : null,
    preuKg: total_factura != null && kg ? total_factura / kg : null,
  };
}

export async function resumTrimestral(db: SQLiteDatabase): Promise<ResumTrimestre[]> {
  const carregues = await db.getAllAsync<{
    any: number;
    trimestre: number;
    tipus: TipusCarrega;
    kg: number | null;
    kg_canal: number | null;
    unitats: number | null;
    total_factura: number | null;
  }>(
    `SELECT
       CAST(strftime('%Y', data_carrega) AS INTEGER) AS any,
       (CAST(strftime('%m', data_carrega) AS INTEGER) - 1) / 3 + 1 AS trimestre,
       tipus,
       SUM(kg) AS kg,
       SUM(kg_canal) AS kg_canal,
       SUM(unitats) AS unitats,
       SUM(total_factura) AS total_factura
     FROM carrega_escorxador
     WHERE esborrat_el IS NULL
     GROUP BY any, trimestre, tipus`
  );

  const llavores = await db.getAllAsync<{
    any: number;
    trimestre: number;
    kg: number | null;
    unitats: number | null;
    total_factura: number | null;
  }>(
    `SELECT
       CAST(strftime('%Y', data) AS INTEGER) AS any,
       (CAST(strftime('%m', data) AS INTEGER) - 1) / 3 + 1 AS trimestre,
       SUM(kg) AS kg,
       SUM(unitats) AS unitats,
       SUM(total_factura) AS total_factura
     FROM entrada_llavores
     WHERE esborrat_el IS NULL
     GROUP BY any, trimestre`
  );

  const periodes = new Map<string, ResumTrimestre>();
  const periode = (any: number, trimestre: number) => {
    const clau = `${any}-${trimestre}`;
    let p = periodes.get(clau);
    if (!p) {
      p = { any, trimestre, porcs: null, truges: null, llavores: null };
      periodes.set(clau, p);
    }
    return p;
  };

  for (const c of carregues) {
    const p = periode(c.any, c.trimestre);
    const resum = calculaResumTipus(c);
    if (c.tipus === 'porcs_engreix') p.porcs = resum;
    else p.truges = resum;
  }
  for (const l of llavores) {
    const p = periode(l.any, l.trimestre);
    p.llavores = calculaResumTipus({ ...l, kg_canal: null });
  }

  return [...periodes.values()].sort(
    (a, b) => b.any - a.any || b.trimestre - a.trimestre
  );
}

// ---------------------------------------------------------------------------
// Deslletament (full "Cens24" de l'Excel, fase 1: fins a la inseminació)
// ---------------------------------------------------------------------------

export type UbicacioReproduccio = {
  id: string;
  tipus: 'inseminacio' | 'gestacio';
  codi: string;
};

export async function llistaUbicacionsReproduccio(
  db: SQLiteDatabase
): Promise<UbicacioReproduccio[]> {
  return db.getAllAsync<UbicacioReproduccio>(
    `SELECT id, tipus, codi FROM ubicacio_reproduccio
     WHERE esborrat_el IS NULL ORDER BY tipus, codi`
  );
}

export type DeslletamentLlista = {
  id: string;
  banda: number;
  data_desmamat: string;
  truges_desmamades: number | null;
  porcs_desmamats: number | null;
  data_inseminacio: string | null;
  primales: number | null;
};

export async function llistaDeslletaments(
  db: SQLiteDatabase,
  limit?: number
): Promise<DeslletamentLlista[]> {
  return db.getAllAsync<DeslletamentLlista>(
    `SELECT d.id, b.numero AS banda, d.data_desmamat, d.truges_desmamades,
            d.porcs_desmamats, d.data_inseminacio, d.primales
     FROM deslletament d
     JOIN banda b ON b.id = d.banda_id
     WHERE d.esborrat_el IS NULL
     ORDER BY d.data_desmamat DESC, d.creat_el DESC
     LIMIT ?`,
    limit ?? -1
  );
}

export type DeslletamentDetall = {
  id: string;
  banda_id: string;
  banda: number;
  data_desmamat: string;
  truges_criades: number | null;
  truges_desmamades: number | null;
  porcs_vius_1a_setmana: number | null;
  porcs_desmamats: number | null;
  observacions: string | null;
  data_inseminacio: string | null;
  insem_total: number | null;
  repetidores: number | null;
  primales: number | null;
  plenes: number | null;
  pct_baixes_parideres: number | null;
  mitjana_porcs_truja: number | null;
  pct_plenes: number | null;
  posicions_inseminar_ids: string[];
  posicions_gestacio_ids: string[];
};

export async function detallDeslletament(
  db: SQLiteDatabase,
  deslletamentId: string
): Promise<DeslletamentDetall | null> {
  const base = await db.getFirstAsync<Omit<
    DeslletamentDetall,
    'posicions_inseminar_ids' | 'posicions_gestacio_ids'
  >>(
    `SELECT d.*, b.numero AS banda
     FROM deslletament d
     JOIN banda b ON b.id = d.banda_id
     WHERE d.id = ? AND d.esborrat_el IS NULL`,
    deslletamentId
  );
  if (!base) return null;

  const posicions = await db.getAllAsync<{
    ubicacio_id: string;
    tipus: 'inseminacio' | 'gestacio';
  }>(
    `SELECT dp.ubicacio_id, u.tipus
     FROM deslletament_posicio dp
     JOIN ubicacio_reproduccio u ON u.id = dp.ubicacio_id
     WHERE dp.deslletament_id = ? AND dp.esborrat_el IS NULL`,
    deslletamentId
  );

  return {
    ...base,
    posicions_inseminar_ids: posicions
      .filter((p) => p.tipus === 'inseminacio')
      .map((p) => p.ubicacio_id),
    posicions_gestacio_ids: posicions
      .filter((p) => p.tipus === 'gestacio')
      .map((p) => p.ubicacio_id),
  };
}

export type DadesDeslletament = {
  bandaId: string;
  dataDesmamat: string;
  truges_criades: number | null;
  truges_desmamades: number | null;
  porcs_vius_1a_setmana: number | null;
  porcs_desmamats: number | null;
  posicionsInseminarIds: string[];
  posicionsGestacioIds: string[];
  observacions: string | null;
};

async function desaPosicionsDeslletament(
  db: SQLiteDatabase,
  deslletamentId: string,
  dades: DadesDeslletament
): Promise<void> {
  for (const ubicacioId of [
    ...dades.posicionsInseminarIds,
    ...dades.posicionsGestacioIds,
  ]) {
    await db.runAsync(
      `INSERT INTO deslletament_posicio (id, deslletament_id, ubicacio_id)
       VALUES (?, ?, ?)`,
      Crypto.randomUUID(),
      deslletamentId,
      ubicacioId
    );
  }
}

export async function creaDeslletament(
  db: SQLiteDatabase,
  dades: DadesDeslletament
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO deslletament
         (id, banda_id, data_desmamat, truges_criades, truges_desmamades,
          porcs_vius_1a_setmana, porcs_desmamats, observacions)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      dades.bandaId,
      dades.dataDesmamat,
      dades.truges_criades,
      dades.truges_desmamades,
      dades.porcs_vius_1a_setmana,
      dades.porcs_desmamats,
      dades.observacions
    );
    await desaPosicionsDeslletament(db, id, dades);
  });
  return id;
}

export async function actualitzaDeslletament(
  db: SQLiteDatabase,
  deslletamentId: string,
  dades: DadesDeslletament
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE deslletament SET
         banda_id = ?, data_desmamat = ?, truges_criades = ?, truges_desmamades = ?,
         porcs_vius_1a_setmana = ?, porcs_desmamats = ?, observacions = ?,
         modificat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      dades.bandaId,
      dades.dataDesmamat,
      dades.truges_criades,
      dades.truges_desmamades,
      dades.porcs_vius_1a_setmana,
      dades.porcs_desmamats,
      dades.observacions,
      deslletamentId
    );
    // Es refà la selecció sencera: més senzill que calcular la diferència, i
    // les posicions no tenen cap valor propi que calgui conservar en editar.
    await db.runAsync(
      `UPDATE deslletament_posicio
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE deslletament_id = ? AND esborrat_el IS NULL`,
      deslletamentId
    );
    await desaPosicionsDeslletament(db, deslletamentId, dades);
  });
}

export type DadesInseminacio = {
  dataInseminacio: string;
  insem_total: number | null;
  repetidores: number | null;
  primales: number | null;
};

/** Fase 2 (resposta B3): s'omple uns dies després del deslletament. */
export async function apuntaInseminacio(
  db: SQLiteDatabase,
  deslletamentId: string,
  dades: DadesInseminacio
): Promise<void> {
  await db.runAsync(
    `UPDATE deslletament SET
       data_inseminacio = ?, insem_total = ?, repetidores = ?, primales = ?,
       modificat_el = datetime('now'), sincronitzat_el = NULL
     WHERE id = ?`,
    dades.dataInseminacio,
    dades.insem_total,
    dades.repetidores,
    dades.primales,
    deslletamentId
  );
}

/** Esborrat tou: la fila es marca, mai es perd (regla del model de dades). */
export async function esborraDeslletament(
  db: SQLiteDatabase,
  deslletamentId: string
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE deslletament_posicio
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE deslletament_id = ? AND esborrat_el IS NULL`,
      deslletamentId
    );
    await db.runAsync(
      `UPDATE deslletament
       SET esborrat_el = datetime('now'), sincronitzat_el = NULL
       WHERE id = ?`,
      deslletamentId
    );
  });
}

// ---------------------------------------------------------------------------
// Cens de truges
// ---------------------------------------------------------------------------

export type CensTrugesActual = {
  data_recompte: string;
  recompte: number;
  altes: number;
  baixes_mort: number;
  baixes_rebuig: number;
  total: number;
};

/** null si encara no s'ha fet cap recompte. */
export async function censTrugesActual(
  db: SQLiteDatabase
): Promise<CensTrugesActual | null> {
  return db.getFirstAsync<CensTrugesActual>('SELECT * FROM v_cens_truges_actual');
}

export type RecompteTruges = { id: string; data: string; num_truges: number };

export async function llistaRecomptesTruges(
  db: SQLiteDatabase,
  limit?: number
): Promise<RecompteTruges[]> {
  return db.getAllAsync<RecompteTruges>(
    `SELECT id, data, num_truges FROM cens_truges
     WHERE esborrat_el IS NULL
     ORDER BY data DESC, creat_el DESC
     LIMIT ?`,
    limit ?? -1
  );
}

export async function creaRecompteTruges(
  db: SQLiteDatabase,
  data: string,
  numTruges: number
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO cens_truges (id, data, num_truges) VALUES (?, ?, ?)',
    id,
    data,
    numTruges
  );
  return id;
}

export type BaixaTruja = { id: string; data: string; num_truges: number; motiu: string | null };

export async function llistaBaixesTruja(
  db: SQLiteDatabase,
  limit?: number
): Promise<BaixaTruja[]> {
  return db.getAllAsync<BaixaTruja>(
    `SELECT id, data, num_truges, motiu FROM baixa_truja
     WHERE esborrat_el IS NULL
     ORDER BY data DESC, creat_el DESC
     LIMIT ?`,
    limit ?? -1
  );
}

export async function creaBaixaTruja(
  db: SQLiteDatabase,
  data: string,
  numTruges: number,
  motiu: string | null
): Promise<string> {
  const id = Crypto.randomUUID();
  await db.runAsync(
    'INSERT INTO baixa_truja (id, data, num_truges, motiu) VALUES (?, ?, ?, ?)',
    id,
    data,
    numTruges,
    motiu
  );
  return id;
}

// ---------------------------------------------------------------------------
// Taules completes: una fila per registre, totes les columnes, sense
// paginar — la vista "com un full d'Excel" (/taules). Cap d'aquestes
// consultes talla amb LIMIT: aquesta pantalla és precisament la que vol
// veure-ho tot d'una tacada.
// ---------------------------------------------------------------------------

export type FilaDeslletamentTaula = {
  id: string;
  banda: number;
  data_desmamat: string;
  truges_criades: number | null;
  truges_desmamades: number | null;
  porcs_vius_1a_setmana: number | null;
  porcs_desmamats: number | null;
  pct_baixes_parideres: number | null;
  mitjana_porcs_truja: number | null;
  data_inseminacio: string | null;
  insem_total: number | null;
  repetidores: number | null;
  primales: number | null;
  plenes: number | null;
  pct_plenes: number | null;
  posicions_inseminar: string | null;
  posicions_gestacio: string | null;
  observacions: string | null;
};

export async function taulaDeslletaments(
  db: SQLiteDatabase
): Promise<FilaDeslletamentTaula[]> {
  return db.getAllAsync<FilaDeslletamentTaula>(
    `SELECT
       d.id, b.numero AS banda, d.data_desmamat, d.truges_criades, d.truges_desmamades,
       d.porcs_vius_1a_setmana, d.porcs_desmamats, d.pct_baixes_parideres,
       d.mitjana_porcs_truja, d.data_inseminacio, d.insem_total, d.repetidores,
       d.primales, d.plenes, d.pct_plenes,
       (SELECT GROUP_CONCAT(u.codi, ', ') FROM deslletament_posicio dp
          JOIN ubicacio_reproduccio u ON u.id = dp.ubicacio_id
          WHERE dp.deslletament_id = d.id AND dp.esborrat_el IS NULL
            AND u.tipus = 'inseminacio') AS posicions_inseminar,
       (SELECT GROUP_CONCAT(u.codi, ', ') FROM deslletament_posicio dp
          JOIN ubicacio_reproduccio u ON u.id = dp.ubicacio_id
          WHERE dp.deslletament_id = d.id AND dp.esborrat_el IS NULL
            AND u.tipus = 'gestacio') AS posicions_gestacio,
       d.observacions
     FROM deslletament d
     JOIN banda b ON b.id = d.banda_id
     WHERE d.esborrat_el IS NULL
     ORDER BY d.data_desmamat DESC`
  );
}

export async function taulaCicles(db: SQLiteDatabase): Promise<CicleResum[]> {
  return db.getAllAsync<CicleResum>(
    'SELECT * FROM v_cicle_resum ORDER BY data_entrada DESC, banda'
  );
}

export type FilaCarregaTaula = {
  id: string;
  data_carrega: string;
  tipus: TipusCarrega;
  unitats: number | null;
  kg: number | null;
  kg_canal: number | null;
  promig_kg: number | null;
  rendiment: number | null;
  total_factura: number | null;
  preu_kg: number | null;
  preu_referencia: number | null;
  diferencia: number | null;
};

export async function taulaCarregues(db: SQLiteDatabase): Promise<FilaCarregaTaula[]> {
  return db.getAllAsync<FilaCarregaTaula>(
    `SELECT id, data_carrega, tipus, unitats, kg, kg_canal, promig_kg, rendiment,
            total_factura, preu_kg, preu_referencia, diferencia
     FROM carrega_escorxador
     WHERE esborrat_el IS NULL
     ORDER BY data_carrega DESC`
  );
}

export type FilaPinsoTaula = {
  id: string;
  data: string;
  tipus_pinso: string;
  kg: number;
  albara: string | null;
  medicat: number;
  prescripcio: string | null;
};

export async function taulaPinso(db: SQLiteDatabase): Promise<FilaPinsoTaula[]> {
  return db.getAllAsync<FilaPinsoTaula>(
    `SELECT ep.id, ep.data, tp.codi AS tipus_pinso, ep.kg, ep.albara,
            ep.medicat, ep.prescripcio
     FROM entrega_pinso ep
     JOIN tipus_pinso tp ON tp.id = ep.tipus_pinso_id
     WHERE ep.esborrat_el IS NULL
     ORDER BY ep.data DESC`
  );
}

export type FilaLlavorsTaula = {
  id: string;
  data: string;
  unitats: number | null;
  kg: number | null;
  promig_kg: number | null;
  total_factura: number | null;
  preu_kg: number | null;
};

export async function taulaLlavors(db: SQLiteDatabase): Promise<FilaLlavorsTaula[]> {
  return db.getAllAsync<FilaLlavorsTaula>(
    `SELECT id, data, unitats, kg, promig_kg, total_factura, preu_kg
     FROM entrada_llavores
     WHERE esborrat_el IS NULL
     ORDER BY data DESC`
  );
}
