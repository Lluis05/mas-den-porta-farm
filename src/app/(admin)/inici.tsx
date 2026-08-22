import { Link, Stack, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  llistaCarregues,
  llistaCicles,
  porcsALaGranja,
  tipusPinsoAmbEntregues,
  type CarregaLlista,
  type CicleLlista,
} from '@/db/queries';
import { useAdmin } from '@/lib/admin';
import { calculaPrevisio, dadesEndarrerides, urgencia } from '@/lib/pinso';
import { reprogramaAvisosPinso } from '@/lib/notificacions';
import { colors, mides } from '@/theme';

type AvisPinso = { codi: string; dies: number; urgent: boolean };

/** A la portada només hi caben els més recents; la resta van a l'historial. */
const N_PORTADA = 10;

export default function Index() {
  const db = useSQLiteContext();
  const admin = useAdmin();
  const [porcs, setPorcs] = useState<number | null>(null);
  const [cicles, setCicles] = useState<CicleLlista[]>([]);
  const [hiHaMesCicles, setHiHaMesCicles] = useState(false);
  const [carregues, setCarregues] = useState<CarregaLlista[]>([]);
  const [hiHaMesCarregues, setHiHaMesCarregues] = useState(false);
  const [avisosPinso, setAvisosPinso] = useState<AvisPinso[]>([]);
  const [pinsoEndarrerit, setPinsoEndarrerit] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // useFocusEffect i no useEffect: així es refresca en tornar d'una altra
  // pantalla, per exemple després de crear un cicle.
  useFocusEffect(
    useCallback(() => {
      let viu = true;
      (async () => {
        try {
          const [total, llista, carr, pinso] = await Promise.all([
            porcsALaGranja(db),
            llistaCicles(db, N_PORTADA + 1),
            llistaCarregues(db, N_PORTADA + 1),
            tipusPinsoAmbEntregues(db),
          ]);
          if (!viu) return;
          setPorcs(total);
          setHiHaMesCicles(llista.length > N_PORTADA);
          setCicles(llista.slice(0, N_PORTADA));
          setHiHaMesCarregues(carr.length > N_PORTADA);
          setCarregues(carr.slice(0, N_PORTADA));

          // Només surten a la portada els que s'acaben aviat: si sortissin
          // tots, deixaria de ser un avís.
          const dia = new Date().toISOString().slice(0, 10);
          // Si fa setmanes que no s'apunta cap entrega, l'avís no vol dir que
          // la granja s'hagi quedat sense pinso: vol dir que falten dades.
          const estatPinso = dadesEndarrerides(
            pinso.map((t) => t.entregues),
            dia
          );
          setPinsoEndarrerit(estatPinso?.endarrerit ?? false);
          const previsions = pinso.map((t) => ({
            ...t,
            previsio: calculaPrevisio(t.entregues, dia),
          }));
          setAvisosPinso(
            previsions
              .map((t) => ({ codi: t.codi, p: t.previsio }))
              .filter((x) => ['esgotat', 'aviat'].includes(urgencia(x.p)))
              .map((x) => ({
                codi: x.codi,
                dies: Math.round(x.p.diesRestants ?? 0),
                urgent: (x.p.diesRestants ?? 0) <= 0,
              }))
              .sort((a, b) => a.dies - b.dies)
          );
          setError(null);

          // Si falten entregues per apuntar, la previsió no és de fiar:
          // no en volem disparar avisos falsos.
          if (!estatPinso?.endarrerit) {
            reprogramaAvisosPinso(previsions);
          }
        } catch (e) {
          if (viu) setError(e instanceof Error ? e.message : String(e));
        }
      })();
      return () => {
        viu = false;
      };
    }, [db])
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Granja',
          headerRight: () => (
            <Pressable
              onPress={() => {
                admin.bloqueja();
                router.replace('/');
              }}
              accessibilityRole="button"
              hitSlop={12}
            >
              <Text style={styles.tancaSessio}>Tancar sessió</Text>
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={styles.pagina}>
        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>Error de base de dades</Text>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Porcs a la granja</Text>
          <Text style={styles.granTotal}>{porcs ?? '—'}</Text>
        </View>

        <View style={styles.botons}>
          <Link href="/panell" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Panell</Text>
            </Pressable>
          </Link>
          <Link href="/taules" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Totes les dades</Text>
            </Pressable>
          </Link>
        </View>

        {pinsoEndarrerit && (
          <Link href="/pinso" asChild>
            <Pressable
              style={styles.targetaAvisCard}
              accessibilityRole="button"
            >
              <Text style={styles.titolAvis}>Falten entregues de pinso</Text>
              <Text style={styles.textAvis}>
                Fa setmanes que no se n&apos;apunta cap, així que la previsió no
                és de fiar.
              </Text>
              <Text style={styles.ajuda}>Toca per apuntar-ne una ›</Text>
            </Pressable>
          </Link>
        )}

        {!pinsoEndarrerit && avisosPinso.length > 0 && (
          <Link href="/pinso" asChild>
            <Pressable
              style={styles.targetaAvisCard}
              accessibilityRole="button"
            >
              <Text style={styles.titolAvis}>S&apos;acaba el pinso</Text>
              {avisosPinso.map((a) => (
                <Text key={a.codi} style={styles.textAvis}>
                  · {a.codi}:{' '}
                  {a.urgent
                    ? `ja hauria d'haver arribat (fa ${Math.abs(a.dies)} dies)`
                    : `queden uns ${a.dies} dies`}
                </Text>
              ))}
              <Text style={styles.ajuda}>Toca per veure-ho tot ›</Text>
            </Pressable>
          </Link>
        )}

        <View style={styles.botons}>
          <Link href="/cicle/nou" asChild>
            <Pressable style={styles.botoPrincipal} accessibilityRole="button">
              <Text style={styles.botoText}>Nou cicle</Text>
            </Pressable>
          </Link>
          <Link href="/carrega/nova" asChild>
            <Pressable style={styles.botoPrincipal} accessibilityRole="button">
              <Text style={styles.botoText}>Nova càrrega</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.botons}>
          <Link href="/pinso" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Pinso</Text>
            </Pressable>
          </Link>
          <Link href="/importar" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Importar de l&apos;Excel</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.botons}>
          <Link href="/llavors" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Llavores</Text>
            </Pressable>
          </Link>
          <Link href="/resum" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Resum trimestral</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.botons}>
          <Link href="/baixa/nova" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Apuntar una baixa</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.botons}>
          <Link href="/cens" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Cens de truges</Text>
            </Pressable>
          </Link>
          <Link href="/deslletament" asChild>
            <Pressable style={styles.botoSecundari} accessibilityRole="button">
              <Text style={styles.botoSecundariText}>Deslletaments</Text>
            </Pressable>
          </Link>
        </View>

        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Cicles</Text>
          {cicles.length === 0 && (
            <Text style={styles.ajuda}>
              Encara no n&apos;hi ha cap. Comença&apos;n un amb el botó de dalt.
            </Text>
          )}
          {cicles.map((c) => (
            <Link key={c.id} href={`/cicle/${c.id}`} asChild>
              <Pressable style={styles.filaCicle} accessibilityRole="button">
                <View style={styles.bandaRodona}>
                  <Text style={styles.bandaNum}>{c.banda}</Text>
                </View>
                <View style={styles.flex}>
                  <Text style={styles.cicleTitol}>
                    {c.queden} porcs · {c.num_corrals} corralines
                  </Text>
                  <Text style={styles.ajuda}>
                    Entrada {c.data_entrada} · {c.porcs_entrada} porcs
                    {c.porcs_sortida > 0 ? ` · han sortit ${c.porcs_sortida}` : ''}
                  </Text>
                </View>
                <Text style={styles.fletxa}>›</Text>
              </Pressable>
            </Link>
          ))}
          {hiHaMesCicles && (
            <Link href="/cicle" asChild>
              <Pressable accessibilityRole="button">
                <Text style={styles.veureMes}>Veure&apos;n més ›</Text>
              </Pressable>
            </Link>
          )}
        </View>

        {carregues.length > 0 && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Últimes càrregues</Text>
            {carregues.map((c) => (
              <Link key={c.id} href={`/carrega/${c.id}`} asChild>
                <Pressable style={styles.filaCicle} accessibilityRole="button">
                  <View style={styles.flex}>
                    <Text style={styles.cicleTitol}>
                      {c.data_carrega} · {c.unitats ?? c.porcs_linies}{' '}
                      {c.tipus === 'truges_rebuig' ? 'truges' : 'porcs'}
                    </Text>
                    <Text style={styles.ajuda}>
                      {c.promig_kg != null
                        ? `${c.promig_kg.toFixed(1)} kg de mitjana`
                        : 'falten les dades de la factura'}
                    </Text>
                  </View>
                  <Text style={styles.fletxa}>›</Text>
                </Pressable>
              </Link>
            ))}
            {hiHaMesCarregues && (
              <Link href="/carrega" asChild>
                <Pressable accessibilityRole="button">
                  <Text style={styles.veureMes}>Veure&apos;n més ›</Text>
                </Pressable>
              </Link>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  tancaSessio: { fontSize: 14, fontWeight: '600', color: colors.discret, paddingHorizontal: 4 },
  flex: { flex: 1 },
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  titolError: { fontSize: 16, fontWeight: '600', color: colors.perill },
  textError: { color: colors.perill },
  granTotal: {
    fontSize: 40,
    fontWeight: '700',
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  ajuda: { fontSize: 13, color: colors.discret },
  veureMes: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.primari,
    paddingVertical: 10,
    textAlign: 'center',
  },
  botons: { flexDirection: 'row', gap: mides.espai },
  botoPrincipal: {
    flex: 1,
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  // Un sol objecte, no [targeta, targetaAvis]: un Pressable dins d'un
  // Link asChild peta al web ("indexed property [0] on CSSStyleDeclaration")
  // si el seu style és un array. Amb un objecte sol no passa.
  targetaAvisCard: {
    backgroundColor: colors.avisFluix,
    borderColor: colors.avis,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
  },
  titolAvis: { fontSize: 16, fontWeight: '700', color: colors.avis },
  textAvis: { color: colors.avis, fontSize: 14 },
  botoSecundari: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSecundariText: { fontSize: 16, fontWeight: '600', color: colors.primari },
  filaCicle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  bandaRodona: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.primariFluix,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bandaNum: { fontSize: 17, fontWeight: '700', color: colors.primari },
  cicleTitol: { fontSize: 16, fontWeight: '600', color: colors.text },
  fletxa: { fontSize: 24, color: colors.discret },
});
