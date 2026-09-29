const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
  headless: true,
  args: ['--disable-gpu-sandbox', ...(process.env.SWIFTSHADER ? ['--use-gl=angle', '--use-angle=swiftshader'] : ['--use-gl=angle', '--use-angle=d3d11', '--ignore-gpu-blocklist'])],
});
try {
  const context = await browser.newContext({ viewport: { width: 1536, height: 960 } }),
    page = await context.newPage(),
    errors = [];
  page.on('pageerror', e => {
    errors.push(e.message);
    console.log(e.stack);
  });
  page.on('console', e => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto((process.env.GAME_URL || 'http://127.0.0.1:5185') + '/?test=1');
  await page.waitForFunction(() => !!window.__kaleTasima);
  await page.screenshot({ path: 'artifacts/01-home.png' });
  assert.equal(await page.locator('#nickname').inputValue(), 'Kale Taşımacılık');
  await page.locator('#solo').click();
  await page.waitForTimeout(400);
  // V: izometrik kamera, tekrar V: omuz üstü (masaüstünde omuzla başlar).
  assert.equal(await page.evaluate(() => window.__kaleTasima.view().mode), 'third');
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__kaleTasima.view().mode), 'iso');
  await page.screenshot({ path: 'artifacts/01b-iso.png' });
  await page.keyboard.press('KeyV');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => window.__kaleTasima.view().mode), 'third');
  await page.evaluate(() => {
    const w = window.__kaleTasima.world();
    w.players.forEach(p => {
      p.bot = false;
      p.vx = p.vz = p.moveX = p.moveZ = 0;
    });
  });
  assert.equal((await page.evaluate(() => window.__kaleTasima.state())).world.players.length, 5);
  assert.equal(await page.locator('#minimap').count(), 0);
  assert.ok(
    await page.evaluate(() => {
      const v = window.__kaleTasima.view();
      return v.scene.fog === null && v.baseViews.every(b => b.p.visible);
    }),
  );
  assert.equal(await page.locator('.score-values span').count(), 5);
  assert.ok((await page.locator('#team-count').textContent()).includes('/ 10'));
  assert.ok((await page.locator('#players').textContent()).includes('Bot-'));
  await page.evaluate(async () => {
    const { roomPoint } = await import('/src/castle.js'),
      w = window.__kaleTasima.world();
    window.alarmEnemyOriginal = { ...w.players[1] };
    Object.assign(w.players[1], roomPoint(w.bases[0], 2, 2));
  });
  await page.waitForTimeout(250);
  assert.ok(await page.locator('#castle-alert').isVisible());
  assert.ok(await page.locator('#castle-alert-text').isVisible());
  await page.screenshot({ path: 'artifacts/12-castle-alert.png' });
  await page.evaluate(() => Object.assign(window.__kaleTasima.world().players[1], window.alarmEnemyOriginal));
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#castle-alert').isVisible(), false);
  await page.keyboard.press('Space');
  await page.waitForTimeout(140);
  assert.ok((await page.evaluate(() => window.__kaleTasima.world().players[0].y)) > 0.1);
  await page.keyboard.press('Space');
  await page.waitForTimeout(80);
  assert.equal(await page.evaluate(() => window.__kaleTasima.world().players[0].airJumps), 1);
  assert.ok(await page.evaluate(() => window.__kaleTasima.world().players[0].vy > 0));
  await page.keyboard.press('Space');
  await page.waitForTimeout(60);
  assert.equal(await page.evaluate(() => window.__kaleTasima.world().players[0].stats.jumps), 2);
  await page.evaluate(() => {
    const w = window.__kaleTasima.world(),
      p = w.players[0],
      b = w.bases[0];
    p.x = b.x;
    p.z = b.z + 9.7;
    p.y = p.vy = 0;
  });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#stairs').isVisible());
  await page.keyboard.press('Digit3');
  await page.waitForFunction(() => window.__kaleTasima.world().players[0].floor === 2, null, { timeout: 5000 });
  await page.keyboard.press('Digit1');
  await page.waitForFunction(() => window.__kaleTasima.world().players[0].floor === 0, null, { timeout: 5000 });
  await page.screenshot({ path: 'artifacts/02-stairs.png' });
  await page.evaluate(() => {
    const w = window.__kaleTasima.world(),
      p = w.players[0],
      b = w.bases[0];
    p.x = b.x - 9;
    p.z = b.z - 10;
  });
  await page.waitForTimeout(700);
  assert.equal((await page.evaluate(() => window.__kaleTasima.state())).occluded[0], true);
  await page.screenshot({ path: 'artifacts/03-occlusion.png' });
  assert.equal((await page.evaluate(() => window.__kaleTasima.state())).mode, 'third');
  const before = await page.evaluate(() => {
    const s = window.__kaleTasima.state(),
      p = s.world.players[0];
    return { x: s.camera.x - p.x, z: s.camera.z - p.z };
  });
  await page.keyboard.down('KeyS');
  await page.waitForTimeout(350);
  await page.keyboard.up('KeyS');
  await page.waitForTimeout(120);
  const after = await page.evaluate(() => {
    const s = window.__kaleTasima.state(),
      p = s.world.players[0];
    return { x: s.camera.x - p.x, z: s.camera.z - p.z };
  });
  assert.ok(Math.abs(before.x - after.x) < 0.1 && Math.abs(before.z - after.z) < 0.1, 'camera stays at shoulder');
  await page.screenshot({ path: 'artifacts/04-shoulder.png' });
  await page.keyboard.press('Tab');
  await page.evaluate(() => {
    const w = window.__kaleTasima.world(),
      p = w.players[0];
    p.x = 0;
    p.z = 2.7;
    p.floor = 0;
    p.vx = p.vz = 0;
    p.angle = Math.PI;
  });
  await page.waitForTimeout(600);
  assert.equal(
    await page.evaluate(() => window.__kaleTasima.view().baseViews.filter(v => v.p.visible).length),
    5,
    'all castles remain visible from center',
  );
  await page.evaluate(() => {
    window.__kaleTasima.view().yaw = Math.PI;
    window.__kaleTasima.view().pitch = 0.2;
  });
  await page.waitForTimeout(150);
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(400);
  const tree = await page.evaluate(() => window.__kaleTasima.view().project(0, 0.2, 0));
  assert.ok(await page.evaluate(() => window.__kaleTasima.world().players[0].stats.treeHits > 0));
  await page.screenshot({ path: 'artifacts/05-gold-tree.png' });
  await page.mouse.click(tree.x, tree.y, { button: 'right' });
  await page.waitForTimeout(150);
  assert.ok(await page.locator('.unarmed').isVisible());
  await page.waitForTimeout(1200);
  assert.equal(await page.locator('.cooldown').count(), 0);
  assert.equal(await page.evaluate(() => window.__kaleTasima.world().players[0].hasClub), false);
  await page.evaluate(async () => {
    const { clubCrate } = await import('/src/items.js'),
      w = window.__kaleTasima.world();
    Object.assign(w.players[0], clubCrate(w.bases[0]), { vx: 0, vz: 0, y: 0, vy: 0 });
  });
  await page.waitForTimeout(250);
  assert.ok((await page.locator('#context').textContent()).includes('Kasadan sopa al'));
  await page.screenshot({ path: 'artifacts/06-club-crate.png' });
  await page.keyboard.press('KeyE');
  await page.waitForTimeout(200);
  assert.equal(await page.evaluate(() => window.__kaleTasima.world().players[0].hasClub), true);
  assert.equal(await page.locator('.unarmed').count(), 0);
  await page.keyboard.press('F1');
  assert.ok(await page.locator('#shortcuts').isVisible());
  await page.screenshot({ path: 'artifacts/07-shortcuts.png' });
  await page.locator('#help-close').click();
  await page.evaluate(async () => {
    const { addItem } = await import('/src/items.js'),
      w = window.__kaleTasima.world();
    while (w.items.filter(i => i.base === 0).length < 10) addItem(w, 0);
    window.__kaleTasima.step(3602);
  });
  assert.ok(await page.locator('#results').isVisible());
  assert.equal(await page.locator('#result-table tbody tr').count(), 5);
  await page.screenshot({ path: 'artifacts/08-results.png' });
  await page.locator('#result-home').click();
  await page.locator('#create').click();
  await page.locator('#lobby').waitFor({ state: 'visible' });
  assert.equal(await page.locator('.seat').count(), 10);
  const code = await page.locator('#lobby-code').innerText();
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    guest = await c2.newPage();
  guest.on('pageerror', e => errors.push(e.message));
  await guest.goto((process.env.GAME_URL || 'http://127.0.0.1:5185') + '/?test=1&oda=' + code);
  await guest.locator('#nickname').fill('Rakip');
  await guest.locator('#join').click();
  await guest.locator('#lobby').waitFor({ state: 'visible' });
  await guest.locator('#red-seats .seat:not([disabled])').first().click();
  await guest.waitForTimeout(100);
  await page.bringToFront();
  await page.screenshot({ path: 'artifacts/09-pvp-lobby.png' });
  await page.locator('#lobby-start').click();
  await page.waitForFunction(() => window.__kaleTasima.state().online);
  await guest.waitForFunction(() => window.__kaleTasima.state().online);
  let state = await guest.evaluate(() => window.__kaleTasima.state());
  assert.equal(state.world.players.length, 10);
  assert.equal(state.world.players[state.world.me].team, 1);
  assert.equal(state.world.players.filter(p => !p.bot).length, 2);
  await page.waitForTimeout(600);
  await page.screenshot({ path: 'artifacts/10-pvp-game.png' });
  assert.ok((await page.evaluate(() => window.__kaleTasima.state())).world.time > 0.2);
  await guest.close();
  await c2.close();
  await page.evaluate(() => document.exitPointerLock());
  await page.locator('#pause').click();
  await page.locator('#leave').click();
  await page.locator('#create').click();
  await page.locator('#lobby').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#red-seats .seat:not([disabled])').count(), 5);
  assert.match(await page.locator('#lobby-mode').innerText(), /^Co-op/);
  await page.screenshot({ path: 'artifacts/11-room-lobby.png' });
  assert.deepEqual(errors, []);
  console.log(
    JSON.stringify({
      checks:
        'solo, jump, stair keys, occlusion, shoulder follow, no fog or distance culling, gold tree, club crate resupply, help, results, PvP 2 clients, single create room',
      errors,
    }),
  );
} finally {
  await browser.close();
}
