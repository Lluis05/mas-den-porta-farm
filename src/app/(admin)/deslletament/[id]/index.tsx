import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
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
  actualitzaDeslletament,
  apuntaInseminacio,
  detallDeslletament,
  esborraDeslletament,
  llistaUbicacionsReproduccio,
  type DeslletamentDetall,
  type UbicacioReproduccio,
} from '@/db/queries';
import { colors, mides } from '@/theme';

function aIso(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function aEnter(text: string): number | null {
  const net = text.trim();
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n));
const pct = (n: number | null | undefined) => (n == null ? '—' : `${(n * 100).toFixed(1)} %`);

function alterna(conjunt: Set<string>, id: string): Set<string> {
  const nou = new Set(conjunt);
  if (nou.has(id)) nou.delete(id);
  else nou.add(id);
  return nou;
}

export default function DetallDeslletamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [d, setD] = useState<DeslletamentDetall | null>(null);
  const [ubicacions, setUbicacions] = useState<UbicacioReproduccio[]>([]);
  const [editantBase, setEditantBase] = useState(false);
  const [editantInsem, setEditantInsem] = useState(false);
  const [desant, setDesant] = useState(false);
  const [confirmant, setConfirmant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [dataDesmamat, setDataDesmamat] = useState(new Date());
  const [truesCriades, setTruesCriades] = useState('');
  const [truesDesmamades, setTruesDesmamades] = useState('');
  const [porcsVius, setPorcsVius] = useState('');
  const [porcsDesmamats, setPorcsDesmamats] = useState('');
  const [posicionsInseminar, setPosicionsInseminar] = useState<Set<string>>(new Set());
  const [posicionsGestacio, setPosicionsGestacio] = useState<Set<string>>(new Set());
  const [observacions, setObservacions] = useState('');

  const [dataInseminacio, setDataInseminacio] = useState(new Date());
  const [mostrarCalendariInsem, setMostrarCalendariInsem] = useState(false);
  const [insemTotal, setInsemTotal] = useState('');
  const [repetidores, setRepetidores] = useState('');
  const [primales, setPrimales] = useState('');

  useEffect(() => {
    llistaUbicacionsReproduccio(db).then(setUbicacions);
  }, [db]);

  const carrega = useCallback(async () => {
    const detall = await detallDeslletament(db, id);
    setD(detall);
    if (detall) {
      setDataDesmamat(new Date(`${detall.data_desmamat}T12:00:00`));
      setTruesCriades(text(detall.truges_criades));
      setTruesDesmamades(text(detall.truges_desmamades));
      setPorcsVius(text(detall.porcs_vius_1a_setmana));
      setPorcsDesmamats(text(detall.porcs_desmamats));
      setPosicionsInseminar(new Set(detall.posicions_inseminar_ids));
      setPosicionsGestacio(new Set(detall.posicions_gestacio_ids));
      setObservacions(detall.observacions ?? '');

      setDataInseminacio(
        new Date(`${detall.data_inseminacio ?? detall.data_desmamat}T12:00:00`)
      );
      setInsemTotal(text(detall.insem_total));
      setRepetidores(text(detall.repetidores));
      setPrimales(text(detall.primales));
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      carrega();
    }, [carrega])
  );

  async function desaBase() {
    if (!d) return;
    setDesant(true);
    setError(null);
    try {
      await actualitzaDeslletament(db, id, {
        bandaId: d.banda_id,
        dataDesmamat: aIso(dataDesmamat),
        truges_criades: aEnter(truesCriades),
        truges_desmamades: aEnter(truesDesmamades),
        porcs_vius_1a_setmana: aEnter(porcsVius),
        porcs_desmamats: aEnter(porcsDesmamats),
        posicionsInseminarIds: [...posicionsInseminar],
        posicionsGestacioIds: [...posicionsGestacio],
        observacions: observacions.trim() || null,
      });
      await carrega();
      setEditantBase(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesant(false);
    }
  }

  async function desaInsem() {
    setDesant(true);
    setError(null);
    try {
      await apuntaInseminacio(db, id, {
        dataInseminacio: aIso(dataInseminacio),
        insem_total: aEnter(insemTotal),
        repetidores: aEnter(repetidores),
        primales: aEnter(primales),
      });
      await carrega();
      setEditantInsem(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesant(false);
    }
  }

  async function esborra() {
    await esborraDeslletament(db, id);
    router.replace('/deslletament');
  }

  if (!d) {
    return (
      <>
        <Stack.Screen options={{ title: 'Deslletament' }} />
        <View style={styles.pagina}>
          <Text style={styles.ajuda}>Carregant…</Text>
        </View>
      </>
    );
  }

  const inseminar = ubicacions.filter((u) => u.tipus === 'inseminacio');
  const gestacio = ubicacions.filter((u) => u.tipus === 'gestacio');

  const nomsUbicacions = (ids: string[]) => {
    if (ids.length === 0) return '—';
    return ids
      .map((uid) => ubicacions.find((u) => u.id === uid)?.codi ?? '—')
      .join(', ');
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: `Banda ${d.banda} · ${d.data_desmamat}` }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        {error && (
          <View style={styles.targetaError}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {editantBase ? (
          <>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Data de deslletament</Text>
              <TextInput
                value={aIso(dataDesmamat)}
                onChangeText={(t) => {
                  const nova = new Date(`${t}T12:00:00`);
                  if (!Number.isNaN(nova.getTime())) setDataDesmamat(nova);
                }}
                style={styles.input}
                accessibilityLabel="Data de deslletament"
              />
            </View>
            <View style={styles.targeta}>
              <CampEditable etiqueta="Truges criades" valor={truesCriades} onCanvia={setTruesCriades} />
              <CampEditable
                etiqueta="Truges desmamades"
                valor={truesDesmamades}
                onCanvia={setTruesDesmamades}
              />
              <CampEditable etiqueta="Vius 1a setmana" valor={porcsVius} onCanvia={setPorcsVius} />
              <CampEditable
                etiqueta="Desmamats"
                valor={porcsDesmamats}
                onCanvia={setPorcsDesmamats}
              />
            </View>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Posició d&apos;inseminar</Text>
              <Text style={styles.ajuda}>Es pot triar més d&apos;una.</Text>
              <View style={styles.filaPastilles}>
                {inseminar.map((u) => (
                  <Pastilla
                    key={u.id}
                    text={u.codi}
                    actiu={posicionsInseminar.has(u.id)}
                    onPress={() => setPosicionsInseminar((s) => alterna(s, u.id))}
                  />
                ))}
              </View>
            </View>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Posició de gestació</Text>
              <Text style={styles.ajuda}>Es pot triar més d&apos;una.</Text>
              <View style={styles.filaPastilles}>
                {gestacio.map((u) => (
                  <Pastilla
                    key={u.id}
                    text={u.codi}
                    actiu={posicionsGestacio.has(u.id)}
                    onPress={() => setPosicionsGestacio((s) => alterna(s, u.id))}
                  />
                ))}
              </View>
            </View>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>Observacions</Text>
              <TextInput
                value={observacions}
                onChangeText={setObservacions}
                style={styles.inputText}
                multiline
                accessibilityLabel="Observacions"
              />
            </View>
            <View style={styles.botons}>
              <Pressable
                onPress={() => {
                  setEditantBase(false);
                  carrega();
                }}
                style={styles.botoSecundariLink}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>Cancel·lar</Text>
              </Pressable>
              <Pressable
                onPress={desaBase}
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
              <Fila etiqueta="Banda" valor={String(d.banda)} />
              <Fila etiqueta="Data" valor={d.data_desmamat} />
              <Fila etiqueta="Truges criades" valor={text(d.truges_criades) || '—'} />
              <Fila etiqueta="Truges desmamades" valor={text(d.truges_desmamades) || '—'} />
              <Fila etiqueta="Vius 1a setmana" valor={text(d.porcs_vius_1a_setmana) || '—'} />
              <Fila etiqueta="Desmamats" valor={text(d.porcs_desmamats) || '—'} />
              <Fila etiqueta="% baixes parideres" valor={pct(d.pct_baixes_parideres)} />
              <Fila etiqueta="Mitjana porcs/truja" valor={text(d.mitjana_porcs_truja) || '—'} />
              <Fila
                etiqueta="Posició inseminar"
                valor={nomsUbicacions(d.posicions_inseminar_ids)}
              />
              <Fila
                etiqueta="Posició gestació"
                valor={nomsUbicacions(d.posicions_gestacio_ids)}
              />
              {d.observacions ? <Fila etiqueta="Observacions" valor={d.observacions} /> : null}
            </View>
            <Pressable
              onPress={() => setEditantBase(true)}
              style={styles.botoSecundariLink}
              accessibilityRole="button"
            >
              <Text style={styles.botoSecundariText}>Editar</Text>
            </Pressable>
          </>
        )}

        {editantInsem ? (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Inseminació</Text>
            <Pressable
              onPress={() => setMostrarCalendariInsem(true)}
              style={styles.camp}
            >
              <Text style={styles.campText}>{aIso(dataInseminacio)}</Text>
            </Pressable>
            {mostrarCalendariInsem && (
              <DateTimePicker
                value={dataInseminacio}
                mode="date"
                display={Platform.OS === 'ios' ? 'inline' : 'default'}
                onChange={(_, triada) => {
                  if (Platform.OS !== 'ios') setMostrarCalendariInsem(false);
                  if (triada) setDataInseminacio(triada);
                }}
              />
            )}
            {Platform.OS === 'ios' && mostrarCalendariInsem && (
              <Pressable onPress={() => setMostrarCalendariInsem(false)}>
                <Text style={styles.enllac}>Fet</Text>
              </Pressable>
            )}
            <CampEditable etiqueta="Total inseminades" valor={insemTotal} onCanvia={setInsemTotal} />
            <CampEditable etiqueta="Repetidores" valor={repetidores} onCanvia={setRepetidores} />
            <CampEditable etiqueta="Primales" valor={primales} onCanvia={setPrimales} />
            <Text style={styles.ajuda}>
              Les primales compten per al cens de truges des d&apos;aquesta data.
            </Text>
            <View style={styles.botons}>
              <Pressable
                onPress={() => {
                  setEditantInsem(false);
                  carrega();
                }}
                style={styles.botoSecundariLink}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>Cancel·lar</Text>
              </Pressable>
              <Pressable
                onPress={desaInsem}
                disabled={desant}
                style={styles.botoPrincipal}
                accessibilityRole="button"
              >
                <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Inseminació</Text>
            {d.data_inseminacio == null ? (
              <Text style={styles.ajuda}>Encara no s&apos;ha apuntat.</Text>
            ) : (
              <>
                <Fila etiqueta="Data" valor={d.data_inseminacio} />
                <Fila etiqueta="Total inseminades" valor={text(d.insem_total) || '—'} />
                <Fila etiqueta="Repetidores" valor={text(d.repetidores) || '—'} />
                <Fila etiqueta="Primales" valor={text(d.primales) || '—'} />
                <Fila etiqueta="% plenes" valor={pct(d.pct_plenes)} />
              </>
            )}
            <Pressable
              onPress={() => setEditantInsem(true)}
              style={styles.botoSecundariLink}
              accessibilityRole="button"
            >
              <Text style={styles.botoSecundariText}>
                {d.data_inseminacio == null ? 'Apuntar la inseminació' : 'Editar'}
              </Text>
            </Pressable>
          </View>
        )}

        {confirmant ? (
          <View style={styles.targetaError}>
            <Text style={styles.titolError}>Esborrar aquest deslletament?</Text>
            <Text style={styles.ajuda}>Es podrà recuperar, res s&apos;esborra del tot.</Text>
            <View style={styles.botons}>
              <Pressable
                onPress={() => setConfirmant(false)}
                style={styles.botoSecundariLink}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>No</Text>
              </Pressable>
              <Pressable onPress={esborra} style={styles.botoPerill} accessibilityRole="button">
                <Text style={styles.botoText}>Sí, esborrar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable
            onPress={() => setConfirmant(true)}
            style={styles.botoSecundariLink}
            accessibilityRole="button"
          >
            <Text style={styles.botoPerillText}>Esborrar</Text>
          </Pressable>
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

function Pastilla({
  text,
  actiu,
  onPress,
}: {
  text: string;
  actiu: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: actiu }}
      style={[styles.pastilla, actiu && styles.pastillaActiva]}
    >
      <Text style={[styles.pastillaLabel, actiu && styles.pastillaTextActiu]}>{text}</Text>
    </Pressable>
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
        onChangeText={(t) => onCanvia(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        style={styles.input}
        accessibilityLabel={etiqueta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: mides.espaiTeclat },
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
  filaPastilles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pastilla: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastillaActiva: { backgroundColor: colors.primari, borderColor: colors.primari },
  pastillaLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  pastillaTextActiu: { color: '#fff' },
  inputText: {
    minHeight: 60,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    textAlignVertical: 'top',
  },
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
  botoSecundariLink: {
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
