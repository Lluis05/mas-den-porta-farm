import {
  Link,
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
} from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
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
  actualitzaFactura,
  decomisosDeCarrega,
  esborraCarrega,
  detallCarrega,
  liniesDeCarrega,
  type CarregaDetall,
  type Decomis,
  type LiniaCarrega,
} from '@/db/queries';
import { codiSala } from '@/lib/corrals';
import { colors, mides } from '@/theme';

function aNumero(text: string): number | null {
  const net = text.replace(',', '.').trim();
  if (net === '') return null;
  const n = Number(net);
  return Number.isFinite(n) ? n : null;
}

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

export default function DetallCarrega() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();

  const [carrega, setCarrega] = useState<CarregaDetall | null>(null);
  const [linies, setLinies] = useState<LiniaCarrega[]>([]);
  const [decomisos, setDecomisos] = useState<Decomis[]>([]);
  const [editant, setEditant] = useState(false);
  const [desant, setDesant] = useState(false);
  const [confirmant, setConfirmant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unitats, setUnitats] = useState('');
  const [kg, setKg] = useState('');
  const [kgCanal, setKgCanal] = useState('');
  const [totalFactura, setTotalFactura] = useState('');
  const [preuKg, setPreuKg] = useState('');
  const [preuRef, setPreuRef] = useState('');

  const carregaDades = useCallback(async () => {
    const [c, l, d] = await Promise.all([
      detallCarrega(db, id),
      liniesDeCarrega(db, id),
      decomisosDeCarrega(db, id),
    ]);
    setCarrega(c);
    setLinies(l);
    setDecomisos(d);
    if (c) {
      setUnitats(text(c.unitats));
      setKg(text(c.kg));
      setKgCanal(text(c.kg_canal));
      setTotalFactura(text(c.total_factura));
      setPreuKg(text(c.preu_kg));
      setPreuRef(text(c.preu_referencia));
    }
  }, [db, id]);

  useFocusEffect(
    useCallback(() => {
      carregaDades();
    }, [carregaDades])
  );

  const perSala = useMemo(() => {
    const mapa = new Map<number, LiniaCarrega[]>();
    for (const l of linies) {
      const llista = mapa.get(l.sala);
      if (llista) llista.push(l);
      else mapa.set(l.sala, [l]);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [linies]);

  const totalLinies = linies.reduce((s, l) => s + l.num_porcs, 0);

  async function desaFactura() {
    setDesant(true);
    try {
      await actualitzaFactura(db, id, {
        unitats: aNumero(unitats),
        kg: aNumero(kg),
        kgCanal: aNumero(kgCanal),
        totalFactura: aNumero(totalFactura),
        preuKg: aNumero(preuKg),
        preuReferencia: aNumero(preuRef),
      });
      await carregaDades();
      setEditant(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDesant(false);
    }
  }

  async function esborra() {
    try {
      await esborraCarrega(db, id);
      router.replace('/inici');
    } catch (e) {
      setConfirmant(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (!carrega) {
    return (
      <View style={styles.centrat}>
        <Stack.Screen options={{ title: 'Càrrega' }} />
        <Text style={styles.ajuda}>Carregant…</Text>
      </View>
    );
  }

  const esEngreix = carrega.tipus === 'porcs_engreix';
  const discrepancia =
    carrega.unitats != null && totalLinies > 0 && carrega.unitats !== totalLinies;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: carrega.data_carrega }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        <View style={styles.targeta}>
          <Text style={styles.titol}>
            {esEngreix ? 'Porcs d’engreix' : 'Truges de rebuig'}
          </Text>
          <Fila etiqueta="Data de càrrega" valor={carrega.data_carrega} />
          <Fila
            etiqueta="Unitats"
            valor={carrega.unitats != null ? String(carrega.unitats) : '—'}
          />
          <Fila
            etiqueta="Pes mitjà"
            valor={
              carrega.promig_kg != null ? `${carrega.promig_kg.toFixed(1)} kg` : '—'
            }
            destacat
          />
          <Fila
            etiqueta="Rendiment"
            valor={
              carrega.rendiment != null
                ? `${(carrega.rendiment * 100).toFixed(1)} %`
                : '—'
            }
          />
          <Fila
            etiqueta="Preu per kg"
            valor={carrega.preu_kg != null ? `${carrega.preu_kg} €` : '—'}
          />
          <Fila
            etiqueta="Diferència amb la referència"
            valor={
              carrega.diferencia != null ? `${carrega.diferencia.toFixed(3)} €` : '—'
            }
          />
          <Fila
            etiqueta="Total factura"
            valor={carrega.total_factura != null ? `${carrega.total_factura} €` : '—'}
          />
        </View>

        {discrepancia && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>Els números no quadren</Text>
            <Text style={styles.textAvis}>
              De les sales van sortir {totalLinies} porcs, però la factura en diu{' '}
              {carrega.unitats}.
            </Text>
          </View>
        )}

        {decomisos.length > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Decomisos</Text>
            {decomisos.map((d) => (
              <Fila
                key={d.codi}
                etiqueta={
                  d.codi === 'D4'
                    ? 'D4 · rebutjats a l’escorxador'
                    : 'D5 · morts al transport'
                }
                valor={String(d.num_porcs)}
              />
            ))}
          </View>
        )}

        {esEngreix && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>D&apos;on van sortir</Text>
            <Text style={styles.ajuda}>
              La data i el pes mitjà són els del camió: no s&apos;apunten per sala.
            </Text>
            {perSala.map(([sala, seus]) => {
              const codi = codiSala(
                sala,
                seus.map((l) => ({ meitat: l.meitat, numero: l.corral }))
              );
              const total = seus.reduce((s, l) => s + l.num_porcs, 0);
              return (
                <View key={sala} style={styles.blocSala}>
                  <View style={styles.capcalera}>
                    <Text style={styles.codi}>{codi}</Text>
                    <Text style={styles.porcsSala}>{total} porcs</Text>
                  </View>
                  <View style={styles.corrals}>
                    {seus.map((l) => (
                      <View key={`${l.meitat}${l.corral}`} style={styles.corral}>
                        <Text style={styles.corralNom}>
                          {l.corral}
                          {l.meitat}
                        </Text>
                        <Text style={styles.corralPorcs}>{l.num_porcs}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              );
            })}
          </View>
        )}

        <View style={styles.targeta}>
          <View style={styles.capcalera}>
            <Text style={styles.titolSeccio}>Dades de la factura</Text>
            <Pressable
              onPress={() => setEditant((v) => !v)}
              accessibilityRole="button"
            >
              <Text style={styles.enllac}>{editant ? 'Cancel·lar' : 'Editar'}</Text>
            </Pressable>
          </View>

          {editant ? (
            <View style={styles.camps}>
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
              <Pressable
                onPress={desaFactura}
                disabled={desant}
                accessibilityRole="button"
                style={[styles.botoPrincipal, desant && styles.botoApagat]}
              >
                <Text style={styles.botoText}>{desant ? 'Desant…' : 'Desar'}</Text>
              </Pressable>
            </View>
          ) : (
            <Text style={styles.ajuda}>
              {carrega.kg == null
                ? 'Encara no s’han posat. Es poden omplir des del despatx.'
                : `${carrega.kg} kg vius${
                    carrega.kg_canal != null ? ` · ${carrega.kg_canal} kg canal` : ''
                  }`}
            </Text>
          )}
        </View>

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {confirmant ? (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>Esborrar aquesta càrrega?</Text>
            <Text style={styles.ajuda}>
              Els porcs de les línies tornaran a comptar a les seves corralines.
              Es podrà recuperar, perquè res s&apos;esborra del tot.
            </Text>
            <View style={styles.botons}>
              <Pressable
                onPress={() => setConfirmant(false)}
                style={[styles.boto, styles.botoSecundari]}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>No</Text>
              </Pressable>
              <Pressable
                onPress={esborra}
                style={[styles.boto, styles.botoPerill]}
                accessibilityRole="button"
              >
                <Text style={styles.botoTextBlanc}>Sí, esborrar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.botons}>
            <Link href={`/carrega/${id}/editar`} asChild>
              <Pressable
                style={styles.botoSecundariLink}
                accessibilityRole="button"
              >
                <Text style={styles.botoSecundariText}>Editar</Text>
              </Pressable>
            </Link>
            <Pressable
              onPress={() => setConfirmant(true)}
              style={[styles.boto, styles.botoSecundari]}
              accessibilityRole="button"
            >
              <Text style={styles.botoPerillText}>Esborrar</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Fila({
  etiqueta,
  valor,
  destacat,
}: {
  etiqueta: string;
  valor: string;
  destacat?: boolean;
}) {
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={[styles.valor, destacat && styles.valorDestacat]}>{valor}</Text>
    </View>
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
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: mides.espaiTeclat },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  titol: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  titolAvis: { fontSize: 15, fontWeight: '600', color: colors.avis },
  textAvis: { color: colors.avis },
  ajuda: { fontSize: 13, color: colors.discret },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  etiqueta: { color: colors.text },
  valor: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  valorDestacat: { fontSize: 18, color: colors.primari },
  capcalera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  enllac: { color: colors.primari, fontWeight: '600' },
  camps: { gap: 4, marginTop: 8 },
  filaCamp: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 2,
  },
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
  blocSala: { paddingVertical: 8, gap: 6 },
  codi: { fontSize: 16, fontWeight: '700', color: colors.primari },
  porcsSala: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  corrals: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  corral: {
    minWidth: 52,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
  },
  corralNom: { fontSize: 12, color: colors.discret, fontWeight: '600' },
  corralPorcs: { fontSize: 16, fontWeight: '700', color: colors.text },
  botoPrincipal: {
    height: 48,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  botoApagat: { backgroundColor: colors.discret },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  titolError: { fontSize: 16, fontWeight: '700', color: colors.perill },
  textError: { color: colors.perill },
  botons: { flexDirection: 'row', gap: mides.espai, marginTop: 4 },
  boto: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSecundari: {
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  // Un sol objecte, no [boto, botoSecundari]: un Pressable dins d'un Link
  // asChild peta al web ("indexed property [0] on CSSStyleDeclaration")
  // si el seu style és un array. Amb un objecte sol no passa.
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
  botoPerill: { backgroundColor: colors.perill },
  botoPerillText: { fontSize: 16, fontWeight: '600', color: colors.perill },
  botoTextBlanc: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
