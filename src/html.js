/** Küçük DOM yardımcıları (arayüz ve dünya etiketleri). */
export const $ = s => document.querySelector(s);
export const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** innerHTML'i yalnız değiştiyse yazar (her karede aynı etiketi yeniden çizmesin). */
export function setHtml(el, value) {
  if (el._html !== value) {
    el.innerHTML = value;
    el._html = value;
  }
}
