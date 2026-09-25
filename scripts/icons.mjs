import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Uygulama simgesi ve açılış ekranı: kale kulesi (SVG) Playwright'la PNG'ye çizilir ve android/ kaynaklarına yazılır
 * (eski simge, yuvarlak simge, uyarlanabilir simge ön yüzü; açılış görselleri mevcut boyutlarında). store/ altına
 * Play Store için 512 px simge ve 1024x500 tanıtım görseli. Yalnızca simge değişince elle çalıştırılır:
 *   node scripts/icons.mjs   (Playwright ve Chrome gerekir; PLAYWRIGHT ortam değişkeni playwright paketinin yolu)
 */
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const res = path.join(root, 'android', 'app', 'src', 'main', 'res');
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const BG = '#273d3c';

/** Kale kulesi: dişli burçlar, kapı ve pencere, tepede sarı bayrak; önünde altın para. */
const art = `
  <path d="M50 29 V11" stroke="#f3ead3" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M51.2 11.5 L67 16.5 L51.2 21.5 Z" fill="#edc879"/>
  <rect x="27" y="27" width="12" height="15" rx="2" fill="#f3ead3"/><rect x="44" y="27" width="12" height="15" rx="2" fill="#f3ead3"/><rect x="61" y="27" width="12" height="15" rx="2" fill="#f3ead3"/>
  <rect x="31" y="40" width="38" height="44" rx="2" fill="#f3ead3"/>
  <rect x="27" y="37" width="46" height="7" rx="1.5" fill="#d9ccab"/>
  <rect x="46" y="50" width="8" height="10" rx="4" fill="#273d3c"/>
  <path d="M42 84 V71 a8 8 0 0 1 16 0 V84 Z" fill="#273d3c"/>
  <circle cx="71" cy="76" r="12" fill="#f5c86a" stroke="#a27435" stroke-width="2.2"/>
  <circle cx="71" cy="76" r="6.5" fill="none" stroke="#a27435" stroke-width="1.8"/>`;
/** frame: 'square' | 'round' | 'none' (uyarlanabilir ön yüz: saydam, içerik ortadaki güvenli alanda). */
const svg = (frame, scale = 1) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
  ${frame === 'square' ? `<rect width="100" height="100" rx="22" fill="${BG}"/>` : frame === 'round' ? `<circle cx="50" cy="50" r="50" fill="${BG}"/>` : ''}
  ${frame !== 'none' ? '<circle cx="50" cy="50" r="46" fill="#ffffff08"/>' : ''}
  <g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${art}</g></svg>`;

const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
const page = await browser.newPage();
async function png(html, width, height, file) {
  await page.setViewportSize({ width, height });
  await page.setContent(`<html><body style="margin:0;background:transparent">${html}</body></html>`);
  writeFileSync(file, await page.screenshot({ omitBackground: true }));
}
const box = (inner, w, h, bg = 'transparent') => `<div style="width:${w}px;height:${h}px;background:${bg};display:flex;align-items:center;justify-content:center">${inner}</div>`;

const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENSITY)) {
  const dir = path.join(res, 'mipmap-' + d), icon = Math.round(48 * k), fg = Math.round(108 * k);
  await png(box(svg('square', 0.92), icon, icon), icon, icon, path.join(dir, 'ic_launcher.png'));
  await png(box(svg('round', 0.9), icon, icon), icon, icon, path.join(dir, 'ic_launcher_round.png'));
  await png(box(svg('none', 0.62), fg, fg), fg, fg, path.join(dir, 'ic_launcher_foreground.png'));
}
writeFileSync(path.join(res, 'values', 'ic_launcher_background.xml'), `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">${BG}</color>\n</resources>\n`);

/** Açılış görseli: koyu yeşil zemin, ortada kale kulesi ve KALE TAŞIMA yazısı; mevcut splash.png boyutları korunur. */
const splash = (w, h) => {
  const s = Math.min(w, h) * 0.34;
  return box(`<div style="text-align:center;font:950 ${s * 0.26}px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-1px">
    <div style="width:${s}px;height:${s}px;margin:0 auto ${s * 0.08}px">${svg('none')}</div>KALE <span style="color:#edc879">TAŞIMA</span></div>`, w, h, BG);
};
for (const dir of readdirSync(res).filter(d => d.startsWith('drawable'))) {
  const file = path.join(res, dir, 'splash.png');
  let head; try { head = readFileSync(file); } catch { continue; }
  const w = head.readUInt32BE(16), h = head.readUInt32BE(20);
  await png(splash(w, h), w, h, file);
}

mkdirSync(path.join(root, 'store'), { recursive: true });
await png(box(svg('square', 0.92).replace('rx="22"', 'rx="0"'), 512, 512), 512, 512, path.join(root, 'store', 'icon-512.png'));
await png(box(`<div style="display:flex;align-items:center;gap:40px;font:950 96px Segoe UI,Arial,sans-serif;color:#f3ebd7;letter-spacing:-4px">
  <div style="width:300px;height:300px">${svg('none')}</div><div>KALE <span style="color:#edc879">TAŞIMA</span>
  <div style="font:800 26px Segoe UI,Arial,sans-serif;letter-spacing:3px;color:#b9cebc;margin-top:6px">HAZİNEYİ BUL · KALEYE TAŞI</div></div></div>`, 1024, 500, BG), 1024, 500, path.join(root, 'store', 'feature-1024x500.png'));
await browser.close();
console.log('simgeler hazır');
