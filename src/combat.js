import { allied, castleAt, clearSight } from './castle.js';
import { RULES } from './config.js';
import { addCoin, dropHeld, harvestTree } from './items.js';
import { clamp, dist, emit } from './rules.js';

/**
 * Dövüş: sopa savuruşu (can götürür), fırlatılan sopa (bayıltır), zıplama (isabetlerden korur), bayılma ve kalede doğma.
 *  - Sopa darbesi altın düşürmez; ayaktakinin 1 canını götürür, can bitince bayıltır. Baygına her darbe bayılmayı uzatır.
 *  - Her bayılışta 5 altın yere düşer; bayılanın altını yetmese de (eksik üretilir, bakiye eksiye inmez).
 *  - Bayılma bitince oyuncu kendi kalesinin zemin katında canı dolu, elinde sopayla doğar.
 */

export function melee(w, id, aim = null) {
  const p = w.players[id];
  if (w.winner !== null || p.attackCd > 0 || !p.hasClub) return false;
  if (aim) {
    p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
  }
  p.attack = 0.36;
  p.attackCd = 0.55;
  p.attackDone = false;
  p.attackHits = [];
  emit(w, 'swing', { player: id });
  return true;
}
/** Eldeki tek sopayı fırlatır; sopa isabette, duvarda ya da menzil sonunda kaybolur (kasadan yenisi alınır). */
export function throwClub(w, id, aim = null) {
  const p = w.players[id];
  if (w.winner !== null || p.stun > 0 || !p.hasClub || p.shot !== null || p.attack > 0.18) return false;
  if (aim) p.angle = Math.atan2(aim.x - p.x, aim.z - p.z);
  const s = {
    id: w.nextId++,
    owner: id,
    x: p.x + Math.sin(p.angle) * 0.7,
    z: p.z + Math.cos(p.angle) * 0.7,
    dx: Math.sin(p.angle),
    dz: Math.cos(p.angle),
    travel: 0,
    age: 0,
    hit: false,
  };
  w.shots.push(s);
  s.floor = p.floor || 0;
  p.shot = s.id;
  p.hasClub = false;
  p.attack = 0;
  emit(w, 'throw', { player: id });
  return true;
}
/** Zıpla; havadayken bir kez daha (çift zıplama). Merdivende ve baygınken olmaz. */
export function jump(w, id) {
  const p = w.players[id];
  if (w.winner !== null || p.stun > 0) return false;
  if (p.climb) return false;
  if (p.y === 0 && p.vy === 0) p.airJumps = 0;
  else {
    if ((p.airJumps || 0) >= 1) return false;
    p.airJumps = (p.airJumps || 0) + 1;
    emit(w, 'airjump', { player: id, x: p.x, z: p.z, y: p.y, floor: p.floor || 0 });
  }
  p.vy = 6;
  p.stats.jumps++;
  return true;
}

function hitMelee(w, p, v) {
  if (allied(w, p.id, v.id)) return;
  if (v.y > 0 || v.vy > 0) {
    v.stats.dodges++;
    return;
  }
  if (v.inv > 0 || v.hurt > 0) return;
  // Sopa altın düşürmez. Ayaktaysa 1 can gider; baygınsa bayılma 1 sn uzar (toplam en çok RULES.maxStun).
  v.hurt = 0.45;
  p.stats.hits++;
  if (v.stun > 0) {
    const extend = Math.max(0, Math.min(RULES.stunExtend, RULES.maxStun - v.stunTotal));
    v.stun += extend;
    v.immune += extend;
    v.stunTotal += extend;
    emit(w, 'hit', { player: p.id, victim: v.id, extend, x: v.x, z: v.z });
    return;
  }
  const d = Math.max(0.01, dist(p, v));
  v.px += ((v.x - p.x) / d) * 3;
  v.pz += ((v.z - p.z) / d) * 3;
  v.hp = Math.max(0, (v.hp ?? RULES.hp) - 1);
  emit(w, 'hit', { player: p.id, victim: v.id, hp: v.hp, x: v.x, z: v.z });
  if (v.hp === 0) {
    p.stats.knockouts++;
    const gold = faint(w, v);
    emit(w, 'knockout', { player: p.id, victim: v.id, gold, x: v.x, z: v.z });
  }
}
/**
 * Bayılma (fırlatılan sopa ya da can bitmesi): süre bitince kalesinde sopayla doğar (bkz. world.js step → respawn). Eşya
 * vurulduğu yerde kalır. Her bayılışta 5 altın yere düşer; bayılanın altını yetmese de düşer, yani rakibi bayıltmak her
 * zaman altın kazandırır. Kale içinde düşeni yalnız o kalenin takımı toplar.
 */
