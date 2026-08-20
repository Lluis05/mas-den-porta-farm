import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  llistaEntradesLlavores,
  type EntradaLlavoresLlista,
} from '@/db/queries';
import { colors, mides } from '@/theme';

export default function Llavors() {
  const db = useSQLiteContext();
  const [entrades, setEntrades] = useState<EntradaLlavoresLlista[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const llista = await llistaEntradesLlavores(db);
        if (viu) setEntrades(llista);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Llavores' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <Link href="/llavors/nova" asChild>
          <Pressable style={styles.botoPrincipal} accessibilityRole="button">
            <Text style={styles.botoText}>Apuntar una entrada</Text>
          </Pressable>
        </Link>

        <View style={styles.targeta}>
          {entrades.length === 0 && (
            <Text style={styles.ajuda}>Encara no n&apos;hi ha cap.</Text>
          )}
          {entrades.map((e) => (
            <Link key={e.id} href={`/llavors/${e.id}`} asChild>
              <Pressable style={styles.fila} accessibilityRole="button">
                <View style={styles.flex}>
                  <Text style={styles.titol}>
                    {e.data} · {e.unitats ?? '—'} truges
                  </Text>
                  <Text style={styles.ajuda}>
                    {e.kg != null ? `${e.kg} kg` : 'falten els kg'}
                    {e.promig_kg != null
                      ? ` · ${e.promig_kg.toFixed(1)} kg de mitjana`
                      : ''}
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
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  titol: { fontSize: 16, fontWeight: '600', color: colors.text },
  fletxa: { fontSize: 24, color: colors.discret },
  botoPrincipal: {
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
