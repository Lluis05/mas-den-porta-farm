import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
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

import { creaRecompteTruges } from '@/db/queries';
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
 * Recompte manual de truges (resposta B6). Es pot fer més d'un cop: el
 * cens actual sempre parteix del recompte més recent (v_cens_truges_actual).
 */
export default function NouRecompteTruges() {
  const db = useSQLiteContext();
  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [numTruges, setNumTruges] = useState('');
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const potDesar = numTruges !== '' && !desant;

  async function desa() {
    setDesant(true);
    setError(null);
    try {
      await creaRecompteTruges(db, aIso(data), parseInt(numTruges, 10));
      router.replace('/cens');
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
      <Stack.Screen options={{ title: 'Recompte de truges' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Data del recompte</Text>
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
          <Text style={styles.titolSeccio}>Truges comptades a mà</Text>
          <TextInput
            value={numTruges}
            onChangeText={(t) => setNumTruges(t.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="0"
            placeholderTextColor={colors.discret}
            style={styles.input}
            accessibilityLabel="Truges comptades a mà"
          />
        </View>

        {error && (
          <View style={styles.targetaError}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        <Pressable
          onPress={desa}
          disabled={!potDesar}
          accessibilityRole="button"
          style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
        >
          <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar'}</Text>
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
  targetaError: {
    backgroundColor: colors.perillFluix,
    borderColor: colors.perill,
    borderRadius: mides.radi,
    padding: mides.espai,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textError: { color: colors.perill },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
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
  input: {
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
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
