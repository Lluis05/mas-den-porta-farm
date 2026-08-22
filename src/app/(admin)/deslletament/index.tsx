import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  llistaDeslletaments,
  type DeslletamentLlista,
} from '@/db/queries';
import { colors, mides } from '@/theme';

export default function Deslletaments() {
  const db = useSQLiteContext();
  const [llista, setLlista] = useState<DeslletamentLlista[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const d = await llistaDeslletaments(db);
        if (viu) setLlista(d);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Deslletaments' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <Link href="/deslletament/nova" asChild>
          <Pressable style={styles.botoPrincipal} accessibilityRole="button">
            <Text style={styles.botoText}>Apuntar un deslletament</Text>
          </Pressable>
        </Link>

        <View style={styles.targeta}>
          {llista.length === 0 && (
            <Text style={styles.ajuda}>Encara no n&apos;hi ha cap.</Text>
          )}
          {llista.map((d) => (
            <Link key={d.id} href={`/deslletament/${d.id}`} asChild>
              <Pressable style={styles.fila} accessibilityRole="button">
                <View style={styles.flex}>
                  <Text style={styles.titol}>
                    Banda {d.banda} · {d.data_desmamat}
                  </Text>
                  <Text style={styles.ajuda}>
                    {d.porcs_desmamats != null
                      ? `${d.porcs_desmamats} desmamats`
                      : 'falten dades'}
                    {d.data_inseminacio == null
                      ? ' · falta la inseminació'
                      : ` · inseminades ${d.primales ?? '—'} primales`}
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
