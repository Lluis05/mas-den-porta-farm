import DateTimePicker from '@react-native-community/datetimepicker';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
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

import {
  corralsAmbPorcsDelCicle,
  creaCarrega,
  llistaCicles,
  type CicleLlista,
  type CorralAmbPorcs,
  type TipusCarrega,
} from '@/db/queries';
import { codiSala, reparteixProporcional } from '@/lib/corrals';
import { colors, mides } from '@/theme';

/** Accepta "1,85" i "1.85": aquí es fan servir comes. */
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

export default function NovaCarrega() {
  const db = useSQLiteContext();

  const [tipus, setTipus] = useState<TipusCarrega>('porcs_engreix');
  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);

  const [cicles, setCicles] = useState<CicleLlista[]>([]);
  const [cicleId, setCicleId] = useState<string | null>(null);
  const [corrals, setCorrals] = useState<CorralAmbPorcs[]>([]);

  /** Porcs que surten de cada sala, indexat pel número de sala. */
  const [sortides, setSortides] = useState<Record<number, string>>({});

  const [mostrarFactura, setMostrarFactura] = useState(false);
  const [kg, setKg] = useState('');
  const [kgCanal, setKgCanal] = useState('');
  const [unitats, setUnitats] = useState('');
  const [totalFactura, setTotalFactura] = useState('');
  const [preuKg, setPreuKg] = useState('');
  const [preuRef, setPreuRef] = useState('');
  const [d4, setD4] = useState('');
  const [d5, setD5] = useState('');

  const [desant, setDesant] = useState(false);

  useEffect(() => {
    let viu = true;
    (async () => {
      const llista = await llistaCicles(db);
      if (!viu) return;
      const ambPorcs = llista.filter((c) => c.queden > 0);
      setCicles(ambPorcs);
      if (ambPorcs.length === 1) setCicleId(ambPorcs[0].id);
    })();
    return () => {
      viu = false;
    };
  }, [db]);

  useEffect(() => {
    let viu = true;
    (async () => {
      if (!cicleId) {
        setCorrals([]);
        return;
      }
      const c = await corralsAmbPorcsDelCicle(db, cicleId);
      if (viu) {
        setCorrals(c);
        setSortides({});
      }
    })();
    return () => {
      viu = false;
    };
  }, [db, cicleId]);

  /** Els corrals disponibles, agrupats per sala. */
  const perSala = useMemo(() => {
    const mapa = new Map<number, CorralAmbPorcs[]>();
    for (const c of corrals) {
      const llista = mapa.get(c.sala);
      if (llista) llista.push(c);
      else mapa.set(c.sala, [c]);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [corrals]);

  /**
   * El repartiment de la sortida entre els corrals de cada sala.
   * L'usuari escriu un número per sala; això decideix de quin corral surt cada porc.
   */
  const repartiment = useMemo(() => {
    const resultat = new Map<string, number>();
    for (const [sala, seus] of perSala) {
      const demanats = parseInt(sortides[sala] ?? '', 10) || 0;
      const trossos = reparteixProporcional(
        demanats,
        seus.map((c) => c.porcs)
      );
      seus.forEach((c, i) => resultat.set(c.corral_id, trossos[i]));
    }
    return resultat;
  }, [perSala, sortides]);

  const totalSurten = [...repartiment.values()].reduce((s, n) => s + n, 0);

  const esEngreix = tipus === 'porcs_engreix';
  const unitatsNum = aNumero(unitats);
  const discrepancia =
    unitatsNum != null && esEngreix && totalSurten > 0 && unitatsNum !== totalSurten;

  const problemes: string[] = [];
  if (esEngreix) {
    if (!cicleId) problemes.push('Falta triar el cicle.');
    else if (totalSurten <= 0) problemes.push('Falta dir quants porcs surten.');
  } else if ((unitatsNum ?? 0) <= 0) {
    problemes.push('Falta el nombre de truges.');
  }
  const potDesar = problemes.length === 0 && !desant;

  async function desa() {
    setDesant(true);
    try {
      const carregaId = await creaCarrega(db, {
        dataCarrega: aIso(data),
        tipus,
        linies: esEngreix
          ? [...repartiment.entries()].map(([corralId, numPorcs]) => ({
              corralId,
              numPorcs,
            }))
          : [],
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
      router.replace(`/carrega/${carregaId}`);
    } catch (e) {
      setDesant(false);
      Alert.alert('No s’ha pogut desar', e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Nova càrrega' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Què es carrega</Text>
          <View style={styles.fila}>
            {(
              [
                ['porcs_engreix', 'Porcs d’engreix'],
                ['truges_rebuig', 'Truges de rebuig'],
              ] as const
            ).map(([valor, etiqueta]) => (
              <Pressable
                key={valor}
                onPress={() => setTipus(valor)}
                accessibilityRole="radio"
                accessibilityState={{ selected: tipus === valor }}
                style={[styles.opcio, tipus === valor && styles.opcioActiva]}
              >
                <Text
                  style={[styles.opcioText, tipus === valor && styles.opcioTextActiu]}
                >
                  {etiqueta}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

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

        {esEngreix && (
          <>
            <View style={styles.targeta}>
              <Text style={styles.titolSeccio}>De quin cicle</Text>
              {cicles.length === 0 && (
                <Text style={styles.ajuda}>
                  No hi ha cap cicle amb porcs. Crea&apos;n un abans.
                </Text>
              )}
              {cicles.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => setCicleId(c.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: cicleId === c.id }}
                  style={[styles.cicle, cicleId === c.id && styles.cicleActiu]}
                >
                  <View style={styles.bandaRodona}>
                    <Text style={styles.bandaNum}>{c.banda}</Text>
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.cicleTitol}>{c.queden} porcs</Text>
                    <Text style={styles.ajuda}>Entrada {c.data_entrada}</Text>
                  </View>
                </Pressable>
              ))}
            </View>

            {perSala.map(([sala, seus]) => {
              const disponibles = seus.reduce((s, c) => s + c.porcs, 0);
              const demanats = parseInt(sortides[sala] ?? '', 10) || 0;
              const surten = seus.reduce(
                (s, c) => s + (repartiment.get(c.corral_id) ?? 0),
                0
              );
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
                    <Text style={styles.etiqueta}>Porcs que surten</Text>
                    <TextInput
                      value={sortides[sala] ?? ''}
                      onChangeText={(text) =>
                        setSortides((s) => ({
                          ...s,
                          [sala]: text.replace(/[^0-9]/g, ''),
                        }))
                      }
                      keyboardType="number-pad"
                      placeholder="0"
                      placeholderTextColor={colors.discret}
                      style={styles.input}
                      accessibilityLabel={`Porcs que surten de la sala ${sala}`}
                    />
                  </View>
                  <Text style={styles.ajuda}>
                    Hi ha {disponibles} porcs
                    {demanats > disponibles ? ' · només en poden sortir tots' : ''}
                  </Text>
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
                              <Text style={styles.corralDe}>/{c.porcs}</Text>
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })}
          </>
        )}

        <View style={styles.targeta}>
          <Pressable
            onPress={() => setMostrarFactura((v) => !v)}
            style={styles.capcaleraSala}
            accessibilityRole="button"
          >
            <Text style={styles.titolSeccio}>
              Dades de la factura {esEngreix ? '(es poden posar després)' : ''}
            </Text>
            <Text style={styles.enllac}>{mostrarFactura ? 'Amagar' : 'Mostrar'}</Text>
          </Pressable>

          {mostrarFactura && (
            <View style={styles.camps}>
              <CampNumero
                etiqueta={esEngreix ? 'Unitats (factura)' : 'Truges'}
                valor={unitats}
                onChange={setUnitats}
                placeholder={esEngreix ? String(totalSurten) : '0'}
              />
              <CampNumero etiqueta="Kg vius" valor={kg} onChange={setKg} />
              <CampNumero etiqueta="Kg canal" valor={kgCanal} onChange={setKgCanal} />
              <CampNumero
                etiqueta="Total factura (€)"
                valor={totalFactura}
                onChange={setTotalFactura}
              />
              <CampNumero etiqueta="Preu per kg (€)" valor={preuKg} onChange={setPreuKg} />
              <CampNumero
                etiqueta={esEngreix ? 'Preu Mercolleida (€)' : 'Preu Lleida (€)'}
                valor={preuRef}
                onChange={setPreuRef}
              />
              <Text style={styles.titolSeccio}>Decomisos</Text>
              <CampNumero
                etiqueta="D4 · rebutjats a l’escorxador"
                valor={d4}
                onChange={setD4}
              />
              <CampNumero etiqueta="D5 · morts al transport" valor={d5} onChange={setD5} />
            </View>
          )}
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

        {esEngreix && totalSurten > 0 && (
          <View style={styles.targeta}>
            <View style={styles.filaTotal}>
              <Text style={styles.etiqueta}>Total porcs que surten</Text>
              <Text style={styles.total}>{totalSurten}</Text>
            </View>
          </View>
        )}

        {problemes.length > 0 && <Text style={styles.ajuda}>{problemes[0]}</Text>}

        <Pressable
          onPress={desa}
          disabled={!potDesar}
          accessibilityRole="button"
          style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
        >
          <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar la càrrega'}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function CampNumero({
  etiqueta,
  valor,
  onChange,
  placeholder = '',
}: {
  etiqueta: string;
  valor: string;
  onChange: (t: string) => void;
  placeholder?: string;
}) {
  return (
    <View style={styles.filaPorcs}>
      <Text style={styles.etiquetaCamp}>{etiqueta}</Text>
      <TextInput
        value={valor}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={colors.discret}
        style={styles.input}
        accessibilityLabel={etiqueta}
      />
    </View>
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
  camps: { gap: 4 },
  opcio: {
    flex: 1,
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  opcioActiva: { backgroundColor: colors.primari, borderColor: colors.primari },
  opcioText: { fontSize: 15, fontWeight: '600', color: colors.text },
  opcioTextActiu: { color: '#fff' },
  camp: {
    height: mides.toc,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
  },
  campText: { fontSize: 16, color: colors.text },
  enllac: { color: colors.primari, fontWeight: '600' },
  cicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
  },
  cicleActiu: { borderColor: colors.primari, backgroundColor: colors.primariFluix },
  cicleTitol: { fontSize: 16, fontWeight: '600', color: colors.text },
  bandaRodona: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandaNum: { fontSize: 16, fontWeight: '700', color: colors.primari },
  capcaleraSala: {
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
  filaPorcs: {
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
