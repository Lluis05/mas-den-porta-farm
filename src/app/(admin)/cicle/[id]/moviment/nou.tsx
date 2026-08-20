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
  corralsAmbPorcsDelCicle,
  corralsPerMoviment,
  creaMoviments,
  type CorralAmbPorcs,
  type CorralPerMoviment,
} from '@/db/queries';
import { aparellaTrasllats, reparteix, reparteixProporcional } from '@/lib/corrals';
import { SalaColapsable } from '@/components/sala-colapsable';
import { colors, mides } from '@/theme';

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

function agrupaPerSala<T extends { sala: number }>(files: T[]): [number, T[]][] {
  const mapa = new Map<number, T[]>();
  for (const f of files) {
    const llista = mapa.get(f.sala);
    if (llista) llista.push(f);
    else mapa.set(f.sala, [f]);
  }
  return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
}

function toggleSet<T>(set: Set<T>, valor: T): Set<T> {
  const nou = new Set(set);
  if (nou.has(valor)) nou.delete(valor);
  else nou.add(valor);
  return nou;
}

/**
 * Apuntar un trasllat de porcs d'aquest cicle a un o més corrals: un
 * moviment intern (a mesura que creixen) o a una sala que no s'havia
 * apuntat al cicle en un principi.
 *
 * Es pot triar més d'un corral d'origen i més d'un de destí; el mateix total
 * de porcs es reparteix entre els origens triats (proporcional al que hi ha
 * a cada un, com les sortides) i entre els destins triats (a parts iguals).
 * `aparellaTrasllats()` ho converteix en les parelles concretes que calen
 * per desar-ho, ja que `moviment` és sempre d'UN corral a UN altre.
 */
