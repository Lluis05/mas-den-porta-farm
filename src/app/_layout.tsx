import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { DATABASE_NAME, initDatabase } from '@/db';

/**
 * SQLiteProvider obre la base de dades un sol cop i la deixa disponible
 * a totes les pantalles. `onInit` crea les taules la primera vegada.
 */
export default function RootLayout() {
  return (
    <Suspense fallback={<Carregant />}>
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={initDatabase} useSuspense>
        <Stack />
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