function faint(w, v) {
  v.climb = null;
  v.stun = v.stunTotal = RULES.stun;
  v.immune = RULES.stun + 2.5;
  dropHeld(w, v);
  const base = castleAt(w, v),
    gold = RULES.stunGold;
  v.gold = Math.max(0, v.gold - gold);
  for (let i = 0; i < gold; i++) {
    const coin = addCoin(w, v.x, v.z, 1, v.id);
    coin.floor = v.floor || 0;
    if (base) coin.castleOwner = base.id;
  }
  return gold;
}
function stunPlayer(w, p, v) {
  if (allied(w, p.id, v.id)) return false;
  if (v.y > 0 || v.vy > 0) {
    v.stats.dodges++;
    return false;
  }
  if (v.inv > 0 || v.immune > 0 || v.stun > 0) return false;
  const gold = faint(w, v);
  const d = Math.max(0.01, dist(p, v));
  v.px += ((v.x - p.x) / d) * 2;
  v.pz += ((v.z - p.z) / d) * 2;
  p.stats.stuns++;
  emit(w, 'stun', { player: p.id, victim: v.id, gold, x: v.x, z: v.z });
  return true;
}
/** Bayılma bitti: kendi kalesinin zemin katında canı dolu, elinde sopayla doğar; kısa süre dokunulmazdır. */
export function respawn(w, p) {
  dropHeld(w, p);
  const b = w.bases[p.id];
  p.x = b.x;
  p.z = b.z;
  p.floor = 0;
  p.airJumps = 0;
  p.y = p.vy = p.vx = p.vz = p.px = p.pz = 0;
  p.stun = p.stunTotal = 0;
  p.hp = RULES.hp;
  p.hasClub = true;
  p.immune = Math.max(p.immune, 2.5);
  p.inv = 1;
  p.attack = 0;
  p.attackDone = true;
  p.moveX = p.moveZ = 0;
  p.climb = null;
  p.goal = null;
  p.botThink = 0.4;
  emit(w, 'respawn', { player: p.id, x: p.x, z: p.z });
}

/** Savuruşun isabet penceresi: ağaca ilk karede vurur, önündeki her rakibe savuruş başına bir kez. */
export function updateSwing(w, p, dt) {
  if (p.attack <= 0) return;
  p.attack = Math.max(0, p.attack - dt);
  if (!(p.attack < 0.28 && p.attack > 0.04)) return;
  if (!p.attackDone) {
    p.attackDone = true;
    harvestTree(w, p);
  }
  const fx = Math.sin(p.angle),
    fz = Math.cos(p.angle);
  p.attackHits ??= [];
  for (const v of w.players) {
    const d = dist(p, v);
    if (
      !p.attackHits.includes(v.id) &&
      !allied(w, p.id, v.id) &&
      d < RULES.meleeReach &&
      clearSight(w, p, v) &&
      ((v.x - p.x) * fx + (v.z - p.z) * fz) / Math.max(0.01, d) > -0.1 &&
      Math.abs(p.y - v.y) < 1.4
    ) {
      const hits = p.stats.hits;
      hitMelee(w, p, v);
      if (p.stats.hits > hits) p.attackHits.push(v.id);
    }
  }
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x,
    dz = b.z - a.z,
    l = dx * dx + dz * dz,
    t = l ? clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / l, 0, 1) : 0;
  return Math.hypot(p.x - a.x - dx * t, p.z - a.z - dz * t);
}
/** Uçan sopalar: bu karede kat ettiği doğru parçasına yakın ilk rakibi bayıltır. */
export function updateShots(w, dt) {
  for (let n = w.shots.length - 1; n >= 0; n--) {
    const s = w.shots[n],
      p = w.players[s.owner],
      old = { x: s.x, z: s.z };
    s.age += dt;
    const travel = RULES.throwSpeed * dt;
    s.x += s.dx * travel;
    s.z += s.dz * travel;
    s.travel += travel;
    let finished = !clearSight(w, { ...old, floor: s.floor }, s) || s.travel >= RULES.throwRange;
    if (!finished)
      for (const v of w.players)
        if (
          !allied(w, p.id, v.id) &&
          (v.floor || 0) === s.floor &&
          clearSight(w, s, v) &&
          segmentDistance(v, old, s) < 0.8
        ) {
          if (stunPlayer(w, p, v)) {
            s.hit = true;
            finished = true;
            break;
          }
        }
    if (finished) {
      if (p.shot === s.id) p.shot = null;
      w.shots.splice(n, 1);
    }
  }
}
