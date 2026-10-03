/**
 * Testlerin kendi açtığı küçük dosya sunucusu ve tarayıcı ayarı. Kalite Kapısı `npm test`i ortam değişkeni
 * vermeden koşturur: tarayıcı isteyen testler sunucularını da Playwright'ı da kendileri bulur
 * (bkz. tests/playwright-bul.mjs). duzen.test.mjs ve standart-cubuk.test.mjs ortak kullanır.
 */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { tarayiciKoku } from './playwright-bul.mjs';

const TIPLER = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/** Depoyu olduğu gibi servis eden küçük sunucu; `/vendor/three.module.js` node_modules'ten gelir. */
export function sunucuAc(kok) {
  const vendorlar = [path.join(kok, 'vendor'), path.join(kok, 'node_modules', 'three', 'build')];
  const server = http.createServer((req, res) => {
    let p;
    try {
      p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    } catch {
      p = '/';
    }
    if (p.endsWith('/')) p += 'index.html';
    let dosya = null;
    if (p.startsWith('/vendor/'))
      dosya = vendorlar.map(d => path.join(d, path.basename(p))).find(f => fs.existsSync(f)) || null;
    else {
      const f = path.normalize(path.join(kok, p));
      if (f.startsWith(kok) && !f.includes('node_modules')) dosya = f;
    }
    if (!dosya || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) {
      res.writeHead(404);
      res.end('yok');
      return;
    }
    res.writeHead(200, {
      'Content-Type': TIPLER[path.extname(dosya).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(dosya).pipe(res);
  });
  return new Promise(resolve =>
    server.listen(0, '127.0.0.1', () => resolve({ server, adres: `http://127.0.0.1:${server.address().port}` })),
  );
}

/**
 * Kurulu Chrome kullanılmaz: başsız Chrome'da fare kilidi (pointer lock) Windows'ta gerçek imleci görünmeyen
 * pencereye hapseder, kullanıcının faresi sol üste sıkışır (2026-09-30'da GetClipCursor ile ölçüldü).
 * Playwright'ın başsız kabuğu (chrome-headless-shell) pencere açmaz, imlece dokunmaz. CHROME_PATH verilmişse o,
 * yoksa ms-playwright altındaki en yeni kabuk, o da yoksa Playwright'ın varsayılanı.
 */
export function tarayiciAyari() {
  const exe = process.env.CHROME_PATH || basizKabuk();
  return exe ? { executablePath: exe, headless: true } : { headless: true };
}

function basizKabuk() {
  const klasor = tarayiciKoku();
  if (!klasor || !fs.existsSync(klasor)) return null;
  const surum = fs
    .readdirSync(klasor)
    .filter(d => d.startsWith('chromium_headless_shell-'))
    .sort()
    .pop();
  const exe = surum && path.join(klasor, surum, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  return exe && fs.existsSync(exe) ? exe : null;
}
