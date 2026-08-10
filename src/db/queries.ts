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

export type CicleLlista = {
  id: string;
  banda: number;
  data_entrada: string;
  porcs_entrada: number;
  porcs_sortida: number;
  queden: number;
  num_corrals: number;
};

export async function llistaCicles(db: SQLiteDatabase): Promise<CicleLlista[]> {
  return db.getAllAsync<CicleLlista>(
    `SELECT
       r.id, r.banda, r.data_entrada, r.porcs_entrada,
       r.porcs_sortida,
       r.porcs_entrada - r.porcs_sortida AS queden,
       (SELECT COUNT(*) FROM ocupacio_corral oc
         WHERE oc.cicle_id = r.id AND oc.esborrat_el IS NULL) AS num_corrals
     FROM v_cicle_resum r
     ORDER BY r.data_entrada DESC, r.banda`
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
  db: SQLiteDatabase
): Promise<CarregaLlista[]> {
  return db.getAllAsync<CarregaLlista>(
    `SELECT
       c.id, c.data_carrega, c.tipus, c.unitats, c.promig_kg,
       COALESCE((SELECT SUM(l.num_porcs) FROM linia_carrega l
                 WHERE l.carrega_id = c.id AND l.esborrat_el IS NULL), 0) AS porcs_linies
     FROM carrega_escorxador c
     WHERE c.esborrat_el IS NULL
     ORDER BY c.data_carrega DESC, c.creat_el DESC`
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
