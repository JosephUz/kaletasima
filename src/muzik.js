/**
 * Müzik ayarı.
 *
 * Kale Taşıma'nın parçaları **henüz bestelenmedi**: bugün bu dosya yalnız standart üst çubuktaki ve Esc
 * menüsündeki "Müzik: açık / kapalı" düğmesinin durumunu ve ses düzeyini tutar — çalacak bir parça yoktur.
 * Parçalar gelince çalma bölümü (sahne seçimi, çapraz geçiş, `muzik/` klasörü) buraya eklenir; düğmeler,
 * saklanan anahtarlar ve `?muzik=0/1` kısayolu o gün hazır bekliyor olur. Diğer oyunlarda (Yakar Gol, Çayır
 * Muhafızı, İz Peşinde, Son Plaka) aynı dosya adı, aynı anahtar düzeni ve aynı varsayılan ses kullanılıyor.
 *
 * Ayarı okuyan iki işlev (`acikMi`, `sesDuzeyi`) saftır: tarayıcı gerekmeden denenir
 * (tests/standart-cubuk.test.mjs).
 */

/** Tarayıcıda saklanan anahtarlar; efekt sesi ayrı tutulur (`kale.sound`). */
export const MUZIK_ANAHTAR = 'kale.muzik';
export const SES_ANAHTAR = 'kale.muzik.ses';
/** Diğer oyunlarla aynı varsayılan: %35. */
export const VARSAYILAN_SES = 0.35;

/**
 * Müzik açık mı? `?muzik=0` / `?muzik=1` adres anahtarı saklanan ayarı ezer (test ve gösteri için); yoksa
 * saklanan ayar, o da yoksa açık.
 * @param {string} arama location.search
 * @param {string|null} saklanan localStorage'taki değer
 */
export function acikMi(arama, saklanan) {
  const istek = new URLSearchParams(arama || '').get('muzik');
  if (istek === '0' || istek === 'off') return false;
  if (istek === '1' || istek === 'on') return true;
  return saklanan !== 'off';
}

/** Saklanan ses düzeyini 0..1 arasına oturtur; yazılmamış ya da bozuksa varsayılan. */
export function sesDuzeyi(saklanan) {
  const n = Number(saklanan);
  if (saklanan === null || saklanan === '' || !Number.isFinite(n)) return VARSAYILAN_SES;
  return Math.min(1, Math.max(0, n));
}

const oku = anahtar => {
  try {
    return localStorage.getItem(anahtar);
  } catch {
    return null;
  }
};
const yaz = (anahtar, deger) => {
  try {
    localStorage.setItem(anahtar, deger);
  } catch {}
};

/**
 * Oyunun müzik durumu. Parça eklenince `degistir` / `setSes` ayrıca çalmayı da yönetecek: kapatılırken
 * `pause()` edilir ama `currentTime` sıfırlanmaz, açılınca parça kaldığı yerden sürer.
 */
export function createMuzik(arama = typeof location === 'undefined' ? '' : location.search) {
  const muzik = {
    acik: acikMi(arama, oku(MUZIK_ANAHTAR)),
    ses: sesDuzeyi(oku(SES_ANAHTAR)),
    /** Müziği aç / kapat; seçim tarayıcıda kalır. */
    degistir(acik) {
      muzik.acik = !!acik;
      yaz(MUZIK_ANAHTAR, muzik.acik ? 'on' : 'off');
    },
    /** Ses düzeyi (0..1); seçim tarayıcıda kalır. */
    setSes(ses) {
      muzik.ses = sesDuzeyi(ses);
      yaz(SES_ANAHTAR, String(muzik.ses));
    },
  };
  return muzik;
}
