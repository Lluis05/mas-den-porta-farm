import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
  albaraJaApuntat,
  articlesProveidor,
  creaEntregaPinso,
  desaArticleProveidor,
  tipusPinsoAmbEntregues,
  type TipusAmbEntregues,
} from '@/db/queries';
import { analitzaAlbara, type AlbaraLlegit } from '@/lib/albara';
import { llegeixFoto, ocrDisponible } from '@/lib/ocr';
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

function deIso(iso: string | null): Date {
  if (!iso) return new Date();
  const [a, m, d] = iso.split('-').map(Number);
  const data = new Date(a, (m ?? 1) - 1, d ?? 1);
  return Number.isNaN(data.getTime()) ? new Date() : data;
}

/** Una línia de l'albarà tal com queda a la pantalla, ja editable. */
type LiniaEditable = {
  codiArticle: string;
  lot: string | null;
  kg: string;
  tipusPinsoId: string | null;
  /** Si el codi ja el teníem lligat a un tipus abans d'aquesta foto. */
  jaSabut: boolean;
  /** Si porta complement medicamentós per recepta. Es pot corregir a mà. */
  medicat: boolean;
  /** Codi de la prescripció, si s'ha llegit. Només informatiu. */
  prescripcio: string | null;
};

/**
 * Llegir un albarà de pinso amb una foto.
 *
 * El que fa l'app és omplir el formulari, no desar sol. Tot el que surt de la
 * foto es pot corregir abans d'apuntar-ho: l'OCR encerta molt sovint però no
 * sempre, i aquí no es pot esborrar res un cop desat.
 *
 * L'única cosa que la foto no pot resoldre és quin pinso és cada article: el
 * codi del proveïdor (`PTCGD`) no té res a veure amb els nostres (`GESTACIO`).
 * El primer cop es pregunta i es recorda; el segon albarà del mateix proveïdor
 * ja ve tot omplert.
 */
