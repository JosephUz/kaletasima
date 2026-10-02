// Telefon görünümü: üst kısım adres çubuğunun altında kalıyor mu? Playwright'ın kendi başsız Chromium'uyla
// (kullanıcının Chrome'una ve faresine dokunmaz) telefon kipinde (isMobile, hasTouch) ana ekran ve **oda kurulmuş
// lobi** çekilir.
//
// Adres çubuğu taklidi: `visualViewport` sarmalanır — yükseklik CUBUK kadar kısalır, offsetTop CUBUK olur (Android
// Chrome'da üstteki adres çubuğunun yaptığı). Aynı CUBUK yüksekliğinde gri bir şerit de sayfaya eklenir: ekran
// görüntüsünde çubuğun neyi örttüğü görülür. Düzeltmeden önce oyunun üstü (üst çubuk, oda kodu) bu şeridin altında
// kalır; düzeltmeden sonra kök görünür alana oturduğu için hepsi şeridin altından başlar.
//
// Kendi kendine yeter: oyun sunucusunu (server.mjs) boş bir portta açar, bitince kapatır. Çalışan bir sunucuya
// bağlanmak için GAME_URL verilebilir.
//   ETIKET  dosya adı öneki (artifacts/mobil-<etiket>-*.png), varsayılan "sonra"
//   MOBIL_KONTROL=0  yalnız görüntü al, doğrulama yapma (düzeltmeden önceki hal için)
//   PLAYWRIGHT_MODULE  başka bir Playwright kurulumu (file:// URL ya da klasör yolu)
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const etiket = process.env.ETIKET || 'sonra';
const kontrol = process.env.MOBIL_KONTROL !== '0';
const CUBUK = 56; // tarayıcı adres çubuğu yüksekliği (Android Chrome ~56 CSS px)
const EKRANLAR = [
  { ad: 'yatay', viewport: { width: 844, height: 390 } },
  { ad: 'dik', viewport: { width: 390, height: 844 } },
];

/** Playwright: PLAYWRIGHT_MODULE (klasör ya da URL), yoksa depodaki / komşu depolardaki kurulum. */
const playwrightYukle = async () => {
  const aday = process.env.PLAYWRIGHT_MODULE;
  if (aday) return import(fs.existsSync(aday) ? pathToFileURL(path.join(aday, 'index.mjs')).href : aday);
  return import('playwright');
};

/** İşletim sisteminin verdiği boş bir port: sabit 5185 başka bir sunucuda (geliştirme) açık olabilir. */
const bosPort = () =>
  new Promise((çöz, hata) => {
    const s = net.createServer();
    s.on('error', hata);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => çöz(port));
    });
  });

/** Oyun sunucusunu kendi portunda açar ve /health yanıt verene kadar bekler. */
async function sunucuAc() {
  const port = await bosPort();
  const c = spawn(process.execPath, [path.join(kok, 'server.mjs')], {
    cwd: kok,
    env: { ...process.env, PORT: String(port) },
    stdio: 'ignore',
  });
  const adres = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(adres + '/health')).ok) return { adres, kapat: () => c.kill() };
    } catch {
      /* henüz açılmadı */
    }
    await new Promise(r => setTimeout(r, 100));
  }
  c.kill();
  throw new Error('Oyun sunucusu açılmadı: ' + adres);
}

