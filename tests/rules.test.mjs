import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseGoal } from '../src/ai.js';
import {
  allied,
  clearSight,
  collide,
  localPoint,
  nearStairs,
  roomAt,
  roomPoint,
  route,
  useStairs,
  visibleTo,
  worldPoint,
} from '../src/castle.js';
import { jump, melee, throwClub } from '../src/combat.js';
import { CASTLE, RULES } from '../src/config.js';
import { addItem, buy, clubCrate, harvestTree, interact, nearClubCrate } from '../src/items.js';
import { sanitizeInput, snapshotFor } from '../src/net/snapshot.js';
import { castleInvaded, countItems, dist } from '../src/rules.js';
import { createWorld, step } from '../src/world.js';
const setup = (mode = 'solo') => {
  const w = createWorld(71, { mode });
  w.players.forEach(p => (p.bot = false));
  return w;
};
const advance = (w, n, input = {}, inputs = null) => {
  for (let i = 0; i < n; i++) step(w, 1 / 60, input, inputs);
};
test('havada ikinci zıplama yükselişi yeniler, üçüncü basış etkisizdir', () => {
  const w = setup(),
    p = w.players[0];
  assert.ok(jump(w, 0));
  advance(w, 23);
  assert.ok(p.y > 0 && p.vy < 0);
  const height = p.y;
  assert.ok(jump(w, 0));
  assert.equal(p.vy, 6);
  assert.equal(p.airJumps, 1);
  assert.equal(jump(w, 0), false);
  assert.equal(p.stats.jumps, 2);
  advance(w, 10);
  assert.ok(p.y > height);
});
test('yere inince iki zıplama hakkı yenilenir; sersemken kullanılamaz', () => {
  const w = setup(),
    p = w.players[0];
  jump(w, 0);
  advance(w, 10);
  jump(w, 0);
  advance(w, 100);
  assert.equal(p.y, 0);
  assert.equal(p.airJumps, 0);
  assert.ok(jump(w, 0));
  advance(w, 5);
  p.stun = 1;
  assert.equal(jump(w, 0), false);
  assert.equal(p.airJumps, 0);
  p.stun = 0;
  assert.ok(jump(w, 0));
});
test('çevrim içi oyuncunun ayrı basışları da yalnız çift zıplama sağlar', () => {
  const w = setup('pvp'),
    p = w.players[3];
  step(w, 1 / 30, {}, { 3: { jump: true } });
  advance(w, 10, {}, { 3: {} });
  step(w, 1 / 30, {}, { 3: { jump: true } });
  assert.equal(p.airJumps, 1);
  const jumps = p.stats.jumps;
  step(w, 1 / 30, {}, { 3: { jump: true } });
  assert.equal(p.stats.jumps, jumps);
});
test('solo 5 kişi; co-op/PvP yalnız iki takım, dönüşümlü 10 kale', () => {
  assert.equal(setup().players.length, 5);
  for (const mode of ['coop', 'pvp']) {
    const w = setup(mode);
    assert.equal(w.players.length, 10);
    assert.deepEqual(
      w.players.map(p => p.team),
      [0, 1, 0, 1, 0, 1, 0, 1, 0, 1],
    );
    assert.ok(w.radius > setup().radius);
  }
});
test('her kapı merkeze bakar; döndürülmüş kale noktaları aynı yerel konumda', () => {
  for (const b of setup('pvp').bases) {
    const gate = worldPoint(b, 0, -CASTLE.halfZ);
    assert.ok(Math.hypot(gate.x, gate.z) < Math.hypot(b.x, b.z));
    assert.ok(Math.abs(gate.x * b.z - gate.z * b.x) < 1e-6);
    const q = localPoint(b, roomPoint(b, 2, 2));
    assert.ok(Math.abs(q.x + 0.6 * CASTLE.halfX) < 1e-8);
    assert.ok(Math.abs(q.z - 0.45 * CASTLE.halfZ) < 1e-8);
  }
});
test('kale büyük: 21×24, katlar arasında iç duvar yok, kale içinde uçtan uca görüş var', () => {
  const w = setup(),
    b = w.bases[0];
  assert.equal(CASTLE.halfX * 2, 21);
  assert.equal(CASTLE.halfZ * 2, 24);
  const a = worldPoint(b, -CASTLE.halfX + 1, -CASTLE.halfZ + 1, 1),
    c = worldPoint(b, CASTLE.halfX - 1, CASTLE.halfZ - 1, 1);
  assert.ok(clearSight(w, a, c));
  assert.equal(roomAt(w, a).room, roomAt(w, c).room);
});
test('başlangıçta veya zaman geçince rastgele altın doğmaz', () => {
  const w = setup();
  assert.equal(w.coins.length, 0);
  advance(w, 900);
  assert.equal(w.coins.length, 0);
});
test('ağaca yakın ve ona dönük sopa altın üretir; uzaktan veya ters yönde üretmez', () => {
  const w = setup(),
    p = w.players[0];
  p.x = 0;
  p.z = 2.5;
  p.angle = Math.PI;
  assert.ok(harvestTree(w, p));
  assert.equal(w.coins.length, 2);
  w.time++;
  p.angle = 0;
  assert.equal(harvestTree(w, p), false);
  p.z = 8;
  p.angle = Math.PI;
  assert.equal(harvestTree(w, p), false);
});
test('sopa hiçbir yerde altın düşürmez; ayaktakinin canı 1 azalır', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(v, roomPoint(w.bases[1], 0));
  Object.assign(a, { x: v.x, z: v.z - 1.4, floor: 0 });
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(v.gold, 12);
  assert.equal(v.hp, 2);
  a.x = 15;
  a.z = 10;
  v.x = 15;
  v.z = 11.4;
  v.px = v.pz = 0;
  a.attackCd = 0;
  v.hurt = 0;
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(v.gold, 12);
  assert.equal(v.hp, 1);
  assert.equal(w.coins.length, 0);
  assert.equal(v.stun, 0);
});
test('zıplama boyunca sopa ve bumerang etkisizdir', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  a.x = 10;
  a.z = 10;
  v.x = 10;
  v.z = 11.4;
  jump(w, 1);
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(v.gold, 12);
  assert.equal(v.stun, 0);
  assert.ok(v.stats.dodges > 0);
  a.attack = 0;
  a.throwCd = 0;
  throwClub(w, 0, v);
  advance(w, 5);
  assert.equal(v.stun, 0);
  assert.equal(v.held, null);
});
test('takım arkadaşları altın kaybetmez ve sersemlemez', () => {
  const w = setup('pvp'),
    a = w.players[0],
    v = w.players[2];
  a.x = 10;
  a.z = 10;
  v.x = 10;
  v.z = 11.4;
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(v.gold, 12);
  a.attack = 0;
  throwClub(w, 0, v);
  advance(w, 12);
  assert.equal(v.stun, 0);
  assert.ok(allied(w, 0, 2));
});
test('sersemleyen oyuncu eşyayı düşürür ve fırlatılan sopa tükenir', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  a.x = 10;
  a.z = 10;
  v.x = 10;
  v.z = 14;
  const i = addItem(w, null, 0, v.x, v.z);
  interact(w, 1);
  assert.equal(v.held, i.id);
  throwClub(w, 0, v);
  advance(w, 20);
  assert.ok(v.stun > 0);
  assert.equal(v.held, null);
  advance(w, 150);
  assert.equal(a.shot, null);
  assert.equal(a.hasClub, false);
});
test('kale içindeki farklı kattaki eşya görünmez; aynı kattaki her yer görünür', () => {
  const w = setup(),
    p = w.players[0],
    i = w.items[0],
    b = w.bases[0];
  Object.assign(p, roomPoint(b, 3));
  assert.ok(visibleTo(w, p, i));
  p.floor = 1;
  assert.equal(visibleTo(w, p, i), false);
  Object.assign(p, worldPoint(b, 0, 0));
  assert.ok(visibleTo(w, p, i));
  p.x = p.z = 0;
  assert.equal(visibleTo(w, p, i), false);
});
test('kendi kalende istenen katta istenen yere bırakılan eşya puan sayılır; dışarıda sayılmaz', () => {
  const w = setup(),
    p = w.players[0],
    b = w.bases[0],
    i = w.items[0];
  Object.assign(p, { x: i.x, z: i.z, floor: i.floor });
  interact(w, 0);
  const spot = worldPoint(b, 1.3, -7.1, 2);
  Object.assign(p, spot);
  interact(w, 0);
  assert.equal(i.floor, 2);
  assert.equal(i.base, 0);
  assert.ok(Math.hypot(i.x - spot.x, i.z - spot.z) < 1e-9);
  assert.equal(countItems(w, 0), 2);
  interact(w, 0);
  Object.assign(p, worldPoint(b, 0, -CASTLE.halfZ - 3, 0));
  interact(w, 0);
  assert.equal(i.base, null);
  assert.equal(countItems(w, 0), 1);
});
test('merdiven tek noktada; 1/2/3 doğrudan kat seçer, kat kısa tırmanma sonunda değişir, ön kapıda çalışmaz', () => {
  const w = setup(),
    p = w.players[0],
    b = w.bases[0];
  Object.assign(p, worldPoint(b, 0, -CASTLE.stairZ));
  assert.equal(nearStairs(w, p), false);
  assert.equal(useStairs(w, p, 1), false);
  Object.assign(p, worldPoint(b, 0, CASTLE.stairZ));
  assert.ok(useStairs(w, p, 2));
  assert.equal(p.floor, 0);
  assert.equal(p.climb.to, 2);
  assert.equal(useStairs(w, p, -1), false);
  advance(w, 20);
  assert.equal(p.floor, 0);
  advance(w, 40);
  assert.equal(p.floor, 2);
  assert.equal(p.climb, null);
  assert.ok(useStairs(w, p, -2));
  advance(w, 60);
  assert.equal(p.floor, 0);
  assert.equal(useStairs(w, p, 3), false);
});
test('bot rotaları bütün döndürülmüş kalelerin üst katına çıkıp geri döner', () => {
  const w = setup('pvp'),
    p = w.players[0];
  for (const b of w.bases) {
    Object.assign(p, { x: 0, z: 0, floor: 0 });
    const targets = [roomPoint(b, 3, 2), { x: 0, z: 0, floor: 0 }];
    for (const target of targets) {
      for (let n = 0; n < 2500; n++) {
        const t = route(w, p, target),
          dx = t.x - p.x,
          dz = t.z - p.z,
          d = Math.hypot(dx, dz),
          ox = p.x,
          oz = p.z;
        p.x += (dx / Math.max(d, 0.001)) * Math.min(d, 0.18);
        p.z += (dz / Math.max(d, 0.001)) * Math.min(d, 0.18);
        collide(w, p, ox, oz);
        if (p.climb) {
          p.floor = p.climb.to;
          p.climb = null;
        }
        if (p.floor === target.floor && Math.hypot(p.x - target.x, p.z - target.z) < 0.4) break;
      }
      assert.equal(p.floor, target.floor, 'floor at castle ' + b.id);
      assert.ok(Math.hypot(p.x - target.x, p.z - target.z) < 0.6, 'route at castle ' + b.id);
    }
  }
});
test('kale kapısı hep açık: sahibi içerideyken rakip kapıdan girip eşya alır', () => {
  const w = setup(),
    p = w.players[0],
    owner = w.players[1],
    b = w.bases[1];
  Object.assign(owner, roomPoint(b, 0));
  const out = worldPoint(b, 0, -8.8),
    inDoor = worldPoint(b, 0, -7.2);
  Object.assign(p, { ...out, floor: 0 });
  const ox = p.x,
    oz = p.z;
  p.x = inDoor.x;
  p.z = inDoor.z;
  collide(w, p, ox, oz);
  assert.ok(Math.hypot(p.x - inDoor.x, p.z - inDoor.z) < 0.01);
  advance(w, 60);
  assert.equal(p.stun, 0);
  const item = w.items.find(i => i.base === 1);
  Object.assign(p, { x: item.x, z: item.z, floor: item.floor });
  assert.ok(interact(w, 0));
  assert.equal(p.held, item.id);
});
test('kaledeki oyuncu dışarıyı görür; kale içinde yalnız bulunduğu kat görünür', () => {
  const w = setup(),
    p = w.players[0],
    out = w.players[1],
    same = w.players[2],
    other = w.players[3];
  Object.assign(p, roomPoint(w.bases[0], 0, 2));
  Object.assign(out, { x: 0, z: 5, floor: 0 });
  Object.assign(same, roomPoint(w.bases[0], 3, 2));
  Object.assign(other, roomPoint(w.bases[0], 0, 1));
  assert.ok(visibleTo(w, p, out));
  assert.ok(visibleTo(w, p, same));
  assert.ok(!visibleTo(w, p, other));
  assert.ok(!visibleTo(w, out, p));
});
test('10 eşya ve tam 60 saniye gerekir; eşya kaybı sayacı sıfırlar', () => {
  const w = setup();
  for (let n = 0; n < 8; n++) addItem(w, 0);
  advance(w, 1800);
  assert.equal(w.winner, null);
  const i = w.items[0];
  i.base = null;
  advance(w, 1);
  assert.equal(w.claimant, null);
  i.base = 0;
  advance(w, 3599);
  assert.equal(w.winner, null);
  advance(w, 3);
  assert.equal(w.winner, 0);
});
test('takım toplamı 20 olduğunda tek takım kazanır', () => {
  const w = setup('coop');
  for (let n = 0; n < 10; n++) addItem(w, 2);
  advance(w, 3602);
  assert.equal(w.winnerTeam, 0);
});
test('satın alma yalnız kalede ve yeterli altınla', () => {
  const w = setup(),
    p = w.players[0];
  assert.equal(buy(w, 0), false);
  p.gold = 20;
  p.x = p.z = 0;
  assert.equal(buy(w, 0), false);
  Object.assign(p, roomPoint(w.bases[0], 0));
  assert.ok(buy(w, 0));
  assert.equal(p.gold, 5);
});
test('ağ paketleri kale içindeki gizli eşya ve konumu göndermez', () => {
  const w = setup('pvp'),
    s = snapshotFor(w, 0);
  assert.equal(s.players[1].hidden, true);
  assert.equal(s.players[1].x, 0);
  assert.equal(s.bases[1].locked, w.bases[1].locked);
  assert.equal(s.items.filter(i => i.base === 1).length, 0);
  assert.ok(!JSON.stringify(s).includes('random'));
});
test('ağ girdisi konum ışınlama ve geçersiz değerleri reddeder', () => {
  const i = sanitizeInput({ x: Infinity, z: 50, aim: { x: NaN, z: 0 }, floor: 99, hit: 'yes', jump: true });
  assert.equal(i.x, 0);
  assert.equal(i.z, 1);
  assert.equal(i.aim, undefined);
  assert.equal(i.floor, undefined);
  assert.equal(i.hit, false);
  assert.equal(i.jump, true);
});
test('son savunmada botlar lider kaleye baskın yapar', () => {
  const w = setup();
  for (let n = 0; n < 8; n++) addItem(w, 4);
  w.players[1].bot = true;
  w.players[1].gold = 0;
  w.players[1].botThink = 0;
  step(w, 1 / 60);
  w.players[1].botThink = 0;
  w.players[1].goal = null;
  step(w, 1 / 60);
  assert.equal(w.claimant, 4);
  assert.equal(w.players[1].goal.type, 'search');
  assert.equal(w.players[1].goal.base, 4);
});
test('bot yakın mesafeden gelen sopaya anında zıplayamaz', () => {
  const w = setup(),
    p = w.players[1];
  Object.assign(p, { bot: true, x: 10, z: 10, botThink: 1, goal: { type: 'wander', x: 10, z: 10 } });
  w.random = () => 0;
  w.shots.push({ id: 900, owner: 0, x: 10, z: 7.5, dx: 0, dz: 1, floor: 0, travel: 0, age: 0 });
  advance(w, 10);
  assert.equal(p.stats.jumps, 0);
  assert.ok(p.stun > 0);
});
test('bot uzak sopaya en az 350 ms sonra kaçış deneyebilir', () => {
  const w = setup(),
    p = w.players[1];
  Object.assign(p, { bot: true, x: 10, z: 10, botThink: 2, goal: { type: 'wander', x: 10, z: 10 } });
  w.random = () => 0;
  w.shots.push({ id: 900, owner: 0, x: 10, z: -1, dx: 0, dz: 1, floor: 0, travel: 0, age: 0 });
  advance(w, 20);
  assert.equal(p.stats.jumps, 0);
  advance(w, 4);
  assert.equal(p.stats.jumps, 1);
  assert.ok(p.y > 0);
});
test('fırlatılan sopa 12 birimi geçer, 24 birimde sonlanır', () => {
  const w = setup(),
    p = w.players[0];
  Object.assign(p, { x: 12, z: 12 });
  throwClub(w, 0, { x: 12, z: 40 });
  advance(w, 40);
  assert.equal(w.shots.length, 1);
  assert.ok(w.shots[0].travel > 12);
  advance(w, 30);
  assert.equal(w.shots.length, 0);
});

