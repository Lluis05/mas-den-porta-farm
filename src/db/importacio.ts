import * as Crypto from 'expo-crypto';
import type { SQLiteDatabase } from 'expo-sqlite';

import fitxer from '@/assets/import/granja.json';
import { TAULES_DE_DADES } from '@/db/schema';
import { analitzaCodiSala, reparteix, reparteixProporcional } from '@/lib/corrals';

/**
 * Forma del fitxer que genera `scripts/importar-excel.mjs`.
 *
 * Es declara a mà i no es dedueix del JSON: TypeScript infereix tipus massa
 * estrets a partir del contingut concret (una columna buida a l'Excel d'avui
 * quedaria com a `null` per sempre) i el codi deixaria de compilar quan
 * l'Excel canviï.
 */
type Nul = number | null;

type DadesImportacio = {
  generat: string;
  origen: string;
  any: number;
  pinso: {
    entregues: { data: string; tipus: string; kg: number; factura?: number }[];
    factures: {
      data: string;
      importPinso: Nul;
      importMedicaments: Nul;
      importMedicamentsSenseIva: Nul;
    }[];
  };
  deslletaments: {
    banda: number;
    dataDesmamat: string;
    trugesCriades: Nul;
    trugesDesmamades: Nul;
    porcsVius1aSetmana: Nul;
    porcsDesmamats: Nul;
    insemTotal: Nul;
    repetidores: Nul;
    primales: Nul;
    plenes: Nul;
    porcsEngreix: Nul;
    observacions: string | null;
    posicioInseminar: string | null;
    posicioGestacio: string | null;
  }[];
  cicles: {
    full: string;
    banda: number;
    dataEntrada: string;
    sales: { codi: string; dataEntrada: string; porcs: Nul }[];
    /** La data de deslletament de la fila de Cens24 a la qual s'ha lligat. */
    deslletamentData: string | null;
  }[];
  carregues: {
    data: string;
    tipus: 'porcs_engreix' | 'truges_rebuig';
    unitats: Nul;
    kg: Nul;
    kgCanal: Nul;
    totalFactura: Nul;
    preuKg: Nul;
    preuReferencia: Nul;
    decomisos?: { codi: 'D4' | 'D5'; numPorcs: number }[];
    linies?: { codi: string; porcs: number }[];
  }[];
  llavores: {
    data: string;
    unitats: Nul;
    kg: Nul;
    totalFactura: Nul;
    preuKg: Nul;
  }[];
  avisos: string[];
};

const dades = fitxer as unknown as DadesImportacio;

/**
 * Carrega a la base de dades el JSON que ha generat `npm run importar`.
 *
 * Es fa un sol cop: queda apuntat a la taula `importacio`, amb la marca de
 * temps del fitxer, perquè no es dupliqui res si es torna a obrir la pantalla.
 */

export type ResumImportacio = {
  generat: string;
  entreguesPinso: number;
  facturesPinso: number;
  deslletaments: number;
  cicles: number;
  carregues: number;
  liniesCarrega: number;
  llavores: number;
  avisos: string[];
};

/** Què hi ha al fitxer, sense tocar la base de dades. */
export function resumDelFitxer(): ResumImportacio {
  return {
    generat: dades.generat,
    entreguesPinso: dades.pinso.entregues.length,
    facturesPinso: dades.pinso.factures.length,
    deslletaments: dades.deslletaments.length,
    cicles: dades.cicles.length,
    carregues: dades.carregues.length,
    liniesCarrega: dades.carregues.reduce(
      (s, c) => s + (c.linies?.length ?? 0),
      0
    ),
    llavores: dades.llavores.length,
    avisos: dades.avisos,
  };
}

export type ImportacioFeta = { id: string; fet_el: string };

export async function jaImportat(
  db: SQLiteDatabase
): Promise<ImportacioFeta | null> {
  return db.getFirstAsync<ImportacioFeta>(
    'SELECT id, fet_el FROM importacio WHERE generat = ?',
    dades.generat
  );
}

export type ImportacioAnterior = { id: string; generat: string; fet_el: string };

