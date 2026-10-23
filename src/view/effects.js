import { COLORS, CASTLE } from '../config.js';
import { t } from '../dil.js';
import { KURAL } from '../rules.js';

/** Efektler (GameView metotları olarak eklenir): parçacık patlamaları, uçan yazılar ve oyun olaylarının görüntüsü. */
export const effectMethods = {
  burst(x, y, z, color, n = 10) {
    for (let i = 0; i < n; i++) {
      const mesh = this.box(0.1, 0.1, 0.1, color, x, y, z);
      mesh.castShadow = false;
      this.effects.push({
        mesh,
        vx: (Math.random() - 0.5) * 6,
        vy: 2 + Math.random() * 4,
        vz: (Math.random() - 0.5) * 6,
        life: 0.7,
      });
    }
  },
  floating(text, x, z, color = '#ffe0a1') {
    const el = document.createElement('div');
    el.className = 'world-label';
    el.style.color = color;
    el.style.fontSize = '16px';
    el.style.background = 'none';
    el.style.fontWeight = '900';
    el.textContent = text;
    this.labelRoot.append(el);
    this.floaters.push({ el, x, z, y: 2, life: 1 });
  },
  event(e) {
    if (e.type === 'airjump') this.burst(e.x, e.y + (e.floor || 0) * CASTLE.height + 0.4, e.z, '#dff0ff', 8);
    if (e.type === 'treehit') {
      this.burst(0, 3, 0, '#ffe086', 7);
    }
    if (e.type === 'hit') {
      this.burst(e.x, 1.1, e.z, '#ffdc8c', 9);
      this.floating(
        e.extend
          ? t('efekt.sn', { n: e.extend })
          : e.extend === 0
            ? t('efekt.enCok', KURAL)
            : e.hp != null
              ? t('efekt.can')
              : t('efekt.pat'),
        e.x,
        e.z,
      );
      if (e.victim === 0 || e.player === 0) this.shake = 0.16;
    }
    if (e.type === 'stairs') {
      const p = this.world.players[e.player];
      this.floating((e.to > e.from ? '↑ ' : '↓ ') + t('oyun.kat', { n: e.to + 1 }), p.x, p.z);
    }
    if (e.type === 'knockout') {
      this.burst(e.x, 1.4, e.z, '#ff7d6e', 18);
      this.floating(e.gold ? t('efekt.nakavtAltin', { n: e.gold }) : t('efekt.nakavt'), e.x, e.z);
      if (e.victim === 0) this.shake = 0.3;
    }
    if (e.type === 'stun') {
      this.burst(e.x, 1.7, e.z, '#ffdd7e', 15);
      this.floating(e.gold ? t('efekt.sersemAltin', { n: e.gold }) : t('efekt.sersem'), e.x, e.z);
      if (e.victim === 0) this.shake = 0.25;
    }
    if (e.type === 'deposit' || e.type === 'buy') {
      this.burst(e.x, 1, e.z, '#ffdc87', 18);
      this.floating(t('efekt.esya'), e.x, e.z);
    }
    if (e.type === 'respawn') {
      this.burst(e.x, 1, e.z, COLORS[e.player], 20);
    }
  },
  /** Parçacıklar: yerçekimiyle düşer, ömrü bitince sahneden çıkar. */
  updateEffects(dt) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i];
      f.life -= dt;
      f.vy -= 13 * dt;
      f.mesh.position.x += f.vx * dt;
      f.mesh.position.y += f.vy * dt;
      f.mesh.position.z += f.vz * dt;
      f.mesh.rotation.x += dt * 8;
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        this.effects.splice(i, 1);
      }
    }
  },
  /** Uçan yazılar: yükselir ve solar. */
  updateFloaters(dt) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.y += dt;
      const q = this.project(f.x, f.y, f.z);
      f.el.style.left = q.x + 'px';
      f.el.style.top = q.y + 'px';
      f.el.style.opacity = Math.max(0, f.life);
      if (f.life <= 0) {
        f.el.remove();
        this.floaters.splice(i, 1);
      }
    }
  },
};
