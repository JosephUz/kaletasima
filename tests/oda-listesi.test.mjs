/**
 * Açık oda listesi ve hızlı katıl (server/rooms.mjs): sunucu süreç içinde, rastgele bir portta açılır; gerçek WebSocket
 * istemcileriyle denenir. Çalışan bir sunucu (5185) gerekmez.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, test } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import { createRooms } from '../server/rooms.mjs';

let server, wss, rooms, adres;
const soketler = [];
before(async () => {
  rooms = createRooms();
  server = http.createServer();
  wss = new WebSocketServer({ server });
  wss.on('connection', ws => rooms.attach(ws));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  adres = 'ws://127.0.0.1:' + server.address().port;
});
after(async () => {
  for (const ws of soketler) ws.terminate();
  rooms.close();
  wss.close();
  await new Promise(r => server.close(r));
});

async function istemci(name) {
  const ws = new WebSocket(adres),
    q = [],
    bekleyen = [];
  soketler.push(ws);
  ws.on('message', b => {
    q.push(JSON.parse(String(b)));
    for (const f of [...bekleyen]) f();
  });
  await new Promise((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  const next = (type, kosul = () => true) =>
    new Promise((resolve, reject) => {
      const zaman = setTimeout(() => {
        temizle();
        reject(new Error('Zaman aşımı: ' + type));
      }, 4000);
      const temizle = () => {
        clearTimeout(zaman);
        const i = bekleyen.indexOf(bak);
        if (i >= 0) bekleyen.splice(i, 1);
      };
      const bak = () => {
        const i = q.findIndex(m => m.type === type && kosul(m));
        if (i >= 0) {
          const [m] = q.splice(i, 1);
          temizle();
          resolve(m);
        }
      };
      bekleyen.push(bak);
      bak();
    });
  const send = (type, body = {}) => ws.send(JSON.stringify({ type, ...body }));
  send('hello', { name });
  const welcome = await next('welcome');
  // Bağlanınca liste kendiliğinden gelir.
  await next('rooms');
  const liste = async () => {
    q.splice(0, q.length, ...q.filter(m => m.type !== 'rooms'));
    send('rooms');
    return (await next('rooms')).list;
  };
  return { ws, send, next, welcome, liste, q };
}
const kapat = c =>
  new Promise(r => {
    c.ws.once('close', r);
    c.ws.close();
  });

test('herkese açık oda listelenir, özel oda listede yok', async () => {
  const a = await istemci('Ayşe'),
    b = await istemci('Burak'),
    gozcu = await istemci('Gözcü');
  a.send('create', { difficulty: 'hard' });
  const acik = await a.next('lobby');
  assert.equal(acik.private, false);
  b.send('create', { private: true });
  assert.equal((await b.next('lobby')).private, false, 'oda her zaman herkese açık kurulur');
  b.send('settings', { private: true });
  const ozel = await b.next('lobby', m => m.private);
  assert.equal(ozel.private, true);
  const liste = await gozcu.liste();
  const satir = liste.find(o => o.code === acik.code);
  assert.deepEqual(satir, {
    code: acik.code,
    host: 'Ayşe',
    mode: 'coop',
    difficulty: 'hard',
    state: 'lobby',
    players: 1,
    seats: 10,
  });
  assert.ok(!liste.some(o => o.code === ozel.code), 'özel oda listede görünmez');
  assert.ok(!JSON.stringify(liste).includes(a.welcome.token), 'jeton listede yok');
  // Özel odaya kodla yine girilir.
  gozcu.send('join', { code: ozel.code });
  assert.equal((await gozcu.next('lobby')).code, ozel.code);
  for (const c of [a, b, gozcu]) await kapat(c);
});

test('liste değişince giriş ekranındakilere kendiliğinden gelir; boşalan oda düşer', async () => {
  const gozcu = await istemci('Gözcü'),
    a = await istemci('Kurucu');
  a.send('create', {});
  const { code } = await a.next('lobby');
  await gozcu.next('rooms', m => m.list.some(o => o.code === code));
  a.send('leave');
  await gozcu.next('rooms', m => !m.list.some(o => o.code === code));
  for (const c of [a, gozcu]) await kapat(c);
});

test('hızlı katıl: ikinci oyuncu ilkin bekleyen odasına oturur, en kalabalık oda önce', async () => {
  const a = await istemci('A'),
    b = await istemci('B'),
    c = await istemci('C'),
    d = await istemci('D');
  a.send('quick', { difficulty: 'easy' });
  const odaA = await a.next('lobby');
  assert.equal(odaA.difficulty, 'easy', 'uygun oda yoksa seçilen zorlukla yeni oda');
  assert.equal(odaA.private, false);
  b.send('quick');
  const odaB = await b.next('lobby');
  assert.equal(odaB.code, odaA.code, 'B, A’nın odasına katılır');
  assert.equal(odaB.seats.filter(s => s.id).length, 2);
  // Başka bir tek kişilik oda: hızlı katıl yine kalabalık olanı seçer.
  c.send('create', {});
  const odaC = await c.next('lobby');
  d.send('quick');
  assert.equal((await d.next('lobby')).code, odaA.code);
  // Özel oda hızlı katılda seçilmez.
  const e = await istemci('E'),
    f = await istemci('F');
  for (const x of [a, b, d, c]) x.send('leave');
  await Promise.all([a, b, d, c].map(x => x.next('left')));
  e.send('create', {});
  await e.next('lobby');
  e.send('settings', { private: true });
  const ozel = await e.next('lobby', m => m.private);
  f.send('quick');
  const odaF = await f.next('lobby');
  assert.notEqual(odaF.code, ozel.code, 'özel odaya hızlı katılınmaz');
  assert.equal(odaF.seats.filter(s => s.id).length, 1, 'yeni oda kurulur');
  assert.equal(odaF.host, f.welcome.id, 'kuran oda sahibi');
  assert.notEqual(odaC.code, odaF.code);
  for (const x of [a, b, c, d, e, f]) await kapat(x);
});

test('dolu oda listede DOLU olarak durur ama hızlı katılda seçilmez; sürmekte olan maç bekleyen odadan sonra gelir', async () => {
  const sahip = await istemci('Sahip');
  sahip.send('create', {});
  const dolu = await sahip.next('lobby');
  const diger = [];
  for (let i = 0; i < 9; i++) {
    const c = await istemci('K' + i);
    c.send('join', { code: dolu.code });
    await c.next('lobby');
    diger.push(c);
  }
  const gozcu = await istemci('Gözcü');
  const doluSatir = (await gozcu.liste()).find(o => o.code === dolu.code);
  assert.equal(doluSatir?.players, 10, 'dolu oda listede, 10/10');
  gozcu.send('join', { code: dolu.code });
  assert.equal((await gozcu.next('error')).message, 'Oda dolu');
  // Dolu odadan biri çıkınca boş koltuk açılır: maç başlatılınca "playing" olarak listelenir.
  diger.pop().send('leave');
  sahip.send('start');
  await sahip.next('start');
  await gozcu.next('rooms', m => m.list.some(o => o.code === dolu.code && o.state === 'playing' && o.players === 9));
  // Bekleyen bir oda açılınca o önce gelir; hızlı katıl onu seçer.
  const bekleyen = await istemci('Bekleyen');
  bekleyen.send('create', {});
  const odaB = await bekleyen.next('lobby');
  const liste = await gozcu.liste();
  assert.equal(liste[0].code, odaB.code, 'bekleyen oda önce');
  assert.equal(liste[1].code, dolu.code);
  gozcu.send('quick');
  assert.equal((await gozcu.next('lobby')).code, odaB.code);
  for (const c of [sahip, gozcu, bekleyen, ...diger]) await kapat(c);
});

// Oda standardı (josephuz/docs/oda-standardi.md): kod biçimi, giriş düzeltme, anında kurma, kuranın ayarları ve
// koltuk taşıma, maç sonunda lobiye dönüş, yenilenen sayfanın odasına dönüş.
const KOD = /^[ABCDEFGHJKLMNPRSTUVYZ]{4}-[23456789]$/;

test('oda kodu KPRT-4 biçiminde ve benzersiz; KPRT4 / küçük harf de katılır', async () => {
  const kodlar = new Set(),
    kurucular = [];
  for (let i = 0; i < 8; i++) {
    const k = await istemci('K' + i);
    k.send('create', {});
    const { code } = await k.next('lobby');
    assert.match(code, KOD);
    kodlar.add(code);
    kurucular.push(k);
  }
  assert.equal(kodlar.size, 8, 'kodlar benzersiz');
  const kod = [...kodlar][0],
    g1 = await istemci('Tiresiz'),
    g2 = await istemci('Küçük'),
    g3 = await istemci('Yok');
  g1.send('join', { code: kod.replace('-', '') });
  assert.equal((await g1.next('lobby')).code, kod);
  g2.send('join', { code: ' ' + kod.toLowerCase() + ' ' });
  assert.equal((await g2.next('lobby')).code, kod);
  g3.send('join', { code: 'ZZZZ-9' });
  assert.equal((await g3.next('error')).message, 'Böyle bir oda yok');
  for (const c of [...kurucular, g1, g2, g3]) await kapat(c);
});

test('oda kur anında herkese açık lobi açar; ayarları yalnız kuran değiştirir', async () => {
  const a = await istemci('Kuran'),
    b = await istemci('Konuk');
  a.send('create', { difficulty: 'hard' });
  const oda = await a.next('lobby');
  assert.equal(oda.state, 'lobby');
  assert.equal(oda.private, false);
  assert.equal(oda.difficulty, 'hard', 'başlangıç zorluğu ana ekrandaki seçim');
  assert.equal(oda.host, a.welcome.id);
  b.send('join', { code: oda.code });
  await b.next('lobby');
  await a.next('lobby', m => m.seats.filter(s => s.id).length === 2);
  // Konuğun ayar isteği yok sayılır.
  b.send('settings', { difficulty: 'easy', private: true });
  a.send('settings', { difficulty: 'normal' });
  const ayar = await b.next('lobby', m => m.difficulty === 'normal');
  assert.equal(ayar.private, false, 'konuk odayı özel yapamaz');
  a.send('settings', { private: true });
  assert.equal((await b.next('lobby', m => m.private)).difficulty, 'normal');
  a.send('settings', { private: false });
  await b.next('lobby', m => !m.private);
  for (const c of [a, b]) await kapat(c);
});

test('kuran oyuncuyu boş koltuğa taşır, dolu koltukta yer değiştirir; konuk taşıyamaz', async () => {
  const a = await istemci('Kuran'),
    b = await istemci('Konuk');
  a.send('create', {});
  const oda = await a.next('lobby');
  b.send('join', { code: oda.code });
  const ilk = await b.next('lobby');
  const bYer = ilk.seats.find(s => s.id === b.welcome.id).slot;
  assert.equal(bYer, 1);
  a.send('move', { from: bYer, to: 7 });
  let m = await b.next('lobby', m => m.seats[7].id === b.welcome.id);
  assert.equal(m.seats[1].id, null);
  a.send('move', { from: 0, to: 7 });
  m = await b.next('lobby', m => m.seats[7].id === a.welcome.id);
  assert.equal(m.seats[0].id, b.welcome.id, 'dolu koltuk: yer değiştirdiler');
  b.send('move', { from: 7, to: 3 });
  b.send('seat', { slot: 4 });
  m = await a.next('lobby', m => m.seats[4].id === b.welcome.id);
  assert.equal(m.seats[7].id, a.welcome.id, 'konuğun taşıma isteği yok sayılır');
  assert.equal(m.seats[3].id, null);
  for (const c of [a, b]) await kapat(c);
});

test('maç bitince oda lobiye döner; kuran yeniden başlatır, liste yine LOBİDE gösterir', async () => {
  const a = await istemci('Kuran'),
    b = await istemci('Konuk'),
    gozcu = await istemci('Gözcü');
  a.send('create', {});
  const { code } = await a.next('lobby');
  b.send('join', { code });
  await b.next('lobby');
  a.send('start');
  await Promise.all([a.next('start'), b.next('start')]);
  rooms.room(code).world.winner = 0;
  const bitis = await b.next('snapshot', m => m.world.winner !== null);
  assert.equal(bitis.world.winner, 0);
  const lobi = await b.next('lobby', m => m.state === 'lobby');
  assert.equal(lobi.seats.filter(s => s.id).length, 2, 'herkes koltuğunda');
  assert.equal(lobi.host, a.welcome.id);
  await gozcu.next('rooms', m => m.list.some(o => o.code === code && o.state === 'lobby'));
  b.send('start');
  a.send('start');
  await Promise.all([a.next('start'), b.next('start')]);
  for (const c of [a, b, gozcu]) await kapat(c);
});

test('yenilenen sayfa jetonla aynı koltuğa döner; welcome odanın kodunu söyler', async () => {
  const a = await istemci('Kuran'),
    b = await istemci('Konuk');
  a.send('create', {});
  const { code } = await a.next('lobby');
  b.send('join', { code });
  await b.next('lobby');
  b.send('seat', { slot: 5 });
  await a.next('lobby', m => m.seats[5].id === b.welcome.id);
  assert.equal(a.welcome.room, null);
  await kapat(b);
  await a.next('lobby', m => m.seats[5].id === b.welcome.id && !m.seats[5].online);
  // Aynı jetonla yeni bağlantı (istemci() 'rooms' bekler; odadaki bağlantıya liste gitmez, bu yüzden elle).
  const ws = new WebSocket(adres);
  soketler.push(ws);
  const gelen = [];
  ws.on('message', d => gelen.push(JSON.parse(String(d))));
  await new Promise(r => ws.once('open', r));
  ws.send(JSON.stringify({ type: 'hello', name: 'Konuk', token: b.welcome.token }));
  const t0 = Date.now();
  while (!gelen.some(m => m.type === 'lobby') && Date.now() - t0 < 4000) await new Promise(r => setTimeout(r, 20));
  const hosgeldin = gelen.find(m => m.type === 'welcome');
  assert.equal(hosgeldin.room, code);
  assert.equal(hosgeldin.id, b.welcome.id);
  const lobi = gelen.find(m => m.type === 'lobby');
  assert.equal(lobi.seats[5].id, b.welcome.id);
  assert.equal(lobi.seats[5].online, true);
  ws.close();
  await kapat(a);
});
