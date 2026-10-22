import * as T from 'three';
import { walls } from '../castle.js';
import { CASTLE } from '../config.js';
import { t } from '../dil.js';
import { dist } from '../rules.js';

/**
 * Sahne modelleri (GameView metotları olarak eklenir; this.box / this.cyl / this.ring ile kurar): arena ve altın ağacı,
 * kaleler (üç katlı tek salon, kapı, sopa kasası, merdiven), karakterler, eşyalar ve nişan göstergeleri.
 * Kale parçaları kat kat izlenir (levels[f].parts): görünüm bulunulan kata göre üst katları ve duvarları saydamlaştırır.
 */
const TAU = Math.PI * 2;

export const modelMethods = {
  buildArena(w) {
    this.cyl(w.radius + 4, 2.8, '#8e9877', 0, -1.5, 0);
    this.cyl(w.radius + 3.9, 0.28, '#a9b884', 0, -0.12, 0);
    this.cyl(12.4, 0.045, '#c3bc91', 0, 0.025, 0);
    this.cyl(10.8, 0.05, '#b6bd8a', 0, 0.05, 0);
    this.ring(12.5, 12.65, '#e8d7a5', 0, 0);
    for (const b of w.bases) {
      const a = Math.atan2(b.x, b.z),
        path = this.box(
          4,
          0.045,
          w.ring - 10,
          '#c3bc91',
          Math.sin(a) * (w.ring / 2 + 5),
          0.05,
          Math.cos(a) * (w.ring / 2 + 5),
        );
      path.rotation.y = a;
      this.buildBase(b);
    }
    this.cyl(2.3, 0.22, '#a4aa8c', 0, 0.14, 0);
    this.cyl(1.9, 0.15, '#d0c393', 0, 0.31, 0);
    this.ring(2.6, 2.68, '#ead5a1', 0, 0);
    for (let i = 0; i < 8; i++) {
      const a = (i * TAU) / 8;
      this.box(0.44, 0.26, 0.44, '#f1cd72', Math.sin(a) * 0.85, 0.57, Math.cos(a) * 0.85).rotation.y = a;
    }
    this.cyl(0.68, 3.4, '#765533', 0, 1.8, 0);
    for (const [x, y, z, r] of [
      [0, 4.6, 0, 2.1],
      [-1.6, 3.8, 0, 1.5],
      [1.5, 4.1, 0.4, 1.7],
      [0, 4.3, -1.5, 1.5],
    ])
      this.ball(r, '#d9b748', x, y, z);
    for (let n = 0; n < 9; n++) {
      const a = (n * TAU) / 9;
      this.ball(0.19, '#ffe28a', Math.sin(a) * 1.8, 3.2 + (n % 3) * 0.3, Math.cos(a) * 1.8);
    }
    const fountain = { visible: true, position: new T.Vector3(0, 0, 0), getWorldPosition: out => out.set(0, 0, 0) };
    this.label(fountain, 2.2, 'market', t('gorunum.agac'));
    let seed = 34;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 42; i++) {
      const a = (i * TAU) / 42,
        r = w.radius + 1.2 + random() * 1.3,
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (i % 3 === 0) {
        this.cyl(0.19, 1.3, '#816847', x, 0.7, z);
        this.ball(1.1, '#789355', x, 2, z);
        this.ball(0.8, '#93aa68', x - 0.4, 2.65, z);
      } else {
        const rock = this.ball(0.35 + random() * 0.35, '#b3b597', x, 0.25, z);
        rock.scale.y *= 0.6;
      }
    }
    for (let i = 0; i < 130; i++) {
      const a = random() * TAU,
        r = 15 + random() * (w.radius - 16),
        x = Math.sin(a) * r,
        z = Math.cos(a) * r;
      if (w.bases.some(b => dist({ x, z }, b) < 11)) continue;
      const blade = this.mesh('cone', i % 8 ? '#8fa763' : '#edce88', x, 0.14, z, 0.1, 0.27, 0.1);
      blade.castShadow = false;
    }
    for (let i = 0; i < 20; i++) {
      const a = (i * TAU) / 20;
      this.box(0.9, 0.05, 0.65, '#d0c7a1', Math.sin(a) * 11.8, 0.085, Math.cos(a) * 11.8).rotation.y = a;
    }
  },
  buildBase(b) {
    const p = new T.Group();
    p.position.set(b.x, 0, b.z);
    p.rotation.y = b.angle || 0;
    this.scene.add(p);
    const HX = CASTLE.halfX,
      HZ = CASTLE.halfZ;
    this.box(HX * 2 + 1, 0.24, HZ * 2 + 1, '#a9ac99', 0, 0, 0, p);
    const crate = new T.Group();
    crate.position.set(2.5, 0, -HZ - 1.5);
    p.add(crate);
    this.box(1.5, 0.15, 1.1, '#765035', 0, 0.15, 0, crate);
    for (const z of [-0.52, 0.52]) this.box(1.6, 0.75, 0.12, '#a97947', 0, 0.55, z, crate);
    for (const x of [-0.73, 0.73]) this.box(0.12, 0.75, 1.1, '#92663d', x, 0.55, 0, crate);
    for (const x of [-0.45, 0, 0.45]) {
      const club = this.club(crate);
      club.position.set(x, 0.7, 0);
      club.rotation.z = x * 0.4;
    }
    const levels = [];
    for (let floor = 0; floor < 3; floor++) {
      const group = new T.Group();
      group.position.y = floor * CASTLE.height;
      p.add(group);
      const parts = [],
        palette = new Map();
      const track = (mesh, room = -1, kind = 'wall') => {
        const key = room + ':' + kind + ':' + mesh.material.color.getHex();
        if (!palette.has(key)) {
          const m = mesh.material.clone();
          m.transparent = true;
          palette.set(key, m);
        }
        mesh.material = palette.get(key);
        parts.push({ mesh, room, kind });
        return mesh;
      };
      const color = this.world.players[b.id].color;
      track(
        this.box(HX * 2 - 0.3, 0.15, HZ * 2 - 0.3, ['#a9ad92', '#ac9e87', '#afa587'][floor], 0, 0.05, 0, group),
        -1,
        'floor',
      );
      track(this.box(HX * 0.9, 0.025, HZ * 0.9, color, 0, 0.14, -1, group), -1, 'decor');
      for (const x of [-HX + 0.9, HX - 0.9])
        for (const z of [-HZ * 0.55, 0, HZ * 0.45]) {
          track(this.box(0.65, 1.2, 1.7, '#796346', x, 0.75, z, group), -1, 'decor');
          for (const yy of [0.4, 0.85, 1.3]) track(this.box(0.72, 0.09, 1.8, '#bd9d6e', x, yy, z, group), -1, 'decor');
        }
      for (const x of [-HX + 0.35, HX - 0.35])
        for (const z of [-HZ * 0.3, HZ * 0.3]) track(this.cyl(0.16, 0.7, '#f3c56b', x, 2.2, z, group), -1, 'decor');
      for (const w of walls({ x: 0, z: 0 }, floor, false))
        track(this.box(w.w, 3.4, w.d, '#899c98', w.x, 1.8, w.z, group));
      for (const x of [-HX, HX])
        for (const z of [-HZ, HZ]) {
          track(this.cyl(1.15, 3.8, '#748d8b', x, 1.9, z, group));
          track(this.cyl(1.25, 0.18, '#b0b9a5', x, 3.65, z, group));
          if (floor === 2)
            for (let n = 0; n < 6; n++) {
              const a = (n * TAU) / 6;
              track(this.box(0.47, 0.65, 0.47, '#a6b2a2', x + Math.sin(a), 4.05, z + Math.cos(a), group));
            }
        }
      if (floor === 2)
        for (let x = -HX + 1.2; x < HX - 0.6; x += 1.5)
          for (const z of [-HZ, HZ]) track(this.box(0.8, 0.65, 0.65, '#b5beab', x, 3.8, z, group));
      for (const [z, color, up] of [[CASTLE.stairZ, '#dcb56c', true]]) {
        for (let n = 0; n < 6; n++)
          track(
            this.box(1.45, 0.13 + n * 0.11, 0.32, color, 0, 0.1 + n * 0.055, z - 0.9 + n * 0.32, group),
            -1,
            'stairs',
          );
        const marker = this.mesh('cone', color, 0, 1.4, z, 0.23, 0.5, 0.23, group);
        if (!up) marker.rotation.z = Math.PI;
        track(marker, -1, 'stairs');
      }
      if (floor === 2) track(this.box(HX * 2 - 0.4, 0.18, HZ * 2 - 0.4, '#758b89', 0, 3.55, 0, group), -1, 'roof');
      for (const z of [-HZ - 0.24, HZ + 0.24])
        for (const x of [-HX * 0.6, HX * 0.6]) track(this.box(0.48, 1.35, 0.08, '#344b49', x, 2, z, group));
      levels.push({ group, parts });
    }
    this.box(3.6, 0.55, 0.75, '#c6c7ad', 0, 3.2, -HZ, p);
    const banner = this.box(1.7, 2, 0.12, this.world.players[b.id].color, 0, 9.6, -HZ - 0.3, p);
    const R = Math.hypot(HX, HZ) + 0.4,
      ring = this.ring(R, R + 0.1, this.world.players[b.id].color, 0, 0, p);
    ring.position.y = 0.03;
    this.baseViews.push({
      p,
      levels,
      banner,
      ring,
      bounds: new T.Box3(new T.Vector3(b.x - HZ - 2, 0, b.z - HZ - 2), new T.Vector3(b.x + HZ + 2, 12.6, b.z + HZ + 2)),
      label: this.label(p, 13, 'base', ''),
    });
  },
  club(parent) {
    const g = new T.Group();
    this.box(0.16, 1.05, 0.17, '#8c5935', 0, 0.25, 0, g);
    const head = this.box(0.32, 0.57, 0.3, '#ad7847', 0, 0.76, 0, g);
    head.rotation.z = 0.09;
    for (const y of [0.57, 0.85]) this.box(0.35, 0.075, 0.32, '#d4b16a', 0, y, 0, g);
    parent.add(g);
    return g;
  },
  buildActor(p) {
    const root = new T.Group();
    this.scene.add(root);
    const body = new T.Group();
    root.add(body);
    this.box(0.77, 0.88, 0.5, p.color, 0, 1.05, 0, body);
    this.box(0.8, 0.12, 0.53, '#70563d', 0, 0.79, 0, body);
    this.box(0.2, 0.16, 0.06, '#e6cb79', 0, 0.8, 0.3, body);
    this.box(0.55, 0.53, 0.52, '#ebbc87', 0, 1.78, 0, body);
    this.box(0.6, 0.17, 0.57, '#465b45', 0, 2.1, 0, body);
    this.box(0.12, 0.18, 0.1, p.color, 0.2, 2.21, 0, body);
    for (const x of [-0.14, 0.14]) this.box(0.075, 0.075, 0.04, '#2b4437', x, 1.83, 0.274, body);
    this.box(0.13, 0.12, 0.14, '#d8a172', 0, 1.7, 0.31, body);
    const legs = [];
    for (const x of [-0.21, 0.21]) {
      const leg = new T.Group();
      leg.position.set(x, 0.66, 0);
      body.add(leg);
      this.box(0.28, 0.52, 0.29, '#445844', 0, -0.27, 0, leg);
      this.box(0.32, 0.17, 0.44, '#5a4d38', 0, -0.55, 0.07, leg);
      legs.push(leg);
    }
    const arms = [];
    for (const x of [-0.52, 0.52]) {
      const arm = new T.Group();
      arm.position.set(x, 1.4, 0);
      body.add(arm);
      this.box(0.26, 0.57, 0.29, p.color, 0, -0.24, 0, arm);
      this.box(0.25, 0.2, 0.25, '#e3b47e', 0, -0.59, 0, arm);
      arms.push(arm);
    }
    const weapon = this.club(arms[1]);
    weapon.position.set(0.02, -0.45, 0.22);
    weapon.rotation.x = 0.45;
    const aura = this.ring(0.54, 0.62, p.color, 0, 0, root);
    aura.position.y = 0.045;
    const stars = new T.Group();
    body.add(stars);
    stars.position.y = 2.65;
    for (let i = 0; i < 4; i++) {
      const a = (i * TAU) / 4;
      const s = this.mesh('cone', '#ffdc83', Math.sin(a) * 0.65, 0, Math.cos(a) * 0.65, 0.12, 0.23, 0.12, stars);
      s.rotation.z = Math.PI / 2;
    }
    const l = this.label(root, 2.8, 'actor', p.name);
    return { root, body, legs, arms, weapon, stars, aura, label: l };
  },
  buildItem(kind) {
    const g = new T.Group();
    if (kind === 0) {
      this.box(0.85, 0.58, 0.65, '#a27040', 0, 0.38, 0, g);
      this.box(0.88, 0.17, 0.68, '#c08c4a', 0, 0.77, 0, g);
      for (const x of [-0.3, 0.3]) this.box(0.08, 0.79, 0.7, '#e3bb65', x, 0.44, 0, g);
      this.box(0.16, 0.21, 0.035, '#f4d386', 0, 0.43, 0.37, g);
    }
    if (kind === 1) {
      this.cyl(0.32, 0.7, '#659d93', 0, 0.39, 0, g);
      this.cyl(0.14, 0.3, '#73ada0', 0, 0.87, 0, g);
      this.cyl(0.15, 0.1, '#e4c591', 0, 1.07, 0, g);
      this.box(0.39, 0.23, 0.035, '#ebd7a3', 0, 0.47, 0.329, g);
    }
    if (kind === 2) {
      this.box(0.85, 0.18, 0.75, '#caab67', 0, 0.46, 0, g);
      this.box(0.81, 0.96, 0.14, '#caab67', 0, 0.91, -0.34, g);
      this.box(0.58, 0.62, 0.08, '#b16858', 0, 0.97, -0.23, g);
      this.box(0.64, 0.12, 0.62, '#b16858', 0, 0.6, 0, g);
      for (const x of [-0.33, 0.33]) for (const z of [-0.28, 0.28]) this.box(0.1, 0.43, 0.1, '#a28048', x, 0.22, z, g);
      this.ball(0.11, '#e5c883', 0, 1.46, -0.34, g);
    }
    if (kind === 3) {
      this.cyl(0.45, 0.58, '#67776c', 0, 0.46, 0, g);
      this.cyl(0.5, 0.09, '#a2ada0', 0, 0.8, 0, g);
      this.cyl(0.38, 0.02, '#3f5649', 0, 0.85, 0, g);
      for (const x of [-0.57, 0.57]) this.box(0.18, 0.09, 0.18, '#a7b29c', x, 0.64, 0, g);
    }
    if (kind === 4) {
      this.cyl(0.37, 0.77, '#bb874e', 0, 0.46, 0, g);
      for (const y of [0.18, 0.69]) this.cyl(0.395, 0.1, '#68756a', 0, y, 0, g);
      this.cyl(0.35, 0.05, '#dab67a', 0, 0.87, 0, g);
    }
    this.scene.add(g);
    return g;
  },
  buildAim() {
    this.aimRing = this.ring(0.24, 0.29, '#fff0b7', 0, 0);
    this.aimRing.position.y = 0.07;
    this.aimLine = new T.Line(
      new T.BufferGeometry(),
      new T.LineDashedMaterial({ color: '#fff0b7', dashSize: 0.3, gapSize: 0.2, transparent: true, opacity: 0.48 }),
    );
    this.scene.add(this.aimLine);
    this.aimLine.geometry.setAttribute('position', new T.BufferAttribute(new Float32Array(6), 3));
    this.facing = this.mesh('cone', '#fff0b7', 0, 0.25, 0, 0.23, 0.7, 0.23);
    this.facing.material = new T.MeshBasicMaterial({ color: '#ffe5a0', depthTest: false });
    this.facing.renderOrder = 10;
    this.facing.rotation.x = Math.PI / 2;
    this.selection = this.ring(0.7, 0.77, '#fff0b7', 0, 0);
  },
};
