import { Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { type ColumnaTaula, TaulaDades } from '@/components/taula-dades';
import {
  llistaBaixesTruja,
  llistaRecomptesTruges,
  taulaCarregues,
  taulaCicles,
  taulaDeslletaments,
  taulaLlavors,
  taulaPinso,
  type BaixaTruja,
  type CicleResum,
  type FilaCarregaTaula,
  type FilaDeslletamentTaula,
  type FilaLlavorsTaula,
  type FilaPinsoTaula,
  type RecompteTruges,
} from '@/db/queries';
import { colors, mides } from '@/theme';

const n = (v: number | null | undefined) => (v == null ? '—' : String(v));
const kg = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(0)} kg`);
const eur = (v: number | null | undefined) => (v == null ? '—' : `${v.toFixed(2)} €`);
const pct = (v: number | null | undefined) => (v == null ? '—' : `${(v * 100).toFixed(1)} %`);
const dec = (v: number | null | undefined) => (v == null ? '—' : v.toFixed(1));

type Full =
  | 'deslletaments'
  | 'cicles'
  | 'carregues'
  | 'pinso'
  | 'llavors'
  | 'cens';

const FULLS: { id: Full; nom: string }[] = [
  { id: 'deslletaments', nom: 'Deslletaments' },
  { id: 'cicles', nom: 'Cicles' },
  { id: 'carregues', nom: 'Càrregues' },
  { id: 'pinso', nom: 'Pinso' },
  { id: 'llavors', nom: 'Llavores' },
  { id: 'cens', nom: 'Cens de truges' },
];

const columnesDeslletaments: ColumnaTaula<FilaDeslletamentTaula>[] = [
  { key: 'banda', etiqueta: 'Banda', amplada: 60, formata: (f) => String(f.banda) },
  { key: 'data_desmamat', etiqueta: 'Deslletament', amplada: 100, formata: (f) => f.data_desmamat },
  { key: 'truges_criades', etiqueta: 'Truges criades', numerica: true, formata: (f) => n(f.truges_criades) },
  { key: 'truges_desmamades', etiqueta: 'Truges desmamades', numerica: true, formata: (f) => n(f.truges_desmamades) },
  { key: 'porcs_vius_1a_setmana', etiqueta: 'Vius 1a setmana', numerica: true, formata: (f) => n(f.porcs_vius_1a_setmana) },
  { key: 'porcs_desmamats', etiqueta: 'Desmamats', numerica: true, formata: (f) => n(f.porcs_desmamats) },
  { key: 'pct_baixes_parideres', etiqueta: '% baixes parideres', numerica: true, formata: (f) => pct(f.pct_baixes_parideres) },
  { key: 'mitjana_porcs_truja', etiqueta: 'Mitjana porcs/truja', numerica: true, formata: (f) => dec(f.mitjana_porcs_truja) },
  { key: 'data_inseminacio', etiqueta: 'Inseminació', amplada: 100, formata: (f) => f.data_inseminacio ?? '—' },
  { key: 'insem_total', etiqueta: 'Total inseminades', numerica: true, formata: (f) => n(f.insem_total) },
  { key: 'repetidores', etiqueta: 'Repetidores', numerica: true, formata: (f) => n(f.repetidores) },
  { key: 'primales', etiqueta: 'Primales', numerica: true, formata: (f) => n(f.primales) },
  { key: 'plenes', etiqueta: 'Plenes', numerica: true, formata: (f) => n(f.plenes) },
  { key: 'pct_plenes', etiqueta: '% plenes', numerica: true, formata: (f) => pct(f.pct_plenes) },
  { key: 'porcs_engreix', etiqueta: 'Porcs engreix', numerica: true, formata: (f) => n(f.porcs_engreix) },
  { key: 'pct_baixes_destete', etiqueta: '% baixes destete', numerica: true, formata: (f) => pct(f.pct_baixes_destete) },
  {
    key: 'porcs_sales',
    etiqueta: 'Porcs sales',
    amplada: 140,
    formata: (f) => f.porcs_sales ?? '—',
    enllac: (f) => (f.cicle_id ? `/cicle/${f.cicle_id}` : null),
  },
  { key: 'data_entrada_engreix', etiqueta: 'Data entrada', amplada: 100, formata: (f) => f.data_entrada_engreix ?? '—' },
  { key: 'data_primera_venda', etiqueta: 'Data primera venda', amplada: 130, formata: (f) => f.data_primera_venda ?? '—' },
  { key: 'edat_primera_venda', etiqueta: 'Edat 1a venda (set.)', numerica: true, formata: (f) => dec(f.edat_primera_venda) },
  { key: 'data_ultima_sortida', etiqueta: 'Data buidat última sala', amplada: 150, formata: (f) => f.data_ultima_sortida ?? '—' },
  { key: 'edat_ultima_venda', etiqueta: 'Edat última venda (set.)', numerica: true, formata: (f) => dec(f.edat_ultima_venda) },
  { key: 'posicions_inseminar', etiqueta: 'Posició inseminar', amplada: 130, formata: (f) => f.posicions_inseminar ?? '—' },
  { key: 'posicions_gestacio', etiqueta: 'Posició gestació', amplada: 150, formata: (f) => f.posicions_gestacio ?? '—' },
  { key: 'observacions', etiqueta: 'Observacions', amplada: 180, formata: (f) => f.observacions ?? '—' },
];

const columnesCicles: ColumnaTaula<CicleResum>[] = [
  { key: 'banda', etiqueta: 'Banda', amplada: 60, formata: (f) => String(f.banda) },
  { key: 'data_entrada', etiqueta: 'Entrada', amplada: 100, formata: (f) => f.data_entrada },
  { key: 'porcs_entrada', etiqueta: 'Porcs entrada', numerica: true, formata: (f) => n(f.porcs_entrada) },
  { key: 'porcs_sortida', etiqueta: 'Porcs sortida', numerica: true, formata: (f) => n(f.porcs_sortida) },
  { key: 'porcs_sobrants', etiqueta: 'Sobrants', numerica: true, formata: (f) => n(f.porcs_sobrants) },
  { key: 'baixes', etiqueta: 'Baixes', numerica: true, formata: (f) => n(f.baixes) },
  { key: 'pct_baixes', etiqueta: '% baixes', numerica: true, formata: (f) => pct(f.pct_baixes) },
  { key: 'data_primera_venda', etiqueta: '1a venda', amplada: 100, formata: (f) => f.data_primera_venda ?? '—' },
  { key: 'data_ultima_sortida', etiqueta: 'Última sortida', amplada: 110, formata: (f) => f.data_ultima_sortida ?? '—' },
  { key: 'edat_primera_venda', etiqueta: 'Edat 1a venda', numerica: true, formata: (f) => dec(f.edat_primera_venda) },
  { key: 'edat_ultima_venda', etiqueta: 'Edat última venda', numerica: true, formata: (f) => dec(f.edat_ultima_venda) },
];

const columnesCarregues: ColumnaTaula<FilaCarregaTaula>[] = [
  { key: 'data_carrega', etiqueta: 'Data', amplada: 100, formata: (f) => f.data_carrega },
  { key: 'tipus', etiqueta: 'Tipus', amplada: 110, formata: (f) => (f.tipus === 'porcs_engreix' ? 'Porcs engreix' : 'Truges rebuig') },
  { key: 'unitats', etiqueta: 'Unitats', numerica: true, formata: (f) => n(f.unitats) },
  { key: 'kg', etiqueta: 'Kg', numerica: true, formata: (f) => kg(f.kg) },
  { key: 'kg_canal', etiqueta: 'Kg canal', numerica: true, formata: (f) => kg(f.kg_canal) },
  { key: 'promig_kg', etiqueta: 'Promig kg', numerica: true, formata: (f) => dec(f.promig_kg) },
  { key: 'rendiment', etiqueta: 'Rendiment', numerica: true, formata: (f) => pct(f.rendiment) },
  { key: 'total_factura', etiqueta: 'Total factura', numerica: true, formata: (f) => eur(f.total_factura) },
  { key: 'preu_kg', etiqueta: 'Preu/kg', numerica: true, formata: (f) => eur(f.preu_kg) },
  { key: 'preu_referencia', etiqueta: 'Preu referència', numerica: true, formata: (f) => eur(f.preu_referencia) },
  { key: 'diferencia', etiqueta: 'Diferència', numerica: true, formata: (f) => eur(f.diferencia) },
];

const columnesPinso: ColumnaTaula<FilaPinsoTaula>[] = [
  { key: 'data', etiqueta: 'Data', amplada: 100, formata: (f) => f.data },
  { key: 'tipus_pinso', etiqueta: 'Tipus', amplada: 90, formata: (f) => f.tipus_pinso },
  { key: 'kg', etiqueta: 'Kg', numerica: true, formata: (f) => kg(f.kg) },
  { key: 'albara', etiqueta: 'Albarà', amplada: 100, formata: (f) => f.albara ?? '—' },
  { key: 'medicat', etiqueta: 'Medicat', amplada: 80, formata: (f) => (f.medicat ? 'Sí' : 'No') },
  { key: 'prescripcio', etiqueta: 'Prescripció', amplada: 160, formata: (f) => f.prescripcio ?? '—' },
];

const columnesLlavors: ColumnaTaula<FilaLlavorsTaula>[] = [
  { key: 'data', etiqueta: 'Data', amplada: 100, formata: (f) => f.data },
  { key: 'unitats', etiqueta: 'Unitats', numerica: true, formata: (f) => n(f.unitats) },
  { key: 'kg', etiqueta: 'Kg', numerica: true, formata: (f) => kg(f.kg) },
  { key: 'promig_kg', etiqueta: 'Promig kg', numerica: true, formata: (f) => dec(f.promig_kg) },
  { key: 'total_factura', etiqueta: 'Total factura', numerica: true, formata: (f) => eur(f.total_factura) },
  { key: 'preu_kg', etiqueta: 'Preu/kg', numerica: true, formata: (f) => eur(f.preu_kg) },
];

const columnesRecomptes: ColumnaTaula<RecompteTruges>[] = [
  { key: 'data', etiqueta: 'Data', amplada: 100, formata: (f) => f.data },
  { key: 'num_truges', etiqueta: 'Truges comptades', numerica: true, formata: (f) => n(f.num_truges) },
];

const columnesBaixesTruja: ColumnaTaula<BaixaTruja>[] = [
  { key: 'data', etiqueta: 'Data', amplada: 100, formata: (f) => f.data },
  { key: 'num_truges', etiqueta: 'Truges', numerica: true, formata: (f) => n(f.num_truges) },
  { key: 'motiu', etiqueta: 'Motiu', amplada: 180, formata: (f) => f.motiu ?? '—' },
];

export default function Taules() {
  const db = useSQLiteContext();
  const [full, setFull] = useState<Full>('deslletaments');

  const [deslletaments, setDeslletaments] = useState<FilaDeslletamentTaula[]>([]);
  const [cicles, setCicles] = useState<CicleResum[]>([]);
  const [carregues, setCarregues] = useState<FilaCarregaTaula[]>([]);
  const [pinso, setPinso] = useState<FilaPinsoTaula[]>([]);
  const [llavors, setLlavors] = useState<FilaLlavorsTaula[]>([]);
  const [recomptes, setRecomptes] = useState<RecompteTruges[]>([]);
  const [baixesTruja, setBaixesTruja] = useState<BaixaTruja[]>([]);

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const [d, c, ca, p, ll, r, bt] = await Promise.all([
          taulaDeslletaments(db),
          taulaCicles(db),
          taulaCarregues(db),
          taulaPinso(db),
          taulaLlavors(db),
          llistaRecomptesTruges(db),
          llistaBaixesTruja(db),
        ]);
        if (!viu) return;
        setDeslletaments(d);
        setCicles(c);
        setCarregues(ca);
        setPinso(p);
        setLlavors(ll);
        setRecomptes(r);
        setBaixesTruja(bt);
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  const nFiles = useMemo(() => {
    switch (full) {
      case 'deslletaments':
        return deslletaments.length;
      case 'cicles':
        return cicles.length;
      case 'carregues':
        return carregues.length;
      case 'pinso':
        return pinso.length;
      case 'llavors':
        return llavors.length;
      case 'cens':
        return recomptes.length + baixesTruja.length;
    }
  }, [full, deslletaments, cicles, carregues, pinso, llavors, recomptes, baixesTruja]);

  return (
    <>
      <Stack.Screen options={{ title: 'Totes les dades' }} />
      <View style={styles.pagina}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pestanyes}>
          <View style={styles.filaPestanyes}>
            {FULLS.map((f) => (
              <Pressable
                key={f.id}
                onPress={() => setFull(f.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: full === f.id }}
                style={[styles.pestanya, full === f.id && styles.pestanyaActiva]}
              >
                <Text style={[styles.pestanyaText, full === f.id && styles.pestanyaTextActiu]}>
                  {f.nom}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.compte}>{nFiles} fila{nFiles === 1 ? '' : 's'}</Text>
        <ScrollView style={styles.cos} contentContainerStyle={styles.cosContingut}>
          {full === 'deslletaments' && (
            <TaulaDades columnes={columnesDeslletaments} files={deslletaments} />
          )}
          {full === 'cicles' && <TaulaDades columnes={columnesCicles} files={cicles} />}
          {full === 'carregues' && <TaulaDades columnes={columnesCarregues} files={carregues} />}
          {full === 'pinso' && <TaulaDades columnes={columnesPinso} files={pinso} />}
          {full === 'llavors' && <TaulaDades columnes={columnesLlavors} files={llavors} />}
          {full === 'cens' && (
            <View style={{ gap: mides.espai }}>
              <Text style={styles.titolSubtaula}>Recomptes manuals</Text>
              <TaulaDades columnes={columnesRecomptes} files={recomptes} />
              <Text style={styles.titolSubtaula}>Baixes de truges</Text>
              <TaulaDades columnes={columnesBaixesTruja} files={baixesTruja} />
            </View>
          )}
        </ScrollView>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  pagina: { flex: 1, backgroundColor: colors.fons },
  pestanyes: { flexGrow: 0, backgroundColor: colors.targeta },
  filaPestanyes: { flexDirection: 'row', padding: mides.espai, gap: 8 },
  pestanya: {
    paddingHorizontal: 14,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pestanyaActiva: { backgroundColor: colors.primari, borderColor: colors.primari },
  pestanyaText: { fontSize: 14, fontWeight: '600', color: colors.text },
  pestanyaTextActiu: { color: '#fff' },
  compte: {
    fontSize: 12,
    color: colors.discret,
    paddingHorizontal: mides.espai,
    paddingTop: 8,
  },
  cos: { flex: 1 },
  cosContingut: { padding: mides.espai, paddingBottom: 40 },
  titolSubtaula: { fontSize: 14, fontWeight: '700', color: colors.text },
});
