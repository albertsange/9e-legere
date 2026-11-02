// Campanya 1 · Nivell 1 «El Bateig de Foc» (Philippeville, 1793): mapa. Peça de MapKit.A, sense lògica de joc.
// Un pilot de 20 homes ha de travessar el bosc per l'oest i flanquejar una patrulla de 15 jägers prop del riu Viroin.
// Philippeville: poble orgànic. Carrer principal que travessa la vila, una plaça al centre, branques que es desvien
// i cases col·locades a l'atzar (seed fix), amb rotació lleu i sense encavalcar-se ni tapar els camins.
function philippeville(A) {
  const R = MapKit.rng(51), out = [];
  const main = [[1, 51], [12, 49.5], [22, 50], [34, 47.5], [42, 46]];
  const branches = [
    [[24, 44], [27, 40], [31, 36], [38, 33]],          // cap al nord-est
    [[14, 50.5], [13, 56], [11, 59]],                  // cap al sud-oest
    [[30, 48.6], [32, 53], [37, 57]]                   // cap al sud-est
  ];
  const plaza = { x: 22, y: 46.5, w: 9, h: 6.5 };
  out.push(A.road(main, { kind: 'lane' }));
  for (const br of branches) out.push(A.road(br, { kind: 'track' }));
  out.push(A.plaza(plaza.x, plaza.y, plaza.w, plaza.h));
  const segD = (x, y, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(x - a[0] - dx * k, y - a[1] - dy * k); };
  const roads = [main, ...branches];
  const placed = [];
  const free = (x, y, r) => {
    if (x < 2.5 + r || x > 45 - r || y < 33 + r || y > 59 - r) return false;
    if (Math.abs(x - plaza.x) < plaza.w / 2 + r + 1 && Math.abs(y - plaza.y) < plaza.h / 2 + r + 1) return false;
    for (const rd of roads) for (let i = 1; i < rd.length; i++) if (segD(x, y, rd[i - 1], rd[i]) < 1.9 + r) return false;
    for (const q of placed) if (Math.hypot(x - q[0], y - q[1]) < q[2] + r) return false;
    return true;
  };
  const house = (x, y, w, h, rot) => { placed.push([x, y, Math.hypot(w, h) / 2 - 0.2]); return A.building({ x, y, w, h, rot, kind: 'house' }); };
  placed.push([plaza.x - plaza.w / 2 - 2.4, plaza.y, 4.5], [13, 36.5, 4]);   // capella i etiqueta: reservats
  // cases escampades a l'atzar pel poble
  for (let n = 0, t = 0; n < 22 && t < 20000; t++) {
    const x = 4 + R() * 40, y = 34 + R() * 23, w = 4.2 + R() * 1.6, h = 3 + R() * 1.2, rot = (R() - 0.5) * 0.35;
    if (!free(x, y, Math.hypot(w, h) / 2 + 0.3)) continue;
    n++; out.push(house(x, y, w, h, rot));
  }
  // capella a la vora nord de la plaça
  out.push(A.building({ x: plaza.x - plaza.w / 2 - 2.4, y: plaza.y, w: 3.6, h: 6, rot: 0, kind: 'church' }));
  out.push(A.label('Philippeville', 13, 36.5, { kind: 'town', scale: 0.6 }));
  return out;
}

function buildCampaign1Map() {
  const A = MapKit.A, W = 96, H = 60, sc = [];
  sc.push(
    A.field([[0, 0], [W, 0], [W, H], [0, H]], { kind: 'meadow' }),
    A.river([[50, -2], [46, 14], [52, 28], [47, 42], [51, H + 2]], { width: 4.5 }),
    A.road([[0, 30], [44, 30]], { kind: 'track' }), A.road([[53, 30], [W, 30]], { kind: 'track' }),
    A.bridge(49, 30, 0, { span: 8, width: 3.5 }),
    // boscos: l'oest (on comença el pilot) i les ribes del riu, amb la clariana del costat est per al flanqueig
    A.wood([[2, 2], [40, 2], [42, 20], [12, 22], [4, 14]], { kind: 'mixed', seed: 31 }),
        A.wood([[56, 2], [92, 2], [94, 18], [60, 20]], { kind: 'broad', seed: 33 }),
    A.wood([[60, 22], [74, 22], [76, 46], [62, 46]], { kind: 'mixed', seed: 34 }),
    A.wood([[80, 36], [94, 36], [94, 58], [82, 58]], { kind: 'mixed', seed: 35 }),
    A.wood([[34, 46], [44, 46], [46, 58], [34, 58]], { kind: 'broad', seed: 36 }),
    ...philippeville(A),
    A.building({ x: 84, y: 26, w: 7, h: 4.5, rot: 0.1 }),
    A.fence([[26, 44], [34, 44]]), A.hedge([[60, 52], [72, 53], [80, 50]], { seed: 9 }),
    A.tree(24, 26, { r: 1.2, seed: 41 }), A.tree(38, 33, { kind: 'con', r: 1.1, seed: 42 }), A.tree(66, 12, { r: 1.2, seed: 43 }),
    A.label('Le Viroin', 54, 56, { kind: 'place', scale: 0.5 }),
    A.label('Bosc de Philippeville', 22, 12, { kind: 'place', scale: 0.5 })
  );
  return { w: W, h: H, start: { x: 10, y: 30, h: 0 }, enemy: { x: 58, y: 30, h: Math.PI, n: 15 }, scene: MapKit.scene(sc) };
}
