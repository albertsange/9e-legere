// Campanya 1 · Nivell 1 «El Bateig de Foc» (Philippeville, 1793): mapa. Peça de MapKit.A, sense lògica de joc.
// Un pilot de 20 homes ha de travessar el bosc per l'oest i flanquejar una patrulla de 15 jägers prop del riu Viroin.
function buildCampaign1Map() {
  const A = MapKit.A, W = 96, H = 60, sc = [];
  sc.push(
    A.field([[0, 0], [W, 0], [W, H], [0, H]], { kind: 'meadow' }),
    A.river([[50, -2], [46, 14], [52, 28], [47, 42], [51, H + 2]], { width: 4.5 }),
    A.road([[0, 30], [44, 30]], { kind: 'track' }), A.road([[53, 30], [W, 30]], { kind: 'track' }),
    A.bridge(49, 30, 0, { span: 8, width: 3.5 }),
    // boscos: l'oest (on comença el pilot) i les ribes del riu, amb la clariana del costat est per al flanqueig
    A.wood([[2, 2], [40, 2], [42, 20], [12, 22], [4, 14]], { kind: 'mixed', seed: 31 }),
    A.wood([[2, 38], [30, 40], [30, 58], [2, 58]], { kind: 'broad', seed: 32 }),
    A.wood([[56, 2], [92, 2], [94, 18], [60, 20]], { kind: 'broad', seed: 33 }),
    A.wood([[60, 22], [74, 22], [76, 46], [62, 46]], { kind: 'mixed', seed: 34 }),
    A.wood([[80, 36], [94, 36], [94, 58], [82, 58]], { kind: 'mixed', seed: 35 }),
    A.wood([[34, 46], [44, 46], [46, 58], [34, 58]], { kind: 'broad', seed: 36 }),
    A.building({ x: 16, y: 46, w: 8, h: 5 }), A.building({ x: 84, y: 26, w: 7, h: 4.5, rot: 0.1 }),
    A.fence([[10, 40], [24, 41]]), A.hedge([[60, 52], [72, 53], [80, 50]], { seed: 9 }),
    A.tree(24, 26, { r: 1.2, seed: 41 }), A.tree(38, 33, { kind: 'con', r: 1.1, seed: 42 }), A.tree(66, 12, { r: 1.2, seed: 43 }),
    A.label('Philippeville', 12, 52, { kind: 'town', scale: 0.6 }), A.label('Le Viroin', 54, 56, { kind: 'place', scale: 0.5 }),
    A.label('Bosc de Philippeville', 22, 12, { kind: 'place', scale: 0.5 })
  );
  return { w: W, h: H, start: { x: 10, y: 30, h: 0 }, enemy: { x: 58, y: 30, h: Math.PI, n: 15 }, scene: MapKit.scene(sc) };
}
