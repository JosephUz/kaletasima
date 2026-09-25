import { visibleTo } from '../castle.js';
import { CASTLE } from '../config.js';
import { castleInvaded, countItems } from '../rules.js';

/**
 * Sunucu ↔ istemci paketleri. Sunucu her oyuncuya yalnız onun görebildiğini gönderir: görüş dışındaki rakiplerin konumu,
 * başka kattaki / kaledeki eşyalar ve uzak olaylar pakete girmez (hile ile okunamaz). Rakibin puanı ve altını herkese açıktır.
 */

/** Tek karelik eylemler: sunucu bunları bir sonraki adımda bir kez uygular, sonra sıfırlar. */
export const ACTIONS = ['hit', 'throw', 'grab', 'buy', 'jump'];

/** Ağdan gelen girdiyi sınırlar: yön [-1, 1], nişan harita içi, eylemler yalnız true, kat geçerli aralıkta. */
export function sanitizeInput(raw = {}) {
  if (!raw || typeof raw !== 'object') raw = {};
  const number = (n, limit) => (Number.isFinite(n) ? Math.max(-limit, Math.min(limit, n)) : 0);
  const out = { x: number(raw.x, 1), z: number(raw.z, 1), sprint: raw.sprint === true };
  if (raw.aim && Number.isFinite(raw.aim.x) && Number.isFinite(raw.aim.z))
    out.aim = { x: number(raw.aim.x, 200), z: number(raw.aim.z, 200) };
  for (const key of ACTIONS) out[key] = raw[key] === true;
  if (Number.isInteger(raw.floor) && raw.floor >= 0 && raw.floor < CASTLE.floors) out.floor = raw.floor;
  return out;
}

/** id koltuğundaki oyuncunun gördüğü dünya. */
export function snapshotFor(w, id) {
  const p = w.players[id];
  const players = w.players.map(v =>
    v.id === id || visibleTo(w, p, v)
      ? { ...v, goal: null }
      : {
          id: v.id,
          name: v.name,
          gold: v.gold,
          color: v.color,
          team: v.team,
          bot: v.bot,
          hidden: true,
          x: 0,
          z: 0,
          floor: 0,
          y: 0,
          vx: 0,
          vz: 0,
          angle: 0,
          held: null,
          stats: w.winner !== null ? v.stats : {},
        },
  );
  return {
    mode: w.mode,
    difficulty: w.difficulty,
    radius: w.radius,
    ring: w.ring,
    me: id,
    time: w.time,
    players,
    replicated: true,
    homeInvaded: castleInvaded(w, id),
    bases: w.bases.map(b => ({ ...b, count: countItems(w, b.id) })),
    items: w.items.filter(i => i.holder === id || visibleTo(w, p, i)),
    coins: w.coins.filter(i => visibleTo(w, p, i)),
    shots: w.shots.filter(i => i.owner === id || visibleTo(w, p, i)),
    claimant: w.claimant,
    claimTime: w.claimTime,
    winner: w.winner,
    winnerTeam: w.winnerTeam,
    events: w.events.filter(
      e =>
        e.type === 'win' ||
        e.type === 'claim' ||
        e.player === id ||
        e.victim === id ||
        (Number.isFinite(e.x) && visibleTo(w, p, e)),
    ),
  };
}
