/**
 * Proves del lector d'albarans (`src/lib/albara.ts`).
 *
 *   node --experimental-strip-types scripts/prova-albara.mjs
 *
 * El cas principal són les paraules REALS que un OCR treu de
 * `docs/pinso-example.jpeg` (fixture a `scripts/fixtures/albara-ocr.json`).
 * Aquella foto és el pitjor cas raonable: paper arrugat, llum cremada, i el
 * total i les capçaleres il·legibles. Si el lector se'n surt aquí, se'n
 * sortirà amb una foto normal.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  agrupaFiles,
  ajuntaTrossos,
  analitzaAlbara,
  llegeixNumero,
} from '../src/lib/albara.ts';

const aqui = dirname(fileURLToPath(import.meta.url));

let ok = 0;
let malament = 0;

function comprova(nom, obtingut, esperat) {
  const a = JSON.stringify(obtingut);
  const b = JSON.stringify(esperat);
  if (a === b) {
    ok++;
    console.log(`  ✓ ${nom}`);
  } else {
    malament++;
    console.log(`  ✗ ${nom}\n      esperat: ${b}\n      obtingut: ${a}`);
  }
}

// ---------------------------------------------------------------------------
console.log('\nNúmeros en format d’aquí (punt = milers, coma = decimals)');
comprova('9.000,00', llegeixNumero('9.000,00'), 9000);
comprova('27.004,00', llegeixNumero('27.004,00'), 27004);
comprova('8.995,00', llegeixNumero('8.995,00'), 8995);
comprova('sense separadors', llegeixNumero('9000'), 9000);
comprova('només coma decimal', llegeixNumero('12,5'), 12.5);
comprova('només punt de milers', llegeixNumero('12.500'), 12500);
comprova('amb brossa al voltant', llegeixNumero('kg 9.000,00 '), 9000);
comprova('no és número', llegeixNumero('PTCGD'), null);
comprova('buit', llegeixNumero(''), null);

// ---------------------------------------------------------------------------
console.log('\nAjuntar números que l’OCR ha partit');
{
  const fila = [
    { text: '9.000,', caixa: { x: 4195, y: 1332, width: 432, height: 73 } },
    { text: '00', caixa: { x: 4536, y: 1301, width: 96, height: 115 } },
  ];
  comprova(
    '"9.000," + "00" → "9.000,00"',
    ajuntaTrossos(fila).map((p) => p.text),
    ['9.000,00']
  );
}
{
  // Cas invers: el tall cau abans de la coma.
  const fila = [
    { text: '9.000', caixa: { x: 4195, y: 1332, width: 400, height: 73 } },
    { text: ',00', caixa: { x: 4600, y: 1332, width: 120, height: 73 } },
  ];
  comprova(
    '"9.000" + ",00" → "9.000,00"',
    ajuntaTrossos(fila).map((p) => p.text),
    ['9.000,00']
  );
}
{
  // El que NO s'ha d'ajuntar: sitja i lot són dos camps diferents.
  const fila = [
    { text: '1', caixa: { x: 1896, y: 1361, width: 31, height: 54 } },
    { text: '660986', caixa: { x: 1994, y: 1359, width: 282, height: 62 } },
  ];
  comprova(
    'sitja i lot es queden separats',
    ajuntaTrossos(fila).map((p) => p.text),
    ['1', '660986']
  );
}

// ---------------------------------------------------------------------------
console.log('\nFoto real (docs/pinso-example.jpeg, via OCR)');
const real = JSON.parse(
  readFileSync(join(aqui, 'fixtures/albara-ocr.json'), 'utf8')
);

{
  // Les tres línies han de caure en tres files diferents tot i el paper tort.
  const files = agrupaFiles(real.paraules);
  const ambCodi = files.filter((f) =>
    f.some((p) => /^(PTCGD|PTGGD|PPDGD)$/.test(p.text))
  );
  comprova('tres files d’article', ambCodi.length, 3);
}

const llegit = analitzaAlbara(real.paraules, real.amplada);
console.log('\n  → ' + JSON.stringify(llegit, null, 2).replace(/\n/g, '\n  '));

comprova('número d’albarà', llegit.numero, '347570');
comprova('data', llegit.data, '2026-08-07');
comprova(
  'codis d’article',
  llegit.linies.map((l) => l.codiArticle),
  ['PTCGD', 'PTGGD', 'PPDGD']
);
comprova(
  'quilos',
  llegit.linies.map((l) => l.kg),
  [9000, 8995, 9009]
);

// ---------------------------------------------------------------------------
console.log('\nFoto real, pàgina sencera (logos, adreça i peu de pàgina dins de la foto)');
{
  // Mateix albarà que el de dalt, però la foto agafa tota la pàgina: hi ha
  // paraules totes en majúscules pertot (MAS, VIC, CODI, EMAS...) que casen
  // amb el patró d'un codi d'article sense ser-ho. Descobert 2026-08-13: la
  // primera vegada que es va provar amb una foto de pàgina sencera, la
  // columna de quilos es va confondre amb "CODI CLIENT 5192" i el resultat
  // era una única línia inventada ("CODI", 5192 kg).
  const pagina = JSON.parse(
    readFileSync(
      join(aqui, 'fixtures/albara-ocr-pagina-sencera.json'),
      'utf8'
    )
  );
  const llegitPagina = analitzaAlbara(pagina.paraules, pagina.amplada);
  comprova('número d’albarà', llegitPagina.numero, '347570');
  comprova('data', llegitPagina.data, '2026-08-07');
  comprova(
    'codis d’article',
    llegitPagina.linies.map((l) => l.codiArticle),
    ['PTCGD', 'PTGGD', 'PPDGD']
  );
  comprova(
    'quilos',
    llegitPagina.linies.map((l) => l.kg),
    [9000, 8995, 9009]
  );
}

// ---------------------------------------------------------------------------
console.log('\nEscaneig net (amb la fila de Totals llegible)');
{
  // El mateix albarà però com el llegiria un OCR amb una foto decent: hi surt
  // la capçalera i el total. Aquí la comprovació del total ha de quadrar.
  const fila = (y, codi, sitja, lot, kg) => [
    { text: codi, caixa: { x: 1556, y, width: 231, height: 55 } },
    { text: sitja, caixa: { x: 1896, y, width: 60, height: 55 } },
    { text: lot, caixa: { x: 1994, y, width: 282, height: 55 } },
    { text: kg, caixa: { x: 4195, y, width: 440, height: 55 } },
  ];
  const paraules = [
    { text: 'ALBARÀ', caixa: { x: 3100, y: 430, width: 400, height: 60 } },
    { text: 'NÚM.', caixa: { x: 3550, y: 430, width: 200, height: 60 } },
    { text: '347570', caixa: { x: 3853, y: 430, width: 336, height: 60 } },
    { text: 'DATA', caixa: { x: 3100, y: 588, width: 300, height: 60 } },
    { text: '07-08-2026', caixa: { x: 3851, y: 588, width: 526, height: 60 } },
    { text: 'Quantitat', caixa: { x: 4195, y: 1200, width: 440, height: 60 } },
    ...fila(1361, 'PTCGD', '1', '660986', '9.000,00'),
    ...fila(1488, 'PTGGD', '1', '660987', '8.995,00'),
    ...fila(1615, 'PPDGD', '82', '660988', '9.009,00'),
    { text: 'Totals', caixa: { x: 2900, y: 2400, width: 300, height: 60 } },
    { text: '27.004,00', caixa: { x: 4195, y: 2400, width: 440, height: 60 } },
  ];

  const net = analitzaAlbara(paraules, 5712);
  comprova('número', net.numero, '347570');
  comprova('data', net.data, '2026-08-07');
  comprova(
    'quilos',
    net.linies.map((l) => l.kg),
    [9000, 8995, 9009]
  );
  comprova('total llegit', net.total, 27004);
  comprova('quadra amb el total', net.quadra, true);
}

// ---------------------------------------------------------------------------
console.log('\nPinso medicat (Prescripció i Complement medicamentós sota la línia)');
{
  // Cas real (`medicated.jpg`): la primera línia d'article ve amb recepta
  // veterinària, impresa en dues línies més petites just a sota, ABANS de
  // l'article següent. Ni "Prescripció" ni "Complement medicamentós" tenen
  // codi al davant, així que no s'han de confondre amb una línia d'article.
  const fila = (y, codi, sitja, lot, kg) => [
    { text: codi, caixa: { x: 1556, y, width: 231, height: 55 } },
    { text: sitja, caixa: { x: 1896, y, width: 60, height: 55 } },
    { text: lot, caixa: { x: 1994, y, width: 282, height: 55 } },
    { text: kg, caixa: { x: 4195, y, width: 440, height: 55 } },
  ];
  const paraules = [
    { text: 'ALBARÀ', caixa: { x: 3100, y: 430, width: 400, height: 60 } },
    { text: 'NÚM.', caixa: { x: 3550, y: 430, width: 200, height: 60 } },
    { text: '347425', caixa: { x: 3853, y: 430, width: 336, height: 60 } },
    { text: 'DATA', caixa: { x: 3100, y: 588, width: 300, height: 60 } },
    { text: '06-08-2026', caixa: { x: 3851, y: 588, width: 526, height: 60 } },
    ...fila(1361, 'PGEGD', '1', '99044/660901', '9.004,00'),
    { text: 'Prescripció', caixa: { x: 1556, y: 1425, width: 300, height: 45 } },
    { text: ':', caixa: { x: 1870, y: 1425, width: 20, height: 45 } },
    { text: 'P-25-B425-703-2026', caixa: { x: 1910, y: 1425, width: 500, height: 45 } },
    { text: 'COMPLEMENT', caixa: { x: 1556, y: 1480, width: 300, height: 45 } },
    { text: 'MEDICAMENTÓS', caixa: { x: 1870, y: 1480, width: 400, height: 45 } },
    ...fila(1615, 'PGAGD', '1', '660902', '9.016,00'),
    ...fila(1742, 'PPDGD', '1', '660903', '8.998,00'),
    { text: 'Totals', caixa: { x: 2900, y: 2400, width: 300, height: 60 } },
    { text: '27.018,00', caixa: { x: 4195, y: 2400, width: 440, height: 60 } },
  ];

  const medicat = analitzaAlbara(paraules, 5712);
  comprova('número', medicat.numero, '347425');
  comprova(
    'codis d’article',
    medicat.linies.map((l) => l.codiArticle),
    ['PGEGD', 'PGAGD', 'PPDGD']
  );
  comprova(
    'quilos',
    medicat.linies.map((l) => l.kg),
    [9004, 9016, 8998]
  );
  comprova('total quadra', medicat.quadra, true);
  comprova(
    'només la primera línia és medicada',
    medicat.linies.map((l) => l.medicat),
    [true, false, false]
  );
  comprova(
    'codi de prescripció enganxat a la línia bona',
    medicat.linies[0].prescripcio,
    'P-25-B425-703-2026'
  );
}

// ---------------------------------------------------------------------------
console.log('\nCasos que han de fallar bé, no petar');
{
  comprova('cap paraula', analitzaAlbara([], 1000).linies, []);
  const nomesSoroll = [
    { text: 'hola', caixa: { x: 10, y: 10, width: 50, height: 20 } },
    { text: '...', caixa: { x: 80, y: 10, width: 30, height: 20 } },
  ];
  const r = analitzaAlbara(nomesSoroll, 1000);
  comprova('foto sense albarà: cap línia', r.linies, []);
  comprova('foto sense albarà: no quadra', r.quadra, false);
  comprova('foto sense albarà: sense data', r.data, null);
}
{
  // Una columna de preus no s'ha de confondre amb els quilos.
  const paraules = [
    { text: 'DATA', caixa: { x: 100, y: 100, width: 200, height: 50 } },
    { text: '07-08-2026', caixa: { x: 400, y: 100, width: 300, height: 50 } },
    { text: 'PTCGD', caixa: { x: 100, y: 500, width: 200, height: 50 } },
    { text: '9.000,00', caixa: { x: 800, y: 500, width: 300, height: 50 } },
    { text: '0,42', caixa: { x: 1200, y: 500, width: 200, height: 50 } },
    { text: 'PTGGD', caixa: { x: 100, y: 700, width: 200, height: 50 } },
    { text: '8.995,00', caixa: { x: 800, y: 700, width: 300, height: 50 } },
    { text: '0,42', caixa: { x: 1200, y: 700, width: 200, height: 50 } },
  ];
  const r = analitzaAlbara(paraules, 2000);
  comprova(
    'agafa els quilos, no el preu',
    r.linies.map((l) => l.kg),
    [9000, 8995]
  );
}

// ---------------------------------------------------------------------------
console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
