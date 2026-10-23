import { allied, nearStairs, roomAt, visibleTo } from './castle.js';
import { DIFFICULTIES, RULES, TEAM_COLORS } from './config.js';
import { DIL, t } from './dil.js';
import { $, escapeHtml } from './html.js';
import { nearClubCrate } from './items.js';
import { KURAL, castleInvaded, countItems, dist, inside, targetScore } from './rules.js';

/**
 * Oyun içi arayüz: altın, can, kale paneli, skor tablosu, konum, bağlama göre ipucu, bayılma bandı, kazanma geri sayımı,
 * kale alarmı; kısa bildirimler (toast) ve basit sesler. Durumu yalnız okur.
 */
export function createUI(game) {
  let toastLeft = 0,
    audioCtx;
  const hero = () => game.world.players[game.world.me || 0];
  const teamName = team => t(team === 0 ? 'lobi.mavi' : 'lobi.kirmizi');

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
    if (p.stun > 0) return t('ipucu.baygin', { sn: p.stun.toFixed(1) });
    if (!p.hasClub && nearClubCrate(game.world, p)) return t('ipucu.sopaAl');
    if (p.held !== null) return t(inside(p, own) ? 'ipucu.sakla' : 'ipucu.birak');
    if (nearest()) return t('ipucu.al');
    if (!p.hasClub) return t('ipucu.sopaYok');
    if (Math.hypot(p.x, p.z) < 4) return t('ipucu.agac');
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
    $('#home-count').innerHTML = n + ' <small>' + t('oyun.esyaKucuk') + '</small>';
    $('#home-bar').style.width = Math.min(100, (total / targetScore(w)) * 100) + '%';
    $('#team-count').textContent =
      w.mode === 'solo'
        ? t('oyun.hedef', { n, h: targetScore(w) })
        : t('oyun.takimToplam', { n: total, h: targetScore(w) });
    $('#home-status').textContent = castleInvaded(w, p.id) ? t('oyun.rakipIceride') : p.stun > 0 ? t('oyun.korumasiz') : '';
    $('#home-status').style.color = '#ffb08a';
    $('#buy').disabled = !game.started || !!game.screen || p.stun > 0 || !inside(p, own) || p.gold < RULES.price;
    $('#buy-hint').textContent = t(inside(p, own) ? 'oyun.satinAl' : 'oyun.kaleneDon', KURAL);
    $('#mode-label').textContent =
      (w.mode === 'solo' ? t('oyun.modTek') : (w.mode === 'coop' ? 'Co-op' : 'PvP') + ' · 5v5') +
      ' · ' +
      t(DIFFICULTIES.includes(w.difficulty) ? 'zorluk.' + w.difficulty : 'zorluk.normal');
    $('#match-clock').textContent =
      String(Math.floor(w.time / 60)).padStart(2, '0') + ':' + String(Math.floor(w.time % 60)).padStart(2, '0');
    $('#team-card').hidden = w.mode === 'solo';
    if (!$('#score-panel').hidden && w.mode !== 'solo') {
      $('#team-target').textContent = t('oyun.hedefUst', { n: targetScore(w) });
      $('#teams').innerHTML = [0, 1]
        .map(takim => {
          const score = teamScore(takim);
          return (
            '<div class="team-total"><div><b style="color:' +
            TEAM_COLORS[takim] +
            '">' +
            teamName(takim) +
            (takim === p.team ? '<span>' + t('lobi.sen') + '</span>' : '') +
            '</b><strong>' +
            score +
            ' <small>/ ' +
            targetScore(w) +
            '</small></strong></div><div class="team-bar"><i style="width:' +
            Math.min(100, (score / targetScore(w)) * 100) +
            '%;background:' +
            TEAM_COLORS[takim] +
            '"></i></div></div>'
          );
        })
        .join('');
    }
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
            ' <small>' +
            t('oyun.esyaKucuk') +
            '</small><span>' +
            t('oyun.altinSay', { n: v.gold || 0 }) +
            '</span></strong></div>',
        )
        .join('');
    const invaded = game.started && !game.screen && w.winner === null && castleInvaded(w, p.id);
    $('#castle-alert').hidden = !invaded;
    $('#castle-alert-text').hidden = !invaded;
    const loc = roomAt(w, p);
    $('#location').textContent = loc
      ? t('oyun.kat', { n: loc.floor + 1 }) +
        ' · ' +
        (loc.base === p.id
          ? t('oyun.seninKalen')
          : t('oyun.kalesi', { ad: w.players[loc.base].name.toLocaleUpperCase(DIL === 'tr' ? 'tr-TR' : 'en-US') }))
      : t('oyun.disAlan');
    $('#stairs').hidden = !(game.started && !game.screen && nearStairs(w, p));
    for (const b of document.querySelectorAll('[data-floor]')) {
      b.disabled = Number(b.dataset.floor) === (p.floor || 0);
      b.classList.toggle('current', b.disabled);
    }
    $('#context').textContent = contextHint(p, own);
    const banner = $('#state-banner');
    banner.hidden = !game.started || !!game.screen || !(p.stun > 0);
    if (p.stun > 0) {
      banner.querySelector('b').textContent = t('oyun.bayginsin', { n: Math.ceil(p.stun) });
      banner.querySelector('span').textContent = t('oyun.korumasizMetin');
      banner.querySelector('i').style.width =
        Math.min(100, (p.stun / Math.max(p.stunTotal || RULES.stun, 1)) * 100) + '%';
    }
    $('#claim').hidden = w.claimant === null || !game.started || game.screen === 'results';
    if (w.claimant !== null) {
      const winner = w.players[w.claimant];
      $('#claim').textContent = t('oyun.kazaniyor', {
        kim: w.mode === 'solo' ? winner.name : teamName(winner.team),
        n: Math.max(0, Math.ceil(RULES.winHold - w.claimTime)),
      });
    }
    $('#quality').textContent = t('menu.grafik', { q: t(`grafik.${game.quality}`) });
    $('#perf').textContent =
      t('menu.perf', { fps: Math.round(game.fps), cizim: game.view.renderer.info.render.calls }) +
      (game.online ? ' · ' + game.net.rtt + ' ms' : '');
  }

  return { toast, tickToast, tone, nearest, update, teamName };
}
