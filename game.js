// Giriş noktası: önce dil (src/dil.js, dil standardı) — sayfadaki data-i18n işaretleri ve standart dil düğmesi —, sonra
// oyunu yükler; başarısız olursa kullanıcıya okunur bir mesaj gösterir.
try {
  const { dilUygula, dilDugmesi } = await import('./src/dil.js');
  dilUygula();
  dilDugmesi(document.getElementById('dil'));
} catch (err) {
  console.error(err);
}
try {
  const { start } = await import('./src/main.js');
  start();
} catch (err) {
  const fatal = document.getElementById('fatal');
  if (err && err.message) fatal.textContent += ' (' + err.message + ')';
  fatal.hidden = false;
  console.error(err);
}
