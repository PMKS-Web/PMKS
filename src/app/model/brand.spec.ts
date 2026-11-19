import { existsSync, readFileSync } from 'node:fs';
import { LOGO_ASPECT, LOGO_URL } from './brand';

/**
 * The brand files are generated (`npm run brand`) and named by hand in several
 * places that no build step checks: the page head, the manifest, the build's
 * asset list. A renamed or missing file would only show as a broken icon on
 * somebody's home screen, so this asks each of them.
 */
describe('brand files', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('keeps LOGO_ASPECT to the logo file’s viewBox', () => {
    const viewBox = /viewBox="([^"]+)"/.exec(read(`src/${LOGO_URL}`))![1];
    const [, , width, height] = viewBox.split(/\s+/).map(Number);
    expect(LOGO_ASPECT).toBeCloseTo(width / height, 3);
  });

  it('has every file the page head names', () => {
    const named = [...read('src/index.html').matchAll(/(?:href|src)="(assets\/brand\/[^"]+)"/g)];
    expect(named.length).toBeGreaterThan(2);
    for (const [, path] of named) expect(existsSync(`src/${path}`), path).toBe(true);
  });

  it('has every icon the manifest names', () => {
    const manifest = JSON.parse(read('src/manifest.webmanifest')) as { icons: { src: string }[] };
    for (const { src } of manifest.icons) expect(existsSync(`src/${src}`), src).toBe(true);
  });

  it('serves /favicon.ico from the brand set', () => {
    const build = JSON.parse(read('angular.json')).projects.PMKSWeb.architect.build.options;
    const rule = (
      build.assets as (string | { glob: string; input: string; output: string })[]
    ).find((asset) => typeof asset !== 'string' && asset.glob === 'favicon.ico') as {
      input: string;
      output: string;
    };
    expect(rule.output).toBe('/');
    expect(existsSync(`${rule.input}/favicon.ico`)).toBe(true);
  });
});
