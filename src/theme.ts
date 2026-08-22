import { Platform } from 'react-native';

/** Colors i mides compartits. Un sol lloc per canviar l'aspecte de tot. */

export const colors = {
  fons: '#f2f2f7',
  targeta: '#ffffff',
  vora: '#e2e2e8',
  text: '#1c1c1e',
  discret: '#8e8e93',
  primari: '#0a7ea4',
  primariFluix: '#e4f2f7',
  perill: '#c0392b',
  perillFluix: '#fdecea',
  avis: '#b26a00',
  avisFluix: '#fff6e5',
  ok: '#2e7d32',
  okFluix: '#e8f5e9',
};

export const mides = {
  /** Mínim recomanat per tocar amb el dit, encara més important amb guants. */
  toc: 46,
  radi: 12,
  espai: 12,
  /**
   * Marge inferior extra als formularis dins d'un ScrollView. Sense això,
   * un camp a prop del final de la pàgina no té on pujar quan surt el
   * teclat: l'scroll només pot desplaçar el que hi ha per sota, i si no hi
   * ha prou espai en blanc, el camp es queda tapat pel teclat encara que
   * l'app "intenti" pujar la pantalla. El valor cobreix un teclat típic
   * d'Android o iOS amb marge. A la web (s'usa a l'escriptori, sense teclat
   * virtual que tapi res) es queda com abans, per no deixar un buit enorme
   * sota el botó de desar.
   */
  espaiTeclat: Platform.OS === 'web' ? 40 : 320,
};
