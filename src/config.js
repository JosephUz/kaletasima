/**
 * Oyun ayarları: kurallar, kale ölçüleri, renkler, adlar. Sayılar yalnız buradadır; simülasyon (sunucu ve tek başına
 * tarayıcı) ile görünüm aynı değerleri okur.
 */
export const RULES = Object.freeze({
  radius: 59,
  baseRadius: 12,
  speed: 6.6,
  carrySpeed: 5.3,
  sprint: 1.23,
  accel: 19,
  pushDrag: 8,
  /** Bayılma süresi (sn); baygına her sopa stunExtend kadar uzatır, toplam en çok maxStun. */
  stun: 10,
  maxStun: 30,
  stunExtend: 1,
  /** Can: her sopa darbesi 1 götürür, 0 olunca bayılır. */
  hp: 3,
  target: 10,
  teamTarget: 50,
  winHold: 60,
  price: 15,
  /** Her bayılışta yere düşen altın (bayılanın altını yetmese de). */
  stunGold: 5,
  treeGold: 2,
  hardBotTreeGold: 4,
  meleeReach: 2.7,
  throwRange: 24,
  throwSpeed: 22,
});

/** Kale: üç katlı tek salon (katlarda oda yok). Ön yüzde zemin katta tek kapı, arkada tek merdiven. */
export const CASTLE = Object.freeze({ halfX: 10.5, halfZ: 12, height: 3.8, floors: 3, door: 3, stairZ: 9.7 });
export const FLOOR_NAMES = ['Zemin kat', 'Orta kat', 'Üst kat'];
/** Kat geçişi süresi (sn): oyuncu merdivende kalır, görünüm karakteri ve kamerayı iki kat arasında kaydırır. */
export const CLIMB_TIME = 0.8;

/**
 * İzometrik kamera (telefonda varsayılan; masaüstünde omuz üstü): kadrajın yarı yüksekliği, uzaklık, eğim (rad). Nişan
 * yardımlıdır: `aimRange` içindeki en yakın rakip, yoksa baktığın yönde `aimAhead` ileri.
 */
export const ISO = Object.freeze({ half: 14, dist: 70, elevation: 0.62, aimRange: 10, aimAhead: 8 });

/** Zorluk: kolay / normal'de botlar eşyalarını hep 1. kata (zemin) koyar; zor'da üç kata dağıtır ve ağaçtan daha çok altın düşürür. */
export const DIFFICULTIES = ['easy', 'normal', 'hard'];
export const DIFFICULTY_LABEL = { easy: 'Kolay', normal: 'Normal', hard: 'Zor' };

export const COLORS = [
  '#56b9c6',
  '#e98b68',
  '#b29be3',
  '#e5bd5c',
  '#86ba73',
  '#62c9be',
  '#ec9e74',
  '#7eaad7',
  '#ce82a0',
  '#b6bf6e',
];
export const TEAM_COLORS = ['#56b9c6', '#e98b68'];
export const NAMES = Array.from({ length: 10 }, (_, i) => 'Bot-' + (i + 1));

/**
 * Çevrim içi (oda kur / odaya katıl, çevrim içi sayısı): `web` tarayıcıda, `app` Android uygulamasında açık mı. Kapalıyken
 * sunucuya hiç bağlanılmaz, oda düğmeleri "Yakında" yazar; tek başına oyun aynen oynanır (bkz. src/platform.js).
 */
export const ONLINE = Object.freeze({ web: true, app: false });
/**
 * Çevrim içi oyun sunucusu (WebSocket, Cloudflare Tunnel ile evdeki PC). Oyun dosyaları Cloudflare'deki statik siteden
 * (kaletasima.josephuz.com) gelir; sayfa sunucunun kendisinden açıldıysa (yerelde, Docker, aynı ağ) aynı adres kullanılır.
 */
export const SERVER = 'kaletasima-sunucu.josephuz.com';
