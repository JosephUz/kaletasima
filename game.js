// Giriş noktası: oyunu yükler, başarısız olursa kullanıcıya okunur bir mesaj gösterir.
try {
  const { start } = await import('./src/main.js');
  start();
} catch (err) {
  const fatal = document.getElementById('fatal');
  if (err && err.message) fatal.textContent += ' (' + err.message + ')';
  fatal.hidden = false;
  console.error(err);
}