/**
 * Una importació que ja hi és però NO és d'aquest fitxer (típicament perquè
 * ha arribat un Excel corregit i s'ha tornat a executar `npm run importar`,
 * que sempre genera un `generat` nou). `jaImportat()` no la troba, perquè
 * compara pel `generat` d'ara — sense això, la pantalla no sabria que hi ha
 * una importació antiga pendent de desfer, i tornar a importar duplicaria
 * les dades en lloc de substituir-les. Cal desfer-la abans d'importar la
 * nova. Descobert 2026-08-22 arreglant el bug de la data errònia.
 */
export async function importacioAnterior(
  db: SQLiteDatabase
): Promise<ImportacioAnterior | null> {
  return db.getFirstAsync<ImportacioAnterior>(
    'SELECT id, generat, fet_el FROM importacio WHERE generat != ? ORDER BY fet_el DESC LIMIT 1',
    dades.generat
  );
}

/**
 * Desfà una importació sencera: marca com esborrades totes les files que va
 * crear, a totes les taules. Les dades que hagis introduït tu a mà no es
 * toquen, perquè no porten la marca d'aquesta importació.
 *
 * La fila de `importacio` s'esborra de debò perquè es pugui tornar a importar
 * el mateix fitxer. És paperassa interna, no una dada de la granja.
 */
export async function desfesImportacio(
  db: SQLiteDatabase,
  importacioId: string
): Promise<number> {
  let files = 0;
  await db.withTransactionAsync(async () => {
    for (const taula of TAULES_DE_DADES) {
      const r = await db.runAsync(
        `UPDATE ${taula}
         SET esborrat_el = datetime('now'), sincronitzat_el = NULL
         WHERE importacio_id = ? AND esborrat_el IS NULL`,
        importacioId
      );
      files += r.changes;
    }
    await db.runAsync('DELETE FROM importacio WHERE id = ?', importacioId);
  });
  return files;
}

/** Errors que no aturen la importació però que l'usuari ha de veure. */
export type ProblemaImportacio = string;

