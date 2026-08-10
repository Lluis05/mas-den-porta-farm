import { Stack, router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

import { FormulariCicle } from '@/components/formulari-cicle';
import { creaCicle, type NouCicle } from '@/db/queries';

export default function NouCicleScreen() {
  const db = useSQLiteContext();

  async function desa(dades: NouCicle) {
    const cicleId = await creaCicle(db, dades);
    router.replace(`/cicle/${cicleId}`);
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Nou cicle d’engreix' }} />
      <FormulariCicle textBoto="Desar el cicle" onDesa={desa} />
    </>
  );
}