test('sersemlemiş oyuncu karşılık verir ve aynı savuruş yalnız bir kez vurur', () => {
  const w = setup(),
    p = w.players[0],
    v = w.players[1];
  Object.assign(p, { x: 12, z: 12, stun: 1 });
  Object.assign(v, { x: 12, z: 13.5 });
  assert.ok(melee(w, 0, v));
  advance(w, 20);
  assert.equal(p.stats.hits, 1);
  assert.equal(v.hp, 2);
  assert.equal(v.gold, 12);
});
test('bumerang başlamış sopa savuruşunu iptal etmez', () => {
  const w = setup(),
    p = w.players[0],
    v = w.players[1];
  Object.assign(p, { x: 12, z: 12 });
  Object.assign(v, { x: 12, z: 13.5 });
  throwClub(w, 1, p);
  melee(w, 0, v);
  advance(w, 12);
  assert.ok(p.stun > 0);
  assert.equal(p.stats.hits, 1);
  assert.equal(v.hp, 2);
});
test('bot zengin botu kovalar, sopa savuruşunu görüp anında zıplamaz', () => {
  const w = setup(),
    p = w.players[1],
    rich = w.players[2];
  w.items = w.items.filter(i => i.base !== null);
  Object.assign(p, { bot: true, x: 12, z: 12, botThink: 0, gold: 0 });
  Object.assign(rich, { x: 12, z: 16, gold: 90 });
  Object.assign(w.players[0], { x: 14, z: 12, gold: 12, attack: 0.3 });
  step(w, 1 / 60);
  assert.equal(p.goal.type, 'rob');
  assert.equal(p.goal.id, 2);
  assert.equal(p.stats.jumps, 0);
});
test('gizli rakibin yalnız puanı ve altını herkese açıktır', () => {
  const w = setup('pvp');
  w.players[1].gold = 91;
  const s = snapshotFor(w, 0);
  assert.equal(s.players[1].gold, 91);
  assert.equal(s.players[1].hidden, true);
  assert.equal(s.players[1].x, 0);
});
test('takımlı maç 20 eşya hedefini başlangıçta doldurmaz', () => {
  const w = setup('pvp');
  advance(w, 120);
  assert.equal(w.claimant, null);
  assert.equal(w.winner, null);
  assert.equal(
    w.players.filter(p => p.team === 0).reduce((n, p) => n + countItems(w, p.id), 0),
    10,
  );
});

