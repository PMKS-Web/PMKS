/**
 * Launch headless Chromium as real Chrome, for every suite at once.
 *
 * Playwright's default headless browser is a separate shell that composites on
 * SwiftShader, and there it can stop producing frames for good: the boot
 * splash's opacity fade over a large drawing (Radial_Engine, Pumping_Field,
 * Elliptical_Trammel, about one load in two) left requestAnimationFrame silent
 * and every screenshot and click waiting, with the main thread idle. Neither
 * `--disable-gpu` nor `--disable-gpu-compositing` cured it; Chrome itself,
 * headed or in its new headless mode (`channel: 'chromium'`), runs the same
 * page at full rate every time. So readers do not meet it, and only the suites
 * did -- and they now run in the browser readers use.
 *
 * Imported for its side effect: by `app-ready.mjs`, which nearly every suite
 * loads, and preloaded by `run-suites.mjs` for the rest. It changes the
 * `chromium` object Playwright hands out, so it holds whichever way a suite
 * imports the package. A launch that names its own channel or executable is
 * left alone, and `PMKS_HEADLESS_SHELL=1` turns the whole thing off.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Every Playwright a suite can be holding, found the way the suites find it.
 *
 * Most import `<PMKS_PLAYWRIGHT_DIR>/node_modules/playwright/index.mjs`, with
 * `/tmp/pmks-playwright` when it is unset; a relative directory -- CI sets
 * `..` -- is resolved against `e2e/`, where those imports are written. A few
 * import bare `playwright`, which is the repository's own copy. Those can be
 * two installations with two `chromium` objects, and each needs the change.
 */
function playwrightChromiums() {
  const dirs = [process.env.PMKS_PLAYWRIGHT_DIR ?? '/tmp/pmks-playwright', '..'];
  const found = new Set();
  for (const dir of dirs) {
    const root = path.resolve(here, dir);
    try {
      found.add(createRequire(path.join(root, 'package.json'))('playwright').chromium);
    } catch (error) {
      // Nothing installed there is the ordinary case for one of the two, and a
      // suite that needed it says so itself. Anything else is worth seeing.
      if (error?.code !== 'MODULE_NOT_FOUND') throw error;
    }
  }
  return [...found].filter(Boolean);
}

/** Add `channel: 'chromium'` unless the launch already chose its browser. */
function asChrome(options = {}) {
  return options.headless === false || options.channel || options.executablePath
    ? options
    : { ...options, channel: 'chromium' };
}

const chromiums = process.env.PMKS_HEADLESS_SHELL === '1' ? [] : playwrightChromiums();

for (const chromium of chromiums) {
  if (chromium.launch.pmksRealChrome) continue;
  const launch = chromium.launch.bind(chromium);
  const persistent = chromium.launchPersistentContext.bind(chromium);
  chromium.launch = (options) => launch(asChrome(options));
  chromium.launch.pmksRealChrome = true;
  chromium.launchPersistentContext = (dir, options) => persistent(dir, asChrome(options));
}
