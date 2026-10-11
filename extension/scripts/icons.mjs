// Draws the extension's icons (16, 32, 48 and 128 px) from the AkunMu mark (src/app/icon.svg, light colors).
// Run again only when the mark changes; the PNGs are kept in extension/icons. Usage: node extension/scripts/icons.mjs
import path from "node:path";
import sharp from "sharp";

const icons = path.resolve(import.meta.dirname, "..", "icons");

const mark = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="9" fill="#0f766e"/>
  <path d="M16 24.5V10.5M16 19.5 10.5 13.5M16 16.5l5.5-5.2" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" fill="none" opacity="0.75"/>
  <circle cx="16" cy="25" r="3" fill="#ffffff"/>
  <circle cx="10" cy="12.8" r="2.8" fill="#ffffff"/>
  <circle cx="22" cy="10.6" r="2.8" fill="#ffffff"/>
  <circle cx="16" cy="8.2" r="2.5" fill="#ffffff" opacity="0.85"/>
</svg>`;

for (const size of [16, 32, 48, 128]) {
  await sharp(Buffer.from(mark), { density: Math.ceil((72 * size) / 32) * 4 })
    .resize(size, size)
    .png()
    .toFile(path.join(icons, `icon-${size}.png`));
}
console.log("icons written to", icons);
