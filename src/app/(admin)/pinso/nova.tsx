import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
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
  creaEntregaPinso,
  tipusPinsoAmbEntregues,
  type TipusAmbEntregues,
} from '@/db/queries';
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
 * Un camió de pinso porta 2 o 3 tipus en un mateix viatge, així que es poden
 * apuntar diverses línies amb la mateixa data d'una tacada.
 */
export default function NovaEntrega() {
  const db = useSQLiteContext();
  const [tipus, setTipus] = useState<TipusAmbEntregues[]>([]);
  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [kg, setKg] = useState<Record<string, string>>({});
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    tipusPinsoAmbEntregues(db).then((t) => viu && setTipus(t));
    return () => {
      viu = false;
    };
  }, [db]);

  const linies = Object.entries(kg)
    .map(([id, text]) => ({ id, kg: parseInt(text, 10) || 0 }))
    .filter((l) => l.kg > 0);
  const total = linies.reduce((s, l) => s + l.kg, 0);
  const potDesar = linies.length > 0 && !desant;

  async function desa() {
    setDesant(true);
    setError(null);
    try {
      for (const l of linies) {
        await creaEntregaPinso(db, {
          data: aIso(data),
          tipusPinsoId: l.id,
          kg: l.kg,
        });
      }
      router.replace('/pinso');
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
      <Stack.Screen options={{ title: 'Entrega de pinso' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Data de l&apos;entrega</Text>
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
          <Text style={styles.titolSeccio}>Quilos per tipus</Text>
          <Text style={styles.ajuda}>
            Omple només els tipus que porti el camió.
          </Text>
          {tipus.map((t) => (
            <View key={t.id} style={styles.fila}>
              <View style={styles.flex}>
                <Text style={styles.codi}>{t.codi}</Text>
                {t.descripcio && <Text style={styles.ajuda}>{t.descripcio}</Text>}
              </View>
              <TextInput
                value={kg[t.id] ?? ''}
                onChangeText={(text) =>
                  setKg((k) => ({ ...k, [t.id]: text.replace(/[^0-9]/g, '') }))
                }
                keyboardType="number-pad"
                placeholder="kg"
                placeholderTextColor={colors.discret}
                style={styles.input}
                accessibilityLabel={`Quilos de ${t.codi}`}
              />
            </View>
          ))}
        </View>

        {total > 0 && (
          <View style={styles.targeta}>
            <View style={styles.filaTotal}>
              <Text style={styles.etiqueta}>Total</Text>
              <Text style={styles.total}>{total} kg</Text>
            </View>
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
          <Text style={styles.botoText}>
            {desant ? 'Desant…' : 'Desar l’entrega'}
          </Text>
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
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  codi: { fontSize: 16, fontWeight: '600', color: colors.text },
  input: {
    minWidth: 110,
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
  etiqueta: { fontSize: 15, color: colors.text },
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
