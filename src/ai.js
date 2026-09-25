import { allied, castleAt, clearSight, roomPoint, route, visibleTo } from './castle.js';
import { CASTLE, RULES } from './config.js';
import { jump, melee, throwClub } from './combat.js';
import { buy, interact, nearClubCrate, nearestClubCrate } from './items.js';
import { angleDelta, botGroundFloor, countItems, dist, inside } from './rules.js';

/**
 * Botlar. Her bot kısa aralıklarla bir hedef seçer (chooseGoal) ve ona yürür (updateBot); yakındaki rakibe anlık vurur,
 * kaçan taşıyıcıya sopa fırlatır, gelen sopadan gecikmeli zıplayarak kaçar. Öncelik sırası:
 *   sopa yoksa kasa → kalesini savunma → elindeki eşyayı eve götürme → meydandaki eşya (geri sayım yokken)
 *   → kazanma geri sayımında lider kaleye baskın → satın alma → ara sıra ağaç zamanı → eşya çalma / soygun / arama → ağaç.
 * Botlar hedef paylaşır: bir rakibe bir bot yöneldiyse ikinci bot yönelmez, tek yere çullanmazlar.
 */

/** Botun hedeflediği rakip: 'b'+kale/oyuncu id (baskın, arama, soygun aynı rakip sayılır) ya da yerdeki eşya için 'i'+id. */
function goalKey(w, g) {
  if (!g) return null;
  if (g.type === 'rob') return 'b' + g.id;
  if (g.type === 'search') return 'b' + g.base;
  if (g.type === 'raid') {
    const i = w.items.find(i => i.id === g.id);
    return i?.base != null ? 'b' + i.base : 'i' + g.id;
  }
  return null;
}
/** Başka bir (ayakta) bot bu hedefe zaten gidiyor mu? */
function targetTaken(w, p, key) {
  return w.players.some(o => o !== p && o.bot && o.stun <= 0 && goalKey(w, o.goal) === key);
}
const searchGoal = (w, base) => ({
  type: 'search',
  base,
  room: Math.floor(w.random() * 4),
  floor: Math.floor(w.random() * 3),
});

export function chooseGoal(w, p) {
  const own = w.bases[p.id];
  if (!p.hasClub) return { type: 'rearm' };
  const intruders = w.players
    .filter(v => !allied(w, p.id, v.id) && visibleTo(w, p, v) && inside(v, own, -0.2))
    .sort((a, b) => dist(p, a) - dist(p, b));
  if (intruders.length && dist(p, own) < CASTLE.halfZ + 10) return { type: 'defend', id: intruders[0].id };
  if (p.held !== null || countItems(w, p.id) >= RULES.target) return { type: 'home' };
  // Kazanma geri sayımı yokken meydana (kale dışına) düşmüş eşya önceliklidir: en yakın, başka botun gitmediği eşyaya yönel.
  if (w.claimant === null) {
    const loose = w.items
      .filter(i => i.holder === null && i.base === null && !castleAt(w, i) && !targetTaken(w, p, 'i' + i.id))
      .sort((a, b) => dist(p, a) - dist(p, b))[0];
    if (loose) return { type: 'raid', id: loose.id };
  }
  if (w.claimant !== null && !allied(w, p.id, w.claimant)) {
    const rivals = w.bases
      .filter(b => !allied(w, p.id, b.id) && !targetTaken(w, p, 'b' + b.id))
      .sort((a, b) => countItems(w, b.id) - countItems(w, a.id));
    const b = rivals[0];
    if (b) {
      if (p.goal?.type === 'search' && p.goal.base === b.id) return p.goal;
      return searchGoal(w, b.id);
    }
  }
  if (p.gold >= RULES.price) return { type: 'buy' };
  // Ara sıra ağaç zamanı: her bot kendi sırasıyla 8–12 sn ağaçtan altın çıkarır, sonra 15–30 sn başka işe döner.
  if (w.claimant === null) {
    if (p.treeUntil > w.time) return { type: 'tree' };
    if (w.time >= (p.nextTreeAt ?? 10 + p.id * 4)) {
      p.treeUntil = w.time + 8 + w.random() * 4;
      p.nextTreeAt = p.treeUntil + 15 + w.random() * 15;
      return { type: 'tree' };
    }
  }
  let best = null,
    score = -Infinity;
  for (const i of w.items) {
    if (
      i.holder !== null ||
      (i.base !== null && allied(w, i.base, p.id)) ||
      !visibleTo(w, p, i) ||
      targetTaken(w, p, i.base != null ? 'b' + i.base : 'i' + i.id)
    )
      continue;
    const b = i.base === null ? null : w.bases[i.base],
      d = dist(p, i),
      s = (b ? 10 : 8) - d * 0.35 + (b ? countItems(w, b.id) * 0.8 : 0) + w.random() * 2;
    if (s > score) {
      score = s;
      best = { type: 'raid', id: i.id };
    }
  }
  const coin = w.coins
    .filter(c => (c.castleOwner == null || allied(w, p.id, c.castleOwner)) && dist(p, c) < 9)
    .sort((a, b) => dist(p, a) - dist(p, b))[0];
  if (coin && p.gold < RULES.price && (dist(p, coin) < 3.5 || score < 4)) return { type: 'coin', id: coin.id };
  const rich = w.players
    .filter(
      v =>
        !allied(w, p.id, v.id) &&
        v.gold >= 30 &&
        visibleTo(w, p, v) &&
        !inside(v, w.bases[v.id]) &&
        !targetTaken(w, p, 'b' + v.id),
    )
    .sort((a, b) => b.gold - a.gold || dist(p, a) - dist(p, b))[0];
  if (rich) return { type: 'rob', id: rich.id };
  if (best) return best;
  if (['search', 'tree'].includes(p.goal?.type) && p.strategyUntil > w.time) return p.goal;
  const richest = w.bases
    .filter(b => !allied(w, b.id, p.id) && !targetTaken(w, p, 'b' + b.id))
    .sort((a, b) => countItems(w, b.id) - countItems(w, a.id));
  const b = richest[0],
    leaderScore = b ? countItems(w, b.id) : 0;
  if (b && (leaderScore > 2 || w.claimant !== null) && w.random() < 0.8) {
    if (p.goal?.type === 'search' && p.goal.base === b.id) return p.goal;
    p.strategyUntil = w.time + 14;
    return searchGoal(w, b.id);
  }
  p.strategyUntil = w.time + 10;
  return { type: 'tree' };
}