export default function FotoAlbara() {
  const db = useSQLiteContext();

  const [tipus, setTipus] = useState<TipusAmbEntregues[]>([]);
  const [disponible] = useState(() => ocrDisponible());

  const [foto, setFoto] = useState<string | null>(null);
  const [llegint, setLlegint] = useState(false);
  const [llegit, setLlegit] = useState<AlbaraLlegit | null>(null);

  const [data, setData] = useState(new Date());
  const [mostrarCalendari, setMostrarCalendari] = useState(false);
  const [linies, setLinies] = useState<LiniaEditable[]>([]);
  const [duplicat, setDuplicat] = useState<{ data: string; kg: number } | null>(
    null
  );
  const [forcar, setForcar] = useState(false);
  const [desant, setDesant] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let viu = true;
    tipusPinsoAmbEntregues(db).then((t) => viu && setTipus(t));
    return () => {
      viu = false;
    };
  }, [db]);

  const processa = useCallback(
    async (uri: string) => {
      setFoto(uri);
      setLlegint(true);
      setError(null);
      setLlegit(null);
      setLinies([]);
      setDuplicat(null);
      setForcar(false);

      try {
        const paraules = await llegeixFoto(uri);
        const albara = analitzaAlbara(paraules);
        setLlegit(albara);
        setData(deIso(albara.data));

        const sabuts = await articlesProveidor(db);
        const mapa = new Map(sabuts.map((a) => [a.codi, a.tipus_pinso_id]));

        setLinies(
          albara.linies.map((l) => ({
            codiArticle: l.codiArticle,
            lot: l.lot,
            kg: l.kg == null ? '' : String(Math.round(l.kg)),
            tipusPinsoId: mapa.get(l.codiArticle) ?? null,
            jaSabut: mapa.has(l.codiArticle),
            medicat: l.medicat,
            prescripcio: l.prescripcio,
          }))
        );

        if (albara.numero) {
          setDuplicat(await albaraJaApuntat(db, albara.numero));
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLlegint(false);
      }
    },
    [db]
  );

  async function ferFoto() {
    const permis = await ImagePicker.requestCameraPermissionsAsync();
    if (!permis.granted) {
      setError('Cal donar permís de càmera per llegir albarans.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync({ quality: 1, exif: false });
    if (!r.canceled && r.assets[0]) await processa(r.assets[0].uri);
  }

  async function triarFoto() {
    const r = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (!r.canceled && r.assets[0]) await processa(r.assets[0].uri);
  }

  function canviaLinia(i: number, canvi: Partial<LiniaEditable>) {
    setLinies((ll) => ll.map((l, j) => (i === j ? { ...l, ...canvi } : l)));
  }

  const completes = linies.filter(
    (l) => l.tipusPinsoId !== null && (parseInt(l.kg, 10) || 0) > 0
  );
  const incompletes = linies.length - completes.length;
  const total = completes.reduce((s, l) => s + (parseInt(l.kg, 10) || 0), 0);
  const potDesar =
    completes.length > 0 && !desant && (duplicat === null || forcar);

  async function desa() {
    setDesant(true);
    setError(null);
    try {
      for (const l of completes) {
        await creaEntregaPinso(db, {
          data: aIso(data),
          tipusPinsoId: l.tipusPinsoId as string,
          kg: parseInt(l.kg, 10),
          albara: llegit?.numero ?? null,
          medicat: l.medicat,
          prescripcio: l.prescripcio,
        });
        // Recordem l'equivalència perquè el pròxim albarà ja vingui omplert.
        if (!l.jaSabut) {
          await desaArticleProveidor(db, l.codiArticle, l.tipusPinsoId as string);
        }
      }
      router.replace('/pinso');
    } catch (e) {
      setDesant(false);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // -------------------------------------------------------------------------
  // Sense mòdul natiu (Expo Go, web) no hi ha res a fer aquí.
  // -------------------------------------------------------------------------
  if (!disponible) {
    return (
      <ScrollView contentContainerStyle={styles.pagina}>
        <Stack.Screen options={{ title: 'Llegir un albarà' }} />
        <View style={styles.targeta}>
          <Text style={styles.titolSeccio}>Aquí encara no funciona</Text>
          <Text style={styles.ajuda}>
            Llegir la foto es fa dins del telèfon, i això demana la versió de
            l&apos;app instal·lada (la development build). Amb Expo Go o des de
            l&apos;ordinador no hi ha manera.
          </Text>
          <Text style={styles.ajuda}>
            Mentrestant, l&apos;entrega es pot apuntar a mà.
          </Text>
        </View>
        <Pressable
          onPress={() => router.replace('/pinso/nova')}
          accessibilityRole="button"
          style={styles.botoPrincipal}
        >
          <Text style={styles.botoText}>Apuntar-la a mà</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Stack.Screen options={{ title: 'Llegir un albarà' }} />
      <ScrollView contentContainerStyle={styles.pagina} keyboardShouldPersistTaps="handled">
        {!foto && (
          <View style={styles.targeta}>
            <Text style={styles.titolSeccio}>Com va</Text>
            <Text style={styles.ajuda}>
              Fes una foto de l&apos;albarà sencer, ben pla i amb llum. L&apos;app
              n&apos;omple la data i els quilos, i tu ho repasses abans d&apos;apuntar-ho.
            </Text>
          </View>
        )}

        <View style={styles.botonera}>
          <Pressable onPress={ferFoto} accessibilityRole="button" style={styles.botoPrincipal}>
            <Text style={styles.botoText}>{foto ? 'Una altra foto' : 'Fer una foto'}</Text>
          </Pressable>
          <Pressable onPress={triarFoto} accessibilityRole="button" style={styles.botoSecundari}>
            <Text style={styles.botoSecundariText}>Triar-ne una</Text>
          </Pressable>
        </View>

        {foto && (
          <Image
            source={{ uri: foto }}
            style={styles.foto}
            resizeMode="contain"
            accessibilityLabel="Foto de l’albarà"
          />
        )}

        {llegint && (
          <View style={styles.carregant}>
            <ActivityIndicator />
            <Text style={styles.ajuda}>Llegint l&apos;albarà…</Text>
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {llegit && !llegint && linies.length === 0 && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>No s&apos;hi ha trobat cap línia</Text>
            <Text style={styles.textAvis}>
              Prova de fer la foto més de prop i ben plana, o apunta
              l&apos;entrega a mà.
            </Text>
          </View>
        )}

        {duplicat && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>Aquest albarà ja està apuntat</Text>
            <Text style={styles.textError}>
              L&apos;albarà {llegit?.numero} ja consta del {duplicat.data} amb{' '}
              {Math.round(duplicat.kg)} kg. Si l&apos;apuntes un altre cop, el
              pinso quedarà comptat dues vegades.
            </Text>
            {!forcar && (
              <Pressable
                onPress={() => setForcar(true)}
                accessibilityRole="button"
                style={styles.botoPerill}
              >
                <Text style={styles.botoText}>Apuntar-lo igualment</Text>
              </Pressable>
            )}
          </View>
        )}

        {linies.length > 0 && (
          <>
            <View style={styles.targeta}>
              <View style={styles.filaTotal}>
                <Text style={styles.titolSeccio}>Data de l&apos;entrega</Text>
                {llegit?.numero && (
                  <Text style={styles.ajuda}>Albarà {llegit.numero}</Text>
                )}
              </View>
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
              {!llegit?.data && (
                <Text style={styles.ajuda}>
                  La data no s&apos;ha pogut llegir de la foto: comprova-la.
                </Text>
              )}
            </View>

            {linies.map((l, i) => (
              <View key={`${l.codiArticle}-${i}`} style={styles.targeta}>
                <View style={styles.filaTotal}>
                  <View style={styles.flex}>
                    <Text style={styles.codi}>{l.codiArticle}</Text>
                    {l.lot && <Text style={styles.ajuda}>Lot {l.lot}</Text>}
                  </View>
                  <TextInput
                    value={l.kg}
                    onChangeText={(t) =>
                      canviaLinia(i, { kg: t.replace(/[^0-9]/g, '') })
                    }
                    keyboardType="number-pad"
                    placeholder="kg"
                    placeholderTextColor={colors.discret}
                    style={styles.input}
                    accessibilityLabel={`Quilos de ${l.codiArticle}`}
                  />
                </View>

                <Pressable
                  onPress={() => canviaLinia(i, { medicat: !l.medicat })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: l.medicat }}
                  style={l.medicat ? styles.avisMedicatActiu : styles.avisMedicat}
                >
                  <Text
                    style={
                      l.medicat ? styles.avisMedicatTextActiu : styles.avisMedicatText
                    }
                  >
                    {l.medicat ? '💊 Pinso medicat' : 'Marcar com a medicat'}
                  </Text>
                </Pressable>
                {l.medicat && l.prescripcio && (
                  <Text style={styles.ajuda}>Prescripció {l.prescripcio}</Text>
                )}

                <Text style={styles.titolSeccio}>
                  {l.jaSabut ? 'Tipus de pinso' : 'Quin pinso és aquest codi?'}
                </Text>
                <View style={styles.xips}>
                  {tipus.map((t) => {
                    const triat = l.tipusPinsoId === t.id;
                    return (
                      <Pressable
                        key={t.id}
                        onPress={() =>
                          canviaLinia(i, { tipusPinsoId: triat ? null : t.id })
                        }
                        accessibilityRole="button"
                        accessibilityState={{ selected: triat }}
                        style={triat ? styles.xipTriat : styles.xip}
                      >
                        <Text style={triat ? styles.xipTextTriat : styles.xipText}>
                          {t.codi}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {!l.jaSabut && l.tipusPinsoId && (
                  <Text style={styles.ajuda}>
                    Es recordarà: el pròxim albarà amb {l.codiArticle} ja vindrà
                    omplert.
                  </Text>
                )}
              </View>
            ))}

            <View style={styles.targeta}>
              <View style={styles.filaTotal}>
                <Text style={styles.etiqueta}>Total a apuntar</Text>
                <Text style={styles.total}>{total} kg</Text>
              </View>
              {llegit?.total != null && (
                <Text style={llegit.quadra ? styles.textOk : styles.textAvis}>
                  {llegit.quadra
                    ? `Quadra amb el total de l’albarà (${Math.round(llegit.total)} kg).`
                    : `A l’albarà hi diu ${Math.round(llegit.total)} kg. Repassa-ho.`}
                </Text>
              )}
              {incompletes > 0 && (
                <Text style={styles.textAvis}>
                  {incompletes === 1
                    ? 'Hi ha 1 línia sense quilos o sense tipus: no s’apuntarà.'
                    : `Hi ha ${incompletes} línies sense quilos o sense tipus: no s’apuntaran.`}
                </Text>
              )}
            </View>

            <Pressable
              onPress={desa}
              disabled={!potDesar}
              accessibilityRole="button"
              style={[styles.botoPrincipal, !potDesar && styles.botoApagat]}
            >
              <Text style={styles.botoText}>
                {desant
                  ? 'Desant…'
                  : completes.length === 1
                    ? 'Apuntar 1 entrega'
                    : `Apuntar ${completes.length} entregues`}
              </Text>
            </Pressable>
          </>
        )}
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
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  titolError: { fontSize: 15, fontWeight: '700', color: colors.perill },
  textError: { color: colors.perill },
  titolAvis: { fontSize: 15, fontWeight: '700', color: colors.avis },
  textAvis: { color: colors.avis },
  textOk: { color: colors.ok },
  titolSeccio: { fontSize: 13, fontWeight: '600', color: colors.discret },
  ajuda: { fontSize: 13, color: colors.discret },
  botonera: { flexDirection: 'row', gap: mides.espai },
  foto: {
    width: '100%',
    height: 220,
    borderRadius: mides.radi,
    backgroundColor: colors.vora,
  },
  carregant: { alignItems: 'center', gap: 8, paddingVertical: 20 },
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
  codi: { fontSize: 17, fontWeight: '700', color: colors.text },
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
  xips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingTop: 2 },
  xip: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.vora,
    backgroundColor: colors.targeta,
  },
  xipTriat: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.primari,
    backgroundColor: colors.primariFluix,
  },
  xipText: { fontSize: 14, color: colors.text },
  xipTextTriat: { fontSize: 14, color: colors.primari, fontWeight: '700' },
  avisMedicat: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.vora,
    backgroundColor: colors.targeta,
  },
  avisMedicatActiu: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.avis,
    backgroundColor: colors.avisFluix,
  },
  avisMedicatText: { fontSize: 13, color: colors.discret },
  avisMedicatTextActiu: { fontSize: 13, color: colors.avis, fontWeight: '700' },
  filaTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  etiqueta: { fontSize: 15, color: colors.text },
  total: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  botoPrincipal: {
    flex: 1,
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSecundari: {
    flex: 1,
    height: 52,
    borderRadius: mides.radi,
    borderWidth: 1,
    borderColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSecundariText: { color: colors.primari, fontSize: 16, fontWeight: '600' },
  botoPerill: {
    height: mides.toc,
    borderRadius: mides.radi,
    backgroundColor: colors.perill,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  botoApagat: { backgroundColor: colors.discret },
  botoText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
