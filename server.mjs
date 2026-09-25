import http from 'node:http';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRooms } from './server/rooms.mjs';

/**
 * Tek süreç, tek port: statik dosyalar (oyun) + WebSocket (odalar, lobi, otoriter simülasyon). Cloudflare Tunnel bu
 * portu kaletasima.josephuz.com'a bağlar; tarayıcı ws(s)://aynı-adres ile bağlanır. Kökteki oyun dosyaları, src/ ve
 * three.js paketi (/vendor/ → node_modules/three/build) dışında hiçbir dosyaya erişim yok.
 */
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, 'node_modules', 'three', 'build');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const rootFiles = ['index.html', 'style.css', 'game.js'];
/** Oyun dosyaları önbelleğe alınmaz: tek bir sürüm vardır ve güncelleme anında geçmelidir. */
const noStore = 'no-store, no-cache, must-revalidate, max-age=0';

/** Sürüm damgası: en yeni oyun dosyasının değişme zamanı; /health ile hangi yapının ayakta olduğu görülür. */
async function buildStamp() {
  let newest = 0;
  const touch = async file => {
    try {
      newest = Math.max(newest, (await stat(file)).mtimeMs);
    } catch {
      /* yok */
    }
  };
  const walk = async dir => {
    let list = [];
    try {
      list = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of list) {
      const full = path.join(dir, d.name);
      if (d.isDirectory()) await walk(full);
      else if (/\.(js|mjs|css|html)$/.test(d.name)) await touch(full);
    }
  };
  for (const f of [...rootFiles, 'server.mjs']) await touch(path.join(root, f));
  await walk(path.join(root, 'src'));
  await walk(path.join(root, 'server'));
  return new Date(newest).toISOString();
}
let stamp = 'bilinmiyor';

/** İstek yolunu dosyaya çevirir; izin verilmeyen her yol için null. */
function resolveFile(pathname) {
  if (pathname === '/') pathname = '/index.html';
  const rel = path.normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  if (rel.includes('..')) return null;
  if (rel.startsWith('vendor' + path.sep) || rel.startsWith('vendor/')) {
    const file = path.join(vendorDir, path.basename(rel));
    return file.startsWith(vendorDir) ? file : null;
  }
  const top = rel.split(/[\\/]/)[0];
  if (top === rel && !rootFiles.includes(rel)) return null;
  if (top !== rel && top !== 'src') return null;
  return path.join(root, rel);
}

const port = Number(process.env.PORT || 5185),
  host = process.env.HOST || '127.0.0.1';
const rooms = createRooms();
const server = http.createServer(async (req, res) => {
  let url;
  try {
    url = new URL(req.url, 'http://localhost');
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': types['.json'], 'Cache-Control': noStore });
    return res.end(JSON.stringify({ game: 'Kale Taşıma', version: '0.4.0', ...rooms.stats(), surum: stamp }));
  }
  let file = null;
  try {
    file = resolveFile(url.pathname);
  } catch {
    /* bozuk yol */
  }
  const type = file && types[path.extname(file).toLowerCase()];
  if (!file || !type || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404);
    return res.end('Bulunamadı');
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': noStore });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch {
    const vendor = file.startsWith(vendorDir);
    res.writeHead(vendor ? 500 : 404);
    res.end(vendor ? 'three.js bulunamadı. Önce npm install çalıştırın.' : 'Dosya bulunamadı');
  }
});
server.on('error', e => {
  console.error(e.code === 'EADDRINUSE' ? port + ' portu kullanımda. PORT değerini değiştirin.' : e);
  process.exitCode = 1;
});
const wss = new WebSocketServer({ server, maxPayload: 8192 });
wss.on('connection', ws => rooms.attach(ws));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    rooms.close();
    for (const ws of wss.clients) ws.terminate();
    wss.close();
    server.close(() => process.exit(0));
  });
buildStamp().then(s => {
  stamp = s;
});
server.listen(port, host, () => console.log('Kale Taşıma: http://127.0.0.1:' + port));
