// STANDART üst araç çubuğu ve duraklatma (Esc) menüsü — bütün JosephUz oyunlarında aynı olmalı (Yusuf, 3 Ekim):
//   çubuk: `← josephuz.com` · `Ses: açık/kapalı` · `Müzik: açık/kapalı` · `Kontroller F1`
//   menü:  `DEVAM ET →` · `Kontroller F1` · `Ses: …` · `Müzik: …` (+ ses sürgüsü) · [oyuna özgü] · `Ana menü` ·
//          `josephuz.com'a dön`
//
// Burada iki şey denetlenir:
//   1. Sıra, yazılar ve saklanan ayar — kaynaktan, tarayıcısız.
//   2. Yerleşim — gerçek tarayıcıda, masaüstü ve üç telefon tutuşunda: çubuk tek satırda mı, ekrandan taşıyor mu,
//      oyun adının üstüne biniyor mu; Esc menüsü dar yatay telefonda kaydırmasız sığıyor mu. Ekran görüntüleri
//      artifacts/standart-cubuk-*.png altına düşer.
//
// Playwright ya da indirilmiş tarayıcı yoksa yalnız ikinci bölüm atlanır (bkz. tests/playwright-bul.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightYukle } from './playwright-bul.mjs';
import { sunucuAc, tarayiciAyari } from './yerel-sunucu.mjs';
import { VARSAYILAN_SES, acikMi, sesDuzeyi } from '../src/muzik.js';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const oku = dosya => readFile(path.join(kok, dosya), 'utf8');

/* ---- 1. Sıra ve yazılar (tarayıcısız) ---- */

