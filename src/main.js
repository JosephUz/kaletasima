import { gorunurAlanaKilitle } from './gorunur-alan.js';
import { $ } from './html.js';
import { createInput } from './input.js';
import { buy, interact } from './items.js';
import { melee, throwClub } from './combat.js';
import { Network } from './net/client.js';
import { macBasladi, macBitti, macKontrol } from './olcum.js';
import { isApp, onlineEnabled } from './platform.js';
import { targetScore } from './rules.js';
import { createScreens } from './screens.js';
import { enterFullscreen, fullscreenOn, toggleFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
import { GameView } from './view/gameview.js';
import { createWorld, step } from './world.js';

/**
 * İstemci uygulaması: sahne, girdi, arayüz, ekranlar ve iki oyun kipi.
 *  - **Tek başına**: simülasyon (world.js) bu tarayıcıda 60 Hz sabit adımla koşar.
 *  - **Çevrim içi**: sunucu koşar; istemci girdiyi 30 Hz gönderir, gelen paketlerle dünyayı kopyalar ve oyuncu konumlarını
 *    ara değerle yumuşatır. Aynı görünüm kodu çizer.
 * Her karede: (yerel adım / ağ girdisi) -> olaylar -> çizim -> arayüz (0,12 sn'de bir) -> düşük FPS'de kalite azaltma.
 * Dokunmatik kip (telefon, tablet, Android uygulaması; ?touch ile masaüstünde de): joystick ve düğmeler (touch.js).
 * Çevrim içi kapalıysa (config.js → ONLINE, ör. uygulamada) sunucuya hiç bağlanılmaz; oda düğmeleri "Yakında" yazar.
 */
export function start() {
  const canvas = $('#scene');
  const touch = touchDevice(),
    networked = onlineEnabled();
  document.body.classList.toggle('touch', touch);
  // Telefonda oyun kökünü (body) tarayıcı çubuklarının bıraktığı görünür alana kilitler: üst çubuk, giriş ekranının
  // üst şeridi ve lobideki oda kodu adres çubuğunun altında kalmaz (bkz. src/gorunur-alan.js, style.css → `html.vv`).
  // Sahneden önce: tuval ilk ölçüsünü kilitlenmiş kökten alsın.
  const gorunurAlan = gorunurAlanaKilitle(window);
  if (touch) {
    // Telefonda skor tablosu kapalı başlar (Skor düğmesi açar), düğme yazılarında klavye kısayolu yok.
    $('#score-panel').hidden = true;
    $('#pause').textContent = 'Menü';
  }
  const game = {
    world: createWorld(),
    view: null,
    net: null,
    started: false,
    online: false,
    screen: 'home',
    last: performance.now(),
    fps: 60,
    quality: 1,
    sound: true,
  };
  // Ses ayarı tarayıcıda kalır (menüdeki Ses düğmesi).
  try {
    game.sound = localStorage.getItem('kale.sound') !== 'off';
  } catch {}
  let acc = 0,
    uiTimer = 0,
    netTimer = 0,
    pingTimer = 0,
    latest = null,
    snapshotAt = 0,
    slowTime = 0;
  try {
    game.view = new GameView(canvas, game.world);
  } catch (e) {
    $('#fatal').hidden = false;
    throw e;
  }
  /** Kamera: masaüstünde omuz üstüyle, dokunmatikte izometrik başlar; 🎥 ya da V ile geçilir (seçim tarayıcıda hatırlanır). */
  let savedCam = null;
  try {
    savedCam = localStorage.getItem('kale.cam');
  } catch {}
  game.camera = touch ? (savedCam === 'third' ? 'third' : 'iso') : savedCam === 'iso' ? 'iso' : 'third';
  const setCamera = mode => {
    game.camera = mode;
    game.view.setMode(mode);
    document.body.classList.toggle('iso', mode === 'iso');
    try {
      localStorage.setItem('kale.cam', mode);
    } catch {}
  };
  const toggleCamera = () => setCamera(game.camera === 'iso' ? 'third' : 'iso');
  $('#cam-toggle').onclick = toggleCamera;

  // Tam ekran: telefonda adres çubuğunun üstü yemesine karşı en kesin çare, bu yüzden hem giriş ekranının üst
  // şeridinde hem oyun içindeki üst çubukta durur; ikisi de açık / kapalıyı birlikte gösterir. Play Store
  // uygulamasında tarayıcı çubuğu zaten yok: düğmeler hiç görünmez.
  const fullBtns = [$('#full-toggle'), $('#home-full')];
  if (isApp() || !touch) for (const b of fullBtns) b.hidden = true;
  else {
    const syncFull = () => {
      const on = fullscreenOn();
      for (const b of fullBtns) b.setAttribute('aria-label', on ? 'Tam ekrandan çık' : 'Tam ekran');
      fullBtns[0].textContent = on ? '⤡' : '⛶';
      fullBtns[1].textContent = on ? '⤡ Tam ekrandan çık' : '⛶ Tam ekran';
    };
    for (const b of fullBtns)
      b.onclick = () => {
        toggleFullscreen();
        // Çubuklar kaybolduktan sonra görünür alan değişir; tarayıcı değişimi geç bildirir, bir de biz okuyalım.
        setTimeout(() => {
          syncFull();
          gorunurAlan.guncelle();
        }, 120);
      };
    document.addEventListener('fullscreenchange', () => {
      syncFull();
      gorunurAlan.guncelle();
    });
    syncFull();
  }
  document.body.classList.toggle('iso', game.camera === 'iso');
  game.view.setMode(game.camera);

  const input = createInput(game, canvas, {
    help: () => screens.help(),
    closeHelp: () => screens.closeHelp(),
    pause: () => screens.pause(),
    camera: () => toggleCamera(),
    touch,
  });
  const ui = createUI(game);
  const screens = createScreens(game, ui, input, { startSolo, goHome, connectAction });
  const hero = () => game.world.players[game.world.me || 0];

  function build(w) {
    game.view?.dispose();
    game.world = w;
    game.view = new GameView(canvas, w);
    game.view.setMode(game.camera);
    game.view.setQuality(game.quality);
    game.view.overview = false;
    game.view.resize();
  }
  function launch(w, network = false) {
    // Ölçüm: gerçek maç başlangıcı. Çevrimiçi 'start' yeniden bağlanınca da gelir (aynı maç sürüyor); o zaman sayılmaz.
    const yeniMac = !network || !(game.started && game.online);
    game.online = network;
    latest = network ? w : null;
    snapshotAt = performance.now();
    build(w);
    game.started = true;
    acc = 0;
    if (yeniMac) macBasladi(); // ölçüm: çevrimdışı her başlatma, çevrimiçi ilk 'start' (rematch lobiden geçer, yine sayılır)
    screens.show(null);
    input.clear();
    ui.update();
    input.lock();
    if (touch) enterFullscreen();
  }
  function startSolo() {
    net.leave();
    launch(createWorld(71, { names: [screens.nick()], difficulty: screens.difficulty() }));
  }
  function goHome() {
    net.leave();
    game.online = false;
    game.started = false;
    latest = null;
    screens.show('home');
    $('#net-status').hidden = true;
  }

  /** Oyun olayları: kahramanı ilgilendirenler görünüme (efekt), sese ve bildirimlere gider. */
  function events(list) {
    const w = game.world;
    for (const e of list) {
      if (e.type === 'claim')
        ui.toast(
          (w.mode === 'solo' ? w.players[e.player].name : ui.teamName(w.players[e.player].team)) +
            ' ' +
            targetScore(w) +
            ' eşyaya ulaştı · 60 saniye!',
        );
      if (e.player === hero().id || e.victim === hero().id || e.type === 'treehit') {
        game.view.event(e);
        if (['pickup', 'deposit', 'coin', 'hit', 'treehit'].includes(e.type)) ui.tone(e.type === 'coin' ? 750 : 350);
        if (e.type === 'rearm') ui.toast('Kasadan yeni sopa aldın.');
        if (e.type === 'stairs' && e.player === hero().id)
          ui.toast(
            (e.to > e.from ? '↑ Yukarı · ' : '↓ Aşağı · ') +
              (e.to + 1) +
              '. kata ' +
              (e.to > e.from ? 'çıkıyorsun' : 'iniyorsun'),
          );
        if (e.type === 'knockout' && e.victim === hero().id)
          ui.toast('Canın bitti · Bayıldın. Süre bitince kalende doğacaksın.');
        if (e.type === 'knockout' && e.player === hero().id)
          ui.toast(w.players[e.victim].name + ' bayıldı · Kalesi korumasız!');
        if (e.type === 'deposit') ui.toast('Eşya kalende saklandı.');
      }
    }
    if (w.winner !== null && game.screen !== 'results') {
      screens.result();
      if (game.started) macBitti(); // ölçüm: maç bitti (çevrimdışı kazanan belirlenince, çevrimiçi kazananlı ilk paket)
    }
  }
  /** Sunucu paketi: aynı kattaki görünen oyuncuların çizim konumu korunur (ara değer ondan hedefe yürür). */
  function receive(w) {
    latest = w;
    snapshotAt = performance.now();
    const old = game.world;
    game.world = {
      ...w,
      players: w.players.map(p => {
        const prev = old.players[p.id];
        return !p.hidden && prev && !prev.hidden && prev.floor === p.floor
          ? { ...p, x: prev.x, z: prev.z, y: prev.y }
          : { ...p };
      }),
    };
    events(w.events || []);
  }

  const net = new Network({
    lobby: screens.renderLobby,
    start: w => launch(w, true),
    snapshot: receive,
    error: message => {
      ui.toast(message);
      $('#home-status-message').textContent = message;
      $('#lobby-status').textContent = message;
    },
    status: message => {
      $('#net-status').textContent = message;
      $('#net-status').hidden = !message || !(game.online || net.room);
    },
    online: n => {
      const el = $('#home-online');
      el.textContent = n > 0 ? '● ' + n + ' çevrim içi' : '';
      el.title = 'Siteyi şu an açık tutan sekme sayısı';
    },
    ready: up => {
      screens.setServer(up);
      if (!up) $('#home-online').textContent = '';
    },
  });
  game.net = net;
  async function connectAction(type, body) {
    if (!networked) return;
    $('#home-status-message').textContent = 'Bağlanıyor…';
    try {
      await net.connect(screens.nick());
      net.send(type, { ...body, name: screens.nick() });
      $('#home-status-message').textContent = '';
    } catch (e) {
      $('#home-status-message').textContent = e.message;
    }
  }

  /** Çevrim içi: girdiyi gönder, ping ölç, oyuncuları son paketin konumuna (hızla ileri kestirerek) yumuşat. */
  function onlineFrame(dt) {
    netTimer -= dt;
    if (netTimer <= 0) {
      netTimer = 0.033;
      net.send('input', { input: game.screen ? {} : input.read() });
    }
    pingTimer -= dt;
    if (pingTimer <= 0) {
      pingTimer = 3;
      net.send('ping', { at: performance.now() });
    }
    if (!latest) return;
    const lag = Math.min(0.07, (performance.now() - snapshotAt) / 1000);
    for (const p of game.world.players) {
      const target = latest.players[p.id];
      if (p.hidden || !target || target.hidden) continue;
      const k = 1 - Math.exp(-22 * dt);
      p.x += (target.x + (target.vx || 0) * lag - p.x) * k;
      p.z += (target.z + (target.vz || 0) * lag - p.z) * k;
      p.y += (target.y - p.y) * k;
    }
  }
  /** Tek başına: 60 Hz sabit adım (karede en çok 5 adım). */
  function soloFrame(dt) {
    acc += dt;
    let guard = 0;
    while (acc >= 1 / 60 && guard++ < 5) {
      step(game.world, 1 / 60, input.read());
      acc -= 1 / 60;
      events(game.world.events);
      game.world.events.length = 0;
      if (game.world.winner !== null) break;
    }
  }
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.06, (now - game.last) / 1000);
    game.last = now;
    game.fps += (1 / Math.max(0.001, dt) - game.fps) * 0.025;
    if (game.started && game.world.winner === null) {
      if (game.online) onlineFrame(dt);
      else if (!game.screen) soloFrame(dt);
    }
    if (game.started) macKontrol(); // ölçüm: oyuncu 60 sn oynayınca bir kez "bir_dakika" (bayrak dolunca anında döner)
    ui.tickToast(dt);
    const playing = game.started && !game.screen;
    input.sync(playing && ui.nearest());
    game.view.render(game.world, game.screen && !game.online ? 0 : dt, {
      started: game.started,
      aim: playing ? input.aim() : null,
      nearest: playing ? ui.nearest() : null,
    });
    uiTimer -= dt;
    if (uiTimer <= 0) {
      uiTimer = 0.12;
      ui.update();
    }
    if (playing && game.fps < 32 && game.quality > 0) {
      slowTime += dt;
      if (slowTime > 5) {
        game.quality--;
        game.view.setQuality(game.quality);
        slowTime = 0;
        ui.toast('Akıcı oyun için grafik kalitesi azaltıldı.');
      }
    } else slowTime = 0;
  }

  screens.show('home');
  ui.update();
  requestAnimationFrame(frame);
  // Boşta bağlantı: giriş ekranındaki "çevrim içi" sayısı için (oda kurulunca / katılınca aynı bağlantı kullanılır).
  if (networked) net.connect(screens.nick()).catch(() => {});

  // Android uygulamasında geri tuşu: kısayollarda kapat, maçta menü aç / kapat, giriş ekranında uygulamadan çık.
  const app = isApp() ? window.Capacitor?.registerPlugin?.('App') : null;
  app?.addListener('backButton', () => {
    if (game.screen === 'shortcuts') screens.closeHelp();
    else if (game.started && (!game.screen || game.screen === 'menu')) screens.pause();
    else if (game.screen === 'home') app.exitApp();
    else goHome();
  });

  // Test kancası (tests/browser-smoke.mjs): ?test ile açılınca durum okunur ve adım atılabilir.
  if (new URLSearchParams(location.search).has('test'))
    window.__kaleTasima = {
      state: () => ({
        started: game.started,
        screen: game.screen,
        online: game.online,
        world: game.world,
        mode: game.view.mode,
        drawCalls: game.view.renderer.info.render.calls,
        camera: { x: game.view.camera.position.x, y: game.view.camera.position.y, z: game.view.camera.position.z },
        visibility: [...game.view.itemViews].map(([id, v]) => ({ id, visible: v.visible })),
        occluded: game.view.baseViews.map(b => b.occluded),
      }),
      world: () => game.world,
      view: () => game.view,
      step: (n, stepInput = {}) => {
        for (let i = 0; i < n; i++) step(game.world, 1 / 60, stepInput);
        events(game.world.events);
        game.world.events.length = 0;
        ui.update();
      },
      interact: id => interact(game.world, id),
      throwClub: (id, a) => throwClub(game.world, id, a),
      melee: (id, a) => melee(game.world, id, a),
      buy: id => buy(game.world, id),
      net: () => net,
    };
}
