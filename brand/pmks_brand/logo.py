"""The logo: the linkage with "PMKS" set inside its corner.

The linkage is built around the word rather than the word fitted to a drawing,
so the spacing is a rule and cannot drift:

1. The gap from the blue bar to the P equals the gap from the amber bar to the
   top of the capitals.
2. The S ends half a pin radius left of the right pin's centre, so the pin
   overhangs the S a little without sitting on it.
3. The bottom pin's centre sits on the baseline.

Everything is in one unit, the drawing's; the word's size follows from the pins.
"""

from dataclasses import dataclass

from .lettering import set_text
from .linkage import DARK, LIGHT, Paint, linkage, svg

BAR = 7.5  # a bar's width
PIN = 5.5  # a pin's outer radius, ring included
RING = 1.8
GAP = 5.5  # rule 1; wide enough that the P also clears the bottom pin
CAP_HEIGHT = 1.3 * 2 * PIN  # the capitals are a little taller than a pin is wide
TUCK = 0.5  # rule 2, in pin radii

# Archivo at the semi-expanded width and bold weight of the landing page's headlines.
WORD = set_text('PMKS', wdth=112, wght=700)


@dataclass(frozen=True)
class Layout:
    top: float  # the amber bar, centre to centre
    side: float  # the blue bar, centre to centre
    word_x: float
    baseline: float
    size: float  # the word's em, in drawing units

    @property
    def view_box(self) -> tuple[float, float, float, float]:
        return (-PIN, -PIN, self.top + 2 * PIN, self.side + 2 * PIN)

    @property
    def aspect(self) -> float:
        _, _, width, height = self.view_box
        return width / height


def layout() -> Layout:
    size = CAP_HEIGHT * WORD.upem / WORD.cap_height
    word_x = BAR / 2 + GAP
    baseline = BAR / 2 + GAP + CAP_HEIGHT
    top = word_x + WORD.ink_width(size) + TUCK * PIN
    return Layout(top=top, side=baseline, word_x=word_x, baseline=baseline, size=size)


def logo(paint: Paint = LIGHT) -> str:
    at = layout()
    body = linkage((0, 0), at.top, at.side, BAR, PIN, RING, paint) + WORD.placed(
        at.word_x, at.baseline, at.size, paint.word
    )
    return svg(at.view_box, body)


def logo_dark() -> str:
    return logo(DARK)
