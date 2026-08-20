import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { llistaCarregues, type CarregaLlista } from '@/db/queries';
import { colors, mides } from '@/theme';

export default function HistorialCarregues() {
  const db = useSQLiteContext();
  const [carregues, setCarregues] = useState<CarregaLlista[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const llista = await llistaCarregues(db);
        if (viu) setCarregues(llista);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Historial de càrregues' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          {carregues.length === 0 && (
            <Text style={styles.ajuda}>Encara no n&apos;hi ha cap.</Text>
          )}
          {carregues.map((c) => (
            <Link key={c.id} href={`/carrega/${c.id}`} asChild>
              <Pressable style={styles.filaCicle} accessibilityRole="button">
                <View style={styles.flex}>
                  <Text style={styles.cicleTitol}>
                    {c.data_carrega} · {c.unitats ?? c.porcs_linies}{' '}
                    {c.tipus === 'truges_rebuig' ? 'truges' : 'porcs'}
                  </Text>
                  <Text style={styles.ajuda}>
                    {c.promig_kg != null
                      ? `${c.promig_kg.toFixed(1)} kg de mitjana`
                      : 'falten les dades de la factura'}
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
  cicleTitol: { fontSize: 16, fontWeight: '600', color: colors.text },
  fletxa: { fontSize: 24, color: colors.discret },
});
