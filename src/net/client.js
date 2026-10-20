import { serverUrl } from '../platform.js';

/**
 * Tarayıcı tarafı bağlantı. Sayfa açılınca boşta bir bağlantı kurulur (giriş ekranındaki "çevrim içi" sayısı bundan gelir);
 * oda kurulunca / katılınca aynı bağlantı kullanılır. Kimlik jetonu sekmede saklanır: sayfa yenilenirse ya da bağlantı
 * koparsa aynı koltuğa dönülür. Bağlantı koparsa odadayken 1,5 sn'de, boştayken (sunucu kapalı olabilir) 15 sn'de bir
 * yeniden denenir. ready(true/false): sunucu kabul etti / bağlantı kapandı (oda düğmeleri buna göre açılır ya da "Yakında").
 *
 * Giriş ekranındayken sunucu açık oda listesini (`rooms`) kendiliğinden gönderir: bağlanınca, odadan çıkınca, liste değişince.
 *
 * hooks: lobby(m), start(world), snapshot(world), error(message), status(message), online(n), ready(up), rooms(list)
 */
export class Network {
  constructor(hooks) {
    this.hooks = hooks;
    this.ws = null;
    this.id = null;
    this.room = null;
    this.online = false;
    this.active = false;
    this.rtt = 0;
    this.queue = [];
    this.retry = null;
  }
  connect(name) {
    this.name = name;
    this.active = true;
    if (this.ws?.readyState === 1) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = new Promise((resolve, reject) => {
      const ws = (this.ws = new WebSocket(serverUrl()));
      let token;
      try {
        token = sessionStorage.getItem('kale.token');
      } catch {}
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Sunucuya bağlanılamadı.'));
      }, 8000);
      ws.onopen = () => {
        this.online = true;
        ws.send(JSON.stringify({ type: 'hello', name, token }));
      };
      ws.onmessage = e => {
        const m = JSON.parse(e.data);
        if (m.type === 'welcome') {
          clearTimeout(timeout);
          this.id = m.id;
          try {
            sessionStorage.setItem('kale.token', m.token);
          } catch {}
          resolve();
          this.hooks.status?.('');
          this.hooks.ready?.(true);
        } else if (m.type === 'lobby') {
          this.room = m;
          this.hooks.lobby(m);
        } else if (m.type === 'start') {
          this.hooks.start(m.world);
        } else if (m.type === 'snapshot') {
          this.hooks.snapshot(m.world);
        } else if (m.type === 'error') this.hooks.error(m.message);
        else if (m.type === 'pong') this.rtt = Math.round(performance.now() - m.at);
        else if (m.type === 'online') this.hooks.online?.(m.n);
        else if (m.type === 'rooms') this.hooks.rooms?.(m.list);
      };
      ws.onerror = () => {};
      ws.onclose = () => {
        clearTimeout(timeout);
        this.online = false;
        this.connecting = null;
        reject(new Error('Bağlantı kapandı.'));
        this.hooks.ready?.(false);
        if (this.active) {
          this.hooks.status?.('Bağlantı koptu · yeniden bağlanıyor…');
          this.retry = setTimeout(() => this.connect(this.name).catch(() => {}), this.room ? 1500 : 15000);
        }
      };
    });
    return this.connecting;
  }
  send(type, body = {}) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify({ type, ...body }));
  }
  /** Odadan çıkar ama bağlantı açık kalır: giriş ekranındaki "çevrim içi" sayısı bu boşta bağlantılardan gelir. */
  leave() {
    this.send('leave');
    this.room = null;
  }
}
