"""Text set in Archivo and turned into outlines.

Every word in the artwork is a path rather than a <text>, so nothing a reader
sees depends on Archivo being installed where the file is opened, and an SVG
dropped into another document cannot pick up that document's font instead.
"""

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

FONT = Path(__file__).resolve().parent.parent / 'fonts' / 'Archivo[wdth,wght].ttf'


@dataclass(frozen=True)
class SetText:
    """One line of type, in font units, with its baseline at y = 0 and y pointing down."""

    path: str
    ink_left: float
    ink_right: float
    cap_height: float
    upem: int

    def placed(self, x: float, baseline: float, size: float, fill: str) -> str:
        """The line as an SVG path whose ink starts at `x`, at `size` units per em."""
        scale = size / self.upem
        left = x - self.ink_left * scale
        return (
            f'<path transform="translate({left:.3f} {baseline:.3f}) scale({scale:.6f})" '
            f'fill="{fill}" d="{self.path}"/>'
        )

    def ink_width(self, size: float) -> float:
        return (self.ink_right - self.ink_left) * size / self.upem


@lru_cache
def _font(wdth: float, wght: float) -> hb.Font:
    font = hb.Font(hb.Face(hb.Blob.from_file_path(str(FONT))))
    font.set_variations({'wdth': wdth, 'wght': wght})
    return font


def set_text(text: str, wdth: float = 100, wght: float = 400, tracking: float = 0.0) -> SetText:
    """Shape `text` with HarfBuzz, so kerning comes from the font rather than from guesses.

    `tracking` is extra space between letters, in ems, as CSS letter-spacing is.
    """
    font = _font(wdth, wght)
    upem = font.face.upem
    buffer = hb.Buffer()
    buffer.add_str(text)
    buffer.guess_segment_properties()
    hb.shape(font, buffer, {})

    pen = SVGPathPen(None)
    x = 0.0
    left = right = None
    glyphs = list(zip(buffer.glyph_infos, buffer.glyph_positions))
    for index, (info, position) in enumerate(glyphs):
        origin_x = x + position.x_offset
        # Font outlines are y-up; SVG is y-down.
        font.draw_glyph_with_pen(
            info.codepoint, TransformPen(pen, (1, 0, 0, -1, origin_x, -position.y_offset))
        )
        # Measured off the outline itself: HarfBuzz's own extents are rounded to
        # whole font units, which moves the S's edge by a visible fraction of a pixel.
        bounds = BoundsPen(None)
        font.draw_glyph_with_pen(info.codepoint, bounds)
        if bounds.bounds:
            ink_left = origin_x + bounds.bounds[0]
            ink_right = origin_x + bounds.bounds[2]
            left = ink_left if left is None else min(left, ink_left)
            right = ink_right if right is None else max(right, ink_right)
        x += position.x_advance
        if index < len(glyphs) - 1:
            x += tracking * upem

    return SetText(
        path=pen.getCommands(),
        ink_left=left or 0.0,
        ink_right=right or 0.0,
        cap_height=font.get_metric_position(hb.OTMetricsTag.CAP_HEIGHT),
        upem=upem,
    )
