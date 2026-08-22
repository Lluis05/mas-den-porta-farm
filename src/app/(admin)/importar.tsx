import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  desfesImportacio,
  importaDades,
  importacioAnterior,
  jaImportat,
  resumDelFitxer,
  type ImportacioAnterior,
  type ImportacioFeta,
  type ResumImportacio,
} from '@/db/importacio';
import { colors, mides } from '@/theme';

export default function Importar() {
  const db = useSQLiteContext();
  const [resum] = useState<ResumImportacio>(() => resumDelFitxer());
  const [fet, setFet] = useState<ImportacioFeta | null | undefined>(undefined);
  // Importació d'un fitxer VELL (Excel corregit rebut, npm run importar
  // reexecutat): jaImportat() no la troba perquè compara pel `generat`
  // d'ara. Sense detectar-la a part, tornar a importar la duplicaria.
  const [anterior, setAnterior] = useState<ImportacioAnterior | null | undefined>(
    undefined
  );
  const [important, setImportant] = useState(false);
  const [problemes, setProblemes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmant, setConfirmant] = useState(false);
  const [confirmantAnterior, setConfirmantAnterior] = useState(false);
  const [desfetes, setDesfetes] = useState<number | null>(null);

  useEffect(() => {
    let viu = true;
    jaImportat(db).then((v) => viu && setFet(v));
    importacioAnterior(db).then((v) => viu && setAnterior(v));
    return () => {
      viu = false;
    };
  }, [db]);

  async function desfes() {
    if (!fet) return;
    setImportant(true);
    setError(null);
    try {
      const files = await desfesImportacio(db, fet.id);
      setDesfetes(files);
      setFet(null);
      setProblemes(null);
      setConfirmant(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportant(false);
    }
  }

  async function desfesAnterior() {
    if (!anterior) return;
    setImportant(true);
    setError(null);
    try {
      const files = await desfesImportacio(db, anterior.id);
      setDesfetes(files);
      setAnterior(null);
      setConfirmantAnterior(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportant(false);
    }
  }

  async function importa() {
    setImportant(true);
    setError(null);
    try {
      const p = await importaDades(db);
      setProblemes(p);
      setDesfetes(null);
      setFet(await jaImportat(db));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setImportant(false);
    }
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Importar de l’Excel' }} />
      <ScrollView contentContainerStyle={styles.pagina}>
        <View style={styles.targeta}>
          <Text style={styles.titol}>Què s&apos;importarà</Text>
          <Fila etiqueta="Entregues de pinso" valor={resum.entreguesPinso} />
          <Fila etiqueta="Factures de pinso" valor={resum.facturesPinso} />
          <Fila etiqueta="Deslletaments" valor={resum.deslletaments} />
          <Fila etiqueta="Cicles d'engreix" valor={resum.cicles} />
          <Fila etiqueta="Càrregues a escorxador" valor={resum.carregues} />
          <Fila etiqueta="Sortides per sala" valor={resum.liniesCarrega} />
          <Fila etiqueta="Entrades de llavores" valor={resum.llavores} />
          <Text style={styles.ajuda}>
            Fitxer preparat el {resum.generat.slice(0, 10)}. Per actualitzar-lo,
            executa «npm run importar» a l&apos;ordinador.
          </Text>
        </View>

        {resum.avisos.length > 0 && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>
              {resum.avisos.length} coses a revisar a l&apos;Excel
            </Text>
            {resum.avisos.map((a) => (
              <Text key={a} style={styles.textAvis}>
                · {a}
              </Text>
            ))}
            <Text style={styles.ajuda}>
              No impedeixen importar. Les dades s&apos;importen tal com estan.
            </Text>
          </View>
        )}

        {error && (
          <View style={[styles.targeta, styles.targetaError]}>
            <Text style={styles.titolError}>No s&apos;ha pogut importar</Text>
            <Text style={styles.textError}>{error}</Text>
          </View>
        )}

        {problemes && (
          <View style={styles.targeta}>
            <Text style={styles.titol}>Fet</Text>
            {problemes.length === 0 ? (
              <Text style={styles.ajuda}>Tot s&apos;ha importat sense problemes.</Text>
            ) : (
              <>
                <Text style={styles.textAvis}>
                  {problemes.length} coses no s&apos;han pogut importar:
                </Text>
                {problemes.slice(0, 20).map((p) => (
                  <Text key={p} style={styles.textAvis}>
                    · {p}
                  </Text>
                ))}
              </>
            )}
            <Pressable
              onPress={() => router.replace('/inici')}
              style={styles.botoPrincipal}
              accessibilityRole="button"
            >
              <Text style={styles.botoText}>Anar a la granja</Text>
            </Pressable>
          </View>
        )}

        {desfetes != null && (
          <View style={styles.targeta}>
            <Text style={styles.titol}>Importació desfeta</Text>
            <Text style={styles.ajuda}>
              S&apos;han tret {desfetes} files. La granja ha quedat com estava
              abans d&apos;importar. Es pot tornar a importar quan vulguis.
            </Text>
          </View>
        )}

        {(fet === undefined || anterior === undefined) && (
          <Text style={styles.ajuda}>Comprovant…</Text>
        )}

        {anterior && (
          <View style={[styles.targeta, styles.targetaAvis]}>
            <Text style={styles.titolAvis}>Hi ha una importació d&apos;un fitxer diferent</Text>
            <Text style={styles.ajuda}>
              Es va importar un altre fitxer el {anterior.fet_el.slice(0, 10)} i encara
              hi és. Cal desfer-la abans de tornar a importar, si no les dades es
              duplicarien.
            </Text>
            {confirmantAnterior ? (
              <View style={styles.botons}>
                <Pressable
                  onPress={() => setConfirmantAnterior(false)}
                  style={[styles.boto, styles.botoSecundari]}
                  accessibilityRole="button"
                >
                  <Text style={styles.botoSecundariText}>No</Text>
                </Pressable>
                <Pressable
                  onPress={desfesAnterior}
                  disabled={important}
                  style={[styles.boto, styles.botoPerill]}
                  accessibilityRole="button"
                >
                  <Text style={styles.botoText}>
                    {important ? 'Desfent…' : 'Sí, desfer'}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmantAnterior(true)}
                style={[styles.boto, styles.botoSecundari, styles.botoSol]}
                accessibilityRole="button"
              >
                <Text style={styles.botoPerillText}>Desfer aquesta importació</Text>
              </Pressable>
            )}
          </View>
        )}

        {fet === null && !anterior && !problemes && (
          <Pressable
            onPress={importa}
            disabled={important}
            accessibilityRole="button"
            style={[styles.botoPrincipal, important && styles.botoApagat]}
          >
            <Text style={styles.botoText}>
              {important ? 'Important…' : 'Importar ara'}
            </Text>
          </Pressable>
        )}

        {fet && (
          <View style={styles.targeta}>
            <Text style={styles.ajuda}>
              Aquest fitxer ja s&apos;ha importat ({fet.fet_el.slice(0, 10)}). No es
              tornarà a importar per no duplicar res.
            </Text>

            {confirmant ? (
              <>
                <Text style={styles.titolAvis}>Desfer la importació?</Text>
                <Text style={styles.ajuda}>
                  Es traurà tot el que va entrar amb aquesta importació. El que
                  hagis introduït tu a mà des de l&apos;app no es toca.
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
                    onPress={desfes}
                    disabled={important}
                    style={[styles.boto, styles.botoPerill]}
                    accessibilityRole="button"
                  >
                    <Text style={styles.botoText}>
                      {important ? 'Desfent…' : 'Sí, desfer'}
                    </Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <Pressable
                onPress={() => setConfirmant(true)}
                style={[styles.boto, styles.botoSecundari, styles.botoSol]}
                accessibilityRole="button"
              >
                <Text style={styles.botoPerillText}>Desfer la importació</Text>
              </Pressable>
            )}
          </View>
        )}
      </ScrollView>
    </>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: number }) {
  return (
    <View style={styles.fila}>
      <Text style={styles.etiqueta}>{etiqueta}</Text>
      <Text style={styles.valor}>{valor}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pagina: { padding: mides.espai, gap: mides.espai, paddingBottom: 40 },
  targeta: {
    backgroundColor: colors.targeta,
    borderRadius: mides.radi,
    padding: mides.espai,
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  targetaAvis: { backgroundColor: colors.avisFluix, borderColor: colors.avis },
  targetaError: { backgroundColor: colors.perillFluix, borderColor: colors.perill },
  titol: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  titolAvis: { fontSize: 15, fontWeight: '700', color: colors.avis },
  titolError: { fontSize: 16, fontWeight: '700', color: colors.perill },
  textAvis: { color: colors.avis, fontSize: 13 },
  textError: { color: colors.perill },
  ajuda: { fontSize: 13, color: colors.discret, marginTop: 6 },
  fila: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  etiqueta: { color: colors.text },
  valor: { fontWeight: '600', fontVariant: ['tabular-nums'] },
  botoPrincipal: {
    height: 52,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  botoApagat: { backgroundColor: colors.discret },
  botoText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  botons: { flexDirection: 'row', gap: mides.espai, marginTop: 8 },
  boto: {
    flex: 1,
    height: 48,
    borderRadius: mides.radi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoSol: { marginTop: 12 },
  botoSecundari: {
    backgroundColor: colors.targeta,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
  },
  botoSecundariText: { fontSize: 16, fontWeight: '600', color: colors.primari },
  botoPerill: { backgroundColor: colors.perill },
  botoPerillText: { fontSize: 16, fontWeight: '600', color: colors.perill },
});
