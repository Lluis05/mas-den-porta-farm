/**
 * Avisos del sistema quan s'acaba el pinso (resposta F4: «uns dies abans»).
 *
 * Tot són notificacions locals, programades al mateix dispositiu a partir de
 * la previsió de `pinso.ts`. No hi ha servidor ni push: així funciona sense
 * connexió, com la resta de l'app.
 *
 * Només té sentit programar-ne quan la data d'avís (`dataEsgotament` menys
 * `DIES_AVIS`) encara és al futur: si l'estimació diu que l'avís ja hauria
 * d'haver sortit, l'usuari ja ho veu en obrir l'app (targeta a la portada);
 * un avís del sistema en aquest moment no aporta res.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DIES_AVIS, type Previsio } from './pinso';

const PREFIX_IDENTIFICADOR = 'pinso-';
const CANAL_ANDROID = 'pinso';
const DIA = 86400000;

export async function demanaPermisosNotificacions(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const actual = await Notifications.getPermissionsAsync();
  if (actual.granted) return true;
  const demanat = await Notifications.requestPermissionsAsync();
  return demanat.granted;
}

async function configuraCanalAndroid(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CANAL_ANDROID, {
    name: 'Pinso',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

/**
 * Cancel·la els avisos programats i en torna a programar un per cada tipus
 * que encara no ha arribat al llindar d'avís. Es crida cada cop que es
 * recalcula la previsió (en obrir l'app o després d'apuntar una entrega), així
 * que sempre reflecteix l'última estimació.
 */
export async function reprogramaAvisosPinso(
  tipus: { codi: string; descripcio: string | null; previsio: Previsio }[]
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await demanaPermisosNotificacions())) return;
  await configuraCanalAndroid();

  await Promise.all(
    tipus.map(async (t) => {
      const identificador = `${PREFIX_IDENTIFICADOR}${t.codi}`;
      await Notifications.cancelScheduledNotificationAsync(identificador);

      const dies = t.previsio.diesRestants;
      if (dies == null) return;

      const diesFinsAvis = dies - DIES_AVIS;
      if (diesFinsAvis <= 0) return;

      const data = new Date(Date.now() + diesFinsAvis * DIA);
      data.setHours(9, 0, 0, 0);

      await Notifications.scheduleNotificationAsync({
        identifier: identificador,
        content: {
          title: 'S’acaba el pinso',
          body: `${t.descripcio ?? t.codi}: queden uns ${DIES_AVIS} dies.`,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: data,
          channelId: CANAL_ANDROID,
        },
      });
    })
  );
}