export async function importaDades(
  db: SQLiteDatabase
): Promise<ProblemaImportacio[]> {
  const problemes: ProblemaImportacio[] = [];

  // Índexs de les dades fixes, que ja hi són des de la sembra.
  const bandes = new Map<number, string>();
  for (const b of await db.getAllAsync<{ id: string; numero: number }>(
    'SELECT id, numero FROM banda'
  )) {
    bandes.set(b.numero, b.id);
  }

  const corrals = new Map<string, string>(); // "sala-meitat-numero" -> id
  for (const c of await db.getAllAsync<{
    id: string;
    sala: number;
    meitat: string;
    numero: number;
  }>(
    `SELECT c.id, s.numero AS sala, c.meitat, c.numero
     FROM corral c JOIN sala s ON s.id = c.sala_id`
  )) {
    corrals.set(`${c.sala}-${c.meitat}-${c.numero}`, c.id);
  }

  const tipusPinso = new Map<string, string>();
  for (const t of await db.getAllAsync<{ id: string; codi: string }>(
    'SELECT id, codi FROM tipus_pinso'
  )) {
    tipusPinso.set(t.codi, t.id);
  }

  const ubicacions = new Map<string, string>();
  for (const u of await db.getAllAsync<{ id: string; codi: string }>(
    'SELECT id, codi FROM ubicacio_reproduccio'
  )) {
    ubicacions.set(u.codi.toUpperCase(), u.id);
  }

  /**
   * Una posició pot ser més d'una a la vegada, escrit a l'Excel com
   * "L2 + L4" (resposta B3 / docs/excel-analisi.md). Els codis que no
   * coincideixen amb cap ubicacio_reproduccio coneguda es descarten en
   * silenci, igual que ja feia abans amb un sol codi.
   */
  function ubicacionsDelText(text: string | null): string[] {
    if (!text) return [];
    return text
      .split('+')
      .map((part) => part.trim().toUpperCase())
      .filter((part) => part.length > 0)
      .map((part) => ubicacions.get(part))
      .filter((id): id is string => id != null);
  }

  /** Els ids dels corrals d'un codi tipus "11 1-2-3-4E". */
  function corralsDelCodi(codi: string): string[] | null {
    const analitzat = analitzaCodiSala(codi);
    if (!analitzat) return null;
    const ids: string[] = [];
    for (const c of analitzat.corrals) {
      const id = corrals.get(`${analitzat.sala}-${c.meitat}-${c.numero}`);
      if (id) ids.push(id);
    }
    return ids.length > 0 ? ids : null;
  }

  /**
   * Porcs que hi ha a cada corral mentre s'importa. Cal portar el compte per
   * repartir les sortides com ho fa l'app: en proporció al que queda a cada
   * corral. Si es repartissin a parts iguals, el sobrant cauria sempre al
   * primer corral i acabaria amb porcs negatius.
   */
  const ocupacio = new Map<string, number>();

  /** "bandaId|dataDesmamat" -> deslletamentId, per lligar-hi els cicles. */
  const deslletamentsPerBandaData = new Map<string, string>();

  const importacioId = Crypto.randomUUID();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO importacio (id, generat, origen, fet_el) VALUES (?, ?, ?, datetime('now'))`,
      importacioId,
      dades.generat,
      dades.origen
    );

    // --- Pinso -------------------------------------------------------------
    const idsFactures: string[] = [];
    for (const f of dades.pinso.factures) {
      const id = Crypto.randomUUID();
      idsFactures.push(id);
      await db.runAsync(
        `INSERT INTO factura_pinso
           (id, data, import_pinso, import_medicaments, import_medicaments_sense_iva, importacio_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        f.data,
        f.importPinso,
        f.importMedicaments,
        f.importMedicamentsSenseIva,
        importacioId
      );
    }

    for (const e of dades.pinso.entregues) {
      const tipusId = tipusPinso.get(e.tipus);
      if (!tipusId) {
        problemes.push(`Tipus de pinso desconegut: "${e.tipus}" (${e.data}).`);
        continue;
      }
      await db.runAsync(
        `INSERT INTO entrega_pinso (id, data, tipus_pinso_id, kg, factura_id, importacio_id)
         VALUES (?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        e.data,
        tipusId,
        e.kg,
        e.factura == null ? null : (idsFactures[e.factura] ?? null),
        importacioId
      );
    }

    // --- Deslletaments i transició ----------------------------------------
    for (const d of dades.deslletaments) {
      const bandaId = bandes.get(d.banda);
      if (!bandaId) {
        problemes.push(`Banda desconeguda: ${d.banda} (${d.dataDesmamat}).`);
        continue;
      }
      const deslletamentId = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO deslletament
           (id, banda_id, data_desmamat, truges_criades, truges_desmamades,
            porcs_vius_1a_setmana, porcs_desmamats, insem_total, repetidores,
            primales, plenes, observacions, importacio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        deslletamentId,
        bandaId,
        d.dataDesmamat,
        d.trugesCriades,
        d.trugesDesmamades,
        d.porcsVius1aSetmana,
        d.porcsDesmamats,
        d.insemTotal,
        d.repetidores,
        d.primales,
        d.plenes,
        d.observacions,
        importacioId
      );
      deslletamentsPerBandaData.set(`${bandaId}|${d.dataDesmamat}`, deslletamentId);

      for (const ubicacioId of [
        ...ubicacionsDelText(d.posicioInseminar),
        ...ubicacionsDelText(d.posicioGestacio),
      ]) {
        await db.runAsync(
          `INSERT INTO deslletament_posicio (id, deslletament_id, ubicacio_id, importacio_id)
           VALUES (?, ?, ?, ?)`,
          Crypto.randomUUID(),
          deslletamentId,
          ubicacioId,
          importacioId
        );
      }

      // La transició es fa fora: només en guardem les dues xifres (resposta G1).
      if (d.porcsDesmamats != null || d.porcsEngreix != null) {
        await db.runAsync(
          `INSERT INTO transicio
             (id, deslletament_id, porcs_sortida, porcs_retorn, importacio_id)
           VALUES (?, ?, ?, ?, ?)`,
          Crypto.randomUUID(),
          deslletamentId,
          d.porcsDesmamats,
          d.porcsEngreix,
          importacioId
        );
      }
    }

    // --- Cicles d'engreix --------------------------------------------------
    for (const c of dades.cicles) {
      const bandaId = bandes.get(c.banda);
      if (!bandaId) {
        problemes.push(`Cicle del full ${c.full}: banda ${c.banda} desconeguda.`);
        continue;
      }

      const entrada = c.sales.reduce((s, x) => s + (x.porcs ?? 0), 0);
      const cicleId = Crypto.randomUUID();
      const deslletamentId = c.deslletamentData
        ? (deslletamentsPerBandaData.get(`${bandaId}|${c.deslletamentData}`) ?? null)
        : null;
      await db.runAsync(
        `INSERT INTO cicle_engreix
           (id, banda_id, deslletament_id, data_entrada, porcs_entrada, observacions,
            importacio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        cicleId,
        bandaId,
        deslletamentId,
        c.dataEntrada,
        entrada,
        `Importat del full "${c.full}" de l'Excel`,
        importacioId
      );

      for (const sala of c.sales) {
        const ids = corralsDelCodi(sala.codi);
        if (!ids) {
          problemes.push(
            `Cicle del full ${c.full}: no s'entén el codi de sala "${sala.codi}".`
          );
          continue;
        }
        const repartiment = reparteix(sala.porcs ?? 0, ids.length);
        for (let i = 0; i < ids.length; i++) {
          await db.runAsync(
            `INSERT INTO ocupacio_corral
               (id, cicle_id, corral_id, data_entrada, porcs_entrada, importacio_id)
             VALUES (?, ?, ?, ?, ?, ?)`,
            Crypto.randomUUID(),
            cicleId,
            ids[i],
            sala.dataEntrada,
            repartiment[i],
            importacioId
          );
          ocupacio.set(ids[i], (ocupacio.get(ids[i]) ?? 0) + repartiment[i]);
        }
      }
    }

    // --- Càrregues a escorxador -------------------------------------------
    // Per ordre de data: una sortida només pot treure porcs dels que hi havia
    // en aquell moment.
    const carreguesOrdenades = [...dades.carregues].sort((a, b) =>
      a.data.localeCompare(b.data)
    );
    for (const c of carreguesOrdenades) {
      const carregaId = Crypto.randomUUID();
      await db.runAsync(
        `INSERT INTO carrega_escorxador
           (id, data_carrega, tipus, unitats, kg, kg_canal,
            total_factura, preu_kg, preu_referencia, importacio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        carregaId,
        c.data,
        c.tipus,
        c.unitats,
        c.kg,
        c.kgCanal,
        c.totalFactura,
        c.preuKg,
        c.preuReferencia,
        importacioId
      );

      for (const d of c.decomisos ?? []) {
        await db.runAsync(
          `INSERT INTO decomis (id, carrega_id, codi, num_porcs, importacio_id)
           VALUES (?, ?, ?, ?, ?)`,
          Crypto.randomUUID(),
          carregaId,
          d.codi,
          d.numPorcs,
          importacioId
        );
      }

      for (const linia of c.linies ?? []) {
        const ids = corralsDelCodi(linia.codi);
        if (!ids) {
          problemes.push(
            `Càrrega del ${c.data}: no s'entén el codi de sala "${linia.codi}".`
          );
          continue;
        }
        const disponibles = ids.map((id) => ocupacio.get(id) ?? 0);
        const repartiment = reparteixProporcional(linia.porcs, disponibles);
        const repartits = repartiment.reduce((s, n) => s + n, 0);
        if (repartits < linia.porcs) {
          problemes.push(
            `Càrrega del ${c.data}, sala ${linia.codi}: en surten ${linia.porcs} però només n'hi consten ${repartits}.`
          );
        }
        for (let i = 0; i < ids.length; i++) {
          if (repartiment[i] === 0) continue;
          await db.runAsync(
            `INSERT INTO linia_carrega
               (id, carrega_id, corral_id, num_porcs, importacio_id)
             VALUES (?, ?, ?, ?, ?)`,
            Crypto.randomUUID(),
            carregaId,
            ids[i],
            repartiment[i],
            importacioId
          );
          ocupacio.set(ids[i], (ocupacio.get(ids[i]) ?? 0) - repartiment[i]);
        }
      }
    }

    // --- Entrades de llavores ---------------------------------------------
    for (const l of dades.llavores) {
      await db.runAsync(
        `INSERT INTO entrada_llavores
           (id, data, unitats, kg, total_factura, preu_kg, importacio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(),
        l.data,
        l.unitats,
        l.kg,
        l.totalFactura,
        l.preuKg,
        importacioId
      );
    }

    await db.runAsync('UPDATE importacio SET problemes = ? WHERE id = ?',
      problemes.length, importacioId);
  });

  return problemes;
}
