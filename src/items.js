import { allied, roomPoint, visibleTo, worldPoint } from './castle.js';
import { CASTLE, RULES } from './config.js';
import { botGroundFloor, dist, emit, inside } from './rules.js';

/** Eşyalar, altınlar, sopa kasaları, satın alma ve altın ağacı. */

function slotPosition(w, baseId, exclude = null) {
  const b = w.bases[baseId],
    used = w.items.filter(i => i.base === baseId && i.id !== exclude).map(i => i.slot);
  let slot = 0;
  while (used.includes(slot)) slot++;
  return { ...roomPoint(b, slot % 8, botGroundFloor(w, baseId) ? 0 : slot % 3), slot };
}
/** Kaleye (base) ya da yere (base null, x/z) eşya koyar. */
export function addItem(w, base = null, kind = 0, x = 0, z = 0) {
  const place = base === null ? { x, z, floor: 0, slot: -1 } : slotPosition(w, base);
  const item = { id: w.nextId++, kind, base, holder: null, ...place };
  w.items.push(item);
  return item;
}
/** Yere altın saçar; excluded oyuncu onu kısa bir süre toplayamaz (kendi düşürdüğünü hemen geri almasın). */
export function addCoin(w, x, z, value = 1, excluded = -1) {
  const c = {
    id: w.nextId++,
    x,
    z,
    value,
    age: 0,
    floor: 0,
    excluded,
    vx: (w.random() - 0.5) * 5,
    vz: (w.random() - 0.5) * 5,
  };
  w.coins.push(c);
  return c;
}
export function dropHeld(w, p) {
  if (p.held === null) return;
  const i = w.items.find(i => i.id === p.held);
  i.holder = null;
  i.base = null;
  i.x = p.x;
  i.z = p.z;
  i.floor = p.floor || 0;
  p.held = null;
  emit(w, 'drop', { player: p.id, item: i.id });
}

/** Her kalenin kapısının önünde bir sopa kasası vardır; herkes herhangi bir kasadan sopa alabilir. */
export const clubCrate = b => worldPoint(b, 2.5, -CASTLE.halfZ - 1.5);
export function nearClubCrate(w, p) {
  return (p.floor || 0) === 0 && p.y === 0 && w.bases.some(b => dist(p, clubCrate(b)) < 1.9);
}
export function nearestClubCrate(w, p) {
  return w.bases.map(clubCrate).sort((a, b) => dist(p, a) - dist(p, b))[0];
}

/**
 * E tuşu: kasadan sopa al, taşınan eşyayı bırak (kendi kalende istenen yere saklanır, dışarıda yere düşer) ya da yakındaki
 * görünen eşyayı al (rakip kaleden almak çalmadır).
 */
export function interact(w, id) {
  const p = w.players[id];
  if (w.winner !== null || p.stun > 0) return false;
  const own = w.bases[id];
  if (!p.hasClub && nearClubCrate(w, p)) {
    p.hasClub = true;
    emit(w, 'rearm', { player: id, x: p.x, z: p.z });
    return true;
  }
  if (p.held !== null) {
    const i = w.items.find(i => i.id === p.held);
    if (inside(p, own, -0.25)) {
      i.holder = null;
      i.base = id;
      Object.assign(i, { x: p.x, z: p.z, floor: p.floor || 0, slot: -1 });
      p.held = null;
      p.stats.deposits++;
      emit(w, 'deposit', { player: id, item: i.id, x: own.x, z: own.z });
    } else dropHeld(w, p);
    return true;
  }
  let best = null,
    d = 1.8;
  for (const i of w.items) {
    if (i.holder !== null || !visibleTo(w, p, i)) continue;
    if (i.base !== null && i.base !== id && allied(w, id, i.base)) continue;
    const n = dist(p, i);
    if (n < d) {
      best = i;
      d = n;
    }
  }
  if (!best) return false;
  if (best.base !== null && best.base !== id) {
    p.stats.steals++;
    emit(w, 'steal', { player: id, victim: best.base, item: best.id });
  }
  best.base = null;
  best.holder = id;
  p.held = best.id;
  emit(w, 'pickup', { player: id, item: best.id });
  return true;
}
/** B tuşu: kendi kalende RULES.price altına yeni eşya. */
export function buy(w, id) {
  const p = w.players[id];
  if (w.winner !== null || p.stun > 0 || !inside(p, w.bases[id]) || p.gold < RULES.price) return false;
  p.gold -= RULES.price;
  addItem(w, id, Math.floor(w.random() * 5));
  p.stats.purchases++;
  emit(w, 'buy', { player: id, x: p.x, z: p.z });
  return true;
}
/** Merkezdeki altın ağacına dönük sopa vuruşu altın çıkarır (zor'da bot vuruşu daha çok). */
export function harvestTree(w, p) {
  const d = Math.hypot(p.x, p.z);
  if (!p.hasClub || p.floor !== 0 || d > 3.4 || p.stun > 0 || w.time < w.treeReady || w.coins.length >= 80)
    return false;
  if ((-p.x * Math.sin(p.angle) - p.z * Math.cos(p.angle)) / Math.max(0.01, d) < 0.15) return false;
  w.treeReady = w.time + 0.22;
  p.stats.treeHits++;
  const n = p.bot && w.difficulty === 'hard' ? RULES.hardBotTreeGold : RULES.treeGold;
  for (let k = 0; k < n; k++) {
    const a = w.random() * Math.PI * 2;
    addCoin(w, Math.sin(a) * 1.9, Math.cos(a) * 1.9);
  }
  emit(w, 'treehit', { player: p.id, x: 0, z: 0 });
  return true;
}
