/**
 * Render the PNGs build.py listed, and pack the three favicon sizes into one .ico.
 *
 * Chromium draws them, at one device pixel per pixel, on a transparent page:
 * the favicons are drawn on a pixel grid, and any scaling here would undo that.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const plan = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.work', 'plan.json'), 'utf8')
);

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const { svg, png, width, height } of plan.renders) {
  await page.setViewportSize({ width, height });
  const drawing = readFileSync(svg, 'utf8').replace(
    '<svg ',
    `<svg width="${width}" height="${height}" `
  );
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block}</style>${drawing}`
  );
  await page.screenshot({ path: png, omitBackground: true, clip: { x: 0, y: 0, width, height } });
}
await browser.close();

writeFileSync(
  plan.ico.out,
  icoOf(plan.ico.sizes.map(({ size, png }) => ({ size, bytes: readFileSync(png) })))
);
console.log(`Rendered ${plan.renders.length} PNGs and ${plan.ico.out.split('/').pop()}.`);

/**
 * An .ico that holds each size as its own PNG, which every browser since IE 9
 * reads: a six-byte header, a sixteen-byte entry per image, then the images.
 */
function icoOf(images) {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // 1 = icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, bytes }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(size % 256, entry); // 0 would mean 256
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(bytes.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += bytes.length;
  });
  return Buffer.concat([header, ...images.map(({ bytes }) => bytes)]);
}
