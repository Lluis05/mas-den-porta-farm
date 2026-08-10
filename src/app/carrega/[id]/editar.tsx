import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  actualitzaCarrega,
  carregaPerEditar,
  corralsPerEditarCarrega,
  type CarregaEditable,
  type CorralEditableCarrega,
} from '@/db/queries';
import { codiSala, reparteixProporcional } from '@/lib/corrals';
import { colors, mides } from '@/theme';

function aNumero(text: string): number | null {
  const net = text.replace(',', '.').trim();
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

function aIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function mostraData(d: Date): string {
  return d.toLocaleDateString('ca-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function EditarCarrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [original, setOriginal] = useState<CarregaEditable | null>(null);
  const [corrals, setCorrals] = useState<CorralEditableCarrega[]>([]);

  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [sortides, setSortides] = useState<Record<number, string>>({});
  const [unitats, setUnitats] = useState('');
  const [kg, setKg] = useState('');
  const [kgCanal, setKgCanal] = useState('');
  const [totalFactura, setTotalFactura] = useState('');
  const [preuKg, setPreuKg] = useState('');
  const [preuRef, setPreuRef] = useState('');
  const [d4, setD4] = useState('');
  const [d5, setD5] = useState('');
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [c, co] = await Promise.all([
        carregaPerEditar(db, id),
        corralsPerEditarCarrega(db, id),
      ]);
      if (!viu || !c) return;
      setOriginal(c);
      setCorrals(co);
      setData(new Date(`${c.data_carrega}T12:00:00`));
      setUnitats(text(c.factura.unitats));
      setKg(text(c.factura.kg));
      setKgCanal(text(c.factura.kgCanal));
      setTotalFactura(text(c.factura.totalFactura));
      setPreuKg(text(c.factura.preuKg));
      setPreuRef(text(c.factura.preuReferencia));
      setD4(text(c.decomisos.find((d) => d.codi === 'D4')?.num_porcs));
      setD5(text(c.decomisos.find((d) => d.codi === 'D5')?.num_porcs));

      const perSala: Record<number, number> = {};
      for (const l of co) perSala[l.sala] = (perSala[l.sala] ?? 0) + l.num_porcs;
      setSortides(
        Object.fromEntries(Object.entries(perSala).map(([s, n]) => [s, String(n)]))
      );
    })();
    return () => {
      viu = false;
    };
  }, [db, id]);

  const perSala = useMemo(() => {
    const mapa = new Map<number, CorralEditableCarrega[]>();
    for (const c of corrals) {
      const llista = mapa.get(c.sala);
      if (llista) llista.push(c);
      else mapa.set(c.sala, [c]);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [corrals]);

  const repartiment = useMemo(() => {
    const resultat = new Map<string, number>();
    for (const [sala, seus] of perSala) {
      const demanats = parseInt(sortides[sala] ?? '', 10) || 0;
      const trossos = reparteixProporcional(
        demanats,
        seus.map((c) => c.disponible)
      );
      seus.forEach((c, i) => resultat.set(c.corral_id, trossos[i]));
    }
    return resultat;
  }, [perSala, sortides]);

  const totalSurten = [...repartiment.values()].reduce((s, n) => s + n, 0);
  const esEngreix = original?.tipus === 'porcs_engreix';
  const unitatsNum = aNumero(unitats);
  const discrepancia =
    unitatsNum != null && esEngreix && totalSurten > 0 && unitatsNum !== totalSurten;

  async function desa() {
    if (!original) return;
    setDesant(true);
    setError(null);
    try {
      await actualitzaCarrega(db, id, {
        dataCarrega: aIso(data),
        tipus: original.tipus,
        linies: [...repartiment.entries()].map(([corralId, numPorcs]) => ({
          corralId,
          numPorcs,
        })),
        factura: {
          unitats: unitatsNum,
          kg: aNumero(kg),
          kgCanal: aNumero(kgCanal),
          totalFactura: aNumero(totalFactura),
          preuKg: aNumero(preuKg),
          preuReferencia: aNumero(preuRef),
        },
        decomisos: [
          { codi: 'D4', numPorcs: parseInt(d4, 10) || 0 },
          { codi: 'D5', numPorcs: parseInt(d5, 10) || 0 },
        ],
      });
      router.replace(`/carrega/${id}`);
    } catch (e) {
      setDesant(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!original) {
    return (
      <View style={styles.centrat}>
        <Stack.Screen options={{ title: 'Editar' }} />
        <Text style={styles.ajuda}>Carregant…</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Editar la càrrega' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Data de càrrega</Text>
          <Pressable onPress={() => setMostrarCalendari(true)} style={styles.camp}>
            <Text style={styles.campText}>{mostraData(data)}</Text>
          </Pressable>
          {mostrarCalendari && (
            <DateTimePicker
              value={data}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              onChange={(_, triada) => {
                if (Platform.OS !== 'ios') setMostrarCalendari(false);
                if (triada) setData(triada);
              }}
            />
          )}
          {Platform.OS === 'ios' && mostrarCalendari && (
            <Pressable onPress={() => setMostrarCalendari(false)}>
              <Text style={styles.enllac}>Fet</Text>
            </Pressable>
          )}
        </View>

        {perSala.map(([sala, seus]) => {
          const disponibles = seus.reduce((s, c) => s + c.disponible, 0);
          const codi = codiSala(
            sala,
            seus.map((c) => ({ meitat: c.meitat, numero: c.corral }))
          );
          const surten = seus.reduce(
            (s, c) => s + (repartiment.get(c.corral_id) ?? 0),
            0
          );
          return (
            <View key={sala} style={styles.targeta}>
              <View style={styles.capcalera}>
                <Text style={styles.titolSala}>Sala {sala}</Text>
                <Text style={styles.codi}>{codi}</Text>
              </View>
              <View style={styles.filaCamp}>
                <Text style={styles.etiqueta}>Porcs que surten</Text>
                <TextInput
                  value={sortides[sala] ?? ''}
                  onChangeText={(t) =>
                    setSortides((s) => ({ ...s, [sala]: t.replace(/[^0-9]/g, '') }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.discret}
                  style={styles.input}
                  accessibilityLabel={`Porcs que surten de la sala ${sala}`}
                />
              </View>
              <Text style={styles.ajuda}>Com a màxim {disponibles}</Text>
              {surten > 0 && (
                <View style={styles.corrals}>
                  {seus.map((c) => {
                    const n = repartiment.get(c.corral_id) ?? 0;
                    return (
                      <View
                        key={c.corral_id}
                        style={[styles.corral, n === 0 && styles.corralBuit]}
                      >
                        <Text style={styles.corralNom}>
                          {c.corral}
                          {c.meitat}
                        </Text>
                        <Text style={styles.corralPorcs}>
                          {n}
                          <Text style={styles.corralDe}>/{c.disponible}</Text>
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          );
        })}

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Dades de la factura</Text>
          <Camp etiqueta="Unitats" valor={unitats} onChange={setUnitats} />
          <Camp etiqueta="Kg vius" valor={kg} onChange={setKg} />
          <Camp etiqueta="Kg canal" valor={kgCanal} onChange={setKgCanal} />
          <Camp
            etiqueta="Total factura (€)"
            valor={totalFactura}
            onChange={setTotalFactura}
          />
          <Camp etiqueta="Preu per kg (€)" valor={preuKg} onChange={setPreuKg} />
          <Camp
            etiqueta={esEngreix ? 'Preu Mercolleida (€)' : 'Preu Lleida (€)'}
            valor={preuRef}
            onChange={setPreuRef}
          />
          <Text style={styles.titolSeccio}>Decomisos</Text>
          <Camp etiqueta="D4 · rebutjats a l’escorxador" valor={d4} onChange={setD4} />
          <Camp etiqueta="D5 · morts al transport" valor={d5} onChange={setD5} />
        </View>

        {discrepancia && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>Els números no quadren</Text>
            <Text style={styles.textAvis}>
              De les sales surten {totalSurten} porcs, però la factura en diu{' '}
              {unitatsNum}. Es desa igualment.
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={desa}
          disabled={desant}
          accessibilityRole="button"
          style={[styles.botoPrincipal, desant && styles.botoApagat]}
        >
          <Text style={styles.botoText}>
            {desant ? 'Desant…' : 'Desar els canvis'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Camp({
  etiqueta,
  valor,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  onChange: (t: string) => void;
}) {
  return (
    <View style={styles.filaCamp}>
      <Text style={styles.etiquetaCamp}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder="—"
        placeholderTextColor={colors.discret}
        style={styles.input}
        accessibilityLabel={etiqueta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
  centrat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  titolAvis: { fontSize: 15, fontWeight: '600', color: colors.avis },
  textAvis: { color: colors.avis },
  textError: { color: colors.perill },
  ajuda: { fontSize: 13, color: colors.discret },
  capcalera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titolSala: { fontSize: 18, fontWeight: '700', color: colors.text },
  codi: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.primari,
    fontSize: 14,
  },
  camp: {
    height: mides.toc,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
  },
  campText: { fontSize: 16, color: colors.text },
  enllac: { color: colors.primari, fontWeight: '600', paddingTop: 8 },
  filaCamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
  etiqueta: { fontSize: 15, color: colors.text },
  etiquetaCamp: { fontSize: 14, color: colors.text, flex: 1 },
  input: {
    minWidth: 100,
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'right',
    color: colors.text,
  },
  corrals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  corral: {
    minWidth: 56,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
  },
  corralBuit: { backgroundColor: colors.fons },
  corralNom: { fontSize: 12, color: colors.discret, fontWeight: '600' },
  corralPorcs: { fontSize: 16, fontWeight: '700', color: colors.text },
  corralDe: { fontSize: 12, fontWeight: '400', color: colors.discret },
  botoPrincipal: {
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoApagat: { backgroundColor: colors.discret },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
