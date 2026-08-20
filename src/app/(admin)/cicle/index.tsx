import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { llistaCicles, type CicleLlista } from '@/db/queries';
import { colors, mides } from '@/theme';

export default function HistorialCicles() {
  const db = useSQLiteContext();
  const [cicles, setCicles] = useState<CicleLlista[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const llista = await llistaCicles(db);
        if (viu) setCicles(llista);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Historial de cicles' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          {cicles.length === 0 && (
            <Text style={styles.ajuda}>Encara no n&apos;hi ha cap.</Text>
          )}
          {cicles.map((c) => (
            <Link key={c.id} href={`/cicle/${c.id}`} asChild>
              <Pressable style={styles.filaCicle} accessibilityRole="button">
                <View style={styles.bandaRodona}>
                  <Text style={styles.bandaNum}>{c.banda}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cicleTitol}>
                    {c.queden} porcs · {c.num_corrals} corralines
                  </Text>
                  <Text style={styles.ajuda}>
                    Entrada {c.data_entrada} · {c.porcs_entrada} porcs
                    {c.porcs_sortida > 0 ? ` · han sortit ${c.porcs_sortida}` : ''}
                  </Text>
                </View>
                <Text style={styles.fletxa}>›</Text>
              </Pressable>
            </Link>
          ))}
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
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
  filaCicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  bandaRodona: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandaNum: { fontSize: 17, fontWeight: '700', color: colors.primari },
  cicleTitol: { fontSize: 16, fontWeight: '600', color: colors.text },
  fletxa: { fontSize: 24, color: colors.discret },
});
