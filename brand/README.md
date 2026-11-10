# brand

Draws every logo, icon and favicon into `src/assets/brand/`. Run `npm run brand` from the
repository root. [`docs/brand.md`](../docs/brand.md) says what each file is for and what the rules
are.

- `pmks_brand/logo.py` — the logo, and the three rules its spacing follows
- `pmks_brand/mark.py` — the linkage without the word: icons, favicons, the profile picture
- `pmks_brand/card.py` — the link-preview card
- `pmks_brand/lettering.py` — text set in Archivo and turned into outlines
- `pmks_brand/linkage.py`, `pmks_brand/palette.py` — the drawing they all share, and its colours
- `build.py` writes the SVGs; `rasterize.mjs` renders the PNGs and the `.ico` in Chromium
- `fonts/` — Archivo, pinned to google/fonts `95f4904f`, with its licence
