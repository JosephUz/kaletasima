// Düzen testi: yatay telefon taklidinde oyun ekranı sayfayı yatayda kaydırmamalı. Gece testi 2026-09-28'de
// üstteki başlık şeridinin arkasındaki gölge (`.top::before`) ekranın 11px dışına taştığı için sayfa kayıyordu.
// Playwright ister (bkz. README); kurulu Chrome değil, başsız kabuk kullanılır. Kurulumu tests/playwright-bul.mjs
// kendi arar (bu depo, sonra komşu depolar), böylece `npm test` ortam değişkeni olmadan da koşar; PLAYWRIGHT_MODULE
// ile başka bir kurulum verilebilir. Hiçbiri yoksa test atlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightYukle, tarayiciKoku } from './playwright-bul.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pwYukle = () => playwrightYukle(kok);

/**
 * Kurulu Chrome kullanılmaz: başsız Chrome'da fare kilidi (pointer lock) Windows'ta gerçek imleci görünmeyen pencereye
 * hapseder, kullanıcının faresi sol üste sıkışır (2026-09-30'da GetClipCursor ile ölçüldü). Playwright'ın başsız
 * kabuğu (chrome-headless-shell) pencere açmaz, imlece dokunmaz. CHROME_PATH verilmişse o, yoksa ms-playwright
 * altındaki en yeni kabuk, o da yoksa Playwright'ın varsayılanı.
 */
const basizKabuk = () => {
  const klasor = tarayiciKoku();
  if (!klasor || !fs.existsSync(klasor)) return null;
  const surum = fs.readdirSync(klasor).filter(d => d.startsWith('chromium_headless_shell-')).sort().pop();
  const exe = surum && path.join(klasor, surum, 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
  return exe && fs.existsSync(exe) ? exe : null;
};
const tarayiciAyari = () => {
  const exe = process.env.CHROME_PATH || basizKabuk();
  return exe ? { executablePath: exe, headless: true } : { headless: true };
};

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
function sunucuAc() {
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
    if (p.startsWith('/vendor/')) dosya = vendorlar.map(d => path.join(d, path.basename(p))).find(f => fs.existsSync(f)) || null;
    else {
      const f = path.normalize(path.join(kok, p));
      if (f.startsWith(kok) && !f.includes('node_modules')) dosya = f;
    }
    if (!dosya || !fs.existsSync(dosya) || fs.statSync(dosya).isDirectory()) {
      res.writeHead(404);
      res.end('yok');
      return;
    }
    res.writeHead(200, { 'Content-Type': TIPLER[path.extname(dosya).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(dosya).pipe(res);
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve({ server, adres: `http://127.0.0.1:${server.address().port}` })));
}

const pw = await pwYukle();

const atla = pw ? false : 'Playwright yok (npm i -D playwright ya da PLAYWRIGHT_MODULE ile yol ver)';

test('yatay telefonda oyun ekranı sayfayı yatayda kaydırmaz', { skip: atla }, async () => {
  const { chromium, devices } = pw;
  const { server, adres } = await sunucuAc();
  // Tarayıcı açılışı da temizleme kapsamında: başlatma başarısız olursa sunucu kapanmadan test asılı kalırdı.
  let browser = null;
  try {
    browser = await chromium.launch(tarayiciAyari());
    for (const ad of ['Pixel 7 landscape', 'iPhone 13 landscape']) {
      const { defaultBrowserType, ...cihaz } = devices[ad];
      const ctx = await browser.newContext(cihaz);
      const page = await ctx.newPage();
      await page.goto(adres + '/?test');
      await page.waitForFunction(() => !!window.__kaleTasima);
      await page.click('#solo');
      await page.waitForFunction(() => document.body.classList.contains('playing'));
      await page.waitForTimeout(600);
      const olcu = await page.evaluate(() => ({ sayfa: document.scrollingElement.scrollWidth, ekran: innerWidth }));
      await ctx.close();
      assert.ok(
        olcu.sayfa <= olcu.ekran + 2,
        `${ad}: sayfa genişliği ${olcu.sayfa}px, ekran ${olcu.ekran}px — yatayda kayıyor`,
      );
    }
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    server.close();
  }
});
