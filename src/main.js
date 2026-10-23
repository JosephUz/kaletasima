import { DILLER, t } from './dil.js';
import { gorunurAlanaKilitle } from './gorunur-alan.js';
import { $ } from './html.js';
import { createInput } from './input.js';
import { buy, interact } from './items.js';
import { melee, throwClub } from './combat.js';
import { Network } from './net/client.js';
import { createMuzik } from './muzik.js';
import { macBasladi, macBitti, macKontrol } from './olcum.js';
import { isApp, onlineEnabled } from './platform.js';
import { KURAL, targetScore } from './rules.js';
import { createScreens, normalizeCode } from './screens.js';
import { enterFullscreen, touchDevice } from './touch.js';
import { createUI } from './ui.js';
import { GameView } from './view/gameview.js';
import { createWorld, step } from './world.js';

/** `data-kural` işaretli öğeler: dilUygula yer tutucuları boş bıraktı; sayılar config'ten (KURAL) doldurulur. */
function kuralMetinleri() {
  for (const el of document.querySelectorAll('[data-kural]')) {
    if (el.dataset.i18n) el.textContent = t(el.dataset.i18n, KURAL);
    if (el.dataset.i18nHtml) el.innerHTML = t(el.dataset.i18nHtml, KURAL);
    if (el.dataset.i18nTitle) el.title = t(el.dataset.i18nTitle, KURAL);
  }
}

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
  kuralMetinleri();
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
    $('#pause').textContent = t('oyun.menuDokunmatik');
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
    // Müzik ayarı (standart çubuktaki ve Esc menüsündeki "Müzik" düğmesi). Parçalar henüz bestelenmedi:
    // bugün yalnız ayar tutulur, çalan bir şey yok (bkz. src/muzik.js).
    muzik: createMuzik(),
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

  // Tam ekrana girip çıkınca (maç başı `enterFullscreen`, Esc) görünür alan değişir; tarayıcı değişimi geç bildirir.
  document.addEventListener('fullscreenchange', () => gorunurAlan.guncelle());
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
    if (yeniMac) macBasladi(); // ölçüm: çevrimdışı her başlatma, çevrimiçi ilk 'start' (lobiye dönüp yeniden başlatılan maç da sayılır)
    screens.show(null);
    input.clear();
    ui.update();
    input.lock();
    if (touch) enterFullscreen();
  }
  function startSolo() {
    net.leave();
    roomUrl(null);
    launch(createWorld(71, { names: [screens.nick()], difficulty: screens.difficulty() }));
  }
  function goHome() {
    net.leave();
    roomUrl(null);
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
          t('bildirim.hedef', {
            kim: w.mode === 'solo' ? w.players[e.player].name : ui.teamName(w.players[e.player].team),
            n: targetScore(w),
            sure: KURAL.sure,
          }),
        );
      if (e.player === hero().id || e.victim === hero().id || e.type === 'treehit') {
        game.view.event(e);
        if (['pickup', 'deposit', 'coin', 'hit', 'treehit'].includes(e.type)) ui.tone(e.type === 'coin' ? 750 : 350);
        if (e.type === 'rearm') ui.toast(t('bildirim.sopa'));
        if (e.type === 'stairs' && e.player === hero().id)
          ui.toast(t(e.to > e.from ? 'bildirim.yukari' : 'bildirim.asagi', { n: e.to + 1 }));
        if (e.type === 'knockout' && e.victim === hero().id)
          ui.toast(t('bildirim.bayildin'));
        if (e.type === 'knockout' && e.player === hero().id)
          ui.toast(t('bildirim.bayildi', { ad: w.players[e.victim].name }));
        if (e.type === 'deposit') ui.toast(t('bildirim.saklandi'));
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

  /**
   * Oda standardı §5: odadayken adres çubuğu `?oda=KOD` gösterir, çıkınca silinir. Kod sekmede de saklanır
   * (`kale.oda`): sayfa yenilenince jetonla aynı koltuğa dönülür; sunucu odayı unuttuysa kodla yeniden katılınır.
   */
  function roomUrl(code) {
    try {
      if (code) sessionStorage.setItem('kale.oda', code);
      else sessionStorage.removeItem('kale.oda');
    } catch {}
    const u = new URL(location.href);
    if ((u.searchParams.get('oda') || null) === code) return;
    if (code) u.searchParams.set('oda', code);
    else u.searchParams.delete('oda');
    history.replaceState(history.state, '', u.pathname + u.search + u.hash);
  }
  // Davet linki (?oda=KOD) ya da yenilenen sayfanın odası: bağlanır bağlanmaz kendiliğinden girilir.
  let savedRoom = null;
  try {
    savedRoom = sessionStorage.getItem('kale.oda');
  } catch {}
  let pendingJoin = networked ? normalizeCode(new URLSearchParams(location.search).get('oda')) || savedRoom : null;
  const homeStatus = text => ($('#home-status-message').textContent = text);
  if (pendingJoin) homeStatus(t(pendingJoin === savedRoom ? 'durum.geriBaglaniyor' : 'durum.baglaniyor'));

  const net = new Network({
    welcome: room => {
      if (!room && net.room) {
        // Sunucu odayı unuttu (yeniden başlatıldı): giriş ekranına dön, kodla yeniden katılmayı dene.
        pendingJoin = pendingJoin || net.room.code;
        net.room = null;
        game.online = false;
        game.started = false;
        latest = null;
        screens.show('home');
      }
      if (pendingJoin && pendingJoin !== room) net.send('join', { code: pendingJoin, name: screens.nick() });
      else if (!pendingJoin && !room) homeStatus('');
      pendingJoin = null;
    },
    lobby: m => {
      roomUrl(m.code);
      homeStatus('');
      screens.renderLobby(m);
    },
    rooms: screens.renderRooms,
    start: w => launch(w, true),
    snapshot: receive,
    // Sunucu hatası: kodu sözlükte varsa etkin dilde (sunucu.<kod>), yoksa sunucunun Türkçe mesajı.
    error: (mesaj, kod) => {
      const anahtar = 'sunucu.' + kod,
        message = kod && anahtar in DILLER.tr ? t(anahtar) : mesaj;
      ui.toast(message);
      homeStatus(message);
      $('#lobby-status').textContent = message;
      // Linkle / yenilemeyle girilemeyen oda adres çubuğunda kalmasın.
      if (!net.room) roomUrl(null);
    },
    status: message => {
      $('#net-status').textContent = message;
      $('#net-status').hidden = !message || !(game.online || net.room);
    },
    online: n => {
      const el = $('#home-online');
      el.textContent = n > 0 ? t('ana.cevrimiciSayi', { n }) : '';
      el.title = t('ana.cevrimiciBaslik');
    },
    ready: up => {
      screens.setServer(up);
      if (!up) $('#home-online').textContent = '';
    },
  });
  game.net = net;
  /** Çevrim içi düğmeler: durum satırı (`Oda aranıyor…` / `Oda kuruluyor…` / `Odaya bağlanıyor…`) lobi gelince ya da hata olunca değişir. */
  async function connectAction(type, body, statusText = t('durum.baglaniyor')) {
    if (!networked) return;
    homeStatus(statusText);
    try {
      await net.connect(screens.nick());
      net.send(type, { ...body, name: screens.nick() });
    } catch (e) {
      homeStatus(e.message);
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
        ui.toast(t('bildirim.grafik'));
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
