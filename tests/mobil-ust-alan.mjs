// Telefon görünümü: oyunun üstü (ve altı) tarayıcı çubuğunun yüzünden görünmeyen bölgede kalıyor mu? Playwright'ın
// kendi başsız Chromium'uyla (kullanıcının Chrome'una ve faresine dokunmaz) telefon kipinde (isMobile, hasTouch) ana
// ekran, **oda kurulmuş lobi** ve maç çekilir.
//
// İki ayrı tarayıcı çubuğu taklidi var, çünkü iki tarayıcı görünür alanı iki ayrı biçimde kısaltır:
//
//   kip "ios"      Çubuk düzen görünümünün ÜSTÜNÜ örter: `visualViewport.offsetTop = 56`, yükseklik 56 kısalır.
//                  Görünür şerit [56 .. yükseklik]. Üstteki her şey (üst çubuk, oda kodu) çubuğun altında kalır.
//
//   kip "android"  Çubuk düzen görünümünün DIŞINDA kalır: `offsetTop = 0`, ama `100vh` (düzen görünümü) çubuk
//                  gizliyken ki boydur — yani görünenden 56 px uzundur. Görünür şerit [0 .. yükseklik-56]; düzenin
//                  alt 56 px'i ekranın dışına taşar. Asıl hata budur: `#scene{height:100vh}` ve `100vh` ile ortalanan
//                  lobi kartı görünür alana sığmaz, alt kısmı (lobi kartının altı, dokunmatik düğmeler) kesilir ve
//                  sayfa kaymaya açılır — kayınca da üst kısım çubuğun altına girer.
//
// Testin üç ölçüsü var:
//   1. Dikey: ölçülen her öğe görünür şeridin içinde mi (yukarıdan da aşağıdan da taşmıyor).
//   2. Yatay: üst çubuk ve lobi kartı ekran genişliğini aşmıyor (üst çubuğa eklenen düğmeler taşırmasın).
//   3. Klavye: oda koduna yazarken görünür alan yarıya iner; kök küçülmemeli, üst şerit yerinden oynamamalı,
//      klavye kapanınca eski boy geri gelmeli.
//
// Kendi kendine yeter: oyun sunucusunu (server.mjs) boş bir portta açar, bitince kapatır. Çalışan bir sunucuya
// bağlanmak için GAME_URL verilebilir.
//   ETIKET  dosya adı öneki (artifacts/mobil-<etiket>-*.png), varsayılan "sonra"
//   MOBIL_KONTROL=0  yalnız görüntü al, doğrulama yapma (düzeltmeden önceki hali çekmek için)
//   KIP=ios|android  yalnız bir çubuk kipini koştur (varsayılan: ikisi de)
//   PLAYWRIGHT_MODULE  başka bir Playwright kurulumu (klasör yolu ya da import belirteci); verilmezse
//                      tests/playwright-bul.mjs bu depoda ve komşu depolarda arar
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { playwrightYukle } from './playwright-bul.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const etiket = process.env.ETIKET || 'sonra';
const kontrol = process.env.MOBIL_KONTROL !== '0';
const CUBUK = 56; // tarayıcı adres çubuğu yüksekliği (Android Chrome ~56 CSS px)
const KLAVYE = 260; // açılan klavyenin görünür alandan götürdüğü yükseklik
const KIPLER = [
  { ad: 'ios', ustOfset: CUBUK }, // çubuk düzen görünümünün üstünü örter
  { ad: 'android', ustOfset: 0 }, // çubuk düzen görünümünün dışında: alt 56 px ekran dışına taşar
].filter(k => !process.env.KIP || k.ad === process.env.KIP);
const EKRANLAR = [
  { ad: 'yatay', viewport: { width: 844, height: 390 } },
  { ad: 'dik', viewport: { width: 390, height: 844 } },
];

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

/**
 * Sayfaya enjekte edilen tarayıcı çubuğu taklidi: `visualViewport` sarmalanır ve neyin örtüldüğü ekran görüntüsünde
 * görünsün diye şerit çizilir. `window.__klavye(px)` ile görünür alan ayrıca kısaltılabilir (klavye açılması).
 */
