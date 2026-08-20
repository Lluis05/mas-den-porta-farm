import { Link, Stack, router } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAdmin } from '@/lib/admin';
import { colors, mides } from '@/theme';

const AMPLADA_PANEL = 280;

/**
 * Pantalla per defecte: la que veu qui treballa a la granja. Només hi ha
 * una cosa a fer-hi, apuntar una baixa — tota la resta (cicles, pinso,
 * càrregues…) queda darrere del PIN, obert amb el botó d'hamburguesa.
 */
export default function InicioTreballador() {
  const admin = useAdmin();
  const [panelVisible, setPanelVisible] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  // El Modal de React Native només sap lliscar cap amunt des de baix; per
  // entrar des del lateral s'anima el panell a mà amb translateX i el Modal
  // només fa de fons/overlay (animationType="fade").
  const translateX = useRef(new Animated.Value(AMPLADA_PANEL)).current;

  function obrePanel() {
    setPanelVisible(true);
    Animated.timing(translateX, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }

  function tancaPanel() {
    Animated.timing(translateX, {
      toValue: AMPLADA_PANEL,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setPanelVisible(false);
      setPin('');
      setError(false);
    });
  }

  function prova() {
    if (admin.desbloqueja(pin)) {
      tancaPanel();
      router.replace('/inici');
    } else {
      setError(true);
    }
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Granja',
          headerRight: () => (
            <Pressable
              onPress={obrePanel}
              accessibilityRole="button"
              accessibilityLabel="Obrir menú"
              hitSlop={12}
            >
              <Text style={styles.hamburguesa}>☰</Text>
            </Pressable>
          ),
        }}
      />
      <View style={styles.pagina}>
        <Text style={styles.titol}>Què vols fer?</Text>
        <Link href="/baixa/nova" asChild>
          <Pressable style={styles.botoPrincipal} accessibilityRole="button">
            <Text style={styles.botoText}>Apuntar una baixa</Text>
          </Pressable>
        </Link>
      </View>

      <Modal
        visible={panelVisible}
        transparent
        animationType="fade"
        onRequestClose={tancaPanel}
      >
        <Pressable style={styles.fons} onPress={tancaPanel} />
        <Animated.View style={[styles.panel, { transform: [{ translateX }] }]}>
          <Text style={styles.panelTitol}>Entrar-hi</Text>
          <Text style={styles.panelAjuda}>PIN per veure la resta de l&apos;app</Text>
          <TextInput
            style={styles.pinInput}
            value={pin}
            onChangeText={(t) => {
              setPin(t);
              setError(false);
            }}
            keyboardType="number-pad"
            secureTextEntry
            autoFocus
            maxLength={8}
            onSubmitEditing={prova}
          />
          {error && <Text style={styles.errorText}>PIN incorrecte</Text>}
          <Pressable style={styles.botoPrincipal} onPress={prova} accessibilityRole="button">
            <Text style={styles.botoText}>Entrar</Text>
          </Pressable>
          <Pressable onPress={tancaPanel} accessibilityRole="button">
            <Text style={styles.cancela}>Cancel·la</Text>
          </Pressable>
        </Animated.View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pagina: {
    flex: 1,
    padding: mides.espai,
    alignItems: 'center',
    justifyContent: 'center',
    gap: mides.espai * 2,
    backgroundColor: colors.fons,
  },
  titol: { fontSize: 20, fontWeight: '700', color: colors.text },
  botoPrincipal: {
    height: 64,
    minWidth: 240,
    paddingHorizontal: mides.espai * 2,
    borderRadius: mides.radi,
    backgroundColor: colors.primari,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botoText: { color: '#fff', fontSize: 19, fontWeight: '600' },
  hamburguesa: { fontSize: 24, color: colors.primari, paddingHorizontal: 4 },
  fons: { flex: 1, backgroundColor: 'rgba(0,0,0,0.3)' },
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: AMPLADA_PANEL,
    maxWidth: '85%',
    backgroundColor: colors.targeta,
    padding: mides.espai * 1.5,
    gap: mides.espai,
    justifyContent: 'center',
  },
  panelTitol: { fontSize: 18, fontWeight: '700', color: colors.text },
  panelAjuda: { fontSize: 13, color: colors.discret },
  pinInput: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.vora,
    borderRadius: mides.radi,
    height: mides.toc,
    paddingHorizontal: mides.espai,
    fontSize: 20,
    letterSpacing: 4,
    backgroundColor: colors.fons,
    color: colors.text,
  },
  errorText: { color: colors.perill, fontSize: 13 },
  cancela: {
    textAlign: 'center',
    color: colors.discret,
    fontSize: 14,
    paddingVertical: 8,
  },
});