test('standart üst çubuk: dört düğme, bu sırayla, bu yazılarla', async () => {
  const html = await oku('index.html');
  const cubuk = html.match(/<div class="home-actions" id="home-actions">([\s\S]*?)<\/div>/)?.[1];
  assert.ok(cubuk, 'giriş ekranında #home-actions çubuğu olmalı');
  const sira = [...cubuk.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(
    sira,
    ['home-site', 'home-sound', 'home-muzik', 'home-help'],
    'standart sıra: ← josephuz.com · Ses · Müzik · Kontroller F1',
  );
  assert.ok(cubuk.includes('← <span class="site-name">josephuz.com</span>'), 'bağlantı yazısı "← josephuz.com"');
  assert.ok(cubuk.includes('Ses: açık'), 'ses düğmesi "Ses: açık / kapalı" yazar');
  assert.ok(cubuk.includes('Müzik: açık'), 'müzik düğmesi "Müzik: açık / kapalı" yazar');
  assert.ok(cubuk.includes('Kontroller <kbd>F1</kbd>'), 'yardım düğmesi "Kontroller F1" (eski "Kısayollar" değil)');
  for (const eski of ['Kısayollar', 'Nasıl oynanır', 'Ses açık', 'Ses kapalı', 'F1 · ']) {
    assert.ok(!cubuk.includes(eski), `üst çubukta "${eski}" kullanılmaz`);
  }
});

test('standart Esc menüsü: DEVAM ET → · Kontroller F1 · Ses · Müzik (+sürgü) · Grafik · Ana menü · josephuz.com', async () => {
  const html = await oku('index.html');
  const menu = html.match(/<div class="menu-buttons">([\s\S]*?)<\/div><p id="perf">/)?.[1];
  assert.ok(menu, 'Esc menüsü .menu-buttons ile kurulmalı');
  const sira = [...menu.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(
    sira,
    ['resume', 'menu-help', 'sound', 'muzik', 'muzik-row', 'muzik-ses', 'muzik-yuzde', 'quality', 'leave'],
    'Esc menüsünün standart sırası (oyuna özgü "Grafik" standart dörtlünün ardında)',
  );
  assert.ok(menu.includes('DEVAM ET <span>→</span>'), 'ilk düğme "DEVAM ET →"');
  assert.ok(menu.includes('Kontroller <kbd>F1</kbd>'), 'ikinci düğme "Kontroller F1"');
  assert.ok(menu.includes('Ses: açık') && menu.includes('Müzik: açık'), 'ses ve müzik yazıları standart');
  assert.ok(menu.includes("josephuz.com'a dön"), "son satır \"josephuz.com'a dön\" bağlantısı");
  // Müzik sürgüsü Müzik düğmesinin **altında** olmalı: sırada hemen ardından gelir (yukarıdaki deepEqual) ve
  // gerçekten bir sürgüdür.
  assert.ok(/id="muzik-ses" type="range"/.test(menu), 'müzik ses düzeyi bir sürgü (range) olmalı');
});

test('aynı işi gören kopya düğme kalmadı (eski alt "Tüm kısayollar")', async () => {
  const html = await oku('index.html'),
    screens = await oku('src/screens.js');
  assert.ok(!html.includes('help-bottom'), 'alt şeritteki ikinci yardım düğmesi kaldırıldı');
  assert.ok(!screens.includes('help-bottom'), 'screens.js de artık o düğmeyi bağlamamalı');
  // Yardım penceresini açan üç yer kalır: oyun içi çubuk, giriş çubuğu, Esc menüsü.
  assert.ok(/\['help', 'home-help', 'menu-help'\]/.test(screens), 'yardımı açan düğmeler: help, home-help, menu-help');
});

test('ses ve müzik düğmeleri iki yerde de aynı durumu gösterir, ayar tarayıcıda saklanır', async () => {
  const screens = await oku('src/screens.js'),
    muzik = await oku('src/muzik.js');
  // syncMenu üst çubuğu ve Esc menüsünü birlikte yazar.
  for (const sec of ['#home-sound', '#sound', '#home-muzik', '#muzik']) {
    assert.ok(screens.includes(`'${sec}'`), `syncMenu ${sec} düğmesini de tazelemeli`);
  }
  assert.ok(/'Ses: ' \+ \(game\.sound \? 'açık' : 'kapalı'\)/.test(screens), 'yazı "Ses: açık / kapalı" olmalı');
  assert.ok(
    /'Müzik: ' \+ \(game\.muzik\.acik \? 'açık' : 'kapalı'\)/.test(screens),
    'yazı "Müzik: açık / kapalı" olmalı',
  );
  // Çevrim içinde "Ana menü" yerine "Odadan çık".
  assert.ok(/game\.online \? 'Odadan çık' : 'Ana menü'/.test(screens), 'çevrim içi maçta düğme "Odadan çık" yazar');
  assert.ok(screens.includes("localStorage.setItem('kale.sound'"), 'efekt sesi kale.sound anahtarında saklanır');
  assert.ok(muzik.includes("'kale.muzik'"), 'müzik ayarı kale.muzik anahtarında saklanır');
  assert.ok(muzik.includes("'kale.muzik.ses'"), 'müzik sesi kale.muzik.ses anahtarında saklanır');
});

test('müzik ayarı: varsayılan açık, %35, ?muzik=0/1 ezer', () => {
  assert.equal(acikMi('', null), true, 'hiç seçim yapılmadıysa müzik açık başlar');
  assert.equal(acikMi('', 'off'), false, 'kapatılmışsa kapalı gelir');
  assert.equal(acikMi('?muzik=0', 'on'), false, '?muzik=0 saklanan ayarı ezer');
  assert.equal(acikMi('?muzik=1', 'off'), true, '?muzik=1 saklanan ayarı ezer');
  assert.equal(sesDuzeyi(null), VARSAYILAN_SES);
  assert.equal(VARSAYILAN_SES, 0.35, 'diğer oyunlarla aynı varsayılan ses');
  assert.equal(sesDuzeyi('0.5'), 0.5);
  assert.equal(sesDuzeyi('abc'), VARSAYILAN_SES, 'bozuk değerde varsayılana dönülür');
  assert.equal(sesDuzeyi('9'), 1, 'ses düzeyi 0..1 arasına oturur');
  assert.equal(sesDuzeyi('-1'), 0);
});

test("Kale Taşıma'nın parçaları henüz bestelenmedi: düğme ayarı tutar, çalan bir şey yoktur", async () => {
  const muzik = await oku('src/muzik.js');
  assert.ok(!/new Audio|HTMLAudioElement|\.play\(\)/.test(muzik), 'bugün çalma yok (parçalar gelince eklenecek)');
  assert.ok(muzik.includes('henüz bestelenmedi'), 'dosya neden sessiz olduğunu yazmalı');
});

/* ---- 2. Yerleşim (gerçek tarayıcı) ---- */

/** Masaüstü ve üç telefon tutuşu. Dar yatay (iPhone SE / 8) çubuğun en sıkıştığı ölçüdür. */
const EKRANLAR = [
  ['masaustu', { width: 1440, height: 900 }, false],
  ['dar', { width: 667, height: 375 }, true],
  ['genis', { width: 844, height: 390 }, true],
  ['dikey', { width: 390, height: 844 }, true],
];

/** Sayfadan bir öğenin kutusu. */
const OLC = `sec => { const n = document.querySelector(sec); if (!n) return null;
  const r = n.getBoundingClientRect();
  return { left: Math.round(r.left), right: Math.round(r.right), top: Math.round(r.top), bottom: Math.round(r.bottom) }; }`;
/** Çubuktaki görünür düğmelerin kimlikleri, soldan sağa. */
const CUBUK_SIRA = `() => [...document.querySelectorAll('#home-actions > *')]
  .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden && n.getBoundingClientRect().width > 0)
  .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left).map(n => n.id)`;
/** Çubuk kaç satıra yayıldı (standart çubuk tek satır olmalı)? */
const CUBUK_SATIR = `() => new Set([...document.querySelectorAll('#home-actions > *')]
  .filter(n => n.getBoundingClientRect().width > 0).map(n => Math.round(n.getBoundingClientRect().top))).size`;
/** İki kutu kesişiyor mu (üst üste binme)? */
const binisiyor = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const pw = await playwrightYukle(kok);
const atla = pw ? false : 'Playwright yok (npm i -D playwright ya da PLAYWRIGHT_MODULE ile yol ver)';

test('standart çubuk dört ekran ölçüsünde de tek satır, taşmıyor, oyun adına binmiyor', { skip: atla }, async () => {
  const { chromium } = pw;
  await mkdir(path.join(kok, 'artifacts'), { recursive: true });
  const { server, adres } = await sunucuAc(kok);
  let browser = null;
  try {
    browser = await chromium.launch(tarayiciAyari());
    for (const [ad, ekran, mobil] of EKRANLAR) {
      const ctx = await browser.newContext({
        viewport: ekran,
        isMobile: mobil,
        hasTouch: mobil,
        deviceScaleFactor: mobil ? 2 : 1,
      });
      const page = await ctx.newPage();
      await page.goto(adres + '/?test');
      await page.waitForFunction(() => !!window.__kaleTasima);
      await page.waitForTimeout(400);
      // Dikey tutuşta oyun "Telefonu yan çevir" perdesini gösterir; çubuk arkasında durur, ölçülebilsin diye
      // perde yalnız bu testte gizlenir (oyun kuralları değişmez).
      if (ad === 'dikey') await page.addStyleTag({ content: '#rotate{display:none!important}' });
      const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);
      const cubuk = await olc('#home-actions'),
        marka = await olc('.home-top .brand');
      const sira = await page.evaluate(`(${CUBUK_SIRA})()`),
        satir = await page.evaluate(`(${CUBUK_SATIR})()`);
      await page.screenshot({ path: path.join(kok, 'artifacts', `standart-cubuk-${ad}-giris.png`) });
      await ctx.close();

      assert.deepEqual(
        sira,
        ['home-site', 'home-sound', 'home-muzik', 'home-help'],
        `${ad}: standart dörtlü bu sırayla olmalı (okunan: ${sira.join(', ')})`,
      );
      assert.equal(satir, 1, `${ad}: standart araç çubuğu tek satırda kalmalı (düğmeler alt satıra kaydı)`);
      assert.ok(
        cubuk.left >= 0 && cubuk.right <= ekran.width,
        `${ad}: üst çubuk ekrandan taşıyor (${cubuk.left}..${cubuk.right}, ekran ${ekran.width})`,
      );
      assert.ok(cubuk.top >= 0 && cubuk.bottom <= ekran.height, `${ad}: üst çubuk ekranın dışında`);
      assert.ok(
        !binisiyor(cubuk, marka),
        `${ad}: üst çubuk oyun adının üstüne biniyor (çubuk ${cubuk.left}, marka ${marka.right})`,
      );
    }
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    server.close();
  }
});

test('standart Esc menüsü dar yatay telefonda kaydırmadan sığar, pencere düğme sütunu kadar dar', { skip: atla }, async () => {
  const { chromium } = pw;
  await mkdir(path.join(kok, 'artifacts'), { recursive: true });
  const { server, adres } = await sunucuAc(kok);
  let browser = null;
  try {
    browser = await chromium.launch(tarayiciAyari());
    for (const [ad, ekran, mobil] of [EKRANLAR[1], EKRANLAR[0]]) {
      const ctx = await browser.newContext({
        viewport: ekran,
        isMobile: mobil,
        hasTouch: mobil,
        deviceScaleFactor: mobil ? 2 : 1,
      });
      const page = await ctx.newPage();
      await page.goto(adres + '/?test');
      await page.waitForFunction(() => !!window.__kaleTasima);
      await page.click('#solo');
      await page.waitForFunction(() => document.body.classList.contains('playing'));
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(kok, 'artifacts', `standart-cubuk-${ad}-oyun.png`) });
      // Düğmeye doğrudan basılır: masaüstünde maç fare kilidiyle başlar, kilitli tuvali Playwright'ın tıklaması
      // deler geçemez (canvas tüm işaretçi olaylarını yutar).
      await page.evaluate(() => document.querySelector('#pause').click());
      await page.waitForSelector('#muzik-ses');
      await page.waitForTimeout(250);

      const olc = sec => page.evaluate(`(${OLC})(${JSON.stringify(sec)})`);
      const kart = await olc('#menu .card'),
        son = await olc('.menu-buttons a.btn');
      const dugmeler = await page.evaluate(() =>
        [...document.querySelectorAll('.menu-buttons > *')]
          .filter(n => getComputedStyle(n).display !== 'none' && !n.hidden)
          .map(n => n.id || n.textContent.trim()),
      );
      // Menü kaydırmaya düşmemeli: içerik kartın içine sığsın.
      const kaydirma = await page.evaluate(() => {
        const n = document.querySelector('#menu .card');
        return n.scrollHeight - n.clientHeight;
      });
      await page.screenshot({ path: path.join(kok, 'artifacts', `standart-cubuk-${ad}-duraklatma.png`) });
      await ctx.close();

      assert.deepEqual(
        dugmeler,
        ['resume', 'menu-help', 'sound', 'muzik', 'muzik-row', 'quality', 'leave', "josephuz.com'a dön"],
        `${ad}: Esc menüsünün sırası standart olmalı (okunan: ${dugmeler.join(', ')})`,
      );
      assert.ok(kaydirma <= 1, `${ad}: Esc menüsü kaydırmaya düşüyor (${kaydirma}px taşma)`);
      assert.ok(
        son.bottom <= ekran.height && kart.top >= 0,
        `${ad}: Esc menüsünün son satırı ekrandan taşıyor (${son.bottom} > ${ekran.height})`,
      );
      assert.ok(
        kart.right - kart.left <= 436,
        `${ad}: Esc penceresi düğme sütunu kadar dar olmalı (${kart.right - kart.left}px)`,
      );
    }
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    server.close();
  }
});