function cubukTakliti({ cubuk, ustOfset, kip }) {
  const gercek = window.visualViewport;
  let klavyeEk = 0;
  const sahte = {
    get width() {
      return gercek.width;
    },
    get height() {
      return Math.max(0, gercek.height - cubuk - klavyeEk);
    },
    get offsetTop() {
      return ustOfset;
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
  window.__klavye = px => {
    klavyeEk = px;
    gercek.dispatchEvent(new Event('resize'));
  };
  addEventListener('DOMContentLoaded', () => {
    const el = document.createElement('div');
    el.id = 'sahte-adres-cubugu';
    const ortak = `position:fixed;left:0;width:100%;height:${cubuk}px;z-index:2147483647;display:flex;align-items:center;gap:10px;font:13px system-ui,sans-serif;padding:0 14px;box-sizing:border-box;pointer-events:none`;
    if (kip === 'ios') {
      // Çubuk sayfanın üstünü örter: olduğu gibi çizilir.
      el.style.cssText = `${ortak};top:0;background:#30343a;color:#dfe3e8;border-bottom:1px solid #000`;
      el.textContent = '🔒  kaletasima.josephuz.com';
    } else {
      // Çubuk sayfanın dışında: ekranda görünmeyen, düzenin ekran dışına taşan alt şeridi taranır.
      el.style.cssText =
        `${ortak};bottom:0;color:#ffd9d9;justify-content:center;border-top:2px dashed #ff6b6b;` +
        'background:repeating-linear-gradient(135deg,#5a1f1fcc 0 10px,#2a0f0fcc 10px 20px)';
      el.textContent = 'EKRAN DIŞI — adres çubuğu bu kadarını aşağı itiyor';
    }
    document.body.appendChild(el);
  });
}

const playwright = await playwrightYukle(kok);
if (!playwright) throw new Error('Playwright bulunamadı: bu depoda ya da komşu depolarda kurulu değil (PLAYWRIGHT_MODULE ile verilebilir)');
const { chromium } = playwright;
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
const sonuclar = [];
try {
  for (const kip of KIPLER)
    for (const ekran of EKRANLAR) {
      const onek = `artifacts/mobil-${etiket}-${kip.ad}-${ekran.ad}`;
      const context = await browser.newContext({
        viewport: ekran.viewport,
        isMobile: true,
        hasTouch: true,
        deviceScaleFactor: 2,
      });
      await context.addInitScript(cubukTakliti, { cubuk: CUBUK, ustOfset: kip.ustOfset, kip: kip.ad });

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
      await page.screenshot({ path: `${onek}-01-ana.png` });

      const olc = async sec => page.locator(sec).boundingBox();
      // Giriş ekranı: üst şerit ve "Oda kur" düğmesi görünür alanda mı (yukarıda adres çubuğunun, aşağıda ekranın
      // dışına taşmamalı).
      const girisUst = await olc('#home .home-top'),
        kur = await olc('#create');

      // "Odaya katıl" → oda kodu satırı açılır, giriş ekranının içeriği uzar. Üst şerit bununla birlikte yukarı
      // kaymamalı (kayarsa adres çubuğunun altında kalır).
      const kokBoy = () => page.evaluate(() => Math.round(document.body.getBoundingClientRect().height));
      await page.locator('#join-toggle').click();
      await page.waitForSelector('#join-row:not([hidden])');
      const katilUst = await olc('#home .home-top');

      // Klavye: oda kodu kutusuna odaklan, görünür alanı klavye kadar kısalt. Kök küçülmemeli ve üst şerit yerinden
      // oynamamalı; klavye kapanınca eski boy geri gelmeli.
      const klavyeOncesiBoy = await kokBoy(),
        klavyeOncesiUstY = katilUst?.y;
      await page.locator('#room-code').focus();
      await page.evaluate(px => window.__klavye(px), KLAVYE);
      await page.waitForTimeout(600);
      const klavye = {
        boy: await kokBoy(),
        ustY: (await olc('#home .home-top'))?.y,
        sinif: await page.evaluate(() => document.documentElement.classList.contains('vv-klavye')),
        kutu: await olc('#room-code'),
      };
      await page.screenshot({ path: `${onek}-02-klavye.png` });
      await page.evaluate(() => {
        document.activeElement?.blur();
        window.__klavye(0);
      });
      await page.waitForTimeout(600);
      const klavyeSonrasiBoy = await kokBoy();
      await page.locator('#join-toggle').click();

      // Sayfa kaymasın: iOS `overflow:hidden` olmasına rağmen kaydırır, kayınca sabit üst öğeler çubuğun altına girer.
      await page.evaluate(() => window.scrollTo(0, 120));
      await page.waitForTimeout(300);
      const kaymaY = await page.evaluate(() => Math.round(window.scrollY));

      // Oda kur: sunucuya bağlanınca düğme açılır (screens.js → setServer), lobi ekranı oda kodunu gösterir.
      await page.waitForSelector('#create:not([disabled])', { timeout: 8000 });
      await page.locator('#create').click();
      await page.waitForSelector('#lobby:not([hidden])', { timeout: 8000 });
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${onek}-03-lobi.png` });

      const kod = await olc('#lobby-code'),
        kart = await olc('#lobby .lobby-card'),
        kopyala = await olc('#copy-room');
      const kodMetni = (await page.locator('#lobby-code').textContent()).trim();

      // Oyun içi üst çubuk (.top: oda bilgisi, altın, canlar, düğmeler) ve alttaki dokunmatik düğmeler (VUR / FIRLAT
      // / ZIPLA) ayrı ekranda: lobiden çıkıp tek başına başlat.
      await page.locator('#lobby-leave').click();
      await page.waitForSelector('#home:not([hidden])', { timeout: 8000 });
      await page.locator('#solo').click();
      await page.waitForFunction(() => document.body.classList.contains('playing'), null, { timeout: 15000 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${onek}-04-oyun.png` });
      const ust = await olc('.top'),
        alt = await olc('.touch-buttons');

      // Görünür şerit: "ios"ta çubuk üstü örter (56..boy), "android"de düzenin altı ekran dışına taşar (0..boy-56).
      const gorunur = { ust: kip.ustOfset, alt: kip.ustOfset + ekran.viewport.height - CUBUK };
      const icerde = k => !!k && k.y >= gorunur.ust - 0.5 && k.y + k.height <= gorunur.alt + 0.5;
      const sigiyor = k => !!k && k.x >= -0.5 && k.x + k.width <= ekran.viewport.width + 0.5;
      const satir = {
        kip: kip.ad,
        ekran: ekran.ad,
        gorunurSerit: `${gorunur.ust}..${gorunur.alt}`,
        kod: kodMetni,
        odaKoduGorunur: icerde(kod),
        lobiKartiGorunur: icerde(kart),
        lobiKartiSigiyor: sigiyor(kart),
        linkDugmesiGorunur: icerde(kopyala),
        ustCubukGorunur: icerde(ust),
        ustCubukSigiyor: sigiyor(ust),
        dokunmaDugmeleriGorunur: icerde(alt),
        kodY: kod && Math.round(kod.y),
        kartAlt: kart && Math.round(kart.y + kart.height),
        ustY: ust && Math.round(ust.y),
        dokunmaDugmeleriAlt: alt && Math.round(alt.y + alt.height),
        girisUstY: girisUst && Math.round(girisUst.y),
        girisUstGorunur: icerde(girisUst),
        girisUstSigiyor: sigiyor(girisUst),
        katilUstY: katilUst && Math.round(katilUst.y),
        katilUstGorunur: icerde(katilUst),
        odaKurAlt: kur && Math.round(kur.y + kur.height),
        odaKurGorunur: icerde(kur),
        kaymaY,
        klavyeOncesiBoy,
        klavyeBoy: klavye.boy,
        klavyeSonrasiBoy,
        klavyeSinifi: klavye.sinif,
        klavyeOncesiUstY: klavyeOncesiUstY && Math.round(klavyeOncesiUstY),
        klavyeUstY: klavye.ustY && Math.round(klavye.ustY),
        klavyeUstKaymasi: Math.round((klavye.ustY ?? 0) - (klavyeOncesiUstY ?? 0)),
      };
      sonuclar.push(satir);
      console.log(JSON.stringify(satir));

      if (kontrol) {
        const n = `${kip.ad}/${ekran.ad}`;
        assert.ok(/^[A-Z0-9-]{4,10}$/.test(kodMetni), `${n}: oda kodu okunamadı: "${kodMetni}"`);
        assert.ok(icerde(kod), `${n}: oda kodu görünür alanın dışında (y=${satir.kodY}, şerit ${satir.gorunurSerit})`);
        assert.ok(
          icerde(kart),
          `${n}: lobi kartı görünür alanın dışına taşıyor (y=${kart && Math.round(kart.y)}, alt=${satir.kartAlt}, şerit ${satir.gorunurSerit})`,
        );
        assert.ok(icerde(kopyala), `${n}: "Linki kopyala" düğmesi görünür alanın dışında (y=${kopyala?.y})`);
        assert.ok(icerde(ust), `${n}: oyun içi üst çubuk görünür alanın dışında (y=${satir.ustY})`);
        assert.ok(
          icerde(alt),
          `${n}: dokunmatik düğmeler (VUR / FIRLAT) görünür alanın dışında (alt=${satir.dokunmaDugmeleriAlt}, şerit ${satir.gorunurSerit})`,
        );
        assert.ok(icerde(girisUst), `${n}: giriş ekranının üst şeridi görünür alanın dışında (y=${satir.girisUstY})`);
        assert.ok(
          icerde(katilUst),
          `${n}: "Odaya katıl" açılınca giriş ekranı kaydı, üst şerit görünür alanın dışına çıktı (y=${satir.girisUstY} → ${satir.katilUstY}, şerit ${satir.gorunurSerit})`,
        );
        assert.ok(icerde(kur), `${n}: giriş ekranında Oda kur düğmesi görünür alanın dışında (alt=${satir.odaKurAlt})`);
        // Yatay: üst çubuğa eklenen düğmeler ekranı taşırmamalı.
        assert.ok(sigiyor(ust), `${n}: oyun içi üst çubuk ekran genişliğini aşıyor (x=${ust?.x}, en=${ust?.width})`);
        assert.ok(
          sigiyor(girisUst),
          `${n}: giriş ekranının üst şeridi ekran genişliğini aşıyor (x=${girisUst?.x}, en=${girisUst?.width})`,
        );
        assert.ok(sigiyor(kart), `${n}: lobi kartı ekran genişliğini aşıyor (x=${kart?.x}, en=${kart?.width})`);
        // Sayfa kaymamalı.
        assert.equal(kaymaY, 0, `${n}: sayfa kaydı (scrollY=${kaymaY}); üst kısım çubuğun altına girer`);
        // Klavye: kök küçülmesin, üst şerit oynamasın, kapanınca eski boy gelsin.
        assert.ok(klavye.sinif, `${n}: klavye açıkken html.vv-klavye yok (kök klavye kadar küçülür)`);
        assert.equal(
          klavye.boy,
          klavyeOncesiBoy,
          `${n}: klavye açılınca kök küçüldü (${klavyeOncesiBoy} → ${klavye.boy}); giriş ekranı bozulur`,
        );
        assert.ok(
          Math.abs(satir.klavyeUstKaymasi) <= 1,
          `${n}: klavye açılınca üst şerit kaydı (${satir.klavyeUstKaymasi} px)`,
        );
        assert.equal(
          klavyeSonrasiBoy,
          klavyeOncesiBoy,
          `${n}: klavye kapanınca eski boy gelmedi (${klavyeOncesiBoy} → ${klavyeSonrasiBoy})`,
        );
        assert.deepEqual(hatalar, [], 'tarayıcı hataları: ' + hatalar.join(' | '));
      }
      await context.close();
    }
  console.log(`Telefon görünümü ekran görüntüleri: artifacts/mobil-${etiket}-*.png`);
  if (kontrol)
    console.log(
      'Her iki çubuk kipinde de (ios: çubuk üstü örter · android: düzen alttan taşar) oda kodu, lobi kartı, giriş\n' +
        'şeridi, oyun içi üst çubuk ve dokunmatik düğmeler görünür alanda; sayfa kaymıyor; klavye kökü küçültmüyor.',
    );
} finally {
  await browser.close();
  sunucu.kapat();
}
