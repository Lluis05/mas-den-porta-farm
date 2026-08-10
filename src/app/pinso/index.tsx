import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { tipusPinsoAmbEntregues, type TipusAmbEntregues } from '@/db/queries';
import {
  calculaPrevisio,
  dadesEndarrerides,
  urgencia,
  type Previsio,
  type Urgencia,
} from '@/lib/pinso';
import { colors, mides } from '@/theme';

/** Els que preocupen (resposta F4); la resta van després. */
const PRIORITARIS = ['GESTACIO', 'LACTACIO'];

type Fila = TipusAmbEntregues & { previsio: Previsio; estat: Urgencia };

const avui = () => new Date().toISOString().slice(0, 10);

const NOM_ESTAT: Record<Urgencia, string> = {
  esgotat: 'S’hauria d’haver acabat',
  aviat: 'S’acaba de seguida',
  atencio: 'Va justet',
  be: 'Hi ha marge',
  desconegut: 'Sense prou dades',
};

const COLOR_ESTAT: Record<Urgencia, string> = {
  esgotat: colors.perill,
  aviat: colors.perill,
  atencio: colors.avis,
  be: colors.ok,
  desconegut: colors.discret,
};

export default function Pinso() {
  const db = useSQLiteContext();
  const [files, setFiles] = useState<Fila[] | null>(null);
  const [endarrerit, setEndarrerit] = useState<number | null>(null);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const tipus = await tipusPinsoAmbEntregues(db);
        if (!viu) return;
        const dia = avui();
        const estat = dadesEndarrerides(
          tipus.map((t) => t.entregues),
          dia
        );
        setEndarrerit(estat?.endarrerit ? estat.dies : null);
        const calculades: Fila[] = tipus.map((t) => {
          const previsio = calculaPrevisio(t.entregues, dia);
          return { ...t, previsio, estat: urgencia(previsio) };
        });
        // Primer els que s'acaben abans; gestació i lactació guanyen empats.
        calculades.sort((a, b) => {
          const da = a.previsio.diesRestants ?? Number.POSITIVE_INFINITY;
          const dbb = b.previsio.diesRestants ?? Number.POSITIVE_INFINITY;
          if (da !== dbb) return da - dbb;
          const pa = PRIORITARIS.includes(a.codi) ? 0 : 1;
          const pb = PRIORITARIS.includes(b.codi) ? 0 : 1;
          return pa - pb;
        });
        setFiles(calculades);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Pinso' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        {endarrerit != null && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>Falten entregues per apuntar</Text>
            <Text style={styles.textAvis}>
              L&apos;última entrega apuntada és de fa {Math.round(endarrerit)} dies.
              Mentre no s&apos;apuntin les que han arribat, tot sortirà com si
              s&apos;hagués acabat.
            </Text>
          </View>
        )}

        <Link href="/pinso/nova" asChild>
          <Pressable style={styles.botoPrincipal} accessibilityRole="button">
            <Text style={styles.botoText}>Apuntar una entrega</Text>
          </Pressable>
        </Link>

        <View style={styles.targeta}>
          <Text style={styles.avis}>
            Això és una estimació. El consum real no es mesura enlloc: es calcula
            amb el ritme amb què han anat arribant les entregues.
          </Text>
        </View>

        {files == null && <Text style={styles.ajuda}>Carregant…</Text>}

        {files?.map((f) => (
          <View key={f.id} style={styles.targeta}>
            <View style={styles.capcalera}>
              <View style={styles.flex}>
                <Text style={styles.codi}>{f.codi}</Text>
                {f.descripcio && <Text style={styles.ajuda}>{f.descripcio}</Text>}
              </View>
              <View style={[styles.etiqueta, { borderColor: COLOR_ESTAT[f.estat] }]}>
                <Text style={[styles.etiquetaText, { color: COLOR_ESTAT[f.estat] }]}>
                  {NOM_ESTAT[f.estat]}
                </Text>
              </View>
            </View>

            {f.previsio.diesRestants != null ? (
              <>
                <Text style={[styles.dies, { color: COLOR_ESTAT[f.estat] }]}>
                  {f.previsio.diesRestants <= 0
                    ? `fa ${Math.abs(Math.round(f.previsio.diesRestants))} dies`
                    : `${Math.round(f.previsio.diesRestants)} dies`}
                </Text>
                <Text style={styles.ajuda}>
                  {f.previsio.diesRestants <= 0
                    ? 'Segons el ritme habitual ja hauria d’haver arribat una entrega.'
                    : `S’acabaria cap al ${f.previsio.dataEsgotament}.`}
                </Text>

                <Fila
                  etiqueta="Consum estimat"
                  valor={`${Math.round(f.previsio.kgPerDia ?? 0)} kg/dia`}
                />
                <Fila
                  etiqueta="Queden (estimat)"
                  valor={`${Math.max(0, Math.round(f.previsio.kgRestants ?? 0))} kg`}
                />
                <Fila
                  etiqueta="Última entrega"
                  valor={`${f.previsio.ultimaEntrega} · ${f.previsio.kgUltimaEntrega} kg`}
                />
                <Fila
                  etiqueta="Sol arribar cada"
                  valor={`${Math.round(f.previsio.intervalMitja ?? 0)} dies`}
                />
                {f.capacitat_sitja_kg != null && (
                  <Fila
                    etiqueta="Sitja"
                    valor={`${f.capacitat_sitja_kg} kg`}
                  />
                )}
                <Text style={styles.peu}>
                  Calculat amb {f.previsio.entreguesUsades} entregues.
                </Text>
              </>
            ) : (
              <Text style={styles.ajuda}>
                {f.previsio.ultimaEntrega
                  ? `Només hi ha una entrega apuntada (${f.previsio.ultimaEntrega}). Amb dues o més ja es pot calcular el ritme.`
                  : 'Encara no hi ha cap entrega apuntada d’aquest tipus.'}
              </Text>
            )}
          </View>
        ))}
      </ScrollView>
    </>
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
  capcalera: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  codi: { fontSize: 18, fontWeight: '700', color: colors.text },
  etiqueta: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  etiquetaText: { fontSize: 12, fontWeight: '600' },
  dies: { fontSize: 32, fontWeight: '700', marginTop: 4 },
  ajuda: { fontSize: 13, color: colors.discret },
  avis: { fontSize: 13, color: colors.discret, lineHeight: 18 },
  peu: { fontSize: 11, color: colors.discret, marginTop: 6 },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  filaEtiqueta: { color: colors.text, fontSize: 14 },
  filaValor: { fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: 14 },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  titolAvis: { fontSize: 16, fontWeight: '700', color: colors.avis },
  textAvis: { color: colors.avis, fontSize: 14, lineHeight: 19 },
  botoPrincipal: {
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
