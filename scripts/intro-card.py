"""Draws one intro card for the MadGigz feed. JSON on stdin, PNG on stdout.

Feed-shaped (1080x1920) rather than poster-shaped, because these are read
full-screen in the For You pane rather than as a thumbnail.

Same restraint as poster.py: type and the brand palette, no invented imagery.
A card that says what it is beats a stock photo of a crowd that was never at a
MadGigz show.
"""

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_DIR = Path(__file__).resolve().parent.parent / "src" / "app" / "fonts"
BOLD = FONT_DIR / "Galdern-ExtraBold.otf"
MEDIUM = FONT_DIR / "Galdern-Medium.otf"

W, H = 1080, 1920
BACKGROUND = (10, 8, 7)
CREAM = (243, 241, 209)
MUTED = (168, 159, 140)


def hex_rgb(value):
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def font(path, size):
    try:
        return ImageFont.truetype(str(path), size)
    except OSError:
        return ImageFont.load_default(size)


def wrap(draw, text, fnt, max_width):
    words, lines, line = text.split(), [], ""
    for word in words:
        candidate = f"{line} {word}".strip()
        if draw.textlength(candidate, font=fnt) <= max_width or not line:
            line = candidate
        else:
            lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def build(spec):
    accent = hex_rgb(spec.get("accent", "#d76616"))

    img = Image.new("RGB", (W, H), BACKGROUND)
    glow = Image.new("RGB", (W, H), BACKGROUND)
    gd = ImageDraw.Draw(glow)
    for cx, cy, radius, colour in [
        (W * 0.2, H * 0.18, W * 0.75, accent),
        (W * 0.85, H * 0.85, W * 0.6, (13, 92, 109)),
    ]:
        for step in range(30, 0, -1):
            t = step / 30
            r = radius * t
            blend = tuple(
                int(BACKGROUND[c] + (colour[c] - BACKGROUND[c]) * (1 - t) * 0.5) for c in range(3)
            )
            gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=blend)
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(90)), 0.95)

    draw = ImageDraw.Draw(img)
    margin = 90
    inner = W - margin * 2

    # Eyebrow: which of the four sets this card belongs to, and where it is in
    # the set. Someone who lands on card 3 of 4 should know there are others.
    eyebrow = font(MEDIUM, 34)
    label = spec["eyebrow"].upper()
    if spec.get("step"):
        label = f"{label}  ·  {spec['step']}"
    # Pushed clear of the app's own overlay: the feed paints a MadGigz avatar
    # and name across the top of every card, and at y=150 the eyebrow rendered
    # underneath it.
    draw.text((margin, 330), label, font=eyebrow, fill=accent)
    draw.line([(margin, 395), (W - margin, 395)], fill=accent, width=4)

    # Headline
    size = 116
    head_font = font(BOLD, size)
    lines = wrap(draw, spec["headline"], head_font, inner)
    while len(lines) > 4 and size > 60:
        size -= 8
        head_font = font(BOLD, size)
        lines = wrap(draw, spec["headline"], head_font, inner)

    body_font = font(MEDIUM, 46)
    body_lines = wrap(draw, spec.get("body", ""), body_font, inner) if spec.get("body") else []

    block = len(lines) * int(size * 1.04) + (60 + len(body_lines) * 62 if body_lines else 0)
    y = (H - block) // 2 - 60

    for line in lines:
        draw.text((margin, y), line, font=head_font, fill=CREAM)
        y += int(size * 1.04)

    if body_lines:
        y += 60
        for line in body_lines:
            draw.text((margin, y), line, font=body_font, fill=MUTED)
            y += 62

    # No wordmark. The feed paints its own MadGigz header over the top of the
    # card and the caption block over the bottom, so a footer logo lands
    # underneath the caption text - and the branding is already there twice.

    return img


build(json.loads(sys.stdin.read())).save(sys.stdout.buffer, format="PNG", optimize=True)
