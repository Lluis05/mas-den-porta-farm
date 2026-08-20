import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DATABASE_NAME, initDatabase } from '@/db';
import { AdminProvider } from '@/lib/admin';
import { colors } from '@/theme';

/**
 * SQLiteProvider obre la base de dades un sol cop i la deixa disponible
 * a totes les pantalles. `onInit` crea les taules la primera vegada.
 *
 * AdminProvider hi va per sobre de l'Stack: la pantalla per defecte
 * ("/") és la de treballador, i el grup (admin) — tota la resta —
 * comprova aquest context i rebota cap a "/" si no s'ha desbloquejat
 * amb el PIN.
 */
export default function RootLayout() {
  return (
    <Suspense fallback={<Carregant />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} useSuspense>
        <AdminProvider>
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.targeta },
              headerTintColor: colors.primari,
              headerTitleStyle: { color: colors.text },
              contentStyle: { backgroundColor: colors.fons },
            }}
          >
            {/* El grup (admin) porta el seu propi <Stack> (vegeu el seu
                _layout.tsx) amb un header per pantalla; sense això hi
                hauria dues barres de header una sobre l'altra. */}
            <Stack.Screen name="(admin)" options={{ headerShown: false }} />
          </Stack>
        </AdminProvider>
      </SQLiteProvider>
    </Suspense>
  );
}

function Carregant() {
  return (
    <View style={styles.centrat}>
      <ActivityIndicator size="large" />
      <Text style={styles.text}>Preparant la base de dades…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  centrat: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  text: { color: '#666' },
});