function steer(w, p, target) {
  target = route(w, p, target);
  const dx = target.x - p.x,
    dz = target.z - p.z,
    d = Math.hypot(dx, dz);
  p.moveX = d > 0.15 ? dx / d : 0;
  p.moveZ = d > 0.15 ? dz / d : 0;
}

/** Hedefe göre yürüme noktası; varılınca işi yap (bırak, satın al, sopa al, sonraki arama noktasına geç). */
function goalTarget(w, p, g) {
  const own = w.bases[p.id];
  if (g.type === 'home' || g.type === 'buy') {
    const target = roomPoint(own, p.id % 4, botGroundFloor(w, p.id) ? 0 : p.id % 3);
    if (dist(p, target) < 0.8 && (p.floor || 0) === target.floor) {
      if (p.held !== null) interact(w, p.id);
      if (p.gold >= RULES.price) buy(w, p.id);
      p.goal = null;
    }
    return target;
  }
  if (g.type === 'rearm') {
    const target = nearestClubCrate(w, p);
    if (nearClubCrate(w, p)) {
      interact(w, p.id);
      p.goal = null;
    }
    return target;
  }
  if (g.type === 'tree') {
    const a = (p.id * Math.PI * 2) / w.players.length;
    if (dist(p, { x: 0, z: 0 }) < 3.3) melee(w, p.id, { x: 0, z: 0 });
    return { x: Math.sin(a) * 2.65, z: Math.cos(a) * 2.65, floor: 0 };
  }
  if (g.type === 'search') {
    const target = roomPoint(w.bases[g.base], g.room, g.floor);
    if (dist(p, target) < 0.7 && (p.floor || 0) === g.floor) {
      g.room++;
      if (g.room >= 4) {
        g.room = 0;
        g.floor = (g.floor + 1) % 3;
      }
      p.botThink = 0;
    }
    return target;
  }
  if (g.type === 'rob') {
    const target = w.players[g.id];
    if (target.gold < 15 || !visibleTo(w, p, target) || inside(target, w.bases[target.id])) {
      p.goal = null;
      return null;
    }
    return target;
  }
  if (g.type === 'defend') {
    const target = w.players[g.id];
    if (!inside(target, own)) p.goal = null;
    return target;
  }
  if (g.type === 'raid') {
    const item = w.items.find(i => i.id === g.id);
    if (!item || item.holder !== null || item.base === p.id) {
      p.goal = null;
      return undefined;
    }
    if (dist(p, item) < 1.65 && visibleTo(w, p, item)) {
      interact(w, p.id);
      p.goal = null;
    }
    return item;
  }
  if (g.type === 'coin') {
    const target = w.coins.find(c => c.id === g.id);
    if (!target) p.goal = null;
    return target;
  }
  if (g.type === 'wander') return g;
  return null;
}

