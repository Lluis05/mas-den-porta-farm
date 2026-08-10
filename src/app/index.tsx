import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Recompte = {
  sales: number;
  corrals: number;
  places: number;
  bandes: number;
  tipusPinso: number;
  porcs: number;
};

/**
 * Pantalla provisional: encara no hi ha funcionalitat, només serveix per
 * comprovar que la base de dades s'ha creat bé al mòbil.
 */
export default function Index() {
  const db = useSQLiteContext();
  const [dades, setDades] = useState<Recompte | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;

    async function carrega() {
      try {
        const fila = await db.getFirstAsync<Recompte>(`
          SELECT
            (SELECT COUNT(*) FROM sala)                  AS sales,
            (SELECT COUNT(*) FROM corral)                AS corrals,
            (SELECT COALESCE(SUM(capacitat), 0) FROM corral) AS places,
            (SELECT COUNT(*) FROM banda)                 AS bandes,
            (SELECT COUNT(*) FROM tipus_pinso)           AS tipusPinso,
            (SELECT COALESCE(SUM(porcs), 0) FROM v_ocupacio_actual) AS porcs
        `);
        if (viu) setDades(fila);
      } catch (e) {
        if (viu) setError(e instanceof Error ? e.message : String(e));
      }
    }

    carrega();
    return () => {
      viu = false;
    };
  }, [db]);

  return (
    <>
      <Stack.Screen options={{ title: 'Granja' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>Error de base de dades</Text>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {!error && !dades && <Text style={styles.discret}>Carregant…</Text>}

        {dades && (
          <>
            <View style={styles.targeta}>
              <Text style={styles.titol}>Base de dades creada</Text>
              <Text style={styles.discret}>
                L&apos;estructura de la granja ja hi és. Encara no hi ha cap porc
                registrat.
              </Text>
            </View>

            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Estructura</Text>
              <Fila etiqueta="Sales" valor={dades.sales} />
              <Fila etiqueta="Corrals" valor={dades.corrals} />
              <Fila etiqueta="Places totals" valor={dades.places} />
              <Fila etiqueta="Bandes" valor={dades.bandes} />
              <Fila etiqueta="Tipus de pinso" valor={dades.tipusPinso} />
            </View>

            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Ara mateix</Text>
              <Fila etiqueta="Porcs a la granja" valor={dades.porcs} />
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { padding: 16, gap: 12 },
  targeta: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ddd',
  },
  targetaError: { backgroundColor: '#fff4f4', borderColor: '#f0c0c0' },
  titol: { fontSize: 18, fontWeight: '600' },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: '#888', marginBottom: 8 },
  titolError: { fontSize: 16, fontWeight: '600', color: '#a11' },
  textError: { color: '#a11', fontFamily: 'monospace' },
  discret: { color: '#777' },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eee',
  },
  etiqueta: { color: '#333' },
  valor: { fontWeight: '600', fontVariant: ['tabular-nums'] },
});
