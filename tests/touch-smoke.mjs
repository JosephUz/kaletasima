// Dokunmatik dumanı testi: yatay telefon taklidiyle (844x390, dokunmatik) çalışan sunucuya bağlanır; uygulama kipinde (?app)
// oda düğmelerinin "Yakında" olduğunu ve sunucuya bağlanılmadığını, izometrik başlayıp 🎥 ile omuz üstüne geçişi, joystick'i (analog yürüme, sonuna kadar itince koşu),
// sağ yarıda bakışı, VUR / ZIPLA düğmelerini ve dik tutunca "yan çevir" uyarısını dener. Dokunuşlar Chrome DevTools
// (Input.dispatchTouchEvent) ile çoklu parmak. Adres: GAME_URL (varsayılan http://127.0.0.1:5185).
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const url = process.env.GAME_URL || 'http://127.0.0.1:5185';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true,
});
try {
  const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    }),
    page = await ctx.newPage(),
    errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', e => {
    if (e.type() === 'error') errors.push(e.text());
  });
  const game = fn => page.evaluate(fn);
  const hero = () => game(() => window.__kaleTasima.world().players[0]);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, points) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  const center = async sel => {
    const b = await page.locator(sel).boundingBox();
    return [b.x + b.width / 2, b.y + b.height / 2];
  };
  const tapAt = async ([x, y], hold = 70) => {
    await touch('touchStart', [[x, y]]);
    await page.waitForTimeout(hold);
    await touch('touchEnd', []);
  };

  await page.goto(url + '/?test=1&app');
  await page.waitForFunction(() => !!window.__kaleTasima);
  assert.ok(await game(() => document.body.classList.contains('touch')), 'dokunmatik kip açılmalı');
  // Uygulama kipi: çok oyunculu kapalı, sunucuya bağlantı yok.
  assert.ok(await page.locator('#create').isDisabled(), 'Oda kur basılmaz');
  assert.ok(await page.locator('#join-toggle').isDisabled(), 'Odaya katıl basılmaz');
  assert.equal(await page.locator('.soon-tag').count(), 2, 'iki düğmede YAKINDA');
  assert.equal(await game(() => window.__kaleTasima.net().ws), null, 'sunucuya bağlanılmaz');
  await page.screenshot({ path: 'artifacts/t1-home-app.png' });

  await page.tap('#solo');
  await page.waitForTimeout(500);
  assert.ok(await page.locator('.tbtn[data-t=hit]').isVisible(), 'dokunmatik düğmeler görünür');
  assert.ok(!(await page.locator('.compact-controls').isVisible()), 'klavye ipuçları gizli');
  assert.equal(await game(() => window.__kaleTasima.view().mode), 'iso', 'telefonda izometrik başlar');
  assert.ok(!(await page.locator('#crosshair').isVisible()), 'izometrikte artı yok');
  // 🎥: omuz üstüne geçer (artı görünür), tekrar basınca izometrik.
  await page.tap('#cam-toggle');
  await page.waitForTimeout(150);
  assert.equal(await game(() => window.__kaleTasima.view().mode), 'third', '🎥 omuz üstüne geçer');
  assert.ok(await page.locator('#crosshair').isVisible(), 'omuz üstünde artı');
  await page.tap('#cam-toggle');
  await page.waitForTimeout(100);
  assert.equal(await game(() => window.__kaleTasima.view().mode), 'iso');
  // Botlar dursun: yalnız dokunmatik girdi test edilsin.
  await game(() => {
    for (const p of window.__kaleTasima.world().players.slice(1)) p.bot = false;
  });

  // Joystick: yarım itiş yürür (koşmaz), sonuna kadar itiş koşar.
  const start = await hero();
  await touch('touchStart', [[150, 250]]);
  for (let i = 1; i <= 4; i++) {
    await touch('touchMove', [[150, 250 - i * 7]]);
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(400);
  const walked = await hero();
  assert.ok(Math.hypot(walked.x - start.x, walked.z - start.z) > 0.8, 'joystick yürütür');
  assert.equal(walked.sprint, false, 'yarım itiş koşmaz');
  assert.ok(await game(() => !document.querySelector('.touch-stick').hidden), 'joystick parmağın altında');
  await page.screenshot({ path: 'artifacts/t2-stick.png' });
  await touch('touchMove', [[150, 170]]);
  await page.waitForTimeout(150);
  assert.equal((await hero()).sprint, true, 'sonuna kadar itiş koşar');

  // İkinci parmak sağ yarıda: bakış döner (joystick bırakılmadan).
  const yaw = () => game(() => window.__kaleTasima.view().yaw);
  const y0 = await yaw();
  await touch('touchMove', [
    [150, 170],
    [600, 200],
  ]);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', [
      [150, 170],
      [600 + i * 12, 200],
    ]);
    await page.waitForTimeout(20);
  }
  assert.ok(Math.abs((await yaw()) - y0) > 0.1, 'sağ yarıda kaydırmak bakışı çevirir');
  await touch('touchEnd', []);
  await page.waitForTimeout(150);
  assert.ok(await game(() => document.querySelector('.touch-stick').hidden), 'parmak kalkınca joystick kaybolur');

  // VUR: sopa sallanır; ZIPLA: havaya kalkar.
  await game(() => {
    const p = window.__kaleTasima.world().players[0];
    p.attackCd = 0;
    p.hasClub = true;
  });
  await tapAt(await center('.tbtn[data-t=hit]'));
  await page.waitForTimeout(40);
  assert.ok((await hero()).attackCd > 0, 'VUR sopayı sallar');
  await tapAt(await center('.tbtn[data-t=jump]'));
  await page.waitForTimeout(120);
  assert.ok((await hero()).y > 0, 'ZIPLA havaya kaldırır');
  await page.screenshot({ path: 'artifacts/t3-play.png' });

  // Menü: düğmeler gizlenir; devam edince geri gelir.
  await page.tap('#pause');
  await page.waitForTimeout(150);
  assert.ok(!(await page.locator('.tbtn[data-t=hit]').isVisible()), 'menüde düğmeler gizli');
  await page.tap('#resume');
  await page.waitForTimeout(150);
  assert.ok(await page.locator('.tbtn[data-t=hit]').isVisible());

  // Dik ekran: yan çevir uyarısı.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('#rotate').isVisible(), 'dik tutunca yan çevir uyarısı');
  assert.deepEqual(errors, []);
  console.log('dokunmatik dumanı testi geçti');
} finally {
  await browser.close();
}
