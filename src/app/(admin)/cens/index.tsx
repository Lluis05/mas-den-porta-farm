import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  censTrugesActual,
  llistaBaixesTruja,
  llistaRecomptesTruges,
  type BaixaTruja,
  type CensTrugesActual,
  type RecompteTruges,
} from '@/db/queries';
import { colors, mides } from '@/theme';

export default function CensTruges() {
  const db = useSQLiteContext();
  const [actual, setActual] = useState<CensTrugesActual | null>(null);
  const [recomptes, setRecomptes] = useState<RecompteTruges[]>([]);
  const [baixes, setBaixes] = useState<BaixaTruja[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const [a, r, b] = await Promise.all([
          censTrugesActual(db),
          llistaRecomptesTruges(db, 10),
          llistaBaixesTruja(db, 10),
        ]);
        if (!viu) return;
        setActual(a);
        setRecomptes(r);
        setBaixes(b);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Cens de truges' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Truges ara mateix</Text>
          {actual == null ? (
            <Text style={styles.ajuda}>
              Encara no hi ha cap recompte. Fes-ne un per començar.
            </Text>
          ) : (
            <>
              <Text style={styles.granTotal}>{actual.total}</Text>
              <Text style={styles.ajuda}>
                Recompte de {actual.data_recompte}: {actual.recompte}
                {actual.altes > 0 ? ` · +${actual.altes} altes` : ''}
                {actual.baixes_mort > 0 ? ` · −${actual.baixes_mort} mortes` : ''}
                {actual.baixes_rebuig > 0 ? ` · −${actual.baixes_rebuig} rebuig` : ''}
              </Text>
            </>
          )}
        </View>

        <View style={styles.botons}>
          <Link href="/cens/recompte" asChild>
            <Pressable style={styles.botoPrincipal} accessibilityRole="button">
              <Text style={styles.botoText}>Fer un recompte</Text>
            </Pressable>
          </Link>
          <Link href="/cens/baixa" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Apuntar una baixa</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Últims recomptes</Text>
          {recomptes.length === 0 && <Text style={styles.ajuda}>Cap encara.</Text>}
          {recomptes.map((r) => (
            <View key={r.id} style={styles.fila}>
              <Text style={styles.filaEtiqueta}>{r.data}</Text>
              <Text style={styles.filaValor}>{r.num_truges}</Text>
            </View>
          ))}
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Últimes baixes</Text>
          {baixes.length === 0 && <Text style={styles.ajuda}>Cap encara.</Text>}
          {baixes.map((b) => (
            <View key={b.id} style={styles.fila}>
              <Text style={styles.filaEtiqueta}>
                {b.data}
                {b.motiu ? ` · ${b.motiu}` : ''}
              </Text>
              <Text style={styles.filaValor}>−{b.num_truges}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </>
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
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  granTotal: { fontSize: 40, fontWeight: '700', color: colors.text },
  ajuda: { fontSize: 13, color: colors.discret },
  botons: { flexDirection: 'row', gap: mides.espai },
  botoPrincipal: {
    flex: 1,
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  botoSecundari: {
    flex: 1,
    height: 52,
    borderRadius: mides.radi,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  botoSecundariText: { fontSize: 16, fontWeight: '600', color: colors.primari },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  filaEtiqueta: { color: colors.text, fontSize: 14 },
  filaValor: { fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: 14 },
});
