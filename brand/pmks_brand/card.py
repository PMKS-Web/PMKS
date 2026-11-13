"""The picture a link to the app unfurls into, at the 1200 x 630 every preview crops to.

Laid out as the landing page's share cards are -- the logo, the headline, one
line and the address down the left, a drawing on the grid at the right -- so a
link to either site arrives looking like the same thing. A feed shows a card
about 500 pixels wide, which is why nothing on it is smaller than the line.
"""

from . import logo, palette
from .lettering import SetText, set_text
from .linkage import linkage, svg
from .mark import OPTICAL_SHIFT, SIDE

WIDTH, HEIGHT = 1200, 630
COLUMN = 620  # the text column's width, as on the landing page's cards
MARGIN = 64
GRID_STEP = 45

# Sizes, leading and spacing are the landing page's ShareCard's, in pixels.
LOGO_HEIGHT = 74
HEADLINE = (('Serious linkage', 'analysis. Zero', 'setup.'), 54, 55)
LINE = (('Free, in your browser. No install,', 'no account.'), 26, 35)
ADDRESS = (('app.pmksplus.com',), 22, 30)


def card() -> str:
    """The 1200 x 630 link-preview card, as an SVG document."""
    headline = [set_text(t, wdth=112, wght=700, tracking=-0.03) for t in HEADLINE[0]]
    line = [set_text(t) for t in LINE[0]]
    address = [set_text(t, wght=600) for t in ADDRESS[0]]

    blocks = [
        (headline, HEADLINE[1], HEADLINE[2], palette.INK, 24),
        (line, LINE[1], LINE[2], palette.TEXT_SOFT, 40),
        (address, ADDRESS[1], ADDRESS[2], palette.BLUE, 0),
    ]
    # The column is centered as a whole, as the landing page's flex column is.
    total = LOGO_HEIGHT + 40 + sum(len(rows) * lead + after for rows, _, lead, _, after in blocks)
    y = (HEIGHT - total) / 2

    parts = [f'<rect width="{WIDTH}" height="{HEIGHT}" fill="{palette.WHITE}"/>', _grid(), _mark()]
    parts.append(_logo(MARGIN, y, LOGO_HEIGHT))
    y += LOGO_HEIGHT + 40
    for rows, size, lead, color, after in blocks:
        for row in rows:
            parts.append(row.placed(MARGIN, _baseline(row, y, size, lead), size, color))
            y += lead
        y += after
    return svg((0, 0, WIDTH, HEIGHT), ''.join(parts))


def _baseline(row: SetText, top: float, size: float, lead: float) -> float:
    """Capitals centered in their line, so each line's ink sits where its box says."""
    cap = row.cap_height * size / row.upem
    return top + (lead + cap) / 2


def _logo(x: float, y: float, height: float) -> str:
    """The logo's own drawing, placed rather than redrawn, so the card cannot differ from it."""
    vx, vy, _, vh = logo.layout().view_box
    scale = height / vh
    inner = logo.logo().split('>', 1)[1].rsplit('</svg>', 1)[0]
    return (
        f'<g transform="translate({x - vx * scale:.3f} {y - vy * scale:.3f}) '
        f'scale({scale:.6f})">{inner}</g>'
    )


def _grid() -> str:
    """The app's grid across the card's right half, ruled off from the text."""
    rule = f'stroke="{palette.GRID}"'
    lines = [f'<line x1="{COLUMN}" y1="0" x2="{COLUMN}" y2="{HEIGHT}" {rule} stroke-width="2"/>']
    for x in range(COLUMN + GRID_STEP, WIDTH, GRID_STEP):
        lines.append(f'<line x1="{x}" y1="0" x2="{x}" y2="{HEIGHT}" {rule} stroke-width="1"/>')
    for y in range(GRID_STEP // 2, HEIGHT, GRID_STEP):
        lines.append(f'<line x1="{COLUMN}" y1="{y}" x2="{WIDTH}" y2="{y}" {rule} stroke-width="1"/>')
    return ''.join(lines)


def _mark(size: float = 300) -> str:
    """The mark on the grid, optically centered in the right half as the app icon is."""
    scale = size / (SIDE + 2 * logo.PIN)
    x = COLUMN + (WIDTH - COLUMN - size) / 2 + OPTICAL_SHIFT * size + logo.PIN * scale
    y = (HEIGHT - size) / 2 + OPTICAL_SHIFT * size + logo.PIN * scale
    return linkage(
        (x, y), SIDE * scale, SIDE * scale, logo.BAR * scale, logo.PIN * scale, logo.RING * scale
    )