export default function NouMoviment() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [origens, setOrigens] = useState<CorralAmbPorcs[]>([]);
  const [destins, setDestins] = useState<CorralPerMoviment[]>([]);
  const [origenIds, setOrigenIds] = useState<Set<string>>(new Set());
  const [destiIds, setDestiIds] = useState<Set<string>>(new Set());
  const [salesOrigenObertes, setSalesOrigenObertes] = useState<Set<number>>(new Set());
  const [salesDestiObertes, setSalesDestiObertes] = useState<Set<number>>(new Set());
  const [numPorcs, setNumPorcs] = useState('');
  const [motiu, setMotiu] = useState('');
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [o, d] = await Promise.all([
        corralsAmbPorcsDelCicle(db, id),
        corralsPerMoviment(db),
      ]);
      if (!viu) return;
      setOrigens(o);
      setDestins(d);
    })();
    return () => {
      viu = false;
    };
  }, [db, id]);

  const origenPerSala = useMemo(() => agrupaPerSala(origens), [origens]);
  const destiPerSala = useMemo(
    // No té sentit moure un corral cap a ell mateix.
    () => agrupaPerSala(destins.filter((c) => !origenIds.has(c.corral_id))),
    [destins, origenIds]
  );

  const n = parseInt(numPorcs, 10) || 0;

  const origensTriats = origens.filter((c) => origenIds.has(c.corral_id));
  const destinsTriats = destins.filter((c) => destiIds.has(c.corral_id));

  const sortidesPerOrigen = useMemo(
    () => reparteixProporcional(n, origensTriats.map((c) => c.porcs)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, origenIds, origens]
  );
  const entradesPerDesti = useMemo(
    () => reparteix(n, destinsTriats.length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [n, destiIds]
  );

  const totalOrigen = sortidesPerOrigen.reduce((s, v) => s + v, 0);
  const potDesar = origenIds.size > 0 && destiIds.size > 0 && totalOrigen > 0 && !desant;

  async function desa() {
    setDesant(true);
    setError(null);
    try {
      const parells = aparellaTrasllats(
        origensTriats.map((c, i) => ({ corralId: c.corral_id, num: sortidesPerOrigen[i] })),
        destinsTriats.map((c, i) => ({ corralId: c.corral_id, num: entradesPerDesti[i] }))
      );
      await creaMoviments(db, {
        data: aIso(data),
        parells,
        motiu: motiu.trim() || null,
      });
      router.back();
    } catch (e) {
      setDesant(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Apuntar un moviment' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Dia</Text>
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

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>D&apos;on surten (d&apos;aquest cicle)</Text>
          {origens.length === 0 && (
            <Text style={styles.ajuda}>Aquest cicle ara mateix no té porcs enlloc.</Text>
          )}
          {origenPerSala.map(([sala, seus]) => {
            const triatsAqui = seus.filter((c) => origenIds.has(c.corral_id));
            return (
              <SalaColapsable
                key={sala}
                sala={sala}
                resum={
                  triatsAqui.length > 0
                    ? `${triatsAqui.length} corralines triades`
                    : `${seus.reduce((s, c) => s + c.porcs, 0)} porcs`
                }
                oberta={salesOrigenObertes.has(sala)}
                onToggle={() => setSalesOrigenObertes((s) => toggleSet(s, sala))}
              >
                <View style={styles.corrals}>
                  {seus.map((c) => {
                    const triat = origenIds.has(c.corral_id);
                    return (
                      <Pressable
                        key={c.corral_id}
                        onPress={() => setOrigenIds((s) => toggleSet(s, c.corral_id))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: triat }}
                        style={triat ? styles.corralTriat : styles.corral}
                      >
                        <Text style={styles.corralNom}>
                          {c.corral}
                          {c.meitat}
                        </Text>
                        <Text style={styles.corralPorcs}>{c.porcs}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SalaColapsable>
            );
          })}
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>On entren</Text>
          {destiPerSala.map(([sala, seus]) => {
            const triatsAqui = seus.filter((c) => destiIds.has(c.corral_id));
            return (
              <SalaColapsable
                key={sala}
                sala={sala}
                resum={
                  triatsAqui.length > 0
                    ? `${triatsAqui.length} corralines triades`
                    : `${seus.reduce((s, c) => s + c.porcs, 0)} porcs ara`
                }
                oberta={salesDestiObertes.has(sala)}
                onToggle={() => setSalesDestiObertes((s) => toggleSet(s, sala))}
              >
                <View style={styles.corrals}>
                  {seus.map((c) => {
                    const triat = destiIds.has(c.corral_id);
                    return (
                      <Pressable
                        key={c.corral_id}
                        onPress={() => setDestiIds((s) => toggleSet(s, c.corral_id))}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: triat }}
                        style={triat ? styles.corralTriat : styles.corral}
                      >
                        <Text style={styles.corralNom}>
                          {c.corral}
                          {c.meitat}
                        </Text>
                        <Text style={styles.corralDe}>
                          {c.porcs}/{c.capacitat}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </SalaColapsable>
            );
          })}
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Quants porcs</Text>
          <TextInput
            value={numPorcs}
            onChangeText={(t) => setNumPorcs(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.discret}
            style={styles.input}
            accessibilityLabel="Quants porcs es mouen"
          />
          {n > 0 && totalOrigen < n && (
            <Text style={styles.textAvis}>
              Als corrals d&apos;origen triats només hi ha {totalOrigen} porcs.
            </Text>
          )}
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Motiu (opcional)</Text>
          <TextInput
            value={motiu}
            onChangeText={setMotiu}
            placeholder="Per exemple: massa grans pel corral"
            placeholderTextColor={colors.discret}
            style={styles.inputText}
            accessibilityLabel="Motiu del moviment"
          />
        </View>

        {origensTriats.length > 0 && destinsTriats.length > 0 && totalOrigen > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Resum</Text>
            {origensTriats.map((c, i) => (
              <Text key={c.corral_id} style={styles.resum}>
                Surten {sortidesPerOrigen[i]} del corral {c.corral}
                {c.meitat} (sala {c.sala})
              </Text>
            ))}
            {destinsTriats.map((c, i) => (
              <Text key={c.corral_id} style={styles.resum}>
                Entren {entradesPerDesti[i]} al corral {c.corral}
                {c.meitat} (sala {c.sala})
              </Text>
            ))}
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={desa}
          disabled={!potDesar}
          accessibilityRole="button"
          style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
        >
          <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar el moviment'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
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
  textError: { color: colors.perill },
  textAvis: { color: colors.avis, fontSize: 13 },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  ajuda: { fontSize: 13, color: colors.discret },
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
  corrals: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  corral: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    backgroundColor: colors.targeta,
    alignItems: 'center',
  },
  corralTriat: {
    minWidth: 56,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.primari,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
  },
  corralNom: { fontSize: 12, fontWeight: '600', color: colors.discret },
  corralPorcs: { fontSize: 16, fontWeight: '700', color: colors.text },
  corralDe: { fontSize: 13, color: colors.discret, fontVariant: ['tabular-nums'] },
  input: {
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
  },
  inputText: {
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 15,
    color: colors.text,
  },
  resum: { fontSize: 13, color: colors.text, lineHeight: 19 },
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
