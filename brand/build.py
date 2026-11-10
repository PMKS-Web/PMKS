"""Draw every logo, icon and favicon into src/assets/brand/, and list the PNGs to render.

Run as `npm run brand`, which follows this with rasterize.mjs. The SVGs are
written here; the PNGs and the .ico are rendered by a browser, because a
browser is what will draw them and its antialiasing is the one that counts.
"""

import json
from pathlib import Path

from pmks_brand import card, logo, mark

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / 'src' / 'assets' / 'brand'
WORK = HERE / '.work'  # sources of PNGs that are not shipped as SVG


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(exist_ok=True)

    shipped = {
        'pmks-logo.svg': logo.logo(),
        'pmks-logo-dark.svg': logo.logo_dark(),
        'pmks-mark.svg': mark.mark(),
        'favicon.svg': mark.favicon_svg(),
        'profile.svg': mark.profile_picture(),
    }
    working = {
        'app-icon.svg': mark.app_icon(),
        'maskable-icon.svg': mark.maskable_icon(),
        'favicon-16.svg': mark.favicon_16(),
        'favicon-32.svg': mark.favicon_32(),
        'favicon-48.svg': mark.favicon_48(),
        'social-card.svg': card.card(),
    }
    for name, text in shipped.items():
        (OUT / name).write_text(text, encoding='utf-8')
    for name, text in working.items():
        (WORK / name).write_text(text, encoding='utf-8')

    wide = 1200
    tall = round(wide / logo.layout().aspect)
    renders = [
        (OUT / 'pmks-logo.svg', OUT / 'pmks-logo.png', wide, tall),
        (OUT / 'pmks-logo-dark.svg', OUT / 'pmks-logo-dark.png', wide, tall),
        (OUT / 'profile.svg', OUT / 'profile.png', 1024, 1024),
        (WORK / 'app-icon.svg', OUT / 'apple-touch-icon.png', 180, 180),
        (WORK / 'app-icon.svg', OUT / 'icon-192.png', 192, 192),
        (WORK / 'app-icon.svg', OUT / 'icon-512.png', 512, 512),
        (WORK / 'maskable-icon.svg', OUT / 'icon-512-maskable.png', 512, 512),
        (WORK / 'social-card.svg', OUT / 'social-card.png', 1200, 630),
        (WORK / 'favicon-16.svg', WORK / 'favicon-16.png', 16, 16),
        (WORK / 'favicon-32.svg', WORK / 'favicon-32.png', 32, 32),
        (WORK / 'favicon-48.svg', WORK / 'favicon-48.png', 48, 48),
    ]
    plan = {
        'renders': [
            {'svg': str(svg), 'png': str(png), 'width': w, 'height': h} for svg, png, w, h in renders
        ],
        'ico': {
            'out': str(OUT / 'favicon.ico'),
            'sizes': [{'size': s, 'png': str(WORK / f'favicon-{s}.png')} for s in (16, 32, 48)],
        },
    }
    (WORK / 'plan.json').write_text(json.dumps(plan, indent=1), encoding='utf-8')
    print(f'Wrote {len(shipped)} SVGs to {OUT.relative_to(HERE.parent)}; {len(renders)} PNGs to render.')


if __name__ == '__main__':
    main()
