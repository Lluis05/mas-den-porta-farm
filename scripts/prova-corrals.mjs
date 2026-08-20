/**
 * Proves de src/lib/corrals.ts.
 *
 *   node --experimental-strip-types scripts/prova-corrals.mjs
 */

import { aparellaTrasllats, reparteix, reparteixProporcional } from '../src/lib/corrals.ts';

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

function suma(parells, camp) {
  const totals = {};
  for (const p of parells) {
    totals[p[camp]] = (totals[p[camp]] ?? 0) + p.numPorcs;
  }
  return totals;
}

console.log('\nreparteix / reparteixProporcional (ja en ús, comprovació ràpida)');
comprova('reparteix igual', reparteix(100, 4), [25, 25, 25, 25]);
comprova('reparteix amb resta', reparteix(102, 4), [26, 26, 25, 25]);
comprova(
  'reparteixProporcional',
  reparteixProporcional(30, [11, 11, 11, 11]),
  [8, 8, 7, 7]
);
comprova(
  'reparteixProporcional no es passa del que hi ha',
  reparteixProporcional(10, [11, 3]),
  [8, 2]
);

console.log('\naparellaTrasllats');
{
  const parells = aparellaTrasllats(
    [{ corralId: 'a', num: 5 }],
    [
      { corralId: 'x', num: 3 },
      { corralId: 'y', num: 2 },
    ]
  );
  comprova('un origen, dos destins', parells, [
    { corralOrigenId: 'a', corralDestiId: 'x', numPorcs: 3 },
    { corralOrigenId: 'a', corralDestiId: 'y', numPorcs: 2 },
  ]);
}

{
  const origens = [
    { corralId: 'a', num: 4 },
    { corralId: 'b', num: 3 },
  ];
  const destins = [
    { corralId: 'x', num: 5 },
    { corralId: 'y', num: 2 },
  ];
  const parells = aparellaTrasllats(origens, destins);
  comprova(
    'dos origens, dos destins: el que surt de cada origen quadra',
    suma(parells, 'corralOrigenId'),
    { a: 4, b: 3 }
  );
  comprova(
    'dos origens, dos destins: el que entra a cada destí quadra',
    suma(parells, 'corralDestiId'),
    { x: 5, y: 2 }
  );
}

comprova('cap origen', aparellaTrasllats([], [{ corralId: 'x', num: 3 }]), []);
comprova('cap destí', aparellaTrasllats([{ corralId: 'a', num: 3 }], []), []);
comprova(
  'els zeros no compten',
  aparellaTrasllats(
    [{ corralId: 'a', num: 0 }, { corralId: 'b', num: 4 }],
    [{ corralId: 'x', num: 4 }]
  ),
  [{ corralOrigenId: 'b', corralDestiId: 'x', numPorcs: 4 }]
);

{
  // Si origen i destí no sumen igual (no hauria de passar si la pantalla ho
  // fa bé, però la funció no ha de petar ni inventar-se porcs).
  const parells = aparellaTrasllats(
    [{ corralId: 'a', num: 5 }],
    [{ corralId: 'x', num: 3 }]
  );
  comprova('si no quadren, s’atura on arriba el més petit', parells, [
    { corralOrigenId: 'a', corralDestiId: 'x', numPorcs: 3 },
  ]);
}

console.log(`\n${ok} bé, ${malament} malament\n`);
process.exit(malament === 0 ? 0 : 1);