test('kale alarmı düşman içerdeyken sürer; dost ve dışarıdaki rakip tetiklemez', () => {
  const w = setup('pvp'),
    b = w.bases[0];
  assert.equal(castleInvaded(w, 0), false);
  Object.assign(w.players[2], roomPoint(b, 0));
  assert.equal(castleInvaded(w, 0), false);
  Object.assign(w.players[1], roomPoint(b, 2, 2));
  assert.equal(castleInvaded(w, 0), true);
  Object.assign(w.players[3], roomPoint(b, 1));
  w.players[1].x = 0;
  w.players[1].z = 0;
  assert.equal(castleInvaded(w, 0), true);
  w.players[3].x = 0;
  w.players[3].z = 0;
  assert.equal(castleInvaded(w, 0), false);
});
test('uzaktaki kale sahibine alarm gider ama davetsizin konumu gizli kalır', () => {
  const w = setup('pvp');
  w.players[0].x = w.players[0].z = 0;
  Object.assign(w.players[1], roomPoint(w.bases[0], 2, 2));
  const s = snapshotFor(w, 0);
  assert.equal(s.homeInvaded, true);
  assert.equal(castleInvaded(s, 0), true);
  assert.equal(s.players[1].hidden, true);
  assert.equal(s.players[1].x, 0);
  assert.equal(snapshotFor(w, 2).homeInvaded, false);
});

