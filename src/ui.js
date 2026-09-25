import { allied, nearStairs, roomAt, visibleTo } from './castle.js';
import { DIFFICULTY_LABEL, RULES } from './config.js';
import { $, escapeHtml } from './html.js';
import { nearClubCrate } from './items.js';
import { castleInvaded, countItems, dist, inside, targetScore } from './rules.js';

/**
 * Oyun içi arayüz: altın, can, kale paneli, skor tablosu, konum, bağlama göre ipucu, bayılma bandı, kazanma geri sayımı,
 * kale alarmı; kısa bildirimler (toast) ve basit sesler. Durumu yalnız okur.
 */
export function createUI(game) {
  let toastLeft = 0,
    audioCtx;
  const hero = () => game.world.players[game.world.me || 0];
  const teamName = team => (team === 0 ? 'Mavi takım' : 'Kırmızı takım');

  function toast(text) {
    $('#toast').textContent = text;
    $('#toast').classList.add('show');
    toastLeft = 3;
  }
  function tickToast(dt) {
    if (toastLeft > 0) {
      toastLeft -= dt;
      if (toastLeft <= 0) $('#toast').classList.remove('show');
    }
  }
  function tone(freq = 380) {
    if (!game.sound) return;
    try {
      audioCtx ??= new AudioContext();
      audioCtx.resume();
      const o = audioCtx.createOscillator(),
        g = audioCtx.createGain();
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.025, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start();
      o.stop(audioCtx.currentTime + 0.13);
    } catch {}
  }
  /** E ile alınabilecek en yakın eşya (dost kalenin eşyası hariç). */
  function nearest() {
    const w = game.world,
      p = hero();
    return (
      w.items
        .filter(
          i =>
            i.holder === null &&
            visibleTo(w, p, i) &&
            dist(i, p) < 1.8 &&
            (i.base === null || i.base === p.id || !allied(w, p.id, i.base)),
        )
        .sort((a, b) => dist(a, p) - dist(b, p))[0] || null
    );
  }
  const teamScore = team =>
    game.world.players.filter(p => p.team === team).reduce((n, p) => n + countItems(game.world, p.id), 0);

  function contextHint(p, own) {
    if (game.screen) return '';
    if (p.stun > 0) return 'Kalende ayılmana ' + p.stun.toFixed(1) + ' sn · Sol tıkla karşılık ver';
    if (!p.hasClub && nearClubCrate(game.world, p)) return 'E · Kasadan sopa al';
    if (p.held !== null) return inside(p, own) ? 'E · Buraya sakla' : 'E · Eşyayı bırak';
    if (nearest()) return 'E · Eşyayı al';
    if (!p.hasClub) return 'Sopan yok · En yakın kale kapısındaki kasaya git';
    if (Math.hypot(p.x, p.z) < 4) return 'Sol tık · Altın ağacına vur';
    return '';
  }

  function update() {
    const w = game.world,
      p = hero(),
      own = w.bases[p.id],
      n = countItems(w, p.id),
      total = w.mode === 'solo' ? n : teamScore(p.team);
    $('#gold').textContent = p.gold || 0;
    const hp = Math.max(0, Math.min(RULES.hp, p.hp ?? RULES.hp));
    $('#hearts').innerHTML = '♥'.repeat(hp) + '<i>' + '♥'.repeat(RULES.hp - hp) + '</i>';
    $('#home-count').innerHTML = n + ' <small>eşya</small>';
    $('#home-bar').style.width = Math.min(100, (total / targetScore(w)) * 100) + '%';
    $('#team-count').textContent =
      w.mode === 'solo' ? 'Hedef: ' + n + ' / ' + targetScore(w) : 'Takım toplamı: ' + total + ' / ' + targetScore(w);
    $('#home-status').textContent = castleInvaded(w, p.id) ? 'RAKİP İÇERİDE' : p.stun > 0 ? 'KORUMASIZ' : '';
    $('#home-status').style.color = '#ffb08a';
    $('#buy').disabled = !game.started || !!game.screen || p.stun > 0 || !inside(p, own) || p.gold < RULES.price;
    $('#buy-hint').textContent = inside(p, own) ? 'B · 15 altına bir eşya' : 'Satın almak için kalene dön.';
    $('#mode-label').textContent =
      (w.mode === 'solo' ? 'Tek başına · 5 oyuncu' : (w.mode === 'coop' ? 'Co-op' : 'PvP') + ' · 5v5') +
      ' · ' +
      (DIFFICULTY_LABEL[w.difficulty] || 'Normal');
    $('#match-clock').textContent =
      String(Math.floor(w.time / 60)).padStart(2, '0') + ':' + String(Math.floor(w.time % 60)).padStart(2, '0');
    if (!$('#score-panel').hidden)
      $('#players').innerHTML = [...w.players]
        .sort((a, b) => countItems(w, b.id) - countItems(w, a.id) || (b.gold || 0) - (a.gold || 0))
        .map(
          v =>
            '<div class="player-row"><i class="player-dot" style="background:' +
            v.color +
            '"></i><div class="player-info">' +
            escapeHtml(v.name) +
            '</div><strong class="score-values">' +
            countItems(w, v.id) +
            ' <small>eşya</small><span>' +
            (v.gold || 0) +
            ' altın</span></strong></div>',
        )
        .join('');
    const invaded = game.started && !game.screen && w.winner === null && castleInvaded(w, p.id);
    $('#castle-alert').hidden = !invaded;
    $('#castle-alert-text').hidden = !invaded;
    const loc = roomAt(w, p);
    $('#location').textContent = loc
      ? loc.floor +
        1 +
        '. KAT · ' +
        (loc.base === p.id ? 'SENİN KALEN' : w.players[loc.base].name.toLocaleUpperCase('tr-TR') + ' KALESİ')
      : 'DIŞ ALAN';
    $('#stairs').hidden = !(game.started && !game.screen && nearStairs(w, p));
    for (const b of document.querySelectorAll('[data-floor]')) {
      b.disabled = Number(b.dataset.floor) === (p.floor || 0);
      b.classList.toggle('current', b.disabled);
    }
    $('#context').textContent = contextHint(p, own);
    const banner = $('#state-banner');
    banner.hidden = !game.started || !!game.screen || !(p.stun > 0);
    if (p.stun > 0) {
      banner.querySelector('b').textContent = 'BAYGINSIN · ' + Math.ceil(p.stun) + ' sn';
      banner.querySelector('span').textContent = 'Kalen korumasız · Süre bitince kalende sopayla doğacaksın';
      banner.querySelector('i').style.width =
        Math.min(100, (p.stun / Math.max(p.stunTotal || RULES.stun, 1)) * 100) + '%';
    }
    $('#claim').hidden = w.claimant === null || !game.started || game.screen === 'results';
    if (w.claimant !== null) {
      const winner = w.players[w.claimant];
      $('#claim').textContent =
        (w.mode === 'solo' ? winner.name : teamName(winner.team)) +
        ' kazanıyor · ' +
        Math.max(0, Math.ceil(RULES.winHold - w.claimTime)) +
        ' sn · Hazinesini çal!';
    }
    $('#quality').textContent = 'Grafik: ' + ['Düşük', 'Orta', 'Yüksek'][game.quality];
    $('#perf').textContent =
      Math.round(game.fps) +
      ' FPS · ' +
      game.view.renderer.info.render.calls +
      ' çizim' +
      (game.online ? ' · ' + game.net.rtt + ' ms' : '');
  }

  return { toast, tickToast, tone, nearest, update, teamName };
}
