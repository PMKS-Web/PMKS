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

function playwrightChromium() {
  const root = process.env.PMKS_PLAYWRIGHT_DIR ?? process.cwd();
  try {
    return createRequire(path.join(root, 'package.json'))('playwright').chromium;
  } catch {
    // No Playwright where it is looked for: the suite will say so itself.
    return undefined;
  }
}

const chromium = process.env.PMKS_HEADLESS_SHELL ? undefined : playwrightChromium();

if (chromium && !chromium.launch.pmksRealChrome) {
  const asChrome = (options = {}) =>
    options.headless === false || options.channel || options.executablePath
      ? options
      : { ...options, channel: 'chromium' };
  const launch = chromium.launch.bind(chromium);
  const persistent = chromium.launchPersistentContext.bind(chromium);
  chromium.launch = (options) => launch(asChrome(options));
  chromium.launch.pmksRealChrome = true;
  chromium.launchPersistentContext = (dir, options) => persistent(dir, asChrome(options));
}