test('üç sopa yiyen bayılır, 5 altın düşürür, eşya vurulduğu yerde kalır; süre sonunda kalesinde canı dolu doğar', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(a, { x: 12, z: 12 });
  Object.assign(v, { x: 12, z: 13.4 });
  const item = addItem(w, null, 0, v.x, v.z);
  item.holder = 1;
  item.base = null;
  v.held = item.id;
  for (let n = 0; n < 3; n++) {
    Object.assign(v, { x: 12, z: 13.4, px: 0, pz: 0, hurt: 0, inv: 0 });
    a.attackCd = 0;
    melee(w, 0, v);
    advance(w, 9);
  }
  assert.equal(v.hp, 0);
  assert.ok(v.stun > RULES.stun - 0.5);
  assert.equal(v.stunTotal, RULES.stun);
  assert.equal(v.held, null);
  assert.ok(Math.hypot(item.x - 12, item.z - 13.4) < 1.5);
  assert.equal(v.gold, 7);
  assert.equal(w.coins.length, 5);
  assert.equal(a.stats.knockouts, 1);
  assert.ok(dist(v, w.bases[1]) > 5);
  advance(w, 610);
  assert.equal(v.stun, 0);
  assert.ok(dist(v, w.bases[1]) < 0.5);
  assert.equal(v.hp, 3);
  assert.equal(v.hasClub, true);
});
test('baygına vurulan her sopa bayılmayı 1 sn uzatır, toplam en çok 30 sn', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(a, { x: 12, z: 12 });
  Object.assign(v, { x: 12, z: 16 });
  throwClub(w, 0, v);
  for (let n = 0; n < 30 && v.stun === 0; n++) step(w, 1 / 60);
  assert.ok(v.stun > 0);
  a.hasClub = true;
  const hp = v.hp,
    before = v.stun;
  Object.assign(v, { x: 12, z: 13.4, px: 0, pz: 0 });
  a.attackCd = 0;
  melee(w, 0, v);
  advance(w, 9);
  assert.ok(Math.abs(v.stun - (before + 1 - 9 / 60)) < 0.02);
  assert.equal(v.hp, hp);
  for (let n = 0; n < 40; n++) {
    Object.assign(v, { x: 12, z: 13.4, px: 0, pz: 0, hurt: 0 });
    a.attackCd = 0;
    melee(w, 0, v);
    advance(w, 9);
  }
  assert.equal(v.stunTotal, RULES.maxStun);
  assert.ok(v.stun <= RULES.maxStun);
});
test('kale altınını rakip beklese de alamaz; sahibi alabilir', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(v, roomPoint(w.bases[0], 0));
  Object.assign(a, { x: v.x, z: v.z - 2 });
  v.gold = 3;
  throwClub(w, 0, v);
  advance(w, 8);
  assert.ok(v.stun > 0);
  v.stun = v.stunTotal = 0;
  a.x = a.z = 0;
  for (const c of w.coins) Object.assign(c, { x: v.x, z: v.z, vx: 0, vz: 0, age: 4 });
  v.px = v.pz = 0;
  advance(w, 1);
  assert.equal(v.gold, 0);
  assert.equal(w.coins.length, 5);
  Object.assign(a, { x: v.x, z: v.z });
  advance(w, 1);
  assert.equal(a.gold, 17);
  assert.equal(w.coins.length, 0);
});
test('kale sahibinin takım arkadaşı kale altınını toplayabilir', () => {
  const w = setup('pvp'),
    a = w.players[0],
    v = w.players[1],
    friend = w.players[2];
  Object.assign(v, roomPoint(w.bases[0], 0));
  Object.assign(a, { x: v.x, z: v.z - 2 });
  v.gold = 3;
  throwClub(w, 0, v);
  advance(w, 8);
  assert.ok(v.stun > 0);
  v.stun = v.stunTotal = 0;
  a.x = a.z = 0;
  Object.assign(friend, { x: v.x, z: v.z });
  for (const c of w.coins) Object.assign(c, { x: v.x, z: v.z, vx: 0, vz: 0, age: 4 });
  advance(w, 1);
  assert.equal(friend.gold, 17);
  assert.equal(v.gold, 0);
});
test('kale dışında altını olmayan rakip yeni altın üretmez', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(a, { x: 12, z: 12 });
  Object.assign(v, { x: 12, z: 13.4, gold: 0 });
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(w.coins.length, 0);
  assert.equal(v.gold, 0);
});