const { chromium } = await playwrightYukle();
await mkdir('artifacts', { recursive: true });
const dis = process.env.GAME_URL;
const sunucu = dis ? { adres: dis.replace(/\/$/, ''), kapat() {} } : await sunucuAc();
// SWIFTSHADER: donanım GL'si olmayan makinede yazılım çizici (dumanı testleriyle aynı seçim, bkz. touch-smoke.mjs).
const browser = await chromium.launch({
  headless: true,
  args: [
    '--mute-audio',
    '--use-gl=angle',
    ...(process.env.SWIFTSHADER ? ['--use-angle=swiftshader'] : ['--use-angle=d3d11', '--ignore-gpu-blocklist']),
  ],
});
try {
  for (const ekran of EKRANLAR) {
    const context = await browser.newContext({
      viewport: ekran.viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    await context.addInitScript(cubuk => {
      // Görünür alanı üstten kısaltan sahte adres çubuğu.
      const gercek = window.visualViewport;
      const sahte = {
        get width() {
          return gercek.width;
        },
        get height() {
          return Math.max(0, gercek.height - cubuk);
        },
        get offsetTop() {
          return cubuk;
        },
        get offsetLeft() {
          return gercek.offsetLeft;
        },
        get pageTop() {
          return gercek.pageTop;
        },
        get pageLeft() {
          return gercek.pageLeft;
        },
        get scale() {
          return gercek.scale;
        },
        addEventListener: (...a) => gercek.addEventListener(...a),
        removeEventListener: (...a) => gercek.removeEventListener(...a),
        dispatchEvent: (...a) => gercek.dispatchEvent(...a),
      };
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => sahte });
      addEventListener('DOMContentLoaded', () => {
        const el = document.createElement('div');
        el.id = 'sahte-adres-cubugu';
        el.style.cssText =
          `position:fixed;left:0;top:0;width:100%;height:${cubuk}px;z-index:2147483647;display:flex;align-items:center;gap:10px;` +
          'background:#30343a;color:#dfe3e8;font:13px system-ui,sans-serif;padding:0 14px;box-sizing:border-box;border-bottom:1px solid #000;pointer-events:none';
        el.textContent = '🔒  kaletasima.josephuz.com';
        document.body.appendChild(el);
      });
    }, CUBUK);

    const page = await context.newPage(),
      hatalar = [];
    page.on('pageerror', e => hatalar.push(e.message));
    page.on('console', e => {
      if (e.type() === 'error') hatalar.push(e.text());
    });
    await page.goto(sunucu.adres + '/?test');
    await page.waitForFunction(() => !!window.__kaleTasima && !document.querySelector('#home').hidden);
    await page.waitForTimeout(900);

    // Dik tutuşta oyun "Telefonu yan çevir" perdesini gösterir (değişmedi, kuralları da aynı). Ana ekranı ve lobiyi
    // ölçebilmek için perde yalnız bu testte gizlenir.
    if (ekran.ad === 'dik') await page.addStyleTag({ content: '#rotate{display:none!important}' });
    await page.screenshot({ path: `artifacts/mobil-${etiket}-${ekran.ad}-01-ana.png` });

    const olc = async sec => page.locator(sec).boundingBox();
    // Giriş ekranı: üst şerit ve "Oda kur" düğmesi görünür alanda mı (yukarıda adres çubuğunun, aşağıda ekranın
    // dışına taşmamalı).
    const girisUst = await olc('#home .home-top'),
      kur = await olc('#create');

    // Oda kur: sunucuya bağlanınca düğme açılır (screens.js → setServer), lobi ekranı oda kodunu gösterir.
    await page.waitForSelector('#create:not([disabled])', { timeout: 8000 });
    await page.locator('#create').click();
    await page.waitForSelector('#lobby:not([hidden])', { timeout: 8000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `artifacts/mobil-${etiket}-${ekran.ad}-02-lobi.png` });

    const kod = await olc('#lobby-code'),
      kart = await olc('#lobby .lobby-card'),
      kopyala = await olc('#copy-room');
    const kodMetni = (await page.locator('#lobby-code').textContent()).trim();

    // Oyun içi üst çubuk (.top: oda bilgisi, altın, canlar, düğmeler) ayrı ekranda: lobiden çıkıp tek başına başlat.
    await page.locator('#lobby-leave').click();
    await page.waitForSelector('#home:not([hidden])', { timeout: 8000 });
    await page.locator('#solo').click();
    await page.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 15000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `artifacts/mobil-${etiket}-${ekran.ad}-03-oyun.png` });
    const ust = await olc('.top');

    const gorunur = { ust: CUBUK, alt: ekran.viewport.height };
    const icerde = k => !!k && k.y >= gorunur.ust - 0.5 && k.y + k.height <= gorunur.alt + 0.5;
    const satir = {
      ekran: ekran.ad,
      kod: kodMetni,
      odaKoduGorunur: icerde(kod),
      lobiKartiGorunur: icerde(kart),
      linkDugmesiGorunur: icerde(kopyala),
      ustCubukGorunur: icerde(ust),
      kodY: kod && Math.round(kod.y),
      kartY: kart && Math.round(kart.y),
      ustY: ust && Math.round(ust.y),
      girisUstY: girisUst && Math.round(girisUst.y),
      girisUstGorunur: icerde(girisUst),
      odaKurUst: kur && Math.round(kur.y),
      odaKurAlt: kur && Math.round(kur.y + kur.height),
      odaKurGorunur: icerde(kur),
    };
    console.log(JSON.stringify(satir));

    if (kontrol) {
      assert.ok(/^[A-Z0-9-]{4,10}$/.test(kodMetni), `oda kodu okunamadı: "${kodMetni}"`);
      assert.ok(icerde(kod), `${ekran.ad}: oda kodu görünür alanın dışında (y=${kod?.y})`);
      assert.ok(
        icerde(kart),
        `${ekran.ad}: lobi kartı görünür alanın dışına taşıyor (y=${kart?.y}, alt=${kart && kart.y + kart.height})`,
      );
      assert.ok(icerde(kopyala), `${ekran.ad}: "Linki kopyala" düğmesi görünür alanın dışında (y=${kopyala?.y})`);
      assert.ok(icerde(ust), `${ekran.ad}: oyun içi üst çubuk görünür alanın dışında (y=${ust?.y})`);
      assert.ok(icerde(girisUst), `${ekran.ad}: giriş ekranının üst şeridi görünür alanın dışında (y=${girisUst?.y})`);
      assert.ok(
        icerde(kur),
        `${ekran.ad}: giriş ekranında Oda kur düğmesi görünür alanın dışında (y=${kur?.y}, alt=${satir.odaKurAlt})`,
      );
      assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
    }
    await context.close();
  }
  console.log(`Telefon görünümü ekran görüntüleri: artifacts/mobil-${etiket}-*.png`);
  if (kontrol)
    console.log('Üst kısım adres çubuğunun altında kalmıyor: oda kodu, lobi kartı ve oyun içi üst çubuk görünür alanda.');
} finally {
  await browser.close();
  sunucu.kapat();
}
