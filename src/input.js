import { allied } from './castle.js';
import { ISO } from './config.js';
import { t } from './dil.js';
import { createTouch, TOUCH } from './touch.js';

/** Dokunmatik düğmeler (sağ alt): VUR basılı tutulunca vurmaya devam eder (sol tık basılı gibi). */
const BUTTONS = [
  { id: 'hit', label: t('dokun.vur'), sub: t('dokun.vurAlt'), cls: 'big' },
  { id: 'throw', label: t('dokun.firlat') },
  { id: 'grab', label: t('dokun.tasi'), sub: t('dokun.tasiAlt') },
  { id: 'jump', label: t('dokun.zipla'), sub: t('dokun.ziplaAlt') },
];

/**
 * Girdi: klavye, fare ve fare kilidi (omuz üstü kamera). Basılı tuşlar sürekli okunur; tek karelik eylemler (vur, fırlat,
 * al / bırak, satın al, zıpla, kat seç) edges'te birikir ve read() ile bir kez tüketilir.
 *
 * Dokunmatik kipte (hooks.touch, bkz. touch.js) fare kilidi yoktur: sol yarıda joystick (sonuna kadar itmek koşu), sağ
 * yarıda bakış, düğmeler aynı eylemleri üretir (VUR sol tık, FIRLAT sağ tık, TAŞI E, ZIPLA Boşluk).
 *
 * hooks: help(), pause(), closeHelp() — F1 / Esc ekranları (screens.js); camera() — V (kamera); touch — dokunmatik kip
 */
