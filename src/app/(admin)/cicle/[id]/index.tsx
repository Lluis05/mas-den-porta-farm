import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  baixesDelCicle,
  esborraCicle,
  movimentsDelCicle,
  ocupacioDelCicle,
  resumCicle,
  type BaixaDelCicle,
  type CicleResum,
  type MovimentDelCicle,
  type OcupacioFila,
} from '@/db/queries';
import { SalaColapsable } from '@/components/sala-colapsable';
import { codiSala } from '@/lib/corrals';
import { colors, mides } from '@/theme';

export default function DetallCicle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const db = useSQLiteContext();
  const [resum, setResum] = useState<CicleResum | null>(null);
  const [ocupacio, setOcupacio] = useState<OcupacioFila[]>([]);
  const [baixes, setBaixes] = useState<BaixaDelCicle[]>([]);
  const [moviments, setMoviments] = useState<MovimentDelCicle[]>([]);
  const [confirmant, setConfirmant] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [salesObertes, setSalesObertes] = useState<Set<number>>(new Set());

  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        const [r, o, b, m] = await Promise.all([
          resumCicle(db, id),
          ocupacioDelCicle(db, id),
          baixesDelCicle(db, id),
          movimentsDelCicle(db, id),
        ]);
        if (!viu) return;
        setResum(r);
        setOcupacio(o);
        setBaixes(b);
        setMoviments(m);
      })();
      return () => {
        viu = false;
      };
    }, [db, id])
  );

  async function esborra() {
    try {
      await esborraCicle(db, id);
      router.replace('/inici');
    } catch (e) {
      setConfirmant(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  /** Agrupem els corrals per sala per poder escriure el codi de cada sala. */
  const perSala = useMemo(() => {
    const mapa = new Map<number, OcupacioFila[]>();
    for (const fila of ocupacio) {
      const llista = mapa.get(fila.sala);
      if (llista) llista.push(fila);
      else mapa.set(fila.sala, [fila]);
    }
    return [...mapa.entries()].sort((a, b) => a[0] - b[0]);
  }, [ocupacio]);

  if (!resum) {
    return (
      <View style={styles.centrat}>
        <Stack.Screen options={{ title: 'Cicle' }} />
        <Text style={styles.ajuda}>Carregant…</Text>
      </View>
    );
  }

  const queden = resum.porcs_entrada - resum.porcs_sortida;

  return (
    <>
      <Stack.Screen options={{ title: `Banda ${resum.banda}` }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          <Text style={styles.titol}>Cicle d&apos;engreix</Text>
          <Fila etiqueta="Banda" valor={String(resum.banda)} />
          <Fila etiqueta="Data d'entrada" valor={resum.data_entrada} />
          <Fila etiqueta="Porcs d'entrada" valor={String(resum.porcs_entrada)} />
          <Fila etiqueta="Han sortit" valor={String(resum.porcs_sortida)} />
          <Fila etiqueta="Queden" valor={String(queden)} destacat />
        </View>

        {resum.porcs_sortida > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Sortides</Text>
            <Fila
              etiqueta="Primera venda"
              valor={resum.data_primera_venda ?? '—'}
            />
            {/* Les baixes es dedueixen (entrada − sortides − sobrants), i això
                només vol dir res quan el cicle s'ha buidat. Mentre hi quedin
                porcs, la resta encara són porcs vius, no baixes. */}
            <Fila
              etiqueta="Edat primera venda"
              valor={
                resum.edat_primera_venda != null
                  ? `${resum.edat_primera_venda.toFixed(1)} setmanes`
                  : '—'
              }
            />
            {queden === 0 ? (
              <>
                <Fila
                  etiqueta="Baixes (per diferència)"
                  valor={String(resum.baixes)}
                />
                <Fila
                  etiqueta="% baixes"
                  valor={
                    resum.pct_baixes != null
                      ? `${(resum.pct_baixes * 100).toFixed(1)} %`
                      : '—'
                  }
                />
                <Text style={styles.ajuda}>
                  Les baixes es dedueixen: entrada − sortides − sobrants.
                </Text>
              </>
            ) : (
              <Text style={styles.ajuda}>
                Les baixes es podran calcular quan el cicle s&apos;hagi buidat:
                surten d&apos;entrada − sortides − sobrants, i ara mateix encara hi
                queden {queden} porcs vius.
              </Text>
            )}
          </View>
        )}

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>On són</Text>
          {perSala.map(([sala, files]) => {
            const codi = codiSala(
              sala,
              files.map((f) => ({ meitat: f.meitat, numero: f.corral }))
            );
            const entrats = files.reduce((s, f) => s + f.porcs_entrada, 0);
            const ara = files.reduce((s, f) => s + f.porcs_ara, 0);
            return (
              <SalaColapsable
                key={sala}
                sala={sala}
                codi={codi}
                resum={`${ara} porcs · ${files.length} corralines · hi van entrar ${entrats}`}
                oberta={salesObertes.has(sala)}
                onToggle={() =>
                  setSalesObertes((s) => {
                    const nou = new Set(s);
                    if (nou.has(sala)) nou.delete(sala);
                    else nou.add(sala);
                    return nou;
                  })
                }
              >
                <View style={styles.corrals}>
                  {files.map((f) => (
                    <View key={`${f.meitat}${f.corral}`} style={styles.corral}>
                      <Text style={styles.corralNom}>
                        {f.corral}
                        {f.meitat}
                      </Text>
                      <Text style={styles.corralPorcs}>{f.porcs_ara}</Text>
                    </View>
                  ))}
                </View>
              </SalaColapsable>
            );
          })}
        </View>

        {moviments.length > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Moviments</Text>
            {moviments.map((m) => (
              <View key={m.id} style={styles.filaMoviment}>
                <Text style={styles.movimentText}>
                  {m.data} · {m.num_porcs} porcs · sala {m.sala_origen} (corral{' '}
                  {m.corral_origen}
                  {m.meitat_origen}) → sala {m.sala_desti} (corral {m.corral_desti}
                  {m.meitat_desti})
                </Text>
                {m.motiu && <Text style={styles.ajuda}>{m.motiu}</Text>}
              </View>
            ))}
          </View>
        )}

        {baixes.length > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Baixes apuntades</Text>
            {baixes.map((b) => (
              <View key={b.id} style={styles.filaMoviment}>
                <Text style={styles.movimentText}>
                  {b.data} · {b.num_porcs} porcs · sala {b.sala} (corral {b.corral}
                  {b.meitat})
                </Text>
                {b.motiu && <Text style={styles.ajuda}>{b.motiu}</Text>}
              </View>
            ))}
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {!confirmant && (
          <Link href={`/cicle/${id}/moviment/nou`} asChild>
            <Pressable style={styles.botoSecundariLink} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Apuntar un moviment</Text>
            </Pressable>
          </Link>
        )}

        {confirmant ? (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>Esborrar aquest cicle?</Text>
            <Text style={styles.ajuda}>
              Deixarà de comptar i els seus porcs desapareixeran del recompte de
              la granja. Es podrà recuperar, perquè res s&apos;esborra del tot.
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
                <Text style={styles.botoText}>Sí, esborrar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.botons}>
            <Link href={`/cicle/${id}/editar`} asChild>
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
    </>
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

const styles = StyleSheet.create({
  centrat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  titol: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  titolSeccio: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.discret,
    marginBottom: 4,
  },
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
  ajuda: { fontSize: 13, color: colors.discret },
  blocSala: { paddingVertical: 8, gap: 6 },
  capcaleraSala: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
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
  filaMoviment: {
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  movimentText: { fontSize: 14, color: colors.text },
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
  botoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
