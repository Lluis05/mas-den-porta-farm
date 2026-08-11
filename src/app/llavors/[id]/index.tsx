import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
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
  actualitzaEntradaLlavores,
  detallEntradaLlavores,
  esborraEntradaLlavores,
  type EntradaLlavoresDetall,
} from '@/db/queries';
import { colors, mides } from '@/theme';

function aIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function aNumero(text: string): number | null {
  const net = text.replace(',', '.').trim();
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function DetallEntradaLlavors() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [entrada, setEntrada] = useState<EntradaLlavoresDetall | null>(null);
  const [editant, setEditant] = useState(false);
  const [desant, setDesant] = useState(false);
  const [confirmant, setConfirmant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [unitats, setUnitats] = useState('');
  const [kg, setKg] = useState('');
  const [totalFactura, setTotalFactura] = useState('');
  const [preuKg, setPreuKg] = useState('');

  const carrega = useCallback(async () => {
    const e = await detallEntradaLlavores(db, id);
    setEntrada(e);
    if (e) {
      setData(new Date(`${e.data}T12:00:00`));
      setUnitats(text(e.unitats));
      setKg(text(e.kg));
      setTotalFactura(text(e.total_factura));
      setPreuKg(text(e.preu_kg));
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      carrega();
    }, [carrega])
  );

  async function desaCanvis() {
    setDesant(true);
    setError(null);
    try {
      await actualitzaEntradaLlavores(db, id, {
        data: aIso(data),
        unitats: aNumero(unitats),
        kg: aNumero(kg),
        totalFactura: aNumero(totalFactura),
        preuKg: aNumero(preuKg),
      });
      await carrega();
      setEditant(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesant(false);
    }
  }

  async function esborra() {
    await esborraEntradaLlavores(db, id);
    router.replace('/llavors');
  }

  if (!entrada) {
    return (
      <>
        <Stack.Screen options={{ title: 'Entrada de llavores' }} />
        <View style={styles.pagina}>
          <Text style={styles.ajuda}>Carregant…</Text>
        </View>
      </>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Entrada de llavores' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        {error && (
          <View style={styles.targetaError}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {editant ? (
          <>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Data d&apos;entrada</Text>
              <Pressable onPress={() => setMostrarCalendari(true)} style={styles.camp}>
                <Text style={styles.campText}>{aIso(data)}</Text>
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
              <CampEditable etiqueta="Unitats" valor={unitats} onCanvia={setUnitats} />
              <CampEditable etiqueta="Kg" valor={kg} onCanvia={setKg} />
              <CampEditable
                etiqueta="Total factura"
                valor={totalFactura}
                onCanvia={setTotalFactura}
              />
              <CampEditable etiqueta="Preu/kg" valor={preuKg} onCanvia={setPreuKg} />
            </View>

            <View style={styles.botons}>
              <Pressable
                onPress={() => {
                  setEditant(false);
                  carrega();
                }}
                style={styles.botoSecundariLink}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>Cancel·lar</Text>
              </Pressable>
              <Pressable
                onPress={desaCanvis}
                disabled={desant}
                style={styles.botoPrincipal}
                accessibilityRole="button"
              >
                <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar'}</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <View style={styles.targeta}>
              <Fila etiqueta="Data" valor={entrada.data} />
              <Fila etiqueta="Unitats" valor={text(entrada.unitats) || '—'} />
              <Fila etiqueta="Kg" valor={entrada.kg != null ? `${entrada.kg} kg` : '—'} />
              <Fila
                etiqueta="Promig"
                valor={entrada.promig_kg != null ? `${entrada.promig_kg.toFixed(1)} kg` : '—'}
              />
              <Fila
                etiqueta="Total factura"
                valor={entrada.total_factura != null ? `${entrada.total_factura} €` : 'per omplir'}
              />
              <Fila
                etiqueta="Preu/kg"
                valor={entrada.preu_kg != null ? `${entrada.preu_kg} €/kg` : 'per omplir'}
              />
            </View>

            {confirmant ? (
              <View style={styles.targetaError}>
                <Text style={styles.titolError}>Esborrar aquesta entrada?</Text>
                <Text style={styles.ajuda}>Es podrà recuperar, res s&apos;esborra del tot.</Text>
                <View style={styles.botons}>
                  <Pressable
                    onPress={() => setConfirmant(false)}
                    style={styles.botoSecundariLink}
                    accessibilityRole="button"
                  >
                    <Text style={styles.botoSecundariText}>No</Text>
                  </Pressable>
                  <Pressable
                    onPress={esborra}
                    style={styles.botoPerill}
                    accessibilityRole="button"
                  >
                    <Text style={styles.botoText}>Sí, esborrar</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.botons}>
                <Pressable
                  onPress={() => setEditant(true)}
                  style={styles.botoSecundariLink}
                  accessibilityRole="button"
                >
                  <Text style={styles.botoSecundariText}>Editar</Text>
                </Pressable>
                <Pressable
                  onPress={() => setConfirmant(true)}
                  style={styles.botoSecundariLink}
                  accessibilityRole="button"
                >
                  <Text style={styles.botoPerillText}>Esborrar</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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

function CampEditable({
  etiqueta,
  valor,
  onCanvia,
}: {
  etiqueta: string;
  valor: string;
  onCanvia: (t: string) => void;
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.filaEtiqueta}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={(t) => onCanvia(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        style={styles.input}
        accessibilityLabel={etiqueta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  ajuda: { fontSize: 13, color: colors.discret },
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
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  textError: { color: colors.perill },
  titolError: { fontSize: 16, fontWeight: '600', color: colors.perill },
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
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  filaEtiqueta: { color: colors.text, fontSize: 14 },
  filaValor: { fontWeight: '600', fontVariant: ['tabular-nums'], fontSize: 14 },
  input: {
    minWidth: 110,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'right',
    color: colors.text,
  },
  botons: { flexDirection: 'row', gap: mides.espai },
  botoPrincipal: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoPerill: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    backgroundColor: colors.perill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Objecte sol, no [boto, botoSecundari]: veure la trampa #4 a CLAUDE.md.
  botoSecundariLink: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  botoSecundariText: { fontSize: 16, fontWeight: '600', color: colors.primari },
  botoPerillText: { fontSize: 16, fontWeight: '600', color: colors.perill },
  botoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
