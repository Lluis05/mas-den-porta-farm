import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { GraellaCorrals } from '@/components/graella-corrals';
import {
  corralsOcupats,
  creaCicle,
  llistaBandes,
  llistaCorrals,
  llistaSales,
  type Banda,
  type Corral,
  type Sala,
} from '@/db/queries';
import { codiSala, type Meitat } from '@/lib/corrals';
import { colors, mides } from '@/theme';

/** Estat d'una sala mentre s'omple el formulari. */
type SalaTriada = {
  salaId: string;
  numero: number;
  /** Text pla perquè l'usuari pugui esborrar-ho tot mentre escriu. */
  porcs: string;
  seleccionats: Set<string>;
};

const dataAvui = () => new Date();

/** ISO curt (2026-08-10), que és com es guarden les dates a la base de dades. */
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

export default function NouCicle() {
  const db = useSQLiteContext();

  const [bandes, setBandes] = useState<Banda[]>([]);
  const [sales, setSales] = useState<Sala[]>([]);
  const [corrals, setCorrals] = useState<Corral[]>([]);
  const [ocupats, setOcupats] = useState<Set<string>>(new Set());

  const [bandaId, setBandaId] = useState<string | null>(null);
  const [data, setData] = useState<Date>(dataAvui);
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [triades, setTriades] = useState<SalaTriada[]>([]);
  const [desant, setDesant] = useState(false);

  useEffect(() => {
    let viu = true;
    (async () => {
      const [b, s, c, o] = await Promise.all([
        llistaBandes(db),
        llistaSales(db),
        llistaCorrals(db),
        corralsOcupats(db),
      ]);
      if (!viu) return;
      setBandes(b);
      setSales(s);
      setCorrals(c);
      setOcupats(o);
    })();
    return () => {
      viu = false;
    };
  }, [db]);

  const corralsPerSala = useMemo(() => {
    const mapa = new Map<string, Corral[]>();
    for (const c of corrals) {
      const llista = mapa.get(c.sala_id);
      if (llista) llista.push(c);
      else mapa.set(c.sala_id, [c]);
    }
    return mapa;
  }, [corrals]);

  /** En afegir una sala es marquen les 12 corralines: el cas més habitual. */
  const alternaSala = useCallback(
    (sala: Sala) => {
      setTriades((actuals) => {
        const jaHiEs = actuals.some((t) => t.salaId === sala.id);
        if (jaHiEs) return actuals.filter((t) => t.salaId !== sala.id);
        const seus = corralsPerSala.get(sala.id) ?? [];
        return [
          ...actuals,
          {
            salaId: sala.id,
            numero: sala.numero,
            porcs: '',
            seleccionats: new Set(seus.map((c) => c.id)),
          },
        ].sort((a, b) => a.numero - b.numero);
      });
    },
    [corralsPerSala]
  );

  const treuSala = useCallback((salaId: string) => {
    setTriades((actuals) => actuals.filter((t) => t.salaId !== salaId));
  }, []);

  const alternaCorral = useCallback((salaId: string, corralId: string) => {
    setTriades((actuals) =>
      actuals.map((t) => {
        if (t.salaId !== salaId) return t;
        const nous = new Set(t.seleccionats);
        if (nous.has(corralId)) nous.delete(corralId);
        else nous.add(corralId);
        return { ...t, seleccionats: nous };
      })
    );
  }, []);

  const alternaMeitat = useCallback(
    (salaId: string, meitat: Meitat) => {
      setTriades((actuals) =>
        actuals.map((t) => {
          if (t.salaId !== salaId) return t;
          const seus = (corralsPerSala.get(salaId) ?? []).filter(
            (c) => c.meitat === meitat
          );
          const totes = seus.every((c) => t.seleccionats.has(c.id));
          const nous = new Set(t.seleccionats);
          for (const c of seus) {
            if (totes) nous.delete(c.id);
            else nous.add(c.id);
          }
          return { ...t, seleccionats: nous };
        })
      );
    },
    [corralsPerSala]
  );

  const canviaPorcs = useCallback((salaId: string, text: string) => {
    const netejat = text.replace(/[^0-9]/g, '');
    setTriades((actuals) =>
      actuals.map((t) => (t.salaId === salaId ? { ...t, porcs: netejat } : t))
    );
  }, []);

  const totalPorcs = triades.reduce((s, t) => s + (parseInt(t.porcs, 10) || 0), 0);
  const totalCorrals = triades.reduce((s, t) => s + t.seleccionats.size, 0);

  const problemes: string[] = [];
  if (!bandaId) problemes.push('Falta triar la banda.');
  if (triades.length === 0) problemes.push('Falta triar almenys una sala.');
  for (const t of triades) {
    const porcs = parseInt(t.porcs, 10) || 0;
    if (porcs <= 0) problemes.push(`Sala ${t.numero}: falta el nombre de porcs.`);
    if (t.seleccionats.size === 0)
      problemes.push(`Sala ${t.numero}: no hi ha cap corralina marcada.`);
  }
  const potDesar = problemes.length === 0 && !desant;

  /** Avisos que no bloquegen: es pot desar igualment. */
  const avisos: string[] = [];
  for (const t of triades) {
    const porcs = parseInt(t.porcs, 10) || 0;
    const places = (corralsPerSala.get(t.salaId) ?? [])
      .filter((c) => t.seleccionats.has(c.id))
      .reduce((s, c) => s + c.capacitat, 0);
    if (porcs > places && places > 0) {
      avisos.push(
        `Sala ${t.numero}: ${porcs} porcs en ${t.seleccionats.size} corralines (${places} places).`
      );
    }
    const jaOcupades = [...t.seleccionats].filter((id) => ocupats.has(id)).length;
    if (jaOcupades > 0) {
      avisos.push(
        `Sala ${t.numero}: ${jaOcupades} corralina${
          jaOcupades > 1 ? 's ja tenen' : ' ja té'
        } porcs d'un altre cicle.`
      );
    }
  }

  async function desa() {
    if (!bandaId) return;
    setDesant(true);
    try {
      const cicleId = await creaCicle(db, {
        bandaId,
        dataEntrada: aIso(data),
        sales: triades.map((t) => ({
          corralIds: [...t.seleccionats],
          porcs: parseInt(t.porcs, 10) || 0,
        })),
      });
      router.replace(`/cicle/${cicleId}`);
    } catch (e) {
      setDesant(false);
      Alert.alert(
        'No s’ha pogut desar',
        e instanceof Error ? e.message : String(e)
      );
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Nou cicle d’engreix' }} />
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
                  style={[
                    styles.pastillaText,
                    bandaId === b.id && styles.pastillaTextActiu,
                  ]}
                >
                  {b.numero}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Data d&apos;entrada</Text>
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
          <Text style={styles.titolSeccio}>Sales</Text>
          <Text style={styles.ajuda}>
            Toca les sales on entren porcs. S&apos;hi marquen totes les corralines;
            després pots treure les que no facis servir.
          </Text>
          <View style={styles.filaSales}>
            {sales.map((s) => {
              const triada = triades.some((t) => t.salaId === s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => alternaSala(s)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: triada }}
                  style={[styles.sala, triada && styles.salaActiva]}
                >
                  <Text style={[styles.salaText, triada && styles.salaTextActiu]}>
                    {s.numero}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {triades.map((t) => {
          const seus = corralsPerSala.get(t.salaId) ?? [];
          const marcats = seus.filter((c) => t.seleccionats.has(c.id));
          const places = marcats.reduce((s, c) => s + c.capacitat, 0);
          const codi = codiSala(
            t.numero,
            marcats.map((c) => ({ meitat: c.meitat, numero: c.numero }))
          );

          return (
            <View key={t.salaId} style={styles.targeta}>
              <View style={styles.capcaleraSala}>
                <Text style={styles.titolSala}>Sala {t.numero}</Text>
                <Pressable
                  onPress={() => treuSala(t.salaId)}
                  accessibilityRole="button"
                  accessibilityLabel={`Treure la sala ${t.numero}`}
                >
                  <Text style={styles.treure}>Treure</Text>
                </Pressable>
              </View>

              <Text style={styles.codi}>{codi}</Text>

              <View style={styles.filaPorcs}>
                <Text style={styles.etiqueta}>Porcs que entren</Text>
                <TextInput
                  value={t.porcs}
                  onChangeText={(text) => canviaPorcs(t.salaId, text)}
                  keyboardType="number-pad"
                  placeholder={String(places)}
                  placeholderTextColor={colors.discret}
                  style={styles.input}
                  accessibilityLabel={`Porcs que entren a la sala ${t.numero}`}
                />
              </View>
              <Text style={styles.ajuda}>
                {marcats.length} corralines · {places} places
              </Text>

              <GraellaCorrals
                corrals={seus}
                seleccionats={t.seleccionats}
                ocupats={ocupats}
                onToggle={(corralId) => alternaCorral(t.salaId, corralId)}
                onToggleMeitat={(meitat) => alternaMeitat(t.salaId, meitat)}
              />
            </View>
          );
        })}

        {avisos.length > 0 && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>Comprova-ho</Text>
            {avisos.map((a) => (
              <Text key={a} style={styles.textAvis}>
                · {a}
              </Text>
            ))}
            <Text style={styles.ajuda}>Es pot desar igualment.</Text>
          </View>
        )}

        {triades.length > 0 && (
          <View style={styles.targeta}>
            <View style={styles.filaTotal}>
              <Text style={styles.etiqueta}>Total porcs</Text>
              <Text style={styles.total}>{totalPorcs}</Text>
            </View>
            <View style={styles.filaTotal}>
              <Text style={styles.etiqueta}>Corralines</Text>
              <Text style={styles.total}>{totalCorrals}</Text>
            </View>
          </View>
        )}

        {problemes.length > 0 && (
          <Text style={styles.ajuda}>{problemes[0]}</Text>
        )}

        <Pressable
          onPress={desa}
          disabled={!potDesar}
          accessibilityRole="button"
          style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
        >
          <Text style={styles.botoText}>
            {desant ? 'Desant…' : 'Desar el cicle'}
          </Text>
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
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  titolAvis: { fontSize: 15, fontWeight: '600', color: colors.avis },
  textAvis: { color: colors.avis },
  ajuda: { fontSize: 13, color: colors.discret },
  fila: { flexDirection: 'row', gap: 8 },
  filaSales: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
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
  sala: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  salaActiva: { backgroundColor: colors.primari, borderColor: colors.primari },
  salaText: { fontSize: 16, fontWeight: '600', color: colors.text },
  salaTextActiu: { color: '#fff' },
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
  capcaleraSala: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  titolSala: { fontSize: 18, fontWeight: '700', color: colors.text },
  treure: { color: colors.perill, fontWeight: '600' },
  codi: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: colors.primari,
    fontSize: 15,
  },
  filaPorcs: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  etiqueta: { fontSize: 15, color: colors.text },
  input: {
    minWidth: 90,
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    paddingHorizontal: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'right',
    color: colors.text,
  },
  filaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
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