test('sersemleme 10 saniye sürer; oyuncu evde ayılır, eşya vurulduğu yerde kalır', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(a, { x: 12, z: 12 });
  Object.assign(v, { x: 12, z: 16 });
  const item = addItem(w, null, 0, v.x, v.z);
  interact(w, 1);
  throwClub(w, 0, v);
  for (let n = 0; n < 30 && v.stun === 0; n++) step(w, 1 / 60);
  assert.equal(v.stun, 10);
  const dropped = { x: item.x, z: item.z, floor: item.floor };
  advance(w, 599);
  assert.ok(v.stun > 0);
  assert.ok(Math.hypot(v.x - w.bases[1].x, v.z - w.bases[1].z) > 10);
  advance(w, 2);
  assert.equal(v.stun, 0);
  assert.equal(v.x, w.bases[1].x);
  assert.equal(v.z, w.bases[1].z);
  assert.equal(v.floor, 0);
  assert.ok(v.immune > 2.4);
  assert.equal(item.holder, null);
  assert.deepEqual({ x: item.x, z: item.z, floor: item.floor }, dropped);
});
test('üst katta sersemleyen bot da zemin kattaki kendi kalesine döner', () => {
  const w = setup('pvp'),
    p = w.players[3];
  Object.assign(p, roomPoint(w.bases[0], 2, 2), { bot: true, stun: 0.02 });
  step(w, 1 / 60);
  assert.ok(p.stun > 0);
  assert.equal(p.floor, 2);
  step(w, 1 / 60);
  assert.equal(p.stun, 0);
  assert.equal(p.floor, 0);
  assert.ok(Math.hypot(p.x - w.bases[3].x, p.z - w.bases[3].z) < 0.1);
});

