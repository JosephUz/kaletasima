// Giriş ekranındaki üç oda düğmesi (TEK BAŞINA / Oda kur / Odaya katıl) `.home-content` kutusunun içinde kalmalı:
// kutu `overflow:auto` olduğu için taşan düğmenin merkezine dokunulamaz, dokunuş altındaki `section#home`e gider.
// Gece testi 2026-10-20: iPhone 13 yatayda (844x390) `button#join-toggle` böyle örtülüydü (iz da484a27ba70).
// Playwright ister (bkz. tests/duzen.test.mjs); yoksa test atlanır.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { playwrightYukle } from './playwright-bul.mjs';
import { sunucuAc, tarayiciAyari } from './yerel-sunucu.mjs';

const kok = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const pw = await playwrightYukle(kok);

const atla = pw ? false : 'Playwright yok (npm i -D playwright ya da PLAYWRIGHT_MODULE ile yol ver)';

test('yatay telefonda giriş ekranının oda düğmelerine dokunulabilir', { skip: atla }, async () => {
  const { chromium, devices } = pw;
  const { server, adres } = await sunucuAc(kok);
  let browser = null;
  try {
    browser = await chromium.launch(tarayiciAyari());
    for (const ad of ['Pixel 7 landscape', 'iPhone 13 landscape']) {
      const { defaultBrowserType, ...cihaz } = devices[ad];
      const ctx = await browser.newContext(cihaz);
      const page = await ctx.newPage();
      await page.goto(adres + '/?test');
      await page.waitForFunction(() => !!window.__kaleTasima);
      await page.waitForTimeout(300);
      const sonuc = await page.evaluate(() => {
        const tarif = (el) => (el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') : 'hiçbir şey');
        return [...document.querySelectorAll('.home-buttons button')].map((dugme) => {
          const k = dugme.getBoundingClientRect();
          const ust = document.elementFromPoint(k.left + k.width / 2, k.top + k.height / 2);
          return { id: dugme.id, ulasan: tarif(ust), kendisi: !!ust && (ust === dugme || dugme.contains(ust)) };
        });
      });
      await ctx.close();
      assert.ok(sonuc.length === 3, `${ad}: üç oda düğmesi beklenir, ${sonuc.length} bulundu`);
      for (const d of sonuc) {
        assert.ok(d.kendisi, `${ad}: #${d.id} merkezine dokununca ${d.ulasan} alıyor — düğme örtülü`);
      }
    }
  } finally {
    await browser?.close();
    server.closeAllConnections?.();
    server.close();
  }
});
