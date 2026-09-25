import { allied, localPoint } from './castle.js';
import { CASTLE, RULES } from './config.js';

/** Simülasyonun ortak küçük yardımcıları: mesafe, kale içi, skor, olay kuyruğu. */
export const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function angleDelta(a, b) {
  return Math.atan2(Math.sin(b - a), Math.cos(b - a));
}
export function inside(p, b, margin = 0) {
  const q = localPoint(b, p);
  return Math.abs(q.x) < CASTLE.halfX + margin && Math.abs(q.z) < CASTLE.halfZ + margin;
}
export const targetScore = w => (w.mode === 'solo' ? RULES.target : RULES.teamTarget);
/** Kaledeki eşya sayısı. Çevrim içi istemcide sunucunun gönderdiği sayı (gizli eşyalar pakete girmez). */
export function countItems(w, id) {
  if (w.replicated) return w.bases[id]?.count || 0;
  return w.items.filter(i => i.base === id && i.holder === null).length;
}
/** Kale alarmı: kalede baygın olmayan bir rakip varsa. Baygın davetsiz tehdit sayılmaz (ayılınca kendi kalesine döner). */
export function castleInvaded(w, id) {
  if (w.replicated) return id === w.me && w.homeInvaded === true;
  return w.players.some(v => !allied(w, id, v.id) && !(v.stun > 0) && inside(v, w.bases[id]));
}
/** Kolay / normal'de bot kalesinin eşyaları hep zemin kata konur. */
export const botGroundFloor = (w, id) => !!w.players[id]?.bot && w.difficulty !== 'hard';
/** Olay kuyruğu: görünüm ve ses bunları okur, sunucu olayları ilgili oyunculara pakette gönderir. */
export function emit(w, type, extra = {}) {
  w.events.push({ type, time: w.time, ...extra });
}
