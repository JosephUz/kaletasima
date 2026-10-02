/**
 * Playwright kurulumunu kendi başına bulur: Kalite Kapısı `npm test`i ortam değişkeni vermeden koşturur, bu depoda da
 * Playwright bağımlılık değildir. Bulunamazsa tarayıcı isteyen testler atlanır (bkz. duzen.test.mjs).
 *
 * Sıra:
 *   1. PLAYWRIGHT_MODULE (klasör yolu ya da doğrudan URL)
 *   2. bu deponun kendi node_modules'ü
 *   3. komşu depolar (C:/ju/sonplaka gibi): depo kökünden yukarı doğru üç ata klasör taranır
 *
 * Komşu kurulumlar arasından, **istediği Chromium yapısı indirilmiş olan** seçilir: Playwright'ın sürümüyle
 * ms-playwright altındaki tarayıcı yapısı eşleşmezse başlatma "Executable doesn't exist" ile düşer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

/** Bir kurulumun istediği Chromium yapısı indirilmiş mi (ms-playwright/chromium-<revizyon>). */
function tarayicisiVar(klasor) {
  const tarayiciKok = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright');
  if (!fs.existsSync(tarayiciKok)) return false;
  const bilgi = path.join(klasor, '..', 'playwright-core', 'browsers.json');
  if (!fs.existsSync(bilgi)) return true; // bilemiyoruz: denemeye değer
  try {
    const { browsers } = JSON.parse(fs.readFileSync(bilgi, 'utf8'));
    const c = browsers.find(b => b.name === 'chromium');
    return !c || fs.existsSync(path.join(tarayiciKok, `chromium-${c.revision}`));
  } catch {
    return true;
  }
}

/** Klasördeki `node_modules/playwright` kurulumu (varsa) döner. */
const kurulum = dizin => {
  const p = path.join(dizin, 'node_modules', 'playwright');
  return fs.existsSync(path.join(p, 'index.mjs')) ? p : null;
};

/** @returns {string|null} Playwright klasörü ya da doğrudan import edilecek belirteç; bulunamazsa null. */
export function playwrightYolu(kok) {
  const verilen = process.env.PLAYWRIGHT_MODULE;
  if (verilen) return fs.existsSync(verilen) ? verilen : verilen;
  const kendi = kurulum(kok);
  if (kendi) return kendi;

  // Komşu depolar: kökten yukarı üç ata, her atanın alt klasörleri.
  const adaylar = [];
  let dizin = kok;
  for (let i = 0; i < 3; i++) {
    const ust = path.dirname(dizin);
    if (ust === dizin) break;
    let girdiler = [];
    try {
      girdiler = fs.readdirSync(ust, { withFileTypes: true });
    } catch {
      /* okunamayan klasör */
    }
    for (const g of girdiler) {
      if (!g.isDirectory()) continue;
      const p = kurulum(path.join(ust, g.name));
      if (p) adaylar.push(p);
    }
    dizin = ust;
  }
  return adaylar.find(tarayicisiVar) || adaylar[0] || null;
}

/** Playwright modülünü yükler; yoksa null (çağıran testi atlar). */
export async function playwrightYukle(kok) {
  const yol = playwrightYolu(kok);
  if (!yol) return null;
  try {
    return await import(fs.existsSync(yol) ? pathToFileURL(path.join(yol, 'index.mjs')).href : yol);
  } catch {
    return null;
  }
}
