import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  llistaCarregues,
  llistaCicles,
  porcsALaGranja,
  type CarregaLlista,
  type CicleLlista,
} from '@/db/queries';
import { colors, mides } from '@/theme';

export default function Index() {
  const db = useSQLiteContext();
  const [porcs, setPorcs] = useState<number | null>(null);
  const [cicles, setCicles] = useState<CicleLlista[]>([]);
  const [carregues, setCarregues] = useState<CarregaLlista[]>([]);
  const [error, setError] = useState<string | null>(null);

  // useFocusEffect i no useEffect: així es refresca en tornar d'una altra
  // pantalla, per exemple després de crear un cicle.
  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        try {
          const [total, llista, carr] = await Promise.all([
            porcsALaGranja(db),
            llistaCicles(db),
            llistaCarregues(db),
          ]);
          if (!viu) return;
          setPorcs(total);
          setCicles(llista);
          setCarregues(carr);
          setError(null);
        } catch (e) {
          if (viu) setError(e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

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

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Porcs a la granja</Text>
          <Text style={styles.granTotal}>{porcs ?? '—'}</Text>
        </View>

        <View style={styles.botons}>
          <Link href="/cicle/nou" asChild>
            <Pressable style={styles.botoPrincipal} accessibilityRole="button">
              <Text style={styles.botoText}>Nou cicle</Text>
            </Pressable>
          </Link>
          <Link href="/carrega/nova" asChild>
            <Pressable style={styles.botoPrincipal} accessibilityRole="button">
              <Text style={styles.botoText}>Nova càrrega</Text>
            </Pressable>
          </Link>
        </View>

        <Link href="/importar" asChild>
          <Pressable style={styles.botoSecundari} accessibilityRole="button">
            <Text style={styles.botoSecundariText}>Importar de l&apos;Excel</Text>
          </Pressable>
        </Link>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Cicles</Text>
          {cicles.length === 0 && (
            <Text style={styles.ajuda}>
              Encara no n&apos;hi ha cap. Comença&apos;n un amb el botó de dalt.
            </Text>
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

        {carregues.length > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Últimes càrregues</Text>
            {carregues.slice(0, 8).map((c) => (
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
        )}
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
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  titolError: { fontSize: 16, fontWeight: '600', color: colors.perill },
  textError: { color: colors.perill },
  granTotal: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
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
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  botoSecundari: {
    height: 48,
    borderRadius: mides.radi,
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSecundariText: { fontSize: 16, fontWeight: '600', color: colors.primari },
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