test('fırlatılan sopa geri gelmez ve bekleyerek yenilenmez', () => {
  const w = setup(),
    p = w.players[0];
  p.x = p.z = 12;
  assert.ok(throwClub(w, 0, { x: 12, z: 20 }));
  assert.equal(p.hasClub, false);
  assert.equal(melee(w, 0), false);
  assert.equal(throwClub(w, 0), false);
  advance(w, 600);
  assert.equal(w.shots.length, 0);
  assert.equal(p.hasClub, false);
  assert.equal(interact(w, 0), false);
});
test('herhangi bir kalenin kapısındaki kasadan zemin katta E ile sopa alınır', () => {
  const w = setup('pvp'),
    p = w.players[0];
  p.hasClub = false;
  Object.assign(p, clubCrate(w.bases[3]));
  assert.ok(interact(w, 0));
  assert.equal(p.hasClub, true);
  p.hasClub = false;
  Object.assign(p, clubCrate(w.bases[0]));
  p.floor = 1;
  assert.equal(interact(w, 0), false);
  p.floor = 0;
  p.stun = 1;
  assert.equal(interact(w, 0), false);
  p.stun = 0;
  assert.ok(interact(w, 0));
  assert.equal(p.hasClub, true);
  assert.ok(melee(w, 0));
});
test('silahsız bot en yakın kasaya gider, başka kalenin kasası olsa da', () => {
  const w = setup(),
    p = w.players[1];
  const crate = clubCrate(w.bases[2]);
  Object.assign(p, { bot: true, hasClub: false, x: crate.x + 3, z: crate.z, botThink: 0, goal: null });
  for (let n = 0; n < 300 && !p.hasClub; n++) step(w, 1 / 60);
  assert.equal(p.hasClub, true);
  assert.ok(dist(p, crate) < 2.5);
});
test('kale içinde zıplama ve sopalaşma olur', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1],
    b = w.bases[2];
  Object.assign(a, worldPoint(b, -3, 2, 1));
  Object.assign(v, worldPoint(b, -3, 3.4, 1));
  jump(w, 1);
  advance(w, 6);
  assert.ok(v.y > 0);
  advance(w, 60);
  assert.equal(v.y, 0);
  melee(w, 0, v);
  advance(w, 9);
  assert.equal(v.hp, 2);
});
test('silahsız bot kalenin kapısına dönüp sopa alır', () => {
  const w = setup(),
    p = w.players[1];
  Object.assign(p, { bot: true, hasClub: false, botThink: 0 });
  advance(w, 900);
  assert.equal(p.hasClub, true);
  assert.ok(w.events.some(e => e.type === 'rearm' && e.player === 1));
});
test('bayılıp ya da canı bitip kalede doğan oyuncu elinde sopayla doğar', () => {
  const w = setup(),
    p = w.players[0];
  Object.assign(p, { x: 12, z: 12, hasClub: false, stun: 0.01 });
  step(w, 1 / 60);
  assert.equal(p.hasClub, true);
  assert.equal(p.z, w.bases[0].z);
  const a = w.players[1],
    v = w.players[2];
  Object.assign(a, { x: 14, z: 14, hasClub: true });
  Object.assign(v, { x: 14, z: 15.4, hasClub: false, hp: 1 });
  melee(w, 1, v);
  advance(w, 9);
  assert.equal(v.hp, 0);
  assert.ok(v.stun > 0);
  advance(w, 610);
  assert.equal(v.hp, 3);
  assert.equal(v.hasClub, true);
});

