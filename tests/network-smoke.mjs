import WebSocket from 'ws';
import assert from 'node:assert/strict';
const sockets = [];
async function client(name, token) {
  const ws = new WebSocket('ws://127.0.0.1:5185'),
    q = [],
    waiters = [];
  sockets.push(ws);
  ws.on('message', b => {
    const m = JSON.parse(String(b));
    q.push(m);
    for (const f of [...waiters]) f();
  });
  await new Promise((r, j) => {
    ws.once('open', r);
    ws.once('error', j);
  });
  const next = (type, predicate = () => true) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timeout ' + type));
      }, 5000);
      const cleanup = () => {
        clearTimeout(timer);
        const i = waiters.indexOf(check);
        if (i >= 0) waiters.splice(i, 1);
      };
      const check = () => {
        const i = q.findIndex(m => m.type === type && predicate(m));
        if (i >= 0) {
          const [m] = q.splice(i, 1);
          cleanup();
          resolve(m);
        }
      };
      waiters.push(check);
      check();
    });
  const send = (type, body = {}) => ws.send(JSON.stringify({ type, ...body }));
  send('hello', { name, token });
  const welcome = await next('welcome');
  return { ws, next, send, welcome, q };
}
try {
  const a = await client('Host'),
    b = await client('Guest');
  a.send('create', { mode: 'pvp' });
  const lobby = await a.next('lobby');
  assert.equal(lobby.seats.length, 10);
  assert.ok(!JSON.stringify(lobby).includes(a.welcome.token), 'secret token is not in lobby');
  b.send('join', { code: lobby.code });
  await b.next('lobby');
  b.send('seat', { slot: 3 });
  await b.next('lobby', m => m.seats[3].id === b.welcome.id);
  b.send('start');
  b.send('input', { input: null });
  a.send('start');
  const sa = await a.next('start'),
    sb = await b.next('start');
  assert.equal(sb.world.me, 3);
  assert.equal(sa.world.players.length, 10);
  assert.equal(sa.world.players[1].hidden, true);
  b.send('input', { input: { x: 0.8, z: 0, jump: true } });
  await b.next('snapshot', m => m.world.players[3].stats.jumps > 0);
  b.send('input', { input: { jump: true } });
  await b.next('snapshot', m => m.world.players[3].airJumps === 1);
  b.send('input', { input: { jump: true } });
  const double = await b.next('snapshot', m => m.world.players[3].airJumps === 1);
  assert.equal(double.world.players[3].stats.jumps, 2);
  const token = b.welcome.token,
    id = b.welcome.id;
  await new Promise(r => {
    b.ws.once('close', r);
    b.ws.close();
  });
  const back = await client('Guest', token);
  assert.equal(back.welcome.id, id);
  const resumed = await back.next('start');
  assert.equal(resumed.world.me, 3);
  assert.equal(resumed.world.players[3].bot, false);
  back.send('input', { input: null });
  await back.next('snapshot');
  const others = [];
  for (let i = 0; i < 8; i++) {
    const c = await client('Seat-' + i);
    c.send('join', { code: lobby.code });
    await c.next('start');
    others.push(c);
  }
  const snap = await a.next('snapshot', m => m.world.players.every(p => !p.bot));
  assert.equal(snap.world.players.filter(p => !p.bot).length, 10);
  const extra = await client('Extra');
  extra.send('join', { code: lobby.code });
  assert.match((await extra.next('error')).message, /boş/);
  a.send('leave');
  const migrated = await back.next('lobby', m => m.host !== a.welcome.id);
  assert.ok(migrated.host);
  assert.equal(migrated.seats.filter(s => s.id).length, 9);
  extra.send('create', { mode: 'coop' });
  const coop = await extra.next('lobby');
  extra.send('seat', { slot: 1 });
  assert.match((await extra.next('error')).message, /koltuğa/);
  assert.equal(coop.seats.filter(s => s.team === 0).length, 5);
  console.log(
    JSON.stringify({
      checks:
        '10 real WebSocket clients, fixed seats, host-only start, two teams, movement/jump, private token, hidden state, reconnect, room full, host migration, co-op restriction',
    }),
  );
} finally {
  for (const ws of sockets) ws.terminate();
}
