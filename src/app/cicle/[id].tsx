import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  ocupacioDelCicle,
  resumCicle,
  type CicleResum,
  type OcupacioFila,
} from '@/db/queries';
import { codiSala } from '@/lib/corrals';
import { colors, mides } from '@/theme';

export default function DetallCicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [resum, setResum] = useState<CicleResum | null>(null);
  const [ocupacio, setOcupacio] = useState<OcupacioFila[]>([]);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [r, o] = await Promise.all([
        resumCicle(db, id),
        ocupacioDelCicle(db, id),
      ]);
      if (!viu) return;
      setResum(r);
      setOcupacio(o);
    })();
    return () => {
      viu = false;
    };
  }, [db, id]);

  /** Agrupem els corrals per sala per poder escriure el codi de cada sala. */
  const perSala = useMemo(() => {
    const mapa = new Map<number, OcupacioFila[]>();
    for (const fila of ocupacio) {
      const llista = mapa.get(fila.sala);
      if (llista) llista.push(fila);
      else mapa.set(fila.sala, [fila]);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [ocupacio]);

  if (!resum) {
    return (
      <View style={styles.centrat}>
        <Stack.Screen options={{ title: 'Cicle' }} />
        <Text style={styles.ajuda}>Carregant…</Text>
      </View>
    );
  }

  const queden = resum.porcs_entrada - resum.porcs_sortida;

  return (
    <>
      <Stack.Screen options={{ title: `Banda ${resum.banda}` }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          <Text style={styles.titol}>Cicle d&apos;engreix</Text>
          <Fila etiqueta="Banda" valor={String(resum.banda)} />
          <Fila etiqueta="Data d'entrada" valor={resum.data_entrada} />
          <Fila etiqueta="Porcs d'entrada" valor={String(resum.porcs_entrada)} />
          <Fila etiqueta="Han sortit" valor={String(resum.porcs_sortida)} />
          <Fila etiqueta="Queden" valor={String(queden)} destacat />
        </View>

        {resum.porcs_sortida > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Sortides</Text>
            <Fila
              etiqueta="Primera venda"
              valor={resum.data_primera_venda ?? '—'}
            />
            <Fila
              etiqueta="Edat primera venda"
              valor={
                resum.edat_primera_venda != null
                  ? `${resum.edat_primera_venda.toFixed(1)} setmanes`
                  : '—'
              }
            />
            <Fila
              etiqueta="Baixes (per diferència)"
              valor={String(resum.baixes)}
            />
            <Fila
              etiqueta="% baixes"
              valor={
                resum.pct_baixes != null
                  ? `${(resum.pct_baixes * 100).toFixed(1)} %`
                  : '—'
              }
            />
            <Text style={styles.ajuda}>
              Les baixes es dedueixen: entrada − sortides − sobrants.
            </Text>
          </View>
        )}

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>On són</Text>
          {perSala.map(([sala, files]) => {
            const codi = codiSala(
              sala,
              files.map((f) => ({ meitat: f.meitat, numero: f.corral }))
            );
            const entrats = files.reduce((s, f) => s + f.porcs_entrada, 0);
            const ara = files.reduce((s, f) => s + f.porcs_ara, 0);
            return (
              <View key={sala} style={styles.blocSala}>
                <View style={styles.capcaleraSala}>
                  <Text style={styles.codi}>{codi}</Text>
                  <Text style={styles.porcsSala}>{ara} porcs</Text>
                </View>
                <Text style={styles.ajuda}>
                  {files.length} corralines · hi van entrar {entrats}
                </Text>
                <View style={styles.corrals}>
                  {files.map((f) => (
                    <View key={`${f.meitat}${f.corral}`} style={styles.corral}>
                      <Text style={styles.corralNom}>
                        {f.corral}
                        {f.meitat}
                      </Text>
                      <Text style={styles.corralPorcs}>{f.porcs_ara}</Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </View>
      </ScrollView>
    </>
  );
}

function Fila({
  etiqueta,
  valor,
  destacat,
}: {
  etiqueta: string;
  valor: string;
  destacat?: boolean;
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={[styles.valor, destacat && styles.valorDestacat]}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centrat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  titol: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  titolSeccio: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.discret,
    marginBottom: 4,
  },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  etiqueta: { color: colors.text },
  valor: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  valorDestacat: { fontSize: 18, color: colors.primari },
  ajuda: { fontSize: 13, color: colors.discret },
  blocSala: { paddingVertical: 8, gap: 6 },
  capcaleraSala: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  codi: { fontSize: 16, fontWeight: '700', color: colors.primari },
  porcsSala: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  corrals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  corral: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
  },
  corralNom: { fontSize: 12, color: colors.discret, fontWeight: '600' },
  corralPorcs: { fontSize: 16, fontWeight: '700', color: colors.text },
});