test('uzaktaki açık alan oyuncuları ve eşyaları mesafe sınırı olmadan görünür', () => {
  const w = setup('pvp'),
    p = w.players[0],
    v = w.players[1];
  Object.assign(p, { x: -70, z: 0 });
  Object.assign(v, { x: 70, z: 0 });
  const item = addItem(w, null, 0, 65, 0);
  assert.ok(visibleTo(w, p, v));
  assert.ok(visibleTo(w, p, item));
  const snapshot = snapshotFor(w, 0);
  assert.equal(snapshot.players[1].hidden, undefined);
  assert.equal(snapshot.players[1].x, 70);
  assert.ok(snapshot.items.some(i => i.id === item.id));
});

test('bayılan her zaman 5 altın düşürür, altını olmasa da; bakiye eksiye inmez', () => {
  for (const gold of [0, 2, 5, 12]) {
    const w = setup(),
      a = w.players[0],
      v = w.players[1];
    Object.assign(a, { x: 12, z: 12 });
    Object.assign(v, { x: 12, z: 16, gold });
    throwClub(w, 0, v);
    for (let n = 0; n < 30 && v.stun === 0; n++) step(w, 1 / 60);
    assert.ok(v.stun > 0);
    assert.equal(v.hp, 3);
    assert.equal(v.gold, Math.max(0, gold - 5));
    assert.equal(w.coins.length, 5);
    assert.ok(w.coins.every(c => c.castleOwner === undefined));
  }
});
test('kalede sersemletme altını doğru kata ve yalnız kale takımına düşer', () => {
  const w = setup('pvp'),
    a = w.players[0],
    v = w.players[1];
  Object.assign(v, roomPoint(w.bases[0], 0, 2), { gold: 7 });
  Object.assign(a, { x: v.x, z: v.z - 2, floor: 2 });
  throwClub(w, 0, v);
  advance(w, 8);
  assert.ok(v.stun > 0);
  assert.equal(v.gold, 2);
  assert.equal(w.coins.length, 5);
  assert.ok(w.coins.every(c => c.castleOwner === 0 && c.floor === 2));
});
test('kendi kalesinde bayılan sahip de 5 altın düşürür; bu altını rakip alamaz, yalnız kale takımı alır', () => {
  const w = setup(),
    a = w.players[0],
    v = w.players[1];
  Object.assign(v, roomPoint(w.bases[1], 0));
  Object.assign(a, { x: v.x, z: v.z - 2 });
  throwClub(w, 0, v);
  advance(w, 8);
  assert.ok(v.stun > 0);
  assert.equal(v.gold, 7);
  assert.equal(w.coins.length, 5);
  assert.ok(w.coins.every(c => c.castleOwner === 1));
  for (const c of w.coins) Object.assign(c, { x: a.x, z: a.z, vx: 0, vz: 0, age: 4 });
  advance(w, 2);
  assert.equal(a.gold, 12);
  assert.equal(w.coins.length, 5);
});
test('bot baygın rakibe sopa fırlatmaz', () => {
  const w = setup(),
    p = w.players[1],
    v = w.players[0];
  Object.assign(p, { bot: true, x: 12, z: 12, goal: { type: 'wander', x: 12, z: 12 }, botThink: 5, combatThink: 0 });
  Object.assign(v, { x: 12, z: 17, gold: 40, stun: 5, stunTotal: 10 });
  advance(w, 30);
  assert.ok(p.hasClub);
  assert.equal(w.shots.length, 0);
  v.stun = v.stunTotal = 0;
  v.immune = 0;
  p.combatThink = 0;
  advance(w, 30);
  assert.ok(!p.hasClub || w.shots.length > 0 || v.stun > 0);
});
test('merdivende tırmanırken yürünmez, zıplanmaz', () => {
  const w = setup(),
    p = w.players[0],
    b = w.bases[0];
  Object.assign(p, worldPoint(b, 0, CASTLE.stairZ));
  assert.ok(useStairs(w, p, 1));
  const x = p.x,
    z = p.z;
  advance(w, 20, { x: 1, z: 1, jump: true });
  assert.ok(Math.hypot(p.x - x, p.z - z) < 0.01);
  assert.equal(p.y, 0);
  advance(w, 40);
  assert.equal(p.floor, 1);
});
test('kalemdeki rakip baygınken alarm çalmaz; ayakta rakip varken çalar', () => {
  const w = setup(),
    v = w.players[1],
    x = w.players[2];
  Object.assign(v, roomPoint(w.bases[0], 1), { stun: 5 });
  assert.equal(castleInvaded(w, 0), false);
  Object.assign(x, roomPoint(w.bases[0], 2));
  assert.equal(castleInvaded(w, 0), true);
  x.stun = 3;
  assert.equal(castleInvaded(w, 0), false);
  v.stun = 0;
  assert.equal(castleInvaded(w, 0), true);
});
test('kolay ve normalde botlar eşyalarını hep 1. kata koyar; zorda üç kata dağıtır', () => {
  for (const difficulty of ['easy', 'normal']) {
    const w = createWorld(71, { difficulty });
    assert.equal(w.difficulty, difficulty);
    assert.ok(w.items.filter(i => i.base !== null && i.base !== 0).every(i => i.floor === 0));
    const bot = w.players[1];
    Object.assign(bot, roomPoint(w.bases[1], 0), { gold: 60 });
    for (let n = 0; n < 3; n++) assert.ok(buy(w, 1));
    assert.ok(w.items.filter(i => i.base === 1).every(i => i.floor === 0));
  }
  const h = createWorld(71, { difficulty: 'hard' });
  const bot = h.players[1];
  Object.assign(bot, roomPoint(h.bases[1], 0), { gold: 60 });
  for (let n = 0; n < 3; n++) buy(h, 1);
  assert.ok(new Set(h.items.filter(i => i.base === 1).map(i => i.floor)).size > 1);
  assert.ok(h.items.some(i => i.base === 0 && i.floor === 1));
});
test('zorda botun ağaç vuruşu 4 altın düşürür, oyuncununki 2; normalde bot da 2', () => {
  const hit = (difficulty, bot) => {
    const w = createWorld(71, { difficulty }),
      p = w.players[bot ? 1 : 0];
    Object.assign(p, { x: 0, z: 2.7, floor: 0, angle: Math.PI });
    w.treeReady = 0;
    assert.ok(harvestTree(w, p));
    return w.coins.length;
  };
  assert.equal(hit('hard', true), 4);
  assert.equal(hit('hard', false), 2);
  assert.equal(hit('normal', true), 2);
  assert.equal(hit('easy', true), 2);
});
test('geçersiz zorluk normal sayılır; oda zorluğu maça ve pakete geçer', () => {
  assert.equal(createWorld(71, { difficulty: 'x' }).difficulty, 'normal');
  const w = createWorld(71, { mode: 'pvp', difficulty: 'hard', humans: [0, 3] });
  assert.equal(w.players[3].bot, false);
  assert.equal(w.players[1].bot, true);
  assert.equal(snapshotFor(w, 0).difficulty, 'hard');
});
test('iki bot aynı rakibe yönelmez; ikinci bot boştaki başka rakibi seçer', () => {
  const w = setup(),
    a = w.players[1],
    b = w.players[2];
  w.random = () => 0;
  w.items = w.items.filter(i => i.base !== null);
  for (const i of w.items) i.base = 3;
  for (let n = 0; n < 4; n++) addItem(w, 4);
  for (const p of [a, b]) Object.assign(p, { bot: true, gold: 0, x: 0, z: 0, goal: null });
  a.goal = chooseGoal(w, a);
  assert.equal(a.goal.type, 'search');
  assert.equal(a.goal.base, 3);
  b.goal = chooseGoal(w, b);
  assert.equal(b.goal.type, 'search');
  assert.equal(b.goal.base, 4);
  a.stun = 5;
  b.goal = null;
  b.strategyUntil = 0;
  assert.equal(chooseGoal(w, b).base, 3);
});
test('geri sayım yokken botlar meydana düşen eşyaya odaklanır; iki bot aynı eşyaya gitmez; geri sayımda odak kalkar', () => {
  const w = setup(),
    a = w.players[1],
    b = w.players[2];
  w.items = w.items.filter(i => i.base !== null);
  const i1 = addItem(w, null, 0, 20, 0),
    i2 = addItem(w, null, 1, -20, 0);
  for (const p of [a, b]) Object.assign(p, { bot: true, gold: 40, x: 15, z: 0, goal: null });
  a.goal = chooseGoal(w, a);
  assert.deepEqual(a.goal, { type: 'raid', id: i1.id });
  b.goal = chooseGoal(w, b);
  assert.deepEqual(b.goal, { type: 'raid', id: i2.id });
  w.claimant = 4;
  b.goal = null;
  assert.notEqual(chooseGoal(w, b).type === 'raid' && chooseGoal(w, b).id === i2.id, true);
});
test('botlar ara sıra ağaca odaklanır, sırayla; geri sayımda ağaç zamanı yok', () => {
  const w = setup(),
    p = w.players[1];
  w.random = () => 0;
  addItem(w, 3);
  addItem(w, 3);
  w.items = w.items.filter(i => i.base !== null);
  Object.assign(p, { bot: true, gold: 0, x: 0, z: 20, goal: null });
  assert.notEqual(chooseGoal(w, p).type, 'tree');
  w.time = 14;
  const g = chooseGoal(w, p);
  assert.equal(g.type, 'tree');
  assert.ok(p.treeUntil >= 22 && p.treeUntil <= 26);
  assert.ok(p.nextTreeAt >= p.treeUntil + 15);
  w.time = p.treeUntil - 0.5;
  assert.equal(chooseGoal(w, p).type, 'tree');
  w.time = p.treeUntil + 1;
  p.goal = null;
  p.strategyUntil = 0;
  assert.notEqual(chooseGoal(w, p).type === 'tree' && p.treeUntil > w.time, true);
  const q = w.players[2];
  Object.assign(q, { bot: true, gold: 0 });
  w.time = 14;
  assert.equal(q.nextTreeAt, undefined);
  w.claimant = 3;
  w.time = 100;
  p.treeUntil = 0;
  assert.notEqual(chooseGoal(w, p).type, 'tree');
});