export function createInput(game, canvas, hooks) {
  const keys = new Set(),
    edges = {},
    pointer = { x: innerWidth / 2, y: innerHeight / 2, inside: false, held: false, middle: false };
  let unlockedAt = -1000;
  const turn = (dx, dy) => {
    const view = game.view;
    view.yaw -= dx * 0.0022;
    view.pitch = Math.max(0.08, Math.min(0.9, view.pitch + dy * 0.0022));
  };
  const pad = hooks.touch
    ? createTouch(document.body, BUTTONS, {
        down(id) {
          if (!game.started || game.screen) return;
          edges[id] = true;
          if (id === 'hit') pointer.held = true;
        },
        up(id) {
          if (id === 'hit') pointer.held = false;
        },
        look: (dx, dy) => {
          if (game.started && !game.screen) turn(dx, dy);
        },
      })
    : null;

  function unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function lock() {
    if (pad) return;
    try {
      canvas.requestPointerLock?.()?.catch?.(() => {});
    } catch {}
  }
  function clear() {
    pad?.clear();
    keys.clear();
    pointer.held = pointer.middle = false;
    for (const k in edges) delete edges[k];
    if (game.online) game.net.send('input', { input: {} });
  }
  const hero = () => game.world.players[game.world.me || 0];
  /**
   * Nişan: ekranın ortası (artı işareti); zemine değmiyorsa bakış yönünde 12 birim ileri. İzometrikte ekranın ortası
   * oyuncunun kendisidir: aynı kattaki en yakın rakip (ISO.aimRange), yoksa baktığı yönde ISO.aimAhead ileri.
   */
  function aim() {
    const p = hero(),
      view = game.view;
    if (view.mode === 'iso') {
      const w = game.world;
      let best = null,
        bd = ISO.aimRange;
      for (const o of w.players) {
        if (o.id === p.id || o.hidden || allied(w, p.id, o.id) || (o.floor || 0) !== (p.floor || 0)) continue;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      return best
        ? { x: best.x, z: best.z }
        : { x: p.x + Math.sin(p.angle) * ISO.aimAhead, z: p.z + Math.cos(p.angle) * ISO.aimAhead };
    }
    // Artı işareti tuvalin ortasındadır; telefonda tuval pencereden kısa olabilir (bkz. view.olcu()).
    const { w, h } = view.olcu();
    return (
      view.aimFromScreen(w / 2, h / 2) || {
        x: p.x + Math.sin(view.yaw) * 12,
        z: p.z + Math.cos(view.yaw) * 12,
      }
    );
  }
  /** Bu karenin girdisi: kameraya göre hareket yönü, nişan, koşu ve birikmiş eylemler (tüketilir). */
  function read() {
    const view = game.view;
    let right =
        Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')),
      down = Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')),
      run = keys.has('ShiftLeft') || keys.has('ShiftRight');
    // Joystick analogdur (yarım itiş yavaş yürür); sonuna kadar itmek koşudur.
    const stick = pad?.poll();
    if (stick && !right && !down) {
      right = stick.x;
      down = stick.z;
      run ||= stick.push >= TOUCH.push;
    }
    let x = -Math.sin(view.yaw) * down - Math.cos(view.yaw) * right,
      z = -Math.cos(view.yaw) * down + Math.sin(view.yaw) * right;
    const len = Math.hypot(x, z);
    if (len > 1) {
      x /= len;
      z /= len;
    }
    const out = { x, z, aim: aim(), sprint: run, ...edges };
    if (pointer.held) out.hit = true;
    for (const k in edges) delete edges[k];
    return out;
  }

  const prevent = new Set([
    'Space',
    'Tab',
    'F1',
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'Digit1',
    'Digit2',
    'Digit3',
  ]);
  window.addEventListener('keydown', e => {
    if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;
    if (prevent.has(e.code)) e.preventDefault();
    if (e.code === 'F1') {
      if (!e.repeat) hooks.help();
      return;
    }
    if (e.code === 'Escape') {
      // Kilit açıkken Esc'i tarayıcı kilidi bırakmak için kullanır; hemen ardından gelen Esc menüyü açmasın.
      if (document.pointerLockElement || performance.now() - unlockedAt < 350) return;
      if (game.screen === 'shortcuts') hooks.closeHelp();
      else hooks.pause();
      return;
    }
    if (!game.started || game.screen) return;
    if (e.code === 'Tab') {
      if (document.pointerLockElement) unlock();
      else lock();
      return;
    }
    keys.add(e.code);
    if (e.repeat) return;
    if (e.code === 'KeyE') edges.grab = true;
    if (e.code === 'KeyV') hooks.camera?.();
    if (e.code === 'KeyB') edges.buy = true;
    if (e.code === 'Space') edges.jump = true;
    if (e.code === 'KeyF') edges.hit = true;
    if (e.code === 'KeyQ') edges.throw = true;
    if (/^Digit[123]$/.test(e.code)) edges.floor = Number(e.code.slice(-1)) - 1;
  });
  window.addEventListener('keyup', e => keys.delete(e.code));
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointermove', e => {
    if (document.pointerLockElement === canvas || pointer.middle) {
      turn(e.movementX, e.movementY);
    } else {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.inside = true;
    }
  });
  canvas.addEventListener('pointerleave', () => (pointer.inside = false));
  canvas.addEventListener('pointerdown', e => {
    if (!game.started || game.screen) return;
    if (e.button === 1) {
      e.preventDefault();
      pointer.middle = true;
      return;
    }
    // Kilit yokken ilk sol tık yalnız fareyi kilitler (vurmaz).
    if (!document.pointerLockElement && e.button === 0) {
      lock();
      return;
    }
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.inside = true;
    if (e.button === 0) {
      edges.hit = true;
      pointer.held = true;
    }
    if (e.button === 2) edges.throw = true;
  });
  window.addEventListener('pointerup', e => {
    if (e.button === 0) pointer.held = false;
    if (e.button === 1) pointer.middle = false;
  });
  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement !== canvas) {
      unlockedAt = performance.now();
      pointer.held = false;
    }
  });
  window.addEventListener('blur', () => {
    clear();
    if (game.started && !game.screen) hooks.pause();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      clear();
      if (game.started && !game.screen) hooks.pause();
    }
  });
  // Çizim alanı yalnız pencere boyuyla değil, telefonda tarayıcı çubuklarının bıraktığı görünür alanla da değişir:
  // `visualViewport` olayları (adres çubuğu açılıp kapanırken pencere boyu aynı kalabilir) de yenilemeli.
  const yenidenOlc = () => game.view.resize();
  window.addEventListener('resize', yenidenOlc);
  visualViewport?.addEventListener('resize', yenidenOlc);
  visualViewport?.addEventListener('scroll', yenidenOlc);

  /** Dokunmatik düğmeler yalnız maç sırasında görünür; TAŞI yakında alınacak eşya varken parlar. */
  function sync(near) {
    if (!pad) return;
    pad.show(game.started && !game.screen);
    pad.button('grab').classList.toggle('ready', !!near);
  }

  return { edges, lock, unlock, clear, aim, read, sync, touch: !!pad };
}
