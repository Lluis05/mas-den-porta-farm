import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

type Props = {
  sala: number;
  /** Codi curt tipus "21D" o "11 1-2-3-4E", si es té. */
  codi?: string;
  /** Línia curta que es veu sempre, oberta o tancada (p. ex. "42 porcs"). */
  resum: string;
  oberta: boolean;
  onToggle: () => void;
  children: ReactNode;
};

/**
 * Una sala que es pot obrir i tancar. Amagada, només es veu la sala i un
 * resum d'una línia; oberta, es veuen les corralines de dins (el que li
 * passin com a `children`).
 *
 * Purament de presentació: qui la fa servir decideix què hi ha dins quan
 * està oberta (una graella de només lectura, o una de tocar per triar).
 */
export function SalaColapsable({ sala, codi, resum, oberta, onToggle, children }: Props) {
  return (
    <View style={styles.bloc}>
      <Pressable
        onPress={onToggle}
        style={styles.capcalera}
        accessibilityRole="button"
        accessibilityState={{ expanded: oberta }}
      >
        <View style={styles.flex}>
          <Text style={styles.titol}>
            Sala {sala}
            {codi ? ` · ${codi}` : ''}
          </Text>
          <Text style={styles.resum}>{resum}</Text>
        </View>
        <Text style={styles.fletxa}>{oberta ? '▾' : '›'}</Text>
      </Pressable>
      {oberta && <View style={styles.contingut}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.vora,
  },
  flex: { flex: 1 },
  capcalera: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
  },
  titol: { fontSize: 15, fontWeight: '700', color: colors.text },
  resum: { fontSize: 13, color: colors.discret, marginTop: 2 },
  fletxa: { fontSize: 20, color: colors.discret },
  contingut: { paddingBottom: 10, gap: 8 },
});
