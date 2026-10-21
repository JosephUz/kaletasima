import { randomInt, randomUUID } from 'node:crypto';
import { DIFFICULTIES } from '../src/config.js';
import { ACTIONS, sanitizeInput, snapshotFor } from '../src/net/snapshot.js';
import { roomMode } from '../src/rules.js';
import { createWorld, step } from '../src/world.js';

/**
 * Odalar ve lobi (sunucu). Her oda 10 koltukludur (5 mavi, 5 kırmızı); boş koltukları botlar doldurur. Mod seçilmez:
 * oyuncuların hepsi aynı takıma oturursa co-op, iki takımda da oyuncu varsa PvP olur (bkz. src/rules.js roomMode). Kuran maçı başlatır; maç
 * sürerken boş koltuğa katılınabilir, kopan oyuncuyu bot devralır ve 60 sn içinde aynı sekmeden dönerse koltuğuna oturur.
 * Simülasyon 30 Hz koşar, her oyuncuya kendi gördüğü durum 15 Hz gönderilir (bkz. src/net/snapshot.js).
 *
 * Oda standardı (josephuz/docs/oda-standardi.md): oda kodu `KPRT-4` biçimindedir (4 harf + tire + 1 rakam, benzersiz);
 * `KPRT4` / küçük harf de kabul edilir. Oda kur (`create`) odayı hemen herkese açık kurar; kuran lobide zorluğu ve
 * görünürlüğü (`settings` → difficulty / private) değiştirir, oyuncuları başka koltuğa taşır (`move`; dolu koltukta yer
 * değiştirirler). Özel oda listede ve hızlı katılda görünmez, yalnız kodla / linkle girilir. Odada olmayan (giriş
 * ekranındaki) bağlantılara liste `rooms` iletisiyle gider: bağlanınca, istenince ve bir oda değişince (~250 ms toplanır,
 * değişmediyse hiç). Hızlı katıl (`quick`) en dolu bekleyen odaya, yoksa sürmekte olan bir maçın boş koltuğuna oturtur;
 * uygun oda yoksa herkese açık yeni oda kurar. Maç bitince oda kendiliğinden lobiye döner (oyuncular karneden
 * "LOBİYE DÖN" ile geçer), kuran yeniden başlatır.
 */
export const CODE_LETTERS = 'ABCDEFGHJKLMNPRSTUVYZ',
  CODE_DIGITS = '23456789';
