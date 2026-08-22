import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  censTrugesActual,
  llistaCicles,
  porcsALaGranja,
  resumTrimestral,
  tipusPinsoAmbEntregues,
  type CensTrugesActual,
  type CicleLlista,
  type ResumTrimestre,
} from '@/db/queries';
import { calculaPrevisio, dadesEndarrerides, urgencia } from '@/lib/pinso';
import { colors, mides } from '@/theme';

type AvisPinso = { codi: string; dies: number; urgent: boolean };

const n = (v: number | null | undefined) => (v == null ? '—' : String(v));
const kg = (v: number | null | undefined) => (v == null ? '—' : `${Math.round(v).toLocaleString('ca-ES')} kg`);
const eur = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)} €`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`);

export default function Panell() {
  const db = useSQLiteContext();
  const [porcs, setPorcs] = useState<number | null>(null);
  const [cicles, setCicles] = useState<CicleLlista[]>([]);
  const [cens, setCens] = useState<CensTrugesActual | null>(null);
  const [avisosPinso, setAvisosPinso] = useState<AvisPinso[]>([]);
  const [pinsoEndarrerit, setPinsoEndarrerit] = useState(false);
  const [trimestre, setTrimestre] = useState<ResumTrimestre | null>(null);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const [total, llistaCiclesRes, censRes, pinso, trimestres] = await Promise.all([
          porcsALaGranja(db),
          llistaCicles(db),
          censTrugesActual(db),
          tipusPinsoAmbEntregues(db),
          resumTrimestral(db),
        ]);
        if (!viu) return;
        setPorcs(total);
        setCicles(llistaCiclesRes);
        setCens(censRes);
        setTrimestre(trimestres[0] ?? null);

        const dia = new Date().toISOString().slice(0, 10);
        const estatPinso = dadesEndarrerides(
          pinso.map((t) => t.entregues),
          dia
        );
        setPinsoEndarrerit(estatPinso?.endarrerit ?? false);
        setAvisosPinso(
          pinso
            .map((t) => ({ codi: t.codi, p: calculaPrevisio(t.entregues, dia) }))
            .filter((x) => ['esgotat', 'aviat'].includes(urgencia(x.p)))
            .map((x) => ({
              codi: x.codi,
              dies: Math.round(x.p.diesRestants ?? 0),
              urgent: (x.p.diesRestants ?? 0) <= 0,
            }))
            .sort((a, b) => a.dies - b.dies)
        );
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  const ciclesActius = cicles.filter((c) => c.queden > 0);

  return (
    <>
      <Stack.Screen options={{ title: 'Panell' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.filaTargetes}>
          <View style={[styles.targeta, styles.targetaGran]}>
            <Text style={styles.titolSeccio}>Porcs a la granja</Text>
            <Text style={styles.granTotal}>{n(porcs)}</Text>
          </View>
          <View style={[styles.targeta, styles.targetaGran]}>
            <Text style={styles.titolSeccio}>Truges ara mateix</Text>
            {cens == null ? (
              <Text style={styles.ajuda}>Cap recompte encara.</Text>
            ) : (
              <>
                <Text style={styles.granTotal}>{cens.total}</Text>
                <Text style={styles.ajuda}>Recompte de {cens.data_recompte}: {cens.recompte}</Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Cicles d&apos;engreix actius</Text>
          <Text style={styles.granTotal}>{ciclesActius.length}</Text>
          <Text style={styles.ajuda}>
            {ciclesActius.reduce((s, c) => s + c.queden, 0)} porcs repartits en
            {' '}
            {ciclesActius.reduce((s, c) => s + c.num_corrals, 0)} corralines
          </Text>
        </View>

        {(avisosPinso.length > 0 || pinsoEndarrerit) && (
          <Link href="/pinso" asChild>
            <Pressable style={styles.targetaAvisPressable} accessibilityRole="button">
              <Text style={styles.titolAvis}>Pinso</Text>
              {pinsoEndarrerit && (
                <Text style={styles.textAvis}>
                  Fa setmanes que no s&apos;apunta cap entrega, la previsió no és de fiar.
                </Text>
              )}
              {avisosPinso.map((a) => (
                <Text key={a.codi} style={styles.textAvis}>
                  · {a.codi}: {a.urgent ? 'esgotat' : `s'acaba en ${a.dies} dies`}
                </Text>
              ))}
            </Pressable>
          </Link>
        )}

        {trimestre && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>
              Últim trimestre amb dades ({trimestre.any} · {trimestre.trimestre}T)
            </Text>
            {trimestre.porcs && (
              <FilaResum
                etiqueta="Porcs engreix"
                valor={`${kg(trimestre.porcs.kg)} · ${pct(trimestre.porcs.rendiment)} rendiment · ${eur(trimestre.porcs.preuKg)}/kg`}
              />
            )}
            {trimestre.truges && (
              <FilaResum
                etiqueta="Truges rebuig"
                valor={`${kg(trimestre.truges.kg)} · ${eur(trimestre.truges.preuKg)}/kg`}
              />
            )}
            {trimestre.llavores && (
              <FilaResum
                etiqueta="Llavores"
                valor={`${kg(trimestre.llavores.kg)} · ${eur(trimestre.llavores.preuKg)}/kg`}
              />
            )}
            <Link href="/resum" asChild>
              <Pressable accessibilityRole="button">
                <Text style={styles.enllac}>Veure el resum trimestral sencer ›</Text>
              </Pressable>
            </Link>
          </View>
        )}

        <Link href="/taules" asChild>
          <Pressable style={styles.botoPrincipal} accessibilityRole="button">
            <Text style={styles.botoText}>Veure totes les dades en detall</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </>
  );
}

function FilaResum({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <View style={styles.filaResum}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <Text style={styles.filaValor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  filaTargetes: { flexDirection: 'row', gap: mides.espai },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaGran: { flex: 1 },
  targetaAvisPressable: {
    backgroundColor: colors.avisFluix,
    borderColor: colors.avis,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titolAvis: { fontSize: 15, fontWeight: '600', color: colors.avis },
  textAvis: { color: colors.avis, fontSize: 13 },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  granTotal: { fontSize: 32, fontWeight: '700', color: colors.text },
  ajuda: { fontSize: 12, color: colors.discret },
  filaResum: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  filaEtiqueta: { color: colors.text, fontSize: 14 },
  filaValor: { fontWeight: '600', fontSize: 13, color: colors.text },
  enllac: { color: colors.primari, fontWeight: '600', paddingTop: 8 },
  botoPrincipal: {
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
