import { updateBot } from './ai.js';
import { allied, clearSight, collide, useStairs } from './castle.js';
import { COLORS, DIFFICULTIES, NAMES, RULES, TEAM_COLORS } from './config.js';
import { jump, melee, respawn, throwClub, updateShots, updateSwing } from './combat.js';
import { addItem, buy, interact } from './items.js';
import { angleDelta, countItems, dist, emit, targetScore } from './rules.js';

/**
 * Dünya: kurulum ve adım. Aynı kod iki yerde koşar:
 *  - tek başına oyunda tarayıcıda (src/main.js),
 *  - çevrim içi oyunda sunucuda (server/rooms.mjs); istemci yalnız görünür durumu kopyalar (src/net/client.js).
 * Solo 5 kişilik serbest rekabet; co-op ve PvP 5'e 5 iki takım, kaleler çemberde dönüşümlü dizilir, kapılar merkeze bakar.
 */
const TAU = Math.PI * 2;

export function createWorld(seed = 71, options = {}) {
  const mode = options.mode || 'solo',
    count = mode === 'solo' ? 5 : 10,
    humans = options.humans || [0];
  const w = {
    mode,
    difficulty: DIFFICULTIES.includes(options.difficulty) ? options.difficulty : 'normal',
    radius: count === 5 ? 74 : 100,
    ring: count === 5 ? 54 : 80,
    me: 0,
    time: 0,
    seed,
    players: [],
    bases: [],
    items: [],
    coins: [],
    shots: [],
    events: [],
    winner: null,
    nextId: 1,
    treeReady: 0,
    claimant: null,
    claimTime: 0,
  };
  w.random = () => {
    w.seed = (w.seed * 1664525 + 1013904223) >>> 0;
    return w.seed / 4294967296;
  };
  for (let i = 0; i < count; i++) {
    const a = (i * TAU) / count,
      x = Math.sin(a) * w.ring,
      z = Math.cos(a) * w.ring;
    w.bases.push({ id: i, x, z, angle: a, r: RULES.baseRadius });
    w.players.push({
      id: i,
      team: mode === 'solo' ? i : i % 2,
      name: options.names?.[i] || NAMES[i],
      color: mode === 'solo' ? COLORS[i] : TEAM_COLORS[i % 2],
      x,
      z,
      floor: 0,
      y: 0,
      vy: 0,
      vx: 0,
      vz: 0,
      px: 0,
      pz: 0,
      angle: a + Math.PI,
      gold: 12,
      hp: RULES.hp,
      airJumps: 0,
      stun: 0,
      stunTotal: 0,
      immune: 0,
      hurt: 0,
      attack: 0,
      attackDone: false,
      attackCd: 0,
      hasClub: true,
      shot: null,
      held: null,
      climb: null,
      inv: 0,
      moveX: 0,
      moveZ: 0,
      aimX: x,
      aimZ: z - 1,
      sprint: false,
      bot: !humans.includes(i),
      botThink: 0.2 + i * 0.17,
      goal: null,
      personality: i,
      stats: {
        hits: 0,
        knockouts: 0,
        stuns: 0,
        steals: 0,
        deposits: 0,
        purchases: 0,
        treeHits: 0,
        jumps: 0,
        dodges: 0,
        goldCollected: 0,
        distance: 0,
      },
    });
    addItem(w, i, i % 5);
    addItem(w, i, (i + 2) % 5);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i * TAU) / 5;
    addItem(w, null, i, Math.sin(a) * 4.1, Math.cos(a) * 4.1);
  }
  return w;
}

/** Oyuncu girdisi (klavye / ağ): hareket yönü, nişan ve tek karelik eylemler. Merdivende tırmanırken girdi yok sayılır. */
export function applyInput(w, p, input, dt) {
  if (p.climb) {
    p.moveX = p.moveZ = 0;
    return;
  }
  p.moveX = input.x || 0;
  p.moveZ = input.z || 0;
  p.sprint = !!input.sprint;
  if (input.aim && p.attack <= 0) {
    p.angle += angleDelta(p.angle, Math.atan2(input.aim.x - p.x, input.aim.z - p.z)) * (1 - Math.exp(-18 * dt));
  } else if (Math.hypot(p.moveX, p.moveZ) > 0.1 && p.attack <= 0)
    p.angle += angleDelta(p.angle, Math.atan2(p.moveX, p.moveZ)) * (1 - Math.exp(-16 * dt));
  if (input.jump) jump(w, p.id);
  if (Number.isInteger(input.floor)) useStairs(w, p, input.floor - (p.floor || 0));
  if (input.up) useStairs(w, p, 1);
  if (input.down) useStairs(w, p, -1);
  if (input.hit) melee(w, p.id, input.aim);
  if (input.throw) throwClub(w, p.id, input.aim);
  if (input.grab) interact(w, p.id);
  if (input.buy) buy(w, p.id);
}

