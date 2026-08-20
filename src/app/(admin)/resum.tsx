import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  resumTrimestral,
  type ResumTipus,
  type ResumTrimestre,
} from '@/db/queries';
import { colors, mides } from '@/theme';

const arrodoneix = (n: number | null, decimals = 0) =>
  n == null ? '—' : n.toFixed(decimals);

export default function Resum() {
  const db = useSQLiteContext();
  const [periodes, setPeriodes] = useState<ResumTrimestre[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const r = await resumTrimestral(db);
        if (viu) setPeriodes(r);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Resum trimestral' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        {periodes.length === 0 && (
          <View style={styles.targeta}>
            <Text style={styles.ajuda}>Encara no hi ha cap càrrega ni entrada apuntada.</Text>
          </View>
        )}
        {periodes.map((p) => (
          <View key={`${p.any}-${p.trimestre}`} style={styles.targeta}>
            <Text style={styles.titolPeriode}>
              {p.any} · {p.trimestre}T
            </Text>
            {p.porcs && (
              <BlocTipus
                titol="Porcs d'engreix"
                r={p.porcs}
                ambRendiment
                ambPreu
              />
            )}
            {p.truges && <BlocTipus titol="Truges de rebuig" r={p.truges} ambPreu />}
            {p.llavores && <BlocTipus titol="Llavores" r={p.llavores} ambPreu />}
          </View>
        ))}
      </ScrollView>
    </>
  );
}

function BlocTipus({
  titol,
  r,
  ambRendiment,
  ambPreu,
}: {
  titol: string;
  r: ResumTipus;
  ambRendiment?: boolean;
  ambPreu?: boolean;
}) {
  return (
    <View style={styles.blocTipus}>
      <Text style={styles.titolTipus}>{titol}</Text>
      <Fila etiqueta="Kg" valor={`${arrodoneix(r.kg)} kg`} />
      {ambRendiment && (
        <Fila etiqueta="Kg canal" valor={`${arrodoneix(r.kgCanal)} kg`} />
      )}
      {ambRendiment && (
        <Fila
          etiqueta="Rendiment"
          valor={r.rendiment != null ? `${(r.rendiment * 100).toFixed(1)}%` : '—'}
        />
      )}
      <Fila etiqueta="Unitats" valor={arrodoneix(r.unitats)} />
      <Fila etiqueta="Promig" valor={`${arrodoneix(r.promigKg, 1)} kg`} />
      {ambPreu && (
        <Fila
          etiqueta="Preu/kg"
          valor={r.preuKg != null ? `${r.preuKg.toFixed(2)} €` : '—'}
        />
      )}
    </View>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={styles.filaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  ajuda: { fontSize: 13, color: colors.discret },
  titolPeriode: { fontSize: 18, fontWeight: '700', color: colors.text },
  blocTipus: { marginTop: 8 },
  titolTipus: { fontSize: 13, fontWeight: '600', color: colors.discret, marginBottom: 2 },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  filaEtiqueta: { color: colors.text, fontSize: 14 },
  filaValor: { fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: 14 },
});
