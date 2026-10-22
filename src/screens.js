import { DIFFICULTIES } from './config.js';
import { t } from './dil.js';
import { $, escapeHtml } from './html.js';
import { paylasti } from './olcum.js';
import { isApp, onlineEnabled } from './platform.js';
import { countItems } from './rules.js';

/**
 * Ekranlar: giriş (ad, bot zorluğu, tek başına, hızlı katıl / oda kur / odaya katıl, açık odalar), lobi (koltuklar, kuranın ayarları), menü, kısayollar, maç karnesi. Düğmelerin
 * bağlantıları da buradadır; oyunu başlatan / bitiren işler main.js'ten actions ile gelir.
 *
 * actions: startSolo(), goHome(), connectAction(type, body, statusText)
 */
const OVERLAYS = ['home', 'lobby', 'menu', 'shortcuts', 'results'];

/** Oda ayar özeti (liste satırı ve lobi gözü): `5v5 · Normal`. */
export const roomSummary = difficulty =>
  '5v5 · ' + t(DIFFICULTIES.includes(difficulty) ? 'zorluk.' + difficulty : 'zorluk.normal');
/** Oda kodu girişi: büyük harf, boşluk / tire atılır, 4 harf + 1 rakamsa tire eklenir (`KPRT4` → `KPRT-4`). */
export function normalizeCode(text) {
  const k = String(text || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return /^[A-Z]{4}[0-9]$/.test(k) ? k.slice(0, 4) + '-' + k.slice(4) : k;
}
/** Davet linki: statik sitede bulunulan adres (uygulamada site adresi), `?oda=KOD`. */
export const inviteUrl = code => (isApp() ? 'https://kaletasima.josephuz.com' : location.origin) + '/?oda=' + code;

export function createScreens(game, ui, input, actions) {
  let helpReturn = 'home',
    difficulty = 'normal';

  function show(name) {
    game.screen = name;
    for (const id of OVERLAYS) $('#' + id).hidden = id !== name;
    document.body.classList.toggle('playing', game.started);
    if (name) {
      input.clear();
      input.unlock();
    }
    $('#crosshair').hidden = !!name || !game.started;
  }
  function help() {
    if (game.screen === 'shortcuts') {
      show(helpReturn);
      return;
    }
    helpReturn = game.screen;
    show('shortcuts');
  }
  const closeHelp = () => show(helpReturn);
  function pause() {
    if (!game.started) return;
    show(game.screen === 'menu' ? null : 'menu');
    syncMenu();
    $('#online-note').textContent = game.online ? t('menu.cevrimiciNot') : '';
  }

  // Ad: tarayıcı hatırlar ("Gezgin" eski varsayılandı, yok sayılır).
  try {
    $('#nickname').value =
      ((localStorage.getItem('kale.nick') || '') === 'Gezgin' ? '' : localStorage.getItem('kale.nick')) ||
      'Kale Taşımacılık';
  } catch {}
  function nick() {
    const name = $('#nickname').value.trim().slice(0, 16) || 'Kale Taşımacılık';
    try {
      localStorage.setItem('kale.nick', name);
    } catch {}
    return name;
  }

  // Bot zorluğu: tek başına oyunda doğrudan, çevrim içi odada oda kuranın seçimi geçerli.
  try {
    const d = localStorage.getItem('kale.difficulty');
    if (DIFFICULTIES.includes(d)) difficulty = d;
  } catch {}
  function setDifficulty(d) {
    difficulty = d;
    for (const b of document.querySelectorAll('[data-difficulty]'))
      b.classList.toggle('active', b.dataset.difficulty === d);
    try {
      localStorage.setItem('kale.difficulty', d);
    } catch {}
  }

  /**
   * Bekleme odası (oda standardı §6): göz `ODA · <özet>`, kod, Linki kopyala, görünürlük; iki takım sütunu; kuranın
   * ayarları (Zorluk + ODA: Herkese açık / Özel, ötekilerde kapalı); `N insan · M bot`; MAÇI BAŞLAT ↗ / Odadan çık.
   * Boş koltuğa tıklayan oraya geçer. Kuran bir oyuncuyu sürükleyip bırakır ya da oyuncuya sonra koltuğa tıklar
   * (dolu koltukta yer değiştirirler).
   */
  let moving = null;
  function renderLobby(lobby) {
    const net = game.net,
      isHost = lobby.host === net.id;
    // Maç bitince oda sunucuda lobiye döner; karnedeki oyuncu "LOBİYE DÖN"e basınca geçer (bkz. #again).
    if (lobby.state === 'lobby' && game.screen === 'results') return;
    if (!isHost || lobby.state !== 'lobby') moving = null;
    if (moving !== null && !lobby.seats[moving]?.id) moving = null;
    $('#lobby-eyebrow').textContent = t('lobi.goz', { ozet: roomSummary(lobby.difficulty) });
    $('#lobby-code').textContent = lobby.code;
    $('#lobby-visibility').textContent = t(lobby.private ? 'lobi.ozelOda' : 'lobi.acikOda');
    const people = lobby.seats.filter(s => s.id).length;
    $('#lobby-mode').textContent =
      t('lobi.kisiler', { insan: people, bot: lobby.seats.length - people }) +
      ' · ' +
      t(lobby.mode === 'pvp' ? 'lobi.pvp' : 'lobi.coop');
    for (const team of [0, 1]) {
      const root = $(team === 0 ? '#blue-seats' : '#red-seats');
      root.replaceChildren();
      for (const s of lobby.seats.filter(s => s.team === team)) {
        const b = document.createElement('button'),
          me = s.id === net.id;
        b.className = 'seat' + (me ? ' me' : '') + (s.id ? '' : ' empty') + (moving === s.slot ? ' moving' : '');
        b.dataset.slot = s.slot;
        b.disabled = lobby.state !== 'lobby' || (!!s.id && !isHost);
        const name = document.createElement('span');
        name.className = 'seat-name';
        name.textContent = s.id ? s.name : t('lobi.bosKoltuk');
        b.append(name);
        const tags = [];
        if (s.id && s.id === lobby.host) tags.push(t('lobi.kuran'));
        if (me) tags.push(t('lobi.sen'));
        if (s.id && !s.online) tags.push(t('lobi.koptu'));
        for (const etiket of tags) {
          const tag = document.createElement('small');
          tag.className = 'seat-tag';
          tag.textContent = etiket;
          b.append(tag);
        }
        if (!s.id) b.insertAdjacentHTML('beforeend', '<em class="seat-sit">' + t('lobi.otur') + '</em>');
        b.onclick = () => seatClick(s);
        if (isHost && s.id && lobby.state === 'lobby') {
          b.draggable = true;
          b.ondragstart = e => {
            e.dataTransfer.setData('text/plain', String(s.slot));
            e.dataTransfer.effectAllowed = 'move';
          };
        }
        if (isHost && lobby.state === 'lobby') {
          b.ondragover = e => {
            e.preventDefault();
            b.classList.add('drop');
          };
          b.ondragleave = () => b.classList.remove('drop');
          b.ondrop = e => {
            e.preventDefault();
            b.classList.remove('drop');
            const from = Number(e.dataTransfer.getData('text/plain'));
            if (Number.isInteger(from) && from !== s.slot) net.send('move', { from, to: s.slot });
          };
        }
        root.append(b);
      }
    }
    for (const b of document.querySelectorAll('[data-lobby-difficulty]')) {
      b.classList.toggle('active', b.dataset.lobbyDifficulty === lobby.difficulty);
      b.disabled = !isHost;
    }
    for (const b of document.querySelectorAll('[data-lobby-private]')) {
      b.classList.toggle('active', (b.dataset.lobbyPrivate === '1') === !!lobby.private);
      b.disabled = !isHost;
    }
    $('#lobby-start').disabled = !isHost;
    $('#lobby-start').textContent = t(isHost ? 'lobi.baslat' : 'lobi.bekleniyor');
    $('#lobby-status').textContent = moving !== null ? t('lobi.tasi') : '';
    if (lobby.state === 'lobby') {
      game.started = false;
      show('lobby');
    }
  }
  function seatClick(s) {
    const net = game.net,
      lobby = net.room;
    if (!lobby || lobby.state !== 'lobby') return;
    const isHost = lobby.host === net.id;
    if (isHost && moving !== null) {
      const from = moving;
      moving = null;
      if (from !== s.slot) net.send('move', { from, to: s.slot });
      else renderLobby(lobby);
      return;
    }
    if (!s.id) net.send('seat', { slot: s.slot });
    else if (isHost) {
      moving = s.slot;
      renderLobby(lobby);
    }
  }

  /** Maç karnesi: kazanan, süre ve oyuncu istatistikleri. */
  function result() {
    const w = game.world,
      me = w.players[w.me || 0];
    input.unlock();
    show('results');
    const won = w.mode === 'solo' ? w.winner === me.id : w.winnerTeam === me.team;
    $('#result-title').textContent = t(won ? 'karne.kazandik' : 'karne.kaybettik');
    $('#result-summary').textContent = t('karne.ozet', {
      kim: w.mode === 'solo' ? w.players[w.winner].name : ui.teamName(w.winnerTeam),
      dk: Math.floor(w.time / 60),
      sn: Math.floor(w.time % 60),
    });
    const rows = [...w.players].sort((a, b) => countItems(w, b.id) - countItems(w, a.id));
    $('#result-table').innerHTML =
      '<table><thead><tr>' +
      ['oyuncu', 'esya', 'calma', 'isabet', 'nakavt', 'sersem', 'altin', 'agac', 'kacinma']
        .map(k => '<th>' + t(`karne.${k}`) + '</th>')
        .join('') +
      '</tr></thead><tbody>' +
      rows
        .map(
          p =>
            '<tr><td style="color:' +
            p.color +
            '">' +
            escapeHtml(p.name) +
            '</td><td>' +
            countItems(w, p.id) +
            '</td>' +
            ['steals', 'hits', 'knockouts', 'stuns', 'goldCollected', 'treeHits', 'dodges']
              .map(k => '<td>' + (p.stats[k] || 0) + '</td>')
              .join('') +
            '</tr>',
        )
        .join('') +
      '</tbody></table>';
    // Çevrim içi: herkes LOBİYE DÖN (oda sunucuda lobiye döndü, kuran yeniden başlatır); tek başına: Yeni maç.
    $('#again').hidden = false;
    $('#again').textContent = t(game.online ? 'karne.lobi' : 'karne.yeni');
    $('#result-home').textContent = t(game.online ? 'lobi.cik' : 'menu.anaMenu');
  }

  // Giriş ekranı (oda standardı §1): ADIN · tek başına seçimleri + TEK BAŞINA ↗ · ÇEVRİM İÇİ (HIZLI KATIL → / ODA KUR /
  // ODAYA KATIL + kod satırı, durum) · AÇIK ODALAR. Oda kur hemen kurar (herkese açık, seçili zorlukla); özel/açık ve
  // zorluk lobide kuranın ayarıdır.
  $('#solo').onclick = actions.startSolo;
  $('#create').onclick = () => actions.connectAction('create', { difficulty }, t('durum.kuruluyor'));
  // Açık odalar: sunucu giriş ekranındakilere listeyi kendiliğinden gönderir (bkz. server/rooms.mjs). Satıra basan
  // kodsuz katılır; hızlı katıl en uygun odaya oturtur, yoksa seçili zorlukla herkese açık oda kurar.
  $('#quick').onclick = () => actions.connectAction('quick', { difficulty }, t('durum.araniyor'));
  function renderRooms(list) {
    const root = $('#room-list');
    root.replaceChildren();
    $('#room-count').textContent = String(list.length);
    if (!list.length) {
      root.innerHTML = '<div class="rooms-empty">' + t('ana.odaYok') + '</div>';
      return;
    }
    for (const r of list) {
      const b = document.createElement('button'),
        playing = r.state === 'playing',
        full = r.players >= r.seats;
      b.className = 'room-row';
      b.dataset.code = r.code;
      b.disabled = full;
      b.innerHTML =
        '<span><b></b><small>' +
        escapeHtml(roomSummary(r.difficulty)) +
        ' · ' +
        escapeHtml(t('oda.oyuncu', { n: r.players, s: r.seats })) +
        '</small></span><i class="room-state' +
        (playing ? ' playing' : '') +
        '">' +
        t(playing ? 'oda.macta' : 'oda.lobide') +
        '</i><em>' +
        t(full ? 'oda.dolu' : 'oda.katil') +
        '</em>';
      b.querySelector('b').textContent = r.host || t('oda.kuranYok');
      b.title = t(playing ? 'oda.mactaIpucu' : 'oda.lobiIpucu');
      b.onclick = () => actions.connectAction('join', { code: r.code }, t('durum.baglaniyor'));
      root.append(b);
    }
  }
  renderRooms([]);
  for (const b of document.querySelectorAll('[data-difficulty]')) b.onclick = () => setDifficulty(b.dataset.difficulty);
  setDifficulty(difficulty);
  $('#join-toggle').onclick = () => {
    $('#join-row').hidden = !$('#join-row').hidden;
    $('#room-code').focus();
  };
  $('#join').onclick = () => {
    const code = normalizeCode($('#room-code').value);
    $('#room-code').value = code;
    if (code.replace(/[^A-Z]/g, '').length < 4) {
      $('#home-status-message').textContent = t('ana.kodYaz');
      return;
    }
    actions.connectAction('join', { code }, t('durum.baglaniyor'));
  };
  $('#room-code').oninput = e => {
    const el = e.target,
      up = el.value.toUpperCase();
    if (up !== el.value) el.value = up;
  };
  $('#room-code').onkeydown = e => {
    if (e.key === 'Enter') $('#join').click();
  };
  // Sunucuya bağlanılamadıkça (kapalı ya da config.js → ONLINE ile kapatılmış, ör. Android uygulaması) üç çevrim içi
  // düğme kapalıdır ve "YAKINDA" yazar, açık oda listesi gizlenir; sunucu kabul edince (main.js → net ready) açılır.
  function setServer(up) {
    for (const id of ['quick', 'create', 'join-toggle', 'join']) {
      const b = $('#' + id);
      b.disabled = !up;
      b.classList.toggle('soon', !up);
      b.title = up ? '' : t('ana.yakindaBaslik');
      if (id !== 'join') {
        const tag = b.querySelector('.soon-tag');
        if (!up && !tag) b.insertAdjacentHTML('beforeend', '<em class="soon-tag">' + t('ana.yakinda') + '</em>');
        else if (up) tag?.remove();
      }
    }
    $('#rooms').hidden = !up;
    if (!up) $('#join-row').hidden = true;
  }
  setServer(false);
  // Davet linkiyle açılınca kod kutuya da yazılır (giriş main.js'te sunucuya bağlanır bağlanmaz kendiliğinden olur).
  const code = onlineEnabled() && normalizeCode(new URLSearchParams(location.search).get('oda'));
  if (code) $('#room-code').value = code;
  // Lobi: kuranın ayarları, başlat, çık, link.
  for (const b of document.querySelectorAll('[data-lobby-difficulty]'))
    b.onclick = () => game.net.send('settings', { difficulty: b.dataset.lobbyDifficulty });
  for (const b of document.querySelectorAll('[data-lobby-private]'))
    b.onclick = () => game.net.send('settings', { private: b.dataset.lobbyPrivate === '1' });
  $('#lobby-start').onclick = () => game.net.send('start');
  $('#lobby-leave').onclick = actions.goHome;
  $('#copy-room').onclick = async () => {
    const url = inviteUrl(game.net.room.code),
      b = $('#copy-room');
    paylasti(); // ölçüm: lobi linki paylaşıldı
    try {
      await navigator.clipboard.writeText(url);
      b.textContent = t('lobi.linkKopyalandi');
      setTimeout(() => (b.textContent = t('lobi.linkKopyala')), 2000);
    } catch {
      $('#lobby-status').textContent = url;
    }
  };
  // Oyun içi düğmeler, menü, kısayollar, karne
  for (const id of ['help', 'home-help', 'menu-help']) $('#' + id).onclick = help;
  $('#help-close').onclick = closeHelp;
  $('#pause').onclick = pause;
  $('#resume').onclick = () => {
    show(null);
    game.last = performance.now();
    input.lock();
  };
  $('#leave').onclick = $('#result-home').onclick = actions.goHome;
  $('#quality').onclick = () => {
    game.quality = (game.quality + 1) % 3;
    game.view.setQuality(game.quality);
    ui.update();
  };
  /**
   * STANDART üst araç çubuğu ve Esc menüsü: Ses ve Müzik düğmeleri iki yerdedir (giriş ekranının sağ üst çubuğu
   * ve duraklatma menüsü). Tek bir yazıcı ikisini birden tazeler, böylece hangisinden değiştirilirse
   * değiştirilsin ikisi aynı durumu gösterir. Yazılar birebir standarttaki gibi: "Ses: açık" / "Müzik: kapalı"
   * (sözlükte ses.acik / ses.kapali / muzik.acik / muzik.kapali).
   */
  const SES_DUGMELERI = ['#home-sound', '#sound'],
    MUZIK_DUGMELERI = ['#home-muzik', '#muzik'];
  function syncMenu() {
    for (const sec of SES_DUGMELERI) $(sec).textContent = t(game.sound ? 'ses.acik' : 'ses.kapali');
    for (const sec of MUZIK_DUGMELERI) $(sec).textContent = t(game.muzik.acik ? 'muzik.acik' : 'muzik.kapali');
    const yuzde = Math.round(game.muzik.ses * 100);
    $('#muzik-ses').value = String(yuzde);
    $('#muzik-yuzde').textContent = t('menu.yuzde', { n: yuzde });
    // Çevrim içi maçta menüden çıkmak odadan da çıkmaktır; yazı bunu söylesin.
    $('#leave').textContent = t(game.online ? 'lobi.cik' : 'menu.anaMenu');
  }
  function setSound(on) {
    game.sound = on;
    try {
      localStorage.setItem('kale.sound', on ? 'on' : 'off');
    } catch {}
    syncMenu();
  }
  function setMuzik(on) {
    game.muzik.degistir(on);
    syncMenu();
  }
  for (const sec of SES_DUGMELERI) $(sec).onclick = () => setSound(!game.sound);
  for (const sec of MUZIK_DUGMELERI) $(sec).onclick = () => setMuzik(!game.muzik.acik);
  // Müzik ses düzeyi sürgüsü Müzik düğmesinin altındadır; parça gelince sesi doğrudan buradan alacak.
  $('#muzik-ses').oninput = e => {
    game.muzik.setSes(Number(e.target.value) / 100);
    syncMenu();
  };
  syncMenu();
  $('#score-toggle').onclick = () => ($('#score-panel').hidden = !$('#score-panel').hidden);
  $('#buy').onclick = () => {
    if (game.started && !game.screen) input.edges.buy = true;
  };
  for (const b of document.querySelectorAll('[data-floor]'))
    b.onclick = () => {
      input.edges.floor = Number(b.dataset.floor);
    };
  $('#again').onclick = () => {
    if (game.online && game.net.room) {
      game.started = false;
      game.online = false;
      show(null);
      renderLobby({ ...game.net.room, state: 'lobby' });
    } else if (game.online) actions.goHome();
    else actions.startSolo();
  };

  return { show, help, closeHelp, pause, result, renderLobby, renderRooms, nick, setServer, difficulty: () => difficulty };
}
