import { DIFFICULTIES, DIFFICULTY_LABEL } from './config.js';
import { $, escapeHtml } from './html.js';
import { countItems } from './rules.js';

/**
 * Ekranlar: giriş (ad, bot zorluğu, modlar, odaya katıl), lobi (koltuklar), menü, kısayollar, maç karnesi. Düğmelerin
 * bağlantıları da buradadır; oyunu başlatan / bitiren işler main.js'ten actions ile gelir.
 *
 * actions: startSolo(), goHome(), connectAction(type, body)
 */
const OVERLAYS = ['home', 'lobby', 'menu', 'shortcuts', 'results'];

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
    $('#online-note').textContent = game.online ? 'Çevrim içi maç menü açıkken devam eder.' : '';
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

  function renderLobby(lobby) {
    const net = game.net;
    $('#lobby-code').textContent = lobby.code;
    $('#lobby-mode').textContent =
      (lobby.mode === 'coop'
        ? "Co-op · 5'e 5 · İnsanlar mavi takımda"
        : "PvP · 5'e 5 · Boş koltuğa tıklayıp takımını seç") +
      ' · Zorluk: ' +
      (DIFFICULTY_LABEL[lobby.difficulty] || 'Normal');
    for (const team of [0, 1]) {
      const root = $(team === 0 ? '#blue-seats' : '#red-seats');
      root.replaceChildren();
      for (const s of lobby.seats.filter(s => s.team === team)) {
        const b = document.createElement('button');
        b.className = 'seat' + (s.id === net.id ? ' me' : '');
        b.dataset.slot = s.slot;
        b.disabled = !!s.id || (lobby.mode === 'coop' && team === 1) || lobby.state !== 'lobby';
        b.textContent =
          (s.id === net.id ? '● ' : '') +
          s.name +
          (s.id && !s.online ? ' · bağlantı koptu' : !s.id ? ' · boş koltuk' : '');
        b.onclick = () => net.send('seat', { slot: s.slot });
        root.append(b);
      }
    }
    $('#lobby-start').hidden = lobby.host !== net.id;
    $('#lobby-status').textContent =
      lobby.host === net.id ? 'Boş koltukları botlar doldurur.' : 'Oda sahibinin başlatması bekleniyor.';
    if (lobby.state === 'lobby') {
      game.started = false;
      show('lobby');
    } else if (game.screen === 'results') $('#again').hidden = lobby.host !== net.id;
  }

  /** Maç karnesi: kazanan, süre ve oyuncu istatistikleri. */
  function result() {
    const w = game.world,
      me = w.players[w.me || 0];
    input.unlock();
    show('results');
    const won = w.mode === 'solo' ? w.winner === me.id : w.winnerTeam === me.team;
    $('#result-title').textContent = won ? 'Hazine sizin!' : 'Bir sonraki sefer…';
    $('#result-summary').textContent =
      (w.mode === 'solo' ? w.players[w.winner].name : ui.teamName(w.winnerTeam)) +
      ' kazandı · ' +
      Math.floor(w.time / 60) +
      ' dk ' +
      Math.floor(w.time % 60) +
      ' sn';
    const rows = [...w.players].sort((a, b) => countItems(w, b.id) - countItems(w, a.id));
    $('#result-table').innerHTML =
      '<table><thead><tr><th>Oyuncu</th><th>Eşya</th><th>Çalma</th><th>İsabet</th><th>Nakavt</th><th>Sersemletme</th><th>Altın</th><th>Ağaç</th><th>Kaçınma</th></tr></thead><tbody>' +
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
    $('#again').hidden = game.online && game.net.room?.host !== game.net.id;
  }

  // Giriş ekranı
  $('#solo').onclick = actions.startSolo;
  $('#coop').onclick = () => actions.connectAction('create', { mode: 'coop', difficulty });
  $('#pvp').onclick = () => actions.connectAction('create', { mode: 'pvp', difficulty });
  for (const b of document.querySelectorAll('[data-difficulty]')) b.onclick = () => setDifficulty(b.dataset.difficulty);
  setDifficulty(difficulty);
  $('#join-toggle').onclick = () => {
    $('#join-row').hidden = !$('#join-row').hidden;
    $('#room-code').focus();
  };
  $('#join').onclick = () => actions.connectAction('join', { code: $('#room-code').value.trim().toUpperCase() });
  $('#room-code').onkeydown = e => {
    if (e.key === 'Enter') $('#join').click();
  };
  const code = new URLSearchParams(location.search).get('oda');
  if (code) {
    $('#join-row').hidden = false;
    $('#room-code').value = code;
  }
  // Lobi
  $('#lobby-start').onclick = () => game.net.send('start');
  $('#lobby-leave').onclick = actions.goHome;
  $('#copy-room').onclick = async () => {
    const url = location.origin + '/?oda=' + game.net.room.code;
    try {
      await navigator.clipboard.writeText(url);
      $('#lobby-status').textContent = 'Katılma linki kopyalandı.';
    } catch {
      $('#lobby-status').textContent = url;
    }
  };
  // Oyun içi düğmeler, menü, kısayollar, karne
  for (const id of ['help', 'home-help', 'menu-help', 'help-bottom']) $('#' + id).onclick = help;
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
  $('#sound').onclick = () => {
    game.sound = !game.sound;
    $('#sound').textContent = 'Ses: ' + (game.sound ? 'Açık' : 'Kapalı');
  };
  $('#score-toggle').onclick = () => ($('#score-panel').hidden = !$('#score-panel').hidden);
  $('#buy').onclick = () => {
    if (game.started && !game.screen) input.edges.buy = true;
  };
  for (const b of document.querySelectorAll('[data-floor]'))
    b.onclick = () => {
      input.edges.floor = Number(b.dataset.floor);
    };
  $('#again').onclick = () => {
    if (game.online) game.net.send('rematch');
    else actions.startSolo();
  };

  return { show, help, closeHelp, pause, result, renderLobby, nick, difficulty: () => difficulty };
}
