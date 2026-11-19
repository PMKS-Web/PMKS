"""The two-bar, three-pin linkage every piece of the artwork is built on."""

from dataclasses import dataclass

from . import palette


@dataclass(frozen=True)
class Paint:
    """What each part is filled with. `ring=None` draws a pin as a plain disc."""

    amber: str = palette.AMBER
    blue: str = palette.BLUE
    pin: str = palette.PIN
    ring: str | None = palette.INK
    word: str = palette.INK


LIGHT = Paint()
# For a dark ground. The rings stay ink: of the six dark versions tried, this is
# the one that was kept.
DARK = Paint(blue=palette.LIGHT_BLUE, word=palette.WHITE)


def linkage(
    corner: tuple[float, float],
    top: float,
    side: float,
    bar: float,
    pin: float,
    ring: float,
    paint: Paint = LIGHT,
) -> str:
    """The amber bar across the top, the blue bar down the side, and a pin at each end.

    `corner` is the shared pin's center; `top` and `side` are the bars' lengths,
    center to center; `pin` is a pin's outer radius, ring included.
    """
    x, y = corner
    if paint.ring and ring:
        face = (
            f'r="{_n(pin - ring / 2)}" fill="{paint.pin}" '
            f'stroke="{paint.ring}" stroke-width="{_n(ring)}"'
        )
    else:
        face = f'r="{_n(pin)}" fill="{paint.pin}"'
    pins = ''.join(
        f'<circle class="p" cx="{_n(cx)}" cy="{_n(cy)}" {face}/>'
        for cx, cy in ((x, y), (x + top, y), (x, y + side))
    )
    return (
        f'<line x1="{_n(x)}" y1="{_n(y)}" x2="{_n(x + top)}" y2="{_n(y)}" '
        f'stroke="{paint.amber}" stroke-width="{_n(bar)}"/>'
        f'<line class="b" x1="{_n(x)}" y1="{_n(y)}" x2="{_n(x)}" y2="{_n(y + side)}" '
        f'stroke="{paint.blue}" stroke-width="{_n(bar)}"/>'
        f'{pins}'
    )


def svg(view_box: tuple[float, float, float, float], body: str, extra: str = '') -> str:
    """A standalone SVG document: `extra` goes before the drawing, for a <style>."""
    vb = ' '.join(_n(v) for v in view_box)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}">{extra}{body}</svg>\n'


def _n(value: float) -> str:
    """A number short enough to read in the file and exact enough to draw."""
    text = f'{value:.3f}'.rstrip('0').rstrip('.')
    return '0' if text == '-0' else text
