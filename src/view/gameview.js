import * as T from 'three';
import { roomAt, visibleTo } from '../castle.js';
import { CASTLE, ISO, RULES } from '../config.js';
import { escapeHtml, setHtml } from '../html.js';
import { countItems } from '../rules.js';
import { effectMethods } from './effects.js';
import { modelMethods } from './models.js';

/**
 * Three.js görünümü: tek (omuz üstü) kamera, sahne, dünya etiketleri. Simülasyon durumunu okur, hiçbir zaman değiştirmez;
 * tek başına oyunda yerel dünyayı, çevrim içi oyunda sunucudan gelen kopyayı çizer. Modeller models.js, efektler
 * effects.js'tedir (sınıfa metot olarak eklenir).
 */

/** Oyuncunun çizim yüksekliği: merdivende tırmanırken iki kat arasında yumuşak geçer. */
const floorY = p => {
  const c = p.climb;
  if (!c) return (p.floor || 0) * CASTLE.height;
  const k = Math.min(1, Math.max(0, 1 - c.t / c.time)),
    e = k * k * (3 - 2 * k);
  return (c.from + (c.to - c.from) * e) * CASTLE.height;
};

export class GameView {
  constructor(canvas, w) {
    this.canvas = canvas;
    this.world = w;
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.25));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.scene = new T.Scene();
    this.scene.background = new T.Color('#718a83');
    this.materials = new Map();
    this.geos = {
      box: new T.BoxGeometry(1, 1, 1),
      cyl: new T.CylinderGeometry(1, 1, 1, 12),
      ball: new T.IcosahedronGeometry(1, 1),
      cone: new T.ConeGeometry(1, 1, 8),
    };
    this.third = new T.PerspectiveCamera(58, 1, 0.1, 300);
    this.iso = new T.OrthographicCamera(-1, 1, 1, -1, 0.1, 300);
    this.camera = this.third;
    this.mode = 'third';
    this.overview = false;
    this.yaw = Math.PI;
    this.pitch = 0.36;
    this.focus = new T.Vector3();
    this.desired = new T.Vector3();
    this.projected = new T.Vector3();
    this.ray = new T.Raycaster();
    this.plane = new T.Plane(new T.Vector3(0, 1, 0), 0);
    this.ndc = new T.Vector2();
    this.hit = new T.Vector3();
    this.actorViews = new Map();
    this.itemViews = new Map();
    this.coinViews = new Map();
    this.shotViews = new Map();
    this.baseViews = [];
    this.labels = [];
    this.effects = [];
    this.floaters = [];
    this.labelRoot = document.querySelector('#world-labels');
    this.time = 0;
    this.shake = 0;
    const sun = new T.DirectionalLight('#ffdfa5', 3.1);
    sun.position.set(-20, 35, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -68, right: 68, top: 68, bottom: -68, near: 0.1, far: 320 });
    sun.shadow.normalBias = 0.04;
    sun.shadow.bias = -0.00015;
    this.scene.add(sun);
    this.scene.add(new T.HemisphereLight('#def1e7', '#65734e', 2.5));
    this.quality = 1;
    this.sun = sun;
    this.occlusionRay = new T.Ray();
    this.occlusionTarget = new T.Vector3();
    this.occlusionHit = new T.Vector3();
    this.buildArena(w);
    for (const p of w.players) this.actorViews.set(p.id, this.buildActor(p));
    this.buildAim();
    this.resize();
    this.reset(w);
  }
  mat(color) {
    if (!this.materials.has(color)) {
      const m = new T.MeshStandardMaterial({ color, roughness: 0.9 });
      this.materials.set(color, m);
    }
    return this.materials.get(color);
  }
  setQuality(level) {
    this.quality = level;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, [1, 1.25, 1.7][level]));
    this.renderer.shadowMap.enabled = level > 0;
    this.sun.shadow.mapSize.set(level === 2 ? 2048 : 1024, level === 2 ? 2048 : 1024);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.resize();
  }
  dispose() {
    const geometries = new Set(),
      materials = new Set();
    this.scene.traverse(o => {
      if (o.geometry) geometries.add(o.geometry);
      if (o.material) materials.add(o.material);
    });
    for (const g of geometries) g.dispose();
    for (const m of materials) m.dispose();
    for (const l of this.labels) l.el.remove();
    for (const f of this.floaters) f.el.remove();
    this.renderer.dispose();
  }
  mesh(type, color, x, y, z, sx, sy, sz, parent = this.scene) {
    const m = new T.Mesh(this.geos[type], this.mat(color));
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  box(w, h, d, c, x = 0, y = 0, z = 0, p = this.scene) {
    return this.mesh('box', c, x, y, z, w, h, d, p);
  }
  cyl(r, h, c, x = 0, y = 0, z = 0, p = this.scene) {
    return this.mesh('cyl', c, x, y, z, r, h, r, p);
  }
  ball(r, c, x, y, z, p = this.scene) {
    return this.mesh('ball', c, x, y, z, r, r, r, p);
  }
  ring(inner, outer, color, x, z, parent = this.scene) {
    const m = new T.Mesh(
      new T.RingGeometry(inner, outer, 64),
      new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: T.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.065, z);
    parent.add(m);
    return m;
  }
  label(object, height, className, html) {
    const el = document.createElement('div');
    el.className = 'world-label ' + className;
    el.innerHTML = html;
    this.labelRoot.append(el);
    const l = { object, height, el };
    this.labels.push(l);
    return l;
  }
  reset(w) {
    this.world = w;
    for (const map of [this.itemViews, this.coinViews, this.shotViews]) {
      for (const g of map.values()) this.scene.remove(g);
      map.clear();
    }
    for (const f of this.floaters) f.el.remove();
    this.floaters = [];
    const p = w.players[w.me || 0];
    this.focus.set(p.x, (p.floor || 0) * CASTLE.height, p.z);
    this.shake = 0;
  }
  /** Nişan: **tuvale göre** piksel koordinatı (pencereye göre değil; bkz. olcu()). */
  aimFromScreen(x, y) {
    const { w, h } = this.olcu();
    this.ndc.set((x / w) * 2 - 1, 1 - (y / h) * 2);
    this.ray.setFromCamera(this.ndc, this.camera);
    if (this.ray.ray.intersectPlane(this.plane, this.hit)) return { x: this.hit.x, z: this.hit.z };
    return null;
  }
  /**
   * Çizim alanının ölçüsü. Pencere değil **tuval** ölçülür: telefonda oyun kökü tarayıcı çubuklarının bıraktığı
   * görünür alana kilitlenir (bkz. src/gorunur-alan.js), o zaman tuval pencereden kısadır. Etiketler de tuvalle
   * aynı kutudadır (#world-labels), bu yüzden izdüşüm doğrudan bu ölçüye göre hesaplanır.
   */
  olcu() {
    const c = this.canvas;
    return { w: c.clientWidth || innerWidth, h: c.clientHeight || innerHeight };
  }
  project(x, y, z) {
    const { w, h } = this.olcu();
    this.projected.set(x, y, z).project(this.camera);
    return {
      x: (this.projected.x * 0.5 + 0.5) * w,
      y: (-0.5 * this.projected.y + 0.5) * h,
      z: this.projected.z,
    };
  }
  /** Kamera: 'third' omuz üstü (masaüstü), 'iso' izometrik (telefonda varsayılan); ikisi de aynı yaw ile döner. */
  setMode(mode = 'third') {
    this.mode = mode === 'iso' ? 'iso' : 'third';
    this.camera = this.mode === 'iso' ? this.iso : this.third;
    this.yaw = this.world.players[this.world.me || 0].angle;
    this.resize();
  }
  resize() {
    const { w, h } = this.olcu(),
      a = w / h;
    // updateStyle=false: tuvalin boyunu CSS verir (%100 × %100 kök), renderer yalnız çizim arabelleğini ayarlar.
    this.renderer.setSize(w, h, false);
    this.third.aspect = a;
    this.third.updateProjectionMatrix();
    Object.assign(this.iso, { left: -ISO.half * a, right: ISO.half * a, top: ISO.half, bottom: -ISO.half });
    this.iso.updateProjectionMatrix();
  }
  updateCamera(dt) {
    {
      const hero = this.world.players[this.world.me || 0],
        y = floorY(hero);
      this.heroY =
        this.heroY == null || (!hero.climb && Math.abs(this.heroY - y) > CASTLE.height * 2.5)
          ? y
          : this.heroY + (y - this.heroY) * (1 - Math.exp(-14 * dt));
    }
    const p = this.world.players[this.world.me || 0];
    if (this.mode === 'iso') {
      // İzometrik: oyuncuyu yukarıdan eğik izler; kadrajın ortası oyuncudur.
      const fx = Math.sin(this.yaw),
        fz = Math.cos(this.yaw),
        back = ISO.dist * Math.cos(ISO.elevation);
      this.focus.set(p.x, 1 + p.y * 0.5 + this.heroY, p.z);
      this.iso.position.set(this.focus.x - fx * back, this.focus.y + ISO.dist * Math.sin(ISO.elevation), this.focus.z - fz * back);
      this.iso.lookAt(this.focus);
    } else {
      const fx = Math.sin(this.yaw),
        fz = Math.cos(this.yaw),
        rx = -Math.cos(this.yaw),
        rz = Math.sin(this.yaw);
      this.focus.set(p.x + rx * 0.8, 2.15 + p.y * 0.8 + this.heroY, p.z + rz * 0.8);
      this.third.position.set(
        this.focus.x - fx * 5.2 * Math.cos(this.pitch),
        this.focus.y + 5.2 * Math.sin(this.pitch),
        this.focus.z - fz * 5.2 * Math.cos(this.pitch),
      );
      this.third.lookAt(this.focus);
    }

    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.7);
    }
    this.camera.updateMatrixWorld();
  }
  render(w, dt, { started = false, aim = null, nearest = null } = {}) {
    this.world = w;
    this.time += dt;
    this.updateCamera(dt);
    const hero = w.players[w.me || 0],
      location = roomAt(w, hero),
      elevation = hero.climb ? this.heroY : (hero.floor || 0) * CASTLE.height;
    this.plane.constant = -elevation;
    this.occlusionTarget.set(hero.x, elevation + hero.y + 1.25, hero.z);
    const cameraDistance = this.camera.position.distanceTo(this.occlusionTarget);
    this.occlusionRay.set(this.camera.position, this.occlusionTarget.clone().sub(this.camera.position).normalize());
    this.syncBases(w, hero, location, cameraDistance);
    this.syncActors(w, hero);
    this.syncItems(w, hero);
    this.syncCoins(w, hero);
    this.syncShots(w, hero);
    this.syncPointers(w, hero, elevation, started, aim, nearest);
    this.updateEffects(dt);
    this.syncLabels();
    this.updateFloaters(dt);
    this.renderer.render(this.scene, this.camera);
  }
  /** Kaleler: kamerayı kapatan kale saydamlaşır; içindeysen üst katlar, duvarlar ve çatı silikleşir. */
  syncBases(w, hero, location, cameraDistance) {
    for (const b of w.bases) {
      const v = this.baseViews[b.id],
        n = countItems(w, b.id),
        here = location?.base === b.id;
      v.p.visible = true;
      const hit = this.occlusionRay.intersectBox(v.bounds, this.occlusionHit);
      v.occluded =
        v.bounds.containsPoint(this.camera.position) ||
        (!!hit && this.camera.position.distanceTo(hit) < cameraDistance - 0.25);
      v.label.suppressed = !v.p.visible || here || v.occluded;
      v.banner.visible = !here && !v.occluded;
      for (let f = 0; f < 3; f++)
        for (const part of v.levels[f].parts) {
          let opacity = v.occluded && !here ? 0.1 : 1;
          if (here) {
            if (part.kind === 'roof') opacity = 0.015;
            else if (f > location.floor) opacity = 0.025;
            else if (f < location.floor) opacity = 0.06;
            else if (part.kind === 'wall') opacity = 0.18;
            else if (part.room >= 0 && part.room !== location.room) opacity = 0.13;
          }
          part.mesh.material.opacity = opacity;
          part.mesh.material.depthWrite = opacity > 0.5;
          part.mesh.castShadow = opacity > 0.5;
        }
      setHtml(
        v.label.el,
        '<b style="color:' +
          this.world.players[b.id].color +
          '">' +
          (b.id === hero.id ? 'SENİN KALE' : escapeHtml(w.players[b.id].name.toLocaleUpperCase('tr-TR'))) +
          '</b> · ' +
          n +
          '/' +
          RULES.target +
          '<span>3 KAT</span>',
      );
    }
  }
  /** Karakterler: yürüme, savuruş, baygınlık, taşıma pozları ve ad etiketleri. */
  syncActors(w, hero) {
    for (const p of w.players) {
      const v = this.actorViews.get(p.id),
        speed = Math.hypot(p.vx, p.vz),
        walk = Math.min(speed / 6, 1),
        phase = this.time * 13;
      v.root.visible = p.id === hero.id || visibleTo(w, hero, p);
      if (!v.root.visible) {
        v.label.suppressed = true;
        continue;
      }
      v.label.suppressed = false;
      v.root.position.set(p.x, p.y + 0.2 + floorY(p), p.z);
      v.root.rotation.y = p.angle;
      v.body.rotation.z =
        p.stun > 0 ? 0.45 + Math.sin(this.time * 4) * 0.12 : p.hurt > 0 ? Math.sin(this.time * 38) * 0.11 : 0;
      v.body.position.y = Math.abs(Math.sin(phase)) * walk * 0.045;
      v.legs.forEach((l, i) => (l.rotation.x = Math.sin(phase + i * Math.PI) * walk * 0.65));
      v.arms[0].rotation.x = p.held !== null ? -0.7 : Math.sin(phase + Math.PI) * walk * 0.5;
      v.arms[1].rotation.x = p.attack > 0 ? -1.2 : Math.sin(phase) * walk * 0.35;
      v.arms[1].rotation.z = p.attack > 0 ? -0.4 : 0;
      v.arms[1].rotation.y = p.attack > 0 ? -1.8 + (1 - p.attack / 0.36) * 3.4 : 0;
      v.weapon.visible = !!p.hasClub;
      v.stars.visible = p.stun > 0;
      v.stars.rotation.y = this.time * 3;
      v.aura.material.opacity = p.inv > 0 ? 0.3 + Math.sin(this.time * 20) * 0.25 : 0.8;
      setHtml(
        v.label.el,
        '<span style="color:' +
          p.color +
          '">' +
          escapeHtml(p.name) +
          '</span>' +
          (p.stun > 0 ? '<span class="stun-text">✦ ' + p.stun.toFixed(1) + ' sn</span>' : '') +
          (p.id === hero.id && !p.hasClub ? '<span class="unarmed">SOPA YOK · KAPIDAKİ KASADAN AL</span>' : ''),
      );
    }
  }
  syncItems(w, hero) {
    const itemIds = new Set(w.items.map(i => i.id));
    for (const [id, v] of this.itemViews)
      if (!itemIds.has(id)) {
        this.scene.remove(v);
        this.itemViews.delete(id);
      }
    for (const i of w.items) {
      let v = this.itemViews.get(i.id);
      if (!v) {
        v = this.buildItem(i.kind);
        this.itemViews.set(i.id, v);
      }
      v.visible = i.holder === hero.id || visibleTo(w, hero, i);
      if (i.holder !== null) {
        const p = w.players[i.holder];
        v.scale.setScalar(0.8);
        v.position.set(p.x - Math.sin(p.angle) * 0.53, p.y + 1.02 + floorY(p), p.z - Math.cos(p.angle) * 0.53);
        v.rotation.set(0.15, p.angle, 0);
      } else {
        v.scale.setScalar(1);
        v.position.set(i.x, 0.22 + (i.floor || 0) * CASTLE.height, i.z);
        v.rotation.set(0, i.id * 0.7, 0);
      }
    }
  }
  syncCoins(w, hero) {
    const coins = new Set(w.coins.map(c => c.id));
    for (const [id, v] of this.coinViews)
      if (!coins.has(id)) {
        this.scene.remove(v);
        this.coinViews.delete(id);
      }
    for (const c of w.coins) {
      let v = this.coinViews.get(c.id);
      if (!v) {
        v = new T.Group();
        const coin = this.cyl(0.16, 0.075, '#efc75d', 0, 0, 0, v);
        coin.rotation.x = Math.PI / 2;
        this.scene.add(v);
        this.coinViews.set(c.id, v);
      }
      v.visible = visibleTo(w, hero, c);
      v.position.set(
        c.x,
        (c.floor || 0) * CASTLE.height +
          0.43 +
          Math.abs(Math.sin(c.age * 8)) * 0.25 * Math.max(0, 1 - c.age) +
          Math.sin(this.time * 3 + c.id) * 0.04,
        c.z,
      );
      v.rotation.y = this.time * 2 + c.id;
    }
  }
  syncShots(w, hero) {
    const shots = new Set(w.shots.map(s => s.id));
    for (const [id, v] of this.shotViews)
      if (!shots.has(id)) {
        this.scene.remove(v);
        this.shotViews.delete(id);
      }
    for (const s of w.shots) {
      let v = this.shotViews.get(s.id);
      if (!v) {
        v = this.club(this.scene);
        this.shotViews.set(s.id, v);
      }
      v.visible = visibleTo(w, hero, s);
      v.position.set(s.x, 1.15 + (s.floor || 0) * CASTLE.height, s.z);
      v.rotation.set(Math.PI / 2, this.time * 23, 0);
    }
  }
  /** Yakındaki eşya halkası, fırlatma çizgisi ve bakış yönü oku. */
  syncPointers(w, hero, elevation, started, aim, nearest) {
    this.selection.visible = started && !!nearest && w.players[w.me || 0].held === null;
    if (nearest) this.selection.position.set(nearest.x, 0.26 + elevation, nearest.z);
    this.aimRing.visible = false;
    this.aimLine.visible = started && !!aim && w.players[w.me || 0].hasClub;
    if (aim) {
      const p = w.players[w.me || 0],
        dx = aim.x - p.x,
        dz = aim.z - p.z,
        d = Math.hypot(dx, dz),
        len = Math.min(d, RULES.throwRange);
      this.aimRing.position.set(aim.x, 0.25 + elevation, aim.z);
      const pos = this.aimLine.geometry.attributes.position;
      pos.setXYZ(0, p.x, 0.35 + elevation, p.z);
      pos.setXYZ(1, p.x + (dx / Math.max(0.01, d)) * len, 0.35 + elevation, p.z + (dz / Math.max(0.01, d)) * len);
      pos.needsUpdate = true;
      this.aimLine.geometry.computeBoundingSphere();
      this.aimLine.computeLineDistances();
    }
    this.facing.visible = started;
    this.facing.position.set(
      hero.x + Math.sin(hero.angle) * 1.2,
      elevation + 0.25,
      hero.z + Math.cos(hero.angle) * 1.2,
    );
    this.facing.rotation.set(Math.PI / 2, 0, -hero.angle);
  }
  /** Dünya etiketlerini ekrana yansıtır; ekran dışı ya da üst / alt şerit altındakiler gizlenir. */
  syncLabels() {
    const { w: genislik, h: yukseklik } = this.olcu();
    for (const l of this.labels) {
      l.object.getWorldPosition(this.projected);
      const q = this.project(this.projected.x, this.projected.y + l.height, this.projected.z);
      l.el.hidden =
        l.suppressed ||
        !l.object.visible ||
        q.z > 1 ||
        q.z < -1 ||
        q.x < 0 ||
        q.x > genislik ||
        q.y < 75 ||
        q.y > yukseklik - 80;
      if (!l.el.hidden) {
        l.el.style.left = q.x + 'px';
        l.el.style.top = q.y + 'px';
      }
    }
  }
}

Object.assign(GameView.prototype, modelMethods, effectMethods);
