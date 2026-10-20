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
  const ozel = await b.next('lobby');
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
  e.send('create', { private: true });
  const ozel = await e.next('lobby');
  f.send('quick');
  const odaF = await f.next('lobby');
  assert.notEqual(odaF.code, ozel.code, 'özel odaya hızlı katılınmaz');
  assert.equal(odaF.seats.filter(s => s.id).length, 1, 'yeni oda kurulur');
  assert.equal(odaF.host, f.welcome.id, 'kuran oda sahibi');
  assert.notEqual(odaC.code, odaF.code);
  for (const x of [a, b, c, d, e, f]) await kapat(x);
});

test('dolu oda önerilmez; sürmekte olan maç bekleyen odadan sonra gelir', async () => {
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
  assert.ok(!(await gozcu.liste()).some(o => o.code === dolu.code), 'dolu oda listede yok');
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
