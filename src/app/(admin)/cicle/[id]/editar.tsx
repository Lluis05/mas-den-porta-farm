import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormulariCicle } from '@/components/formulari-cicle';
import {
  actualitzaCicle,
  ciclePerEditar,
  cicleTeSortides,
  type CicleEditable,
  type NouCicle,
} from '@/db/queries';
import { colors, mides } from '@/theme';

export default function EditarCicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [inicial, setInicial] = useState<CicleEditable | null>(null);
  const [teSortides, setTeSortides] = useState<boolean | null>(null);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [dades, sortides] = await Promise.all([
        ciclePerEditar(db, id),
        cicleTeSortides(db, id),
      ]);
      if (!viu) return;
      setInicial(dades);
      setTeSortides(sortides);
    })();
    return () => {
      viu = false;
    };
  }, [db, id]);

  async function desa(dades: NouCicle) {
    await actualitzaCicle(db, id, dades);
    router.replace(`/cicle/${id}`);
  }

  if (teSortides === null || !inicial) {
    return (
      <View style={styles.centrat}>
        <Stack.Screen options={{ title: 'Editar' }} />
        <Text style={styles.ajuda}>Carregant…</Text>
      </View>
    );
  }

  // Canviar l'ocupació d'un cicle del qual ja han sortit porcs deixaria les
  // càrregues desades sense sentit. Primer s'han d'esborrar les càrregues.
  if (teSortides) {
    return (
      <View style={styles.pagina}>
        <Stack.Screen options={{ title: 'Editar' }} />
        <View style={[styles.targeta, styles.targetaAvis]}>
          <Text style={styles.titolAvis}>Aquest cicle no es pot editar</Text>
          <Text style={styles.textAvis}>
            Ja n&apos;han sortit porcs cap a l&apos;escorxador. Si es canviessin
            ara les sales o les quantitats, les càrregues ja desades deixarien de
            quadrar.
          </Text>
          <Text style={styles.textAvis}>
            Per canviar-lo, esborra abans les càrregues d&apos;aquest cicle.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Editar el cicle' }} />
      <FormulariCicle inicial={inicial} textBoto="Desar els canvis" onDesa={desa} />
    </>
  );
}

const styles = StyleSheet.create({
  centrat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagina: { flex: 1, padding: mides.espai, backgroundColor: colors.fons },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  titolAvis: { fontSize: 16, fontWeight: '700', color: colors.avis },
  textAvis: { color: colors.avis },
  ajuda: { fontSize: 13, color: colors.discret },
});