/** Oda kodu girişi: büyük harf, boşluk / tire atılır, 4 harf + 1 rakamsa araya tire konur (`kprt4` → `KPRT-4`). */
export function normalizeCode(text) {
  const k = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{4}[0-9]$/.test(k) ? k.slice(0, 4) + '-' + k.slice(4) : k;
}
export function createRooms() {
  const rooms = new Map(),
    clients = new Map();
  const send = (c, m) => {
    if (c?.ws?.readyState === 1 && c.ws.bufferedAmount < 256 * 1024) c.ws.send(JSON.stringify(m));
  };
  const error = (c, message) => send(c, { type: 'error', message });
  const seated = r => r.seats.map((t, i) => (t && clients.get(t) ? i : -1)).filter(i => i >= 0);
  const lobby = r => ({
    type: 'lobby',
    code: r.code,
    mode: roomMode(seated(r)),
    difficulty: r.difficulty,
    state: r.state,
    private: r.private,
    host: clients.get(r.host)?.id,
    seats: r.seats.map((token, i) => {
      const c = clients.get(token);
      return { slot: i, team: i % 2, name: c?.name || 'Bot-' + (i + 1), id: c?.id || null, online: !!c?.ws };
    }),
  });
  const broadcast = r => {
    for (const token of r.seats) send(clients.get(token), lobby(r));
    listChanged();
  };
  // Açık oda listesi: herkese açık ve içinde bağlı en az bir oyuncu bulunan odalar (dolu oda "DOLU" diye görünür).
  // Bekleyenler önce, sonra en kalabalık. Hızlı katıl yalnız boş koltuğu olanı seçer.
  const humans = r => r.seats.filter(Boolean).length;
  const listed = r => !r.private && r.seats.some(t => clients.get(t)?.ws);
  const openRooms = () =>
    [...rooms.values()]
      .filter(listed)
      .sort((a, b) => (a.state === 'lobby' ? 0 : 1) - (b.state === 'lobby' ? 0 : 1) || humans(b) - humans(a));
  function newCode() {
    for (;;) {
      let k = '';
      for (let i = 0; i < 4; i++) k += CODE_LETTERS[randomInt(CODE_LETTERS.length)];
      k += '-' + CODE_DIGITS[randomInt(CODE_DIGITS.length)];
      if (!rooms.has(k)) return k;
    }
  }
  const roomList = () => ({
    type: 'rooms',
    list: openRooms()
      .slice(0, 20)
      .map(r => ({
        code: r.code,
        host: clients.get(r.host)?.name || '',
        mode: roomMode(seated(r)),
        difficulty: r.difficulty,
        state: r.state,
        players: humans(r),
        seats: r.seats.length,
      })),
  });
  // Değişince giriş ekranındakilere yay: ~250 ms toplanır, yalnız liste gerçekten değiştiyse.
  let listSent = '',
    listTimer = null;
  function listChanged() {
    if (listTimer) return;
    listTimer = setTimeout(() => {
      listTimer = null;
      const m = JSON.stringify(roomList());
      if (m === listSent) return;
      listSent = m;
      for (const c of clients.values())
        if (!c.room && c.ws?.readyState === 1 && c.ws.bufferedAmount < 256 * 1024) c.ws.send(m);
    }, 250);
    listTimer.unref?.();
  }
  // Çevrim içi sayısı: siteyi açan her sekme boşta bir bağlantı tutar (bkz. src/main.js). Değişince herkese, en çok 2 sn'de bir yayılır.
  const onlineCount = () => {
    let n = 0;
    for (const c of clients.values()) if (c.ws) n++;
    return n;
  };
  let onlineSent = -1,
    onlineTimer = null;
  function onlineChanged() {
    if (onlineTimer) return;
    onlineTimer = setTimeout(() => {
      onlineTimer = null;
      const n = onlineCount();
      if (n === onlineSent) return;
      onlineSent = n;
      for (const c of clients.values()) send(c, { type: 'online', n });
    }, 2000);
    onlineTimer.unref?.();
  }
  function startClient(r, c) {
    send(c, { type: 'start', world: snapshotFor(r.world, c.slot) });
  }
  function leave(c) {
    const r = rooms.get(c.room);
    if (!r) return;
    c.room = null;
    const i = r.seats.indexOf(c.token);
    if (i >= 0) {
      r.seats[i] = null;
      if (r.world) {
        r.world.players[i].bot = true;
        r.world.players[i].name = 'Bot-' + (i + 1);
        delete r.inputs[i];
      }
    }
    if (r.host === c.token) r.host = r.seats.find(t => clients.get(t)?.ws) || r.seats.find(Boolean) || null;
    if (!r.seats.some(Boolean)) {
      rooms.delete(r.code);
      listChanged();
    } else broadcast(r);
  }
  function occupy(r, c, slot) {
    if (r.seats[slot] || slot < 0 || slot > 9) return false;
    const old = r.seats.indexOf(c.token);
    if (old >= 0) r.seats[old] = null;
    r.seats[slot] = c.token;
    c.slot = slot;
    c.room = r.code;
    if (r.world) {
      Object.assign(r.world.players[slot], { bot: false, name: c.name });
      delete r.inputs[slot];
      // Maç sürerken karşı takıma katılan olursa co-op PvP'ye döner.
      r.world.mode = roomMode(seated(r));
    }
    return true;
  }
  function begin(r) {
    r.world = createWorld(71, {
      mode: roomMode(seated(r)),
      difficulty: r.difficulty,
      humans: r.seats.map((t, i) => (clients.get(t)?.ws ? i : -1)).filter(i => i >= 0),
    });
    r.inputs = {};
    r.state = 'playing';
    for (const p of r.world.players) {
      const c = clients.get(r.seats[p.id]);
      p.bot = !c?.ws;
      if (c) p.name = c.name;
    }
    for (const t of r.seats) {
      const c = clients.get(t);
      if (c?.ws) startClient(r, c);
    }
    broadcast(r);
  }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const c of clients.values())
      if (!c.ws && now - c.disconnected > 60000) {
        leave(c);
        clients.delete(c.token);
      }
    for (const r of rooms.values()) {
      if (r.state !== 'playing' || !r.seats.some(t => clients.get(t)?.ws)) continue;
      const inputs = {};
      for (const [id, v] of Object.entries(r.inputs)) {
        inputs[id] = now - v.at < 350 ? { ...v.input } : {};
        for (const k of ACTIONS) v.input[k] = false;
        delete v.input.floor;
      }
      step(r.world, 1 / 30, {}, inputs);
      r.tick++;
      if (r.tick % 2 === 0 || r.world.winner !== null) {
        for (const t of r.seats) {
          const c = clients.get(t);
          if (c?.ws) send(c, { type: 'snapshot', world: snapshotFor(r.world, c.slot) });
        }
        r.world.events.length = 0;
      }
      // Maç bitti: kazananlı son paket gitti; oda lobiye döner, kuran yeniden başlatır.
      if (r.world.winner !== null) {
        r.world = null;
        r.inputs = {};
        r.state = 'lobby';
        broadcast(r);
      }
    }
  }, 1000 / 30);
  timer.unref();
  return {
    stats: () => ({ rooms: rooms.size, online: onlineCount() }),
    /** Yalnız testler: odanın iç durumu (ör. maçı bitirmek için winner yazılır). */
    room: code => rooms.get(code),
    close: () => {
      clearInterval(timer);
      clearTimeout(onlineTimer);
      clearTimeout(listTimer);
    },
    attach(ws) {
      let c = null,
        packets = 0,
        windowStart = Date.now();
      ws.on('message', data => {
        if (Date.now() - windowStart > 1000) {
          windowStart = Date.now();
          packets = 0;
        }
        if (++packets > 100) return;
        let m;
        try {
          m = JSON.parse(String(data));
        } catch {
          return;
        }
        if (!m || typeof m !== 'object') return;
        if (m.type === 'hello') {
          if (c) return;
          const old = typeof m.token === 'string' ? clients.get(m.token) : null;
          if (old && !old.ws) {
            c = old;
            c.ws = ws;
            c.disconnected = 0;
          } else {
            c = {
              id: randomUUID(),
              token: randomUUID(),
              name: String(m.name || 'Kale Taşımacılık').slice(0, 16),
              ws,
              room: null,
              slot: 0,
            };
            clients.set(c.token, c);
          }
          send(c, { type: 'welcome', id: c.id, token: c.token, room: rooms.get(c.room)?.code || null });
          send(c, { type: 'online', n: onlineCount() });
          onlineChanged();
          if (!c.room) send(c, roomList());
          const r = rooms.get(c.room);
          if (r) {
            if (r.world) {
              r.world.players[c.slot].bot = false;
              startClient(r, c);
            }
            broadcast(r);
          }
          return;
        }
        if (!c) return;
        if (m.type === 'ping') {
          send(c, { type: 'pong', at: m.at });
          return;
        }
        if (m.type === 'leave') {
          leave(c);
          send(c, { type: 'left' });
          send(c, roomList());
          return;
        }
        if (m.type === 'rooms') {
          send(c, roomList());
          return;
        }
        if (['create', 'join', 'quick'].includes(m.type) && typeof m.name === 'string' && m.name.trim())
          c.name = m.name.trim().slice(0, 16);
        // Hızlı katıl: listenin başındaki oda (bekleyen, en kalabalık); yoksa herkese açık yeni oda.
        if (m.type === 'quick') {
          const r = openRooms().find(r => r.code !== c.room && r.seats.some(t => !t));
          m = r ? { type: 'join', code: r.code } : { type: 'create', difficulty: m.difficulty };
        }
        if (m.type === 'create') {
          if (rooms.size >= 32) return error(c, 'Oda sınırına ulaşıldı.');
          leave(c);
          const code = newCode();
          const r = {
            code,
            difficulty: DIFFICULTIES.includes(m.difficulty) ? m.difficulty : 'normal',
            private: false,
            host: c.token,
            seats: Array(10).fill(null),
            state: 'lobby',
            world: null,
            inputs: {},
            tick: 0,
          };
          rooms.set(code, r);
          occupy(r, c, 0);
          broadcast(r);
          return;
        }
        if (m.type === 'join') {
          const r = rooms.get(normalizeCode(m.code));
          if (!r) return error(c, 'Böyle bir oda yok');
          if (c.room === r.code) {
            broadcast(r);
            return;
          }
          const slot = r.seats.findIndex(t => !t);
          if (slot < 0) return error(c, 'Oda dolu');
          leave(c);
          occupy(r, c, slot);
          broadcast(r);
          if (r.world) startClient(r, c);
          return;
        }
        const r = rooms.get(c.room);
        if (!r) return;
        if (m.type === 'seat' && r.state === 'lobby') {
          if (!Number.isInteger(m.slot) || !occupy(r, c, m.slot)) error(c, 'Bu koltuğa geçilemiyor.');
          else broadcast(r);
        }
        const host = r.host === c.token;
        // Kuranın ayarları (yalnız lobide): zorluk ve görünürlük (herkese açık / özel).
        if (m.type === 'settings' && host && r.state === 'lobby') {
          if (DIFFICULTIES.includes(m.difficulty)) r.difficulty = m.difficulty;
          if (typeof m.private === 'boolean') r.private = m.private;
          broadcast(r);
        }
        // Kuran bir oyuncuyu başka koltuğa taşır; dolu koltuğa taşırsa ikisi yer değiştirir.
        if (m.type === 'move' && host && r.state === 'lobby') {
          const { from, to } = m,
            ok = n => Number.isInteger(n) && n >= 0 && n < r.seats.length;
          if (!ok(from) || !ok(to) || from === to || !r.seats[from]) return error(c, 'Bu koltuğa geçilemiyor.');
          const a = r.seats[from],
            b = r.seats[to];
          r.seats[to] = a;
          r.seats[from] = b;
          clients.get(a).slot = to;
          if (b) clients.get(b).slot = from;
          broadcast(r);
        }
        if (m.type === 'start' && host && r.state === 'lobby') begin(r);
        if (m.type === 'input' && r.state === 'playing') {
          const next = sanitizeInput(m.input),
            old = r.inputs[c.slot]?.input;
          for (const k of ACTIONS) next[k] = next[k] || old?.[k] || false;
          if (next.floor === undefined && old?.floor !== undefined) next.floor = old.floor;
          r.inputs[c.slot] = { input: next, at: Date.now() };
        }
      });
      ws.on('close', () => {
        if (!c || c.ws !== ws) return;
        c.ws = null;
        c.disconnected = Date.now();
        onlineChanged();
        const r = rooms.get(c.room);
        if (r) {
          if (r.world) {
            r.world.players[c.slot].bot = true;
            delete r.inputs[c.slot];
          }
          if (r.host === c.token) r.host = r.seats.find(t => clients.get(t)?.ws) || c.token;
          broadcast(r);
        }
      });
      ws.on('error', () => {});
    },
  };
}