/** Sayaçlar, bayılma bitince kalede doğma, merdiven tırmanışı. */
function updateTimers(w, p, dt) {
  const wasStunned = p.stun > 0;
  for (const k of ['stun', 'immune', 'hurt', 'inv', 'attackCd']) p[k] = Math.max(0, p[k] - dt);
  if (wasStunned && p.stun === 0) respawn(w, p);
  if (p.climb) {
    if (!p.climb.announced) {
      p.climb.announced = true;
      emit(w, 'stairs', { player: p.id, from: p.climb.from, to: p.climb.to });
    }
    p.climb.t -= dt;
    if (p.climb.t <= 0) {
      p.floor = p.climb.to;
      p.climb = null;
    }
  }
}

/** Hız, itilme, harita sınırı, duvar çarpışması ve zıplama yerçekimi. */
function move(w, p, dt) {
  const norm = Math.hypot(p.moveX, p.moveZ),
    speed =
      (p.held === null ? RULES.speed : RULES.carrySpeed) *
      (p.sprint ? RULES.sprint : 1) *
      (p.stun > 0 || p.climb ? 0 : p.attack > 0 ? 0.7 : 1);
  const blend = 1 - Math.exp(-RULES.accel * dt);
  p.vx += ((p.moveX / Math.max(1, norm)) * speed - p.vx) * blend;
  p.vz += ((p.moveZ / Math.max(1, norm)) * speed - p.vz) * blend;
  p.px *= Math.exp(-RULES.pushDrag * dt);
  p.pz *= Math.exp(-RULES.pushDrag * dt);
  const ox = p.x,
    oz = p.z;
  p.x += (p.vx + p.px) * dt;
  p.z += (p.vz + p.pz) * dt;
  const edge = Math.hypot(p.x, p.z);
  if (edge > w.radius) {
    p.x *= w.radius / edge;
    p.z *= w.radius / edge;
  }
  collide(w, p, ox, oz);
  p.stats.distance += Math.hypot(p.x - ox, p.z - oz);
  if (p.y > 0 || p.vy > 0) {
    p.vy -= 18 * dt;
    p.y = Math.max(0, p.y + p.vy * dt);
    if (p.y === 0) {
      p.vy = 0;
      p.airJumps = 0;
    }
  }
}

/** Yerdeki altınlar: kısa süre saçılır, sonra ayaktaki oyuncu toplar (kale altınını yalnız o kalenin takımı). */
function updateCoins(w, dt) {
  for (let i = w.coins.length - 1; i >= 0; i--) {
    const c = w.coins[i];
    c.age += dt;
    if (c.age < 0.8) {
      c.x += c.vx * dt;
      c.z += c.vz * dt;
      c.vx *= Math.exp(-5 * dt);
      c.vz *= Math.exp(-5 * dt);
    }
    for (const p of w.players)
      if (
        (c.castleOwner == null || allied(w, p.id, c.castleOwner)) &&
        p.stun <= 0 &&
        (p.floor || 0) === (c.floor || 0) &&
        dist(c, p) < 1.05 &&
        clearSight(w, p, c) &&
        c.age > 0.3 &&
        !(c.excluded === p.id && c.age < 1.1)
      ) {
        p.gold += c.value;
        p.stats.goldCollected += c.value;
        w.coins.splice(i, 1);
        emit(w, 'coin', { player: p.id, x: c.x, z: c.z });
        break;
      }
  }
}

/** Kazanma: solo 10, takım toplamı 50 eşya; hedefte RULES.winHold sn kesintisiz kalan kazanır. */
function updateClaim(w, dt) {
  const scores =
    w.mode === 'solo'
      ? w.players.map(p => countItems(w, p.id))
      : [0, 1].map(t => w.players.filter(p => p.team === t).reduce((n, p) => n + countItems(w, p.id), 0));
  const target = targetScore(w),
    contender = scores.findIndex(n => n >= target);
  const leader =
    contender < 0 ? null : w.mode === 'solo' ? w.players[contender] : w.players.find(p => p.team === contender);
  if (leader) {
    if (w.claimant !== leader.id) {
      w.claimant = leader.id;
      w.claimTime = 0;
      emit(w, 'claim', { player: leader.id });
    }
    w.claimTime += dt;
    if (w.claimTime >= RULES.winHold) {
      w.winner = leader.id;
      w.winnerTeam = leader.team;
      emit(w, 'win', { player: leader.id });
    }
  } else {
    w.claimant = null;
    w.claimTime = 0;
  }
}

/**
 * Bir simülasyon adımı. input: tek başına oyunda kahramanın (0) girdisi; inputs: çevrim içi oyunda koltuk başına girdiler.
 * Tüm zıplama girdileri saldırılar çözülmeden önce uygulanır.
 */
export function step(w, dt, input = {}, inputs = null) {
  if (w.winner !== null) return;
  dt = Math.min(dt, 0.05);
  w.time += dt;
  for (const p of w.players) if (!p.bot) applyInput(w, p, inputs?.[p.id] || (p.id === 0 ? input : {}), dt);
  for (const p of w.players) updateTimers(w, p, dt);
  for (const p of w.players) {
    if (p.bot) updateBot(w, p, dt);
    move(w, p, dt);
    updateSwing(w, p, dt);
    if (p.held !== null) {
      const i = w.items.find(i => i.id === p.held);
      i.x = p.x;
      i.z = p.z;
      i.floor = p.floor || 0;
    }
  }
  updateShots(w, dt);
  updateCoins(w, dt);
  updateClaim(w, dt);
}