/** Yakın dövüş, fırlatma ve kaçınma: hedeften bağımsız, 220–400 ms aralıklı kararlar. */
function fight(w, p, dt) {
  const own = w.bases[p.id];
  // Botlar insanlarla olduğu kadar birbirleriyle de dövüşür.
  const enemy = w.players
    .filter(v => !allied(w, p.id, v.id) && v.inv <= 0 && dist(p, v) < 2.15 && clearSight(w, p, v))
    .sort((a, b) => dist(p, a) - dist(p, b))[0];
  p.combatThink = (p.combatThink || 0) - dt;
  const react = p.combatThink <= 0;
  if (react) p.combatThink = 0.22 + w.random() * 0.18;
  if (react && enemy && p.attackCd <= 0) {
    melee(w, p.id, enemy);
  }
  p.sprint = true;
  const threats = w.players
    .filter(v => !allied(w, p.id, v.id) && visibleTo(w, p, v) && dist(p, v) < 11)
    .sort(
      (a, b) =>
        (b.held !== null) - (a.held !== null) ||
        countItems(w, b.id) * 5 + b.gold / 3 - (countItems(w, a.id) * 5 + a.gold / 3),
    );
  // Baygına fırlatmak boşa gider (zaten baygın): yalnız ayaktakiler hedeflenir.
  const victim = threats.find(v => v.stun <= 0);
  if (
    react &&
    victim &&
    dist(p, victim) > 2.5 &&
    p.hasClub &&
    (victim.held !== null || victim.gold >= 30 || inside(victim, own))
  )
    throwClub(w, p.id, { x: victim.x + victim.vx * 0.18, z: victim.z + victim.vz * 0.18 });
  const incoming = w.shots.find(
    s =>
      !allied(w, p.id, s.owner) &&
      s.floor === (p.floor || 0) &&
      dist(p, s) < 12 &&
      visibleTo(w, p, s) &&
      (p.x - s.x) * s.dx + (p.z - s.z) * s.dz > 0 &&
      Math.abs((p.x - s.x) * s.dz - (p.z - s.z) * s.dx) < 1.6,
  );
  // Gelen sopa: 350–550 ms sonra, her sopa için tek seferde %35 olasılıkla zıplamayı dener (kusursuz kaçmaz).
  if (incoming) {
    if (p.dodgeShot !== incoming.id) {
      p.dodgeShot = incoming.id;
      p.dodgeAt = w.time + 0.35 + w.random() * 0.2;
    }
    if (w.time >= p.dodgeAt) {
      p.dodgeAt = Infinity;
      if (p.y === 0 && w.random() < 0.35) jump(w, p.id);
    }
  } else {
    p.dodgeShot = null;
    p.dodgeAt = Infinity;
  }
}

export function updateBot(w, p, dt) {
  if (p.stun > 0 || p.climb) {
    p.moveX = p.moveZ = 0;
    return;
  }
  p.botThink -= dt;
  if (p.botThink <= 0 || !p.goal) {
    p.goal = chooseGoal(w, p);
    p.botThink = 0.35 + w.random() * 0.25;
  }
  const target = goalTarget(w, p, p.goal);
  // undefined: hedef kayboldu, bu kare hiçbir şey yapma (eski davranış: yürüme ve dövüş kararları atlanır).
  if (target === undefined) {
    p.moveX = p.moveZ = 0;
    return;
  }
  if (target) {
    steer(w, p, target);
    if (p.attack <= 0) {
      p.angle += angleDelta(p.angle, Math.atan2(target.x - p.x, target.z - p.z)) * Math.min(1, dt * 13);
    }
  } else p.moveX = p.moveZ = 0;
  fight(w, p, dt);
}
