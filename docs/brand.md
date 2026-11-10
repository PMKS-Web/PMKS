# The logo, icons and favicons

Every logo, icon and favicon PMKS shows — in the app, on the landing page at pmksplus.com, in the
component gallery, the README and a link preview — is one of the files in `src/assets/brand/`.
They are generated: `brand/` holds the rules, and `npm run brand` draws the files from them. Edit
the rules and regenerate; never edit a file in `src/assets/brand/` by hand.

The landing page does not keep copies. It links to the app's published addresses,
`https://app.pmksplus.com/assets/brand/…`, so the two sites cannot drift apart. The cost is the
order of a change: a new logo reaches the landing page when the app it lives in is published to
production, not when the landing page is.

## The files

| File | What it is | Used by |
| --- | --- | --- |
| `pmks-logo.svg` | The logo: the linkage with "PMKS" inside its corner | App top bar, startup screen, report and graph exports (`LOGO_URL` in `src/app/model/brand.ts`); landing header; gallery sidebar |
| `pmks-logo-dark.svg` | The same for a dark ground: white word, light-indigo side bar | Landing footer |
| `pmks-logo.png`, `pmks-logo-dark.png` | 1200px renderings of the two | README (`<picture>` picks by GitHub's theme); anywhere that cannot take an SVG |
| `pmks-mark.svg` | The linkage alone, no word | Anywhere too small for the word |
| `favicon.svg` | The tab icon, drawn on a 32px grid; follows a dark browser theme by itself | Both sites, the gallery |
| `favicon.ico` | 16, 32 and 48px, each drawn on its own pixel grid | Browsers that take no SVG icon; served at `/favicon.ico` by the build's asset rule |
| `apple-touch-icon.png` | 180px, opaque | iOS Home Screen, both sites |
| `icon-192.png`, `icon-512.png` | The install icons | The app's manifest; `icon-512.png` is also the landing page's logo for search results |
| `icon-512-maskable.png` | The mark shrunk inside Android's safe circle | The app's manifest |
| `social-card.png` | 1200 × 630, laid out like the landing page's share cards | The app's `og:image` |
| `profile.svg`, `profile.png` | The mark on cream, for a site that crops avatars to a circle | Ko-fi, GitHub and other profiles — uploaded by hand |

## The rules

The logo is built around the word, not the word fitted to a drawing, so its spacing is a rule
(`brand/pmks_brand/logo.py`):

1. The gap from the blue bar to the P equals the gap from the amber bar to the top of the capitals,
   and is wide enough that the P clears the bottom pin.
2. The S ends half a pin radius left of the right pin's centre: the pin overhangs the S a little
   without sitting on it.
3. The bottom pin's centre sits on the baseline.

The word is Archivo at the semi-expanded width (112) and bold weight (700) of the landing page's
headlines, shaped by HarfBuzz for its kerning and turned into outlines, so no file depends on a
font being installed. The font is checked in at `brand/fonts/` with its licence (SIL OFL), pinned
to google/fonts commit `95f4904f`.

Colours are the app's: indigo `#3F51B5` and amber `#FFC107`, with pins `#6E6E6E` ringed in the
landing page's ink `#1E2230`. On a dark ground the side bar lifts to `#9FA8DA` and the rings stay
ink — white rings were tried and read as cut-outs.

The mark drops the word and makes both bars the length of the logo's side bar, because the logo's
top bar is three times as long and does not fit a square. In a square it is moved half the way
from its box's centre toward its ink's centre, because an L centred by its box looks parked in the
top-left corner. Below 64px each favicon is drawn on its own pixel grid instead of scaled, so its
edges land on whole pixels; the 16px one has no rings, which at that size turn each pin into a "+".

## Regenerating

```bash
npm run brand
```

It needs [uv](https://docs.astral.sh/uv/) (the Python half: `brand/pyproject.toml` pins fontTools
and uharfbuzz, and needs nothing installed system-wide) and the repository's own Playwright
Chromium, which renders the PNGs. Commit everything it changes under `src/assets/brand/`.

`src/app/model/brand.spec.ts` holds `LOGO_ASPECT` to the logo's viewBox and checks that every brand
file the page head, the manifest and the build name exists.

After a change that alters any file, the landing page's share cards — which photograph its own
pages, logo included — need retaking there with `npm run cards`.
