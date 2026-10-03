// Düzen testi: yatay telefon taklidinde oyun ekranı sayfayı yatayda kaydırmamalı. Gece testi 2026-09-28'de
// üstteki başlık şeridinin arkasındaki gölge (`.top::before`) ekranın 11px dışına taştığı için sayfa kayıyordu.
// Playwright ister (bkz. README); kurulu Chrome değil, başsız kabuk kullanılır. Kurulumu tests/playwright-bul.mjs
// kendi arar (bu depo, sonra komşu depolar), böylece `npm test` ortam değişkeni olmadan da koşar; PLAYWRIGHT_MODULE
// ile başka bir kurulum verilebilir. Hiçbiri yoksa test atlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightYukle } from './playwright-bul.mjs';
import { sunucuAc, tarayiciAyari } from './yerel-sunucu.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pw = await playwrightYukle(kok);

const atla = pw ? false : 'Playwright yok (npm i -D playwright ya da PLAYWRIGHT_MODULE ile yol ver)';

test('yatay telefonda oyun ekranı sayfayı yatayda kaydırmaz', { skip: atla }, async () => {
  const { chromium, devices } = pw;
  const { server, adres } = await sunucuAc(kok);
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
