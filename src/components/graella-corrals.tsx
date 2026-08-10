import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Corral } from '@/db/queries';
import type { Meitat } from '@/lib/corrals';
import { colors, mides } from '@/theme';

type Props = {
  /** Els 12 corrals d'una sala. */
  corrals: Corral[];
  seleccionats: Set<string>;
  /** Corrals que ja tenen porcs d'un altre cicle: es marquen per avisar. */
  ocupats: Set<string>;
  onToggle: (corralId: string) => void;
  onToggleMeitat: (meitat: Meitat) => void;
};

/**
 * Les 12 corralines d'una sala: 6 a l'esquerra i 6 a la dreta.
 * Es toquen per marcar-les. No s'escriu cap número de corral.
 */
export function GraellaCorrals({
  corrals,
  seleccionats,
  ocupats,
  onToggle,
  onToggleMeitat,
}: Props) {
  return (
    <View style={styles.graella}>
      {(['E', 'D'] as const).map((meitat) => {
        const delaMeitat = corrals
          .filter((c) => c.meitat === meitat)
          .sort((a, b) => a.numero - b.numero);
        const totaSeleccionada =
          delaMeitat.length > 0 && delaMeitat.every((c) => seleccionats.has(c.id));

        return (
          <View key={meitat} style={styles.columna}>
            <Pressable
              onPress={() => onToggleMeitat(meitat)}
              style={styles.capcalera}
              accessibilityRole="button"
              accessibilityLabel={`Marcar tota la meitat ${
                meitat === 'E' ? 'esquerra' : 'dreta'
              }`}
            >
              <Text style={styles.titolMeitat}>
                {meitat === 'E' ? 'Esquerra' : 'Dreta'}
              </Text>
              <Text style={styles.accio}>
                {totaSeleccionada ? 'Treure' : 'Tota'}
              </Text>
            </Pressable>

            {delaMeitat.map((corral) => {
              const marcat = seleccionats.has(corral.id);
              const ocupat = ocupats.has(corral.id);
              return (
                <Pressable
                  key={corral.id}
                  onPress={() => onToggle(corral.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: marcat }}
                  accessibilityLabel={`Corral ${corral.numero} ${
                    meitat === 'E' ? 'esquerra' : 'dreta'
                  }`}
                  style={[
                    styles.corral,
                    marcat && styles.corralMarcat,
                    ocupat && !marcat && styles.corralOcupat,
                  ]}
                >
                  <Text style={[styles.numero, marcat && styles.numeroMarcat]}>
                    {corral.numero}
                  </Text>
                  {ocupat && (
                    <Text style={[styles.avis, marcat && styles.avisMarcat]}>
                      ocupat
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  graella: { flexDirection: 'row', gap: mides.espai },
  columna: { flex: 1, gap: 6 },
  capcalera: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  titolMeitat: { fontSize: 13, fontWeight: '600', color: colors.discret },
  accio: { fontSize: 13, color: colors.primari, fontWeight: '600' },
  corral: {
    height: mides.toc,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.vora,
    backgroundColor: colors.targeta,
    alignItems: 'center',
    justifyContent: 'center',
  },
  corralMarcat: { backgroundColor: colors.primari, borderColor: colors.primari },
  corralOcupat: { borderColor: colors.avis, backgroundColor: colors.avisFluix },
  numero: { fontSize: 17, fontWeight: '600', color: colors.text },
  numeroMarcat: { color: '#fff' },
  avis: { fontSize: 10, color: colors.avis },
  avisMarcat: { color: '#fff' },
});
