/**
 * Avisos del sistema quan s'acaba el pinso (resposta F4: «uns dies abans»).
 *
 * Tot són notificacions locals, programades al mateix dispositiu a partir de
 * la previsió de `pinso.ts`. No hi ha servidor ni push: així funciona sense
 * connexió, com la resta de l'app.
 *
 * Dos casos, segons on cau la data d'avís (`dataEsgotament` menys `DIES_AVIS`):
 *  - Si encara és al futur, es programa perquè surti aquell dia.
 *  - Si ja hem entrat a la finestra d'avís (o ja s'ha passat), avisem de
 *    seguida: l'usuari no té perquè obrir l'app just quan toca, i per això
 *    existeix l'avís del sistema. Per no repetir el mateix avís cada cop que
 *    es recalcula la previsió, no en disparem un altre si ja n'hi ha un de
 *    visible a la safata de notificacions.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { DIES_AVIS, type Previsio } from './pinso';

const PREFIX_IDENTIFICADOR = 'pinso-';
const CANAL_ANDROID = 'pinso';
const DIA = 86400000;

if (Platform.OS !== 'web') {
  // Sense això, una notificació que arriba mentre l'app és oberta no es veu:
  // per defecte expo-notifications no la mostra si no li diem com fer-ho.
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

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
 * Cancel·la els avisos programats i en torna a programar (o dispara) un per
 * cada tipus que ha entrat a la finestra d'avís. Es crida cada cop que es
 * recalcula la previsió (en obrir l'app o després d'apuntar una entrega), així
 * que sempre reflecteix l'última estimació.
 */
export async function reprogramaAvisosPinso(
  tipus: { codi: string; descripcio: string | null; previsio: Previsio }[]
): Promise<void> {
  if (Platform.OS === 'web') return;
  if (!(await demanaPermisosNotificacions())) return;
  await configuraCanalAndroid();

  const presentades = await Notifications.getPresentedNotificationsAsync();

  await Promise.all(
    tipus.map(async (t) => {
      const identificador = `${PREFIX_IDENTIFICADOR}${t.codi}`;
      await Notifications.cancelScheduledNotificationAsync(identificador);

      const dies = t.previsio.diesRestants;
      if (dies == null) return;

      const contingut = {
        title: 'S’acaba el pinso',
        body: `${t.descripcio ?? t.codi}: ${
          dies <= 0
            ? 'segons el ritme habitual ja hauria d’haver arribat una entrega'
            : `queden uns ${Math.round(dies)} dies`
        }.`,
      };

      const diesFinsAvis = dies - DIES_AVIS;
      if (diesFinsAvis > 0) {
        const data = new Date(Date.now() + diesFinsAvis * DIA);
        data.setHours(9, 0, 0, 0);
        await Notifications.scheduleNotificationAsync({
          identifier: identificador,
          content: contingut,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: data,
            channelId: CANAL_ANDROID,
          },
        });
        return;
      }

      // Ja som a la finestra d'avís: si encara no l'ha vist (no hi ha cap
      // notificació d'aquest tipus a la safata), la disparem ara mateix.
      const jaAvisat = presentades.some(
        (n) => n.request.identifier === identificador
      );
      if (jaAvisat) return;

      await Notifications.scheduleNotificationAsync({
        identifier: identificador,
        content: contingut,
        trigger: null,
      });
    })
  );
}
