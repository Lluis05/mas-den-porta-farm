import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router } from 'expo-router';
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

import { corralsAmbPorcsAra, creaBaixa, type CorralAmbPorcs } from '@/db/queries';
import { codiSala, reparteixProporcional } from '@/lib/corrals';
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

/**
 * Apuntar una baixa (porcs morts). Es tria la sala i quants n'hi ha hagut;
 * l'app reparteix la resta entre corrals com ja fa amb les càrregues, perquè
 * a peu de sala ningú sap (ni li cal saber) de quin corral exacte era.
 */
export default function NovaBaixa() {
  const db = useSQLiteContext();

  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [corrals, setCorrals] = useState<CorralAmbPorcs[]>([]);
  const [baixes, setBaixes] = useState<Record<number, string>>({});
  const [desant, setDesant] = useState(false);
  const [desat, setDesat] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    corralsAmbPorcsAra(db).then((c) => viu && setCorrals(c));
    return () => {
      viu = false;
    };
  }, [db]);

  const perSala = useMemo(() => {
    const mapa = new Map<number, CorralAmbPorcs[]>();
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
      const demanats = parseInt(baixes[sala] ?? '', 10) || 0;
      const trossos = reparteixProporcional(
        demanats,
        seus.map((c) => c.porcs)
      );
      seus.forEach((c, i) => resultat.set(c.corral_id, trossos[i]));
    }
    return resultat;
  }, [perSala, baixes]);

  const total = [...repartiment.values()].reduce((s, n) => s + n, 0);
  const potDesar = total > 0 && !desant;

  async function desa() {
    setDesant(true);
    setError(null);
    try {
      await creaBaixa(db, {
        data: aIso(data),
        linies: [...repartiment.entries()].map(([corralId, numPorcs]) => ({
          corralId,
          numPorcs,
        })),
      });
      setDesat(true);
      setBaixes({});
      const c = await corralsAmbPorcsAra(db);
      setCorrals(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesant(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Apuntar una baixa' }} />
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

        {corrals.length === 0 && (
          <View style={styles.targeta}>
            <Text style={styles.ajuda}>Ara mateix no hi ha porcs enlloc.</Text>
          </View>
        )}

        {perSala.map(([sala, seus]) => {
          const disponibles = seus.reduce((s, c) => s + c.porcs, 0);
          const demanats = parseInt(baixes[sala] ?? '', 10) || 0;
          const codi = codiSala(
            sala,
            seus.map((c) => ({ meitat: c.meitat, numero: c.corral }))
          );
          return (
            <View key={sala} style={styles.targeta}>
              <View style={styles.capcaleraSala}>
                <Text style={styles.titolSala}>Sala {sala}</Text>
                <Text style={styles.codi}>{codi}</Text>
              </View>
              <View style={styles.filaPorcs}>
                <Text style={styles.etiqueta}>Porcs morts</Text>
                <TextInput
                  value={baixes[sala] ?? ''}
                  onChangeText={(text) =>
                    setBaixes((b) => ({ ...b, [sala]: text.replace(/[^0-9]/g, '') }))
                  }
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.discret}
                  style={styles.input}
                  accessibilityLabel={`Porcs morts a la sala ${sala}`}
                />
              </View>
              <Text style={styles.ajuda}>
                Hi ha {disponibles} porcs
                {demanats > disponibles ? ' · només en poden morir tots' : ''}
              </Text>
            </View>
          );
        })}

        {desat && (
          <View style={[styles.targeta, styles.targetaOk]}>
            <Text style={styles.textOk}>Desat.</Text>
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {total > 0 && (
          <View style={styles.targeta}>
            <View style={styles.filaTotal}>
              <Text style={styles.etiqueta}>Total porcs morts</Text>
              <Text style={styles.total}>{total}</Text>
            </View>
          </View>
        )}

        <Pressable
          onPress={desa}
          disabled={!potDesar}
          accessibilityRole="button"
          style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
        >
          <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar la baixa'}</Text>
        </Pressable>

        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.enllacCentrat}>Acabat</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: mides.espaiTeclat },
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
  targetaOk: { backgroundColor: colors.okFluix, borderColor: colors.ok },
  textOk: { color: colors.ok, fontWeight: '600' },
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
  enllacCentrat: {
    color: colors.primari,
    fontWeight: '600',
    textAlign: 'center',
    paddingVertical: 8,
  },
  capcaleraSala: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titolSala: { fontSize: 16, fontWeight: '700', color: colors.text },
  codi: { fontSize: 13, color: colors.discret, fontVariant: ['tabular-nums'] },
  filaPorcs: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  etiqueta: { fontSize: 15, color: colors.text },
  input: {
    minWidth: 90,
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
  filaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  total: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
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
