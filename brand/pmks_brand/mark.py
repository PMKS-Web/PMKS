"""The linkage without the word: the mark, the app icons, the favicons and the profile picture.

The logo's top bar is three times its side bar, which is too wide for a square;
here the two bars are equal, and the bars and pins keep the logo's proportions.
"""

from . import logo, palette
from .linkage import Paint, linkage, svg

SIDE = logo.layout().side  # the logo's own side bar, so the two share a skeleton

# An L carries its ink up and to the left of the box around it, so a centred box
# looks parked in the top-left corner. Measured on the 512px icon, the ink's
# centroid sits 13.9% of the mark's width from the box's centre on each axis;
# the mark moves half of that, which reads as centred without looking pushed.
OPTICAL_SHIFT = 0.139 / 2


def mark() -> str:
    """The mark alone, its box filling the view, for anywhere that places it itself."""
    edge = SIDE + 2 * logo.PIN
    body = linkage((logo.PIN, logo.PIN), SIDE, SIDE, logo.BAR, logo.PIN, logo.RING)
    return svg((0, 0, edge, edge), body)


def tile(size: float, fill: float, ground: str, paint: Paint = Paint()) -> str:
    """The mark on a square of `ground`, its box `fill` of the square's side.

    A home-screen icon has to be opaque: iOS fills a transparent one with black.
    """
    edge = SIDE + 2 * logo.PIN
    scale = fill * size / edge
    start = (size - fill * size) / 2 + OPTICAL_SHIFT * fill * size
    corner = start + logo.PIN * scale
    body = linkage(
        (corner, corner),
        SIDE * scale,
        SIDE * scale,
        logo.BAR * scale,
        logo.PIN * scale,
        logo.RING * scale,
        paint,
    )
    return svg((0, 0, size, size), f'<rect width="{size}" height="{size}" fill="{ground}"/>' + body)


def app_icon() -> str:
    return tile(512, 0.62, palette.WHITE)


def maskable_icon() -> str:
    """Android crops this to any shape inside a circle of 80% of the side, so the mark
    shrinks until its farthest pin is inside that circle with room to spare."""
    return tile(512, 0.56, palette.WHITE)


def profile_picture() -> str:
    """For an avatar a site crops to a circle, in the app's cream joint colour."""
    return tile(1024, 0.62, palette.CREAM)


# Below 64px a scaled drawing lands its edges between pixels and blurs, so each
# favicon size is drawn on its own pixel grid: every bar and pin edge falls on a
# whole pixel. They share the mark's shape, not its exact proportions.


def favicon_16() -> str:
    # No ring: at 16px a one-pixel ring around a five-pixel pin turns it into a "+".
    body = linkage((3.5, 3.5), 9, 9, 3, 2.5, 0)
    return svg((0, 0, 16, 16), body)


def favicon_32() -> str:
    return svg((0, 0, 32, 32), _grid_32())


def favicon_48() -> str:
    body = linkage((9.5, 9.5), 29, 29, 7, 6.5, 2)
    return svg((0, 0, 48, 48), body)


def favicon_svg() -> str:
    """The 32px drawing, which browsers that take an SVG favicon use at every size.

    In a dark browser theme the side bar lifts to the dark logo's light indigo and
    the pins turn light grey, rings included: an ink ring vanishes against a dark
    tab and leaves each pin looking a size smaller.
    """
    style = (
        '<style>@media (prefers-color-scheme: dark){'
        f'.b{{stroke:{palette.LIGHT_BLUE}}}'
        f'.p{{fill:{palette.LIGHT_PIN};stroke:{palette.LIGHT_PIN}}}'
        '}</style>'
    )
    return svg((0, 0, 32, 32), _grid_32(), extra=style)


def _grid_32() -> str:
    return linkage((6.5, 6.5), 19, 19, 5, 4.5, 1.5)
