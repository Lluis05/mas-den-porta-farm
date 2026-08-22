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
  creaDeslletament,
  llistaBandes,
  llistaUbicacionsReproduccio,
  type Banda,
  type UbicacioReproduccio,
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

function aEnter(text: string): number | null {
  const net = text.trim();
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

function alterna(conjunt: Set<string>, id: string): Set<string> {
  const nou = new Set(conjunt);
  if (nou.has(id)) nou.delete(id);
  else nou.add(id);
  return nou;
}

/**
 * Fase 1 del deslletament (full "Cens24" de l'Excel): tot el que se sap el
 * dia que es desmama la banda. La inseminació (dies després) s'omple més
 * tard, editant aquesta mateixa fitxa.
 */
export default function NouDeslletament() {
  const db = useSQLiteContext();
  const [bandes, setBandes] = useState<Banda[]>([]);
  const [ubicacions, setUbicacions] = useState<UbicacioReproduccio[]>([]);

  const [bandaId, setBandaId] = useState<string | null>(null);
  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [truesCriades, setTruesCriades] = useState('');
  const [truesDesmamades, setTruesDesmamades] = useState('');
  const [porcsVius, setPorcsVius] = useState('');
  const [porcsDesmamats, setPorcsDesmamats] = useState('');
  const [posicionsInseminar, setPosicionsInseminar] = useState<Set<string>>(new Set());
  const [posicionsGestacio, setPosicionsGestacio] = useState<Set<string>>(new Set());
  const [observacions, setObservacions] = useState('');
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [b, u] = await Promise.all([llistaBandes(db), llistaUbicacionsReproduccio(db)]);
      if (!viu) return;
      setBandes(b);
      setUbicacions(u);
    })();
    return () => {
      viu = false;
    };
  }, [db]);

  const inseminar = ubicacions.filter((u) => u.tipus === 'inseminacio');
  const gestacio = ubicacions.filter((u) => u.tipus === 'gestacio');

  const potDesar = bandaId != null && !desant;

  async function desa() {
    if (!bandaId) return;
    setDesant(true);
    setError(null);
    try {
      const id = await creaDeslletament(db, {
        bandaId,
        dataDesmamat: aIso(data),
        truges_criades: aEnter(truesCriades),
        truges_desmamades: aEnter(truesDesmamades),
        porcs_vius_1a_setmana: aEnter(porcsVius),
        porcs_desmamats: aEnter(porcsDesmamats),
        posicionsInseminarIds: [...posicionsInseminar],
        posicionsGestacioIds: [...posicionsGestacio],
        observacions: observacions.trim() || null,
      });
      router.replace(`/deslletament/${id}`);
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
      <Stack.Screen options={{ title: 'Nou deslletament' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Banda</Text>
          <View style={styles.fila}>
            {bandes.map((b) => (
              <Pressable
                key={b.id}
                onPress={() => setBandaId(b.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: bandaId === b.id }}
                style={[styles.pastilla, bandaId === b.id && styles.pastillaActiva]}
              >
                <Text
                  style={[styles.pastillaText, bandaId === b.id && styles.pastillaTextActiu]}
                >
                  {b.numero}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Data de deslletament</Text>
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
          <Text style={styles.titolSeccio}>Truges</Text>
          <CampNumeric etiqueta="Truges criades" valor={truesCriades} onCanvia={setTruesCriades} />
          <CampNumeric
            etiqueta="Truges desmamades"
            valor={truesDesmamades}
            onCanvia={setTruesDesmamades}
          />
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Porcells</Text>
          <CampNumeric
            etiqueta="Vius a la 1a setmana"
            valor={porcsVius}
            onCanvia={setPorcsVius}
          />
          <CampNumeric
            etiqueta="Desmamats"
            valor={porcsDesmamats}
            onCanvia={setPorcsDesmamats}
          />
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Posició d&apos;inseminar</Text>
          <Text style={styles.ajuda}>Es pot triar més d&apos;una.</Text>
          <View style={styles.fila}>
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
          <View style={styles.fila}>
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
            placeholder="p.ex. vac pyrss, draxin…"
            placeholderTextColor={colors.discret}
            style={styles.inputText}
            multiline
            accessibilityLabel="Observacions"
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

function CampNumeric({
  etiqueta,
  valor,
  onCanvia,
}: {
  etiqueta: string;
  valor: string;
  onCanvia: (t: string) => void;
}) {
  return (
    <View style={styles.filaCamp}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={(t) => onCanvia(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        placeholder="0"
        placeholderTextColor={colors.discret}
        style={styles.input}
        accessibilityLabel={etiqueta}
      />
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
      style={[styles.pastillaText2, actiu && styles.pastillaActiva]}
    >
      <Text style={[styles.pastillaLabel, actiu && styles.pastillaTextActiu]}>{text}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.fons },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: mides.espaiTeclat },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 8,
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
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  filaCamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
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
  pastilla: {
    width: mides.toc,
    height: mides.toc,
    borderRadius: mides.toc / 2,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastillaActiva: { backgroundColor: colors.primari, borderColor: colors.primari },
  pastillaText: { fontSize: 17, fontWeight: '600', color: colors.text },
  pastillaTextActiu: { color: '#fff' },
  pastillaText2: {
    paddingHorizontal: 14,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pastillaLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
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
