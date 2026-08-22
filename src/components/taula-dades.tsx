import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Una columna d'una taula genèrica. `formata` sempre torna text: la taula
 * és de només consulta (resposta explícita: sense edició), així que no cal
 * cap tipus de valor més enllà del que es mostra.
 */
export type ColumnaTaula<T> = {
  key: string;
  etiqueta: string;
  amplada?: number;
  numerica?: boolean;
  formata: (fila: T) => string;
};

/**
 * Taula de només consulta, tipus "full d'Excel": totes les files, sense
 * paginar. Capçalera i files van dins del mateix ScrollView horitzontal
 * perquè les columnes es mantinguin alineades en fer scroll; el scroll
 * vertical el porta la pàgina que la conté.
 */
export function TaulaDades<T extends { id: string }>({
  columnes,
  files,
}: {
  columnes: ColumnaTaula<T>[];
  files: T[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View>
        <View style={styles.filaCapcalera}>
          {columnes.map((c) => (
            <Text key={c.key} style={[styles.cellaCapcalera, { width: c.amplada ?? 110 }]}>
              {c.etiqueta}
            </Text>
          ))}
        </View>
        {files.length === 0 && (
          <Text style={styles.buit}>Encara no hi ha cap fila.</Text>
        )}
        {files.map((f, i) => (
          <View key={f.id} style={[styles.filaCos, i % 2 === 1 && styles.filaParella]}>
            {columnes.map((c) => (
              <Text
                key={c.key}
                style={[styles.cella, { width: c.amplada ?? 110 }, c.numerica && styles.cellaNumerica]}
              >
                {c.formata(f)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  filaCapcalera: {
    flexDirection: 'row',
    backgroundColor: colors.primariFluix,
    borderBottomWidth: 1,
    borderBottomColor: colors.vora,
  },
  cellaCapcalera: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 12,
    fontWeight: '700',
    color: colors.primari,
  },
  filaCos: {
    flexDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.vora,
  },
  filaParella: { backgroundColor: colors.fons },
  cella: {
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 13,
    color: colors.text,
  },
  cellaNumerica: { textAlign: 'right', fontVariant: ['tabular-nums'] },
  buit: { padding: 16, fontSize: 13, color: colors.discret },
});
